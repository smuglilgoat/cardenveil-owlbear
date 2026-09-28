import OBR from '@owlbear-rodeo/sdk';

const ROLL_CHANNEL = 'cardenveil-roll';
const DICE_POPOVER_ID = 'cardenveil-dice';
// roll ids already displayed in this frame (skips our own echo)
const shown = new Set();

function remember(id) {
  shown.add(id);
  if (shown.size > 50) shown.delete(shown.values().next().value);
}

/**
 * Open the animated dice popup anchored to the bottom-left of the tabletop.
 * Falls back to default anchoring if the viewport size is unavailable.
 */
export async function openDicePopup(data) {
  const label = data.playerName ? `${data.playerName} · ${data.label || ''}` : data.label || '';
  const params = new URLSearchParams({
    label,
    formula: data.formula || '',
    total: data.total != null ? String(data.total) : '',
    rolls: (data.rolls ?? []).join(','),
    error: data.error || ''
  });
  let anchor = {};
  try {
    const height = await OBR.viewport.getHeight();
    anchor = {
      anchorReference: 'POSITION',
      anchorPosition: { left: 8, top: height - 8 },
      anchorOrigin: { horizontal: 'LEFT', vertical: 'BOTTOM' },
      transformOrigin: { horizontal: 'LEFT', vertical: 'BOTTOM' },
      marginThreshold: 8
    };
  } catch {
    /* default anchoring */
  }
  await OBR.popover.open({
    id: DICE_POPOVER_ID,
    url: `${window.location.origin}/dice.html?${params.toString()}`,
    width: 340,
    height: 280,
    ...anchor
  });
}

/**
 * Broadcast a roll result to every open Cardenveil frame in the room.
 * Remember the rollId synchronously so our own broadcast echo is skipped.
 */
export async function broadcastRoll(data) {
  const rollId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
  remember(rollId);
  let playerName = '';
  try {
    playerName = await OBR.player.getName();
  } catch {
    /* name optional */
  }
  try {
    await OBR.broadcast.sendMessage(ROLL_CHANNEL, { ...data, rollId, playerName });
  } catch (err) {
    console.warn('Failed to broadcast roll:', err);
  }
}

/**
 * Listen for rolls broadcast by other frames; returns an unsubscribe function.
 */
export function onRemoteRoll(callback) {
  try {
    return OBR.broadcast.onMessage(ROLL_CHANNEL, ({ data }) => {
      if (!data?.rollId || shown.has(data.rollId)) return;
      remember(data.rollId);
      callback(data);
    });
  } catch (err) {
    console.warn('Roll broadcast unavailable:', err);
    return () => {};
  }
}
