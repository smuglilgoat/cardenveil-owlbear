<script>
  import { onDestroy } from 'svelte';
  import OBR from '@owlbear-rodeo/sdk';
  import CardDisplay from './CardDisplay.svelte';

  /**
   * @type {{
   *   gameState: object, myId: string, myName: string,
   *   party: object[], onUpdate: (s: object) => void
   * }}
   */
  let { gameState, myId, myName, party, onUpdate } = $props();

  let player       = $derived(gameState.players[myId]);
  let deckCount    = $derived(gameState.normalDeck.length);
  let handFull     = $derived(player && player.hand.length >= player.maxHandSize);

  /** Exchanges from other players targeting me */
  let incomingExchanges = $derived(
    (gameState.pendingExchanges ?? []).filter(e => e.to === myId)
  );
  /** My own outgoing exchange (awaiting acceptance) */
  let outgoingExchange  = $derived(
    (gameState.pendingExchanges ?? []).find(e => e.from === myId) ?? null
  );

  // ── Action state ─────────────────────────────────────────────────────
  /** 'force'|'agilite-pick-card'|'agilite-pick-suit'|'esprit'|'social-pick-card'|'social-pick-target'|null */
  let action     = $state(null);
  let actionCard = $state(null); // card selected for agilite / esprit / social

  /** exchange the player chose to accept (needs a card selection) */
  let acceptingExchange = $state(null);

  function cancelAction() {
    action = null;
    actionCard = null;
    acceptingExchange = null;
  }

  // ── Normal draw ───────────────────────────────────────────────────────
  function drawCard() {
    if (handFull || deckCount === 0) return;
    const [card, ...rest] = gameState.normalDeck;
    onUpdate({
      ...gameState,
      normalDeck: rest,
      players: { ...gameState.players, [myId]: { ...player, hand: [...player.hand, card] } },
    });
  }

  // ── Card actions ──────────────────────────────────────────────────────
  function discardCard(card) {
    onUpdate({
      ...gameState,
      discard: [...gameState.discard, card],
      players: { ...gameState.players, [myId]: { ...player, hand: player.hand.filter(c => c.id !== card.id) } },
    });
  }

  function crystallizeCard(card) {
    if (player.tokens.esprit <= 0) {
      // No Esprit token available — surface this via the token action flow instead
      return;
    }
    onUpdate({
      ...gameState,
      players: {
        ...gameState.players,
        [myId]: {
          ...player,
          hand: player.hand.filter(c => c.id !== card.id),
          crystallized: [...player.crystallized, card],
          tokens: { ...player.tokens, esprit: player.tokens.esprit - 1 },
        },
      },
    });
  }

  function discardCrystallized(card) {
    onUpdate({
      ...gameState,
      discard: [...gameState.discard, card],
      players: { ...gameState.players, [myId]: { ...player, crystallized: player.crystallized.filter(c => c.id !== card.id) } },
    });
  }

  // ── Token: Force ──────────────────────────────────────────────────────
  function useForce() {
    if (player.tokens.force <= 0 || handFull || deckCount === 0) return;
    const [card, ...rest] = gameState.normalDeck;
    onUpdate({
      ...gameState,
      normalDeck: rest,
      players: {
        ...gameState.players,
        [myId]: {
          ...player,
          tokens: { ...player.tokens, force: player.tokens.force - 1 },
          hand: [...player.hand, card],
        },
      },
    });
  }

  // ── Token: Agilité ────────────────────────────────────────────────────
  function startAgilite() {
    if (player.tokens.agilite <= 0 || player.hand.length === 0) return;
    action = 'agilite-pick-card';
  }

  function agilitePickCard(card) {
    actionCard = card;
    action = 'agilite-pick-suit';
  }

  function agilitePickSuit(suit) {
    const pile = gameState.specializedDecks[suit];
    if (!pile || pile.length === 0) return;
    const [newCard, ...rest] = pile;
    onUpdate({
      ...gameState,
      discard: [...gameState.discard, actionCard],
      specializedDecks: { ...gameState.specializedDecks, [suit]: rest },
      players: {
        ...gameState.players,
        [myId]: {
          ...player,
          tokens: { ...player.tokens, agilite: player.tokens.agilite - 1 },
          hand: [...player.hand.filter(c => c.id !== actionCard.id), newCard],
        },
      },
    });
    cancelAction();
  }

  // ── Token: Esprit ─────────────────────────────────────────────────────
  function startEsprit() {
    if (player.tokens.esprit <= 0 || player.hand.length === 0) return;
    action = 'esprit';
  }

  function espritPickCard(card) {
    onUpdate({
      ...gameState,
      players: {
        ...gameState.players,
        [myId]: {
          ...player,
          tokens: { ...player.tokens, esprit: player.tokens.esprit - 1 },
          hand: player.hand.filter(c => c.id !== card.id),
          crystallized: [...player.crystallized, card],
        },
      },
    });
    cancelAction();
  }

  // ── Token: Social ─────────────────────────────────────────────────────
  function startSocial() {
    if (player.tokens.social <= 0 || player.hand.length === 0) return;
    action = 'social-pick-card';
  }

  function socialPickCard(card) {
    actionCard = card;
    action = 'social-pick-target';
  }

  function socialPickTarget(targetId) {
    const exchange = {
      id: `${myId}-${Date.now()}`,
      from: myId,
      fromCard: actionCard,
      to: targetId,
    };
    onUpdate({
      ...gameState,
      pendingExchanges: [...(gameState.pendingExchanges ?? []), exchange],
      players: {
        ...gameState.players,
        [myId]: {
          ...player,
          tokens: { ...player.tokens, social: player.tokens.social - 1 },
          hand: player.hand.filter(c => c.id !== actionCard.id),
        },
      },
    });
    cancelAction();
  }

  // ── Exchange acceptance ───────────────────────────────────────────────
  function startAccept(exchange) {
    acceptingExchange = exchange;
    action = 'accept-exchange';
  }

  function completeAccept(myCard) {
    const ex = acceptingExchange;
    const fromPlayer = gameState.players[ex.from];
    onUpdate({
      ...gameState,
      pendingExchanges: gameState.pendingExchanges.filter(e => e.id !== ex.id),
      players: {
        ...gameState.players,
        [ex.from]: { ...fromPlayer, hand: [...fromPlayer.hand, myCard] },
        [myId]: {
          ...player,
          hand: [...player.hand.filter(c => c.id !== myCard.id), ex.fromCard],
        },
      },
    });
    cancelAction();
  }

  function declineExchange(exchange) {
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

  // ── Helpers ───────────────────────────────────────────────────────────
  function getPlayerName(id) {
    return party.find(p => p.id === id)?.name ?? gameState.players[id]?.name ?? id.slice(0, 8);
  }

  const SUITS_INFO = [
    { symbol: '♠', label: 'Piques',   isRed: false },
    { symbol: '♣', label: 'Trèfles',  isRed: false },
    { symbol: '♥', label: 'Cœurs',    isRed: true  },
    { symbol: '♦', label: 'Carreaux', isRed: true  },
  ];

  const TOKEN_COLOR = { force: '#ef4444', agilite: '#22c55e', esprit: '#3b82f6', social: '#eab308' };
  const TOKENS = [
    { key: 'force',   label: 'Force',   desc: 'Piocher (pile normale)',             disabled: () => player.tokens.force   <= 0 || handFull || deckCount === 0, use: useForce   },
    { key: 'agilite', label: 'Agilité', desc: 'Échanger → pioche spécialisée',      disabled: () => player.tokens.agilite <= 0 || player.hand.length === 0,    use: startAgilite },
    { key: 'esprit',  label: 'Esprit',  desc: 'Cristalliser une carte',             disabled: () => player.tokens.esprit  <= 0 || player.hand.length === 0,    use: startEsprit  },
    { key: 'social',  label: 'Social',  desc: 'Échanger avec un autre joueur',      disabled: () => player.tokens.social  <= 0 || player.hand.length === 0,    use: startSocial  },
  ];

  // Other players available for social trade (exclude self and the GM's real OBR ID)
  let otherPlayerIds = $derived(
    Object.keys(gameState.players).filter(id => id !== myId && id !== gameState.gmId)
  );

  // ── Popover hand ─────────────────────────────────────────────────────
  const POPOVER_ID = 'com.cardenveil/hand';
  let popoverVisible = $state(false);

  async function openPopover() {
    const n       = (player?.hand.length ?? 0) + (player?.crystallized.length ?? 0);
    const width   = Math.max(220, n * 56 + 80);
    await OBR.popover.open({
      id:       POPOVER_ID,
      url:      `${window.location.origin}/hand.html`,
      width,
      height:   220,
      anchorPosition:  { left: window.screen.width / 2, top: window.screen.height },
      anchorOrigin:    { horizontal: 'CENTER', vertical: 'TOP' },
      transformOrigin: { horizontal: 'CENTER', vertical: 'BOTTOM' },
      disableClickAway: true,
      hidePaper: true,
    });
    popoverVisible = true;
  }

  async function closePopover() {
    await OBR.popover.close(POPOVER_ID);
    popoverVisible = false;
  }

  async function togglePopover() {
    if (popoverVisible) {
      await closePopover();
    } else {
      await openPopover();
    }
  }

  onDestroy(async () => {
    if (popoverVisible) await OBR.popover.close(POPOVER_ID).catch(() => {});
  });
</script>

{#if !player}
  <div class="flex items-center justify-center h-full text-gray-500 text-sm">
    En attente de l'initialisation...
  </div>
{:else}
  <div class="flex flex-col h-full overflow-y-auto p-3 gap-3">

    <!-- ── Header ──────────────────────────────────────────────────── -->
    <div class="flex justify-between items-center">
      <h2 class="text-white font-semibold text-sm">{myName}</h2>
      <div class="flex gap-3 text-xs text-gray-500">
        <span>Pioche: <span class="text-white">{deckCount}</span></span>
        <span>Défausse: <span class="text-white">{gameState.discard.length}</span></span>
      </div>
    </div>

    <!-- ── Popover hand toggle ───────────────────────────────────────── -->
    <button
      onclick={togglePopover}
      class="w-full text-xs py-1.5 rounded-lg font-semibold transition-colors border"
      class:bg-indigo-600={popoverVisible}
      class:border-indigo-500={popoverVisible}
      class:text-white={popoverVisible}
      class:bg-transparent={!popoverVisible}
      class:border-gray-600={!popoverVisible}
      class:text-gray-400={!popoverVisible}
    >
      {popoverVisible ? '🃏 Main affichée' : '🃏 Afficher la main'}
    </button>

    <!-- ── Incoming exchanges ──────────────────────────────────────── -->
    {#each incomingExchanges as ex (ex.id)}
      <div class="bg-yellow-900/40 border border-yellow-600 rounded-xl p-3 space-y-2">
        <p class="text-xs text-yellow-300 font-semibold">
          Échange proposé par <span class="text-white">{getPlayerName(ex.from)}</span>
        </p>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-400">Carte offerte :</span>
          <CardDisplay card={ex.fromCard} />
        </div>
        {#if action === 'accept-exchange' && acceptingExchange?.id === ex.id}
          <p class="text-xs text-yellow-200">Choisissez la carte à donner en retour :</p>
          <div class="flex flex-wrap gap-2">
            {#each player.hand as card (card.id)}
              <CardDisplay
                {card}
                actions={[{ icon: '↗', label: 'Donner en échange', onClick: () => completeAccept(card) }]}
              />
            {/each}
          </div>
          <button onclick={cancelAction} class="text-xs text-gray-500 hover:text-gray-300 underline">Annuler</button>
        {:else}
          <div class="flex gap-2">
            <button
              onclick={() => startAccept(ex)}
              class="flex-1 text-xs py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-lg"
            >
              Accepter
            </button>
            <button
              onclick={() => declineExchange(ex)}
              class="flex-1 text-xs py-1.5 bg-red-800 hover:bg-red-700 text-red-200 rounded-lg"
            >
              Refuser
            </button>
          </div>
        {/if}
      </div>
    {/each}

    <!-- ── Outgoing exchange ───────────────────────────────────────── -->
    {#if outgoingExchange}
      <div class="bg-indigo-900/30 border border-indigo-700 rounded-xl p-2.5 text-xs text-indigo-300">
        Échange en attente avec <span class="text-white">{getPlayerName(outgoingExchange.to)}</span>…
        <span class="ml-1 text-gray-500">(carte offerte : {outgoingExchange.fromCard.value}{outgoingExchange.fromCard.suit})</span>
      </div>
    {/if}

    <!-- ── Action banner ──────────────────────────────────────────── -->
    {#if action && action !== 'accept-exchange'}
      <div class="bg-indigo-900/50 border border-indigo-600 rounded-xl p-3 space-y-2">
        {#if action === 'agilite-pick-card'}
          <p class="text-xs text-indigo-200 font-semibold">Agilité — Choisissez la carte à défausser :</p>
          <div class="flex flex-wrap gap-2">
            {#each player.hand as card (card.id)}
              <CardDisplay {card} actions={[{ icon: '🗑', label: 'Défausser', onClick: () => agilitePickCard(card) }]} />
            {/each}
          </div>

        {:else if action === 'agilite-pick-suit'}
          <p class="text-xs text-indigo-200 font-semibold">
            Agilité — Choisissez la pile spécialisée
            <span class="text-gray-400">(vous défaussez {actionCard.value}{actionCard.suit})</span> :
          </p>
          <div class="grid grid-cols-2 gap-2">
            {#each SUITS_INFO as s}
              {@const count = gameState.specializedDecks[s.symbol]?.length ?? 0}
              <button
                onclick={() => agilitePickSuit(s.symbol)}
                disabled={count === 0}
                class="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-40"
                class:text-red-400={s.isRed}
                class:border-red-800={s.isRed}
                class:bg-red-950={s.isRed}
                class:hover:bg-red-900={s.isRed && count > 0}
                class:text-gray-300={!s.isRed}
                class:border-gray-600={!s.isRed}
                class:bg-gray-800={!s.isRed}
                class:hover:bg-gray-700={!s.isRed && count > 0}
              >
                <span>{s.symbol} {s.label}</span>
                <span class="text-xs font-normal opacity-70">{count}</span>
              </button>
            {/each}
          </div>

        {:else if action === 'esprit'}
          <p class="text-xs text-indigo-200 font-semibold">Esprit — Choisissez la carte à cristalliser :</p>
          <div class="flex flex-wrap gap-2">
            {#each player.hand as card (card.id)}
              <CardDisplay {card} actions={[{ icon: '✦', label: 'Cristalliser', onClick: () => espritPickCard(card) }]} />
            {/each}
          </div>

        {:else if action === 'social-pick-card'}
          <p class="text-xs text-indigo-200 font-semibold">Social — Choisissez votre carte à offrir :</p>
          <div class="flex flex-wrap gap-2">
            {#each player.hand as card (card.id)}
              <CardDisplay {card} actions={[{ icon: '↗', label: 'Offrir', onClick: () => socialPickCard(card) }]} />
            {/each}
          </div>

        {:else if action === 'social-pick-target'}
          <p class="text-xs text-indigo-200 font-semibold">
            Social — Vous offrez <span class="text-white">{actionCard.value}{actionCard.suit}</span>. À qui ?
          </p>
          <div class="space-y-1">
            {#each otherPlayerIds as id}
              <button
                onclick={() => socialPickTarget(id)}
                class="w-full text-left text-xs px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                {getPlayerName(id)}
              </button>
            {/each}
            {#if otherPlayerIds.length === 0}
              <p class="text-xs text-gray-500 italic">Aucun autre joueur enregistré.</p>
            {/if}
          </div>
        {/if}

        <button onclick={cancelAction} class="text-xs text-gray-500 hover:text-gray-300 underline">
          Annuler
        </button>
      </div>
    {/if}

    <!-- ── Normal Hand ─────────────────────────────────────────────── -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          Main
        </h3>
        <span class="text-xs" class:text-red-400={handFull} class:text-gray-500={!handFull}>
          {player.hand.length} / {player.maxHandSize}
        </span>
      </div>
      {#if player.hand.length === 0}
        <p class="text-xs text-gray-600 italic">Aucune carte en main</p>
      {:else}
        <div class="flex flex-wrap gap-2">
          {#each player.hand as card (card.id)}
            <CardDisplay
              {card}
              actions={[
                { icon: '🗑', label: 'Défausser',   onClick: () => discardCard(card) },
                {
                  icon: '✦',
                  label: player.tokens.esprit > 0 ? 'Cristalliser (−1 Esprit)' : 'Cristalliser (pas de token Esprit)',
                  onClick: () => crystallizeCard(card),
                },
              ]}
            />
          {/each}
        </div>
      {/if}
    </div>

    <!-- ── Draw button ─────────────────────────────────────────────── -->
    <button
      onclick={drawCard}
      disabled={handFull || deckCount === 0}
      class="w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {#if handFull}Main pleine{:else if deckCount === 0}Pioche vide{:else}Piocher ({deckCount}){/if}
    </button>

    <!-- ── Crystallized ────────────────────────────────────────────── -->
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
              actions={[{ icon: '▶', label: 'Jouer / Défausser', onClick: () => discardCrystallized(card) }]}
            />
          {/each}
        </div>
      </div>
    {/if}

    <!-- ── Tokens ──────────────────────────────────────────────────── -->
    <div>
      <h3 class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Tokens</h3>
      <div class="space-y-2">
        {#each TOKENS as tok}
          {@const current = player.tokens[tok.key]}
          {@const max     = player.maxTokens[tok.key]}
          {@const busy    = action !== null}
          <div class="flex items-center gap-2">
            <!-- Dots -->
            <div class="flex gap-1 w-24 shrink-0">
              {#each { length: max } as _, i}
                <div
                  class="w-3.5 h-3.5 rounded-full border border-gray-600 transition-colors"
                  style={i < current
                    ? `background:${TOKEN_COLOR[tok.key]};border-color:${TOKEN_COLOR[tok.key]}`
                    : 'background:#1f2937'}
                ></div>
              {/each}
            </div>
            <!-- Label + action button -->
            <div class="flex-1 min-w-0">
              <div class="text-[11px] text-gray-300 font-medium leading-none">{tok.label}</div>
              <div class="text-[10px] text-gray-500 leading-none mt-0.5 truncate">{tok.desc}</div>
            </div>
            <button
              onclick={tok.use}
              disabled={tok.disabled() || busy}
              class="text-[10px] px-2 py-1 rounded-lg font-semibold shrink-0 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              style="background:{TOKEN_COLOR[tok.key]}20;color:{TOKEN_COLOR[tok.key]};border:1px solid {TOKEN_COLOR[tok.key]}60"
            >
              {current}/{max}
            </button>
          </div>
        {/each}
      </div>
    </div>

  </div>
{/if}
