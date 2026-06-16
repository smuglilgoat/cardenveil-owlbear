<script>
  import CardDisplay from "./CardDisplay.svelte";
  import TokenPanel from "./TokenPanel.svelte";
  import ActionLog from "./ActionLog.svelte";
  import {
    dehydrateState,
    hydrateState,
    fullDeck,
    fullSuit,
    GM_CHAR_ID,
    sortCards,
    FATIGUE_PENALTY,
  } from "./deck.js";

  let { gameState, party, myId, onAction } = $props();

  let anyPlayerFull = $derived(
    Object.entries(gameState.players).some(
      ([id, p]) => id !== myId && p.hand.length >= p.maxHandSize
    )
  );

  let dealTarget = $state("");
  let dealCount = $state(1);
  let giveType = $state('normal');
  let giveMode = $state('random');
  /** @type {{key: string, suit: string, value: string}[]} */
  let selectedCards = $state([]);
  let expandedPlayers = $state(new Set());

  // Hard reset two-step state: 0 = idle, 1 = first confirm, 2 = second confirm
  let resetStep = $state(0);

  // GM character convenience refs
  let gmChar = $derived(
    gameState.gmCharacterId ? gameState.players[gameState.gmCharacterId] : null,
  );
  let gmCharHand = $derived(gmChar ? sortCards(gmChar.hand) : []);
  let gmCharCrystallized = $derived(gmChar ? sortCards(gmChar.crystallized) : []);
  let gmCharExchanges = $derived(
    (gameState.pendingExchanges ?? []).filter((e) => e.to === GM_CHAR_ID),
  );
  let gmCharOutgoing = $derived(
    (gameState.pendingExchanges ?? []).find((e) => e.from === GM_CHAR_ID) ??
      null,
  );

  // All exchanges between regular players (neither side is the GM char)
  let allPlayerExchanges = $derived(
    (gameState.pendingExchanges ?? []).filter(
      (e) => e.from !== GM_CHAR_ID && e.to !== GM_CHAR_ID,
    ),
  );

  // GM char trade action state
  let gmAction = $state(null); // 'pick-card' | 'pick-target' | 'accept'
  let gmActionCard = $state(null);
  let gmAcceptExchange = $state(null);

  // Swap state
  // step 0 = idle
  // step 1 = picking source deck (normal | suit symbol)
  // step 2 = picking specific card from chosen source
  let swapTarget = $state(null); // { playerId, card }
  let swapSource = $state(null); // 'normal' | '♠' | '♣' | '♥' | '♦'
  let swapStep = $state(0);

  // Crystallized card picker
  let crystalPickOpen = $state(false);

  // Player list: exclude the GM's own OBR ID and the GM character
  let partyIds = $derived(new Set(party.map((/** @type {any} */ p) => p.id)));

  let playerIds = $derived(
    Object.keys(gameState.players).filter(
      (id) => id !== myId && id !== GM_CHAR_ID && partyIds.has(id),
    ),
  );

  const DRAW_VALUES = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

  const SUITS_INFO = [
    { symbol: "♠", label: "Piques", isRed: false },
    { symbol: "♣", label: "Trèfles", isRed: false },
    { symbol: "♥", label: "Cœurs", isRed: true },
    { symbol: "♦", label: "Carreaux", isRed: true },
  ];

  function getPlayerName(id) {
    if (id === GM_CHAR_ID)
      return gameState.players[GM_CHAR_ID]?.name ?? "Personnage MJ";
    return (
      party.find((p) => p.id === id)?.name ??
      gameState.players[id]?.name ??
      id.slice(0, 8)
    );
  }

  function toggleExpand(id) {
    const s = new Set(expandedPlayers);
    s.has(id) ? s.delete(id) : s.add(id);
    expandedPlayers = s;
  }

  // ── Deal ─────────────────────────────────────────────────────────────
  function giveRandomCards() {
    if (!dealTarget || dealCount <= 0) return;
    onAction({ type: 'GIVE_CARDS', playerId: myId, targetId: dealTarget, crystal: giveType === 'crystal', mode: 'random', count: dealCount });
  }

  function dealOneToAll() {
    onAction({ type: 'DEAL_ALL', playerId: myId });
  }

  function toggleSpecificCard(card) {
    const key = card.suit + '-' + card.value;
    const exists = selectedCards.find(c => c.key === key);
    if (exists) {
      selectedCards = selectedCards.filter(c => c.key !== key);
    } else {
      selectedCards = [...selectedCards, { key, suit: card.suit, value: card.value }];
    }
  }

  function giveSelectedCards() {
    if (!dealTarget || selectedCards.length === 0) return;
    onAction({ type: 'GIVE_CARDS', playerId: myId, targetId: dealTarget, crystal: giveType === 'crystal', mode: 'specific', cards: selectedCards.map(c => ({ suit: c.suit, value: c.value })) });
    selectedCards = [];
  }

  // ── Rest ─────────────────────────────────────────────────────────────
  function restAll() {
    onAction({ type: 'REST_ALL', playerId: myId });
  }

  // ── Per-player GM controls ───────────────────────────────────────────
  function setHandSize(playerId, val) {
    onAction({ type: 'SET_MAX_HAND', playerId: myId, targetId: playerId, val });
  }

  function setDrawRange(playerId, field, val) {
    onAction({ type: 'SET_DRAW_RANGE', playerId: myId, targetId: playerId, field, val });
  }

  function setFatigue(playerId, level) {
    onAction({ type: 'SET_FATIGUE', playerId: myId, targetId: playerId, level });
  }

  function setMaxToken(playerId, stat, val) {
    onAction({ type: 'SET_MAX_TOKENS', playerId: myId, targetId: playerId, token: stat, val });
  }

  function gmSpendToken(playerId, stat) {
    onAction({ type: 'SPEND_TOKEN', playerId: playerId, token: stat });
  }

  function gmAddToken(playerId, stat) {
    onAction({ type: 'ADD_TOKEN', playerId: myId, targetId: playerId, token: stat });
  }

  // ── Swap ─────────────────────────────────────────────────────────────
  function startSwap(playerId, card) {
    swapTarget = { playerId, card };
    swapSource = null;
    swapStep = 1;
  }

  function cancelSwap() {
    swapTarget = null;
    swapSource = null;
    swapStep = 0;
  }

  function pickSwapSource(src) {
    swapSource = src;
    swapStep = 2;
  }

  function swapPickCard(pickedCard) {
    const { playerId, card: oldCard } = swapTarget;
    onAction({ type: 'SWAP_CARD', playerId: myId, targetId: playerId, oldCardId: oldCard.id, source: swapSource, suit: pickedCard.suit, value: pickedCard.value });
    cancelSwap();
  }

  function gmDiscardFromHand(playerId, card) {
    onAction({ type: 'DISCARD', playerId: playerId, cardId: card.id, from: 'hand' });
  }

  function gmDiscardCrystallized(playerId, card) {
    onAction({ type: 'DISCARD', playerId: playerId, cardId: card.id, from: 'crystallized' });
  }

  function gmDrawForPlayer(playerId) {
    onAction({ type: 'DRAW', playerId: playerId });
  }

  // ── GM Character ─────────────────────────────────────────────────────
  function createGMCharacter() {
    onAction({ type: 'CREATE_GM_CHAR', playerId: myId });
  }

  function removeGMCharacter() {
    onAction({ type: 'REMOVE_GM_CHAR', playerId: myId });
  }

  // ── GM character trade ────────────────────────────────────────────────
  function gmCharStartSocial() {
    if (!gmChar || gmChar.tokens.social <= 0 || gmChar.hand.length === 0)
      return;
    gmAction = "pick-card";
  }

  function gmCharPickCard(card) {
    gmActionCard = card;
    gmAction = "pick-target";
  }

  function gmCharPickTarget(targetId) {
    onAction({ type: 'PROPOSE_EXCHANGE', playerId: GM_CHAR_ID, cardId: gmActionCard.id, targetId });
    cancelGmAction();
  }

  function gmCharStartAccept(exchange) {
    gmAcceptExchange = exchange;
    gmAction = "accept";
  }

  function gmCharCompleteAccept(myCard) {
    const ex = gmAcceptExchange;
    onAction({ type: 'ACCEPT_EXCHANGE', playerId: GM_CHAR_ID, exchangeId: ex.id, cardId: myCard.id });
    cancelGmAction();
  }

  function gmCharDecline(exchange) {
    onAction({ type: 'DECLINE_EXCHANGE', playerId: GM_CHAR_ID, exchangeId: exchange.id });
  }

  function cancelGmAction() {
    gmAction = null;
    gmActionCard = null;
    gmAcceptExchange = null;
  }

  // ── Import / Export ───────────────────────────────────────────────────────
  function exportState() {
    const plain = $state.snapshot(gameState);
    const dehydrated = dehydrateState(plain);
    const blob = new Blob([JSON.stringify(dehydrated, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cardenveil-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importState(e) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = JSON.parse(ev.target.result);
        const importedState = hydrateState(raw);
        onAction({ type: 'IMPORT_STATE', playerId: myId, state: importedState });
      } catch (err) {
        console.error("Import failed:", err);
      }
    };
    reader.readAsText(file);
    e.currentTarget.value = "";
  }

  // Hard reset — wipe everything back to a fresh game state (in-UI two-step)
  function hardReset() {
    if (resetStep === 0) {
      resetStep = 1;
      return;
    }
    if (resetStep === 1) {
      resetStep = 2;
      return;
    }
    resetStep = 0;
    onAction({ type: 'HARD_RESET', playerId: myId });
  }

  function cancelReset() {
    resetStep = 0;
  }

  // Cancel any exchange and return the offered card to the sender's hand
  function cancelExchange(exchange) {
    onAction({ type: 'CANCEL_EXCHANGE', playerId: myId, exchangeId: exchange.id });
  }
</script>

<div class="flex flex-col h-full overflow-y-auto p-3 gap-4">
  <!-- ── Défausse ──────────────────────────────────────────────────── -->
  <div class="flex gap-4 text-xs text-gray-400 px-1">
    <span
      >Défausse : <span class="text-white font-bold"
        >{gameState.discard.length}</span
      ></span
    >
    <span class="text-gray-600 italic"
      >Pioches infinies (52 cartes standard)</span
    >
  </div>

  <!-- ── Repos + Deal to all ────────────────────────────────────────── -->
  <div class="flex gap-2">
    <button
      onclick={dealOneToAll}
      disabled={anyPlayerFull}
      class="flex-1 text-xs py-2 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
    >
      Distribuer 1 à tous
    </button>
    <button
      onclick={restAll}
      class="flex-1 text-xs py-2 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 rounded-lg font-semibold"
    >
      Repos (reset tokens)
    </button>
  </div>
  {#if anyPlayerFull}
    <p class="text-xs text-amber-400 text-center">Un joueur a la main pleine</p>
  {/if}

  <!-- ── Distribute ─────────────────────────────────────────────────── -->
  <div class="bg-gray-800 rounded-xl p-3 space-y-2">
    <h2 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">
      Distribuer
    </h2>
    <select
      bind:value={dealTarget}
      class="w-full text-xs bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-gray-200"
    >
      <option value="">— Joueur —</option>
      {#each playerIds as id}
        <option value={id}>{getPlayerName(id)}</option>
      {/each}
      {#if gmChar}
        <option value={GM_CHAR_ID}>{getPlayerName(GM_CHAR_ID)}</option>
      {/if}
    </select>

    {#if dealTarget}
      <div class="flex gap-1">
        <button
          onclick={() => { giveType = 'normal'; selectedCards = []; }}
          class="flex-1 text-xs py-1.5 rounded-lg font-semibold transition-colors"
          class:bg-indigo-600={giveType === 'normal'} class:text-white={giveType === 'normal'}
          class:bg-gray-700={giveType !== 'normal'} class:text-gray-400={giveType !== 'normal'} class:hover:bg-gray-600={giveType !== 'normal'}
        >
          Normale
        </button>
        <button
          onclick={() => { giveType = 'crystal'; selectedCards = []; }}
          class="flex-1 text-xs py-1.5 rounded-lg font-semibold transition-colors"
          class:bg-red-700={giveType === 'crystal'} class:text-white={giveType === 'crystal'}
          class:bg-gray-700={giveType !== 'crystal'} class:text-gray-400={giveType !== 'crystal'} class:hover:bg-gray-600={giveType !== 'crystal'}
        >
          ✦ Cristallisée
        </button>
      </div>

      <div class="flex gap-1">
        <button
          onclick={() => { giveMode = 'random'; selectedCards = []; }}
          class="flex-1 text-xs py-1.5 rounded-lg font-semibold transition-colors"
          class:bg-gray-600={giveMode === 'random'} class:text-white={giveMode === 'random'}
          class:bg-gray-700={giveMode !== 'random'} class:text-gray-400={giveMode !== 'random'} class:hover:bg-gray-600={giveMode !== 'random'}
        >
          Aléatoire
        </button>
        <button
          onclick={() => { giveMode = 'specific'; selectedCards = []; }}
          class="flex-1 text-xs py-1.5 rounded-lg font-semibold transition-colors"
          class:bg-gray-600={giveMode === 'specific'} class:text-white={giveMode === 'specific'}
          class:bg-gray-700={giveMode !== 'specific'} class:text-gray-400={giveMode !== 'specific'} class:hover:bg-gray-600={giveMode !== 'specific'}
        >
          Spécifique
        </button>
      </div>

      {#if giveMode === 'random'}
        <div class="flex gap-2">
          <input
            type="number"
            bind:value={dealCount}
            min="1"
            max="10"
            class="w-12 text-xs bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-center text-gray-200"
          />
          <button
            onclick={giveRandomCards}
            class="flex-1 text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg"
          >
            Donner
          </button>
        </div>
      {:else}
        {#if selectedCards.length > 0}
          <div class="flex items-center justify-between bg-gray-900 rounded-lg px-2 py-1.5">
            <span class="text-xs text-gray-300">{selectedCards.length} carte(s) sélectionnée(s)</span>
            <button
              onclick={giveSelectedCards}
              class="text-xs px-3 py-1 rounded-lg font-semibold"
              class:bg-indigo-600={giveType === 'normal'} class:hover:bg-indigo-500={giveType === 'normal'}
              class:bg-red-700={giveType === 'crystal'} class:hover:bg-red-600={giveType === 'crystal'}
              class:text-white={giveType === 'normal' || giveType === 'crystal'}
            >
              Donner
            </button>
          </div>
        {/if}
        <div class="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg p-2">
          {#each fullDeck() as card (card.id)}
            {@const key = card.suit + '-' + card.value}
            {@const selected = selectedCards.some(c => c.key === key)}
            <button
              onclick={() => toggleSpecificCard(card)}
              class="relative rounded-lg transition-all"
              class:ring-2={selected}
              class:ring-indigo-400={selected && giveType === 'normal'}
              class:ring-red-400={selected && giveType === 'crystal'}
              class:opacity-50={!selected}
            >
              <CardDisplay {card} />
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  <!-- ── GM Character panel ─────────────────────────────────────────── -->
  <div class="bg-gray-800 rounded-xl">
    <div
      class="flex items-center justify-between px-3 py-2 border-b border-gray-700"
    >
      <h2 class="text-xs font-semibold text-indigo-300 uppercase tracking-wide">
        Personnage MJ
      </h2>
      {#if !gmChar}
        <button
          onclick={createGMCharacter}
          class="text-xs px-2 py-1 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg"
        >
          + Créer
        </button>
      {:else}
        <button
          onclick={removeGMCharacter}
          class="text-xs px-2 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded-lg"
        >
          Supprimer
        </button>
      {/if}
    </div>

    {#if gmChar}
      <div class="px-3 py-3 space-y-3">
        <!-- Hand size + draw -->
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-400">Main max :</span>
          <input
            type="number"
            value={gmChar.maxHandSize}
            min="0"
            max="15"
            oninput={(e) => setHandSize(GM_CHAR_ID, e.currentTarget.value)}
            class="w-14 text-xs bg-gray-700 border border-gray-600 rounded text-center text-gray-200 py-0.5"
          />
          <button
            onclick={() => gmDrawForPlayer(GM_CHAR_ID)}
            disabled={gmChar.hand.length >= gmChar.maxHandSize}
            class="ml-auto text-xs px-2 py-1 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg disabled:opacity-40"
          >
            Piocher ({gmChar.hand.length}/{gmChar.maxHandSize})
          </button>
        </div>

        <!-- Hand -->
        <div>
          <span
            class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold"
            >Main</span
          >
          {#if gmChar.hand.length === 0}
            <p class="text-xs text-gray-600 italic mt-1">Vide</p>
          {:else}
            <div class="flex flex-wrap gap-1.5 mt-1.5">
              {#each gmCharHand as card (card.id)}
                <CardDisplay
                  {card}
                  faceDown={!!card._pending}
                  fatiguePenalty={FATIGUE_PENALTY[gmChar.fatigue ?? 0]}
                  actions={card._pending ? [] : [
                    {
                      icon: "▶️",
                      label: "Défausser",
                      onClick: () => gmDiscardFromHand(GM_CHAR_ID, card),
                    },
                  ]}
                />
              {/each}
            </div>
          {/if}
        </div>

        <!-- Crystallized -->
        {#if gmChar.crystallized.length > 0}
          <div>
            <span
              class="text-[11px] text-red-400 uppercase tracking-wide font-semibold"
              >Cristallisées</span
            >
            <div class="flex flex-wrap gap-1.5 mt-1.5">
              {#each gmCharCrystallized as card (card.id)}
                <CardDisplay
                  {card}
                  crystallized={true}
                  actions={[
                    {
                      icon: "▶",
                      label: "Jouer / Défausser",
                      onClick: () => gmDiscardCrystallized(GM_CHAR_ID, card),
                    },
                  ]}
                />
              {/each}
            </div>
          </div>
        {/if}

        <!-- Tokens -->
        <div>
          <span
            class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold"
            >Tokens</span
          >
          <div class="mt-1.5">
            <TokenPanel
              playerState={gmChar}
              isGM={true}
              onSpendToken={(stat) => gmSpendToken(GM_CHAR_ID, stat)}
              onAddToken={(stat) => gmAddToken(GM_CHAR_ID, stat)}
              onSetMax={(stat, val) => setMaxToken(GM_CHAR_ID, stat, val)}
            />
          </div>
        </div>

        <!-- ── Trade interface ──────────────────────────────────────── -->
        <div class="border-t border-gray-700 pt-3 space-y-2">
          <span
            class="text-[11px] text-yellow-400 uppercase tracking-wide font-semibold"
            >Échanges</span
          >

          <!-- Outgoing exchange indicator -->
          {#if gmCharOutgoing}
            <div
              class="text-xs text-indigo-300 bg-indigo-900/30 border border-indigo-700 rounded-lg px-2 py-1.5"
            >
              Échange en attente avec <span class="text-white"
                >{getPlayerName(gmCharOutgoing.to)}</span
              >
              <span class="text-gray-500 ml-1"
                >({gmCharOutgoing.fromCard.value}{gmCharOutgoing.fromCard
                  .suit})</span
              >
            </div>
          {/if}

          <!-- Incoming exchanges -->
          {#each gmCharExchanges as ex (ex.id)}
            <div
              class="bg-yellow-900/30 border border-yellow-700 rounded-lg p-2 space-y-2"
            >
              <p class="text-xs text-yellow-300">
                Échange de <span class="text-white"
                  >{getPlayerName(ex.from)}</span
                >
              </p>
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400">Offre :</span>
                <CardDisplay card={ex.fromCard} />
              </div>
              {#if gmAction === "accept" && gmAcceptExchange?.id === ex.id}
                <p class="text-xs text-yellow-200">
                  Choisissez la carte à donner :
                </p>
                <div class="flex flex-wrap gap-1.5">
                  {#each gmCharHand as card (card.id)}
                    <CardDisplay
                      {card}
                      actions={[
                        {
                          icon: "↗",
                          label: "Donner en échange",
                          onClick: () => gmCharCompleteAccept(card),
                        },
                      ]}
                    />
                  {/each}
                </div>
                <button
                  onclick={cancelGmAction}
                  class="text-xs text-gray-500 hover:text-gray-300 underline"
                  >Annuler</button
                >
              {:else}
                <div class="flex gap-2">
                  <button
                    onclick={() => gmCharStartAccept(ex)}
                    class="flex-1 text-xs py-1 bg-green-700 hover:bg-green-600 text-white rounded-lg"
                    >Accepter</button
                  >
                  <button
                    onclick={() => gmCharDecline(ex)}
                    class="flex-1 text-xs py-1 bg-red-800 hover:bg-red-700 text-red-200 rounded-lg"
                    >Refuser</button
                  >
                </div>
              {/if}
            </div>
          {/each}

          <!-- Initiate exchange (Social token) -->
          {#if gmAction === "pick-card"}
            <div
              class="bg-indigo-900/40 border border-indigo-700 rounded-lg p-2 space-y-2"
            >
              <p class="text-xs text-indigo-200 font-semibold">
                Choisissez la carte à offrir :
              </p>
              <div class="flex flex-wrap gap-1.5">
                {#each gmCharHand as card (card.id)}
                  <CardDisplay
                    {card}
                    actions={[
                      {
                        icon: "↗",
                        label: "Offrir",
                        onClick: () => gmCharPickCard(card),
                      },
                    ]}
                  />
                {/each}
              </div>
              <button
                onclick={cancelGmAction}
                class="text-xs text-gray-500 hover:text-gray-300 underline"
                >Annuler</button
              >
            </div>
          {:else if gmAction === "pick-target"}
            <div
              class="bg-indigo-900/40 border border-indigo-700 rounded-lg p-2 space-y-2"
            >
              <p class="text-xs text-indigo-200 font-semibold">
                Offre <span class="text-white"
                  >{gmActionCard.value}{gmActionCard.suit}</span
                > à :
              </p>
              {#each playerIds as id}
                <button
                  onclick={() => gmCharPickTarget(id)}
                  class="w-full text-left text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                >
                  {getPlayerName(id)}
                </button>
              {/each}
              <button
                onclick={cancelGmAction}
                class="text-xs text-gray-500 hover:text-gray-300 underline"
                >Annuler</button
              >
            </div>
          {:else if !gmCharOutgoing}
            <button
              onclick={gmCharStartSocial}
              disabled={!gmChar ||
                gmChar.tokens.social <= 0 ||
                gmChar.hand.length === 0}
              class="w-full text-xs py-1.5 bg-yellow-800 hover:bg-yellow-700 text-yellow-100 rounded-lg disabled:opacity-40"
            >
              Initier un échange (token Social)
            </button>
          {/if}
        </div>
      </div>
    {:else}
      <p class="text-xs text-gray-600 italic px-3 py-2">
        Aucun personnage MJ. Créez-en un si vous voulez jouer un rôle actif dans
        les échanges.
      </p>
    {/if}
  </div>

  <!-- ── Échanges en cours ─────────────────────────────────────────── -->
  {#if allPlayerExchanges.length > 0}
    <div class="bg-gray-800 rounded-xl">
      <div
        class="flex items-center justify-between px-3 py-2 border-b border-gray-700"
      >
        <h2
          class="text-xs font-semibold text-yellow-400 uppercase tracking-wide"
        >
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
              <span class="text-white font-medium"
                >{getPlayerName(ex.from)}</span
              >
              <span class="text-gray-500 mx-1">→</span>
              <span class="text-white font-medium">{getPlayerName(ex.to)}</span>
              <div class="text-gray-500 text-[10px]">en attente de réponse</div>
            </div>
            <!-- Cancel -->
            <button
              onclick={() => cancelExchange(ex)}
              title="Annuler l'échange"
              class="shrink-0 text-xs px-2 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded-lg"
              >✕</button
            >
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- ── Players ────────────────────────────────────────────────────── -->
  <div class="space-y-2">
    <h2 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">
      Joueurs
    </h2>

    {#each playerIds as id (id)}
      {@const p = gameState.players[id]}
      {@const expanded = expandedPlayers.has(id)}
      <div class="bg-gray-800 rounded-xl">
        <button
          onclick={() => toggleExpand(id)}
          class="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-700 transition-colors text-left"
        >
          <span class="text-sm text-white font-medium">{getPlayerName(id)}</span
          >
          <div class="flex items-center gap-3 text-xs text-gray-400">
            <span
              >Main : <span class="text-white"
                >{p.hand.length}/{p.maxHandSize}</span
              ></span
            >
            <span class="text-red-400">✦ {p.crystallized.length}</span>
            <span>{expanded ? "▲" : "▼"}</span>
          </div>
        </button>

        {#if expanded}
          <div class="border-t border-gray-700 px-3 py-3 space-y-3">
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-400 shrink-0"
                >Taille de main max :</span
              >
              <input
                type="number"
                value={p.maxHandSize}
                min="0"
                max="15"
                oninput={(e) => setHandSize(id, e.currentTarget.value)}
                class="w-14 text-xs bg-gray-700 border border-gray-600 rounded text-center text-gray-200 py-0.5"
              />
            </div>

            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-400 shrink-0">Valeur piochable :</span>
              <select
                value={p.minDrawValue ?? 1}
                onchange={(e) => setDrawRange(id, 'minDrawValue', e.currentTarget.value)}
                class="text-xs bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-gray-200"
                title="Min"
              >
                {#each DRAW_VALUES as v, i}
                  <option value={i + 1}>{v}</option>
                {/each}
              </select>
              <span class="text-xs text-gray-500">–</span>
              <select
                value={p.maxDrawValue ?? 13}
                onchange={(e) => setDrawRange(id, 'maxDrawValue', e.currentTarget.value)}
                class="text-xs bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-gray-200"
                title="Max"
              >
                {#each DRAW_VALUES as v, i}
                  <option value={i + 1}>{v}</option>
                {/each}
              </select>
            </div>

            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-400 shrink-0">Fatigue :</span>
              <select
                value={p.fatigue ?? 0}
                onchange={(e) => setFatigue(id, e.currentTarget.value)}
                class="text-xs bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-gray-200"
              >
                <option value={0}>Aucune</option>
                <option value={1}>Niveau 1 (−1)</option>
                <option value={2}>Niveau 2 (−2)</option>
                <option value={3}>Niveau 3 (−4)</option>
                <option value={4}>Niveau 4 (−6)</option>
              </select>
            </div>

            <div>
              <span
                class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold"
              >
                Main ({p.hand.length}/{p.maxHandSize})
              </span>
              {#if p.hand.length === 0}
                <p class="text-xs text-gray-600 italic mt-1">Vide</p>
              {:else}
                <div class="flex flex-wrap gap-1.5 mt-1.5">
                  {#each sortCards(p.hand) as card (card.id)}
                    <CardDisplay
                      {card}
                      faceDown={!!card._pending}
                      fatiguePenalty={FATIGUE_PENALTY[p.fatigue ?? 0]}
                      actions={card._pending ? [] : [
                        {
                          icon: "▶️",
                          label: "Défausser",
                          onClick: () => gmDiscardFromHand(id, card),
                        },
                        {
                          icon: "⇄",
                          label: "Échanger",
                          onClick: () => startSwap(id, card),
                        },
                      ]}
                    />
                  {/each}
                </div>
              {/if}

              <!-- Swap picker -->
              {#if swapTarget?.playerId === id}
                <div
                  class="mt-2 bg-indigo-900/40 border border-indigo-700 rounded-lg p-2 space-y-2"
                >
                  <div class="flex items-center gap-2">
                    <p class="text-xs text-indigo-200 font-semibold flex-1">
                      {#if swapStep === 1}
                        Remplacer <span class="text-white"
                          >{swapTarget.card.value}{swapTarget.card.suit}</span
                        > — choisir la source :
                      {:else}
                        Choisir la carte de remplacement :
                      {/if}
                    </p>
                    <button
                      onclick={cancelSwap}
                      class="text-xs text-gray-500 hover:text-gray-300"
                      >✕</button
                    >
                  </div>

                  <!-- Step 1: pick source -->
                  {#if swapStep === 1}
                    <button
                      onclick={() => pickSwapSource("normal")}
                      class="w-full text-xs py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg"
                    >
                      Pioche normale
                    </button>
                    <div class="grid grid-cols-2 gap-1.5">
                      {#each SUITS_INFO as s}
                        <button
                          onclick={() => pickSwapSource(s.symbol)}
                          class="text-xs py-1.5 rounded-lg border font-semibold"
                          class:text-red-400={s.isRed}
                          class:border-red-800={s.isRed}
                          class:bg-red-950={s.isRed}
                          class:text-gray-300={!s.isRed}
                          class:border-gray-600={!s.isRed}
                          class:bg-gray-800={!s.isRed}
                        >
                          {s.symbol}
                          {s.label}
                        </button>
                      {/each}
                    </div>

                    <!-- Step 2: pick specific card -->
                  {:else if swapStep === 2}
                    {@const pile =
                      swapSource === "normal"
                        ? fullDeck()
                        : fullSuit(swapSource)}
                    <button
                      onclick={() => (swapStep = 1)}
                      class="text-xs text-gray-500 hover:text-gray-300 underline"
                      >← Retour</button
                    >
                    <div
                      class="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto"
                    >
                      {#each pile as card (card.id)}
                        <CardDisplay
                          {card}
                          actions={[
                            {
                              icon: "⇄",
                              label: "Utiliser cette carte",
                              onClick: () => swapPickCard(card),
                            },
                          ]}
                        />
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>

            {#if p.crystallized.length > 0}
              <div>
                <span
                  class="text-[11px] text-red-400 uppercase tracking-wide font-semibold"
                  >Cristallisées</span
                >
                <div class="flex flex-wrap gap-1.5 mt-1.5">
                  {#each sortCards(p.crystallized) as card (card.id)}
                    <CardDisplay {card} crystallized={true} />
                  {/each}
                </div>
              </div>
            {/if}

            <div>
              <span
                class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold"
                >Tokens</span
              >
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

  <!-- ── Import / Export ─────────────────────────────────────────────── -->
  <div class="bg-gray-800 rounded-xl p-3 space-y-2">
    <h2 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">
      Import / Export
    </h2>
    <div class="flex gap-2">
      <button
        onclick={exportState}
        class="flex-1 text-xs py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg font-semibold"
      >
        ↓ Exporter JSON
      </button>
      <!-- label wraps hidden file input so no ref needed -->
      <label
        class="flex-1 text-s py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg font-semibold text-center cursor-pointer"
      >
        ↑ Importer JSON
        <input
          type="file"
          accept=".json"
          class="hidden"
          onchange={importState}
        />
      </label>
    </div>
  </div>

  <!-- ── Action log ───────────────────────────────────────────────────── -->
  <ActionLog logs={gameState.logs ?? []} {myId} isGM={true} />

  <!-- ── Sync + Hard reset ─────────────────────────────────────────── -->
  <div class="border-t border-gray-700 pt-4 space-y-2">
    <div class="flex gap-2">
      {#if resetStep === 0}
        <button
          onclick={hardReset}
          class="flex-1 py-2 text-xs font-bold bg-transparent border border-red-800 text-red-600 hover:bg-red-950 hover:text-red-400 hover:border-red-600 rounded-lg transition-colors"
        >
          ⚠ Réinitialisation complète
        </button>
      {/if}
    </div>
    {#if resetStep === 1}
      <p class="text-xs text-red-400 text-center font-semibold">
        Toutes les mains, tokens et pioches seront effacés. Confirmer ?
      </p>
      <div class="flex gap-2">
        <button
          onclick={cancelReset}
          class="flex-1 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg"
        >
          Annuler
        </button>
        <button
          onclick={hardReset}
          class="flex-1 py-1.5 text-xs bg-red-800 hover:bg-red-700 text-red-100 font-bold rounded-lg"
        >
          Oui, continuer
        </button>
      </div>
    {:else if resetStep === 2}
      <p class="text-xs text-red-300 text-center font-bold">
        ⚠ Dernière confirmation — action irréversible.
      </p>
      <div class="flex gap-2">
        <button
          onclick={cancelReset}
          class="flex-1 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg"
        >
          Annuler
        </button>
        <button
          onclick={hardReset}
          class="flex-1 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg"
        >
          Tout effacer
        </button>
      </div>
    {/if}
  </div>
</div>
