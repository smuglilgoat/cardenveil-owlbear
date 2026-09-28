import OBR from '@owlbear-rodeo/sdk';

export const ROLL_CHANNEL = 'cardenveil-roll';

/**
 * Broadcast a roll result to the room. Display is handled by the persistent
 * background page (src/background.js), which opens the dice popup on every
 * client — top-center for the roller, bottom-right for everyone else.
 */
export async function broadcastRoll(data) {
  const rollId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
  let playerName = '';
  try {
    playerName = await OBR.player.getName();
  } catch {
    /* name optional */
  }
  try {
    // ALL so the roller's own background page also opens the popup (top-center)
    await OBR.broadcast.sendMessage(ROLL_CHANNEL, { ...data, rollId, playerName }, { destination: 'ALL' });
  } catch (err) {
    console.warn('Failed to broadcast roll:', err);
  }
}
