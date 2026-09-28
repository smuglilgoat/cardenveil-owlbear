// Persistent background page (same pattern as the official Owlbear dice
// plugin): runs per client for the whole session and is the single opener
// of the dice popup — top-center for the roller, bottom-right for everyone else.
import OBR from '@owlbear-rodeo/sdk';
import { ROLL_CHANNEL } from './lib/rollBroadcast.js';

const DICE_POPOVER_ID = 'cardenveil-dice';
const CLOSE_AFTER_MS = 6000;
let closeTimer;
let lastRollId = null;
// GM-selectable dice visuals ('flat' = classic CSS dice, '' = 3D)
let diceStyle = localStorage.getItem('cardenveil-dice-style') || '';

async function anchorFor(isSelf) {
  let width = 0;
  let height = 0;
  try {
    [width, height] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  } catch {
    return {};
  }
  const position = isSelf
    ? { left: Math.round(width / 2), top: 8 } // top-center: the roller
    : { left: width - 8, top: height - 8 }; // bottom-right: everyone else
  const origin = isSelf
    ? { horizontal: 'CENTER', vertical: 'TOP' }
    : { horizontal: 'RIGHT', vertical: 'BOTTOM' };
  return {
    anchorReference: 'POSITION',
    anchorPosition: position,
    anchorOrigin: origin,
    transformOrigin: origin,
    marginThreshold: 8
  };
}

function openDicePopover(params, anchor) {
  return OBR.popover.open({
    id: DICE_POPOVER_ID,
    url: `${window.location.origin}/dice.html?${params.toString()}`,
    width: 460,
    height: 380,
    ...anchor
  });
}

OBR.onReady(() => {
  // GM dice-style preference (broadcast by the GM dashboard)
  OBR.broadcast.onMessage('cardenveil-prefs', ({ data }) => {
    if (data?.diceStyle !== undefined) {
      diceStyle = data.diceStyle;
      localStorage.setItem('cardenveil-dice-style', diceStyle);
    }
  });

  OBR.broadcast.onMessage(ROLL_CHANNEL, async ({ data, connectionId }) => {
    if (!data?.rollId || data.rollId === lastRollId) return;
    lastRollId = data.rollId;
    const isSelf = connectionId === (await OBR.player.getConnectionId());
    const label = data.playerName ? `${data.playerName} · ${data.label || ''}` : data.label || '';
    const params = new URLSearchParams({
      label,
      formula: data.formula || '',
      color: data.color || '',
      mode: diceStyle,
      rollId: data.rollId || '',
      playerId: data.playerId || '',
      plainLabel: data.label || 'Jet',
      error: ''
    });
    if (data.rolls) {
      // pre-rolled roll (flat mode / fallback): display as-is
      params.set('rolls', (data.rolls ?? []).join(','));
      params.set('types', (data.diceTypes ?? []).join(','));
      params.set('total', data.total != null ? String(data.total) : '');
    } else {
      // roll intent: the rapier simulation in the popup decides the numbers
      params.set('diceSpec', JSON.stringify(data.diceSpec ?? []));
      params.set('seed', String(data.seed ?? 0));
      params.set('modifier', String(data.modifier ?? 0));
    }
    try {
      await openDicePopover(params, await anchorFor(isSelf));
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => OBR.popover.close(DICE_POPOVER_ID).catch(() => {}), CLOSE_AFTER_MS);
    } catch (err) {
      console.warn('Failed to show dice popup:', err);
    }
  });
});
