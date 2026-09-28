import OBR from '@owlbear-rodeo/sdk';

export const ROLL_CHANNEL = 'cardenveil-roll';
// local (same-browser) channel the physics popup reports results on
export const ROLL_RESULT_CHANNEL = 'cardenveil-roll-result';

/**
 * Broadcast a roll to the room. In 3D mode the payload is a roll INTENT:
 * { diceSpec: [{count, sides}...], modifier, seed } — the rapier simulation
 * in each client's dice popup is the source of the numbers. In flat (GM
 * classique) mode the payload carries pre-rolled {rolls, diceTypes, total}.
 * The persistent background page (src/background.js) opens the popup.
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
    // ALL so every client's background page opens its matching popup.
    await OBR.broadcast.sendMessage(ROLL_CHANNEL, { ...data, rollId, playerName }, { destination: 'ALL' });
  } catch (err) {
    console.warn('Failed to broadcast roll:', err);
  }
  return rollId;
}

/**
 * Listen for results reported by the local dice popup (same browser).
 * Returns an unsubscribe function.
 */
export function onRollResult(callback) {
  try {
    const channel = new BroadcastChannel(ROLL_RESULT_CHANNEL);
    channel.onmessage = (event) => callback(event.data);
    return () => channel.close();
  } catch (err) {
    console.warn('Roll result channel unavailable:', err);
    return () => {};
  }
}

/** Report the roller's result to its local sheet frames for logging. */
export function reportRollResult(result) {
  try {
    const channel = new BroadcastChannel(ROLL_RESULT_CHANNEL);
    channel.postMessage(JSON.parse(JSON.stringify(result)));
    channel.close();
  } catch (err) {
    console.warn('Failed to report roll result:', err);
  }
}
