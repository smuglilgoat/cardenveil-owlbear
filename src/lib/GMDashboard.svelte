<script>
  import CardDisplay from './CardDisplay.svelte';
  import TokenPanel from './TokenPanel.svelte';
  import { createNormalDeck, createSpecializedDecks, createEmptyPlayer, shuffle, GM_CHAR_ID } from './deck.js';

  /** @type {{ gameState: object, party: object[], myId: string, onUpdate: (s: object) => void }} */
  let { gameState, party, myId, onUpdate } = $props();

  let dealTarget = $state('');
  let dealCount  = $state(1);
  let expandedPlayers = $state(new Set());

  // GM character convenience refs
  let gmChar           = $derived(gameState.gmCharacterId ? gameState.players[gameState.gmCharacterId] : null);
  let gmCharExchanges  = $derived((gameState.pendingExchanges ?? []).filter(e => e.to === GM_CHAR_ID));
  let gmCharOutgoing   = $derived((gameState.pendingExchanges ?? []).find(e => e.from === GM_CHAR_ID) ?? null);

  // All exchanges between regular players (neither side is the GM char)
  let allPlayerExchanges = $derived(
    (gameState.pendingExchanges ?? []).filter(e => e.from !== GM_CHAR_ID && e.to !== GM_CHAR_ID)
  );

  // GM char trade action state
  let gmAction          = $state(null); // 'pick-card' | 'pick-target' | 'accept'
  let gmActionCard      = $state(null);
  let gmAcceptExchange  = $state(null);

  // Player list: exclude the GM's own OBR ID and the GM character
  let playerIds = $derived(
    Object.keys(gameState.players).filter(id => id !== myId && id !== GM_CHAR_ID)
  );

  const SUITS_INFO = [
    { symbol: '♠', label: 'Piques',   isRed: false },
    { symbol: '♣', label: 'Trèfles',  isRed: false },
    { symbol: '♥', label: 'Cœurs',    isRed: true  },
    { symbol: '♦', label: 'Carreaux', isRed: true  },
  ];

  function getPlayerName(id) {
    if (id === GM_CHAR_ID) return gameState.players[GM_CHAR_ID]?.name ?? 'Personnage MJ';
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
    onUpdate({ ...gameState, normalDeck: createNormalDeck(), specializedDecks: createSpecializedDecks(), discard: [] });
  }

  function reshuffleSpecialized(suit) {
    onUpdate({
      ...gameState,
      specializedDecks: { ...gameState.specializedDecks, [suit]: shuffle([...gameState.specializedDecks[suit]]) },
    });
  }

  // ── Deal ─────────────────────────────────────────────────────────────
  function dealToPlayer() {
    if (!dealTarget || dealCount <= 0) return;
    const target = gameState.players[dealTarget];
    if (!target) return;
    const available = Math.min(dealCount, gameState.normalDeck.length);
    if (available === 0) return;
    const dealt = gameState.normalDeck.slice(0, available);
    const newDeck = gameState.normalDeck.slice(available);
    onUpdate({
      ...gameState,
      normalDeck: newDeck,
      players: { ...gameState.players, [dealTarget]: { ...target, hand: [...target.hand, ...dealt] } },
    });
  }

  function dealOneToAll() {
    let deck = [...gameState.normalDeck];
    const updatedPlayers = { ...gameState.players };
    for (const [id, p] of Object.entries(gameState.players)) {
      if (id === myId) continue; // skip GM's real entry (shouldn't exist but safety)
      if (p.hand.length < p.maxHandSize && deck.length > 0) {
        const [card, ...rest] = deck;
        deck = rest;
        updatedPlayers[id] = { ...p, hand: [...p.hand, card] };
      }
    }
    onUpdate({ ...gameState, normalDeck: deck, players: updatedPlayers });
  }

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
      players: { ...gameState.players, [playerId]: { ...p, maxHandSize: Math.max(0, Math.min(15, Number(val))) } },
    });
  }

  function setMaxToken(playerId, stat, val) {
    const p = gameState.players[playerId];
    if (!p) return;
    onUpdate({
      ...gameState,
      players: { ...gameState.players, [playerId]: { ...p, maxTokens: { ...p.maxTokens, [stat]: Math.max(0, Math.min(10, val)) } } },
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

  function gmDiscardCrystallized(playerId, card) {
    const p = gameState.players[playerId];
    onUpdate({
      ...gameState,
      discard: [...gameState.discard, card],
      players: { ...gameState.players, [playerId]: { ...p, crystallized: p.crystallized.filter(c => c.id !== card.id) } },
    });
  }

  function gmDrawForPlayer(playerId) {
    if (gameState.normalDeck.length === 0) return;
    const p = gameState.players[playerId];
    if (p.hand.length >= p.maxHandSize) return;
    const [card, ...rest] = gameState.normalDeck;
    onUpdate({
      ...gameState,
      normalDeck: rest,
      players: { ...gameState.players, [playerId]: { ...p, hand: [...p.hand, card] } },
    });
  }

  // ── GM Character ─────────────────────────────────────────────────────
  function createGMCharacter() {
    onUpdate({
      ...gameState,
      gmCharacterId: GM_CHAR_ID,
      players: { ...gameState.players, [GM_CHAR_ID]: createEmptyPlayer('Personnage MJ') },
    });
  }

  function removeGMCharacter() {
    if (!confirm('Supprimer le personnage MJ ? Sa main et ses tokens seront perdus.')) return;
    const players = { ...gameState.players };
    delete players[GM_CHAR_ID];
    // Cancel any pending exchanges involving GM character
    const pendingExchanges = (gameState.pendingExchanges ?? []).filter(
      e => e.from !== GM_CHAR_ID && e.to !== GM_CHAR_ID
    );
    onUpdate({ ...gameState, gmCharacterId: null, pendingExchanges, players });
  }

  // ── GM character trade ────────────────────────────────────────────────
  function gmCharStartSocial() {
    if (!gmChar || gmChar.tokens.social <= 0 || gmChar.hand.length === 0) return;
    gmAction = 'pick-card';
  }

  function gmCharPickCard(card) {
    gmActionCard = card;
    gmAction = 'pick-target';
  }

  function gmCharPickTarget(targetId) {
    const exchange = {
      id: `${GM_CHAR_ID}-${Date.now()}`,
      from: GM_CHAR_ID,
      fromCard: gmActionCard,
      to: targetId,
    };
    onUpdate({
      ...gameState,
      pendingExchanges: [...(gameState.pendingExchanges ?? []), exchange],
      players: {
        ...gameState.players,
        [GM_CHAR_ID]: {
          ...gmChar,
          tokens: { ...gmChar.tokens, social: gmChar.tokens.social - 1 },
          hand: gmChar.hand.filter(c => c.id !== gmActionCard.id),
        },
      },
    });
    cancelGmAction();
  }

  function gmCharStartAccept(exchange) {
    gmAcceptExchange = exchange;
    gmAction = 'accept';
  }

  function gmCharCompleteAccept(myCard) {
    const ex = gmAcceptExchange;
    const fromPlayer = gameState.players[ex.from];
    onUpdate({
      ...gameState,
      pendingExchanges: gameState.pendingExchanges.filter(e => e.id !== ex.id),
      players: {
        ...gameState.players,
        [ex.from]: { ...fromPlayer, hand: [...fromPlayer.hand, myCard] },
        [GM_CHAR_ID]: {
          ...gmChar,
          hand: [...gmChar.hand.filter(c => c.id !== myCard.id), ex.fromCard],
        },
      },
    });
    cancelGmAction();
  }

  function gmCharDecline(exchange) {
    const fromPlayer = gameState.players[exchange.from];
    onUpdate({
      ...gameState,
      pendingExchanges: gameState.pendingExchanges.filter(e => e.id !== exchange.id),
      players: {
        ...gameState.players,
        [exchange.from]: { ...fromPlayer, hand: [...fromPlayer.hand, exchange.fromCard] },
      },
    });
  }

  function cancelGmAction() {
    gmAction = null;
    gmActionCard = null;
    gmAcceptExchange = null;
  }

  // Hard reset — wipe everything back to a fresh game state
  function hardReset() {
    if (!confirm('⚠️ RÉINITIALISATION COMPLÈTE\n\nToutes les mains, tokens, échanges et pioches seront effacés pour tous les joueurs.\n\nContinuer ?')) return;
    if (!confirm('Dernière confirmation — cette action est irréversible. Tout effacer ?')) return;
    onUpdate(createInitialGameState());
  }

  // Cancel any exchange and return the offered card to the sender's hand
  function cancelExchange(exchange) {
    const sender = gameState.players[exchange.from];
    onUpdate({
      ...gameState,
      pendingExchanges: gameState.pendingExchanges.filter(e => e.id !== exchange.id),
      players: {
        ...gameState.players,
        [exchange.from]: { ...sender, hand: [...sender.hand, exchange.fromCard] },
      },
    });
  }
</script>

<div class="flex flex-col h-full overflow-y-auto p-3 gap-4">

  <!-- ── Pioche normale ─────────────────────────────────────────────── -->
  <div class="bg-gray-800 rounded-xl p-3 space-y-3">
    <h2 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Pioche Normale</h2>
    <div class="flex gap-4 text-xs text-gray-400">
      <span><span class="text-white font-bold text-sm">{gameState.normalDeck.length}</span> / 156</span>
      <span>Défausse : <span class="text-white font-bold">{gameState.discard.length}</span></span>
    </div>
    <div class="flex gap-2 flex-wrap">
      <button onclick={shuffleNormal} class="flex-1 text-xs py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg">Mélanger</button>
      <button onclick={reshuffleDiscard} disabled={gameState.discard.length === 0}
        class="flex-1 text-xs py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg disabled:opacity-40">
        Récupérer défausse
      </button>
    </div>
    <button onclick={resetAll} class="w-full text-xs py-1.5 bg-red-900 hover:bg-red-800 text-red-200 rounded-lg">
      Réinitialiser les deux pioches
    </button>
  </div>

  <!-- ── Pioches spécialisées ───────────────────────────────────────── -->
  <div class="bg-gray-800 rounded-xl p-3 space-y-2">
    <h2 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Pioche Spécialisée</h2>
    <div class="grid grid-cols-2 gap-2">
      {#each SUITS_INFO as s}
        {@const count = gameState.specializedDecks[s.symbol]?.length ?? 0}
        <div class="flex items-center justify-between px-2 py-1.5 rounded-lg border"
          class:border-red-800={s.isRed} class:bg-red-950={s.isRed}
          class:border-gray-700={!s.isRed} class:bg-gray-900={!s.isRed}
        >
          <span class="text-sm font-bold" class:text-red-400={s.isRed} class:text-gray-300={!s.isRed}>
            {s.symbol} {s.label}
          </span>
          <div class="flex items-center gap-1.5">
            <span class="text-xs text-gray-400">{count}/39</span>
            <button onclick={() => reshuffleSpecialized(s.symbol)}
              class="text-[10px] px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded">⟳</button>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- ── Repos + Deal to all ────────────────────────────────────────── -->
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

  <!-- ── Distribute ─────────────────────────────────────────────────── -->
  <div class="bg-gray-800 rounded-xl p-3 space-y-2">
    <h2 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Distribuer</h2>
    <div class="flex gap-2">
      <select bind:value={dealTarget}
        class="flex-1 text-xs bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-gray-200">
        <option value="">— Joueur —</option>
        {#each playerIds as id}
          <option value={id}>{getPlayerName(id)}</option>
        {/each}
        {#if gmChar}
          <option value={GM_CHAR_ID}>{getPlayerName(GM_CHAR_ID)}</option>
        {/if}
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

  <!-- ── GM Character panel ─────────────────────────────────────────── -->
  <div class="bg-gray-800 rounded-xl overflow-hidden">
    <div class="flex items-center justify-between px-3 py-2 border-b border-gray-700">
      <h2 class="text-xs font-semibold text-indigo-300 uppercase tracking-wide">Personnage MJ</h2>
      {#if !gmChar}
        <button onclick={createGMCharacter}
          class="text-xs px-2 py-1 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg">
          + Créer
        </button>
      {:else}
        <button onclick={removeGMCharacter}
          class="text-xs px-2 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded-lg">
          Supprimer
        </button>
      {/if}
    </div>

    {#if gmChar}
      <div class="px-3 py-3 space-y-3">

        <!-- Hand size + draw -->
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-400">Main max :</span>
          <input type="number" value={gmChar.maxHandSize} min="0" max="15"
            oninput={(e) => setHandSize(GM_CHAR_ID, e.currentTarget.value)}
            class="w-14 text-xs bg-gray-700 border border-gray-600 rounded text-center text-gray-200 py-0.5" />
          <button onclick={() => gmDrawForPlayer(GM_CHAR_ID)}
            disabled={gameState.normalDeck.length === 0 || gmChar.hand.length >= gmChar.maxHandSize}
            class="ml-auto text-xs px-2 py-1 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg disabled:opacity-40">
            Piocher ({gmChar.hand.length}/{gmChar.maxHandSize})
          </button>
        </div>

        <!-- Hand -->
        <div>
          <span class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Main</span>
          {#if gmChar.hand.length === 0}
            <p class="text-xs text-gray-600 italic mt-1">Vide</p>
          {:else}
            <div class="flex flex-wrap gap-1.5 mt-1.5">
              {#each gmChar.hand as card (card.id)}
                <CardDisplay {card} actions={[{ icon: '🗑', label: 'Défausser', onClick: () => gmDiscardFromHand(GM_CHAR_ID, card) }]} />
              {/each}
            </div>
          {/if}
        </div>

        <!-- Crystallized -->
        {#if gmChar.crystallized.length > 0}
          <div>
            <span class="text-[11px] text-amber-400 uppercase tracking-wide font-semibold">Cristallisées</span>
            <div class="flex flex-wrap gap-1.5 mt-1.5">
              {#each gmChar.crystallized as card (card.id)}
                <CardDisplay {card} crystallized={true}
                  actions={[{ icon: '▶', label: 'Jouer / Défausser', onClick: () => gmDiscardCrystallized(GM_CHAR_ID, card) }]} />
              {/each}
            </div>
          </div>
        {/if}

        <!-- Tokens -->
        <div>
          <span class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Tokens</span>
          <div class="mt-1.5">
            <TokenPanel playerState={gmChar} isGM={true}
              onSpendToken={(stat) => gmSpendToken(GM_CHAR_ID, stat)}
              onAddToken={(stat) => gmAddToken(GM_CHAR_ID, stat)}
              onSetMax={(stat, val) => setMaxToken(GM_CHAR_ID, stat, val)} />
          </div>
        </div>

        <!-- ── Trade interface ──────────────────────────────────────── -->
        <div class="border-t border-gray-700 pt-3 space-y-2">
          <span class="text-[11px] text-yellow-400 uppercase tracking-wide font-semibold">Échanges</span>

          <!-- Outgoing exchange indicator -->
          {#if gmCharOutgoing}
            <div class="text-xs text-indigo-300 bg-indigo-900/30 border border-indigo-700 rounded-lg px-2 py-1.5">
              Échange en attente avec <span class="text-white">{getPlayerName(gmCharOutgoing.to)}</span>
              <span class="text-gray-500 ml-1">({gmCharOutgoing.fromCard.value}{gmCharOutgoing.fromCard.suit})</span>
            </div>
          {/if}

          <!-- Incoming exchanges -->
          {#each gmCharExchanges as ex (ex.id)}
            <div class="bg-yellow-900/30 border border-yellow-700 rounded-lg p-2 space-y-2">
              <p class="text-xs text-yellow-300">
                Échange de <span class="text-white">{getPlayerName(ex.from)}</span>
              </p>
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400">Offre :</span>
                <CardDisplay card={ex.fromCard} />
              </div>
              {#if gmAction === 'accept' && gmAcceptExchange?.id === ex.id}
                <p class="text-xs text-yellow-200">Choisissez la carte à donner :</p>
                <div class="flex flex-wrap gap-1.5">
                  {#each gmChar.hand as card (card.id)}
                    <CardDisplay {card} actions={[{ icon: '↗', label: 'Donner en échange', onClick: () => gmCharCompleteAccept(card) }]} />
                  {/each}
                </div>
                <button onclick={cancelGmAction} class="text-xs text-gray-500 hover:text-gray-300 underline">Annuler</button>
              {:else}
                <div class="flex gap-2">
                  <button onclick={() => gmCharStartAccept(ex)}
                    class="flex-1 text-xs py-1 bg-green-700 hover:bg-green-600 text-white rounded-lg">Accepter</button>
                  <button onclick={() => gmCharDecline(ex)}
                    class="flex-1 text-xs py-1 bg-red-800 hover:bg-red-700 text-red-200 rounded-lg">Refuser</button>
                </div>
              {/if}
            </div>
          {/each}

          <!-- Initiate exchange (Social token) -->
          {#if gmAction === 'pick-card'}
            <div class="bg-indigo-900/40 border border-indigo-700 rounded-lg p-2 space-y-2">
              <p class="text-xs text-indigo-200 font-semibold">Choisissez la carte à offrir :</p>
              <div class="flex flex-wrap gap-1.5">
                {#each gmChar.hand as card (card.id)}
                  <CardDisplay {card} actions={[{ icon: '↗', label: 'Offrir', onClick: () => gmCharPickCard(card) }]} />
                {/each}
              </div>
              <button onclick={cancelGmAction} class="text-xs text-gray-500 hover:text-gray-300 underline">Annuler</button>
            </div>
          {:else if gmAction === 'pick-target'}
            <div class="bg-indigo-900/40 border border-indigo-700 rounded-lg p-2 space-y-2">
              <p class="text-xs text-indigo-200 font-semibold">
                Offre <span class="text-white">{gmActionCard.value}{gmActionCard.suit}</span> à :
              </p>
              {#each playerIds as id}
                <button onclick={() => gmCharPickTarget(id)}
                  class="w-full text-left text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg">
                  {getPlayerName(id)}
                </button>
              {/each}
              <button onclick={cancelGmAction} class="text-xs text-gray-500 hover:text-gray-300 underline">Annuler</button>
            </div>
          {:else if !gmCharOutgoing}
            <button
              onclick={gmCharStartSocial}
              disabled={!gmChar || gmChar.tokens.social <= 0 || gmChar.hand.length === 0}
              class="w-full text-xs py-1.5 bg-yellow-800 hover:bg-yellow-700 text-yellow-100 rounded-lg disabled:opacity-40">
              Initier un échange (token Social)
            </button>
          {/if}
        </div>

      </div>
    {:else}
      <p class="text-xs text-gray-600 italic px-3 py-2">
        Aucun personnage MJ. Créez-en un si vous voulez jouer un rôle actif dans les échanges.
      </p>
    {/if}
  </div>

  <!-- ── Échanges en cours ─────────────────────────────────────────── -->
  {#if allPlayerExchanges.length > 0}
    <div class="bg-gray-800 rounded-xl overflow-hidden">
      <div class="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <h2 class="text-xs font-semibold text-yellow-400 uppercase tracking-wide">
          Échanges en cours ({allPlayerExchanges.length})
        </h2>
      </div>
      <div class="px-3 py-2 space-y-2">
        {#each allPlayerExchanges as ex (ex.id)}
          <div class="flex items-center gap-2 py-1">
            <!-- Offered card -->
            <CardDisplay card={ex.fromCard} />
            <!-- Arrow + names -->
            <div class="flex-1 min-w-0 text-xs">
              <span class="text-white font-medium">{getPlayerName(ex.from)}</span>
              <span class="text-gray-500 mx-1">→</span>
              <span class="text-white font-medium">{getPlayerName(ex.to)}</span>
              <div class="text-gray-500 text-[10px]">en attente de réponse</div>
            </div>
            <!-- Cancel -->
            <button
              onclick={() => cancelExchange(ex)}
              title="Annuler l'échange"
              class="shrink-0 text-xs px-2 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded-lg"
            >✕</button>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- ── Players ────────────────────────────────────────────────────── -->
  <div class="space-y-2">
    <h2 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Joueurs</h2>

    {#each playerIds as id (id)}
      {@const p = gameState.players[id]}
      {@const expanded = expandedPlayers.has(id)}
      <div class="bg-gray-800 rounded-xl overflow-hidden">

        <button onclick={() => toggleExpand(id)}
          class="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-700 transition-colors text-left">
          <span class="text-sm text-white font-medium">{getPlayerName(id)}</span>
          <div class="flex items-center gap-3 text-xs text-gray-400">
            <span>Main : <span class="text-white">{p.hand.length}/{p.maxHandSize}</span></span>
            <span class="text-amber-400">✦ {p.crystallized.length}</span>
            <span>{expanded ? '▲' : '▼'}</span>
          </div>
        </button>

        {#if expanded}
          <div class="border-t border-gray-700 px-3 py-3 space-y-3">

            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-400 shrink-0">Taille de main max :</span>
              <input type="number" value={p.maxHandSize} min="0" max="15"
                oninput={(e) => setHandSize(id, e.currentTarget.value)}
                class="w-14 text-xs bg-gray-700 border border-gray-600 rounded text-center text-gray-200 py-0.5" />
            </div>

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

            <div>
              <span class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Tokens</span>
              <div class="mt-1.5">
                <TokenPanel playerState={p} isGM={true}
                  onSpendToken={(stat) => gmSpendToken(id, stat)}
                  onAddToken={(stat) => gmAddToken(id, stat)}
                  onSetMax={(stat, val) => setMaxToken(id, stat, val)} />
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

  <!-- ── Hard reset ─────────────────────────────────────────────────── -->
  <div class="border-t border-gray-700 pt-4">
    <button
      onclick={hardReset}
      class="w-full py-2 text-xs font-bold bg-transparent border border-red-800 text-red-600 hover:bg-red-950 hover:text-red-400 hover:border-red-600 rounded-lg transition-colors"
    >
      ⚠ Réinitialisation complète
    </button>
  </div>

</div>
