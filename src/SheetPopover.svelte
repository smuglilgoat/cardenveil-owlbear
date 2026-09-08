<script>
  import { onMount } from 'svelte';
  import OBR from '@owlbear-rodeo/sdk';
  import { dispatch } from './lib/api.js';
  import { tooltip } from './lib/tooltip.js';
  import ActionDiamonds from './lib/ActionDiamonds.svelte';
  import {
    STAT_COLORS,
    SKILL_GROUPS,
    SKILL_LABELS,
    fetchCharacterSheet,
    isDiceFormula,
    rollDice,
    saveCharacterSheet,
    skillModifier,
    subscribeToCharacterSheet,
    suitColor,
    suitSymbol,
    toNumber,
    broadcastActionChecks,
    onActionChecksBroadcast
  } from './lib/characterSheet.js';

  const params = new URLSearchParams(location.search);
  let playerId = params.get('playerId');
  let roomId = params.get('roomId');
  const popoverId = params.get('popoverId') || 'cardenveil-sheet';

  let sheet = $state(null);
  let lastRoll = $state(null);
  let folded = $state(false);
  let expandedHeight = 540;
  const FOLDED_HEIGHT = 40;

  async function toggleFold() {
    const target = folded ? expandedHeight : FOLDED_HEIGHT;
    try {
      await OBR.popover.setHeight(popoverId, target);
      // Only fold the DOM if the resize actually took effect.
      const actual = await OBR.popover.getHeight(popoverId);
      if (actual != null && Math.abs(actual - target) > 4) {
        console.warn('Sheet popover resize did not apply; keeping unfolded');
        return;
      }
      folded = !folded;
    } catch (err) {
      console.warn('Failed to resize sheet popover:', err);
    }
  }

  onMount(() => {
    // Register subscriptions synchronously so they exist even if the first
    // fetch hangs (e.g. a paused Supabase project).
    const unsubscribe = subscribeToCharacterSheet(playerId, roomId, (newData) => {
      if (newData) sheet = newData.data;
    });
    // Instant sync of the action diamonds from the main sheet
    const offBroadcast = onActionChecksBroadcast(playerId, (actionChecks) => {
      if (sheet) sheet = { ...sheet, actionChecks };
    });

    fetchCharacterSheet(playerId, roomId)
      .then((data) => {
        sheet = data?.data ?? null;
      })
      .catch((err) => console.error('Failed to load character sheet (compact):', err));

    // Reconcile poll: guarantees the diamonds follow the main sheet even if
    // BroadcastChannel/realtime don't deliver in this frame.
    async function reconcile() {
      if (!sheet || document.hidden || saveInFlight) return;
      try {
        const data = await fetchCharacterSheet(playerId, roomId);
        const remote = data?.data?.actionChecks;
        if (remote && JSON.stringify(remote) !== JSON.stringify(sheet.actionChecks ?? {})) {
          sheet = { ...sheet, actionChecks: remote };
          console.debug('[cardenveil-popover] actionChecks reconciled from server');
        }
      } catch {
        /* offline — keep current state */
      }
    }
    const pollTimer = setInterval(reconcile, 1500);
    window.addEventListener('focus', reconcile);
    document.addEventListener('visibilitychange', reconcile);

    OBR.onReady(async () => {
      try {
        expandedHeight = (await OBR.popover.getHeight(popoverId)) || expandedHeight;
      } catch (err) {
        /* popover resize not available */
      }
    });
    return () => {
      unsubscribe();
      offBroadcast();
      clearInterval(pollTimer);
      window.removeEventListener('focus', reconcile);
      document.removeEventListener('visibilitychange', reconcile);
    };
  });

  function statMod(stat) {
    const value = sheet?.stats?.[stat] || 10;
    return Math.floor((value - 10) / 2);
  }

  function stripHtml(text) {
    return (text || '').replace(/<[^>]*>/g, '').trim();
  }

  function fmt(value) {
    return value >= 0 ? `+${value}` : `${value}`;
  }

  function skillColor(skillKey) {
    const group = SKILL_GROUPS.find((g) => g.skills.includes(skillKey));
    return group ? STAT_COLORS[group.stat] : '#9ca3af';
  }

  function skillMod(skillKey) {
    return skillModifier(sheet?.stats ?? {}, skillKey, sheet?.skills?.[skillKey]?.bonus ?? 0);
  }

  // ─── Per-turn action diamonds (toggle + persist + instant main-sheet sync, no reset logic) ───
  let saveInFlight = false;
  function toggleActionCheck(key) {
    if (!sheet) return;
    const current = sheet.actionChecks ?? {};
    const next = { ...sheet, actionChecks: { ...current, [key]: !current[key] } };
    sheet = next;
    broadcastActionChecks(playerId, next.actionChecks);
    saveInFlight = true;
    saveCharacterSheet(playerId, roomId, next)
      .catch(console.error)
      .finally(() => {
        saveInFlight = false;
      });
  }

  // Max-value roll ("crit"): a die equal to its formula's die size (d20 → 20, d6 → 6, …)
  function critRoll(formula, rolls = []) {
    const match = String(formula || '').match(/d\s*(\d+)/i);
    if (!match) return false;
    const sides = parseInt(match[1], 10);
    return rolls.some((r) => Number(r) === sides);
  }

  function doRoll(label, formula) {
    try {
      const result = rollDice(formula, sheet?.stats ?? {});
      lastRoll = {
        label,
        ...result,
        time: new Date().toLocaleTimeString(),
        crit: critRoll(result.formula, result.rolls),
        fail: result.rolls.some((r) => Number(r) === 1)
      };
      dispatch(roomId, {
        type: 'USE_CAPACITY',
        playerId,
        capacityName: label,
        formula: result.formula,
        total: result.total,
        rolls: result.rolls
      }).catch((err) => console.error('Failed to dispatch roll:', err));
    } catch (err) {
      lastRoll = { label, error: err.message };
    }
  }

  let pinnedSkills = $derived(
    (sheet?.pinnedSkills ?? []).filter((key) => sheet?.skills?.[key])
  );
  let pinnedCapacities = $derived(
    (sheet?.capacities ?? []).filter((capacity, i) =>
      (sheet?.pinnedCapacities ?? []).includes(capacity?.name || `#${i}`)
    )
  );
