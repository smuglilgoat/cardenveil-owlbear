<script>
  import CardDisplay from './CardDisplay.svelte';
  import TokenPanel from './TokenPanel.svelte';

  /** @type {{ gameState: object, myId: string, myName: string, onUpdate: (s: object) => void }} */
  let { gameState, myId, myName, onUpdate } = $props();

  let player = $derived(gameState.players[myId]);
  let deckCount = $derived(gameState.deck.length);

  function drawCard() {
    if (gameState.deck.length === 0) return;
    const [card, ...rest] = gameState.deck;
    onUpdate({
      ...gameState,
      deck: rest,
      players: {
        ...gameState.players,
        [myId]: { ...player, hand: [...player.hand, card] },
      },
    });
  }

  function discardCard(card) {
    onUpdate({
      ...gameState,
      discard: [...gameState.discard, card],
      players: {
        ...gameState.players,
        [myId]: { ...player, hand: player.hand.filter(c => c.id !== card.id) },
      },
    });
  }

  function crystallizeCard(card) {
    onUpdate({
      ...gameState,
      players: {
        ...gameState.players,
        [myId]: {
          ...player,
          hand: player.hand.filter(c => c.id !== card.id),
          crystallized: [...player.crystallized, card],
        },
      },
    });
  }

  function discardCrystallized(card) {
    onUpdate({
      ...gameState,
      discard: [...gameState.discard, card],
      players: {
        ...gameState.players,
        [myId]: {
          ...player,
          crystallized: player.crystallized.filter(c => c.id !== card.id),
        },
      },
    });
  }

  function spendToken(stat) {
    if (player.tokens[stat] <= 0) return;
    onUpdate({
      ...gameState,
      players: {
        ...gameState.players,
        [myId]: {
          ...player,
          tokens: { ...player.tokens, [stat]: player.tokens[stat] - 1 },
        },
      },
    });
  }

  function addToken(stat) {
    if (player.tokens[stat] >= player.maxTokens[stat]) return;
    onUpdate({
      ...gameState,
      players: {
        ...gameState.players,
        [myId]: {
          ...player,
          tokens: { ...player.tokens, [stat]: player.tokens[stat] + 1 },
        },
      },
    });
  }
</script>

{#if !player}
  <div class="flex items-center justify-center h-full text-gray-500 text-sm">
    En attente de l'initialisation...
  </div>
{:else}
  <div class="flex flex-col h-full p-3 gap-4 overflow-y-auto">

    <!-- Header -->
    <div class="flex justify-between items-center">
      <h2 class="text-white font-semibold text-sm">{myName}</h2>
      <div class="flex gap-3 text-xs text-gray-500">
        <span>Deck: {deckCount}</span>
        <span>Défausse: {gameState.discard.length}</span>
      </div>
    </div>

    <!-- Normal Hand -->
    <div>
      <h3 class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
        Main ({player.hand.length})
      </h3>
      {#if player.hand.length === 0}
        <p class="text-xs text-gray-600 italic">Aucune carte en main</p>
      {:else}
        <div class="flex flex-wrap gap-2">
          {#each player.hand as card (card.id)}
            <CardDisplay
              {card}
              actions={[
                { label: 'Défausser', onClick: () => discardCard(card) },
                { label: 'Cristalliser', onClick: () => crystallizeCard(card) },
              ]}
            />
          {/each}
        </div>
      {/if}
    </div>

    <!-- Draw button -->
    <button
      onclick={drawCard}
      disabled={deckCount === 0}
      class="w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {deckCount > 0 ? `Piocher (${deckCount} restantes)` : 'Deck vide'}
    </button>

    <!-- Crystallized -->
    {#if player.crystallized.length > 0}
      <div>
        <h3 class="text-[11px] font-semibold text-amber-400 uppercase tracking-wide mb-2">
          Cristallisées ({player.crystallized.length})
        </h3>
        <div class="flex flex-wrap gap-2">
          {#each player.crystallized as card (card.id)}
            <CardDisplay
              {card}
              crystallized={true}
              actions={[
                { label: 'Jouer / Défausser', onClick: () => discardCrystallized(card) },
              ]}
            />
          {/each}
        </div>
      </div>
    {/if}

    <!-- Tokens -->
    <div>
      <h3 class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Tokens</h3>
      <TokenPanel
        playerState={player}
        onSpendToken={spendToken}
        onAddToken={addToken}
      />
    </div>

  </div>
{/if}
