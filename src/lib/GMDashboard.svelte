<script>
  import CardDisplay from './CardDisplay.svelte';
  import TokenPanel from './TokenPanel.svelte';
  import { createNormalDeck, createSpecializedDecks, createEmptyPlayer, shuffle } from './deck.js';

  /** @type {{ gameState: object, party: object[], myId: string, onUpdate: (s: object) => void }} */
  let { gameState, party, myId, onUpdate } = $props();

  let dealTarget = $state('');
  let dealCount  = $state(1);
  let expandedPlayers = $state(new Set());

  let playerIds = $derived(Object.keys(gameState.players));

  const SUITS_INFO = [
    { symbol: '♠', label: 'Piques',   isRed: false },
    { symbol: '♣', label: 'Trèfles',  isRed: false },
    { symbol: '♥', label: 'Cœurs',    isRed: true  },
    { symbol: '♦', label: 'Carreaux', isRed: true  },
  ];

  function getPlayerName(id) {
    return party.find(p => p.id === id)?.name ?? gameState.players[id]?.name ?? id.slice(0, 8);
  }

  function toggleExpand(id) {
    const s = new Set(expandedPlayers);
    s.has(id) ? s.delete(id) : s.add(id);
    expandedPlayers = s;
  }

  // ── Deck management ──────────────────────────────────────────────────
  function shuffleNormal() {
    onUpdate({ ...gameState, normalDeck: shuffle(gameState.normalDeck) });
  }

  function reshuffleDiscard() {
    onUpdate({
      ...gameState,
      normalDeck: shuffle([...gameState.normalDeck, ...gameState.discard]),
      discard: [],
    });
  }

  function resetAll() {
    if (!confirm('Réinitialiser les deux pioches ? Les mains actuelles ne seront pas affectées.')) return;
    onUpdate({
      ...gameState,
      normalDeck: createNormalDeck(),
      specializedDecks: createSpecializedDecks(),
      discard: [],
    });
  }

  function reshuffleSpecialized(suit) {
    onUpdate({
      ...gameState,
      specializedDecks: {
        ...gameState.specializedDecks,
        [suit]: shuffle([...gameState.specializedDecks[suit]]),
      },
    });
  }

  // ── Deal ─────────────────────────────────────────────────────────────
  function dealToPlayer() {
    if (!dealTarget || dealCount <= 0) return;
    const target = gameState.players[dealTarget];
    if (!target) return;

    const available = Math.min(dealCount, gameState.normalDeck.length);
    if (available === 0) return;

    const dealt   = gameState.normalDeck.slice(0, available);
    const newDeck = gameState.normalDeck.slice(available);

    onUpdate({
      ...gameState,
      normalDeck: newDeck,
      players: {
        ...gameState.players,
        [dealTarget]: { ...target, hand: [...target.hand, ...dealt] },
      },
    });
  }

  /** Deal 1 card from normal deck to each player whose hand is below maxHandSize */
  function dealOneToAll() {
    let deck = [...gameState.normalDeck];
    const updatedPlayers = { ...gameState.players };

    for (const [id, p] of Object.entries(gameState.players)) {
      if (p.hand.length < p.maxHandSize && deck.length > 0) {
        const [card, ...rest] = deck;
        deck = rest;
        updatedPlayers[id] = { ...p, hand: [...p.hand, card] };
      }
    }

    onUpdate({ ...gameState, normalDeck: deck, players: updatedPlayers });
  }

  /** Give one crystallized card (drawn from normal deck) to a player */
  function giveCrystallized(toId) {
    if (gameState.normalDeck.length === 0) return;
    const [card, ...rest] = gameState.normalDeck;
    const p = gameState.players[toId];
    onUpdate({
      ...gameState,
      normalDeck: rest,
      players: { ...gameState.players, [toId]: { ...p, crystallized: [...p.crystallized, card] } },
    });
  }

  // ── Rest ─────────────────────────────────────────────────────────────
  function restAll() {
    const updated = {};
    for (const [id, p] of Object.entries(gameState.players)) {
      updated[id] = { ...p, tokens: { ...p.maxTokens } };
    }
    onUpdate({ ...gameState, players: updated });
  }

  // ── Per-player GM controls ───────────────────────────────────────────
  function setHandSize(playerId, val) {
    const p = gameState.players[playerId];
    if (!p) return;
    onUpdate({
      ...gameState,
      players: {
        ...gameState.players,
        [playerId]: { ...p, maxHandSize: Math.max(0, Math.min(15, Number(val))) },
      },
    });
  }

  function setMaxToken(playerId, stat, val) {
    const p = gameState.players[playerId];
    if (!p) return;
    onUpdate({
      ...gameState,
      players: {
        ...gameState.players,
        [playerId]: { ...p, maxTokens: { ...p.maxTokens, [stat]: Math.max(0, Math.min(10, val)) } },
      },
    });
  }

  function gmSpendToken(playerId, stat) {
    const p = gameState.players[playerId];
    if (!p || p.tokens[stat] <= 0) return;
    onUpdate({
      ...gameState,
      players: { ...gameState.players, [playerId]: { ...p, tokens: { ...p.tokens, [stat]: p.tokens[stat] - 1 } } },
    });
  }

  function gmAddToken(playerId, stat) {
    const p = gameState.players[playerId];
    if (!p || p.tokens[stat] >= p.maxTokens[stat]) return;
    onUpdate({
      ...gameState,
      players: { ...gameState.players, [playerId]: { ...p, tokens: { ...p.tokens, [stat]: p.tokens[stat] + 1 } } },
    });
  }

  function gmDiscardFromHand(playerId, card) {
    const p = gameState.players[playerId];
    onUpdate({
      ...gameState,
      discard: [...gameState.discard, card],
      players: { ...gameState.players, [playerId]: { ...p, hand: p.hand.filter(c => c.id !== card.id) } },
    });
  }
