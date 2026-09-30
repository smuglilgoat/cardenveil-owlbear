// Persistent page that opens each client's dice popup when a roll starts.
import OBR from '@owlbear-rodeo/sdk';
import { ROLL_CHANNEL } from './lib/rollBroadcast.js';

const DICE_POPOVER_ID = 'cardenveil-dice';
const CLOSE_AFTER_MS = 6000;
let closeTimer;
let lastRollId = null;
let diceStyle = localStorage.getItem('cardenveil-dice-style') || '';

async function anchorFor(isSelf) {
  try {
    const [width, height] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
    const origin = isSelf
      ? { horizontal: 'LEFT', vertical: 'BOTTOM' }
      : { horizontal: 'RIGHT', vertical: 'BOTTOM' };
    return {
      anchorReference: 'POSITION',
      anchorPosition: isSelf ? { left: 8, top: height - 8 } : { left: width - 8, top: height - 8 },
      anchorOrigin: origin,
      transformOrigin: origin,
      marginThreshold: 8
    };
  } catch {
    return {};
  }
}

function openDicePopover(params, anchor) {
  return OBR.popover.open({
    id: DICE_POPOVER_ID,
    url: `${window.location.origin}/dice.html?${params.toString()}`,
    width: 520,
    height: 440,
    ...anchor
  });
}

OBR.onReady(() => {
  OBR.broadcast.onMessage('cardenveil-prefs', ({ data }) => {
    if (data?.diceStyle !== undefined) {
      diceStyle = data.diceStyle;
      localStorage.setItem('cardenveil-dice-style', diceStyle);
    }
  });

  OBR.broadcast.onMessage(ROLL_CHANNEL, async ({ data, connectionId }) => {
    if (!data?.rollId || data.rollId === lastRollId) return;
    lastRollId = data.rollId;
    const isSelf = connectionId === await OBR.player.getConnectionId();
    const label = data.playerName ? `${data.playerName} · ${data.label || ''}` : data.label || '';
    const params = new URLSearchParams({
      label,
      formula: data.formula || '',
      color: data.color || '',
      mode: diceStyle,
      rollId: data.rollId,
      playerId: data.playerId || '',
      playerName: data.playerName || '',
      portrait: data.portrait || '',
      portraitImage: data.portraitIsImage ? '1' : '0',
      plainLabel: data.label || 'Jet',
      self: isSelf ? '1' : '0',
      error: '',
      breakdown: data.breakdown ? JSON.stringify(data.breakdown) : '',
      // attack stage throws (3D): the popup reports each stage back to the
      // roller, which applies the rules and throws the next stage
      staged: data.staged ? '1' : '0'
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
  });
});
