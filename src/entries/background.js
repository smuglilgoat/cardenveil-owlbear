// Persistent page that opens each client's dice popup when a roll starts.
import OBR from '@owlbear-rodeo/sdk';
import { ROLL_CHANNEL, DICE_POPOVER_ID, sendRollToRoom } from '../lib/rollBroadcast.js';
import { initLogging, setLogContext, logEvent, logError } from '../lib/appLog.js';
import { initDiag } from '../lib/diag.js';

initLogging('background', { sessionStart: true });
initDiag('background');

const CLOSE_AFTER_MS = 11000; // 6 → 8 → 11 s: the final damage line needs reading time (issue #5)
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

/** Height the popup needs: chips wrap every ~9 dice, the breakdown is a block. */
function dicePopoverHeight(data) {
  const dice = data.rolls?.length ?? (data.diceSpec ?? []).reduce((n, t) => n + (t.count ?? 0), 0) ?? 1;
  const chipRows = Math.max(1, Math.ceil(Math.min(dice, 15) / 9));
  const breakdown = (data.breakdown ?? []).length ? 90 : 0;
  const tags = data.tags ? 22 : 0;
  return Math.min(500, 350 + (chipRows - 1) * 34 + breakdown + tags);
}

function openDicePopover(params, anchor, height) {
  return OBR.popover.open({
    id: DICE_POPOVER_ID,
    url: `${window.location.origin}/dice.html?${params.toString()}`,
    // ~30% narrower than the original 520; the height follows the content:
    // 3D canvas (180) + title/formula + one chip row + total = ~350, plus one
    // row per extra line of chips and the attack breakdown when present.
    width: 364,
    height,
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

  // Commands from the standalone sheet tab (issue #14). The tab is a top-level
  // page while the room's frames are embedded in www.owlbear.rodeo: Chrome
  // partitions BroadcastChannel AND localStorage by top-level site, so the tab
  // can reach neither. The command channel (Supabase) crosses that boundary.
  //
  // This page is the room's executor: it is always inside Owlbear, it holds
  // the room's credentials, and it opens the dice popup. Only the tab owner's
  // browser acts on a command — the room's frames all receive it.
  import('../lib/roomBridge.js')
    .then(async ({ onCommand, isStaleCommand, discardCommand, COMMAND_ROLL, COMMAND_ACTION }) => {
      const { readCommandSecret, verifyCommand } = await import('../lib/commandSecret.js');
      // Signatures already executed in this page: the table is public, so a
      // captured command can be inserted again — once is enough.
      const seen = new Set();

      onCommand(OBR.room.id, async (command) => {
        if (isStaleCommand(command)) return;
        if (seen.has(command.signature)) return;
        // The secret is read per command: it is minted when the room opens
        // the tab, which is AFTER this page loaded.
        const secret = readCommandSecret(OBR.room.id);
        // The table is public: only the tab the room opened may act.
        if (!(await verifyCommand(secret, command))) {
          logEvent('warn', 'command_rejected_unsigned', { detail: { kind: command.kind } });
          return;
        }
        const payload = command.payload ?? {};
        const ownerId = payload.playerId;
        let myId = null;
        try {
          myId = await OBR.player.getId();
        } catch {
          /* not ready */
        }
        if (!ownerId || ownerId !== myId) return;
        seen.add(command.signature);
        // The row is a delivery vehicle, not a log: drop it once it is read.
        discardCommand(command.id).catch(() => {});

        if (command.kind === COMMAND_ROLL) {
          let playerName = payload.playerName;
          if (!playerName) {
            try {
              playerName = await OBR.player.getName();
            } catch {
              /* name optional */
            }
          }
          // The tab cannot read the room's dice style (its storage partition is
          // separate), so the room's style wins.
          const style = localStorage.getItem('cardenveil-dice-style') || '';
          await sendRollToRoom({ ...payload, playerName, mode: style });
          logEvent('info', 'roll_relay_sent', { detail: { rollId: payload.rollId, label: payload.label } });
          return;
        }

        if (command.kind === COMMAND_ACTION) {
          const action = payload.action ?? {};
          if (!action?.type) return;
          // The executor acts as the tab's owner and nobody else: the action's
          // own identity fields are overwritten, so a signed command cannot
          // borrow the room's credential for a third player.
          if (action.playerId && action.playerId !== ownerId) {
            logEvent('warn', 'command_rejected_identity', { detail: { type: action.type } });
            return;
          }
          try {
            const { dispatch } = await import('../lib/api.js');
            await dispatch(OBR.room.id, { ...action, playerId: ownerId, actorId: ownerId });
            logEvent('info', 'command_action_applied', { detail: { type: action.type } });
          } catch (err) {
            logError('command_action_failed', err);
          }
        }
      });
    })
    .catch((err) => logError('command_bridge_unavailable', err));

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
      // weapon properties shown under the formula (issue #5)
      tags: data.tags || '',
      // attack stage throws (3D): the popup reports each stage back to the
      // roller, which applies the rules and throws the next stage
      staged: data.staged ? '1' : '0',
      // crit camera punch-in is allowed only for attack/stat/skill rolls
      zoomCrit: data.zoomCrit ? '1' : '0',
      // explicit crit threshold (Gobelin: dé − 1); absent = die max face
      critFrom: data.critFrom != null ? String(data.critFrom) : '',
      // Brute weapons cannot crit: no gold flash, no crit zoom (issue #11)
      noCrit: data.noCrit ? '1' : '',
      // avantage/désavantage d'un jet (traits de race): 'high' | 'low'
      keep: data.keep || ''
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
      await openDicePopover(params, await anchorFor(isSelf), dicePopoverHeight(data));
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
