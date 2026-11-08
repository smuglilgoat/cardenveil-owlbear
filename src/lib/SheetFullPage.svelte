<script>
  // Standalone full character sheet (issue #14). Opened in a browser tab from
  // the sheet's ONGLET button. Outside the Owlbear iframe there is no
  // OBR.player/OBR.room, so the tab takes its identity from the URL and gets
  // the game state straight from Supabase instead.
  //
  // The tab must look EXACTLY like the sheet in the room: same component, same
  // stylesheet, same width as the Owlbear action popover (800 px — the
  // container queries in CharacterSheet switch layout at that width).
  import { onMount } from 'svelte';
  import CharacterSheet from './CharacterSheet.svelte';
  import { fetchState, startRealtime, stopRealtime, setDispatchErrorHandler } from './api.js';
  import { fetchCharacterSheet } from './characterSheet.js';
  import { publishCommand, discardCommand, COMMAND_ACTION } from './roomBridge.js';
  import { logError, setLogContext } from './appLog.js';

  /** Width of the Owlbear action popover — the sheet's container in the room. */
  const PANEL_WIDTH = 800;

  const params = new URLSearchParams(location.search);
  const playerId = params.get('playerId') ?? '';
  const roomId = params.get('roomId') ?? '';
  // The room hands the tab a secret when it opens it: the command channel is
  // writable by anyone holding the public anon key, so commands are signed.
  const commandSecret = params.get('k') ?? '';
  const missing = !playerId || !roomId;

  let gameState = $state(null);
  let connection = $state('connecting');
  /** Refused or failed game action — shown in the sheet's own top bar. */
  let actionError = $state('');

  const statusNote = $derived(
    actionError || (connection === 'connected' ? '' : 'Reconnexion à la table…')
  );

  /**
   * The tab never writes game_rooms itself: it holds no actor credential the
   * server would accept (the room's frames and this tab live in different
   * storage partitions, so they do not share the token). The action goes to
   * the room's background page, which is inside Owlbear and holds the
   * credential; the resulting state comes back over Realtime.
   */
  function onAction(action) {
    // The id travels with the action: the server's idempotency then drops a
    // replay of the same command, whoever replays it.
    const tagged = { ...action, actionId: action.actionId ?? crypto.randomUUID() };
    return publishCommand(roomId, COMMAND_ACTION, { playerId, action: tagged }, commandSecret).then(
      (command) => {
        actionError = '';
        // The executor drops the row when it reads it; this is the safety net
        // for a row nobody read.
        setTimeout(() => discardCommand(command?.id), 60000);
      },
      (err) => {
        actionError = err?.message || 'Action non transmise à la table.';
        logError('sheet_tab_action_failed', err);
      }
    );
  }

  onMount(() => {
    if (missing) return;
    setLogContext({ roomId, playerId });

    // A refused write drops the optimistic state: without this the sheet
    // snaps back silently and the player thinks the table broke.
    setDispatchErrorHandler(({ message }) => {
      actionError = message?.startsWith('unauthorized')
        ? 'Action refusée : identité du joueur non reconnue.'
        : `Action non enregistrée : ${message ?? 'erreur inconnue'}`;
    });

    fetchCharacterSheet(playerId, roomId)
      .catch(() => {
        /* the sheet itself reports its own load errors */
      });

    fetchState(roomId)
      .then((state) => {
        if (state) gameState = state;
      })
      .catch(() => {
        /* realtime catch-up covers a failed first read */
      });

    startRealtime(
      roomId,
      (state) => {
        gameState = state;
      },
      (status) => {
        connection = status;
      }
    );

    return () => {
      setDispatchErrorHandler(null);
      stopRealtime();
    };
  });
</script>

<main class="w-full h-screen bg-[#242424] text-white flex justify-center overflow-hidden">
  {#if missing}
    <div class="flex-1 flex items-center justify-center p-6 text-center text-[13px] text-gray-400">
      Lien incomplet : il manque l'identifiant du joueur ou de la table.
    </div>
  {:else}
    <div class="h-full shrink-0 flex flex-col" style:width="{PANEL_WIDTH}px">
      <CharacterSheet {playerId} {roomId} {gameState} onAction={onAction} {statusNote} {commandSecret} />
    </div>
  {/if}
</main>
