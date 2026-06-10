<script>
  import { onMount, onDestroy } from 'svelte';
  import OBR from '@owlbear-rodeo/sdk';
  import {
    createInitialGameState, createEmptyPlayer,
    hydrateState, dehydrateState,
    GM_CHAR_ID,
  } from './deck.js';
  import GMDashboard from './GMDashboard.svelte';
  import PlayerHand from './PlayerHand.svelte';

  const METADATA_KEY = 'com.cardenveil/gameState';

  let ready     = $state(false);
  let myId      = $state(null);
  let myName    = $state('');
  let myRole    = $state(null);
  let party     = $state([]);
  let gameState = $state(null);

  // ── Toast notifications ──────────────────────────────────────────────
  let toasts = $state([]);

  function addToast(msg, type = 'error') {
    const id = Date.now() + Math.random();
    toasts = [...toasts, { id, msg: String(msg), type }];
    setTimeout(() => dismissToast(id), type === 'error' ? 8000 : 4000);
  }

  function dismissToast(id) {
    toasts = toasts.filter(t => t.id !== id);
  }

  // ── State push: optimistic local update → dehydrate → OBR ────────────
  async function pushState(newState) {
    try {
      const previousState = gameState;
      const plain = $state.snapshot(newState);
      const dehydrated = dehydrateState(plain);
      gameState = newState;
      try {
        await OBR.room.setMetadata({ [METADATA_KEY]: dehydrated });
      } catch (e) {
        gameState = previousState;
        throw e;
      }
    } catch (e) {
      addToast(e?.message ?? String(e));
    }
  }

  // ── Sync All: reconcile local and remote state ─────────────────────────────
  async function syncAll() {
    try {
      const meta = await OBR.room.getMetadata();
      const raw = meta[METADATA_KEY];
      if (!raw) {
        addToast('No game state found in metadata.', 'error');
        return;
      }
      
      let remoteState = hydrateState(raw);
      const localState = gameState;
      
      // Reconcile: preserve local player data if remote is missing it
      if (localState && localState.players[myId] && !remoteState.players[myId]) {
        remoteState = {
          ...remoteState,
          players: { ...remoteState.players, [myId]: localState.players[myId] }
        };
      }
      
      // Ensure GM ID is set correctly
      if (myRole === 'GM' && remoteState.gmId !== myId) {
        remoteState = { ...remoteState, gmId: myId };
      }
      
      // Ensure all party members are registered
      let dirty = false;
      for (const p of party) {
        if (p.id !== myId && !remoteState.players[p.id]) {
          remoteState = {
            ...remoteState,
            players: { ...remoteState.players, [p.id]: createEmptyPlayer(p.name) }
          };
          dirty = true;
        }
      }
      
      // Write reconciled state back to metadata
      const dehydrated = dehydrateState($state.snapshot(remoteState));
      await OBR.room.setMetadata({ [METADATA_KEY]: dehydrated });
      
      // Update local state
      gameState = remoteState;
      addToast('Sync complete.', 'info');
    } catch (e) {
      addToast(e?.message ?? String(e));
    }
  }

  let unsubMeta  = null;
  let unsubParty = null;

  onMount(() => {
    OBR.onReady(async () => {
      try {
        myId   = await OBR.player.getId();
        myName = await OBR.player.getName();
        myRole = await OBR.player.getRole();
        party  = await OBR.party.getPlayers();

        const meta = await OBR.room.getMetadata();
        let raw = meta[METADATA_KEY] ?? null;

        // GM creates fresh state if none exists
        if (!raw && myRole === 'GM') {
          const fresh = createInitialGameState();
          await OBR.room.setMetadata({ [METADATA_KEY]: dehydrateState(fresh) });
          raw = dehydrateState(fresh);
        }

        // Hydrate and patch missing fields
        let state = raw ? hydrateState(raw) : null;

        if (state) {
          let dirty = false;

          // Record GM identity
          if (myRole === 'GM' && state.gmId !== myId) {
            state = { ...state, gmId: myId };
            dirty = true;
          }

          if (dirty) await OBR.room.setMetadata({ [METADATA_KEY]: dehydrateState(state) });
        }

        // Register player (non-GM only)
        if (state && myRole !== 'GM' && !state.players[myId]) {
          state = { ...state, players: { ...state.players, [myId]: createEmptyPlayer(myName) } };
          await OBR.room.setMetadata({ [METADATA_KEY]: dehydrateState(state) });
        }

        // GM registers all party members on mount
        if (state && myRole === 'GM') {
          let partyDirty = false;
          for (const p of party) {
            if (p.id !== myId && !state.players[p.id]) {
              state = { ...state, players: { ...state.players, [p.id]: createEmptyPlayer(p.name) } };
              partyDirty = true;
            }
          }
          if (partyDirty) {
            await OBR.room.setMetadata({ [METADATA_KEY]: dehydrateState(state) });
          }
        }

        gameState = state;
        ready = true;

      } catch (e) {
        addToast(e?.message ?? String(e));
        ready = true;
      }

      // Live sync: incoming raw → hydrate locally
      unsubMeta = OBR.room.onMetadataChange((meta) => {
        try {
          const raw = meta[METADATA_KEY];
          if (raw) gameState = hydrateState(raw);
        } catch (e) {
          addToast(e?.message ?? String(e));
        }
      });

      unsubParty = OBR.party.onChange(async (players) => {
        party = players;
        // GM auto-registers new party members
        if (myRole === 'GM' && gameState) {
          let dirty = false;
          let state = gameState;
          for (const p of players) {
            if (p.id !== myId && !state.players[p.id]) {
              state = { ...state, players: { ...state.players, [p.id]: createEmptyPlayer(p.name) } };
              dirty = true;
            }
          }
          if (dirty) {
            await pushState(state);
          }
        }
      });
    });
  });

  onDestroy(() => {
    unsubMeta?.();
    unsubParty?.();
  });
</script>

<!-- ── Toast container ─────────────────────────────────────────────────── -->
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

<!-- ── Main content ────────────────────────────────────────────────────── -->
{#if !ready}
  <div class="flex items-center justify-center h-full">
    <div class="text-center space-y-2">
      <div class="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
      <p class="text-xs text-gray-500">Connexion à Owlbear Rodeo...</p>
    </div>
  </div>

{:else if !gameState}
  <div class="flex flex-col items-center justify-center h-full gap-4 p-4">
    <p class="text-gray-400 text-sm text-center">
      {myRole === 'GM' ? 'Aucune partie initialisée.' : 'En attente que le MJ initialise la partie...'}
    </p>
    {#if myRole === 'GM'}
      <button
        onclick={() => pushState(createInitialGameState())}
        class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg"
      >
        Initialiser la partie
      </button>
    {/if}
  </div>

{:else if myRole === 'GM'}
  <GMDashboard {gameState} {party} {myId} onUpdate={pushState} onSync={syncAll} />

{:else}
  <PlayerHand {gameState} {myId} {myName} {party} onUpdate={pushState} />
{/if}
