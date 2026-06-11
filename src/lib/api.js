import { hydrateState, applyAction } from './deck.js';
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

let lastServerState = null;
let pendingActions = [];

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
  const state = hydrateState(data.state);
  lastServerState = state;
  pendingActions = [];
  return state;
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

function replayPending(serverState) {
  if (pendingActions.length === 0) return serverState;
  let state = serverState;
  for (const action of pendingActions) {
    const result = applyAction(state, action);
    state = result.state;
  }
  return state;
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
        const serverState = hydrateState(newRow.state);
        lastServerState = serverState;
        pendingActions = pendingActions.filter(a => a._confirmedVersion == null || a._confirmedVersion > currentVersion);
        const displayState = replayPending(serverState);
        if (onStateCallback) {
          onStateCallback(displayState);
        }
      }
    )
    .subscribe((status, err) => {
      if (myGen !== connectionGeneration) return;

      if (status === 'SUBSCRIBED') {
        const wasReconnect = reconnectAttempt > 0;
        console.log(wasReconnect ? 'Realtime reconnected' : 'Realtime subscribed');
        isSubscribed = true;
        reconnectAttempt = 0;
        permanentlyDisconnected = false;
        if (onConnectionCallback) onConnectionCallback('connected');
        if (wasReconnect) {
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
  lastServerState = null;
  pendingActions = [];
}

const MAX_CLIENT_RETRIES = 3;

export async function dispatch(roomId, action) {
  const currentState = lastServerState
    ? replayPending(lastServerState)
    : await fetchState(roomId);

  if (!currentState) {
    throw new Error('No state available for optimistic update');
  }

  const { state: optimisticState } = applyAction(currentState, action);
  if (onStateCallback) {
    onStateCallback(optimisticState);
  }

  const pendingEntry = { ...action, _dispatchTime: Date.now() };
  pendingActions.push(pendingEntry);

  (async () => {
    let lastError;
    for (let attempt = 0; attempt < MAX_CLIENT_RETRIES; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke('action', {
          body: { roomId, action },
        });

        if (error) {
          lastError = error;
          continue;
        }

        if (data?.version != null) {
          pendingEntry._confirmedVersion = data.version;
          return;
        }

        if (data?.error) {
          lastError = new Error(data.error);
        }
      } catch (e) {
        lastError = e;
      }
    }

    console.error('Dispatch failed after retries:', lastError);
    pendingActions = pendingActions.filter(a => a !== pendingEntry);
    if (currentRoomId) {
      try {
        const state = await fetchState(currentRoomId);
        if (state && onStateCallback) onStateCallback(state);
      } catch (e) {
        console.error('Recovery fetch failed:', e);
      }
    }
  })();

  return optimisticState;
}
