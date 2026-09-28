// Persistent background page (same pattern as the official Owlbear dice
// plugin): runs per client for the whole session and is the single opener
// of the dice popup — top-center for the roller, bottom-right for everyone else.
import OBR from '@owlbear-rodeo/sdk';
import { ROLL_CHANNEL, ROLL_RESULT_CHANNEL, onRemoteRollResult } from './lib/rollBroadcast.js';

const DICE_POPOVER_ID = 'cardenveil-dice';
const CLOSE_AFTER_MS = 6000;
let closeTimer;
let lastRollId = null;
// intent metadata by rollId (label/name/color for the remote replay popup)
const intentMeta = new Map();
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

  // roll intents: only the roller's own popup runs the physics simulation;
  // other clients wait for the authoritative result (see result listener)
  OBR.broadcast.onMessage(ROLL_CHANNEL, async ({ data, connectionId }) => {
    if (!data?.rollId || data.rollId === lastRollId) return;
    lastRollId = data.rollId;
    const isSelf = connectionId === (await OBR.player.getConnectionId());
    intentMeta.set(data.rollId, { label: data.label || 'Jet', playerName: data.playerName || '', color: data.color || '', rolls: data.rolls, diceTypes: data.diceTypes, total: data.total });
    if (intentMeta.size > 10) intentMeta.delete(intentMeta.keys().next().value);
    if (!isSelf || data.rolls) {
      // pre-rolled (flat mode) → everyone displays it directly;
      // remote 3D rolls wait for the result instead
      const label2 = data.playerName ? `${data.playerName} · ${data.label || ''}` : data.label || '';
      const params = new URLSearchParams({
        label: label2,
        formula: data.formula || '',
        color: data.color || '',
        mode: diceStyle,
        rollId: data.rollId || '',
        playerId: data.playerId || '',
        plainLabel: data.label || 'Jet',
        error: ''
      });
      if (data.rolls) {
        params.set('rolls', (data.rolls ?? []).join(','));
        params.set('types', (data.diceTypes ?? []).join(','));
        params.set('total', data.total != null ? String(data.total) : '');
      } else {
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
    }
  });

  // roll results: remote clients open a replay popup with the recorded
  // transforms (the roller's own popup is already showing the resting dice)
  onRemoteRollResult(async (data, senderConnectionId) => {
    if (!data?.rollId || !data?.rolls) return;
    if (senderConnectionId === (await OBR.player.getConnectionId())) return;
    const meta = intentMeta.get(data.rollId) ?? {};
    const label = meta.playerName ? `${meta.playerName} · ${meta.label}` : meta.label || 'Jet';
    const params = new URLSearchParams({
      label,
      formula: data.formula || '',
      color: meta.color || data.color || '',
      mode: diceStyle,
      rollId: data.rollId,
      playerId: data.playerId || '',
      plainLabel: meta.label || 'Jet',
      rolls: (data.rolls ?? []).join(','),
      types: (data.diceTypes ?? []).join(','),
      total: data.total != null ? String(data.total) : '',
      error: ''
    });
    if (data.transforms) params.set('transforms', JSON.stringify(data.transforms));
    try {
      await openDicePopover(params, await anchorFor(false));
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => OBR.popover.close(DICE_POPOVER_ID).catch(() => {}), CLOSE_AFTER_MS);
    } catch (err) {
      console.warn('Failed to show replay popup:', err);
    }
  });
});
