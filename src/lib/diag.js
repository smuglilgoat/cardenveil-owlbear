/**
 * Live-room diagnostics.
 *
 * The problem: the plugin frames only render inside an OBR room (outside OBR
 * they wait forever on `OBR.onReady`), so a layout bug cannot be inspected
 * from the plugin URL alone.
 *
 * The bridge: any frame can broadcast a `cardenveil-diag` request; every
 * Cardenveil frame in the room answers by writing its OWN `diag_snapshot` row
 * to `app_logs` (geometry, clipping, element classes, counts). Read them with
 * SQL — no OBR session, no DevTools, no screenshot needed:
 *
 *   select created_at, source, detail from app_logs
 *   where event = 'diag_snapshot' order by created_at desc limit 20;
 *
 * appLog throttles identical rows to one per 30 s, so a snapshot can be
 * requested at most every 30 s per frame.
 *
 * Frames mark their layout bands with `data-diag="fan|tokenbar|drawbar|…"`.
 */
import OBR from '@owlbear-rodeo/sdk';
import { logEvent } from './appLog.js';

export const DIAG_CHANNEL = 'cardenveil-diag';

/** @param {Element} el */
function rectOf(el) {
  const r = el.getBoundingClientRect();
  return [Math.round(r.top), Math.round(r.bottom), Math.round(r.left), Math.round(r.right)];
}

/**
 * Snapshot this frame: viewport, marked bands, interactive bounds, clipping.
 * @param {string} entry - Frame name ('main' | 'hand' | 'sheet' | 'background')
 * @returns {Object} JSON-safe snapshot
 */
export function collectDiag(entry) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  /** @type {Record<string, number[]>} */
  const rects = {};
  /** @type {Record<string, string>} */
  const classes = {};
  for (const el of document.querySelectorAll('[data-diag]')) {
    const name = /** @type {HTMLElement} */ (el).dataset.diag;
    if (!name) continue;
    rects[name] = rectOf(el);
    classes[name] = String(el.className ?? '').slice(0, 160);
  }

  // Elements inside a scroll container (sheet tabs, long lists) are reachable
  // by scrolling — only report real clipping for the always-visible ones.
  const inScrollContainer = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const overflowY = getComputedStyle(p).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') return true;
    }
    return false;
  };
  const interactive = [...document.querySelectorAll('button, select, input, [role="button"]')]
    .filter((el) => !inScrollContainer(el))
    .map((el) => el.getBoundingClientRect());
  const bottom = interactive.length ? Math.round(Math.max(...interactive.map((r) => r.bottom))) : null;
  return {
    entry,
    path: location.pathname,
    viewport: `${vw}x${vh}`,
    dpr: window.devicePixelRatio,
    visibility: document.visibilityState,
    // body taller than the viewport = content clipped by the popover box
    bodyScrollHeight: document.body.scrollHeight,
    rects,
    classes,
    interactive: interactive.length
      ? {
          count: interactive.length,
          top: Math.round(Math.min(...interactive.map((r) => r.top))),
          bottom,
          clippedBelow: bottom == null ? null : bottom - vh,
        }
      : null,
  };
}

/**
 * Ask every Cardenveil frame in the room to log a snapshot.
 * @returns {Promise<string>} request id (also carried in each log row message)
 */
export async function requestDiag() {
  if (!OBR.isAvailable) return '';
  const requestId =
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  try {
    await OBR.broadcast.sendMessage(DIAG_CHANNEL, { requestId, at: Date.now() }, { destination: 'ALL' });
  } catch (err) {
    logEvent('warn', 'diag_request_failed', { message: err?.message ?? String(err) });
  }
  return requestId;
}

/**
 * Listen for diag requests and log this frame's snapshot (once per frame).
 * @param {string} entry - Frame name used as the log `source`
 */
export function initDiag(entry) {
  if (!OBR.isAvailable) return;
  OBR.onReady(() => {
    OBR.broadcast.onMessage(DIAG_CHANNEL, ({ data }) => {
      if (!data?.requestId) return;
      logEvent('info', 'diag_snapshot', { message: data.requestId, detail: collectDiag(entry) });
    });
  });
}
