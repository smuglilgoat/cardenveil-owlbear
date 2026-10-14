<script>
  import { onMount, onDestroy } from 'svelte';
  import OBR from '@owlbear-rodeo/sdk';
  import GMDashboard from './GMDashboard.svelte';
  import PlayerHand from './PlayerHand.svelte';
  import { startRealtime, stopRealtime, dispatch, fetchState, recoverConnection } from './api.js';
  import { logError, setLogContext } from './appLog.js';
  import { initDiag } from './diag.js';

  initDiag('main');

  let { onGameChange = null } = $props();

  let ready     = $state(false);
  let myId      = $state(null);
  let myName    = $state('');
  let myRole    = $state(null);
  let party     = $state([]);
  let roomId    = $state(null);
  let gameState = $state(null);

  let toasts = $state([]);

  // Realtime connection status: 'connected' | 'disconnected' | 'permanently_disconnected'
  let connectionStatus = $state('connected');
  // Track whether we've ever received a successful SUBSCRIBED so we know
  // to suppress the "reconnected" toast on the initial subscribe.
  let hadInitialConnection = false;
  // Non-reactive: guards against re-firing on our own `toasts` write.
  // Reading+writing `toasts` inside this effect used to trip Svelte's
  // effect_update_depth_exceeded on every connection transition.
  let lastStatus = null;

  $effect(() => {
    const status = connectionStatus;
    if (!ready || status === lastStatus) return;
    lastStatus = status;
    if (status === 'disconnected') {
      if (hadInitialConnection) {
        addToast('Connexion perdue — reconnexion en cours...', 'error');
      }
    } else if (status === 'connected') {
      if (hadInitialConnection) {
        addToast('Connexion rétablie', 'info');
      }
    } else if (status === 'permanently_disconnected') {
      addToast('Connexion perdue — rafraîchissez la page.', 'error');
    }
  });

  function handleConnectionChange(status) {
    connectionStatus = status;
    if (status === 'connected') hadInitialConnection = true;
  }

  function addToast(msg, type = 'error') {
    const id = Date.now() + Math.random();
    toasts = [...toasts, { id, msg: String(msg), type }];
    setTimeout(() => dismissToast(id), type === 'error' ? 8000 : 4000);
  }

  function dismissToast(id) {
    toasts = toasts.filter(t => t.id !== id);
  }

  async function onAction(action) {
    try {
      const newState = await dispatch(roomId, action);
      if (newState) gameState = newState;
    } catch (e) {
      addToast(e?.message ?? String(e));
    }
  }

  // Propagate game state upward so App.svelte can use it (e.g. initiative URL)
  $effect(() => {
    onGameChange?.({ gameState, myRole, myId, onAction });
  });

  let unsubParty = null;
  let loadError = $state('');

  /**
   * Load (and register into) the room state. Never blocks the first paint:
   * a cold or unreachable function shows the retry UI instead of a spinner
   * that only a page reload could clear.
   */
  async function loadGame() {
    loadError = '';
    try {
      let state = await fetchState(roomId);

      if (!state && myRole === 'GM') {
        state = await dispatch(roomId, { type: 'INIT_GAME', playerId: myId });
      }

      if (state && myRole === 'GM' && state.gmId !== myId) {
        state = await dispatch(roomId, { type: 'INIT_GAME', playerId: myId });
      }

      if (state && myRole !== 'GM' && !state.players[myId]) {
        state = await dispatch(roomId, { type: 'REGISTER_PLAYER', playerId: myId, name: myName });
      }

      if (state && myRole === 'GM') {
        const missingPlayers = party.filter(p => p.id !== myId && !state.players[p.id]);
        if (missingPlayers.length > 0) {
          state = await dispatch(roomId, { type: 'REGISTER_PARTY', playerId: myId, players: missingPlayers });
        }
      }

      gameState = state;
      startRealtime(roomId, (newState) => {
        gameState = newState;
      }, handleConnectionChange);
    } catch (e) {
      loadError = e?.message ?? String(e);
      logError('game_load_failed', e, { roomId });
    }
  }

  /** Coming back from a hidden tab / offline: resubscribe + resync. */
  function onVisibilityChange() {
    if (document.visibilityState === 'visible') recoverConnection();
  }

  onMount(() => {
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', recoverConnection);
    OBR.onReady(async () => {
      try {
        myId   = await OBR.player.getId();
        myName = await OBR.player.getName();
        myRole = await OBR.player.getRole();
        party  = await OBR.party.getPlayers();
        roomId = OBR.room.id;
        setLogContext({ roomId, playerId: myId, playerName: myName });

        ready = true;
        await loadGame();
      } catch (e) {
        addToast(e?.message ?? String(e));
        logError('game_init_failed', e);
        ready = true;
      }

      unsubParty = OBR.party.onChange(async (players) => {
        party = players;
        if (myRole === 'GM' && gameState && roomId) {
          const missingPlayers = players.filter(p => p.id !== myId && !gameState.players[p.id]);
          if (missingPlayers.length > 0) {
            await onAction({ type: 'REGISTER_PARTY', playerId: myId, players: missingPlayers });
          }
        }
      });
    });
  });

  onDestroy(() => {
    stopRealtime();
    unsubParty?.();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('online', recoverConnection);
  });
</script>

{#if toasts.length > 0}
  <div class="fixed top-2 left-2 right-2 z-50 flex flex-col gap-1.5 pointer-events-none">
    {#each toasts as toast (toast.id)}
      <div
        class="flex items-start gap-2 px-3 py-2 rounded-lg shadow-lg text-xs pointer-events-auto"
        class:bg-red-900={toast.type === 'error'}
        class:border-red-700={toast.type === 'error'}
        class:text-red-200={toast.type === 'error'}
        class:bg-indigo-900={toast.type === 'info'}
        class:border-indigo-700={toast.type === 'info'}
        class:text-indigo-200={toast.type === 'info'}
        style="border-width:1px"
      >
        <span class="shrink-0 mt-px">{toast.type === 'error' ? '✕' : 'ℹ'}</span>
        <span class="flex-1 break-words font-mono leading-snug">{toast.msg}</span>
        <button onclick={() => dismissToast(toast.id)} class="shrink-0 opacity-60 hover:opacity-100 text-sm">×</button>
      </div>
    {/each}
  </div>
{/if}

{#if !ready}
  <div class="flex items-center justify-center h-full">
    <div class="text-center space-y-2">
      <div class="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
      <p class="text-xs text-gray-500">Connexion à Owlbear Rodeo...</p>
    </div>
  </div>

{:else if !gameState}
  <div class="flex flex-col items-center justify-center h-full gap-4 p-4">
    {#if loadError}
      <p class="text-red-400 text-sm text-center">Impossible de charger l'état de la partie.</p>
      <p class="text-gray-500 text-xs text-center font-mono">{loadError}</p>
      <button
        onclick={loadGame}
        class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg"
      >
        Réessayer
      </button>
    {:else}
      <p class="text-gray-400 text-sm text-center">
        {myRole === 'GM' ? 'Aucune partie initialisée.' : 'En attente que le MJ initialise la partie...'}
      </p>
      {#if myRole === 'GM'}
        <button
          onclick={() => onAction({ type: 'INIT_GAME', playerId: myId })}
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg"
        >
          Initialiser la partie
        </button>
      {/if}
    {/if}
  </div>

{:else if myRole === 'GM'}
  <GMDashboard {gameState} {party} {myId} onAction={onAction} />

{:else}
  <PlayerHand {gameState} {myId} {myName} {party} onAction={onAction} />
{/if}
