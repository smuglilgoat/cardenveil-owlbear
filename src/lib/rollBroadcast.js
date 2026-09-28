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
    // ALL so the roller's own background page also opens the popup (top-center)
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

const OBR_RESULT_CHANNEL = 'cardenveil-roll-result';

/**
 * Report a roll result: locally via BroadcastChannel (roller's frames log
 * it) and remotely via the OBR broadcast (other clients replay the motion).
 */
export function reportRollResult(result) {
  try {
    new BroadcastChannel(ROLL_RESULT_CHANNEL).postMessage(JSON.parse(JSON.stringify(result)));
  } catch (err) {
    console.warn('Failed to report roll result:', err);
  }
  try {
    OBR.broadcast.sendMessage(ROLL_RESULT_CHANNEL, result, { destination: 'ALL' }).catch(() => {});
  } catch {
    /* remote replay optional */
  }
}

/**
 * Listen for results broadcast over the room (for remote replay).
 * Returns an unsubscribe function.
 */
export function onRemoteRollResult(callback) {
  try {
    return OBR.broadcast.onMessage(ROLL_RESULT_CHANNEL, ({ data }) => callback(data));
  } catch (err) {
    console.warn('Remote roll results unavailable:', err);
    return () => {};
  }
}