</script>

<div class="w-full h-full bg-[#242424] text-white rounded-xl border border-[#374151] flex flex-col overflow-hidden">
  <!-- Fold bar -->
  <div class="h-10 bg-[#1f2937] border-b border-[#374151] flex items-center px-3 shrink-0">
    <span class="text-[10px] font-bold tracking-wide">FICHE</span>
    <span class="text-[9px] text-[#9ca3af] ml-2 truncate">{sheet?.identity?.nom || ''}</span>
    <button
      onclick={toggleFold}
      title={folded ? 'Déplier la fiche' : 'Replier la fiche'}
      class="ml-auto w-7 h-7 rounded-full bg-[#111827] border border-[#374151] text-[#9ca3af] hover:text-white text-[11px] font-bold flex items-center justify-center transition-colors"
    >
      {folded ? '▴' : '▾'}
    </button>
  </div>

  {#if folded}
    <!-- folded: bar only -->
  {:else if !sheet}
    <div class="flex-1 flex items-center justify-center text-[#9ca3af] text-xs">
      Chargement de la fiche...
    </div>
  {:else}
    <!-- Header -->
    <div class="px-3 pt-3 pb-2 border-b border-[#374151] bg-[#1f2937] shrink-0">
      <div class="flex items-center gap-2.5">
        <div class="w-10 h-12 bg-[#111827] rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
          {#if sheet.portrait}
            <img src={sheet.portrait} alt="Portrait" class="w-full h-full object-cover" />
          {:else}
            <span class="text-[7px] font-bold text-[#9ca3af]">PORTRAIT</span>
          {/if}
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-bold truncate">{sheet.identity?.nom || 'Sans nom'}</div>
          <div class="text-[10px] text-[#9ca3af] truncate">
            {sheet.identity?.race || '—'} · Niv. {sheet.identity?.niveau ?? 1}
          </div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-[8px] font-bold text-[#9ca3af]">PV</div>
          <div class="text-lg font-bold leading-none">
            {toNumber(sheet.derived?.pvActuels)}
            <span class="text-[10px] text-[#9ca3af] font-semibold">/ {toNumber(sheet.derived?.pvMax)}</span>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-4 gap-1.5 mt-2">
        {#each ['force', 'agilite', 'esprit', 'social'] as stat}
          <div class="bg-[#111827] rounded-md px-1.5 py-1 text-center">
            <div class="text-[7px] font-bold text-[#9ca3af]">{stat.toUpperCase()}</div>
            <div class="text-sm font-bold leading-tight" style="color: {STAT_COLORS[stat]}">
              {toNumber(sheet.stats?.[stat])}
              <span class="text-[10px] text-white">{fmt(statMod(stat))}</span>
            </div>
          </div>
        {/each}
      </div>
      <!-- Per-turn action diamonds (centered; long hover shows the combat actions reference) -->
      <ActionDiamonds
        checks={sheet.actionChecks}
        onToggle={toggleActionCheck}
        compact
        class="flex items-center justify-center gap-4 mt-2 pt-2 border-t border-[#374151]"
      />
    </div>

    <!-- Favoris -->
    <div class="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-2.5 space-y-2">
      <div class="text-[9px] font-bold text-[#9ca3af]">FAVORIS — cliquer pour lancer</div>

      {#if !pinnedSkills.length && !pinnedCapacities.length}
        <div class="text-[10px] text-[#9ca3af] bg-[#111827] rounded-md p-2.5">
          Aucun favori. Épinglez des compétences (📌) ou des capacités dans la fiche complète.
        </div>
      {/if}

      {#each pinnedSkills as skillKey}
        <button
          class="w-full flex items-center gap-2 bg-[#111827] hover:bg-[#1f2937] rounded-md px-2.5 py-2 text-left transition-colors"
          onclick={() => doRoll(SKILL_LABELS[skillKey] || skillKey, `d20${skillMod(skillKey) >= 0 ? '+' + skillMod(skillKey) : skillMod(skillKey)}`)}
        >
          <div class="w-1 h-5 rounded-full" style="background: {skillColor(skillKey)}"></div>
          <span class="text-[11px] font-medium truncate">{SKILL_LABELS[skillKey] || skillKey}</span>
          <span class="ml-auto text-[11px] font-bold" style="color: {skillColor(skillKey)}">d20 {fmt(skillMod(skillKey))}</span>
        </button>
      {/each}

      {#each pinnedCapacities as capacity, i}
        {@const formula = capacity?.value?.main}
        <button
          class="w-full flex items-center gap-2 bg-[#111827] hover:bg-[#1f2937] rounded-md px-2.5 py-2 text-left transition-colors {formula && isDiceFormula(formula, sheet?.stats ?? {}) ? '' : 'opacity-60 cursor-default'}"
          onclick={() => formula && isDiceFormula(formula, sheet?.stats ?? {}) && doRoll(capacity.name || `Capacité #${i + 1}`, formula)}
          title={formula && isDiceFormula(formula, sheet?.stats ?? {}) ? `Lancer ${formula}` : 'Aucune formule de dés'}
        >
          <div class="w-1 h-5 rounded-full bg-indigo-500"></div>
          <div class="flex-1 min-w-0">
            <div class="text-[11px] font-semibold truncate">{capacity?.name || 'Sans nom'}</div>
            <div class="text-[9px] text-[#9ca3af] truncate">
              {capacity?.usage || '—'} · Coût {capacity?.cost?.total ?? 0}
              <span style="color: {suitColor(capacity?.cost?.color)}">{suitSymbol(capacity?.cost?.color)}</span>
            </div>
          </div>
          {#if formula && isDiceFormula(formula, sheet?.stats ?? {})}
            <span class="px-2 py-0.5 bg-slate-500 rounded text-[10px] font-bold shrink-0">{formula}</span>
          {/if}
        </button>
      {/each}

      {#if sheet.totem?.nom}
        <div
          use:tooltip={stripHtml(sheet.totem.description)}
          class="bg-indigo-600 rounded-md px-2.5 py-1.5 text-[9px] font-bold truncate cursor-help"
        >
          TOTEM &nbsp;{sheet.totem.nom}
        </div>
      {/if}
    </div>

    <!-- Roll result -->
    {#if lastRoll}
      <div class="shrink-0 border-t border-[#374151] bg-[#111827] px-3 py-2">
        {#if lastRoll.error}
          <div class="text-[10px] text-red-300">Formule invalide : {lastRoll.error}</div>
        {:else}
          <div class="flex items-center gap-2.5">
            <div class="text-2xl font-bold leading-none {lastRoll.crit ? 'crit-flash' : lastRoll.fail ? 'fail-flash' : 'text-indigo-300'}">{lastRoll.total}</div>
            <div class="min-w-0">
              <div class="text-[10px] font-semibold truncate">{lastRoll.label}</div>
              <div class="text-[9px] truncate {lastRoll.crit ? 'text-amber-400' : lastRoll.fail ? 'text-red-400' : 'text-[#9ca3af]'}">
                {lastRoll.formula}: {(lastRoll.rolls ?? []).join(', ')}{lastRoll.modifier ? ` ${lastRoll.modifier > 0 ? '+' : ''}${lastRoll.modifier}` : ''} · {lastRoll.time}
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .crit-flash {
    color: #fbbf24;
    animation: crit-flash 0.8s ease-in-out 3;
  }
  @keyframes crit-flash {
    0%, 100% { text-shadow: 0 0 0 rgba(251, 191, 36, 0); }
    50% { text-shadow: 0 0 14px rgba(251, 191, 36, 0.9); }
  }
  .fail-flash {
    color: #f87171;
    animation: fail-flash 0.8s ease-in-out 3;
  }
  @keyframes fail-flash {
    0%, 100% { text-shadow: 0 0 0 rgba(248, 113, 113, 0); }
    50% { text-shadow: 0 0 14px rgba(248, 113, 113, 0.9); }
  }
  .scrollbar-thin::-webkit-scrollbar {
    width: 4px;
  }
  .scrollbar-thin::-webkit-scrollbar-track {
    background: #374151;
    border-radius: 2px;
  }
  .scrollbar-thin::-webkit-scrollbar-thumb {
    background: #9ca3af;
    border-radius: 2px;
  }
</style>
