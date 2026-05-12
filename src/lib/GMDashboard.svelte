<script>
  import CardDisplay from './CardDisplay.svelte';
  import TokenPanel from './TokenPanel.svelte';
  import { createShuffledDeck, createEmptyPlayer, shuffle } from './deck.js';

  /** @type {{ gameState: object, party: object[], myId: string, onUpdate: (s: object) => void }} */
  let { gameState, party, myId, onUpdate } = $props();

  // Deal controls
  let dealTarget = $state('');
  let dealCount = $state(1);

  // Expanded player panels
  let expandedPlayers = $state(new Set());

  let playerIds = $derived(Object.keys(gameState.players));

  function getPlayerName(id) {
    const fromParty = party.find(p => p.id === id);
    return fromParty?.name ?? gameState.players[id]?.name ?? id.slice(0, 8);
  }

  function toggleExpand(id) {
    const next = new Set(expandedPlayers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedPlayers = next;
  }

  // Deal N cards from deck to a player's hand
  function dealToPlayer() {
    if (!dealTarget || dealCount <= 0) return;
    const available = Math.min(dealCount, gameState.deck.length);
    if (available === 0) return;

    const dealt = gameState.deck.slice(0, available);
    const newDeck = gameState.deck.slice(available);
    const target = gameState.players[dealTarget];
    if (!target) return;

    onUpdate({
      ...gameState,
      deck: newDeck,
      players: {
        ...gameState.players,
        [dealTarget]: { ...target, hand: [...target.hand, ...dealt] },
      },
    });
  }

  // Give one crystallized card (drawn from deck) to a player
  function giveCrystallized(toId) {
    if (gameState.deck.length === 0) return;
    const [card, ...rest] = gameState.deck;
    const p = gameState.players[toId];
    onUpdate({
      ...gameState,
      deck: rest,
      players: {
        ...gameState.players,
        [toId]: { ...p, crystallized: [...p.crystallized, card] },
      },
    });
  }

  // Discard a card from a player's hand (GM action)
  function gmDiscardFromHand(playerId, card) {
    const p = gameState.players[playerId];
    onUpdate({
      ...gameState,
      discard: [...gameState.discard, card],
      players: {
        ...gameState.players,
        [playerId]: { ...p, hand: p.hand.filter(c => c.id !== card.id) },
      },
    });
  }

  // Reset all tokens to max (rest)
  function restAll() {
    const updated = {};
    for (const [id, p] of Object.entries(gameState.players)) {
      updated[id] = { ...p, tokens: { ...p.maxTokens } };
    }
    onUpdate({ ...gameState, players: updated });
  }

  // Set max tokens for a specific player / stat
  function setMaxToken(playerId, stat, val) {
    const p = gameState.players[playerId];
    if (!p) return;
    onUpdate({
      ...gameState,
      players: {
        ...gameState.players,
        [playerId]: {
          ...p,
          maxTokens: { ...p.maxTokens, [stat]: Math.max(0, Math.min(10, val)) },
        },
      },
    });
  }

  // Spend / add token for a player (GM override)
  function gmSpendToken(playerId, stat) {
    const p = gameState.players[playerId];
    if (!p || p.tokens[stat] <= 0) return;
    onUpdate({
      ...gameState,
      players: {
        ...gameState.players,
        [playerId]: { ...p, tokens: { ...p.tokens, [stat]: p.tokens[stat] - 1 } },
      },
    });
  }

  function gmAddToken(playerId, stat) {
    const p = gameState.players[playerId];
    if (!p || p.tokens[stat] >= p.maxTokens[stat]) return;
    onUpdate({
      ...gameState,
      players: {
        ...gameState.players,
        [playerId]: { ...p, tokens: { ...p.tokens, [stat]: p.tokens[stat] + 1 } },
      },
    });
  }

  // Deck management
  function reshuffleDiscard() {
    onUpdate({
      ...gameState,
      deck: shuffle([...gameState.deck, ...gameState.discard]),
      discard: [],
    });
  }

  function resetDeck() {
    if (!confirm('Réinitialiser et mélanger un nouveau deck ?')) return;
    onUpdate({ ...gameState, deck: createShuffledDeck(), discard: [] });
  }

  function shuffleDeck() {
    onUpdate({ ...gameState, deck: shuffle(gameState.deck) });
  }
</script>

<div class="flex flex-col h-full overflow-y-auto p-3 gap-4">

  <!-- Deck Controls -->
  <div class="bg-gray-800 rounded-xl p-3 space-y-3">
    <h2 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Deck</h2>

    <div class="flex gap-3 text-xs text-gray-400">
      <span class="flex items-center gap-1">
        <span class="text-white font-bold text-sm">{gameState.deck.length}</span> restantes
      </span>
      <span class="flex items-center gap-1">
        <span class="text-white font-bold text-sm">{gameState.discard.length}</span> défaussées
      </span>
    </div>

    <div class="flex gap-2 flex-wrap">
      <button
        onclick={shuffleDeck}
        class="flex-1 text-xs py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg"
      >
        Mélanger
      </button>
      <button
        onclick={reshuffleDiscard}
        disabled={gameState.discard.length === 0}
        class="flex-1 text-xs py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg disabled:opacity-40"
      >
        Récupérer défausse
      </button>
      <button
        onclick={resetDeck}
        class="flex-1 text-xs py-1.5 bg-red-900 hover:bg-red-800 text-red-200 rounded-lg"
      >
        Nouveau deck
      </button>
    </div>

    <!-- Rest / Reset tokens -->
    <button
      onclick={restAll}
      class="w-full text-xs py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg"
    >
      Repos — Réinitialiser tous les tokens
    </button>
  </div>

  <!-- Deal Cards -->
  <div class="bg-gray-800 rounded-xl p-3 space-y-2">
    <h2 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Distribuer</h2>

    <div class="flex gap-2">
      <select
        bind:value={dealTarget}
        class="flex-1 text-xs bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-gray-200"
      >
        <option value="">— Choisir joueur —</option>
        {#each playerIds as id}
          <option value={id}>{getPlayerName(id)}</option>
        {/each}
      </select>

      <input
        type="number"
        bind:value={dealCount}
        min="1"
        max="10"
        class="w-12 text-xs bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-center text-gray-200"
      />

      <button
        onclick={dealToPlayer}
        disabled={!dealTarget || gameState.deck.length === 0}
        class="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-40 shrink-0"
      >
        Donner
      </button>
    </div>

    {#if dealTarget}
      <button
        onclick={() => giveCrystallized(dealTarget)}
        disabled={gameState.deck.length === 0}
        class="w-full text-xs py-1.5 bg-amber-700 hover:bg-amber-600 text-amber-100 rounded-lg disabled:opacity-40"
      >
        Donner 1 carte cristallisée à {getPlayerName(dealTarget)}
      </button>
    {/if}
  </div>

  <!-- Players -->
  <div class="space-y-2">
    <h2 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Joueurs</h2>

    {#each playerIds as id (id)}
      {@const p = gameState.players[id]}
      {@const expanded = expandedPlayers.has(id)}
      <div class="bg-gray-800 rounded-xl overflow-hidden">

        <!-- Player header row -->
        <button
          onclick={() => toggleExpand(id)}
          class="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-750 transition-colors text-left"
        >
          <div class="flex items-center gap-2">
            <span class="text-sm text-white font-medium">{getPlayerName(id)}</span>
            {#if id === myId}
              <span class="text-[9px] text-indigo-400 bg-indigo-900 px-1 rounded">GM</span>
            {/if}
          </div>
          <div class="flex items-center gap-3 text-xs text-gray-400">
            <span>Main: <span class="text-white">{p.hand.length}</span></span>
            <span>✦ <span class="text-amber-400">{p.crystallized.length}</span></span>
            <span class="text-gray-500">{expanded ? '▲' : '▼'}</span>
          </div>
        </button>

        <!-- Expanded section -->
        {#if expanded}
          <div class="border-t border-gray-700 px-3 py-3 space-y-3">

            <!-- Hand -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Main</span>
              </div>
              {#if p.hand.length === 0}
                <p class="text-xs text-gray-600 italic">Vide</p>
              {:else}
                <div class="flex flex-wrap gap-1.5">
                  {#each p.hand as card (card.id)}
                    <CardDisplay
                      {card}
                      actions={[
                        { label: 'Défausser', onClick: () => gmDiscardFromHand(id, card) },
                      ]}
                    />
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Crystallized -->
            {#if p.crystallized.length > 0}
              <div>
                <span class="text-[11px] text-amber-400 uppercase tracking-wide font-semibold">Cristallisées</span>
                <div class="flex flex-wrap gap-1.5 mt-1.5">
                  {#each p.crystallized as card (card.id)}
                    <CardDisplay {card} crystallized={true} />
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Tokens (GM can edit max + spend/add) -->
            <div>
              <span class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Tokens</span>
              <div class="mt-1.5">
                <TokenPanel
                  playerState={p}
                  isGM={true}
                  onSpendToken={(stat) => gmSpendToken(id, stat)}
                  onAddToken={(stat) => gmAddToken(id, stat)}
                  onSetMax={(stat, val) => setMaxToken(id, stat, val)}
                />
              </div>
            </div>

          </div>
        {/if}

      </div>
    {/each}

    {#if playerIds.length === 0}
      <p class="text-xs text-gray-600 italic">Aucun joueur enregistré.</p>
    {/if}
  </div>

</div>
