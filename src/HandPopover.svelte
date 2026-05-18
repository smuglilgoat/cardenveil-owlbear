<script>
  import { onMount, onDestroy } from "svelte";
  import OBR from "@owlbear-rodeo/sdk";
  import { hydrateState, dehydrateState } from "./lib/deck.js";

  const METADATA_KEY = "com.cardenveil/gameState";

  let ready = $state(false);
  let myId = $state(null);
  let party = $state([]);
  let gameState = $state(null);

  let unsubMeta = null;
  let unsubParty = null;

  async function pushState(newState) {
    const plain = $state.snapshot(newState);
    const dehydrated = dehydrateState(plain);
    await OBR.room.setMetadata({ [METADATA_KEY]: dehydrated });
    gameState = hydrateState(dehydrated);
  }

  onMount(() => {
    OBR.onReady(async () => {
      myId = await OBR.player.getId();
      party = await OBR.party.getPlayers();

      const meta = await OBR.room.getMetadata();
      const raw = meta[METADATA_KEY];
      if (raw) gameState = hydrateState(raw);

      ready = true;

      unsubMeta = OBR.room.onMetadataChange((m) => {
        const r = m[METADATA_KEY];
        if (r) gameState = hydrateState(r);
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

  // ── Derived ───────────────────────────────────────────────────────────
  let player = $derived(gameState?.players?.[myId] ?? null);
  let deckCount = $derived(gameState?.normalDeck?.length ?? 0);
  let handFull = $derived(
    player ? player.hand.length >= player.maxHandSize : false,
  );

  let incomingExchanges = $derived(
    (gameState?.pendingExchanges ?? []).filter((e) => e.to === myId),
  );
  let outgoingExchange = $derived(
    (gameState?.pendingExchanges ?? []).find((e) => e.from === myId) ?? null,
  );
  let otherPlayerIds = $derived(
    gameState
      ? Object.keys(gameState.players).filter(
          (id) => id !== myId && id !== gameState.gmId,
        )
      : [],
  );

  // ── Action state ──────────────────────────────────────────────────────
  let action = $state(null);
  let actionCard = $state(null);
  let acceptingExchange = $state(null);

  function cancelAction() {
    action = null;
    actionCard = null;
    acceptingExchange = null;
  }

  // ── Game actions ──────────────────────────────────────────────────────
  function drawCard() {
    if (!player || handFull || deckCount === 0) return;
    const [card, ...rest] = gameState.normalDeck;
    pushState({
      ...gameState,
      normalDeck: rest,
      players: {
        ...gameState.players,
        [myId]: { ...player, hand: [...player.hand, card] },
      },
    });
  }

  function discardCard(card) {
    if (!player) return;
    pushState({
      ...gameState,
      discard: [...gameState.discard, card],
      players: {
        ...gameState.players,
        [myId]: {
          ...player,
          hand: player.hand.filter((c) => c.id !== card.id),
        },
      },
    });
    active = null;
  }

  function crystallizeCard(card) {
    if (!player || player.tokens.esprit <= 0) return;
    pushState({
      ...gameState,
      players: {
        ...gameState.players,
        [myId]: {
          ...player,
          hand: player.hand.filter((c) => c.id !== card.id),
          crystallized: [...player.crystallized, card],
          tokens: { ...player.tokens, esprit: player.tokens.esprit - 1 },
        },
      },
    });
    active = null;
  }

  function discardCrystallized(card) {
    if (!player) return;
    pushState({
      ...gameState,
      discard: [...gameState.discard, card],
      players: {
        ...gameState.players,
        [myId]: {
          ...player,
          crystallized: player.crystallized.filter((c) => c.id !== card.id),
        },
      },
    });
    active = null;
  }

  // ── Token: Force ──────────────────────────────────────────────────────
  function useForce() {
    if (!player || player.tokens.force <= 0 || handFull || deckCount === 0)
      return;
    const [card, ...rest] = gameState.normalDeck;
    pushState({
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
    if (!player || player.tokens.agilite <= 0 || player.hand.length === 0)
      return;
    action = "agilite-pick-card";
  }

  function agilitePickCard(card) {
    actionCard = card;
    action = "agilite-pick-suit";
  }

  function agilitePickSuit(suit) {
    const pile = gameState.specializedDecks[suit];
    if (!pile || pile.length === 0) return;
    const [newCard, ...rest] = pile;
    pushState({
      ...gameState,
      discard: [...gameState.discard, actionCard],
      specializedDecks: { ...gameState.specializedDecks, [suit]: rest },
      players: {
        ...gameState.players,
        [myId]: {
          ...player,
          tokens: { ...player.tokens, agilite: player.tokens.agilite - 1 },
          hand: [...player.hand.filter((c) => c.id !== actionCard.id), newCard],
        },
      },
    });
    cancelAction();
  }

  // ── Token: Esprit ─────────────────────────────────────────────────────
  function startEsprit() {
    if (!player || player.tokens.esprit <= 0 || player.hand.length === 0)
      return;
    action = "esprit";
  }

  function espritPickCard(card) {
    pushState({
      ...gameState,
      players: {
        ...gameState.players,
        [myId]: {
          ...player,
          tokens: { ...player.tokens, esprit: player.tokens.esprit - 1 },
          hand: player.hand.filter((c) => c.id !== card.id),
          crystallized: [...player.crystallized, card],
        },
      },
    });
    cancelAction();
  }

  // ── Token: Social ─────────────────────────────────────────────────────
  function startSocial() {
    if (!player || player.tokens.social <= 0 || player.hand.length === 0)
      return;
    action = "social-pick-card";
  }

  function socialPickCard(card) {
    actionCard = card;
    action = "social-pick-target";
  }

  function socialPickTarget(targetId) {
    pushState({
      ...gameState,
      pendingExchanges: [
        ...(gameState.pendingExchanges ?? []),
        {
          id: `${myId}-${Date.now()}`,
          from: myId,
          fromCard: actionCard,
          to: targetId,
        },
      ],
      players: {
        ...gameState.players,
        [myId]: {
          ...player,
          tokens: { ...player.tokens, social: player.tokens.social - 1 },
          hand: player.hand.filter((c) => c.id !== actionCard.id),
        },
      },
    });
    cancelAction();
  }

  // ── Exchange acceptance ───────────────────────────────────────────────
  function startAccept(exchange) {
    acceptingExchange = exchange;
    action = "accept-exchange";
  }

  function completeAccept(myCard) {
    const ex = acceptingExchange;
    const fromPlayer = gameState.players[ex.from];
    pushState({
      ...gameState,
      pendingExchanges: gameState.pendingExchanges.filter(
        (e) => e.id !== ex.id,
      ),
      players: {
        ...gameState.players,
        [ex.from]: { ...fromPlayer, hand: [...fromPlayer.hand, myCard] },
        [myId]: {
          ...player,
          hand: [...player.hand.filter((c) => c.id !== myCard.id), ex.fromCard],
        },
      },
    });
    cancelAction();
  }

  function declineExchange(exchange) {
    const fromPlayer = gameState.players[exchange.from];
    pushState({
      ...gameState,
      pendingExchanges: gameState.pendingExchanges.filter(
        (e) => e.id !== exchange.id,
      ),
      players: {
        ...gameState.players,
        [exchange.from]: {
          ...fromPlayer,
          hand: [...fromPlayer.hand, exchange.fromCard],
        },
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  function getPlayerName(id) {
    return (
      party.find((p) => p.id === id)?.name ??
      gameState?.players[id]?.name ??
      id.slice(0, 8)
    );
  }

  const SUITS_INFO = [
    { symbol: "♠", label: "Piques", isRed: false },
    { symbol: "♣", label: "Trèfles", isRed: false },
    { symbol: "♥", label: "Cœurs", isRed: true },
    { symbol: "♦", label: "Carreaux", isRed: true },
  ];

  const TOKEN_COLOR = {
    force: "#ef4444",
    agilite: "#22c55e",
    esprit: "#3b82f6",
    social: "#eab308",
  };
  const TOKENS = [
    {
      key: "force",
      label: "Force",
      desc: "Piocher (pile normale)",
      disabled: () =>
        !player || player.tokens.force <= 0 || handFull || deckCount === 0,
      use: useForce,
    },
    {
      key: "agilite",
      label: "Agilité",
      desc: "Échanger → pioche spécialisée",
      disabled: () =>
        !player || player.tokens.agilite <= 0 || player.hand.length === 0,
      use: startAgilite,
    },
    {
      key: "esprit",
      label: "Esprit",
      desc: "Cristalliser une carte",
      disabled: () =>
        !player || player.tokens.esprit <= 0 || player.hand.length === 0,
      use: startEsprit,
    },
    {
      key: "social",
      label: "Social",
      desc: "Échanger avec un joueur",
      disabled: () =>
        !player || player.tokens.social <= 0 || player.hand.length === 0,
      use: startSocial,
    },
  ];

  // ── Fan geometry ──────────────────────────────────────────────────────
  const MAX_ROT = 20;
  const SPREAD_X = 64;
  const ARC_Y = 22;

  let active = $state(null);

  let allCards = $derived(
    player
      ? [
          ...player.hand.map((c) => ({ card: c, isCrystallized: false })),
          ...player.crystallized.map((c) => ({
            card: c,
            isCrystallized: true,
          })),
        ]
      : [],
  );

  function fanStyle(i, n) {
    const t = n > 1 ? i / (n - 1) - 0.5 : 0;
    const rot = t * MAX_ROT * 2;
    const tx = t * SPREAD_X * (n - 1);
    const ty = Math.abs(t) * ARC_Y * 2;
    return `transform: translateX(${tx}px) translateY(${ty}px) rotate(${rot}deg);`;
  }

  function toggleActive(card, isCrystallized) {
    if (active?.card.id === card.id) {
      active = null;
      return;
    }
    active = { card, isCrystallized };
    // clear multi-step action if user clicks a card directly
    if (action && action !== "accept-exchange") cancelAction();
  }

  // For multi-step actions that need card selection from the fan
  function fanCardAction(card, isCrystallized) {
    if (action === "agilite-pick-card") {
      agilitePickCard(card);
      return;
    }
    if (action === "esprit") {
      espritPickCard(card);
      return;
    }
    if (action === "social-pick-card") {
      socialPickCard(card);
      return;
    }
    if (action === "accept-exchange" && acceptingExchange) {
      completeAccept(card);
      return;
    }
    toggleActive(card, isCrystallized);
  }

  const SUIT_COLOR = {
    "♠": "#1e293b",
    "♣": "#1e293b",
    "♥": "#dc2626",
    "♦": "#dc2626",
  };
</script>

<div
  class="w-full h-full flex flex-row overflow-hidden"
  style="background: transparent; color: white; font-family: system-ui, sans-serif;"
>
  {#if !ready || !player}
    <div class="flex items-center justify-center w-full text-gray-400 text-xs">Chargement…</div>
  {:else}

    <!-- ── Left: token sidebar ────────────────────────────────────── -->
    <div
      class="flex flex-col gap-1 p-1.5 shrink-0"
      style="width: 72px; background: rgba(15,15,30,0.85); border-right: 1px solid rgba(255,255,255,0.08);"
    >
      {#each TOKENS as tok}
        {@const current = player.tokens[tok.key]}
        {@const max     = player.maxTokens?.[tok.key] ?? current}
        {@const busy    = action !== null}
        <button
          onclick={tok.use}
          disabled={tok.disabled() || busy}
          title="{tok.label} — {tok.desc}"
          class="flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-lg border flex-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          style="background:{TOKEN_COLOR[tok.key]}18;border-color:{TOKEN_COLOR[tok.key]}50;color:{TOKEN_COLOR[tok.key]}"
        >
          <span class="text-[11px] font-bold leading-none">{current}/{max}</span>
          <span class="text-[9px] leading-none opacity-80 truncate w-full text-center">{tok.label}</span>
          <div class="flex flex-wrap justify-center gap-0.5 mt-0.5">
            {#each { length: max } as _, i}
              <div
                class="w-1.5 h-1.5 rounded-full"
                style={i < current ? `background:${TOKEN_COLOR[tok.key]}` : `background:#374151`}
              ></div>
            {/each}
          </div>
        </button>
      {/each}
    </div>

    <!-- ── Right: controls + fan ──────────────────────────────────── -->
    <div class="flex flex-col flex-1 min-w-0 overflow-hidden">

      <!-- Scrollable controls -->
      <div
        class="flex-1 overflow-y-auto px-2 pt-1.5 pb-1 space-y-1.5 min-h-0"
        style="background: rgba(15,15,30,0.85);"
      >
        <!-- Header -->
        <div class="flex items-center justify-between">
          <span class="text-white font-semibold text-[11px]">{player.name ?? myId?.slice(0, 8)}</span>
          <div class="flex gap-2 text-[9px] text-gray-500">
            <span>Pioche <span class="text-white">{deckCount}</span></span>
            <span>Défausse <span class="text-white">{gameState.discard.length}</span></span>
          </div>
        </div>

        <!-- Incoming exchanges -->
        {#each incomingExchanges as ex (ex.id)}
          <div class="bg-yellow-900/40 border border-yellow-600 rounded-lg p-1.5 space-y-1">
            <p class="text-[10px] text-yellow-300 font-semibold">
              Échange de <span class="text-white">{getPlayerName(ex.from)}</span>
              — <span class="text-white font-bold">{ex.fromCard.value}{ex.fromCard.suit}</span>
            </p>
            {#if action === "accept-exchange" && acceptingExchange?.id === ex.id}
              <p class="text-[10px] text-yellow-200">Cliquez une carte dans votre main pour échanger :</p>
              <button onclick={cancelAction} class="text-[10px] text-gray-500 hover:text-gray-300 underline">Annuler</button>
            {:else}
              <div class="flex gap-1">
                <button onclick={() => startAccept(ex)} class="flex-1 text-[10px] py-0.5 bg-green-700 hover:bg-green-600 text-white rounded">Accepter</button>
                <button onclick={() => declineExchange(ex)} class="flex-1 text-[10px] py-0.5 bg-red-800 hover:bg-red-700 text-red-200 rounded">Refuser</button>
              </div>
            {/if}
          </div>
        {/each}

        <!-- Outgoing exchange -->
        {#if outgoingExchange}
          <div class="bg-indigo-900/30 border border-indigo-700 rounded-lg p-1.5 text-[10px] text-indigo-300">
            Attente de <span class="text-white">{getPlayerName(outgoingExchange.to)}</span>
            <span class="text-gray-500"> ({outgoingExchange.fromCard.value}{outgoingExchange.fromCard.suit})</span>
          </div>
        {/if}

        <!-- Action banners -->
        {#if action === "agilite-pick-card"}
          <div class="bg-green-900/40 border border-green-600 rounded-lg p-1.5 text-[10px] text-green-200 flex items-center justify-between">
            <span>Agilité — cliquez la carte à <strong>défausser</strong></span>
            <button onclick={cancelAction} class="text-gray-500 hover:text-gray-300 underline ml-1">✕</button>
          </div>
        {:else if action === "agilite-pick-suit"}
          <div class="bg-green-900/40 border border-green-600 rounded-lg p-1.5 space-y-1">
            <p class="text-[10px] text-green-200 font-semibold">Pile spécialisée <span class="text-gray-400">(défausse {actionCard.value}{actionCard.suit})</span></p>
            <div class="grid grid-cols-4 gap-1">
              {#each SUITS_INFO as s}
                {@const count = gameState.specializedDecks[s.symbol]?.length ?? 0}
                <button
                  onclick={() => agilitePickSuit(s.symbol)}
                  disabled={count === 0}
                  class="flex flex-col items-center py-0.5 rounded border text-[11px] font-bold disabled:opacity-40"
                  class:text-red-400={s.isRed} class:border-red-700={s.isRed} class:bg-red-950={s.isRed}
                  class:text-gray-300={!s.isRed} class:border-gray-600={!s.isRed} class:bg-gray-800={!s.isRed}
                >
                  {s.symbol} <span class="text-[9px] opacity-70">{count}</span>
                </button>
              {/each}
            </div>
            <button onclick={cancelAction} class="text-[10px] text-gray-500 hover:text-gray-300 underline">Annuler</button>
          </div>
        {:else if action === "esprit"}
          <div class="bg-blue-900/40 border border-blue-600 rounded-lg p-1.5 text-[10px] text-blue-200 flex items-center justify-between">
            <span>Esprit — cliquez la carte à <strong>cristalliser</strong></span>
            <button onclick={cancelAction} class="text-gray-500 hover:text-gray-300 underline ml-1">✕</button>
          </div>
        {:else if action === "social-pick-card"}
          <div class="bg-yellow-900/40 border border-yellow-600 rounded-lg p-1.5 text-[10px] text-yellow-200 flex items-center justify-between">
            <span>Social — cliquez la carte à <strong>offrir</strong></span>
            <button onclick={cancelAction} class="text-gray-500 hover:text-gray-300 underline ml-1">✕</button>
          </div>
        {:else if action === "social-pick-target"}
          <div class="bg-yellow-900/40 border border-yellow-600 rounded-lg p-1.5 space-y-1">
            <p class="text-[10px] text-yellow-200 font-semibold">Offrir <span class="text-white">{actionCard.value}{actionCard.suit}</span> à :</p>
            <div class="flex flex-wrap gap-1">
              {#each otherPlayerIds as id}
                <button onclick={() => socialPickTarget(id)} class="text-[10px] px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-white rounded">{getPlayerName(id)}</button>
              {/each}
              {#if otherPlayerIds.length === 0}<p class="text-[10px] text-gray-500 italic">Aucun autre joueur.</p>{/if}
            </div>
            <button onclick={cancelAction} class="text-[10px] text-gray-500 hover:text-gray-300 underline">Annuler</button>
          </div>
        {/if}

        <!-- Draw button -->
        <button
          onclick={drawCard}
          disabled={handFull || deckCount === 0}
          class="w-full py-1 text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {#if handFull}Main pleine ({player.hand.length}/{player.maxHandSize}){:else if deckCount === 0}Pioche vide{:else}Piocher ({deckCount}){/if}
        </button>
      </div>

      <!-- Card fan -->
      <div
        class="shrink-0 relative flex items-end justify-center overflow-visible select-none"
        style="height: 190px; padding-bottom: 6px; background: transparent;"
      >
        {#if allCards.length === 0}
          <p class="text-[10px] text-gray-600 pb-3">Aucune carte</p>
        {:else}
          <div
            class="relative flex items-end justify-center"
            style="width: {Math.max(240, allCards.length * SPREAD_X + 100)}px; height: 184px;"
          >
            {#each allCards as { card, isCrystallized }, i (card.id)}
              {@const isActive     = active?.card.id === card.id}
              {@const isSelectable = action === "agilite-pick-card" || action === "esprit" || action === "social-pick-card" || (action === "accept-exchange" && !isCrystallized)}
              {@const n            = allCards.length}

              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div
                class="absolute bottom-0 left-1/2 cursor-pointer transition-all duration-150"
                style="
                  {fanStyle(i, n)}
                  margin-left: -40px;
                  z-index: {isActive ? 50 : i};
                  transform-origin: bottom center;
                  filter: {isActive ? 'drop-shadow(0 -8px 14px rgba(99,102,241,0.8))' : isSelectable ? 'drop-shadow(0 -4px 8px rgba(250,204,21,0.6))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))'};
                  {isActive ? 'transform: ' + fanStyle(i, n).replace('transform:', '').replace(';','') + ' translateY(-30px);' : ''}
                "
                onclick={() => fanCardAction(card, isCrystallized)}
              >
                <div
                  class="w-[80px] h-[120px] rounded-lg flex flex-col p-1 text-[12px] font-bold leading-none"
                  style="
                    background: {isCrystallized ? '#fff1f2' : '#ffffff'};
                    border: {isCrystallized ? '2.5px solid #ef4444' : '1.5px solid #d1d5db'};
                    color: {SUIT_COLOR[card.suit] ?? '#111827'};
                  "
                >
                  <div class="flex flex-col items-start"><span>{card.value}</span><span class="text-[14px]">{card.suit}</span></div>
                  <div class="flex-1 flex items-center justify-center text-[28px]">{card.suit}</div>
                  <div class="flex flex-col items-end rotate-180"><span>{card.value}</span><span class="text-[14px]">{card.suit}</span></div>
                </div>

                {#if isActive && !isSelectable}
                  <div class="absolute -top-[50px] left-1/2 -translate-x-1/2 flex gap-1 z-50">
                    <button
                      onclick={(e) => { e.stopPropagation(); isCrystallized ? discardCrystallized(card) : discardCard(card); }}
                      class="px-2.5 py-1 text-[11px] font-bold bg-red-700 hover:bg-red-600 text-white rounded-lg shadow-lg"
                      title="Défausser"
                    >🗑</button>
                    {#if !isCrystallized}
                      <button
                        onclick={(e) => { e.stopPropagation(); crystallizeCard(card); }}
                        disabled={player.tokens.esprit <= 0}
                        class="px-2.5 py-1 text-[11px] font-bold bg-blue-700 hover:bg-blue-600 text-white rounded-lg shadow-lg disabled:opacity-40"
                        title="Cristalliser (−1 Esprit)"
                      >✦</button>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

    </div>
  {/if}
</div>
