import OBR from '@owlbear-rodeo/sdk';
import { logEvent } from './appLog.js';
import { publishCommand, discardCommand, COMMAND_ROLL } from './roomBridge.js';

export const ROLL_CHANNEL = 'cardenveil-roll';
// local (same-browser) channel the physics popup reports results on
export const ROLL_RESULT_CHANNEL = 'cardenveil-roll-result';
// popover id of the animated dice popup (opened by the background page)
export const DICE_POPOVER_ID = 'cardenveil-dice';

/**
 * Send a roll intent over the room's own broadcast — the path every client
 * inside Owlbear uses. The background page relays it over OBR.broadcast.
 * @param {object} message - {rollId, label, diceSpec|rolls, ...}
 */
export async function sendRollToRoom(message) {
  try {
    await OBR.broadcast.sendMessage(ROLL_CHANNEL, message, { destination: 'ALL' });
    return true;
  } catch (err) {
    logEvent('warn', 'roll_broadcast_failed', { message: err?.message ?? String(err) });
    return false;
  }
}

/**
 * Broadcast a roll to the room. In 3D mode the payload is a roll INTENT:
 * { diceSpec: [{count, sides}...], modifier, seed } — the rapier simulation
 * in each client's dice popup is the source of the numbers. In flat (GM
 * classique) mode the payload carries pre-rolled {rolls, diceTypes, total}.
 * The persistent background page (src/entries/background.js) opens the popup.
 *
 * Outside Owlbear (the standalone sheet tab) the room's broadcast is out of
 * reach: BroadcastChannel and localStorage do not cross the storage-partition
 * boundary between a top-level tab and the room's frames. The roll then goes
 * through the command channel, and the background page — which IS in the room —
 * relays it.
 *
 * @param {object} data
 * @param {string} roomId - the room the roll belongs to
 * @param {string} [secret] - the room's command secret (needed only outside Owlbear)
 */
export async function broadcastRoll(data, roomId, secret) {
  const rollId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
  let playerName = '';
  try {
    playerName = await OBR.player.getName();
  } catch {
    /* name optional */
  }
  const message = { ...data, rollId, playerName };
  if (await sendRollToRoom(message)) return rollId;

  // Outside OBR (the standalone sheet tab, issue #14): the room's background
  // page is inside the room and relays the command for us.
  try {
    const command = await publishCommand(roomId, COMMAND_ROLL, message, secret);
    logEvent('info', 'roll_broadcast_command', { detail: { rollId, label: data.label } });
    // The frames read it over Realtime; the row is only a delivery vehicle.
    setTimeout(() => discardCommand(command?.id), 60000);
  } catch (err) {
    logEvent('warn', 'roll_broadcast_command_failed', { message: err?.message ?? String(err) });
    // The tab must not claim the roll was transmitted when it was not.
    throw err;
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
    logEvent('warn', 'roll_result_channel_unavailable', { message: err?.message ?? String(err) });
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
    logEvent('warn', 'roll_report_failed', { message: err?.message ?? String(err) });
  }
}
