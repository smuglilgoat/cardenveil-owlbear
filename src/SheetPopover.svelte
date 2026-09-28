<script>
  import { onMount } from 'svelte';
  import OBR from '@owlbear-rodeo/sdk';
  import { dispatch } from './lib/api.js';
  import { tooltip } from './lib/tooltip.js';
  import ActionDiamonds from './lib/ActionDiamonds.svelte';
  import {
    STAT_COLORS,
    STAT_LABELS,
    SKILL_GROUPS,
    SKILL_LABELS,
    fetchCharacterSheet,
    isDiceFormula,
    rollDice,
    saveCharacterSheet,
    raceLabel,
    skillModifier,
    skillRollModifier,
    computeDerived,
    subscribeToCharacterSheet,
    onSheetBroadcast,
    suitColor,
    suitSymbol,
    toNumber,
    isImageUrl,
    DICE_GEMS,
    DICE_GEM_LABELS,
    diceGemColor,
    parseDiceSpec
  } from './lib/characterSheet.js';
  import { broadcastRoll, onRollResult } from './lib/rollBroadcast.js';
  import { rollAttack, attackPreview, pickAttackWeapon } from './lib/attackRoll.js';

  const params = new URLSearchParams(location.search);
  let playerId = params.get('playerId');
  let roomId = params.get('roomId');
  const popoverId = params.get('popoverId') || 'cardenveil-sheet';

  let sheet = $state(null);
  let folded = $state(false);
  let showNotes = $state(false);
  let notesDraft = $state('');
  let notesDraftDirty = $state(false);

  // Follow external sheet updates until the user types
  $effect(() => {
    if (showNotes && !notesDraftDirty) notesDraft = sheet?.notes ?? '';
  });

  function saveNotes() {
    if (!sheet) return;
    notesDraftDirty = false;
    sheet = { ...sheet, notes: notesDraft };
    saveInFlight = true;
    saveCharacterSheet(playerId, roomId, sheet)
      .catch(console.error)
      .finally(() => {
        saveInFlight = false;
      });
  }
  // ─── Quick dice row (d4 → d100 icons; click adds to the formula) ───
  const QUICK_DICE = [
    { die: 'd4', icon: '<polygon points="12,2 22,20 2,20"/>' },
    { die: 'd6', icon: '<rect x="3" y="3" width="18" height="18" rx="3"/>' },
    { die: 'd8', icon: '<polygon points="12,1 23,12 12,23 1,12"/>' },
    { die: 'd10', icon: '<polygon points="12,1 22,10 12,23 2,10"/>' },
    { die: 'd12', icon: '<polygon points="12,1 23,9 19,22 5,22 1,9"/>' },
    { die: 'd20', icon: '<polygon points="12,1 22,6.5 22,17.5 12,23 2,17.5 2,6.5"/>' },
    { die: 'd100', icon: '<polygon points="15,2 21,10 15,22 9,10"/><polygon points="9,7 13,11 9,18 5,11" fill-opacity="0.5"/>' }
  ];
  let quickFormula = $state('');

  // count of each die type in the quick formula (for the badge chips)
  let quickCounts = $derived.by(() => {
    const counts = {};
    for (const m of quickFormula.matchAll(/(\d*)d(\d+)/gi)) {
      const sides = m[2];
      counts[sides] = (counts[sides] ?? 0) + (m[1] ? parseInt(m[1], 10) : 1);
    }
    return counts;
  });

  function addQuickDie(die) {
    quickFormula = quickFormula ? `${quickFormula}+1${die}` : `1${die}`;
  }

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

    fetchCharacterSheet(playerId, roomId)
      .then((data) => {
        sheet = data?.data ?? null;
      })
      .catch((err) => console.error('Failed to load character sheet (compact):', err));

    // Same-origin instant sync: the main sheet (or this frame) broadcasts on
    // every save (pins, diamonds, imports…). saveInFlight guards our own echo.
    const offBroadcast = onSheetBroadcast((msg) => {
      if (msg?.playerId === playerId && msg?.roomId === roomId && msg?.data && !saveInFlight) {
        sheet = msg.data;
      }
    });

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

    // Physics popups (3D mode) report the roll result back — log it once
    // per roll across all frames of this player (localStorage lock).
    const offRollResult = onRollResult((msg) => {
      if (msg?.playerId !== playerId || !msg?.rollId || !msg?.rolls) return;
      const lock = `cardenveil-roll-logged-${msg.rollId}`;
      if (localStorage.getItem(lock)) return;
      localStorage.setItem(lock, '1');
      dispatch(roomId, {
        type: 'USE_CAPACITY',
        playerId,
        capacityName: msg.label || 'Jet',
        formula: msg.formula || '',
        total: msg.total,
        rolls: msg.rolls
      }).catch((err) => console.error('Failed to dispatch roll:', err));
    });

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
      offRollResult();
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
    return skillRollModifier(sheet?.stats ?? {}, skillKey, sheet?.skills?.[skillKey]);
  }

  // ─── Per-turn action diamonds (toggle + persist, no reset logic) ───
  let saveInFlight = false;
  function toggleActionCheck(key) {
    if (!sheet) return;
    const current = sheet.actionChecks ?? {};
    const next = { ...sheet, actionChecks: { ...current, [key]: !current[key] } };
    sheet = next;
    saveInFlight = true;
    saveCharacterSheet(playerId, roomId, next)
      .catch(console.error)
      .finally(() => {
        saveInFlight = false;
      });
  }


  // Flat mode (GM Classique): pre-rolled numbers (old path). 3D mode: the
  // rapier simulation in the popup decides the numbers — broadcast an intent
  // and dispatch USE_CAPACITY when the result is reported back.
  async function doRoll(label, formula) {
    if ((localStorage.getItem('cardenveil-dice-style') || '') !== 'flat') {
      const spec = parseDiceSpec(formula, sheet?.stats ?? {});
      if (spec) {
        broadcastRoll({
          label,
          color: diceGemColor(sheet),
          playerId,
          portrait: sheet?.portrait || '',
          portraitIsImage: isImageUrl(sheet?.portrait),
          formula: spec.formula,
          diceSpec: spec.terms,
          modifier: spec.modifier,
          seed: Math.floor(Math.random() * 0xffffffff)
        });
        return;
      }
    }
    try {
      const result = rollDice(formula, sheet?.stats ?? {});
      broadcastRoll({
        label,
        color: diceGemColor(sheet),
        playerId,
        portrait: sheet?.portrait || '',
        portraitIsImage: isImageUrl(sheet?.portrait),
        ...result
      });
      dispatch(roomId, {
        type: 'USE_CAPACITY',
        playerId,
        capacityName: label,
        formula: result.formula,
        total: result.total,
        rolls: result.rolls
      }).catch((err) => console.error('Failed to dispatch roll:', err));
    } catch (err) {
      console.warn('Roll failed:', err);
    }
  }

  // ─── Attack panel (accordion): weapon + avantage/désavantage + engagement ───
  let showAttack = $state(false);
  let attackWeaponName = $state('');
  let attackAdv = $state(0); // −7…+7 (− = désavantage, + = avantage)
  let attackEngagement = $state(0); // 0…7

  let equippedWeapons = $derived(pickAttackWeapon(sheet?.weapons ?? []).equipped);

  // restore last-used settings once the sheet is loaded
  let attackSettingsLoaded = false;
  $effect(() => {
    if (sheet && !attackSettingsLoaded) {
      attackSettingsLoaded = true;
      try {
        const saved = JSON.parse(localStorage.getItem(`cardenveil-attack-${playerId}`) || '{}');
        if (typeof saved.adv === 'number') attackAdv = Math.max(-7, Math.min(7, saved.adv));
        if (typeof saved.engagement === 'number') attackEngagement = Math.max(0, Math.min(7, saved.engagement));
        if (typeof saved.weapon === 'string') attackWeaponName = saved.weapon;
      } catch {
        /* corrupt settings — defaults */
      }
    }
  });

  // Self-healing selection: stale saved name falls back to main hand → first equipped.
  let selectedAttackWeapon = $derived(pickAttackWeapon(sheet?.weapons ?? [], attackWeaponName).weapon);
  let attackCalc = $derived(
    selectedAttackWeapon
      ? attackPreview(selectedAttackWeapon, sheet?.stats ?? {}, { advantage: attackAdv, engagement: attackEngagement })
      : null
  );

  let attackLevelLabel = $derived.by(() => {
    if (!attackCalc) return '';
    const lvl = attackCalc.level;
    if (lvl === 0) return 'jet simple';
    return `${lvl > 0 ? '+' : '−'}${Math.abs(lvl)} ${Math.abs(lvl) === 1 ? 'niveau' : 'niveaux'}`;
  });

  let attackKeepLabel = $derived(
    attackCalc?.keep === 'max' ? 'garder le max' : attackCalc?.keep === 'min' ? 'garder le min' : ''
  );

  function toggleAttack() {
    showAttack = !showAttack;
    resizeForAttack();
  }

  async function resizeForAttack() {
    if (folded) return;
    const delta = showAttack ? 190 : -190;
    const target = Math.max(FOLDED_HEIGHT, expandedHeight + delta);
    try {
      await OBR.popover.setHeight(popoverId, target);
      const actual = await OBR.popover.getHeight(popoverId);
      if (actual != null && Math.abs(actual - target) <= 4) expandedHeight = target;
    } catch {
      /* popover resize not available — panel still opens */
    }
  }

  function saveAttackSettings() {
    try {
      localStorage.setItem(
        `cardenveil-attack-${playerId}`,
        JSON.stringify({ weapon: attackWeaponName, adv: attackAdv, engagement: attackEngagement })
      );
    } catch {
      /* storage unavailable */
    }
  }

  async function doAttackRoll() {
    const weapon = selectedAttackWeapon;
    if (!weapon || !sheet) return;
    saveAttackSettings();
    let result;
    try {
      result = rollAttack(weapon, sheet.stats ?? {}, { advantage: attackAdv, engagement: attackEngagement });
    } catch (err) {
      console.warn('Attack roll failed:', err);
      return;
    }
    if (!result) return;
    const label = `Attaque · ${weapon.nom || 'Sans nom'}`;
    // ponytail: attacks are pre-rolled (flat pipeline) — the 3D intent flow can't
    // replay reactive crit explosions; switch to a seeded server replay if needed.
    broadcastRoll({
      label,
      color: diceGemColor(sheet),
      playerId,
      portrait: sheet?.portrait || '',
      portraitIsImage: isImageUrl(sheet?.portrait),
      formula: `${result.stages[0]?.pool ?? 1}d${result.sides}${result.weaponBonus ? (result.weaponBonus > 0 ? '+' : '') + result.weaponBonus : ''}${attackEngagement > 0 ? `${fmt(result.engagementMod)}×${attackEngagement}` : ''}`,
      rolls: result.stages.flatMap((s) => s.dice),
      diceTypes: result.stages.flatMap((s) => s.dice.map(() => result.sides)),
      total: result.total,
      breakdown: result.breakdown,
      critCount: result.critCount,
      miss: result.miss
    });
    // Action log: same USE_CAPACITY channel, breakdown folded into the formula string (32 chars max).
    dispatch(roomId, {
      type: 'USE_CAPACITY',
      playerId,
      capacityName: label.slice(0, 120),
      formula: `${result.stages[0]?.pool ?? 1}d${result.sides}${result.miss ? ' MISS' : result.critCount > 0 ? ` CRIT×${result.critCount}` : ''}`.slice(0, 32),
      total: result.total,
      rolls: result.stages.map((s) => s.kept)
    }).catch((err) => console.error('Failed to dispatch attack roll:', err));
  }
  // Rule-derived combat values (parade, initiative, armure, vitesse)
  let calc = $derived(computeDerived(sheet ?? {}));

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
          {#if sheet.portrait && isImageUrl(sheet.portrait)}
            <img src={sheet.portrait} alt="Portrait" class="w-full h-full object-cover" />
          {:else if sheet.portrait}
            <span class="text-xl leading-none">{sheet.portrait}</span>
          {:else}
            <span class="text-[7px] font-bold text-[#9ca3af]">PORTRAIT</span>
          {/if}
        </div>
        <button
          onclick={() => (showNotes = !showNotes)}
          title={showNotes ? 'Masquer les notes' : 'Voir les notes'}
          class="w-6 h-8 rounded-md bg-[#111827] border border-[#374151] text-[#9ca3af] hover:text-white text-[11px] flex items-center justify-center shrink-0 transition-colors"
        >
          📝
        </button>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-bold truncate">{sheet.identity?.nom || 'Sans nom'}</div>
          <div class="text-[10px] text-[#9ca3af] truncate">
            {raceLabel(sheet.identity?.race) || '—'} · Niv. {sheet.identity?.niveau ?? 1}
          </div>
        </div>
        <div class="flex flex-col gap-1 shrink-0">
          <button
            onclick={toggleAttack}
            title="Attaque (avantage / engagement)"
            class={`w-6 h-6 rounded-md border text-[11px] flex items-center justify-center transition-colors ${showAttack ? 'bg-indigo-600 border-indigo-400' : 'bg-[#111827] border-[#374151] hover:bg-[#374151]'}`}
          >
            ⚔️
          </button>
          <button
            onclick={() => doRoll('Mod Esprit D6', `${Math.max(1, calc.canalisation)}d6`)}
            use:tooltip={`Mod Esprit × d6 (${Math.max(1, calc.canalisation)}d6)`}
            class="w-6 h-6 rounded-md bg-[#111827] border border-[#374151] hover:bg-[#374151] text-[11px] flex items-center justify-center transition-colors"
          >
            🪄
          </button>
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
          <div
            onclick={() => doRoll(STAT_LABELS[stat] || stat, `d20${statMod(stat) >= 0 ? '+' + statMod(stat) : statMod(stat)}`)}
            role="button"
            tabindex="0"
            onkeydown={(e) => e.key === 'Enter' && doRoll(STAT_LABELS[stat] || stat, `d20${statMod(stat) >= 0 ? '+' + statMod(stat) : statMod(stat)}`)}
            use:tooltip={`Jet de ${STAT_LABELS[stat] || stat} (d20) · Compétences : ${SKILL_GROUPS.find((g) => g.stat === stat)?.skills.map((sk) => SKILL_LABELS[sk] || sk).join(', ') || '—'}`}
            class="bg-[#111827] rounded-md px-1.5 py-1 text-center cursor-pointer hover:bg-[#1f2937] transition-colors"
          >
            <div class="text-[7px] font-bold text-[#9ca3af]">{(STAT_LABELS[stat] || stat).toUpperCase()}</div>
            <div class="text-sm font-bold leading-tight" style="color: {STAT_COLORS[stat]}">
              {toNumber(sheet.stats?.[stat])}
              <span class="text-[10px] text-white">{fmt(statMod(stat))}</span>
            </div>
          </div>
        {/each}
      </div>
      <!-- Combat values: Parade (static), Initiative + Vitesse (click-to-roll d20) -->
      <div class="grid grid-cols-4 gap-1.5 mt-1.5">
        <div class="bg-[#111827] rounded-md px-1.5 py-1 text-center">
          <div class="text-[7px] font-bold text-[#9ca3af]">PARADE</div>
          <div class="text-sm font-bold leading-tight text-[#e5e7eb]">{calc.parade}</div>
        </div>
        <div
          onclick={() => doRoll('Initiative', `d20${fmt(calc.initiative)}`)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && doRoll('Initiative', `d20${fmt(calc.initiative)}`)}
          title={`Jet d'initiative (d20)`}
          class="bg-[#111827] rounded-md px-1.5 py-1 text-center cursor-pointer hover:bg-[#1f2937] transition-colors"
        >
          <div class="text-[7px] font-bold text-[#9ca3af]">INITIAT.</div>
          <div class="text-sm font-bold leading-tight" style="color: {STAT_COLORS.agilite}">{calc.initiative}</div>
        </div>
        <div class="bg-[#111827] rounded-md px-1.5 py-1 text-center">
          <div class="text-[7px] font-bold text-[#9ca3af]">ARMURE</div>
          <div class="text-sm font-bold leading-tight text-[#60a5fa]">{calc.armure}</div>
        </div>
        <div
          onclick={() => doRoll('Vitesse', `d20${fmt(calc.mouvement)}`)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && doRoll('Vitesse', `d20${fmt(calc.mouvement)}`)}
          title={`Jet de vitesse (d20)`}
          class="bg-[#111827] rounded-md px-1.5 py-1 text-center cursor-pointer hover:bg-[#1f2937] transition-colors"
        >
          <div class="text-[7px] font-bold text-[#9ca3af]">VITESSE</div>
          <div class="text-sm font-bold leading-tight text-[#4ade80]">{calc.mouvement}</div>
        </div>
      </div>
      <!-- Attack panel: weapon dropdown + avantage slider + engagement -->
      {#if showAttack}
        <div class="mt-2 pt-2 border-t border-[#374151] space-y-2">
          {#if equippedWeapons.length === 0}
            <div class="text-[10px] text-[#9ca3af] text-center py-2">Aucune arme équipée</div>
          {:else if selectedAttackWeapon && attackCalc}
            <div class="flex items-center gap-1.5">
              <span class="text-[8px] font-bold text-[#9ca3af] shrink-0">ARME</span>
              <select
                bind:value={attackWeaponName}
                onchange={saveAttackSettings}
                class="flex-1 min-w-0 px-1.5 py-0.5 bg-[#242424] border border-[#374151] rounded-md text-[10px] font-bold focus:outline-none focus:border-indigo-500"
              >
                {#each equippedWeapons as w}
                  <option value={w?.nom}>{w?.nom || 'Sans nom'} — {w?.de}{w?.proprietes ? ` · ${w.proprietes.split(',')[0]}` : ''}</option>
                {/each}
              </select>
            </div>
            <div>
              <div class="flex items-center justify-between">
                <span class="text-[8px] font-bold text-[#9ca3af]">AVANTAGE / DÉSAVANTAGE</span>
                <span
                  class={`text-[10px] font-bold ${attackAdv > 0 ? 'text-[#4ade80]' : attackAdv < 0 ? 'text-[#f87171]' : 'text-[#9ca3af]'}`}
                >
                  {attackAdv === 0 ? 'NEUTRE' : `${attackAdv > 0 ? '+' : ''}${attackAdv}`}
                </span>
              </div>
              <input
                type="range" min="-7" max="7" step="1" bind:value={attackAdv}
                oninput={saveAttackSettings}
                class="w-full accent-indigo-500 h-1.5"
              />
              <div class="text-[9px] text-[#9ca3af]">
                {attackCalc.diceCount} dés · {attackKeepLabel || "garder l'unique"} · {attackLevelLabel}{attackEngagement > 0 ? ' (après engagement)' : ''}
              </div>
            </div>
            <div>
              <div class="flex items-center justify-between">
                <span class="text-[8px] font-bold text-[#9ca3af]">ENGAGEMENT</span>
                <span class="text-[10px] font-bold text-indigo-300">
                  {attackEngagement === 0 ? 'AUCUN' : `${attackEngagement} · ${fmt(attackCalc.engagementMod)} ${STAT_LABELS[attackCalc.engagementStat] || ''}${attackCalc.finesse ? ' ×(1+crits)' : ''}`}
                </span>
              </div>
              <input
                type="range" min="0" max="7" step="1" bind:value={attackEngagement}
                oninput={saveAttackSettings}
                class="w-full accent-indigo-500 h-1.5"
              />
            </div>
            <div class="text-[9px] text-[#9ca3af] leading-snug">
              <div>Jet : {attackCalc.diceCount}d{attackCalc.sides}{attackKeepLabel ? ` · ${attackKeepLabel}` : ''}</div>
              <div>Dégâts : {attackCalc.keep ? `${attackCalc.keep} + ` : 'dé + '}{attackCalc.weaponBonus ? `${fmt(attackCalc.weaponBonus)} arme` : ''}{attackEngagement > 0 ? `${attackCalc.weaponBonus ? ' ' : ''}${fmt(attackCalc.engagementMod * attackEngagement)} ${STAT_LABELS[attackCalc.engagementStat]}` : ''}{attackCalc.finesse ? ' (répété ×crits)' : ''}{attackCalc.hache ? ' (Brutalité : explosion 2d, doubles)' : ''}</div>
            </div>
            <button
              onclick={doAttackRoll}
              class="w-full py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 transition-colors text-[11px] font-bold text-white"
            >
              ⚔️ ATTAQUER
            </button>
          {/if}
        </div>
      {/if}
      <!-- Quick dice row: click a die to add it to the formula, then Roll -->
      <div class="flex items-center justify-center gap-1 mt-2 pt-2 border-t border-[#374151] flex-wrap">
        {#each QUICK_DICE as d}
          <button
            onclick={() => addQuickDie(d.die)}
            title={`Ajouter 1${d.die} à la formule`}
            class="relative flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[#111827] border {(quickCounts[d.die.slice(1)] ?? 0) > 0 ? 'border-indigo-400' : 'border-[#374151]'} hover:border-indigo-500 hover:bg-[#1f2937] transition-colors text-[9px] font-bold text-indigo-300"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">{@html d.icon}</svg>
            <span>{d.die}</span>
            {#if (quickCounts[d.die.slice(1)] ?? 0) > 0}
              <span class="absolute -top-1.5 -right-1.5 min-w-3.5 h-3.5 px-0.5 rounded-full bg-indigo-500 text-white text-[8px] font-bold leading-[14px]">{quickCounts[d.die.slice(1)]}</span>
            {/if}
          </button>
        {/each}
        <input
          bind:value={quickFormula}
          placeholder="1d20+1d6…"
          class="w-24 min-w-0 px-1.5 py-0.5 bg-[#242424] border border-[#374151] rounded-md text-[10px] font-bold focus:outline-none focus:border-indigo-500"
        />
        <button
          onclick={() => { doRoll('Jet rapide', quickFormula); quickFormula = ''; }}
          disabled={!quickFormula || !isDiceFormula(quickFormula, sheet?.stats ?? {})}
          title="Lancer la formule"
          class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[10px] font-bold text-white"
        >
          🎲 Lancer
        </button>
      </div>
      <!-- Per-turn action diamonds (centered; long hover shows the combat actions reference) -->
      <ActionDiamonds
        checks={sheet.actionChecks}
        onToggle={toggleActionCheck}
        compact
        class="flex items-center justify-center gap-4 mt-2 pt-2 border-t border-[#374151]"
      />
    </div>

    {#if showNotes}
      <div class="shrink-0 px-3 py-2 border-b border-[#374151]">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[9px] font-bold text-[#9ca3af]">NOTES</span>
          <button
            onclick={saveNotes}
            disabled={!notesDraftDirty}
            class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-default rounded-lg text-[9px] font-bold transition-colors"
          >
            💾 Sauvegarder
          </button>
        </div>
        <textarea
          bind:value={notesDraft}
          oninput={() => (notesDraftDirty = true)}
          placeholder="Aucune note."
          class="w-full h-28 px-2 py-1.5 bg-[#242424] border border-[#374151] rounded text-[11px] leading-relaxed focus:outline-none focus:border-indigo-500 resize-y"
        ></textarea>
      </div>
    {/if}

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
          <span class="text-[11px] font-medium truncate">
            {SKILL_LABELS[skillKey] || skillKey}
            {#if sheet?.skills?.[skillKey]?.trained}
              <span class="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 align-middle" title="Maîtrisée — modificateur doublé"></span>
            {/if}
          </span>
          <span class="ml-auto text-[11px] font-bold" style="color: {skillColor(skillKey)}">d20 {fmt(skillMod(skillKey))}</span>
        </button>
      {/each}

      {#each sheet.customRolls ?? [] as roll}
        {#if roll?.formula && isDiceFormula(roll.formula, sheet?.stats ?? {})}
          <button
            class="w-full flex items-center gap-2 bg-[#111827] hover:bg-[#1f2937] rounded-md px-2.5 py-2 text-left transition-colors"
            onclick={() => doRoll(roll.name || roll.formula, roll.formula)}
          >
            <div class="w-1 h-5 rounded-full bg-slate-500"></div>
            <span class="text-[11px] font-medium truncate flex-1">{roll.name || roll.formula}</span>
            <span class="ml-auto text-[11px] font-bold text-slate-300">{roll.formula}</span>
          </button>
        {/if}
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
          {#if sheet.totem?.image && !isImageUrl(sheet.totem.image)}
            <span class="mr-1">{sheet.totem.image}</span>
          {/if}
          TOTEM &nbsp;{sheet.totem.nom}
        </div>
      {/if}
    </div>

    <!-- Roll result (animated dice popup only; inline panel removed) -->
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
