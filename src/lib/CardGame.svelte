<script>
  import { onMount, onDestroy } from 'svelte';
  import OBR from '@owlbear-rodeo/sdk';
  import { createInitialGameState, createEmptyPlayer } from './deck.js';
  import GMDashboard from './GMDashboard.svelte';
  import PlayerHand from './PlayerHand.svelte';

  const METADATA_KEY = 'com.cardenveil/gameState';

  let ready = $state(false);
  let error = $state(null);
  let myId = $state(null);
  let myName = $state('');
  let myRole = $state(null);
  let party = $state([]);
  let gameState = $state(null);

  let unsubMeta = null;
  let unsubParty = null;

  async function pushState(newState) {
    gameState = { ...newState };
    await OBR.room.setMetadata({ [METADATA_KEY]: newState });
  }

  onMount(() => {
    OBR.onReady(async () => {
      try {
        myId = await OBR.player.getId();
        myName = await OBR.player.getName();
        myRole = await OBR.player.getRole();
        party = await OBR.party.getPlayers();

        const meta = await OBR.room.getMetadata();
        let state = meta[METADATA_KEY] ?? null;

        // GM initialises the state if it doesn't exist yet
        if (!state && myRole === 'GM') {
          state = createInitialGameState();
          await OBR.room.setMetadata({ [METADATA_KEY]: state });
        }

        // Register the current player if not already in state
        if (state && !state.players[myId]) {
          state = {
            ...state,
            players: {
              ...state.players,
              [myId]: createEmptyPlayer(myName),
            },
          };
          await OBR.room.setMetadata({ [METADATA_KEY]: state });
        }

        gameState = state;
        ready = true;
      } catch (e) {
        error = e?.message ?? String(e);
        ready = true;
      }

      // Live sync from other clients
      unsubMeta = OBR.room.onMetadataChange((meta) => {
        const s = meta[METADATA_KEY];
        if (s) gameState = s;
      });

      unsubParty = OBR.party.onChange((players) => {
        party = players;
      });
    });
  });

  onDestroy(() => {
    unsubMeta?.();
    unsubParty?.();
  });
</script>

{#if !ready}
  <div class="flex items-center justify-center h-full">
    <div class="text-center space-y-2">
      <div class="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
      <p class="text-xs text-gray-500">Connexion à Owlbear Rodeo...</p>
    </div>
  </div>

{:else if error}
  <div class="flex items-center justify-center h-full p-4">
    <div class="text-center space-y-2">
      <p class="text-red-400 text-sm font-medium">Erreur de connexion</p>
      <p class="text-xs text-gray-500">{error}</p>
    </div>
  </div>

{:else if !gameState}
  <div class="flex flex-col items-center justify-center h-full gap-4 p-4">
    <p class="text-gray-400 text-sm text-center">
      {myRole === 'GM'
        ? 'Aucune partie initialisée.'
        : 'En attente que le MJ initialise la partie...'}
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
  <GMDashboard
    {gameState}
    {party}
    {myId}
    onUpdate={pushState}
  />

{:else}
  <PlayerHand
    {gameState}
    {myId}
    {myName}
    {party}
    onUpdate={pushState}
  />
{/if}
