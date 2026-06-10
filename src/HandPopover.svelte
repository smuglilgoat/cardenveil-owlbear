<script>
  import { onMount, onDestroy } from "svelte";
  import OBR from "@owlbear-rodeo/sdk";
  import {
    hydrateState,
    dehydrateState,
    drawNormal,
    drawSpecialized,
    GM_CHAR_ID,
    addLog,
  } from "./lib/deck.js";

  const METADATA_KEY = "com.cardenveil/gameState";

  let ready = $state(false);
  let myId = $state(null);
  let party = $state([]);
  let gameState = $state(null);
  let active = $state(null); // { card, isCrystallized } | null

  // Token action state
  let action = $state(null); // 'force'|'agilite-pick-card'|'agilite-pick-suit'|'esprit'|'social-pick-card'|'social-pick-target'
  let actionCard = $state(null);

  let unsubMeta = null;
  let unsubParty = null;

  async function pushState(newState) {
    const plain = $state.snapshot(newState);
    const dehydrated = dehydrateState(plain);
    gameState = newState;
    await OBR.room.setMetadata({ [METADATA_KEY]: dehydrated });
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
      unsubParty = OBR.party.onChange((p) => {
        party = p;
      });
    });
  });

  onDestroy(() => {
    unsubMeta?.();
    unsubParty?.();
  });

  // ── Derived ───────────────────────────────────────────────────────────
  let player = $derived(gameState?.players?.[myId] ?? null);
  let handFull = $derived(
    player
      ? player.hand.length >= player.maxHandSize + (player.spiritBounds ?? 0)
      : false,
  );

  let mustCrystallize = $derived(
    player
      ? (player.spiritBounds ?? 0) > 0 &&
          player.hand.length >= player.maxHandSize + (player.spiritBounds ?? 0)
      : false,
  );

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

  let partyIds = $derived(new Set(party.map((p) => p.id)));

  let otherPlayerIds = $derived(
    gameState
      ? Object.keys(gameState.players).filter(
          (id) =>
            id !== myId &&
            id !== gameState.gmId &&
            (id === GM_CHAR_ID ? (/** @type {any} */ (gameState)).gmCharacterId != null : partyIds.has(id)),
        )
      : [],
  );

  let incomingExchanges = $derived(
    (gameState?.pendingExchanges ?? []).filter((e) => e.to === myId),
  );

  let outgoingExchange = $derived(
    (gameState?.pendingExchanges ?? []).find((e) => e.from === myId) ?? null,
  );

  let acceptingExchange = $state(null);
  let choosingToken = /** @type {string | null} */ ($state(null)); // token key awaiting card/combat choice

  // ── Card actions ──────────────────────────────────────────────────────
  function discard(card, isCrystallized) {
    if (!player) return;
    pushState(
      addLog(
        {
          ...gameState,
          discard: [...gameState.discard, card],
          players: {
            ...gameState.players,
            [myId]: {
              ...player,
              hand: isCrystallized
                ? player.hand
                : player.hand.filter((c) => c.id !== card.id),
              crystallized: isCrystallized
                ? player.crystallized.filter((c) => c.id !== card.id)
                : player.crystallized,
            },
          },
        },
        myId,
        player.name,
        `défausse ${card.value}${card.suit}${isCrystallized ? " (cristallisée)" : ""}`,
      ),
    );
    active = null;
  }

  function crystallize(card) {
    if (!player || (player.spiritBounds ?? 0) <= 0) return;
    pushState(
      addLog(
        {
          ...gameState,
          players: {
            ...gameState.players,
            [myId]: {
              ...player,
              hand: player.hand.filter((c) => c.id !== card.id),
              crystallized: [...player.crystallized, card],
              grayedCards: (player.grayedCards ?? []).filter((id) => id !== card.id),
              spiritBounds: (player.spiritBounds ?? 0) - 1,
            },
          },
        },
        myId,
        player.name,
        `cristallise ${card.value}${card.suit} (−1 Spirit Bound)`,
      ),
    );
    active = null;
  }

  // ── Draw ──────────────────────────────────────────────────────────────
  function drawCard() {
    if (!player || handFull || mustCrystallize) return;
    const mn = player.minDrawValue ?? 1,
      mx = player.maxDrawValue ?? 13;
    const card = drawNormal(mn, mx);
    pushState(
      addLog(
        {
          ...gameState,
          players: {
            ...gameState.players,
            [myId]: { ...player, hand: [...player.hand, card] },
          },
        },
        myId,
        player.name,
        `pioche ${card.value}${card.suit}`,
      ),
    );
  }

  // ── Token: Force ──────────────────────────────────────────────────────
  function useForce() {
    if (!player || player.tokens.force <= 0) return;
    const mn = player.minDrawValue ?? 1,
      mx = player.maxDrawValue ?? 13;
    const card = drawNormal(mn, mx);
    pushState(
      addLog(
        {
          ...gameState,
          players: {
            ...gameState.players,
            [myId]: {
              ...player,
              tokens: { ...player.tokens, force: player.tokens.force - 1 },
              hand: [...player.hand, card],
            },
          },
        },
        myId,
        player.name,
        `token Force : pioche ${card.value}${card.suit}`,
      ),
    );
  }

  // ── Token: Agilité ────────────────────────────────────────────────────
  function startAgilite() {
    if (!player || player.tokens.agilite <= 0 || player.hand.length === 0)
      return;
    action = "agilite-pick-card";
    active = null;
  }

  function agilitePickCard(card) {
    actionCard = card;
    action = "agilite-pick-suit";
  }

  function agilitePickSuit(suit) {
    const card = drawSpecialized(
      suit,
      player.minDrawValue ?? 1,
      player.maxDrawValue ?? 13,
    );
    pushState(
      addLog(
        {
          ...gameState,
          discard: [...gameState.discard, actionCard],
          players: {
            ...gameState.players,
            [myId]: {
              ...player,
              tokens: { ...player.tokens, agilite: player.tokens.agilite - 1 },
              hand: [
                ...player.hand.filter((c) => c.id !== actionCard.id),
                card,
              ],
            },
          },
        },
        myId,
        player.name,
        `token Agilité : défausse ${actionCard.value}${actionCard.suit}, pioche ${card.value}${card.suit} (${suit})`,
      ),
    );
    cancelAction();
  }

  // ── Token: Esprit → ajoute 1 Spirit Bound ────────────────────────────
  function useEsprit() {
    if (!player || player.tokens.esprit <= 0) return;
    pushState(
      addLog(
        {
          ...gameState,
          players: {
            ...gameState.players,
            [myId]: {
              ...player,
              tokens: { ...player.tokens, esprit: player.tokens.esprit - 1 },
              spiritBounds: (player.spiritBounds ?? 0) + 1,
            },
          },
        },
        myId,
        player.name,
        `token Esprit : +1 Spirit Bound (total ${(player.spiritBounds ?? 0) + 1})`,
      ),
    );
  }

  // ── Token: Social ─────────────────────────────────────────────────────
  function startSocial() {
    if (!player || player.tokens.social <= 0 || player.hand.length === 0)
      return;
    action = "social-pick-card";
    active = null;
  }

  function socialPickCard(card) {
    actionCard = card;
    action = "social-pick-target";
  }

  function socialPickTarget(targetId) {
    const exchange = {
      id: `${myId}-${Date.now()}`,
      from: myId,
      fromCard: actionCard,
      to: targetId,
    };
    pushState(
      addLog(
        {
          ...gameState,
          pendingExchanges: [...(gameState.pendingExchanges ?? []), exchange],
          players: {
            ...gameState.players,
            [myId]: {
              ...player,
              tokens: { ...player.tokens, social: player.tokens.social - 1 },
              hand: player.hand.filter((c) => c.id !== actionCard.id),
            },
          },
        },
        myId,
        player.name,
        `token Social : propose échange ${actionCard.value}${actionCard.suit} → ${getPlayerName(targetId)}`,
      ),
    );
    cancelAction();
  }

  function cancelAction() {
    action = null;
    actionCard = null;
    acceptingExchange = null;
    choosingToken = null;
  }

  /** @param {string} tokenKey @param {string} label */
  function useCombat(tokenKey, label) {
    if (!player) return;
    const id = /** @type {string} */ (/** @type {unknown} */ (myId));
    const tokens = /** @type {any} */ (player.tokens);
    if (tokens[tokenKey] <= 0) return;
    const newTokens = { ...tokens, [tokenKey]: tokens[tokenKey] - 1 };
    const gs = /** @type {any} */ (gameState);
    pushState(addLog(
      { ...gs, players: { ...gs.players, [id]: { ...player, tokens: newTokens } } },
      id, player.name, `token ${label} : usage combat`,
    ));
    choosingToken = null;
  }

  // ── Exchange acceptance ───────────────────────────────────────────────
  function startAccept(exchange) {
    acceptingExchange = exchange;
    action = "accept-exchange";
  }

  function completeAccept(myCard) {
    const ex = acceptingExchange;
    const fromPlayer = gameState.players[ex.from];
    pushState(
      addLog(
        {
          ...gameState,
          pendingExchanges: gameState.pendingExchanges.filter(
            (e) => e.id !== ex.id,
          ),
          players: {
            ...gameState.players,
            [ex.from]: { ...fromPlayer, hand: [...fromPlayer.hand, myCard] },
            [myId]: {
              ...player,
              hand: [
                ...player.hand.filter((c) => c.id !== myCard.id),
                ex.fromCard,
              ],
            },
          },
        },
        myId,
        player.name,
        `accepte échange avec ${getPlayerName(ex.from)} : donne ${myCard.value}${myCard.suit}, reçoit ${ex.fromCard.value}${ex.fromCard.suit}`,
      ),
    );
    cancelAction();
  }

  function declineExchange(exchange) {
    const fromPlayer = gameState.players[exchange.from];
    pushState(
      addLog(
        {
          ...gameState,
          pendingExchanges: gameState.pendingExchanges.filter(
            (e) => e.id !== exchange.id,
          ),
          players: {
            ...gameState.players,
            [exchange.from]: {
              ...fromPlayer,
              hand: [...fromPlayer.hand, exchange.fromCard],
              tokens: { ...fromPlayer.tokens, social: fromPlayer.tokens.social + 1 }
            },
          },
        },
        myId,
        player.name,
        `refuse échange de ${getPlayerName(exchange.from)} (${exchange.fromCard.value}${exchange.fromCard.suit})`,
      ),
    );
  }

  // ── Gray out ──────────────────────────────────────────────────────────
  function toggleGray(card, isCrystallized) {
    if (!player || isCrystallized) return;
    const grayed = player.grayedCards ?? [];
    const next = grayed.includes(card.id)
      ? grayed.filter((id) => id !== card.id)
      : [...grayed, card.id];
    pushState({
      ...gameState,
      players: {
        ...gameState.players,
        [myId]: { ...player, grayedCards: next },
      },
    });
    active = null;
  }

  // ── Fan card click — route to action or toggle ─────────────────────────
  function onCardClick(card, isCrystallized) {
    const isGrayed = (player?.grayedCards ?? []).includes(card.id);
    if (action === "agilite-pick-card" && !isCrystallized && !isGrayed) {
      agilitePickCard(card);
      return;
    }
    if (action === "social-pick-card" && !isCrystallized && !isGrayed) {
      socialPickCard(card);
      return;
    }
    if (action) return;
    active = active?.card.id === card.id ? null : { card, isCrystallized };
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

  const TOKEN_COLOR = /** @type {{ [key: string]: string }} */ ({
    force: "#ef4444",
    agilite: "#22c55e",
    esprit: "#3b82f6",
    social: "#eab308",
  });
  const TOKENS = [
    {
      key: "force",
      label: "Force",
      disabled: () => !player || player.tokens.force <= 0,
      use: useForce,
    },
    {
      key: "agilite",
      label: "Agilité",
      disabled: () =>
        !player || player.tokens.agilite <= 0 || player.hand.length === 0,
      use: startAgilite,
    },
    {
      key: "esprit",
      label: "Esprit",
      disabled: () => !player || player.tokens.esprit <= 0,
      use: useEsprit,
    },
    {
      key: "social",
      label: "Social",
      disabled: () =>
        !player || player.tokens.social <= 0 || player.hand.length === 0,
      use: startSocial,
    },
  ];

  // ── Fan geometry ──────────────────────────────────────────────────────
  const MAX_ROT = 20;
  const SPREAD_X = 64;
  const ARC_Y = 22;

  function fanStyle(i, n) {
    const t = n > 1 ? i / (n - 1) - 0.5 : 0;
    const rot = t * MAX_ROT * 2;
    const tx = t * SPREAD_X * (n - 1);
    const ty = Math.abs(t) * ARC_Y * 2;
    return `transform: translateX(${tx}px) translateY(${ty}px) rotate(${rot}deg);`;
  }

  const SUIT_COLOR = {
    "♠": "#1e293b",
    "♣": "#1e293b",
    "♥": "#dc2626",
    "♦": "#dc2626",
  };
</script>

<div
  class="magic-hand w-full h-full flex flex-col select-none overflow-visible flex-wrap"
  style="background: transparent;"
>
  {#if !ready || !player}
    <div class="flex-1 flex items-center justify-center">
      <p class="text-xs text-gray-400">Chargement...</p>
    </div>
  {:else}
    <!-- ── Popup area: token mechanic prompts above the cards ─────────── -->
    <div
      class="flex-1 flex flex-col items-center justify-end pb-1 overflow-visible pointer-events-none relative bottom-[-70px]"
    >
      {#if action === "agilite-pick-card" || action === "social-pick-card"}
        <div
          class="pointer-events-auto px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white mb-1"
          style="background: rgba(30,30,50,0.92); border: 1px solid rgba(255,255,255,0.15);"
        >
          {#if action === "agilite-pick-card"}Agilité — cliquez la carte à <strong
              >défausser</strong
            >
          {:else}Social — cliquez la carte à <strong>offrir</strong>{/if}
          <button
            onclick={cancelAction}
            class="ml-2 opacity-60 hover:opacity-100">✕</button
          >
        </div>
      {:else if action === "agilite-pick-suit"}
        <div
          class="pointer-events-auto flex flex-col items-center gap-1.5 px-3 py-2 rounded-lg mb-1"
          style="background: rgba(30,30,50,0.92); border: 1px solid rgba(255,255,255,0.15);"
        >
          <p class="text-[11px] text-green-300 font-semibold">
            Pioche spécialisée — défausse <span class="text-white"
              >{actionCard.value}{actionCard.suit}</span
            >
          </p>
          <div class="grid grid-cols-4 gap-1">
            {#each SUITS_INFO as s}
              <button
                onclick={() => agilitePickSuit(s.symbol)}
                class="flex flex-col items-center py-1 px-2 rounded border text-xs font-bold"
                class:text-red-400={s.isRed}
                class:border-red-700={s.isRed}
                class:bg-red-950={s.isRed}
                class:text-gray-200={!s.isRed}
                class:border-gray-600={!s.isRed}
                class:bg-gray-800={!s.isRed}>{s.symbol}</button
              >
            {/each}
          </div>
          <button
            onclick={cancelAction}
            class="text-[10px] text-gray-500 hover:text-gray-300 underline"
            >Annuler</button
          >
        </div>
      {:else if action === "social-pick-target"}
        <div
          class="pointer-events-auto flex flex-col items-center gap-1 px-3 py-2 rounded-lg mb-1"
          style="background: rgba(30,30,50,0.92); border: 1px solid rgba(255,255,255,0.15);"
        >
          <p class="text-[11px] text-yellow-300 font-semibold">
            Offrir <span class="text-white"
              >{actionCard.value}{actionCard.suit}</span
            > à :
          </p>
          <div class="flex flex-wrap gap-1 justify-center">
            {#each otherPlayerIds as id}
              <button
                onclick={() => socialPickTarget(id)}
                class="text-[10px] px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                {getPlayerName(id)}
              </button>
            {/each}
            {#if otherPlayerIds.length === 0}
              <p class="text-[10px] text-gray-500 italic">
                Aucun autre joueur.
              </p>
            {/if}
          </div>
          <button
            onclick={cancelAction}
            class="text-[10px] text-gray-500 hover:text-gray-300 underline"
            >Annuler</button
          >
        </div>
      {:else if action === "accept-exchange"}
        <div
          class="pointer-events-auto flex flex-col items-center gap-1 px-3 py-2 rounded-lg mb-1 w-full max-w-xs"
          style="background: rgba(30,30,50,0.92); border: 1px solid rgba(255,255,255,0.15);"
        >
          <p class="text-[11px] text-green-300 font-semibold">
            Choisissez la carte à donner en retour :
          </p>
          <div class="flex flex-wrap gap-1.5 justify-center">
            {#each player.hand as card (card.id)}
              <div
                class="w-[56px] h-[84px] rounded cursor-pointer hover:ring-2 hover:ring-green-400 flex flex-col p-1 text-[10px] font-bold"
                style="background: #fff; border: 1.5px solid #d1d5db; color: {SUIT_COLOR[
                  card.suit
                ] ?? '#111827'};"
                role="button"
                tabindex="0"
                onclick={() => completeAccept(card)}
                onkeydown={(e) => e.key === "Enter" && completeAccept(card)}
              >
                <span>{card.value}{card.suit}</span>
                <span
                  class="flex-1 flex items-center justify-center text-[20px]"
                  >{card.suit}</span
                >
              </div>
            {/each}
          </div>
          <button
            onclick={cancelAction}
            class="text-[10px] text-gray-500 hover:text-gray-300 underline"
            >Annuler</button
          >
        </div>
      {:else if choosingToken !== null}
        {@const ctok = TOKENS.find(t => t.key === choosingToken)}
        <div
          class="pointer-events-auto flex flex-col items-center gap-2 px-3 py-2 rounded-lg mb-1 w-full max-w-[220px]"
          style="background: rgba(20,20,40,0.95); border: 1px solid {TOKEN_COLOR[choosingToken]}55;"
        >
          <p class="text-[11px] font-semibold" style="color: {TOKEN_COLOR[choosingToken]}">
            Token {ctok?.label} — usage :
          </p>
          <div class="flex gap-2 w-full">
            <button
              onclick={() => { ctok?.use(); choosingToken = null; }}
              class="flex-1 py-1.5 rounded text-[11px] font-bold text-white"
              style="background: {TOKEN_COLOR[choosingToken]}30; border: 1px solid {TOKEN_COLOR[choosingToken]};"
            >Carte</button>
            <button
              onclick={() => useCombat(choosingToken ?? '', ctok?.label ?? choosingToken ?? '')}
              class="flex-1 py-1.5 rounded text-[11px] font-bold text-gray-200 bg-gray-700 hover:bg-gray-600 border border-gray-600"
            >Combat</button>
          </div>
          <button onclick={() => choosingToken = null} class="text-[9px] text-gray-500 hover:text-gray-300 underline">Annuler</button>
        </div>

      {:else if incomingExchanges.length > 0}
        <div class="pointer-events-auto flex flex-col gap-1.5 w-full px-2 mb-1">
          {#each incomingExchanges as ex (ex.id)}
            <div
              class="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px]"
              style="background: rgba(30,30,10,0.92); border: 1px solid rgba(234,179,8,0.4);"
            >
              <span class="text-yellow-300 font-semibold shrink-0"
                >{getPlayerName(ex.from)} →</span
              >
              <span class="text-white font-bold shrink-0"
                >{ex.fromCard.value}{ex.fromCard.suit}</span
              >
              <div class="flex gap-1 ml-auto shrink-0">
                <button
                  onclick={() => startAccept(ex)}
                  class="px-2 py-0.5 bg-green-700 hover:bg-green-600 text-white rounded text-[10px] font-bold"
                  >Accepter</button
                >
                <button
                  onclick={() => declineExchange(ex)}
                  class="px-2 py-0.5 bg-red-800 hover:bg-red-700 text-red-200 rounded text-[10px] font-bold"
                  >Refuser</button
                >
              </div>
            </div>
          {/each}
        </div>
      {:else if outgoingExchange}
        <div
          class="pointer-events-auto px-3 py-1.5 rounded-lg text-[11px] text-indigo-300 mb-1"
          style="background: rgba(30,30,50,0.92); border: 1px solid rgba(99,102,241,0.3);"
        >
          Échange en attente avec <span class="text-white"
            >{getPlayerName(outgoingExchange.to)}</span
          >
          <span class="text-gray-500 ml-1"
            >({outgoingExchange.fromCard.value}{outgoingExchange.fromCard
              .suit})</span
          >
        </div>
      {/if}
    </div>

    <!-- ── Card fan ────────────────────────────────────────────────────── -->
    <div
      class="shrink-0 relative flex items-end justify-center overflow-visible bottom-[-40px]"
      style="height: 200px;"
    >
      {#if allCards.length === 0}
        <p class="text-[10px] text-gray-600 pb-2">Aucune carte</p>
      {:else}
        <div
          class="relative flex items-end justify-center"
          style="width: {Math.max(
            300,
            allCards.length * SPREAD_X + 120,
          )}px; height: 200px;"
        >
          {#each allCards as { card, isCrystallized }, i (card.id)}
            {@const isActive = active?.card.id === card.id}
            {@const isGrayed = (player.grayedCards ?? []).includes(card.id)}
            {@const isSelectable =
              (action === "agilite-pick-card" ||
                action === "social-pick-card") &&
              !isCrystallized &&
              !isGrayed}
            {@const n = allCards.length}

            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div
              class="absolute bottom-0 left-1/2 cursor-pointer transition-all duration-150"
              style="
                {fanStyle(i, n)}
                margin-left: -40px;
                z-index: {isActive ? 50 : i};
                transform-origin: bottom center;
                filter: {isActive
                ? 'drop-shadow(0 -8px 12px rgba(99,102,241,0.8))'
                : isSelectable
                  ? 'drop-shadow(0 0 8px rgba(250,204,21,0.7))'
                  : 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))'};
                {isActive
                ? 'transform: ' +
                  fanStyle(i, n).replace('transform:', '').replace(';', '') +
                  ' translateY(-28px);'
                : ''}
              "
              onclick={() => onCardClick(card, isCrystallized)}
            >
              <div
                class="relative w-[80px] h-[120px] rounded-lg flex flex-col p-1 text-[12px] font-bold leading-none"
                style="
                  background: {isCrystallized ? '#ef9b9b' : '#ffffff'};
                  border: {isCrystallized
                  ? '2.5px solid #ef4444'
                  : '1.5px solid #d1d5db'};
                  color: {SUIT_COLOR[card.suit] ?? '#111827'};
                "
              >
                <div class="flex flex-col items-start">
                  <span>{card.value}</span><span class="text-[14px]"
                    >{card.suit}</span
                  >
                </div>
                <div
                  class="flex-1 flex items-center justify-center text-[28px]"
                >
                  {card.suit}
                </div>
                <div class="flex flex-col items-end rotate-180">
                  <span>{card.value}</span><span class="text-[14px]"
                    >{card.suit}</span
                  >
                </div>
                <!-- Gray overlay -->
                {#if isGrayed}
                  <div
                    class="absolute inset-0 rounded-lg"
                    style="background: rgba(0,0,0,0.55);"
                  ></div>
                {/if}
              </div>

              <!-- Per-card action buttons when active -->
              {#if isActive && !action}
                <div
                  class="absolute -top-[52px] left-1/2 -translate-x-1/2 flex gap-1 z-50"
                >
                  <button
                    onclick={(e) => {
                      e.stopPropagation();
                      discard(card, isCrystallized);
                    }}
                    class="px-2.5 py-1 text-[11px] font-bold bg-red-700 hover:bg-red-600 text-white rounded-lg shadow-lg"
                    title="Défausser">▶️</button
                  >
                  {#if !isCrystallized}
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        crystallize(card);
                      }}
                      disabled={(player.spiritBounds ?? 0) <= 0}
                      class="px-2.5 py-1 text-[11px] font-bold bg-blue-700 hover:bg-blue-600 text-white rounded-lg shadow-lg disabled:opacity-40"
                      title="Cristalliser (−1 Spirit Bound)">✦</button
                    >
                  {/if}
                  {#if !isCrystallized}
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        toggleGray(card, isCrystallized);
                      }}
                      class="px-2.5 py-1 text-[11px] font-bold rounded-lg shadow-lg"
                      class:bg-gray-600={!isGrayed}
                      class:hover:bg-gray-500={!isGrayed}
                      class:bg-gray-400={isGrayed}
                      class:hover:bg-gray-300={isGrayed}
                      class:text-white={!isGrayed}
                      class:text-gray-800={isGrayed}
                      title={isGrayed ? "Dégrisonner" : "Grisonner"}>◑</button
                    >
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- ── Bottom bar: Draw + Token buttons ──────────────────────────── -->
    <div
      class="shrink-0 flex items-center justify-center px-2 py-1.5 relative bottom-[-50px]"
      style="z-index: 100;"
    >
      <!-- Draw button -->
      <button
        onclick={drawCard}
        disabled={handFull || mustCrystallize}
        class="text-[11px] font-semibold px-3 py-1.5 rounded-lg text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style="background: {mustCrystallize
          ? '#b45309'
          : '#4f46e5'}; white-space: nowrap; flex-shrink: 0;"
      >
        {mustCrystallize
          ? `Cristalliser d'abord !`
          : handFull
            ? `Pleine ${player.hand.length}/${player.maxHandSize + (player.spiritBounds ?? 0)}`
            : `Piocher ${player.hand.length}/${player.maxHandSize + (player.spiritBounds ?? 0)}`}
      </button>
      {#if (player.spiritBounds ?? 0) > 0}
        <span
          class="text-[18px] text-blue-400 font-semibold ml-2 shrink-0"
          title="Spirit Bounds actifs">✦×{player.spiritBounds}</span
        >
      {/if}
    </div>
    <div
      class="shrink-0 flex items-center justify-center px-2 py-1.5 relative bottom-[-60px]"
    >
      <!-- Token buttons -->
      {#each TOKENS as tok}
        {@const current = player.tokens[tok.key]}
        {@const max = player.maxTokens?.[tok.key] ?? current}
        {@const active_tok = action?.startsWith(tok.key)}
        <button
          onclick={() => choosingToken = tok.key}
          disabled={tok.disabled() || (action !== null && !active_tok) || choosingToken !== null}
          title={tok.label}
          class="flex-1 flex flex-col items-center py-1 mx-1 border text-[9px] font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          style="
            background: #213547;
            border-color: {TOKEN_COLOR[tok.key] + (active_tok ? 'cc' : '50')};
            color: {TOKEN_COLOR[tok.key]}
          "
        >
          <span class="text-[11px] leading-none font-bold">{current}/{max}</span
          >
          <span class="leading-none mt-0.5 opacity-80">{tok.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
