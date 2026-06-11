import { hydrateState } from './deck.js';
import { supabase } from './supabaseClient.js';

let currentVersion = 0;
let realtimeChannel = null;
let onStateCallback = null;

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

export function startRealtime(roomId, onState) {
  onStateCallback = onState;
  stopRealtime();

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
    .subscribe();
}

export function stopRealtime() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

export async function dispatch(roomId, action) {
  const res = await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId, action }),
  });
  if (!res.ok) throw new Error(`Dispatch failed: ${res.status}`);
  const data = await res.json();
  if (data.version != null) currentVersion = data.version;
  return hydrateState(data.state);
}
