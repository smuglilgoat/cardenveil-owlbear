// Persistent page that opens each client's dice popup when a roll starts.
import OBR from '@owlbear-rodeo/sdk';
import { ROLL_CHANNEL, DICE_POPOVER_ID } from './lib/rollBroadcast.js';
import { initLogging, setLogContext, logEvent, logError } from './lib/appLog.js';
import { initDiag } from './lib/diag.js';

initLogging('background', { sessionStart: true });
initDiag('background');

const CLOSE_AFTER_MS = 8000; // was 6s: players could not read the result in time
let closeTimer;
let lastRollId = null;
let diceStyle = localStorage.getItem('cardenveil-dice-style') || '';
let diceOpenCount = 0;

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
    // ~30% smaller than the original 520x440
    width: 364,
    height: 308,
    // click-away used to dismiss the popup before the dice settled: the popup
    // now only closes by itself (8 s) or through its own ✕ (after 3 s)
    disableClickAway: true,
    ...anchor
  });
}

OBR.onReady(() => {
  setLogContext({ roomId: OBR.room.id });
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
      staged: data.staged ? '1' : '0',
      // crit camera punch-in is allowed only for attack/stat/skill rolls
      zoomCrit: data.zoomCrit ? '1' : '0',
      // explicit crit threshold (Gobelin: dé − 1); absent = die max face
      critFrom: data.critFrom != null ? String(data.critFrom) : ''
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
      closeTimer = setTimeout(() => OBR.popover.close(DICE_POPOVER_ID).catch((err) => logError('dice_popup_close_failed', err)), CLOSE_AFTER_MS);
      // Heavy-popup churn watch: one row every 10 opens, not one per roll.
      diceOpenCount++;
      if (diceOpenCount % 10 === 0) logEvent('info', 'dice_popup_opens', { detail: { count: diceOpenCount } });
    } catch (err) {
      logError('dice_popup_open_failed', err);
    }
  });
});
