<script>
  import { onDestroy } from "svelte";
  import OBR from "@owlbear-rodeo/sdk";
  import CardDisplay from "./CardDisplay.svelte";
  import ActionLog from "./ActionLog.svelte";
  import { GM_CHAR_ID, sortCards } from "./deck.js";

  let { gameState, myId, myName, party, onAction } = $props();

  let player = $derived(gameState.players[myId]);
  let sortedHand = $derived(player ? sortCards(player.hand) : []);
  let sortedCrystallized = $derived(player ? sortCards(player.crystallized) : []);
  let handFull = $derived(
    player ? player.hand.length >= player.maxHandSize + (player.spiritBounds ?? 0) : false,
  );
  let mustCrystallize = $derived(
    player
      ? (player.spiritBounds ?? 0) > 0 && player.hand.length >= player.maxHandSize + (player.spiritBounds ?? 0)
      : false,
  );
  let spiritLocked = $derived(
    player ? player.hand.length <= (player.spiritBounds ?? 0) : false,
  );

  /** Exchanges from other players targeting me */
  let incomingExchanges = $derived(
    (gameState.pendingExchanges ?? []).filter((e) => e.to === myId),
  );
  /** My own outgoing exchange (awaiting acceptance) */
  let outgoingExchange = $derived(
    (gameState.pendingExchanges ?? []).find((e) => e.from === myId) ?? null,
  );

  // ── Action state ─────────────────────────────────────────────────────
  /** 'force'|'agilite-pick-card'|'agilite-pick-suit'|'esprit'|'social-pick-card'|'social-pick-target'|null */
  let action = $state(null);
  let actionCard = $state(null); // card selected for agilite / esprit / social

  /** exchange the player chose to accept (needs a card selection) */
  let acceptingExchange = $state(null);

  let choosingToken = /** @type {string | null} */ ($state(null));

  let interactionFrozen = $derived(
    (incomingExchanges.length > 0 && action !== "accept-exchange") ||
    outgoingExchange !== null ||
    (action !== null && action !== "accept-exchange" && action !== "agilite-pick-card" && action !== "social-pick-card") ||
    choosingToken !== null
  );

  function cancelAction() {
    action = null;
    actionCard = null;
    acceptingExchange = null;
    choosingToken = null;
  }

  /** @param {string} tokenKey @param {string} label */
  function useCombat(tokenKey, label) {
    const tokens = player.tokens;
    if (tokens[tokenKey] <= 0) return;
    onAction({ type: 'SPEND_TOKEN', playerId: myId, token: tokenKey });
    choosingToken = null;
  }

  // ── Gray out ──────────────────────────────────────────────────────────
  function toggleGray(card) {
    onAction({ type: 'TOGGLE_GRAY', playerId: myId, cardId: card.id });
  }

  // ── Normal draw ───────────────────────────────────────────────────────
  function drawCard() {
    if (handFull || mustCrystallize) return;
    onAction({ type: 'DRAW', playerId: myId });
  }

  // ── Card actions ──────────────────────────────────────────────────────
  function discardCard(card) {
    const isGrayed = (player.grayedCards ?? []).includes(card.id);
    if (spiritLocked || isGrayed) return;
    onAction({ type: 'DISCARD', playerId: myId, cardId: card.id, from: 'hand' });
  }

  function crystallizeCard(card) {
    if ((player.spiritBounds ?? 0) <= 0) return;
    onAction({ type: 'CRYSTALLIZE', playerId: myId, cardId: card.id });
  }

  function discardCrystallized(card) {
    onAction({ type: 'DISCARD', playerId: myId, cardId: card.id, from: 'crystallized' });
  }

  // ── Token: Force ──────────────────────────────────────────────────────
  function useForce() {
    if (player.tokens.force <= 0) return;
    onAction({ type: 'DRAW_FORCE', playerId: myId });
  }

  // ── Token: Agilité ────────────────────────────────────────────────────
  function startAgilite() {
    if (player.tokens.agilite <= 0 || player.hand.length === 0) return;
    action = "agilite-pick-card";
  }

  function agilitePickCard(card) {
    actionCard = card;
    action = "agilite-pick-suit";
  }

  function agilitePickSuit(suit) {
    onAction({ type: 'USE_AGILITE', playerId: myId, cardId: actionCard.id, suit });
    cancelAction();
  }

  // ── Token: Esprit → ajoute 1 Spirit Bound ────────────────────────────
  function useEsprit() {
    if (player.tokens.esprit <= 0) return;
    onAction({ type: 'USE_ESPRIT', playerId: myId });
  }

  // ── Token: Social ─────────────────────────────────────────────────────
  function startSocial() {
    if (player.tokens.social <= 0 || player.hand.length === 0 || spiritLocked) return;
    action = "social-pick-card";
  }

  function socialPickCard(card) {
    actionCard = card;
    action = "social-pick-target";
  }

  function socialPickTarget(targetId) {
    onAction({ type: 'PROPOSE_EXCHANGE', playerId: myId, cardId: actionCard.id, targetId });
    cancelAction();
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

  // ── Helpers ───────────────────────────────────────────────────────────
  function getPlayerName(id) {
    return (
      party.find((p) => p.id === id)?.name ??
      gameState.players[id]?.name ??
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
      desc: "Piocher (pile normale)",
      disabled: () => player.tokens.force <= 0,
      use: useForce,
    },
    {
      key: "agilite",
      label: "Agilité",
      desc: "Échanger → pioche spécialisée",
      disabled: () => player.tokens.agilite <= 0 || player.hand.length === 0,
      use: startAgilite,
    },
    {
      key: "esprit",
      label: "Esprit",
      desc: "+1 Spirit Bound (slot de main)",
      disabled: () => player.tokens.esprit <= 0,
      use: useEsprit,
    },
    {
      key: "social",
      label: "Social",
      desc: "Échanger avec un autre joueur",
      disabled: () => player.tokens.social <= 0 || player.hand.length === 0 || spiritLocked,
      use: startSocial,
    },
  ];

  // Other players available for social trade (exclude self and the GM's real OBR ID)
  let partyIds = $derived(new Set(party.map((/** @type {any} */ p) => p.id)));

  let otherPlayerIds = $derived(
    Object.keys(gameState.players).filter(
      (id) => id !== myId && id !== gameState.gmId && (id === GM_CHAR_ID ? (/** @type {any} */ (gameState)).gmCharacterId != null : partyIds.has(id)),
    ),
  );

  // ── Popover hand ─────────────────────────────────────────────────────
  const POPOVER_ID = "com.cardenveil/hand";
  let popoverVisible = $state(false);

  function cardCount() {
    return (player?.hand.length ?? 0) + (player?.crystallized.length ?? 0);
  }

  async function openPopover() {
    const n = cardCount();
    const width = Math.max(400, n * 64 + 120);
    const height = 400;
    const vw = await OBR.viewport.getWidth();
    const vh = await OBR.viewport.getHeight();
    await OBR.popover.open({
      id: POPOVER_ID,
      url: `${window.location.origin}/hand.html`,
      width,
      height,
      anchorPosition: { left: vw / 2, top: vh - 56 },
      anchorOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
      transformOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
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

  // Reopen popover to resize when hand count changes while visible
  $effect(() => {
    const n = cardCount();
    if (popoverVisible && n >= 0) openPopover();
  });

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
        <span
          >Défausse: <span class="text-white">{gameState.discard.length}</span
          ></span
        >
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
      {popoverVisible ? "🃏 Main affichée" : "🃏 Afficher la main"}
    </button>

    <!-- ── Incoming exchanges ──────────────────────────────────────── -->
    {#each incomingExchanges as ex (ex.id)}
      <div
        class="bg-yellow-900/40 border border-yellow-600 rounded-xl p-3 space-y-2"
      >
        <p class="text-xs text-yellow-300 font-semibold">
          Échange proposé par <span class="text-white"
            >{getPlayerName(ex.from)}</span
          >
        </p>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-400">Carte offerte :</span>
          <CardDisplay card={ex.fromCard} />
        </div>
        {#if action === "accept-exchange" && acceptingExchange?.id === ex.id}
          <p class="text-xs text-yellow-200">
            Choisissez la carte à donner en retour :
          </p>
          <div class="flex flex-wrap gap-2">
            {#each sortedHand as card (card.id)}
              <CardDisplay
                {card}
                actions={[
                  {
                    icon: "↗",
                    label: "Donner en échange",
                    onClick: () => completeAccept(card),
                  },
                ]}
              />
            {/each}
          </div>
          <button
            onclick={cancelAction}
            class="text-xs text-gray-500 hover:text-gray-300 underline"
            >Annuler</button
          >
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
      <div
        class="bg-indigo-900/30 border border-indigo-700 rounded-xl p-2.5 text-xs text-indigo-300"
      >
        Échange en attente avec <span class="text-white"
          >{getPlayerName(outgoingExchange.to)}</span
        >…
        <span class="ml-1 text-gray-500"
          >(carte offerte : {outgoingExchange.fromCard.value}{outgoingExchange
            .fromCard.suit})</span
        >
      </div>
    {/if}

    <!-- ── Token choice: Carte vs Combat ────────────────────────── -->
    {#if choosingToken !== null}
      {@const ctok = TOKENS.find(t => t.key === choosingToken)}
      <div class="bg-gray-900/80 border rounded-xl p-3 space-y-2" style="border-color: {TOKEN_COLOR[choosingToken ?? '']}55;">
        <p class="text-xs font-semibold" style="color: {TOKEN_COLOR[choosingToken ?? '']}">
          Token {ctok?.label} — usage :
        </p>
        <div class="flex gap-2">
          <button
            onclick={() => { ctok?.use(); choosingToken = null; }}
            class="flex-1 py-2 rounded-lg text-xs font-semibold text-white text-center"
            style="background: {TOKEN_COLOR[choosingToken ?? '']}30; border: 1px solid {TOKEN_COLOR[choosingToken ?? '']};"
          >
            <div>Carte</div>
            <div class="text-[10px] opacity-60 mt-0.5">{ctok?.desc ?? ''}</div>
          </button>
          <button
            onclick={() => useCombat(choosingToken ?? '', ctok?.label ?? choosingToken ?? '')}
            class="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs font-semibold text-gray-200 text-center border border-gray-600"
          >
            <div>Combat</div>
            <div class="text-[10px] opacity-60 mt-0.5">Dépenser sans effet</div>
          </button>
        </div>
        <button onclick={() => choosingToken = null} class="text-xs text-gray-500 hover:text-gray-300 underline">Annuler</button>
      </div>
    {/if}

    <!-- ── Action banner ──────────────────────────────────────────── -->
    {#if action && action !== "accept-exchange"}
      <div
        class="bg-indigo-900/50 border border-indigo-600 rounded-xl p-3 space-y-2"
      >
        {#if action === "agilite-pick-card"}
          <p class="text-xs text-indigo-200 font-semibold">
            Agilité — Choisissez la carte à défausser :
          </p>
          <div class="flex flex-wrap gap-2">
            {#each sortCards(player.hand.filter(c => !(player.grayedCards ?? []).includes(c.id))) as card (card.id)}
              <CardDisplay
                {card}
                actions={[{ icon: "▶️", label: "Défausser", onClick: () => agilitePickCard(card) }]}
              />
            {/each}
          </div>
        {:else if action === "agilite-pick-suit"}
          <p class="text-xs text-indigo-200 font-semibold">
            Agilité — Choisissez la pile spécialisée
            <span class="text-gray-400"
              >(vous défaussez {actionCard.value}{actionCard.suit})</span
            > :
          </p>
          <div class="grid grid-cols-2 gap-2">
            {#each SUITS_INFO as s}
              <button
                onclick={() => agilitePickSuit(s.symbol)}
                class="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold border transition-colors"
                class:text-red-400={s.isRed}
                class:border-red-800={s.isRed}
                class:bg-red-950={s.isRed}
                class:hover:bg-red-900={s.isRed}
                class:text-gray-300={!s.isRed}
                class:border-gray-600={!s.isRed}
                class:bg-gray-800={!s.isRed}
                class:hover:bg-gray-700={!s.isRed}
              >
                <span>{s.symbol} {s.label}</span>
              </button>
            {/each}
          </div>
        {:else if action === "social-pick-card"}
          <p class="text-xs text-indigo-200 font-semibold">
            Social — Choisissez votre carte à offrir :
          </p>
          <div class="flex flex-wrap gap-2">
            {#each sortCards(player.hand.filter(c => !(player.grayedCards ?? []).includes(c.id))) as card (card.id)}
              <CardDisplay
                {card}
                actions={[
                  {
                    icon: "↗",
                    label: "Offrir",
                    onClick: () => socialPickCard(card),
                  },
                ]}
              />
            {/each}
          </div>
        {:else if action === "social-pick-target"}
          <p class="text-xs text-indigo-200 font-semibold">
            Social — Vous offrez <span class="text-white"
              >{actionCard.value}{actionCard.suit}</span
            >. À qui ?
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
              <p class="text-xs text-gray-500 italic">
                Aucun autre joueur enregistré.
              </p>
            {/if}
          </div>
        {/if}

        <button
          onclick={cancelAction}
          class="text-xs text-gray-500 hover:text-gray-300 underline"
        >
          Annuler
        </button>
      </div>
    {/if}

    <!-- ── Normal Hand ─────────────────────────────────────────────── -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <h3
          class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide"
        >
          Main
        </h3>
        <span
          class="text-xs"
          class:text-red-400={handFull}
          class:text-amber-400={mustCrystallize && !handFull}
          class:text-gray-500={!handFull && !mustCrystallize}
        >
          {player.hand.length} / {player.maxHandSize + (player.spiritBounds ?? 0)}
        </span>
      </div>
      {#if player.hand.length === 0}
        <p class="text-xs text-gray-600 italic">Aucune carte en main</p>
      {:else}
        <div class="flex flex-wrap gap-2">
          {#each sortedHand as card (card.id)}
            {@const isGrayed = (player.grayedCards ?? []).includes(card.id)}
            {@const isPending = !!card._pending}
            <div class="relative">
              <CardDisplay
                {card}
                faceDown={isPending}
                actions={card._pending || interactionFrozen ? [] : [
                  ...(!spiritLocked && !isGrayed ? [{ icon: "▶️", label: "Défausser", onClick: () => discardCard(card) }] : []),
                  {
                    icon: "✦",
                    label: (player.spiritBounds ?? 0) > 0 ? "Cristalliser (−1 Spirit Bound)" : "Cristalliser (aucun Spirit Bound)",
                    onClick: () => crystallizeCard(card),
                  },
                  { icon: isGrayed ? "◐" : "◑", label: isGrayed ? "Dégrisonner" : "Grisonner", onClick: () => toggleGray(card) },
                ]}
              />
              {#if isGrayed}
                <div class="absolute inset-0 rounded-md pointer-events-none" style="background: rgba(0,0,0,0.55);"></div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- ── Draw button ─────────────────────────────────────────────── -->
    <button
      onclick={drawCard}
      disabled={handFull || mustCrystallize}
      class="w-full py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      class:bg-amber-700={mustCrystallize}
      class:hover:bg-amber-800={mustCrystallize}
      class:bg-indigo-600={!mustCrystallize}
      class:hover:bg-indigo-700={!mustCrystallize}
    >
      <span>{#if mustCrystallize}Cristalliser d'abord !{:else if handFull}Main pleine{:else}Piocher{/if}</span>
      {#if (player.spiritBounds ?? 0) > 0}
        <span class="text-blue-300 font-semibold" title="Spirit Bounds actifs">✦×{player.spiritBounds}</span>
      {/if}
    </button>

    <!-- ── Crystallized ────────────────────────────────────────────── -->
    {#if player.crystallized.length > 0}
      <div>
        <h3
          class="text-[11px] font-semibold text-red-400 uppercase tracking-wide mb-2"
        >
          Cristallisées ({player.crystallized.length})
        </h3>
        <div class="flex flex-wrap gap-2">
          {#each sortedCrystallized as card (card.id)}
            <CardDisplay
              {card}
              faceDown={!!card._pending}
              crystallized={true}
              actions={card._pending || interactionFrozen ? [] : [
                {
                  icon: "▶",
                  label: "Jouer / Défausser",
                  onClick: () => discardCrystallized(card),
                },
              ]}
            />
          {/each}
        </div>
      </div>
    {/if}

    <!-- ── Tokens ──────────────────────────────────────────────────── -->
    <div>
      <h3
        class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2"
      >
        Tokens
      </h3>
      <div class="space-y-2">
        {#each TOKENS as tok}
          {@const current = player.tokens[tok.key]}
          {@const max = player.maxTokens[tok.key]}
          {@const busy = action !== null || choosingToken !== null}
          <div class="flex items-center gap-2">
            <!-- Dots -->
            <div class="flex gap-1 w-24 shrink-0">
              {#each { length: max } as _, i}
                <div
                  class="w-3.5 h-3.5 rounded-full border border-gray-600 transition-colors"
                  style={i < current
                    ? `background:${TOKEN_COLOR[tok.key]};border-color:${TOKEN_COLOR[tok.key]}`
                    : "background:#1f2937"}
                ></div>
              {/each}
            </div>
            <!-- Label + action button -->
            <div class="flex-1 min-w-0">
              <div class="text-[11px] text-gray-300 font-medium leading-none">
                {tok.label}
              </div>
              <div
                class="text-[10px] text-gray-500 leading-none mt-0.5 truncate"
              >
                {tok.desc}
              </div>
            </div>
            <button
              onclick={() => choosingToken = tok.key}
              disabled={tok.disabled() || busy}
              class="text-[10px] px-2 py-1 rounded-lg font-semibold shrink-0 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              style="background:{TOKEN_COLOR[tok.key]}20;color:{TOKEN_COLOR[
                tok.key
              ]};border:1px solid {TOKEN_COLOR[tok.key]}60"
            >
              {current}/{max}
            </button>
          </div>
        {/each}
      </div>
    </div>

    <!-- ── Action log ──────────────────────────────────────────────── -->
    <ActionLog logs={gameState.logs ?? []} {myId} isGM={false} />
  </div>
{/if}
