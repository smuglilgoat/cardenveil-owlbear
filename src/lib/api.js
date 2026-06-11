import { hydrateState } from './deck.js';
import { supabase } from './supabaseClient.js';

let currentVersion = 0;
let realtimeChannel = null;
let onStateCallback = null;
let onConnectionCallback = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let isSubscribed = false;
let currentRoomId = null;
let permanentlyDisconnected = false;
let connectionGeneration = 0;

const BACKOFF_STEPS_MS = [1000, 2000, 4000, 8000];
const MAX_BACKOFF_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 30;

export function isConnected() {
  return isSubscribed;
}

export async function fetchState(roomId) {
  const res = await fetch(`/api/state?roomId=${encodeURIComponent(roomId)}`, {
    headers: currentVersion ? { 'If-None-Match': String(currentVersion) } : {},
  });
  if (res.status === 304) return null;
  if (!res.ok) throw new Error(`State fetch failed: ${res.status}`);
  const data = await res.json();
  if (data.version != null) currentVersion = data.version;
  if (!data.state) return null;
  return hydrateState(data.state);
}

function nextBackoffMs() {
  return reconnectAttempt < BACKOFF_STEPS_MS.length
    ? BACKOFF_STEPS_MS[reconnectAttempt]
    : MAX_BACKOFF_MS;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  if (!currentRoomId) return;
  if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
    if (!permanentlyDisconnected) {
      permanentlyDisconnected = true;
      if (onConnectionCallback) onConnectionCallback('permanently_disconnected');
    }
    return;
  }
  const delay = nextBackoffMs();
  reconnectAttempt++;
  console.log(`Realtime: scheduling reconnect in ${delay}ms (attempt ${reconnectAttempt})`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (currentRoomId && onStateCallback) {
      startRealtime(currentRoomId, onStateCallback, onConnectionCallback);
    }
  }, delay);
}

export function startRealtime(roomId, onState, onConnectionChange) {
  onStateCallback = onState;
  onConnectionCallback = onConnectionChange || null;
  stopRealtime();

  currentRoomId = roomId;
  permanentlyDisconnected = false;
  const myGen = ++connectionGeneration;

  realtimeChannel = supabase
    .channel(`game:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'game_rooms',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        const newRow = payload.new;
        if (!newRow) return;
        if (newRow.version <= currentVersion) return;
        currentVersion = newRow.version;
        if (onStateCallback) {
          onStateCallback(hydrateState(newRow.state));
        }
      }
    )
    .subscribe((status, err) => {
      // Ignore callbacks from stale subscriptions (e.g. after stopRealtime
      // or a newer startRealtime superseded this one).
      if (myGen !== connectionGeneration) return;

      if (status === 'SUBSCRIBED') {
        const wasReconnect = reconnectAttempt > 0;
        console.log(wasReconnect ? 'Realtime reconnected' : 'Realtime subscribed');
        isSubscribed = true;
        reconnectAttempt = 0;
        permanentlyDisconnected = false;
        if (onConnectionCallback) onConnectionCallback('connected');
        if (wasReconnect) {
          // Catch up on state changes that may have been missed while disconnected.
          const catchUpGen = myGen;
          fetchState(roomId)
            .then((state) => {
              if (catchUpGen !== connectionGeneration) return;
              if (state && onStateCallback) onStateCallback(state);
            })
            .catch((e) => console.warn('Realtime catch-up fetch failed:', e));
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('Realtime channel error:', err);
        isSubscribed = false;
        if (onConnectionCallback) onConnectionCallback('disconnected');
        scheduleReconnect();
      } else if (status === 'CLOSED') {
        console.warn('Realtime channel closed');
        isSubscribed = false;
        if (onConnectionCallback) onConnectionCallback('disconnected');
        scheduleReconnect();
      }
    });
}

export function stopRealtime() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  isSubscribed = false;
  currentRoomId = null;
  reconnectAttempt = 0;
  permanentlyDisconnected = false;
  connectionGeneration++;
}

export async function dispatch(roomId, action) {
  const res = await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId, action }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Dispatch failed: ${res.status} — ${body}`);
  }
  const data = await res.json();
  if (data.version != null) currentVersion = data.version;
  return hydrateState(data.state);
}
