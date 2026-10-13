import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client shared by every Cardenveil frame.
 *
 * `worker: true` + `heartbeatCallback` are Supabase's documented mitigations
 * for *silent* Realtime disconnections: browsers throttle timers in
 * backgrounded tabs/iframes, the main-thread heartbeat is delayed, the server
 * drops the socket and no status event ever reaches the app (the UI then keeps
 * showing stale state until a page reload). The worker keeps the heartbeat
 * alive off the main thread, and the callback gives an explicit reconnect
 * signal when the connection still dies (network loss, laptop sleep…).
 * Docs: supabase.com/docs/guides/troubleshooting/
 *       realtime-handling-silent-disconnections-in-backgrounded-applications
 */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    realtime: {
      worker: true,
      heartbeatCallback: (status) => onHeartbeat(status),
    },
  }
);

/** @type {Set<(status: string) => void>} */
const healthListeners = new Set();
/** @type {string} */
let lastProblem = '';
/** @type {number} */
let lastProblemAt = 0;
const PROBLEM_MIN_INTERVAL_MS = 5000;

/**
 * Subscribe to Realtime *connection* problems (not per-channel state).
 * Fires on heartbeat 'error' | 'timeout' | 'disconnected'.
 * @param {(status: string) => void} callback
 * @returns {() => void} unsubscribe
 */
export function onRealtimeHealth(callback) {
  healthListeners.add(callback);
  return () => healthListeners.delete(callback);
}

/**
 * Realtime transport health: 'error' | 'timeout' | 'disconnected' on the last
 * problem, '' when the connection has been healthy since the page loaded.
 */
export function realtimeProblem() {
  return lastProblem;
}

function onHeartbeat(status) {
  if (status !== 'error' && status !== 'timeout' && status !== 'disconnected') {
    if (status === 'ok') lastProblem = '';
    return;
  }
  const now = Date.now();
  // Heartbeats repeat on a fixed interval; collapse bursts into one signal.
  if (status === lastProblem && now - lastProblemAt < PROBLEM_MIN_INTERVAL_MS) return;
  lastProblem = status;
  lastProblemAt = now;

  // Documented reconnect pattern: the socket may be half-dead while the
  // RealtimeClient still believes it is open, so nudge it explicitly.
  try {
    supabase.realtime.connect();
  } catch {
    /* reconnect attempt is best-effort */
  }
  for (const listener of healthListeners) {
    try {
      listener(status);
    } catch {
      /* a listener must never break the heartbeat path */
    }
  }
}
