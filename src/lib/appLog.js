/**
 * App-level logging to Supabase (`app_logs`).
 *
 * Rules:
 * - never break gameplay: every path is guarded, inserts are fire-and-forget;
 * - bounded volume: identical event+message at most once per DEDUPE_MS, hard
 *   cap per page load, 2000/4000-char truncation;
 * - self-disabling: if the table is missing (migration not applied yet) the
 *   sink turns itself off after the first failure instead of spamming.
 *
 * Reads: `select * from app_logs order by created_at desc limit 100;`
 */
import { APP_VERSION } from '../version.js';

/** Lazy Supabase client: appLog is imported by the dice/roll modules too, and
 *  a static import would drag the whole supabase-js bundle into every popup. */
let transportPromise = null;
function getSupabase() {
  if (!transportPromise) {
    transportPromise = import('./supabaseClient.js')
      .then((mod) => mod.supabase)
      .catch(() => null);
  }
  return transportPromise;
}

const MAX_PER_SESSION = 120;
const DEDUPE_MS = 30000;
const MESSAGE_MAX = 2000;
const DETAIL_MAX = 4000;

let source = 'app';
let roomId = null;
let playerId = null;
let playerName = null;
let sent = 0;
let disabled = false;
let installed = false;
/** @type {Map<string, number>} */
const lastSent = new Map();

/** Context attached to every following log row (ids only, never secrets). */
export function setLogContext(context = {}) {
  if (context.roomId !== undefined) roomId = context.roomId;
  if (context.playerId !== undefined) playerId = context.playerId;
  if (context.playerName !== undefined) playerName = context.playerName;
}

function safeJson(value) {
  try {
    const seen = new WeakSet();
    return JSON.stringify(value, (_key, val) => {
      if (val instanceof Error) return { name: val.name, message: val.message, stack: val.stack };
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return undefined;
        seen.add(val);
      }
      return val;
    });
  } catch {
    return null;
  }
}

/** @param {unknown} error */
function errorFields(error) {
  if (error == null) return {};
  if (error instanceof Error) return { message: error.message, detail: { stack: error.stack } };
  return { message: String(error) };
}

function disableIfMissingTable(error) {
  const code = String(error?.code ?? '');
  const msg = String(error?.message ?? '');
  // 42P01 = relation missing, PGRST205 = table not in the API schema cache
  if (code === '42P01' || code === 'PGRST205' || /app_logs/.test(msg)) {
    disabled = true;
    console.warn('[appLog] app_logs unavailable — logging disabled for this session');
  }
}

/**
 * Log one event. Fire-and-forget: returns immediately, never throws.
 * @param {'error'|'warn'|'info'} level
 * @param {string} event - short machine key (e.g. 'dispatch_failed')
 * @param {{message?: string, detail?: object, roomId?: string, playerId?: string, playerName?: string}} [extra]
 */
export function logEvent(level, event, extra = {}) {
  if (disabled || sent >= MAX_PER_SESSION) return;
  const message = extra.message == null ? '' : String(extra.message).slice(0, MESSAGE_MAX);
  const key = `${level}|${event}|${message}`;
  const now = Date.now();
  const previous = lastSent.get(key) ?? 0;
  if (now - previous < DEDUPE_MS) return;
  lastSent.set(key, now);
  sent++;

  const detailJson = extra.detail ? safeJson(extra.detail) : null;
  const detail = detailJson
    ? (detailJson.length <= DETAIL_MAX ? JSON.parse(detailJson) : { truncated: detailJson.slice(0, DETAIL_MAX) })
    : null;
  const row = {
    level,
    source,
    event,
    message: message || null,
    detail,
    room_id: extra.roomId ?? roomId,
    player_id: extra.playerId ?? playerId,
    player_name: extra.playerName ?? playerName,
    app_version: APP_VERSION,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };

  const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  consoleFn(`[appLog] ${event}`, message || '', extra.detail ?? '');

  // A logging sink must never break gameplay: any transport problem (missing
  // client, missing table, mocked client in tests) disables it silently.
  getSupabase()
    .then((sb) => {
      if (!sb) {
        disabled = true;
        return;
      }
      sb.from('app_logs')
        .insert(row)
        .then(({ error }) => {
          if (error) {
            disableIfMissingTable(error);
            if (!disabled) console.warn('[appLog] insert failed:', error.message);
          }
        })
        .catch(() => {
          disabled = true;
        });
    })
    .catch(() => {
      disabled = true;
    });
}

/**
 * Log a caught error with its stack.
 * @param {string} event
 * @param {unknown} error
 * @param {object} [extra]
 */
export function logError(event, error, extra = {}) {
  logEvent('error', event, { ...errorFields(error), ...extra });
}

/**
 * Install global handlers + session context for one frame. Idempotent.
 * @param {string} entryName - 'main' | 'hand' | 'sheet' | 'background' | 'dice'
 * @param {{sessionStart?: boolean}} [options] - session_start is reserved for
 *   the long-lived frames; transient popovers (sheet, dice) skip it.
 */
export function initLogging(entryName, options = {}) {
  source = entryName;
  if (installed) return;
  installed = true;

  window.addEventListener('error', (e) => {
    logEvent('error', 'unhandled_error', {
      message: e.message,
      detail: { stack: e.error?.stack, file: e.filename, line: e.lineno, column: e.colno },
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    logEvent('error', 'unhandled_rejection', {
      message: reason?.message ?? String(reason),
      detail: { stack: reason?.stack },
    });
  });

  if (options.sessionStart) {
    logEvent('info', 'session_start', {
      detail: { host: window.location.host, entry: entryName, visibility: document.visibilityState },
    });
  }
}
