import { createClient } from '@supabase/supabase-js';

/** Vite env object; `?? {}` only so the module stays importable outside Vite
 *  (unit tests import it without the bundler's `import.meta.env`). */
const env = import.meta.env ?? {};

/**
 * Supabase client shared by every Cardenveil frame.
 *
 * `worker: false` on purpose. `worker: true` was meant to survive browser
 * timer throttling in backgrounded tabs, but realtime-js disables the socket's
 * own heartbeat when a worker is used (`autoSendHeartbeat = !worker`), making
 * the Blob Worker the only heartbeat source. Inside Owlbear's sandboxed
 * iframes the worker does not reliably run, so nothing heartbeats, the server
 * closes the socket every ~30 s (`1006`, channel `CLOSED`) and the health
 * callback stays silent. The socket's own heartbeat is the reliable path here.
 *
 * `heartbeatIntervalMs: 10000` — the socket default is 30 s (RealtimeClient
 * defaults to 25 s), too close to the server's idle tolerance; 10 s gives the
 * server three chances before it would time out. The heartbeat callback now
 * actually reports 'error' | 'timeout' | 'disconnected', so the health
 * watchdog in api.js sees a sick connection again.
 */
export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  realtime: {
    worker: false,
    heartbeatIntervalMs: 10000,
    heartbeatCallback: (status) => onHeartbeat(status),
  },
});

/** @type {Set<(status: string) => void>} */
const healthListeners = new Set();
/** @type {string} */
let lastProblem = '';
/** @type {number} */
let lastProblemAt = 0;
/**
 * Bursts of identical heartbeat problems collapse into one signal inside this
 * window. Must be wider than `heartbeatIntervalMs` (10 s): with a shorter
 * window every single heartbeat of a sick connection passes, and each one costs
 * a catch-up REST read plus a reconnect attempt.
 */
const PROBLEM_MIN_INTERVAL_MS = 15000;

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
    // Stamp the change too: the window for the next problem is measured from
    // when this one cleared, never from the previous problem.
    if (status === 'ok' && lastProblem) {
      lastProblem = '';
      lastProblemAt = Date.now();
    }
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
