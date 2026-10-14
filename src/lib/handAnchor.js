/**
 * Hand popover geometry: anchor preset + size, shared between the popover frame
 * and the frame that opened it (PlayerHand / GMDashboard, same browser).
 *
 * Why it works like this: OBR has no "move popover" API and — in the versions
 * we see in the wild — a popover's iframe keeps the size it was created with
 * (`setWidth`/`setHeight` may resize the box while the iframe, which is what
 * clips the content, stays put). So the reliable path is `open()`:
 *  - two popover IDs, one per anchor preset, so a switch really creates a new
 *    popover at the new anchor (reopening the same ID kept the old position);
 *  - the last good size is remembered and reused on open (no resize flash);
 *  - when `setWidth`/`setHeight` fails to reach the iframe, the frame asks the
 *    caller to reopen it at the right size (one flash, then correct).
 */
const KEY = 'cardenveil-hand-anchor';
const SIZE_KEY = 'cardenveil-hand-popover-size';
const CHANNEL = 'cardenveil-hand-anchor';

/** Distance in px between the popover's bottom edge and the viewport bottom. */
export const HAND_ANCHOR_OFFSETS = { low: 16, high: 116 };

/** @returns {'low'|'high'} */
export function getHandAnchorPosition() {
  try {
    return localStorage.getItem(KEY) === 'high' ? 'high' : 'low';
  } catch {
    return 'low';
  }
}

/** Popover `anchorPosition.top` for a viewport height and a preset. */
export function handAnchorTop(vh, position = getHandAnchorPosition()) {
  return vh - (HAND_ANCHOR_OFFSETS[position] ?? HAND_ANCHOR_OFFSETS.low);
}

/**
 * Last size the popover frame fitted itself to, reused on the next open so the
 * popover is created at the right size (OBR applies sizes at open reliably).
 * @returns {{width: number, height: number}|null}
 */
export function getHandPopoverSize() {
  try {
    const raw = localStorage.getItem(SIZE_KEY);
    const value = raw ? JSON.parse(raw) : null;
    return value && value.width > 100 && value.height > 40 ? value : null;
  } catch {
    return null;
  }
}

/** @param {number} width @param {number} height */
export function rememberHandPopoverSize(width, height) {
  try {
    localStorage.setItem(SIZE_KEY, JSON.stringify({ width, height }));
  } catch {
    /* private mode */
  }
}

function post(message) {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    /* BroadcastChannel unavailable */
  }
}

/** Flip the anchor preset, announce it, and return the new one. */
export function toggleHandAnchor() {
  const next = getHandAnchorPosition() === 'high' ? 'low' : 'high';
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* private mode — the toggle still applies for this session via the broadcast */
  }
  post({ type: 'anchor', position: next });
  return next;
}

/** Ask the caller to reopen the popover at this size (used when OBR refuses a resize). */
export function requestHandPopoverResize(width, height) {
  rememberHandPopoverSize(width, height);
  post({ type: 'resize', width, height });
}

/**
 * Called when the anchor preset or the requested size changes (BroadcastChannel
 * for this browser's frames, `storage` for other tabs). Returns an unsubscribe.
 * @param {(message: {type: 'anchor'|'resize', position?: 'low'|'high', width?: number, height?: number}) => void} callback
 */
export function onHandPopoverChange(callback) {
  // BroadcastChannel AND the storage event both fire for one toggle: collapse
  // duplicates so the caller reopens the popover only once.
  let last = { key: '', at: 0 };
  const emit = (message) => {
    const key = JSON.stringify(message);
    const now = Date.now();
    if (key === last.key && now - last.at < 500) return;
    last = { key, at: now };
    callback(message);
  };
  let channel = null;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (e) => emit(e.data);
  } catch {
    /* BroadcastChannel unavailable */
  }
  const onStorage = (e) => {
    if (e.key === KEY) emit({ type: 'anchor', position: getHandAnchorPosition() });
  };
  window.addEventListener('storage', onStorage);
  return () => {
    channel?.close();
    window.removeEventListener('storage', onStorage);
  };
}
