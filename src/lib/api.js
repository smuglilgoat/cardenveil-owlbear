import { hydrateState } from './deck.js';

let currentVersion = 0;
let pollTimer = null;
let onStateCallback = null;
let dispatching = false;

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

export function startPolling(roomId, onState, interval = 1500) {
  onStateCallback = onState;
  stopPolling();
  pollTimer = setInterval(async () => {
    if (dispatching) return;
    try {
      const state = await fetchState(roomId);
      if (state && onStateCallback) onStateCallback(state);
    } catch (e) {
      console.error('Poll error:', e);
    }
  }, interval);
}

export function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export async function dispatch(roomId, action) {
  dispatching = true;
  try {
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, action }),
    });
    if (!res.ok) throw new Error(`Dispatch failed: ${res.status}`);
    const data = await res.json();
    if (data.version != null) currentVersion = data.version;
    return hydrateState(data.state);
  } finally {
    dispatching = false;
  }
}
