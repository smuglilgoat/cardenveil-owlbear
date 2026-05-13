<script>
  import { onMount, onDestroy } from 'svelte';
  import OBR from '@owlbear-rodeo/sdk';
  import { hydrateState, dehydrateState } from './lib/deck.js';

  const METADATA_KEY = 'com.cardenveil/gameState';

  let ready     = $state(false);
  let myId      = $state(null);
  let gameState = $state(null);

  // Which card is being actioned: { card, isCrystallized } | null
  let active = $state(null);

  let unsubMeta = null;

  async function pushState(newState) {
    const plain      = $state.snapshot(newState);
    const dehydrated = dehydrateState(plain);
    await OBR.room.setMetadata({ [METADATA_KEY]: dehydrated });
    gameState = hydrateState(dehydrated);
  }

  onMount(() => {
    OBR.onReady(async () => {
      myId = await OBR.player.getId();

      const meta = await OBR.room.getMetadata();
      const raw  = meta[METADATA_KEY];
      if (raw) gameState = hydrateState(raw);

      ready = true;

      unsubMeta = OBR.room.onMetadataChange((m) => {
        const raw = m[METADATA_KEY];
        if (raw) gameState = hydrateState(raw);
      });
    });
  });

  onDestroy(() => { unsubMeta?.(); });

  // ── Derived ────────────────────────────────────────────────────────────
  let player = $derived(gameState?.players?.[myId] ?? null);

  let allCards = $derived(player ? [
    ...player.hand.map(c        => ({ card: c, isCrystallized: false })),
    ...player.crystallized.map(c => ({ card: c, isCrystallized: true  })),
  ] : []);

  // ── Fan geometry ──────────────────────────────────────────────────────
  const MAX_ROT  = 18;   // degrees at edges
  const SPREAD_X = 56;   // px between card centres
  const ARC_Y    = 18;   // px dip at edges vs centre

  function fanStyle(i, n) {
    const t   = n > 1 ? (i / (n - 1)) - 0.5 : 0;
    const rot = t * MAX_ROT * 2;
    const tx  = t * SPREAD_X * (n - 1);
    const ty  = Math.abs(t) * ARC_Y * 2;
    return `transform: translateX(${tx}px) translateY(${ty}px) rotate(${rot}deg);`;
  }

  // ── Actions ───────────────────────────────────────────────────────────
  function discard(card, isCrystallized) {
    if (!player) return;
    if (isCrystallized) {
      pushState({
        ...gameState,
        discard: [...gameState.discard, card],
        players: {
          ...gameState.players,
          [myId]: { ...player, crystallized: player.crystallized.filter(c => c.id !== card.id) },
        },
      });
    } else {
      pushState({
        ...gameState,
        discard: [...gameState.discard, card],
        players: {
          ...gameState.players,
          [myId]: { ...player, hand: player.hand.filter(c => c.id !== card.id) },
        },
      });
    }
    active = null;
  }

  function crystallize(card) {
    if (!player || player.tokens.esprit <= 0) return;
    pushState({
      ...gameState,
      players: {
        ...gameState.players,
        [myId]: {
          ...player,
          hand:        player.hand.filter(c => c.id !== card.id),
          crystallized:[...player.crystallized, card],
          tokens:      { ...player.tokens, esprit: player.tokens.esprit - 1 },
        },
      },
    });
    active = null;
  }

  function toggleActive(card, isCrystallized) {
    if (active?.card.id === card.id) { active = null; return; }
    active = { card, isCrystallized };
  }

  const SUIT_COLOR = { '♠': '#1e293b', '♣': '#1e293b', '♥': '#dc2626', '♦': '#dc2626' };
</script>

<div
  class="w-full h-full flex items-end justify-center pb-2 select-none overflow-visible"
  style="background: transparent;"
>
  {#if !ready || !player}
    <p class="text-xs text-gray-400 pb-4">Chargement...</p>
  {:else if allCards.length === 0}
    <p class="text-xs text-gray-500 pb-4">Aucune carte</p>
  {:else}
    <!-- Fan container -->
    <div
      class="relative flex items-end justify-center"
      style="width: {Math.max(180, allCards.length * SPREAD_X + 80)}px; height: 200px;"
    >
      {#each allCards as { card, isCrystallized }, i (card.id)}
        {@const isActive = active?.card.id === card.id}
        {@const n = allCards.length}

        <!-- Card -->
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div
          class="absolute bottom-0 left-1/2 cursor-pointer transition-all duration-150"
          style="
            {fanStyle(i, n)}
            margin-left: -36px;
            z-index: {isActive ? 50 : i};
            filter: {isActive ? 'drop-shadow(0 -8px 12px rgba(99,102,241,0.7))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))'};
            transform-origin: bottom center;
            {isActive ? 'transform: ' + fanStyle(i, n).replace('transform:', '').replace(';','') + ' translateY(-28px);' : ''}
          "
          onclick={() => toggleActive(card, isCrystallized)}
        >
          <!-- Card face -->
          <div
            class="w-[72px] h-[108px] rounded-lg flex flex-col p-1 text-[11px] font-bold leading-none"
            style="
              background: {isCrystallized ? '#fefce8' : '#ffffff'};
              border: {isCrystallized ? '2.5px solid #f59e0b' : '1.5px solid #d1d5db'};
              color: {SUIT_COLOR[card.suit] ?? '#111827'};
            "
          >
            <div class="flex flex-col items-start">
              <span>{card.value}</span>
              <span class="text-[14px]">{card.suit}</span>
            </div>
            <div class="flex-1 flex items-center justify-center text-[28px]">
              {card.suit}
            </div>
            <div class="flex flex-col items-end rotate-180">
              <span>{card.value}</span>
              <span class="text-[14px]">{card.suit}</span>
            </div>
          </div>

          <!-- Action buttons (shown when card is active) -->
          {#if isActive}
            <div class="absolute -top-16 left-1/2 -translate-x-1/2 flex gap-1 z-50">
              <button
                onclick={(e) => { e.stopPropagation(); discard(card, isCrystallized); }}
                class="px-2 py-1 text-[10px] font-bold bg-red-700 hover:bg-red-600 text-white rounded-lg shadow-lg whitespace-nowrap"
              >
                🗑 Défausser
              </button>
              {#if !isCrystallized}
                <button
                  onclick={(e) => { e.stopPropagation(); crystallize(card); }}
                  disabled={player.tokens.esprit <= 0}
                  class="px-2 py-1 text-[10px] font-bold bg-amber-600 hover:bg-amber-500 text-white rounded-lg shadow-lg whitespace-nowrap disabled:opacity-40"
                >
                  ✦ Cristalliser
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
