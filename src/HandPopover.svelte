<script>
  import { onMount, onDestroy } from "svelte";
  import OBR from "@owlbear-rodeo/sdk";
  import { GM_CHAR_ID, createEmptyPlayer, createInitialGameState, fullDeck, sortCards, FATIGUE_PENALTY, handCap, RACES, SUITS_INFO } from "./lib/deck.js";
  import { startRealtime, stopRealtime, dispatch, fetchState } from "./lib/api.js";
  import { tooltip } from "./lib/tooltip.js";
  import { logEvent, logError, setLogContext } from "./lib/appLog.js";
  import { collectDiag, initDiag } from "./lib/diag.js";
  import { getHandAnchorPosition, toggleHandAnchor } from "./lib/handAnchor.js";
  import { suitColorBySymbol, classicSuitColor, getCardScheme, setCardScheme, onCardSchemeChange, CARD_SCHEME_KEY, STAT_COLORS } from "./lib/characterSheet.js";
  import HandModal from "./lib/HandModal.svelte";

  initDiag('hand');

  let ready = $state(false);
  let myId = $state(null);
  let roomId = $state(null);
  let party = $state([]);
  let gameState = $state(null);
  let active = $state(null);

  // Fold: the bar is always visible, the cards are shown above it or not
  let folded = $state(false);
  let popoverId = $state(null);

  // ── Popover footprint ─────────────────────────────────────────────────
  // The frame owns its size. The popover is bottom-anchored, so growing it
  // adds room ABOVE and nothing moves on the table: height = the rendered
  // bands (bar + fan + modal panel), width = max(bar, fan, modal) clamped to
  // the viewport. Replaces the old fixed 380 px / prompt-fitting dance.
  const MODAL_MIN_W = 380;
  const FAN_H = 120; // exactly the card height (no headroom)
  const EMPTY_FAN_H = 26;
  const MIN_H = 40;
  let barEl = $state(null);
  let barLeftEl = $state(null);
  let barCenterEl = $state(null);
  let barRightEl = $state(null);
  let fanEl = $state(null);
  // Room viewport (NOT window.innerWidth/innerHeight: inside the popover frame
  // those ARE the popover, so clamping against them shrinks it on every fit).
  let viewportW = $state(0);
  let viewportH = $state(0);
  let fitted = { w: 0, h: 0 };
  let fitting = false;
  let refitQueued = false;

  /** Fan width for n cards (unchanged formula — no cap, user decision). */
  function fanWidth(n) {
    return Math.max(320, n * SPREAD_X + 160);
  }

  /**
   * Intrinsic width of a bar group = sum of its (non-shrinking) children.
   * NOT `scrollWidth`: a group stretched by its grid track reports the TRACK
   * width, which fed the previous popover width back into the next fit and grew
   * it on every render. Children with `shrink-0` always report their natural
   * size, whatever the popover width is.
   */
  function groupWidth(el) {
    if (!el) return 0;
    const kids = [...el.children];
    return kids.reduce((sum, k) => sum + k.offsetWidth, 0) + Math.max(0, kids.length - 1) * 4; // gap-1
  }

  /** Bar width needed = the three groups + grid gaps, padding and border. */
  function barMinWidth() {
    const sum = groupWidth(barLeftEl) + groupWidth(barCenterEl) + groupWidth(barRightEl);
    return Math.max(320, sum + 26);
  }

  function popoverWidth() {
    const maxW = viewportW ? viewportW - 24 : Infinity;
    return Math.min(
      maxW,
      Math.max(barMinWidth(), fanWidth(allCards.length), modal ? MODAL_MIN_W : 0)
    );
  }

  /**
   * Resize the popover to its rendered content. Returns false when OBR refused
   * the resize (the caller may then revert the state that caused it).
   */
  async function fitPopover() {
    if (!popoverId || !barEl) return true;
    // One resize at a time: OBR rejects overlapping setHeight/setWidth calls.
    if (fitting) {
      refitQueued = true;
      return true;
    }
    fitting = true;
    try {
      const panel = /** @type {HTMLElement|null} */ (document.querySelector('[data-modal-panel]'));
      const contentH = barEl.offsetHeight + (fanEl?.offsetHeight ?? 0);
      // tall modals are allowed to grow the popover (no inner scrollbar)
      const maxH = viewportH ? viewportH - 80 : Infinity;
      const height = Math.round(
        Math.max(MIN_H, Math.min(maxH, modal && panel ? Math.max(contentH, panel.offsetHeight + 20) : contentH))
      );
      const width = Math.round(popoverWidth());
      if (Math.abs(height - fitted.h) < 4 && Math.abs(width - fitted.w) < 4) return true;
      await OBR.popover.setHeight(popoverId, height);
      await OBR.popover.setWidth(popoverId, width);
      const actual = await OBR.popover.getHeight(popoverId);
      if (actual != null && Math.abs(actual - height) > 4) {
        logEvent('warn', 'hand_popover_fit_failed', { message: `height ${height} → ${actual}` });
        return false;
      }
      fitted = { w: width, h: height };
      logEvent('info', 'hand_popover_metrics', { message: `${width}x${height}`, detail: { width, height, folded, modal, cards: allCards.length } });
      return true;
    } catch (err) {
      logError('hand_popover_fit_failed', err);
      return false;
    } finally {
      fitting = false;
      if (refitQueued) {
        refitQueued = false;
        requestAnimationFrame(() => fitPopover());
      }
    }
  }

  // Re-fit after anything that changes a rendered band.
  $effect(() => {
    void [folded, allCards.length, modal, ready, tokensOpen, action];
    requestAnimationFrame(() => fitPopover());
  });

  function toggleFold() {
    // Just flip: the sizing $effect re-fits after the DOM update (calling
    // fitPopover here measured the pre-flush DOM, i.e. without the fan).
    folded = !folded;
  }

  let action = $state(null);
  let actionCard = $state(null);

  let unsubParty = null;

  async function onAction(actionObj) {
    try {
      const newState = await dispatch(roomId, actionObj);
      if (newState) gameState = newState;
    } catch (e) {
      logError('hand_dispatch_failed', e);
    }
  }

  onMount(() => {
    if (!OBR.isAvailable) {
      // Standalone preview (no OBR context):
      //   hand.html?cards=12&state=fanned|folded|token|halfling|tiefling|suit|target|accept|incoming
      const params = new URLSearchParams(window.location.search);
      const count = Math.max(0, Math.min(40, parseInt(params.get('cards') || '7', 10) || 0));
      const demo = createEmptyPlayer('Démo');
      demo.hand = fullDeck().slice(0, count);
      demo.tokens = { force: 3, agilite: 2, esprit: 1, social: 0 };
      demo.maxTokens = { force: 5, agilite: 5, esprit: 5, social: 5 };
      myId = 'demo-player';
      roomId = 'demo-room';
      gameState = { ...createInitialGameState(), players: { 'demo-player': demo } };
      const state = params.get('state') || 'fanned';
      if (state === 'folded') folded = true;
      if (state === 'token') tokensOpen = true;
      if (state === 'tiefling') action = 'tiefling-choose';
      if (state === 'suit') { actionCard = demo.hand[0]; action = 'agilite-pick-suit'; }
      if (state === 'target') { actionCard = demo.hand[0]; action = 'social-pick-target'; }
      if (state === 'accept') { action = 'accept-exchange'; acceptingExchange = { id: 'demo', from: 'other' }; }
      if (state === 'halfling') demo.pendingHalfling = fullDeck().slice(0, 2);
      if (state === 'incoming') {
        gameState.pendingExchanges = [{ id: 'demo-ex', from: 'other-player', to: 'demo-player', fromCard: fullDeck()[0] }];
      }
      ready = true;
      if (params.get('diag') === '1') {
        setTimeout(
          () => logEvent('info', 'diag_snapshot', { message: 'standalone', detail: collectDiag('hand') }),
          400
        );
      }
      return;
    }
    OBR.onReady(async () => {
      const params = new URLSearchParams(window.location.search);
      const playerIdParam = params.get('playerId');
      popoverId = params.get('popoverId');
      myId = playerIdParam || await OBR.player.getId();
      roomId = OBR.room.id;
      setLogContext({ roomId, playerId: myId });
      party = await OBR.party.getPlayers();
      // Room viewport for the size clamps (see viewportW/H comment).
      viewportW = await OBR.viewport.getWidth();
      viewportH = await OBR.viewport.getHeight();
      ready = true;

      // Footprint data: where the interactive content starts inside the
      // transparent popover (the dead space above it is what swallows clicks
      // on the table). Dedupe in appLog caps this at one row per 30 s.
      setTimeout(() => {
        const rects = [...document.querySelectorAll('button')].map((el) => el.getBoundingClientRect());
        const topMost = rects.length ? Math.round(Math.min(...rects.map((r) => r.top))) : null;
        logEvent('info', 'hand_popover_geometry', {
          detail: {
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            topMostInteractive: topMost,
          },
        });
      }, 400);

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
    offCardScheme();
    window.removeEventListener('storage', onCardSchemeStorage);
  });

  // Cross-frame card-scheme sync (main panel ↔ popovers)
  function onCardSchemeStorage(e) {
    if (e.key === CARD_SCHEME_KEY) cardScheme = getCardScheme();
  }
  const offCardScheme = onCardSchemeChange((s) => (cardScheme = s));
  window.addEventListener('storage', onCardSchemeStorage);

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
      ? sortCards([...player.hand, ...player.crystallized]).map((c) => ({
          card: c,
          isCrystallized: player.crystallized.includes(c),
        }))
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
  let tokensOpen = $state(false); // the 🎟 Tokens modal is open
  let anchorPos = $state(getHandAnchorPosition()); // 'low' | 'high' (⇅ button)

  let interactionFrozen = $derived(
    (player?.pendingHalfling != null) ||
    (incomingExchanges.length > 0 && action !== "accept-exchange") ||
    outgoingExchange !== null ||
    (action !== null && action !== "accept-exchange" && action !== "agilite-pick-card" && action !== "social-pick-card" && action !== "sporelin-pick-card" && action !== "sporelin-pick-target") ||
    tokensOpen
  );

  // A running action freezes the fan: drop the card selection with it.
  $effect(() => {
    if (interactionFrozen) active = null;
  });

  /** Open modal (null = none). The fan-pick flows are bar hints, not modals. */
  let modal = $derived(
    player?.pendingHalfling ? 'halfling'
    : tokensOpen ? 'tokens'
    : action === 'tiefling-choose' ? 'tiefling'
    : action === 'agilite-pick-suit' ? 'suit'
    : action === 'social-pick-target' ? 'social-target'
    : action === 'sporelin-pick-target' ? 'sporelin-target'
    : action === 'accept-exchange' ? 'accept'
    : incomingExchanges.length > 0 ? 'incoming'
    : null
  );

  /** Contextual bar hint for the flows where the fan itself is the picker. */
  let pickHint = $derived(
    action === 'agilite-pick-card' ? 'Agilité — cliquez la carte à défausser'
    : action === 'sporelin-pick-card' ? 'Sporelin — cliquez la carte à offrir'
    : action === 'social-pick-card' ? 'Social — cliquez la carte à offrir'
    : null
  );

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
    tokensOpen = false;
  }

  function useCombat(tokenKey, label) {
    if (!player) return;
    const tokens = player.tokens;
    if (tokens[tokenKey] <= 0) return;
    onAction({ type: 'SPEND_TOKEN', playerId: myId, token: tokenKey });
    tokensOpen = false;
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

  // ── Card color scheme ('color' = sheet schema, 'classic' = red/black) ──
  let cardScheme = $state(getCardScheme());
  function faceSuitColor(card) {
    return cardScheme === 'classic'
      ? classicSuitColor(card.isRed)
      : suitColorBySymbol(card.suit, true);
  }
  function pickerSuitColor(s) {
    return cardScheme === 'classic'
      ? classicSuitColor(s.isRed)
      : suitColorBySymbol(s.symbol);
  }
  function toggleCardScheme() {
    setCardScheme(cardScheme === 'classic' ? 'color' : 'classic');
  }
</script>

<div
  data-diag="root"
  class="magic-hand w-full h-full flex flex-col select-none overflow-visible relative"
  style="background: transparent;"
>
  {#if !ready || !player}
    <div class="flex-1 flex items-center justify-center">
      <p class="text-xs text-gray-400">Chargement...</p>
    </div>
  {:else}
    <!-- ── Card fan: the band is exactly the card height ──────────────── -->
    {#if !folded}
      <div
        data-diag="fan"
        bind:this={fanEl}
        class="shrink-0 relative flex items-end justify-center overflow-visible"
        style="height: {allCards.length ? FAN_H : EMPTY_FAN_H}px;"
      >
        {#if allCards.length === 0}
          <p class="text-[10px] text-gray-600">Aucune carte</p>
        {:else}
          {@const n = allCards.length}
          <div
            class="relative flex items-end justify-center"
            style="width: {fanWidth(n)}px; height: {FAN_H}px;"
          >
            {#each allCards as { card, isCrystallized }, i (card.id)}
              {@const isActive = active?.card.id === card.id}
              {@const isGrayed = (player.grayedCards ?? []).includes(card.id)}
              {@const isSelectable =
                (action === "agilite-pick-card" || action === "social-pick-card") &&
                !isCrystallized &&
                !isGrayed}

              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div
                class="absolute bottom-0 left-1/2 cursor-pointer transition-all duration-150"
                style="
                  transform: translateX({cardTx(i, n)}px);
                  margin-left: -40px;
                  z-index: {isActive ? 50 : i};
                  filter: {isActive
                  ? 'drop-shadow(0 0 8px rgba(99,102,241,0.9))'
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
                      color: {faceSuitColor(card)};
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
                    <!-- Fatigue penalty badge (inside the card: the fan band
                         is exactly the card height, nothing may stick out) -->
                    {#if FATIGUE_PENALTY[player?.fatigue ?? 0] > 0 && i === n - 1}
                      <div class="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-amber-600 border border-amber-400 flex items-center justify-center text-[9px] font-bold text-white leading-none z-10 pointer-events-none" title="Fatigue : −{FATIGUE_PENALTY[player?.fatigue ?? 0]}">
                        −{FATIGUE_PENALTY[player?.fatigue ?? 0]}
                      </div>
                    {/if}
                  </div>
                {/if}

                <!-- Actions of the active card, inside its own bounds -->
                {#if isActive && !action && !interactionFrozen}
                  <div class="absolute inset-x-0 bottom-0 z-30 flex items-center justify-center gap-0.5 pb-0.5">
                    {#if isCrystallized || (!spiritLocked && !isGrayed)}
                      <button
                        onclick={(e) => {
                          e.stopPropagation();
                          discard(card, isCrystallized);
                        }}
                        class="w-6 h-6 p-0 flex items-center justify-center rounded-md text-[10px] font-bold bg-red-700/95 hover:bg-red-600 text-white transition-colors"
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
                        class="w-6 h-6 p-0 flex items-center justify-center rounded-md text-[10px] font-bold bg-blue-700/95 hover:bg-blue-600 text-white transition-colors disabled:opacity-40"
                        title="Cristalliser (−1 Spirit Slot)">✦</button
                      >
                    {/if}
                    {#if !isCrystallized}
                      <button
                        onclick={(e) => {
                          e.stopPropagation();
                          toggleGray(card, isCrystallized);
                        }}
                        class="w-6 h-6 p-0 flex items-center justify-center rounded-md text-[10px] font-bold transition-colors"
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
    {/if}

    <!-- ── Bottom bar: controls left, draw centred, tokens right ──────── -->
    <!-- 3-column grid with two equal 1fr tracks so the draw button sits at
         the exact centre of the bar (flex spacers would only balance the
         remaining space, which shifts with the side contents). -->
    <div
      data-diag="bar"
      bind:this={barEl}
      class="shrink-0 w-full grid grid-cols-[minmax(min-content,1fr)_auto_minmax(min-content,1fr)] items-center gap-1 px-1.5 py-1 overflow-x-auto rounded-lg border border-[#374151]"
      style="z-index: 100; background: rgba(17, 24, 39, 0.95);"
    >
      <!-- Left: fold toggle, colour (or the pick hint), exchange status -->
      <div bind:this={barLeftEl} class="flex items-center gap-1">
        <button
          onclick={toggleFold}
          use:tooltip={folded ? "Déplier la main sur la table" : "Replier la main (la barre reste)"}
          class="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold transition-colors whitespace-nowrap border {folded
            ? 'bg-[#213547] border-indigo-500 text-white'
            : 'bg-[#213547] border-gray-500 text-gray-200 hover:text-white'}"
        >{folded ? '🃏 Afficher' : '🃏 Replier'}</button>

        <button
          onclick={() => { anchorPos = toggleHandAnchor(); }}
          use:tooltip={anchorPos === 'high' ? "Descendre le popover (position basse)" : "Remonter le popover (position haute)"}
          class="shrink-0 w-6 h-6 p-0 flex items-center justify-center rounded-full text-[12px] font-bold bg-[#213547] border border-gray-500 text-gray-200 hover:text-white transition-colors"
        >{anchorPos === 'high' ? '⬇' : '⬆'}</button>

        {#if pickHint}
          <div
            class="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold text-white"
            style="background: rgba(30,30,50,0.92); border: 1px solid rgba(255,255,255,0.15);"
          >
            <span class="whitespace-nowrap">{pickHint}</span>
            <button
              onclick={cancelAction}
              use:tooltip={"Annuler l'action en cours"}
              class="shrink-0 opacity-60 hover:opacity-100">✕</button
            >
          </div>
        {/if}

        {#if outgoingExchange}
          <span
            use:tooltip={"Échange en attente de réponse de " + getPlayerName(outgoingExchange.to) + " (" + outgoingExchange.fromCard.value + outgoingExchange.fromCard.suit + ")"}
            class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold text-amber-300 whitespace-nowrap"
            style="background: rgba(120,53,15,0.4); border: 1px solid rgba(180,83,9,0.6);"
          >⏳ {getPlayerName(outgoingExchange.to)}</span>
        {/if}
      </div>

      <!-- Centre: draw (+ the sporelin exchange) -->
      <div bind:this={barCenterEl} class="flex items-center gap-1 justify-center">
        <button
          onclick={drawCard}
          disabled={drawBlocked}
          use:tooltip={player.pendingHalfling ? "Choisissez d'abord une carte parmi les deux piochées" : mustCrystallize ? "Défaussez d'abord, le maximum de cartes en main est atteint" : handFull ? "Défaussez d'abord, le maximum de cartes en main est atteint" : "Piocher une carte"}
          class="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-lg text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 whitespace-nowrap"
          style="background: {mustCrystallize ? '#b45309' : '#4f46e5'};"
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

        <button
          onclick={toggleCardScheme}
          title={cardScheme === 'classic' ? 'Passer aux couleurs par famille (♥ rouge, ♦ or, ♣ vert, ♠ gris)' : "Repasser au schéma classique rouge/noir"}
          class="shrink-0 w-6 h-6 p-0 flex items-center justify-center rounded-full text-[12px] font-bold bg-[#213547] border border-gray-500 text-gray-200 hover:text-white transition-colors"
        >🎨</button>

        {#if player.race === 'sporelin' && player.hand.length > 0}
          <button
            onclick={() => { active = null; startSporelinExchange(); }}
            disabled={sporelinBlocked}
            use:tooltip={"Si vous avez Sporelin, vous pouvez échanger une carte avec chacun de vos alliés"}
            class="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-lg text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            style="background: #7c3aed;"
          >🍄</button>
        {/if}
      </div>

      <!-- Right: single tokens chip (the four usages live in the modal) -->
      <div bind:this={barRightEl} class="flex items-center gap-1 justify-end">
        <button
          onclick={() => { active = null; tokensOpen = true; }}
          disabled={action !== null || tokensOpen}
          use:tooltip={"Tokens — Force " + player.tokens.force + "/" + (player.maxTokens?.force ?? player.tokens.force) +
            " · Agilité " + player.tokens.agilite + "/" + (player.maxTokens?.agilite ?? player.tokens.agilite) +
            " · Esprit " + player.tokens.esprit + "/" + (player.maxTokens?.esprit ?? player.tokens.esprit) +
            " · Social " + player.tokens.social + "/" + (player.maxTokens?.social ?? player.tokens.social)}
          class="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
          style="background: #213547; border-color: #4b5563;"
        >
          <span class="leading-none">🎟</span>
          {#each TOKENS as tok}
            <span class="leading-none" style="color: {STAT_COLORS[tok.key]}">{player.tokens[tok.key]}</span>
          {/each}
        </button>
      </div>
    </div>

    <!-- ── Modals (dark backdrop over the cards) ──────────────────────── -->
    {#if modal === 'tokens'}
      <HandModal title="Tokens — usage" accent="#6366f1" onClose={() => (tokensOpen = false)}>
        <div class="flex flex-col gap-1.5">
          {#each TOKENS as tok}
            {@const current = player.tokens[tok.key]}
            {@const max = player.maxTokens?.[tok.key] ?? current}
            {@const active_tok = action?.startsWith(tok.key)}
            <div class="flex items-center gap-1.5">
              <span
                class="w-14 shrink-0 text-[11px] font-bold"
                style="color: {STAT_COLORS[tok.key]}"
              >{tok.label}</span>
              <span class="w-9 shrink-0 text-[11px] font-bold text-center" style="color: {STAT_COLORS[tok.key]}">{current}/{max}</span>
              <button
                onclick={() => { tokensOpen = false; tok.use(); }}
                disabled={tok.disabled() || (action !== null && !active_tok)}
                use:tooltip={TOKEN_CARTE_TIP[tok.key] ?? ''}
                class="flex-1 py-1 rounded-md text-[11px] font-bold text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style="background: {STAT_COLORS[tok.key]}30; border: 1px solid {STAT_COLORS[tok.key]};"
              >Carte</button>
              <button
                onclick={() => useCombat(tok.key, tok.label)}
                disabled={tok.disabled() || (action !== null && !active_tok)}
                use:tooltip={TOKEN_COMBAT_TIP[tok.key] ?? ''}
                class="flex-1 py-1 rounded-md text-[11px] font-bold text-gray-200 bg-gray-700 hover:bg-gray-600 border border-gray-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >Combat</button>
            </div>
          {/each}
        </div>
      </HandModal>

    {:else if modal === 'halfling'}
      <HandModal title="Halfling — choisissez la carte à conserver" accent="#34d399" closable={false}>
        <div class="flex gap-3 justify-center">
          {#each player.pendingHalfling as card (card.id)}
            <div class="flex flex-col items-center gap-1.5">
              {#if card._pending}
                <div class="w-[56px] h-[84px] rounded-lg flex items-center justify-center" style="background: #1e1b4b; border: 1.5px solid #4338ca;">
                  <span class="text-indigo-500 text-lg">✦</span>
                </div>
              {:else}
                <div
                  class="w-[56px] h-[84px] rounded flex flex-col p-1 text-[10px] font-bold"
                  style="background: #fff; border: 1.5px solid #d1d5db; color: {faceSuitColor(card)};"
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
              >Choisir</button>
            </div>
          {/each}
        </div>
      </HandModal>

    {:else if modal === 'tiefling'}
      <HandModal title="Tieffelin — choisissez votre pioche" accent="#a78bfa" onClose={cancelAction}>
        <div class="flex gap-2">
          <button
            onclick={() => { onAction({ type: 'DRAW', playerId: myId }); cancelAction(); }}
            use:tooltip={"Pioche normale. Vous pourrez piocher du Pique au prochain tour"}
            class="flex-1 py-2 rounded-lg text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
          >Piocher normalement</button>
          <button
            onclick={() => { onAction({ type: 'DRAW_SPADE', playerId: myId }); cancelAction(); }}
            use:tooltip={"Pioche un Pique ce tour. Vous ne pourrez pas piocher du Pique au prochain tour"}
            class="flex-1 py-2 rounded-lg text-[11px] font-bold text-gray-200 bg-gray-700 hover:bg-gray-600 border border-gray-600 transition-colors"
          >♠ Pique</button>
        </div>
      </HandModal>

    {:else if modal === 'suit'}
      <HandModal
        title={`Pioche spécialisée — défausse ${actionCard?.value ?? ''}${actionCard?.suit ?? ''}`}
        accent="#4ade80"
        onClose={cancelAction}
      >
        <div class="grid grid-cols-4 gap-2">
          {#each SUITS_INFO as s}
            <button
              onclick={() => agilitePickSuit(s.symbol)}
              use:tooltip={"Piocher une carte " + s.label + " aléatoire"}
              class="py-2 rounded-lg border text-sm font-bold bg-gray-800 hover:bg-gray-700 transition-colors"
              style="color: {pickerSuitColor(s)}; border-color: {pickerSuitColor(s)}"
            >{s.symbol}</button>
          {/each}
        </div>
      </HandModal>

    {:else if modal === 'social-target' || modal === 'sporelin-target'}
      {@const isSporelin = modal === 'sporelin-target'}
      <HandModal
        title={`${isSporelin ? 'Sporelin' : 'Social'} — offrir ${actionCard?.value ?? ''}${actionCard?.suit ?? ''} à`}
        accent={isSporelin ? '#a855f7' : STAT_COLORS.social}
        onClose={cancelAction}
      >
        <div class="flex flex-wrap gap-1.5 justify-center">
          {#each otherPlayerIds as id}
            <button
              onclick={() => (isSporelin ? sporelinPickTarget(id) : socialPickTarget(id))}
              use:tooltip={isSporelin
                ? "Échanger une carte avec " + getPlayerName(id) + " (gratuit)"
                : "Proposer l'échange à " + getPlayerName(id)}
              class="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-[11px] font-semibold transition-colors"
            >{getPlayerName(id)}</button>
          {/each}
          {#if otherPlayerIds.length === 0}
            <p class="text-[11px] text-gray-500 italic">Aucun autre joueur.</p>
          {/if}
        </div>
      </HandModal>

    {:else if modal === 'accept'}
      <HandModal title="Choisissez la carte à donner en retour" accent="#4ade80" onClose={cancelAction}>
        <div class="flex flex-wrap gap-1.5 justify-center">
          {#each sortCards(player.hand.filter((c) => !c._pending)) as card (card.id)}
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div
              class="w-[56px] h-[84px] rounded cursor-pointer hover:ring-2 hover:ring-green-400 flex flex-col p-1 text-[10px] font-bold"
              style="background: #fff; border: 1.5px solid #d1d5db; color: {faceSuitColor(card)};"
              role="button"
              tabindex="0"
              onclick={() => completeAccept(card)}
              onkeydown={(e) => e.key === "Enter" && completeAccept(card)}
            >
              <span>{card.value}{card.suit}</span>
              <span class="flex-1 flex items-center justify-center text-[20px]">{card.suit}</span>
            </div>
          {/each}
        </div>
      </HandModal>

    {:else if modal === 'incoming'}
      <HandModal title="Échange proposé" accent={STAT_COLORS.social} closable={false}>
        <div class="flex flex-col gap-2">
          {#each incomingExchanges as ex (ex.id)}
            <div
              class="flex items-center gap-2 px-2 py-1.5 rounded-lg"
              style="background: rgba(30,30,10,0.6); border: 1px solid rgba(234,179,8,0.4);"
            >
              <span class="text-yellow-300 font-semibold text-[11px] shrink-0"
                >{getPlayerName(ex.from)} →</span
              >
              <span class="text-white font-bold text-[12px] shrink-0"
                >{ex.fromCard.value}{ex.fromCard.suit}</span
              >
              <div class="flex gap-1 ml-auto shrink-0">
                <button
                  onclick={() => startAccept(ex)}
                  use:tooltip={"Accepter l'échange et donner une carte en retour"}
                  class="px-2 py-0.5 bg-green-700 hover:bg-green-600 text-white rounded text-[10px] font-bold"
                >Accepter</button>
                <button
                  onclick={() => declineExchange(ex)}
                  use:tooltip={"Refuser l'échange, la carte revient au proposeur"}
                  class="px-2 py-0.5 bg-red-800 hover:bg-red-700 text-red-200 rounded text-[10px] font-bold"
                >Refuser</button>
              </div>
            </div>
          {/each}
        </div>
      </HandModal>
    {/if}
  {/if}
</div>
