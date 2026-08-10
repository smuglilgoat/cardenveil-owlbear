<script>
  import { onMount, onDestroy } from "svelte";
  import OBR from "@owlbear-rodeo/sdk";
  import { GM_CHAR_ID, sortCards, FATIGUE_PENALTY, handCap, RACES } from "./lib/deck.js";
  import { startRealtime, stopRealtime, dispatch, fetchState } from "./lib/api.js";
  import { tooltip } from "./lib/tooltip.js";

  let ready = $state(false);
  let myId = $state(null);
  let roomId = $state(null);
  let party = $state([]);
  let gameState = $state(null);
  let active = $state(null);

  let action = $state(null);
  let actionCard = $state(null);

  let unsubParty = null;

  async function onAction(actionObj) {
    try {
      const newState = await dispatch(roomId, actionObj);
      if (newState) gameState = newState;
    } catch (e) {
      console.error('Dispatch failed:', e);
    }
  }

  onMount(() => {
    OBR.onReady(async () => {
      myId = await OBR.player.getId();
      roomId = OBR.room.id;
      party = await OBR.party.getPlayers();
      ready = true;

      let state = await fetchState(roomId);
      if (state) {
        gameState = state;
      }

      startRealtime(roomId, (newState) => {
        gameState = newState;
      });

      unsubParty = OBR.party.onChange((p) => {
        party = p;
      });
    });
  });

  onDestroy(() => {
    stopRealtime();
    unsubParty?.();
  });

  // ── Derived ───────────────────────────────────────────────────────────
  let player = $derived(gameState?.players?.[myId] ?? null);
  let handFull = $derived(
    player
      ? player.hand.length >= handCap(player)
      : false,
  );

  let mustCrystallize = $derived(
    player
      ? (player.spiritBounds ?? 0) > 0 &&
          player.hand.length >= handCap(player)
      : false,
  );

  let spiritLocked = $derived(
    player ? player.hand.length <= (player.spiritBounds ?? 0) : false,
  );

  let drawBlocked = $derived(
    !player || handFull || mustCrystallize || player.pendingHalfling != null,
  );

  let allCards = $derived(
    player
      ? [
          ...player.hand.map((c) => ({ card: c, isCrystallized: false })),
          ...player.crystallized.map((c) => ({ card: c, isCrystallized: true })),
        ].sort((a, b) => {
          const suitOrder = { '♥': 0, '♣': 1, '♦': 2, '♠': 3 };
          return (suitOrder[a.card.suit] - suitOrder[b.card.suit]) || (a.card.numericValue - b.card.numericValue);
        })
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

  let interactionFrozen = $derived(
    (player?.pendingHalfling != null) ||
    (incomingExchanges.length > 0 && action !== "accept-exchange") ||
    outgoingExchange !== null ||
    (action !== null && action !== "accept-exchange" && action !== "agilite-pick-card" && action !== "social-pick-card" && action !== "sporelin-pick-card" && action !== "sporelin-pick-target") ||
    choosingToken !== null
  );

  $effect(() => {
    if (interactionFrozen) active = null;
  });

  function discard(card, isCrystallized) {
    if (!player) return;
    if (!isCrystallized) {
      const isGrayed = (player.grayedCards ?? []).includes(card.id);
      if (spiritLocked || isGrayed) return;
    }
    onAction({ type: 'DISCARD', playerId: myId, cardId: card.id, from: isCrystallized ? 'crystallized' : 'hand' });
    active = null;
  }

  function crystallize(card) {
    if (!player || (player.spiritBounds ?? 0) <= 0) return;
    onAction({ type: 'CRYSTALLIZE', playerId: myId, cardId: card.id });
    active = null;
  }

  function drawCard() {
    if (drawBlocked) return;
    if (player.race === 'tieffelin' && player.tieflingDrawEligible) {
      action = 'tiefling-choose';
      return;
    }
    onAction({ type: 'DRAW', playerId: myId });
  }

  function useForce() {
    if (!player || player.tokens.force <= 0) return;
    onAction({ type: 'DRAW_FORCE', playerId: myId });
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
    onAction({ type: 'USE_AGILITE', playerId: myId, cardId: actionCard.id, suit });
    cancelAction();
  }

  function useEsprit() {
    if (!player || player.tokens.esprit <= 0) return;
    onAction({ type: 'USE_ESPRIT', playerId: myId });
  }

  // ── Token: Social ─────────────────────────────────────────────────────
  function startSocial() {
    if (!player || player.tokens.social <= 0 || player.hand.length === 0 || spiritLocked)
      return;
    action = "social-pick-card";
    active = null;
  }

  function socialPickCard(card) {
    actionCard = card;
    action = "social-pick-target";
  }

  function socialPickTarget(targetId) {
    onAction({ type: 'PROPOSE_EXCHANGE', playerId: myId, cardId: actionCard.id, targetId });
    cancelAction();
  }

  // ── Sporelin exchange (free) ──────────────────────────────────────────
  let sporelinBlocked = $derived(
    !player ||
    player.race !== 'sporelin' ||
    player.hand.length === 0 ||
    spiritLocked ||
    player.pendingHalfling != null ||
    outgoingExchange !== null ||
    incomingExchanges.length > 0
  );

  function startSporelinExchange() {
    if (sporelinBlocked) return;
    action = 'sporelin-pick-card';
  }

  function sporelinPickCard(card) {
    actionCard = card;
    action = 'sporelin-pick-target';
  }

  function sporelinPickTarget(targetId) {
    onAction({ type: 'SPORELIN_EXCHANGE', playerId: myId, cardId: actionCard.id, targetId });
    cancelAction();
  }

  function cancelAction() {
    action = null;
    actionCard = null;
    acceptingExchange = null;
    choosingToken = null;
  }

  function useCombat(tokenKey, label) {
    if (!player) return;
    const tokens = player.tokens;
    if (tokens[tokenKey] <= 0) return;
    onAction({ type: 'SPEND_TOKEN', playerId: myId, token: tokenKey });
    choosingToken = null;
  }

  // ── Exchange acceptance ───────────────────────────────────────────────
  function startAccept(exchange) {
    acceptingExchange = exchange;
    action = "accept-exchange";
  }

  function completeAccept(myCard) {
    const ex = acceptingExchange;
    onAction({ type: 'ACCEPT_EXCHANGE', playerId: myId, exchangeId: ex.id, cardId: myCard.id });
    cancelAction();
  }

  function declineExchange(exchange) {
    onAction({ type: 'DECLINE_EXCHANGE', playerId: myId, exchangeId: exchange.id });
  }

  function toggleGray(card, isCrystallized) {
    if (!player || isCrystallized) return;
    onAction({ type: 'TOGGLE_GRAY', playerId: myId, cardId: card.id });
    active = null;
  }

  // ── Fan card click — route to action or toggle ─────────────────────────
  function onCardClick(card, isCrystallized) {
    if (interactionFrozen) return;
    if (card._pending) return;
    const isGrayed = (player?.grayedCards ?? []).includes(card.id);
    if (action === "agilite-pick-card" && !isCrystallized && !isGrayed) {
      agilitePickCard(card);
      return;
    }
    if (action === "social-pick-card" && !isCrystallized && !isGrayed) {
      socialPickCard(card);
      return;
    }
    if (action === "sporelin-pick-card" && !isCrystallized && !isGrayed) {
      sporelinPickCard(card);
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
      disabled: () => !player || player.tokens.agilite <= 0,
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
      disabled: () => !player || player.tokens.social <= 0,
      use: startSocial,
    },
  ];

  const RACE_PASSIVE_TIP = /** @type {{ [key: string]: string }} */ ({
    'haut-elfe': 'Passif : Vous avez +1 carte en main',
    'tieffelin': 'Passif : Vous pouvez choisir de piocher du Pique un tour sur deux',
    'aasimar':   'Passif : Quand vous utilisez un token, vous créez automatiquement une carte cristallisée Cœur',
    'halfling':  'Passif : À chaque pioche, piochez 2 cartes puis choisissez-en 1',
    'sporelin':  'Passif : Vous pouvez échanger une carte gratuitement avec un allié',
  });

  const TOKEN_CARTE_TIP = /** @type {{ [key: string]: string }} */ ({
    force:   'Piocher une carte',
    agilite: 'Échanger une carte avec une couleur spécifique, la valeur reste aléatoire',
    esprit:  'Crée un Spirit Slot qui étend la taille de la main. Vous pouvez cristalliser des cartes en consommant des Spirit Slots',
    social:  'Échanger une carte avec un allié',
  });

  const TOKEN_COMBAT_TIP = /** @type {{ [key: string]: string }} */ ({
    force:   'Attaque supplémentaire',
    agilite: 'Rendre une attaque de zone jusqu\'à 3 cibles',
    esprit:  'Marque une cible, les dégâts se répètent au prochain tour',
    social:  'Faire attaquer un allié',
  });

  // ── Card geometry (straight line) ────────────────────────────────────
  const SPREAD_X = 64;

  function cardTx(i, n) {
    const t = n > 1 ? i / (n - 1) - 0.5 : 0;
    return t * SPREAD_X * (n - 1);
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
      {#if player.pendingHalfling}
        <div
          class="pointer-events-auto flex flex-col items-center gap-2 px-3 py-2 rounded-lg mb-1"
          style="background: rgba(6,78,59,0.92); border: 1px solid rgba(16,185,129,0.5);"
        >
          <p class="text-[11px] text-emerald-200 font-semibold">
            Halfling — Choisissez la carte à conserver :
          </p>
          <div class="flex gap-2">
            {#each player.pendingHalfling as card (card.id)}
              <div class="flex flex-col items-center gap-1">
                {#if card._pending}
                  <div class="w-[56px] h-[84px] rounded-lg flex items-center justify-center" style="background: #1e1b4b; border: 1.5px solid #4338ca;">
                    <span class="text-indigo-500 text-lg">✦</span>
                  </div>
                {:else}
                  <div
                    class="w-[56px] h-[84px] rounded flex flex-col p-1 text-[10px] font-bold"
                    style="background: #fff; border: 1.5px solid #d1d5db; color: {SUIT_COLOR[card.suit] ?? '#111827'};"
                  >
                    <span>{card.value}{card.suit}</span>
                    <span class="flex-1 flex items-center justify-center text-[20px]">{card.suit}</span>
                  </div>
                {/if}
                <button
                  onclick={() => onAction({ type: 'HALFLING_CHOOSE', playerId: myId, cardId: card.id })}
                  disabled={!!card._pending}
                  use:tooltip={"Conserver cette carte et défausser l'autre"}
                  class="text-[10px] px-2 py-0.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded disabled:opacity-40 font-bold"
                >
                  Choisir
                </button>
              </div>
            {/each}
          </div>
        </div>
      {:else if action === "agilite-pick-card" || action === "social-pick-card" || action === "sporelin-pick-card"}
        <div
          class="pointer-events-auto px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white mb-1"
          style="background: rgba(30,30,50,0.92); border: 1px solid rgba(255,255,255,0.15);"
        >
          {#if action === "agilite-pick-card"}Agilité — cliquez la carte à <strong
              >défausser</strong
            >
          {:else if action === "sporelin-pick-card"}Sporelin — cliquez la carte à <strong
              >offrir</strong
            >
          {:else}Social — cliquez la carte à <strong>offrir</strong>{/if}
          <button
            onclick={cancelAction}
            use:tooltip={"Annuler l'action en cours"}
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
                use:tooltip={"Piocher une carte " + s.label + " aléatoire"}
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
            use:tooltip={"Annuler l'action en cours"}
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
                use:tooltip={"Proposer l'échange à " + getPlayerName(id)}
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
            use:tooltip={"Annuler l'action en cours"}
            class="text-[10px] text-gray-500 hover:text-gray-300 underline"
            >Annuler</button
          >
        </div>
      {:else if action === "sporelin-pick-target"}
        <div
          class="pointer-events-auto flex flex-col items-center gap-1 px-3 py-2 rounded-lg mb-1"
          style="background: rgba(30,30,50,0.92); border: 1px solid rgba(168,85,247,0.4);"
        >
          <p class="text-[11px] text-purple-300 font-semibold">
            Sporelin — Offrir <span class="text-white"
              >{actionCard.value}{actionCard.suit}</span
            > à :
          </p>
          <div class="flex flex-wrap gap-1 justify-center">
            {#each otherPlayerIds as id}
              <button
                onclick={() => sporelinPickTarget(id)}
                use:tooltip={"Échanger une carte avec " + getPlayerName(id) + " (gratuit)"}
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
            use:tooltip={"Annuler l'action en cours"}
            class="text-[10px] text-gray-500 hover:text-gray-300 underline"
            >Annuler</button
          >
        </div>
      {:else if action === "tiefling-choose"}
        <div
          class="pointer-events-auto flex flex-col items-center gap-2 px-3 py-2 rounded-lg mb-1"
          style="background: rgba(30,30,50,0.92); border: 1px solid rgba(168,85,247,0.4);"
        >
          <p class="text-[11px] text-purple-300 font-semibold">
            Tieffelin — Choisissez votre pioche :
          </p>
          <div class="flex gap-2 w-full">
            <button
              onclick={() => { onAction({ type: 'DRAW', playerId: myId }); cancelAction(); }}
              use:tooltip={"Pioche normale. Vous pourrez piocher du Pique au prochain tour"}
              class="flex-1 py-1.5 rounded text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-500"
            >
              Piocher normalement
            </button>
            <button
              onclick={() => { onAction({ type: 'DRAW_SPADE', playerId: myId }); cancelAction(); }}
              use:tooltip={"Pioche un Pique ce tour. Vous ne pourrez pas piocher du Pique au prochain tour"}
              class="flex-1 py-1.5 rounded text-[11px] font-bold text-gray-200 bg-gray-700 hover:bg-gray-600 border border-gray-600"
            >
              ♠ Pique
            </button>
          </div>
          <button onclick={() => cancelAction()} use:tooltip={"Annuler l'action en cours"} class="text-[9px] text-gray-500 hover:text-gray-300 underline">Annuler</button>
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
            {#each sortCards(player.hand.filter(c => !c._pending)) as card (card.id)}
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
              use:tooltip={TOKEN_CARTE_TIP[choosingToken ?? ''] ?? ''}
              class="flex-1 py-1.5 rounded text-[11px] font-bold text-white"
              style="background: {TOKEN_COLOR[choosingToken]}30; border: 1px solid {TOKEN_COLOR[choosingToken]};"
            >Carte</button>
            <button
              onclick={() => useCombat(choosingToken ?? '', ctok?.label ?? choosingToken ?? '')}
              use:tooltip={TOKEN_COMBAT_TIP[choosingToken ?? ''] ?? ''}
              class="flex-1 py-1.5 rounded text-[11px] font-bold text-gray-200 bg-gray-700 hover:bg-gray-600 border border-gray-600"
            >Combat</button>
          </div>
          <button onclick={() => choosingToken = null} use:tooltip={"Fermer sans utiliser de token"} class="text-[9px] text-gray-500 hover:text-gray-300 underline">Annuler</button>
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
                  use:tooltip={"Accepter l'échange et donner une carte en retour"}
                  class="px-2 py-0.5 bg-green-700 hover:bg-green-600 text-white rounded text-[10px] font-bold"
                  >Accepter</button
                >
                <button
                  onclick={() => declineExchange(ex)}
                  use:tooltip={"Refuser l'échange, la carte revient au proposeur"}
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
            allCards.length * SPREAD_X + 160,
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
            {@const btnAlign = n > 1 ? (i === 0 ? 'left' : i === n - 1 ? 'right' : 'center') : 'center'}

            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div
              class="absolute bottom-0 left-1/2 cursor-pointer transition-all duration-150"
              style="
                transform: translateX({cardTx(i, n)}px){isActive ? ' translateY(-28px)' : ''};
                margin-left: -40px;
                z-index: {isActive ? 50 : i};
                filter: {isActive
                ? 'drop-shadow(0 -8px 12px rgba(99,102,241,0.8))'
                : isSelectable
                  ? 'drop-shadow(0 0 8px rgba(250,204,21,0.7))'
                  : 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))'};
              "
              onclick={() => onCardClick(card, isCrystallized)}
            >
              {#if card._pending}
                <div
                  class="relative w-[80px] h-[120px] rounded-lg flex items-center justify-center"
                  style="background: #1e1b4b; border: 1.5px solid #4338ca;"
                >
                  <div class="w-[56px] h-[84px] rounded border border-indigo-700 bg-indigo-900 flex items-center justify-center">
                    <span class="text-indigo-500 text-lg">✦</span>
                  </div>
                </div>
              {:else}
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
                  <!-- Fatigue penalty badge -->
                  {#if FATIGUE_PENALTY[player?.fatigue ?? 0] > 0 && i === n - 1}
                    <div class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-600 border border-amber-400 flex items-center justify-center text-[9px] font-bold text-white leading-none z-10 pointer-events-none" title="Fatigue : −{FATIGUE_PENALTY[player?.fatigue ?? 0]}">
                      −{FATIGUE_PENALTY[player?.fatigue ?? 0]}
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Per-card action buttons when active -->
              {#if isActive && !action && !interactionFrozen}
                <div
                  class="absolute -top-[52px] flex gap-1 z-50 {btnAlign === 'left' ? 'left-0' : btnAlign === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'}"
                >
                  {#if isCrystallized || (!spiritLocked && !isGrayed)}
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        discard(card, isCrystallized);
                      }}
                      class="px-2.5 py-1 text-[11px] font-bold bg-red-700 hover:bg-red-600 text-white rounded-lg shadow-lg"
                      title="Défausser">▶️</button
                    >
                  {/if}
                  {#if !isCrystallized}
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        crystallize(card);
                      }}
                      disabled={(player.spiritBounds ?? 0) <= 0}
                      class="px-2.5 py-1 text-[11px] font-bold bg-blue-700 hover:bg-blue-600 text-white rounded-lg shadow-lg disabled:opacity-40"
                      title="Cristalliser (−1 Spirit Slot)">✦</button
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
                      title={isGrayed ? "Débloquer" : "Bloquer"}>◑</button
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
        disabled={drawBlocked}
        use:tooltip={player.pendingHalfling ? "Choisissez d'abord une carte parmi les deux piochées" : mustCrystallize ? "Défaussez d'abord, le maximum de cartes en main est atteint" : handFull ? "Défaussez d'abord, le maximum de cartes en main est atteint" : "Piocher une carte"}
        class="text-[11px] font-semibold px-3 py-1.5 rounded-lg text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        style="background: {mustCrystallize
          ? '#b45309'
          : '#4f46e5'}; white-space: nowrap; flex-shrink: 0;"
      >
        <span>{player.pendingHalfling
          ? `Choix en cours…`
          : mustCrystallize
            ? `Défaussez d'abord !`
            : handFull
              ? `Pleine ${player.hand.length}/${handCap(player)}`
              : `Piocher ${player.hand.length}/${handCap(player)}`}</span>
        {#if (player.spiritBounds ?? 0) > 0}
          <span class="text-blue-300 font-semibold" title="Spirit Bounds actifs">✦×{player.spiritBounds}</span>
        {/if}
        {#if player.race === 'tieffelin' && player.tieflingDrawEligible && !drawBlocked}
          <span class="text-purple-300 text-[9px] font-bold">♠</span>
        {/if}
      </button>
      {#if player.race === 'sporelin' && player.hand.length > 0}
        <button
          onclick={() => { active = null; startSporelinExchange(); }}
          disabled={sporelinBlocked}
          use:tooltip={"Si vous avez Sporelin, vous pouvez échanger une carte avec chacun de vos alliés"}
          class="text-[11px] font-semibold px-3 py-1.5 rounded-lg text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          style="background: #7c3aed; white-space: nowrap; flex-shrink: 0;"
        >
          <span>🍄 Échange</span>
        </button>
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
          onclick={() => { active = null; choosingToken = tok.key; }}
          disabled={tok.disabled() || (action !== null && !active_tok) || choosingToken !== null}
          use:tooltip={"Utiliser le token " + tok.label}
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