</script>

<div class="flex flex-col h-full overflow-y-auto p-3 gap-4">

  <!-- ── Pioche normale ──────────────────────────────────────────── -->
  <div class="bg-gray-800 rounded-xl p-3 space-y-3">
    <h2 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Pioche Normale</h2>
    <div class="flex gap-4 text-xs text-gray-400">
      <span><span class="text-white font-bold text-sm">{gameState.normalDeck.length}</span> / 156</span>
      <span>Défausse : <span class="text-white font-bold">{gameState.discard.length}</span></span>
    </div>
    <div class="flex gap-2 flex-wrap">
      <button onclick={shuffleNormal} class="flex-1 text-xs py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg">
        Mélanger
      </button>
      <button onclick={reshuffleDiscard} disabled={gameState.discard.length === 0}
        class="flex-1 text-xs py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg disabled:opacity-40">
        Récupérer défausse
      </button>
    </div>
    <button onclick={resetAll} class="w-full text-xs py-1.5 bg-red-900 hover:bg-red-800 text-red-200 rounded-lg">
      Réinitialiser les deux pioches
    </button>
  </div>

  <!-- ── Pioches spécialisées ────────────────────────────────────── -->
  <div class="bg-gray-800 rounded-xl p-3 space-y-2">
    <h2 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Pioche Spécialisée</h2>
    <div class="grid grid-cols-2 gap-2">
      {#each SUITS_INFO as s}
        {@const count = gameState.specializedDecks[s.symbol]?.length ?? 0}
        <div class="flex items-center justify-between px-2 py-1.5 rounded-lg border"
          class:border-red-800={s.isRed} class:bg-red-950={s.isRed}
          class:border-gray-700={!s.isRed} class:bg-gray-750={!s.isRed}
        >
          <span class="text-sm font-bold" class:text-red-400={s.isRed} class:text-gray-300={!s.isRed}>
            {s.symbol} {s.label}
          </span>
          <div class="flex items-center gap-1.5">
            <span class="text-xs text-gray-400">{count}/39</span>
            <button onclick={() => reshuffleSpecialized(s.symbol)}
              class="text-[10px] px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded">
              ⟳
            </button>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- ── Repos + Deal to all ─────────────────────────────────────── -->
  <div class="flex gap-2">
    <button onclick={dealOneToAll} disabled={gameState.normalDeck.length === 0}
      class="flex-1 text-xs py-2 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg disabled:opacity-40 font-semibold">
      Distribuer 1 à tous
    </button>
    <button onclick={restAll}
      class="flex-1 text-xs py-2 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 rounded-lg font-semibold">
      Repos (reset tokens)
    </button>
  </div>

  <!-- ── Distribute ──────────────────────────────────────────────── -->
  <div class="bg-gray-800 rounded-xl p-3 space-y-2">
    <h2 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Distribuer</h2>
    <div class="flex gap-2">
      <select bind:value={dealTarget}
        class="flex-1 text-xs bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-gray-200">
        <option value="">— Joueur —</option>
        {#each playerIds as id}
          <option value={id}>{getPlayerName(id)}</option>
        {/each}
      </select>
      <input type="number" bind:value={dealCount} min="1" max="10"
        class="w-12 text-xs bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-center text-gray-200" />
      <button onclick={dealToPlayer} disabled={!dealTarget || gameState.normalDeck.length === 0}
        class="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-40 shrink-0">
        Donner
      </button>
    </div>
    {#if dealTarget}
      <button onclick={() => giveCrystallized(dealTarget)} disabled={gameState.normalDeck.length === 0}
        class="w-full text-xs py-1.5 bg-amber-700 hover:bg-amber-600 text-amber-100 rounded-lg disabled:opacity-40">
        ✦ Donner 1 carte cristallisée à {getPlayerName(dealTarget)}
      </button>
    {/if}
  </div>

  <!-- ── Players ─────────────────────────────────────────────────── -->
  <div class="space-y-2">
    <h2 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Joueurs</h2>

    {#each playerIds as id (id)}
      {@const p = gameState.players[id]}
      {@const expanded = expandedPlayers.has(id)}
      <div class="bg-gray-800 rounded-xl overflow-hidden">

        <!-- Header row -->
        <button onclick={() => toggleExpand(id)}
          class="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-700 transition-colors text-left">
          <div class="flex items-center gap-2">
            <span class="text-sm text-white font-medium">{getPlayerName(id)}</span>
            {#if id === myId}
              <span class="text-[9px] bg-indigo-900 text-indigo-400 px-1 rounded">MJ</span>
            {/if}
          </div>
          <div class="flex items-center gap-3 text-xs text-gray-400">
            <span>Main : <span class="text-white">{p.hand.length}/{p.maxHandSize}</span></span>
            <span class="text-amber-400">✦ {p.crystallized.length}</span>
            <span>{expanded ? '▲' : '▼'}</span>
          </div>
        </button>

        {#if expanded}
          <div class="border-t border-gray-700 px-3 py-3 space-y-3">

            <!-- Hand size control -->
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-400 shrink-0">Taille de main max :</span>
              <input type="number" value={p.maxHandSize} min="0" max="15"
                oninput={(e) => setHandSize(id, e.currentTarget.value)}
                class="w-14 text-xs bg-gray-700 border border-gray-600 rounded text-center text-gray-200 py-0.5" />
            </div>

            <!-- Hand -->
            <div>
              <span class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">
                Main ({p.hand.length}/{p.maxHandSize})
              </span>
              {#if p.hand.length === 0}
                <p class="text-xs text-gray-600 italic mt-1">Vide</p>
              {:else}
                <div class="flex flex-wrap gap-1.5 mt-1.5">
                  {#each p.hand as card (card.id)}
                    <CardDisplay {card} actions={[{ icon: '🗑', label: 'Défausser', onClick: () => gmDiscardFromHand(id, card) }]} />
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

            <!-- Tokens -->
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
