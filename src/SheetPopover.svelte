<script>
  import { onMount } from 'svelte';
  import { dispatch } from './lib/api.js';
  import {
    STAT_COLORS,
    SKILL_GROUPS,
    SKILL_LABELS,
    fetchCharacterSheet,
    isDiceFormula,
    rollDice,
    skillModifier,
    subscribeToCharacterSheet,
    suitColor,
    suitSymbol,
    toNumber
  } from './lib/characterSheet.js';

  const params = new URLSearchParams(location.search);
  let playerId = params.get('playerId');
  let roomId = params.get('roomId');

  let sheet = $state(null);
  let lastRoll = $state(null);

  onMount(async () => {
    try {
      const data = await fetchCharacterSheet(playerId, roomId);
      sheet = data?.data ?? null;
    } catch (err) {
      console.error('Failed to load character sheet (compact):', err);
    }
    const unsubscribe = subscribeToCharacterSheet(playerId, roomId, (newData) => {
      if (newData) sheet = newData.data;
    });
    return unsubscribe;
  });

  function statMod(stat) {
    const value = sheet?.stats?.[stat] || 10;
    return Math.floor((value - 10) / 2);
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

  function doRoll(label, formula) {
    try {
      const result = rollDice(formula, sheet?.stats ?? {});
      lastRoll = { label, ...result, time: new Date().toLocaleTimeString() };
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
  {#if !sheet}
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
        <div class="bg-indigo-600 rounded-md px-2.5 py-1.5 text-[9px] font-bold truncate">
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
            <div class="text-2xl font-bold text-indigo-300 leading-none">{lastRoll.total}</div>
            <div class="min-w-0">
              <div class="text-[10px] font-semibold truncate">{lastRoll.label}</div>
              <div class="text-[9px] text-[#9ca3af] truncate">
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
