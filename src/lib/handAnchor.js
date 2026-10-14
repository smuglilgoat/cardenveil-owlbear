/**
 * Hand popover anchor: two presets the ⇅ button in the popover bar switches
 * between. OBR has no "move popover" API (only setWidth/setHeight), so the
 * popover frame stores the choice in localStorage and announces it on a
 * BroadcastChannel; the frame that opened the popover (PlayerHand /
 * GMDashboard, same browser, same origin) reopens it at the new anchor.
 */
const KEY = 'cardenveil-hand-anchor';
const CHANNEL = 'cardenveil-hand-anchor';

/** Distance in px between the popover's bottom edge and the viewport bottom. */
export const HAND_ANCHOR_OFFSETS = { low: 56, high: 156 };

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

/** Flip the preset, announce it, and return the new one. */
export function toggleHandAnchor() {
  const next = getHandAnchorPosition() === 'high' ? 'low' : 'high';
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* private mode — the toggle still applies for this session via the broadcast */
  }
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(next);
    channel.close();
  } catch {
    /* BroadcastChannel unavailable */
  }
  return next;
}

/**
 * Called when the preset changes (BroadcastChannel for this browser's frames,
 * `storage` for other tabs). Returns an unsubscribe function.
 * @param {(position: 'low'|'high') => void} callback
 */
export function onHandAnchorChange(callback) {
  // BroadcastChannel AND the storage event both fire for one toggle: collapse
  // the duplicates so the caller reopens the popover only once.
  let last = { position: getHandAnchorPosition(), at: 0 };
  const emit = (position) => {
    const now = Date.now();
    if (position === last.position && now - last.at < 500) return;
    last = { position, at: now };
    callback(position);
  };
  let channel = null;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (e) => emit(e.data);
  } catch {
    /* BroadcastChannel unavailable */
  }
  const onStorage = (e) => {
    if (e.key === KEY) emit(getHandAnchorPosition());
  };
  window.addEventListener('storage', onStorage);
  return () => {
    channel?.close();
    window.removeEventListener('storage', onStorage);
  };
}
