<script>
  import { onMount, tick } from 'svelte';
  import OBR from '@owlbear-rodeo/sdk';
  import ActionDiamonds from './ActionDiamonds.svelte';
  import { importSheetArchive } from './sheetAssets.js';
  import {
    STAT_COLORS,
    SKILL_GROUPS,
    SKILL_LABELS,
    colorLabel,
    capacityType,
    fetchCharacterSheet,
    saveCharacterSheet,
    deleteCharacterSheet,
    importCharacterSheet,
    createEmptyCharacterSheet,
    attackBonus,
    computeDerived,
    isDiceFormula,
    rollDice,
    skillModifier,
    subscribeToCharacterSheet,
    suitColor,
    suitSymbol,
    isImageUrl,
    EQUIPMENT_CATALOG,
    findEquipmentTemplate,
    itemTypeColor,
    ITEM_TYPE_OPTIONS,
    syncSkillBonuses,
    syncStatsFromEquipment,
    toNumber
  } from './characterSheet.js';

  let { playerId, roomId, gameState = null, onAction = () => {} } = $props();

  let sheet = $state(null);
  let editSheet = $state(null);
  let isEditing = $state(false);
  let isLoading = $state(true);
  let isSaving = $state(false);
  let showUnsavedModal = $state(false);
  let showDeleteConfirm = $state(false);
  let pendingAction = $state(null);
  let activeTab = $state('competences');
  let diceResult = $state(null);
  let freeFormula = $state('');
  let importError = $state('');
  let openSlot = $state(null);
  let expandedNarrative = $state({});
  let masteryText = $state({});

  const TABS = [
    { id: 'competences', label: 'COMPÉTENCES' },
    { id: 'capacites', label: 'CAPACITÉS' },
    { id: 'inventaire', label: 'INVENTAIRE' },
    { id: 'narratif', label: 'NARRATIF' },
    { id: 'maitrises', label: 'MAÎTRISES' },
    { id: 'notes', label: 'NOTES' }
  ];

  const NARRATIVE_FIELDS = [
    ['background', 'BACKGROUND'],
    ['objectif', 'OBJECTIF'],
    ['personnalite', 'PERSONNALITÉ'],
    ['croyances', 'CROYANCES'],
    ['cicatrices', 'CICATRICES'],
    ['pulsion', 'PULSION'],
    ['instinct', 'INSTINCT'],
    ['liens', 'LIENS'],
    ['reputation', 'RÉPUTATION'],
    ['education', 'ÉDUCATION'],
    ['maniesEtTics', 'MANIES & TICS']
  ];

  const EQUIP_SLOTS = [
    ['amulette', 'Amulette', '◈'],
    ['casque', 'Casque', '⛑'],
    ['cape', 'Cape', '🧥'],
    ['gantelets', 'Gantelets', '🧤'],
    ['plastron', 'Plastron', '🛡'],
    ['anneau', 'Anneau', '💍'],
    ['bottes', 'Bottes', '🥾']
  ];

  const MASTERY_BLOCKS = [
    ['weapons', 'weaponMasteries', "MAÎTRISES D'ARMES"],
    ['elements', 'elementalMasteries', 'MAÎTRISES ÉLÉMENTAIRES'],
    ['feats', 'feats', 'FEATS'],
    ['evolutions', 'evolutions', 'ÉVOLUTIONS MÉCANIQUES']
  ];

  const IDENTITY_EXTRAS = [
    ['joueur', 'Joueur'],
    ['age', 'Âge'],
    ['taille', 'Taille'],
    ['poids', 'Poids'],
    ['yeux', 'Yeux'],
    ['peau', 'Peau'],
    ['cheveux', 'Cheveux']
  ];

  // Live view: the edit buffer while editing (main sheet displays it live), the saved sheet otherwise.
  let view = $derived(isEditing && editSheet ? editSheet : sheet);
  // Rule-derived combat values (parade, initiative, mouvement, volonté, ...) — always computed, never manual.
  let calc = $derived(computeDerived(view ?? {}));
  let editCalc = $derived(computeDerived(editSheet ?? {}));

  // Selected equipment-catalog templates for the add buttons (edit modal)
  let weaponTemplate = $state('');
  let itemTemplate = $state('');

  const DICE_POPOVER_ID = 'cardenveil-dice';
  const SHEET_POPOVER_ID = 'cardenveil-sheet';
  let dicePopoverTimer;
  let sheetPopoverOpen = $state(false);

  onMount(async () => {
    try {
      const data = await fetchCharacterSheet(playerId, roomId);
      if (data) {
        sheet = data.data;
      } else {
        sheet = createEmptyCharacterSheet();
      }

      // Subscribe to realtime updates
      const unsubscribe = subscribeToCharacterSheet(playerId, roomId, (newData) => {
        if (newData && !isEditing) {
          sheet = newData.data;
        }
      });

      return () => {
        unsubscribe();
      };
    } catch (err) {
      console.error('Failed to load character sheet:', err);
      sheet = createEmptyCharacterSheet();
    } finally {
      isLoading = false;
    }
  });

  // Sync tokens from game state to character sheet
  $effect(() => {
    if (!gameState || !sheet || isEditing) return;

    const player = gameState.players[playerId];
    if (!player) return;

    const gameTokens = player.tokens;
    const sheetTokens = sheet.resources?.tokens;

    if (sheetTokens && gameTokens) {
      const needsUpdate =
        sheetTokens.force !== gameTokens.force ||
        sheetTokens.agilite !== gameTokens.agilite ||
        sheetTokens.esprit !== gameTokens.esprit ||
        sheetTokens.social !== gameTokens.social;

      if (needsUpdate) {
        sheet = {
          ...sheet,
          resources: {
            ...sheet.resources,
            tokens: { ...gameTokens }
          }
        };
        saveCharacterSheet(playerId, roomId, sheet).catch(console.error);
      }
    }

    // Sync fatigue
    const gameFatigue = player.fatigue || 0;
    const sheetFatigue = sheet.derived?.fatigue || 0;

    if (sheetFatigue !== gameFatigue) {
      sheet = {
        ...sheet,
        derived: {
          ...sheet.derived,
          fatigue: gameFatigue
        }
      };
      saveCharacterSheet(playerId, roomId, sheet).catch(console.error);
    }
  });

  function startEdit() {
    editSheet = JSON.parse(JSON.stringify(sheet));
    editSheet.notes = editSheet.notes ?? '';
    editSheet.evolutions = editSheet.evolutions ?? [];
    editSheet.pinnedSkills = editSheet.pinnedSkills ?? [];
    editSheet.pinnedCapacities = editSheet.pinnedCapacities ?? [];
    masteryText = {
      weapons: (editSheet.weaponMasteries ?? []).map(masteryLabel).join('\n'),
      elements: (editSheet.elementalMasteries ?? []).map(masteryLabel).join('\n'),
      feats: (editSheet.feats ?? []).map(masteryLabel).join('\n'),
      evolutions: (editSheet.evolutions ?? []).map(masteryLabel).join('\n')
    };
    isEditing = true;
  }

  function applyMasteryText(target) {
    target.weaponMasteries = masteryText.weapons
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);
    target.elementalMasteries = masteryText.elements
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);
    target.feats = masteryText.feats
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);
    target.evolutions = masteryText.evolutions
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function cancelEdit() {
    editSheet = null;
    isEditing = false;
  }

  async function saveEdit() {
    isSaving = true;
    try {
      applyMasteryText(editSheet);
      editSheet = syncStatsFromEquipment(syncSkillBonuses(editSheet));
      await saveCharacterSheet(playerId, roomId, editSheet);
      sheet = editSheet;
      editSheet = null;
      isEditing = false;
    } catch (err) {
      console.error('Failed to save:', err);
      alert('Erreur lors de la sauvegarde: ' + err.message);
    } finally {
      isSaving = false;
    }
  }

  async function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.zip';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        importError = '';
        const imported = file.name.toLowerCase().endsWith('.zip')
          ? await importSheetArchive(playerId, roomId, await file.arrayBuffer())
          : await importCharacterSheet(playerId, roomId, await file.text());
        sheet = imported.data;
        isEditing = false;
        editSheet = null;
      } catch (err) {
        importError = err.message;
        console.error('Import failed:', err);
      }
    };

    input.click();
  }

  async function handleDelete() {
    try {
      await deleteCharacterSheet(playerId, roomId);
      sheet = createEmptyCharacterSheet();
      showDeleteConfirm = false;
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Erreur lors de la suppression: ' + err.message);
    }
  }

  // ─── Dice popup (OBR popover over the tabletop, inline fallback) ───
  async function showDicePopup(data) {
    const params = new URLSearchParams({
      label: data.label || '',
      formula: data.formula || '',
      total: data.total != null ? String(data.total) : '',
      rolls: (data.rolls ?? []).join(','),
      error: data.error || ''
    });
    try {
      await OBR.popover.open({
        id: DICE_POPOVER_ID,
        url: `${window.location.origin}/dice.html?${params.toString()}`,
        width: 340,
        height: 280
      });
      clearTimeout(dicePopoverTimer);
      dicePopoverTimer = setTimeout(() => {
        OBR.popover.close(DICE_POPOVER_ID).catch(() => {});
      }, 6000);
      diceResult = null;
    } catch (err) {
      console.warn('Dice popover unavailable, falling back to inline result:', err);
      diceResult = data.error
        ? { error: data.error }
        : { ...data, timestamp: new Date().toLocaleTimeString() };
    }
  }

  function handleDiceRoll(capacityName, formula) {
    try {
      const result = rollDice(formula, view?.stats ?? {});
      onAction({
        type: 'USE_CAPACITY',
        playerId,
        capacityName,
        formula: result.formula,
        total: result.total,
        rolls: result.rolls,
      });
      showDicePopup({ label: capacityName, ...result });
    } catch (err) {
      showDicePopup({ label: capacityName, error: err.message });
    }
  }

  function handleSkillRoll(skillKey) {
    const mod = skillModifier(view.stats, skillKey, view.skills?.[skillKey]?.bonus ?? 0);
    const label = SKILL_LABELS[skillKey] || skillKey;
    checkUnsavedChanges(() => handleDiceRoll(label, `d20${mod >= 0 ? '+' + mod : mod}`));
  }

  function checkUnsavedChanges(actionCallback) {
    if (isEditing) {
      pendingAction = actionCallback;
      showUnsavedModal = true;
    } else {
      actionCallback();
    }
  }

  function confirmSaveAndContinue() {
    saveEdit().then(() => {
      showUnsavedModal = false;
      if (pendingAction) {
        pendingAction();
        pendingAction = null;
      }
    });
  }

  function discardAndContinue() {
    cancelEdit();
    showUnsavedModal = false;
    if (pendingAction) {
      pendingAction();
      pendingAction = null;
    }
  }

  function getStatModifier(stat) {
    const value = view?.stats?.[stat] || 10;
    return Math.floor((value - 10) / 2);
  }

  function formatModifier(value) {
    return value >= 0 ? `+${value}` : `${value}`;
  }

  function stripHtml(text) {
    return (text || '').replace(/<[^>]*>/g, '').trim();
  }

  function masteryLabel(mastery) {
    if (typeof mastery === 'string') return mastery;
    return mastery?.nom || mastery?.name || '';
  }

  function masteryItems(key) {
    const map = {
      weapons: view?.weaponMasteries,
      elements: view?.elementalMasteries,
      feats: view?.feats,
      evolutions: view?.evolutions
    };
    return (map[key] ?? []).map(masteryLabel).filter(Boolean);
  }

  function equipSummary(slot, data) {
    const deflexion = toNumber(data?.deflexion);
    if (slot === 'casque') return `Défl. ${deflexion} · Vol. ${toNumber(data?.volonte)}`;
    if (slot === 'plastron') return `Défl. ${deflexion} · Arm. ${toNumber(data?.armure)}`;
    if (slot === 'gantelets') return `Défl. ${deflexion} · Init. ${toNumber(data?.initiative)}`;
    if (slot === 'bottes') return `Défl. ${deflexion} · Vit. ${toNumber(data?.vitesse)}`;
    return '—';
  }

  function inventoryGroups(items) {
    const groups = new Map();
    for (const item of items ?? []) {
      const type = (item?.type || 'Divers').toString();
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type).push(item);
    }
    return [...groups.entries()];
  }

  function itemFamilies(items) {
    const families = [...new Set((items ?? []).map((it) => it?.family).filter(Boolean))];
    return families.join(' · ') || '—';
  }

  function itemCenterValue(item) {
    if (item?.degats) return item.degats;
    const quantity = item?.quantite ?? item?.quantity;
    return quantity != null && quantity !== '' ? `x${quantity}` : '';
  }

  function itemNotes(item) {
    return stripHtml(item?.attributs || item?.description) || '—';
  }

  // ─── Pins (📌 favorites) — persisted in the sheet ───
  function isPinned(list, key) {
    return (list ?? []).includes(key);
  }

  function capacityPinKey(capacity, i) {
    return capacity?.name || `#${i}`;
  }

  function togglePin(listKey, key) {
    const list = sheet?.[listKey] ?? [];
    const pinned = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
    const next = { ...sheet, [listKey]: pinned };
    sheet = next;
    saveCharacterSheet(playerId, roomId, next).catch(console.error);
  }

  // ─── Per-turn action diamonds (toggle + persist, no reset logic) ───
  function toggleActionCheck(key) {
    if (isEditing) return;
    const current = sheet?.actionChecks ?? {};
    sheet = { ...sheet, actionChecks: { ...current, [key]: !current[key] } };
    saveCharacterSheet(playerId, roomId, sheet).catch(console.error);
  }

  // ─── Compact sheet popover (basic info + favorited rolls) ───
  async function toggleSheetPopover() {
    try {
      if (sheetPopoverOpen) {
        await OBR.popover.close(SHEET_POPOVER_ID);
        sheetPopoverOpen = false;
        return;
      }
      const vw = await OBR.viewport.getWidth();
      const vh = await OBR.viewport.getHeight();
      await OBR.popover.open({
        id: SHEET_POPOVER_ID,
        // ponytail: cache-bust (?v=) so the popover frame never runs stale JS
        // after a deploy — OBR can serve popovers from HTTP cache
        url: `${window.location.origin}/sheet.html?playerId=${encodeURIComponent(playerId)}&roomId=${encodeURIComponent(roomId)}&popoverId=${encodeURIComponent(SHEET_POPOVER_ID)}&v=${Date.now()}`,
        width: 380,
        height: 540,
        anchorPosition: { left: vw, top: -70 },
        anchorOrigin: { horizontal: 'RIGHT', vertical: 'TOP' },
        transformOrigin: { horizontal: 'RIGHT', vertical: 'TOP' },
        disableClickAway: true,
        marginThreshold: 70
      });
      sheetPopoverOpen = true;
    } catch (err) {
      console.error('Failed to toggle compact sheet popover:', err);
    }
  }

  let notesArea;

  function wrapNotesSelection(prefix, suffix) {
    if (!isEditing || !notesArea) return;
    const start = notesArea.selectionStart ?? 0;
    const end = notesArea.selectionEnd ?? 0;
    const value = editSheet?.notes ?? '';
    const selected = value.slice(start, end);
    editSheet.notes = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
    const selStart = start + prefix.length;
    const selEnd = selStart + selected.length;
    tick().then(() => {
      notesArea.focus();
      notesArea.setSelectionRange(selStart, selEnd);
    });
  }

  function prefixNotesLines(prefix) {
    if (!isEditing || !notesArea) return;
    const start = notesArea.selectionStart ?? 0;
    const end = notesArea.selectionEnd ?? 0;
    const value = editSheet?.notes ?? '';
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const segment = value.slice(lineStart, end);
    const replaced = segment
      .split('\n')
      .map((line) => (line.trim() === '' ? line : prefix + line))
      .join('\n');
    editSheet.notes = value.slice(0, lineStart) + replaced + value.slice(end);
    tick().then(() => {
      notesArea.focus();
      notesArea.setSelectionRange(lineStart, lineStart + replaced.length);
    });
  }

  function insertNotesText(text) {
    if (!isEditing || !notesArea) return;
    const start = notesArea.selectionStart ?? 0;
    const end = notesArea.selectionEnd ?? 0;
    const value = editSheet?.notes ?? '';
    editSheet.notes = value.slice(0, start) + text + value.slice(end);
    const cursor = start + text.length;
    tick().then(() => {
      notesArea.focus();
      notesArea.setSelectionRange(cursor, cursor);
    });
  }
</script>

<div
  class="@container w-full h-full bg-[#242424] text-white rounded-b-2xl border border-[#374151] overflow-hidden flex flex-col relative"
>
  {#if isLoading}
    <div class="flex-1 flex items-center justify-center text-[#9ca3af] text-sm">
      Chargement de la fiche de personnage...
    </div>
  {:else}
    <!-- ═══ TOP BAR ═══ -->
    <div class="h-10 bg-[#1f2937] flex items-center px-3 shrink-0">
      <span class="text-sm font-bold tracking-wide">CARDENVEIL</span>
      <span class="text-xs font-medium text-[#9ca3af] ml-4 truncate hidden @2xl:block">
        {view.identity?.nom || '—'} · {view.identity?.race || '—'} · Niveau {view.identity?.niveau ?? 1}
      </span>
      <div class="ml-auto flex items-center gap-1.5 shrink-0">
        <button
          onclick={toggleSheetPopover}
          title="Fiche compacte — favoris et lancers rapides"
          class="h-8 min-w-8 px-2 @2xl:px-3 bg-[#111827] rounded-full text-[10px] font-semibold text-[#9ca3af] hover:text-white transition-colors whitespace-nowrap flex items-center justify-center {sheetPopoverOpen
            ? 'ring-1 ring-indigo-400 text-indigo-300'
            : ''}"
        >
          <span class="hidden @2xl:inline">COMPACT</span><span class="@2xl:hidden">📌</span>
        </button>
        <button
          onclick={handleImport}
          title="Importer une fiche JSON"
          class="h-8 min-w-8 px-2 @2xl:px-3 bg-[#111827] rounded-full text-[10px] font-semibold text-[#9ca3af] hover:text-white transition-colors flex items-center justify-center whitespace-nowrap"
        >
          <span class="hidden @2xl:inline">IMPORTER</span><span class="@2xl:hidden">⇩</span>
        </button>
        <button
          onclick={() => (showDeleteConfirm = true)}
          title="Supprimer la fiche"
          class="h-8 min-w-8 px-2 @2xl:px-3 bg-[#111827] rounded-full text-[10px] font-semibold text-[#9ca3af] hover:text-red-400 transition-colors flex items-center justify-center whitespace-nowrap"
        >
          <span class="hidden @2xl:inline">SUPPRIMER</span><span class="@2xl:hidden">🗑</span>
        </button>
        <button
          onclick={startEdit}
          title="Modifier la fiche (formulaire agrandi)"
          class="h-8 min-w-8 px-2 @2xl:px-3 bg-indigo-600 rounded-full text-[10px] font-semibold hover:bg-indigo-500 transition-colors whitespace-nowrap flex items-center justify-center"
        >
          ÉDITION
        </button>
      </div>
    </div>

    {#if importError}
      <div class="bg-red-950 border-b border-red-800 px-3 py-2 text-red-200 text-xs">
        Erreur d'import : {importError}
      </div>
    {/if}

    <!-- ═══ CHARACTER HEADER (display-only; edited via the ÉDITION popup) ═══ -->
    <div class="px-3 pt-3 pb-2.5 shrink-0">
      <div class="flex items-center gap-3">
        <!-- Portrait -->
        <div class="w-14 h-16 bg-[#111827] rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
          {#if view.portrait && isImageUrl(view.portrait)}
            <img src={view.portrait} alt="Portrait" class="w-full h-full object-cover" />
          {:else if view.portrait}
            <span class="text-2xl leading-none">{view.portrait}</span>
          {:else}
            <span class="text-[8px] font-bold text-[#9ca3af]">PORTRAIT</span>
          {/if}
        </div>

        <!-- Identity -->
        <div class="flex-1 min-w-0">
          <h1 class="text-xl font-bold leading-tight truncate">{view.identity?.nom || 'Sans nom'}</h1>
          <p class="text-[11px] font-medium text-[#9ca3af] truncate">
            {view.identity?.race || '—'} · {view.identity?.alignement || '—'}
          </p>
          <div class="flex gap-1.5 mt-1.5 flex-wrap">
            <span class="px-2 py-0.5 bg-[#111827] rounded-full text-[10px] font-semibold">
              XP {view.progression?.xpDepenses ?? 0}/{view.progression?.xpDisponibles ?? 0}
            </span>
            <span class="px-2 py-0.5 bg-[#111827] rounded-full text-[10px] font-semibold">
              Niv. {view.identity?.niveau ?? 1}
            </span>
          </div>
        </div>

        <!-- PV -->
        <div class="text-right shrink-0">
          <div class="text-[9px] font-bold text-[#9ca3af]">PV</div>
          <div class="flex items-baseline gap-1 justify-end mt-0.5">
            <span class="text-2xl font-bold leading-none">{toNumber(view.derived?.pvActuels)}</span>
            <span class="text-xs font-semibold text-[#9ca3af]">/ {toNumber(view.derived?.pvMax)}</span>
          </div>
          <div class="text-[9px] text-[#9ca3af] mt-1">
            TEMP {view.derived?.pvTemporaires || '—'} · FAT
            {#if toNumber(view.derived?.fatigue) > 0}
              {'●'.repeat(Math.min(10, toNumber(view.derived.fatigue)))}
            {:else}—{/if}
          </div>
        </div>
      </div>

      <!-- ═══ STATS ROW ═══ -->
      <div class="grid grid-cols-4 gap-2 mt-2.5">
        {#each ['force', 'agilite', 'esprit', 'social'] as stat}
          <div class="bg-[#111827] rounded-lg p-2">
            <div class="text-[9px] font-bold text-[#9ca3af]">{stat.toUpperCase()}</div>
            <div class="flex items-baseline justify-between mt-0.5">
              <span class="text-xl font-bold leading-none" style="color: {STAT_COLORS[stat]}">
                {toNumber(view.stats?.[stat])}
              </span>
              <span class="text-base font-bold">{formatModifier(getStatModifier(stat))}</span>
            </div>
          </div>
        {/each}
      </div>

      <!-- ═══ DEFENSE ROW ═══ -->
      <div class="grid grid-cols-3 gap-2 mt-2">
        <!-- Parade -->
        <div class="bg-[#1f2937] rounded-lg p-2">
          <div class="text-[9px] font-bold text-[#9ca3af]">PARADE</div>
          <div class="flex items-baseline gap-1.5 mt-0.5">
            <span class="text-xl font-bold leading-none">
              {calc.parade}
            </span>
            <span class="text-[10px] text-[#9ca3af] font-medium whitespace-nowrap">
              = <span class="text-teal-400 font-bold">{calc.deflexion}</span>+
              <span class="text-orange-400 font-bold">{calc.garde}</span>+
              <span class="font-bold">{calc.paradeBonus}</span>
            </span>
          </div>
          <div class="text-[9px] text-[#9ca3af] mt-1">Armure {calc.armure}</div>
        </div>

        <!-- Initiative -->
        <div class="bg-[#1f2937] rounded-lg p-2">
          <div class="text-[9px] font-bold text-[#9ca3af]">INITIATIVE</div>
          <div class="text-xl font-bold leading-none mt-0.5" style="color: {STAT_COLORS.agilite}">
            {calc.initiative}
          </div>
          <div class="text-[9px] text-[#9ca3af] mt-1 hidden @2xl:block">Agi − 10 + gants</div>
        </div>

        <!-- Mouvement -->
        <div class="bg-[#1f2937] rounded-lg p-2">
          <div class="text-[9px] font-bold text-[#9ca3af]">MOUVEMENT</div>
          <div class="mt-0.5">
            <span class="text-xl font-bold leading-none" style="color: {STAT_COLORS.social}">
              {calc.mouvement}
            </span>
            <span class="text-[10px] font-bold text-[#9ca3af]">m</span>
          </div>
          <div class="text-[9px] text-[#9ca3af] mt-1 hidden @2xl:block">8 + Agi/2 + bottes</div>
        </div>
      </div>

      <!-- ═══ PILLS ROW ═══ -->
      <div class="grid grid-cols-4 gap-2 mt-2">
        <div class="bg-[#111827] rounded-md px-2 py-1.5">
          <div class="text-[8px] font-bold text-[#9ca3af]">SEUIL MISS</div>
          <div class="text-base font-bold">{calc.seuilMiss}</div>
        </div>
        <div class="bg-[#111827] rounded-md px-2 py-1.5">
          <div class="text-[8px] font-bold text-[#9ca3af]">BNS ATT.</div>
          <div class="text-base font-bold">{formatModifier(calc.bonusAttaque)}</div>
        </div>
        <div class="bg-[#111827] rounded-md px-2 py-1.5">
          <div class="text-[8px] font-bold text-[#9ca3af]">CANALIS.</div>
          <div class="text-base font-bold">{formatModifier(calc.canalisation)}</div>
        </div>
        <div class="bg-[#111827] rounded-md px-2 py-1.5">
          <div class="text-[8px] font-bold text-[#9ca3af]">VOLONTÉ</div>
          <div class="text-base font-bold">{calc.volonte}</div>
        </div>
      </div>
      <button
        onclick={() => (activeTab = 'capacites')}
        class="w-full mt-2 bg-indigo-600 rounded-md px-2.5 py-1.5 flex items-center justify-between hover:bg-indigo-500 transition-colors text-left"
      >
        <span class="text-[10px] font-bold truncate">TOTEM &nbsp;{view.totem?.nom || '—'}</span>
        <span class="text-[9px] font-medium text-indigo-200 shrink-0">Voir effet →</span>
      </button>
    </div>

    <!-- ═══ CONTENT VIEWPORT ═══ -->
    <div class="flex-1 min-h-0 bg-[#1f2937] rounded-[10px] mx-2 @2xl:mx-4 overflow-y-auto scrollbar-thin p-3 @2xl:p-4">
      {#if activeTab === 'competences'}
        <!-- TAB: COMPÉTENCES -->
        <div>
          <h2 class="text-sm font-bold mb-1">COMPÉTENCES</h2>
          <p class="text-[10px] text-[#9ca3af] mb-3">
            Cliquer sur une compétence lance un jet d20 + modificateur — 📌 épingler en favori
          </p>
          <div class="grid grid-cols-1 @2xl:grid-cols-2 gap-x-6 gap-y-4">
            {#each SKILL_GROUPS as group}
              <div>
                <div class="text-[11px] font-bold mb-1.5" style="color: {STAT_COLORS[group.stat]}">
                  {group.label}
                </div>
                <div class="space-y-1">
                  {#each group.skills as skillKey}
                    {@const mod = skillModifier(view.stats, skillKey, view.skills?.[skillKey]?.bonus ?? 0)}
                    {@const pinned = isPinned(view.pinnedSkills, skillKey)}
                    <div
                      class="skill-row flex items-center gap-2 bg-[#111827] rounded-md px-2.5 py-2 cursor-pointer hover:bg-[#374151] transition-colors"
                      onclick={() => handleSkillRoll(skillKey)}
                      role="button"
                      tabindex="0"
                      onkeydown={(e) => e.key === 'Enter' && handleSkillRoll(skillKey)}
                    >
                      <div class="w-1 h-5 rounded-full shrink-0" style="background: {STAT_COLORS[group.stat]}"></div>
                      <span class="text-[11px] font-medium truncate flex-1">
                        {SKILL_LABELS[skillKey]} {formatModifier(mod)}
                      </span>
                      <button
                        onclick={(e) => {
                          e.stopPropagation();
                          togglePin('pinnedSkills', skillKey);
                        }}
                        title={pinned ? 'Retirer des favoris' : 'Épingler en favori'}
                        class="text-[11px] leading-none shrink-0 transition-opacity {pinned
                          ? ''
                          : 'opacity-25 hover:opacity-70'}"
                      >
                        📌
                      </button>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else if activeTab === 'capacites'}
        <!-- TAB: CAPACITÉS -->
        <div>
          <h2 class="text-sm font-bold mb-1">CAPACITÉS</h2>
          <p class="text-[10px] text-[#9ca3af] mb-3">
            La valeur en dés est l'élément automatisable et cliquable.
          </p>

          <!-- Per-turn action diamonds (centered; long hover shows the combat actions reference) -->
          <div class="flex justify-center mb-3">
            <ActionDiamonds
              checks={view.actionChecks}
              onToggle={toggleActionCheck}
              class="inline-flex items-center gap-5 bg-[#1f2937] rounded-lg px-3.5 py-2"
            />
          </div>

          <!-- Free roll -->
          <div class="flex gap-2 mb-3">
            <input
              type="text"
              bind:value={freeFormula}
              placeholder="Lancer libre — ex. 2d20+5"
              onkeydown={(e) => {
                if (e.key === 'Enter') handleDiceRoll('Lancer libre', freeFormula);
              }}
              class="flex-1 min-w-0 px-3 py-2 bg-[#111827] border border-[#374151] rounded-lg text-xs focus:outline-none focus:border-indigo-500"
            />
            <button
              onclick={() => handleDiceRoll('Lancer libre', freeFormula)}
              class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
            >
              Lancer
            </button>
          </div>

          <div class="space-y-2.5">
            {#each view.capacities || [] as capacity, i}
              {@const pinKey = capacityPinKey(capacity, i)}
              {@const pinned = isPinned(view.pinnedCapacities, pinKey)}
              {@const typeBadge = capacityType(capacity.usage)}
              <div class="capacity-card bg-[#111827] rounded-lg p-2.5 hover:bg-[#374151] transition-colors">
                <div class="flex gap-2.5">
                  <div class="w-14 h-14 @2xl:w-20 @2xl:h-20 bg-indigo-600 rounded-md flex items-center justify-center shrink-0 overflow-hidden">
                    {#if capacity.image && isImageUrl(capacity.image)}
                      <img src={capacity.image} alt={capacity.name || 'Capacité'} class="w-full h-full object-cover" />
                    {:else if capacity.image}
                      <span class="text-2xl leading-none">{capacity.image}</span>
                    {:else}
                      <span class="text-[9px] font-bold text-[#9ca3af]">IMAGE</span>
                    {/if}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5">
                      <div class="text-sm font-bold truncate">{capacity.name || 'Sans nom'}</div>
                      {#if typeBadge}
                        <span
                          class="px-1.5 py-0.5 rounded text-[8px] font-bold shrink-0"
                          style="color: {typeBadge.color}; background: {typeBadge.color}22"
                        >
                          {typeBadge.label}
                        </span>
                      {/if}
                    </div>
                    <div class="text-[10px] font-medium mt-0.5 truncate">
                      <span style="color: {suitColor(capacity.cost?.color)}">
                        {colorLabel(capacity.cost?.color)} {suitSymbol(capacity.cost?.color)}
                      </span>
                      <span class="text-[#9ca3af]"> · {capacity.usage || '—'}</span>
                    </div>
                    <div class="text-[10px] text-[#9ca3af] mt-1 line-clamp-2">{capacity.description || '—'}</div>
                  </div>
                  <div class="text-right shrink-0 flex flex-col items-end gap-1">
                    <div class="text-[8px] font-bold text-[#9ca3af]">COÛT</div>
                    <div class="flex items-baseline gap-0.5">
                      <div class="text-base @2xl:text-lg font-bold">{capacity.cost?.total ?? 0}</div>
                      <span class="text-sm font-bold" style="color: {suitColor(capacity.cost?.color)}">
                        {suitSymbol(capacity.cost?.color)}
                      </span>
                    </div>
                    {#if capacity.value?.main && isDiceFormula(capacity.value.main, view?.stats ?? {})}
                      <button
                        onclick={() => handleDiceRoll(capacity.name || 'Capacité', capacity.value.main)}
                        title="Lancer {capacity.value.main}"
                        class="min-w-16 max-w-28 px-2 h-9 @2xl:h-12 @2xl:text-base bg-slate-500 rounded-lg text-sm font-bold hover:bg-slate-400 transition-colors truncate"
                      >
                        {capacity.value.main}
                      </button>
                    {/if}
                    <button
                      onclick={() => togglePin('pinnedCapacities', pinKey)}
                      title={pinned ? 'Retirer des favoris' : 'Épingler en favori'}
                      class="text-[11px] leading-none shrink-0 transition-opacity {pinned
                        ? ''
                        : 'opacity-25 hover:opacity-70'}"
                    >
                      📌
                    </button>
                  </div>
                </div>
              </div>
            {/each}
          </div>

          <!-- Totem -->
          <div class="bg-[#111827] rounded-lg p-3 mt-5">
            <div class="text-[10px] font-bold text-[#9ca3af] mb-2.5">TOTEM</div>
            <div class="flex gap-3 items-start">
              <div class="w-14 h-14 bg-[#1f2937] rounded-md flex items-center justify-center shrink-0 overflow-hidden">
                {#if view.totem?.image && isImageUrl(view.totem.image)}
                  <img src={view.totem.image} alt="Totem" class="w-full h-full object-cover" />
                {:else if view.totem?.image}
                  <span class="text-2xl leading-none">{view.totem.image}</span>
                {:else}
                  <span class="text-xl text-[#4b5563]">◈</span>
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-xs font-bold">{view.totem?.nom || '—'}</div>
                <div class="text-[10px] text-[#9ca3af] whitespace-pre-wrap mt-1">{view.totem?.description || '—'}</div>
              </div>
            </div>
          </div>

          {#if diceResult}
            {#if diceResult.error}
              <div class="mt-3 bg-red-950 border border-red-800 rounded-lg p-3">
                <div class="text-xs text-red-200">Formule invalide : {diceResult.error}</div>
              </div>
            {:else}
              <div class="mt-3 bg-indigo-600 border border-indigo-400 rounded-lg p-3">
                <div class="text-xs mb-1">Résultat du lancer ({diceResult.timestamp})</div>
                <div class="text-2xl font-bold">{diceResult.total}</div>
                <div class="text-[10px] text-indigo-200 mt-1">
                  {diceResult.formula}: {(diceResult.rolls ?? []).join(', ')}{diceResult.modifier ? ` ${diceResult.modifier > 0 ? '+' : ''}${diceResult.modifier}` : ''}
                </div>
              </div>
            {/if}
          {/if}
        </div>
      {:else if activeTab === 'inventaire'}
        <!-- TAB: INVENTAIRE -->
        <div>
          <h2 class="text-sm font-bold mb-3">ÉQUIPEMENT</h2>

          <div class="grid grid-cols-2 @2xl:grid-cols-3 gap-2.5 mb-5">
            {#each EQUIP_SLOTS as [slot, slotLabel, icon]}
              {@const slotData = view.equipment?.[slot] ?? {}}
              <div class="equip-slot bg-[#111827] rounded-lg p-2.5 cursor-pointer hover:bg-[#374151] transition-colors">
                <div
                  onclick={() => (openSlot = openSlot === slot ? null : slot)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => e.key === 'Enter' && (openSlot = openSlot === slot ? null : slot)}
                >
                  <div class="flex items-center gap-2.5">
                    <span class="text-lg text-[#9ca3af]">{icon}</span>
                    <div class="min-w-0">
                      <div class="text-xs font-bold truncate">{slotData?.nom || slotLabel}</div>
                      <div class="text-[9px] font-semibold text-[#9ca3af]">{equipSummary(slot, slotData)}</div>
                    </div>
                    <div class="ml-auto text-xs font-bold">›</div>
                  </div>
                  {#if openSlot !== slot}
                    <div class="text-[9px] text-[#9ca3af] mt-1.5 line-clamp-2">
                      {stripHtml(slotData?.description) || '—'}
                    </div>
                  {/if}
                </div>
                {#if openSlot === slot}
                  <div class="mt-2 space-y-1.5 border-t border-[#374151] pt-2">
                    {#each Object.entries(slotData) as [field, value]}
                      {#if value !== '' && value != null}
                        <div>
                          <div class="text-[8px] font-bold text-[#9ca3af] capitalize">{field}</div>
                          <div class="text-[10px] whitespace-pre-wrap">{value}</div>
                        </div>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>

          {#if view.inventoryItems?.length}
            {#each inventoryGroups(view.inventoryItems) as [type, items], groupIndex}
              <div
                class="item-row bg-[#111827] rounded-md px-3 py-2.5 flex items-center gap-2.5 border-l-4 {groupIndex > 0 ? 'mt-2.5' : ''}"
                style="border-left-color: {itemTypeColor(type)}"
              >
                <span class="text-[9px] font-bold w-20 uppercase" style="color: {itemTypeColor(type)}">{type}</span>
                <span class="text-[9px] font-medium text-[#9ca3af] truncate">{itemFamilies(items)}</span>
              </div>
              {#each items as item}
                <div class="item-row bg-[#111827] rounded-md px-3 py-2.5 flex items-center gap-2">
                  <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background: {itemTypeColor(type)}"></span>
                  <span class="text-xs font-semibold flex-1 truncate">{item?.name || '—'}</span>
                  <span class="text-xs font-bold w-12 text-center">{itemCenterValue(item)}</span>
                  <span class="text-[9px] text-[#9ca3af] w-24 @2xl:w-52 text-right truncate">{itemNotes(item)}</span>
                </div>
              {/each}
            {/each}
          {:else}
            <div class="text-[10px] text-[#9ca3af]">Aucun objet dans l'inventaire.</div>
          {/if}

          <!-- Weapons -->
          <h2 class="text-xs font-bold mt-5 mb-2.5">ARMES</h2>
          {#each view.weapons || [] as weapon}
            {#if weapon?.nom}
              {@const weaponFields = Object.entries(weapon ?? {}).filter(([field]) => field !== 'nom' && field !== 'equipped')}
              <div class="item-row bg-[#111827] rounded-lg px-3 py-2.5 mb-2.5 border-l-4 border-[#f87171]">
                <div class="flex items-center gap-2.5">
                  {#if weapon?.equipped}
                    <span class="px-2 py-0.5 bg-indigo-600 text-[9px] font-semibold rounded">Équipée</span>
                  {/if}
                  <span class="text-xs font-bold truncate">{weapon?.nom || 'Sans nom'}</span>
                  {#if weapon?.de}
                    <span class="ml-auto text-xs font-bold">
                      {weapon.de}
                      <span class="text-[#9ca3af]">{formatModifier(attackBonus(weapon, view?.stats ?? {}))}</span>
                    </span>
                  {/if}
                </div>
                <div class="text-[9px] text-[#9ca3af] mt-1.5 truncate">
                  {weaponFields
                    .filter(([, value]) => value !== '' && value != null)
                    .map(([field, value]) => `${field}: ${stripHtml(value)}`)
                    .join(' · ') || '—'}
                </div>
              </div>
            {/if}
          {/each}
        </div>
      {:else if activeTab === 'narratif'}
        <!-- TAB: NARRATIF -->
        <div>
          <h2 class="text-sm font-bold mb-3">ASPECTS NARRATIFS</h2>
          <div class="grid grid-cols-1 @2xl:grid-cols-2 gap-2.5">
            {#each NARRATIVE_FIELDS as [field, label]}
              <div class="narrative-card bg-[#111827] rounded-lg p-2.5 border border-transparent hover:border-indigo-500 transition-colors">
                <div class="text-[9px] font-bold text-[#9ca3af] mb-1.5">{label}</div>
                <div class="text-[10px] leading-relaxed {expandedNarrative[field] ? '' : 'line-clamp-4'} whitespace-pre-wrap">
                  {view.narrative?.[field] || '—'}
                </div>
                <div class="text-right mt-1.5">
                  <button
                    onclick={() => (expandedNarrative[field] = !expandedNarrative[field])}
                    class="text-[9px] font-semibold text-[#9ca3af] hover:text-white transition-colors"
                  >
                    {expandedNarrative[field] ? 'Réduire ←' : 'Développer →'}
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else if activeTab === 'maitrises'}
        <!-- TAB: MAÎTRISES -->
        <div>
          <h2 class="text-sm font-bold mb-1">MAÎTRISES & ÉVOLUTION</h2>
          <div class="flex gap-2 mb-4 mt-1.5">
            <span class="px-3 py-1 bg-[#111827] rounded-full text-[10px] font-semibold">
              XP dépensés {view.progression?.xpDepenses ?? 0}
            </span>
            <span class="px-3 py-1 bg-[#111827] rounded-full text-[10px] font-semibold">
              XP disponibles {view.progression?.xpDisponibles ?? 0}
            </span>
          </div>

          {#each MASTERY_BLOCKS as [key, dataKey, label]}
            <div class="bg-[#111827] rounded-lg p-3 mb-2.5">
              <div class="text-[10px] font-bold text-[#9ca3af] mb-2.5">{label}</div>
              <div class="flex gap-2.5 flex-wrap">
                {#each masteryItems(key) as item}
                  <span class="pill px-4 py-1.5 bg-indigo-600 rounded-full text-[10px] font-semibold">{item}</span>
                {/each}
                {#if !masteryItems(key).length}
                  <span class="pill px-4 py-1.5 bg-[#1f2937] rounded-full text-[10px] font-semibold text-[#9ca3af]">Aucun</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {:else if activeTab === 'notes'}
        <!-- TAB: NOTES -->
        <div>
          <h2 class="text-sm font-bold mb-3">NOTES</h2>
          <div class="bg-[#111827] rounded-lg p-3.5 min-h-[240px]">
            <div class="text-lg font-bold mb-2.5">Notes de session</div>
            <div class="text-xs leading-relaxed whitespace-pre-wrap">
              {view.notes || 'Aucune note pour le moment.'}
            </div>
            <div class="text-[9px] font-medium text-[#9ca3af] mt-6 pt-2.5 border-t border-[#374151]">
              Écriture libre — modifiable en mode ÉDITION
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- ═══ BOTTOM NAV ═══ -->
    <div class="shrink-0 bg-[#1f2937] grid grid-cols-3 gap-1.5 p-2 @2xl:flex @2xl:flex-row @2xl:items-center @2xl:h-16 @2xl:px-2 @2xl:py-0">
      {#each TABS as tab}
        <button
          onclick={() => (activeTab = tab.id)}
          class="h-10 @2xl:h-11 px-1 rounded-md text-[9px] font-semibold transition-colors whitespace-nowrap {activeTab === tab.id
            ? 'bg-indigo-600 text-white'
            : 'bg-[#111827] text-[#9ca3af] hover:bg-[#374151]'}"
        >
          {tab.label}
        </button>
      {/each}
    </div>
  {/if}

  <!-- ═══ EDIT POPUP (large modal; opened by ÉDITION) ═══ -->
  {#if isEditing}
    <div class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-2">
      <div class="bg-[#1f2937] border border-[#374151] rounded-xl w-[94%] max-w-3xl max-h-[94%] flex flex-col overflow-hidden">
        <!-- Modal header -->
        <div class="h-10 bg-[#111827] flex items-center px-3 shrink-0 border-b border-[#374151]">
          <span class="text-xs font-bold">ÉDITION</span>
          <span class="text-[10px] text-[#9ca3af] ml-3 truncate">
            {editSheet.identity?.nom || 'Fiche de personnage'}
          </span>
          <span class="text-[9px] text-[#9ca3af] ml-auto">La fiche affiche les valeurs en direct</span>
        </div>

        <!-- Modal tab bar -->
        <div class="flex gap-1 px-2 py-1.5 bg-[#111827] border-b border-[#374151] overflow-x-auto shrink-0">
          {#each TABS as tab}
            <button
              onclick={() => (activeTab = tab.id)}
              class="px-3 py-1.5 rounded-md text-[9px] font-semibold whitespace-nowrap transition-colors {activeTab === tab.id
                ? 'bg-indigo-600 text-white'
                : 'bg-[#1f2937] text-[#9ca3af] hover:bg-[#374151]'}"
            >
              {tab.label}
            </button>
          {/each}
        </div>

        <!-- Modal body -->
        <div class="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3 space-y-4">
          <!-- Identity & core stats -->
          <div>
            <h3 class="text-[10px] font-bold text-[#9ca3af] mb-2">IDENTITÉ</h3>
            <div class="grid grid-cols-2 @2xl:grid-cols-4 gap-2">
              <div>
                <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5">Nom</label>
                <input type="text" bind:value={editSheet.identity.nom} class="w-full text-[11px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5">Race</label>
                <input type="text" bind:value={editSheet.identity.race} class="w-full text-[11px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5">Alignement</label>
                <input type="text" bind:value={editSheet.identity.alignement} class="w-full text-[11px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5">Niveau</label>
                <input type="number" bind:value={editSheet.identity.niveau} class="w-full text-[11px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
              {#each IDENTITY_EXTRAS as [field, label]}
                <div>
                  <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5">{label}</label>
                  <input type="text" bind:value={editSheet.identity[field]} class="w-full text-[11px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
                </div>
              {/each}
              <div>
                <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5">Portrait (URL ou emoji)</label>
                <input type="text" bind:value={editSheet.portrait} class="w-full text-[11px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5">XP dépensés</label>
                <input type="number" bind:value={editSheet.progression.xpDepenses} class="w-full text-[11px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5">XP disponibles</label>
                <input type="number" bind:value={editSheet.progression.xpDisponibles} class="w-full text-[11px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
            </div>
          </div>

          <div>
            <h3 class="text-[10px] font-bold text-[#9ca3af] mb-2">POINTS DE VIE</h3>
            <div class="grid grid-cols-2 @2xl:grid-cols-4 gap-2">
              <div>
                <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5">PV actuels</label>
                <input type="number" bind:value={editSheet.derived.pvActuels} class="w-full text-[11px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5">PV max</label>
                <input type="number" bind:value={editSheet.derived.pvMax} class="w-full text-[11px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5">PV temporaires</label>
                <input type="number" bind:value={editSheet.derived.pvTemporaires} class="w-full text-[11px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5">Fatigue</label>
                <input type="number" bind:value={editSheet.derived.fatigue} class="w-full text-[11px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
            </div>
          </div>

          <div>
            <h3 class="text-[10px] font-bold text-[#9ca3af] mb-2">CARACTÉRISTIQUES</h3>
            <div class="grid grid-cols-4 gap-2">
              {#each ['force', 'agilite', 'esprit', 'social'] as stat}
                <div>
                  <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5">{stat.toUpperCase()}</label>
                  <input
                    type="number"
                    bind:value={editSheet.stats[stat]}
                    class="w-full text-[11px] font-bold bg-[#242424] border border-[#374151] rounded px-1.5 py-1 text-center focus:outline-none focus:border-indigo-500"
                    style="color: {STAT_COLORS[stat]}"
                  />
                </div>
              {/each}
            </div>
          </div>

          <div>
            <h3 class="text-[10px] font-bold text-[#9ca3af] mb-2">DÉFENSE &amp; JETS (calculés)</h3>
            <div class="grid grid-cols-2 @2xl:grid-cols-4 gap-2">
              <div class="bg-[#111827] rounded-md px-2 py-1.5">
                <div class="text-[8px] font-bold text-[#9ca3af]">PARADE</div>
                <div class="text-sm font-bold">{editCalc.parade} <span class="text-[9px] font-medium text-[#9ca3af]">= {editCalc.deflexion}+{editCalc.garde}+{editCalc.paradeBonus}</span></div>
              </div>
              <div class="bg-[#111827] rounded-md px-2 py-1.5">
                <div class="text-[8px] font-bold text-[#9ca3af]">INITIATIVE</div>
                <div class="text-sm font-bold">{editCalc.initiative} <span class="text-[9px] font-medium text-[#9ca3af]">= Agi − 10 + gants</span></div>
              </div>
              <div class="bg-[#111827] rounded-md px-2 py-1.5">
                <div class="text-[8px] font-bold text-[#9ca3af]">MOUVEMENT</div>
                <div class="text-sm font-bold">{editCalc.mouvement} <span class="text-[9px] font-medium text-[#9ca3af]">= 8 + Agi/2 + bottes</span></div>
              </div>
              <div class="bg-[#111827] rounded-md px-2 py-1.5">
                <div class="text-[8px] font-bold text-[#9ca3af]">SEUIL MISS</div>
                <div class="text-sm font-bold">{editCalc.seuilMiss} <span class="text-[9px] font-medium text-[#9ca3af]">= max(1, 1 − mod Agi)</span></div>
              </div>
              <div class="bg-[#111827] rounded-md px-2 py-1.5">
                <div class="text-[8px] font-bold text-[#9ca3af]">BONUS ATTAQUE</div>
                <div class="text-sm font-bold">{formatModifier(editCalc.bonusAttaque)} <span class="text-[9px] font-medium text-[#9ca3af]">= stat + tier de l'arme</span></div>
              </div>
              <div class="bg-[#111827] rounded-md px-2 py-1.5">
                <div class="text-[8px] font-bold text-[#9ca3af]">CANALISATION</div>
                <div class="text-sm font-bold">{formatModifier(editCalc.canalisation)} <span class="text-[9px] font-medium text-[#9ca3af]">= mod Esprit</span></div>
              </div>
              <div class="bg-[#111827] rounded-md px-2 py-1.5">
                <div class="text-[8px] font-bold text-[#9ca3af]">VOLONTÉ</div>
                <div class="text-sm font-bold">{editCalc.volonte} <span class="text-[9px] font-medium text-[#9ca3af]">= mod Résilience + casque</span></div>
              </div>
            </div>
          </div>

          <!-- Active tab edit form -->
          <div class="border-t border-[#374151] pt-3">
            <h3 class="text-[10px] font-bold text-[#9ca3af] mb-2">
              {TABS.find((t) => t.id === activeTab)?.label}
            </h3>

            {#if activeTab === 'competences'}
              <div class="grid grid-cols-1 @2xl:grid-cols-2 gap-x-5 gap-y-3">
                {#each SKILL_GROUPS as group}
                  <div>
                    <div class="text-[10px] font-bold mb-1.5" style="color: {STAT_COLORS[group.stat]}">{group.label}</div>
                    <div class="space-y-1">
                      {#each group.skills as skillKey}
                        <div class="flex items-center gap-2 bg-[#111827] rounded-md px-2.5 py-1.5">
                          <input type="checkbox" bind:checked={editSheet.skills[skillKey].trained} class="w-3.5 h-3.5 accent-indigo-600" title="Maîtrisée" />
                          <span class="text-[11px] font-medium truncate flex-1">{SKILL_LABELS[skillKey]}</span>
                          <input
                            type="number"
                            bind:value={editSheet.skills[skillKey].bonus}
                            title="Bonus manuel"
                            class="w-14 text-[11px] font-bold bg-[#242424] border border-[#374151] rounded px-1 py-0.5 text-center focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            {:else if activeTab === 'capacites'}
              <div class="flex justify-end mb-2">
                <button
                  onclick={() => {
                    editSheet.capacities = [...(editSheet.capacities || []), {
                      name: '',
                      prepared: false,
                      image: '',
                      description: '',
                      value: { main: '', bonus: '' },
                      cost: { color: '', base: 0, incantationReduction: 0, colorReduction: 0, awakeningReduction: 0, weaponMasteryReduction: 0, total: 0 },
                      incantation: '',
                      save: '',
                      usage: ''
                    }];
                  }}
                  class="px-3 py-1 bg-indigo-600 rounded-full text-[10px] font-semibold hover:bg-indigo-500 transition-colors"
                >
                  + Ajouter une capacité
                </button>
              </div>
              <div class="space-y-2.5">
                {#each editSheet.capacities || [] as capacity, i}
                  <div class="bg-[#111827] rounded-lg p-2.5 space-y-2">
                    <div class="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Nom de la capacité"
                        bind:value={editSheet.capacities[i].name}
                        class="flex-1 min-w-0 px-3 py-2 bg-[#242424] border border-[#374151] rounded text-xs font-bold focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        onclick={() => {
                          editSheet.capacities.splice(i, 1);
                          editSheet.capacities = [...editSheet.capacities];
                        }}
                        class="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-red-200 text-[10px] font-semibold rounded transition-colors shrink-0"
                      >
                        Supprimer
                      </button>
                    </div>
                    <textarea
                      placeholder="Description"
                      bind:value={editSheet.capacities[i].description}
                      class="w-full px-3 py-2 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500"
                      rows="2"
                    ></textarea>
                    <div class="grid grid-cols-2 @2xl:grid-cols-4 gap-2">
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ca3af] mb-1">IMAGE (URL ou emoji)</label>
                        <input type="text" bind:value={editSheet.capacities[i].image} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500" />
                      </div>
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ca3af] mb-1">COÛT TOTAL</label>
                        <input type="number" bind:value={editSheet.capacities[i].cost.total} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500" />
                      </div>
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ca3af] mb-1">COULEUR</label>
                        <input type="text" bind:value={editSheet.capacities[i].cost.color} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500" />
                      </div>
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ca3af] mb-1">USAGE (Action / Bonus action / Réaction)</label>
                        <input type="text" bind:value={editSheet.capacities[i].usage} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500" />
                      </div>
                    </div>
                    <div class="grid grid-cols-2 @2xl:grid-cols-3 gap-2">
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ca3af] mb-1">DÉS (formule)</label>
                        <input type="text" bind:value={editSheet.capacities[i].value.main} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500" />
                      </div>
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ca3af] mb-1">INCANTATION</label>
                        <input type="text" bind:value={editSheet.capacities[i].incantation} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500" />
                      </div>
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ca3af] mb-1">SAUVEGARDE</label>
                        <input type="text" bind:value={editSheet.capacities[i].save} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500" />
                      </div>
                    </div>
                    <label class="flex items-center gap-2 text-[10px] text-[#9ca3af]">
                      <input type="checkbox" bind:checked={editSheet.capacities[i].prepared} class="w-3.5 h-3.5 accent-indigo-600" />
                      Préparée
                    </label>
                  </div>
                {/each}
              </div>

              <div class="bg-[#111827] rounded-lg p-3 mt-3">
                <div class="text-[10px] font-bold text-[#9ca3af] mb-2">TOTEM</div>
                <div class="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label class="block text-[8px] font-bold text-[#9ca3af] mb-1">Nom</label>
                    <input type="text" bind:value={editSheet.totem.nom} class="w-full px-3 py-1.5 bg-[#242424] border border-[#374151] rounded text-xs focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label class="block text-[8px] font-bold text-[#9ca3af] mb-1">Image (URL ou emoji)</label>
                    <input type="text" bind:value={editSheet.totem.image} class="w-full px-3 py-1.5 bg-[#242424] border border-[#374151] rounded text-xs focus:outline-none focus:border-indigo-500" />
                  </div>
                </div>
                <label class="block text-[8px] font-bold text-[#9ca3af] mb-1">Description</label>
                <textarea bind:value={editSheet.totem.description} class="w-full px-3 py-2 bg-[#242424] border border-[#374151] rounded text-xs focus:outline-none focus:border-indigo-500" rows="3"></textarea>
              </div>
            {:else if activeTab === 'inventaire'}
              <div class="space-y-3">
                <div>
                  <h4 class="text-[10px] font-bold text-[#9ca3af] mb-1.5">ÉQUIPEMENT</h4>
                  <div class="grid grid-cols-1 @2xl:grid-cols-2 gap-2">
                    {#each EQUIP_SLOTS as [slot, slotLabel, icon]}
                      <div class="bg-[#111827] rounded-lg p-2.5">
                        <div class="text-[10px] font-bold mb-1.5">{icon} {slotLabel}</div>
                        <div class="grid grid-cols-2 gap-1.5">
                          {#each Object.keys(editSheet.equipment?.[slot] ?? {}) as field}
                            <div>
                              <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5 capitalize">{field}</label>
                              {#if field === 'description' || field === 'enchantement'}
                                <textarea bind:value={editSheet.equipment[slot][field]} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500" rows="2"></textarea>
                              {:else}
                                <input type="text" bind:value={editSheet.equipment[slot][field]} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500" />
                              {/if}
                            </div>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>

                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <h4 class="text-[10px] font-bold text-[#9ca3af]">INVENTAIRE</h4>
                    <div class="flex items-center gap-1.5">
                      <select
                        bind:value={itemTemplate}
                        title="Choisir un modèle d'équipement"
                        class="px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500 max-w-[170px]"
                      >
                        <option value="">— Modèle —</option>
                        {#each EQUIPMENT_CATALOG as grp}
                          <optgroup label={grp.group}>
                            {#each grp.items as item}
                              <option value={item.nom} title={item.proprietes}>{item.nom}{item.de ? ` — ${item.de}` : ''}</option>
                            {/each}
                          </optgroup>
                        {/each}
                      </select>
                      <button
                        onclick={() => {
                          const tpl = findEquipmentTemplate(itemTemplate);
                          editSheet.inventoryItems = [...(editSheet.inventoryItems || []), {
                            type: tpl ? (tpl.kind === 'armure' ? 'Armure' : 'Arme') : 'Divers',
                            name: tpl?.nom ?? '',
                            degats: tpl?.de ? `${tpl.de}${tpl.degats ? ` ${tpl.degats}` : ''}` : '',
                            family: tpl?.group ?? '',
                            attributs: tpl?.proprietes ?? '',
                            description: ''
                          }];
                          itemTemplate = '';
                        }}
                        class="px-3 py-1 bg-indigo-600 rounded-full text-[10px] font-semibold hover:bg-indigo-500 transition-colors whitespace-nowrap"
                      >
                        + Ajouter un objet
                      </button>
                    </div>
                  </div>
                  {#each editSheet.inventoryItems || [] as item, i}
                    <div
                      class="item-editor bg-[#111827] rounded-lg mb-3 border-l-4 overflow-hidden"
                      style="border-left-color: {itemTypeColor(item?.type)}"
                    >
                      <!-- header: type badge + name + delete -->
                      <div class="flex items-center gap-2 px-3 pt-3 pb-2">
                        <select
                          value={item?.type || 'Divers'}
                          onchange={(e) => (item.type = e.currentTarget.value)}
                          class="px-2 py-1.5 rounded-md text-[10px] font-bold border bg-[#242424] focus:outline-none shrink-0"
                          style="color: {itemTypeColor(item?.type)}; border-color: {itemTypeColor(item?.type)}"
                        >
                          {#each ITEM_TYPE_OPTIONS as opt}
                            <option value={opt}>{opt}</option>
                          {/each}
                        </select>
                        <input
                          type="text"
                          placeholder="Nom de l'objet"
                          bind:value={item.name}
                          class="flex-1 min-w-0 px-2.5 py-1.5 bg-[#242424] border border-[#374151] rounded-md text-xs font-bold focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          onclick={() => {
                            const list = editSheet.inventoryItems;
                            list.splice(list.indexOf(item), 1);
                            editSheet.inventoryItems = [...list];
                          }}
                          class="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-red-200 text-[10px] font-semibold rounded-md transition-colors shrink-0"
                        >
                          Supprimer
                        </button>
                      </div>
                      <!-- fields -->
                      <div class="grid grid-cols-1 @2xl:grid-cols-2 gap-2.5 px-3 pb-3">
                        {#each Object.entries(item ?? {}).filter(([field]) => field !== 'equipmentData' && field !== 'type' && field !== 'name') as [field, value]}
                          <div class={field === 'description' || field === 'attributs' ? 'col-span-full' : ''}>
                            <label class="block text-[9px] font-bold text-[#9ca3af] mb-1 capitalize">{field}</label>
                            {#if field === 'description' || field === 'attributs'}
                              <textarea bind:value={item[field]} class="w-full px-2.5 py-1.5 bg-[#242424] border border-[#374151] rounded-md text-[10px] focus:outline-none focus:border-indigo-500" rows="2"></textarea>
                            {:else}
                              <input type="text" bind:value={item[field]} class="w-full px-2.5 py-1.5 bg-[#242424] border border-[#374151] rounded-md text-[10px] focus:outline-none focus:border-indigo-500" />
                            {/if}
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/each}
                  {#if !(editSheet.inventoryItems || []).length}
                    <div class="text-[10px] text-[#9ca3af] bg-[#111827] rounded-lg px-3 py-3 text-center">
                      Aucun objet — choisissez un modèle (ou « — Modèle — » pour un objet vide) puis cliquez « + Ajouter un objet ».
                    </div>
                  {/if}
                </div>

                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <h4 class="text-[10px] font-bold text-[#9ca3af]">ARMES</h4>
                    <div class="flex items-center gap-1.5">
                      <select
                        bind:value={weaponTemplate}
                        title="Choisir un modèle d'arme"
                        class="px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500 max-w-[170px]"
                      >
                        <option value="">— Modèle —</option>
                        {#each EQUIPMENT_CATALOG as grp}
                          <optgroup label={grp.group}>
                            {#each grp.items as item}
                              <option value={item.nom} title={item.proprietes}>{item.nom}{item.de ? ` — ${item.de}` : ''}</option>
                            {/each}
                          </optgroup>
                        {/each}
                      </select>
                      <button
                        onclick={() => {
                          const tpl = findEquipmentTemplate(weaponTemplate);
                          editSheet.weapons = [...(editSheet.weapons || []), {
                            nom: tpl?.nom ?? '',
                            de: tpl?.de ?? '',
                            degats: tpl?.degats ?? '',
                            propriétés: tpl?.proprietes ?? '',
                            forceAgi: '', critique: '', avantage: '',
                            bonus: '', perfection: '', notes: '', equipped: false
                          }];
                          weaponTemplate = '';
                        }}
                        class="px-3 py-1 bg-indigo-600 rounded-full text-[10px] font-semibold hover:bg-indigo-500 transition-colors whitespace-nowrap"
                      >
                        + Ajouter une arme
                      </button>
                    </div>
                  </div>
                  {#each editSheet.weapons || [] as weapon, i}
                    <div class="item-editor bg-[#111827] rounded-lg mb-3 border-l-4 border-[#f87171] overflow-hidden">
                      <!-- header: equipped + name + delete -->
                      <div class="flex items-center gap-2 px-3 pt-3 pb-2">
                        <label
                          class="flex items-center gap-1.5 text-[10px] font-bold shrink-0 cursor-pointer select-none"
                          style="color: {weapon?.equipped ? '#a5b4fc' : '#9ca3af'}"
                        >
                          <input type="checkbox" bind:checked={editSheet.weapons[i].equipped} class="w-3.5 h-3.5 accent-indigo-600" />
                          Équipée
                        </label>
                        <input
                          type="text"
                          placeholder="Nom de l'arme"
                          bind:value={editSheet.weapons[i].nom}
                          class="flex-1 min-w-0 px-2.5 py-1.5 bg-[#242424] border border-[#374151] rounded-md text-xs font-bold focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          onclick={() => {
                            editSheet.weapons.splice(i, 1);
                            editSheet.weapons = [...editSheet.weapons];
                          }}
                          class="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-red-200 text-[10px] font-semibold rounded-md transition-colors shrink-0"
                        >
                          Supprimer
                        </button>
                      </div>
                      <!-- fields -->
                      <div class="grid grid-cols-2 @2xl:grid-cols-4 gap-2.5 px-3 pb-3">
                        {#each Object.entries(weapon ?? {}).filter(([field]) => field !== 'nom' && field !== 'equipped') as [field]}
                          <div class={field === 'notes' || field === 'propriétés' ? 'col-span-full' : ''}>
                            <label class="block text-[9px] font-bold text-[#9ca3af] mb-1 capitalize">{field}</label>
                            {#if field === 'notes'}
                              <textarea bind:value={editSheet.weapons[i][field]} class="w-full px-2.5 py-1.5 bg-[#242424] border border-[#374151] rounded-md text-[10px] focus:outline-none focus:border-indigo-500" rows="2"></textarea>
                            {:else}
                              <input type="text" bind:value={editSheet.weapons[i][field]} class="w-full px-2.5 py-1.5 bg-[#242424] border border-[#374151] rounded-md text-[10px] focus:outline-none focus:border-indigo-500" />
                            {/if}
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/each}
                  {#if !(editSheet.weapons || []).length}
                    <div class="text-[10px] text-[#9ca3af] bg-[#111827] rounded-lg px-3 py-3 text-center">
                      Aucune arme — choisissez un modèle (ou « — Modèle — » pour une arme vide) puis cliquez « + Ajouter une arme ».
                    </div>
                  {/if}
                </div>
              </div>
            {:else if activeTab === 'narratif'}
              <div class="grid grid-cols-1 @2xl:grid-cols-2 gap-2.5">
                {#each NARRATIVE_FIELDS as [field, label]}
                  <div class="bg-[#111827] rounded-lg p-2.5">
                    <div class="text-[9px] font-bold text-[#9ca3af] mb-1.5">{label}</div>
                    <textarea bind:value={editSheet.narrative[field]} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500" rows="4"></textarea>
                  </div>
                {/each}
              </div>
            {:else if activeTab === 'maitrises'}
              {#each MASTERY_BLOCKS as [key, dataKey, label]}
                <div class="bg-[#111827] rounded-lg p-3 mb-2.5">
                  <div class="text-[10px] font-bold text-[#9ca3af] mb-2">{label}</div>
                  <textarea bind:value={masteryText[key]} placeholder="Un élément par ligne" class="w-full px-3 py-2 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500" rows="3"></textarea>
                </div>
              {/each}
            {:else if activeTab === 'notes'}
              <div class="bg-[#111827] rounded-md px-2 py-2 flex gap-2 mb-2.5 flex-wrap">
                <button onclick={() => wrapNotesSelection('**', '**')} title="Gras" class="px-4 py-1 bg-indigo-600 rounded-full text-[10px] font-semibold hover:bg-indigo-500 transition-colors">B</button>
                <button onclick={() => wrapNotesSelection('__', '__')} title="Souligné" class="px-4 py-1 bg-indigo-600 rounded-full text-[10px] font-semibold hover:bg-indigo-500 transition-colors">U</button>
                <button title="Taille du texte — non implémenté" class="px-4 py-1 bg-[#1f2937] rounded-full text-[10px] font-semibold text-[#9ca3af] cursor-default">T-</button>
                <button title="Taille du texte — non implémenté" class="px-4 py-1 bg-[#1f2937] rounded-full text-[10px] font-semibold text-[#9ca3af] cursor-default">T+</button>
                <button onclick={() => prefixNotesLines('• ')} title="Liste à puces" class="px-3 py-1 bg-[#1f2937] rounded-full text-[10px] font-semibold hover:bg-[#374151] transition-colors">• Liste</button>
                <button onclick={() => prefixNotesLines('☐ ')} title="Case à cocher" class="px-3 py-1 bg-[#1f2937] rounded-full text-[10px] font-semibold hover:bg-[#374151] transition-colors">☐</button>
                <button onclick={() => insertNotesText('— ')} title="Insérer un tiret" class="px-3 py-1 bg-[#1f2937] rounded-full text-[10px] font-semibold hover:bg-[#374151] transition-colors">—</button>
              </div>
              <div class="bg-[#111827] rounded-lg p-3">
                <div class="text-sm font-bold mb-2">Notes de session</div>
                <textarea
                  bind:this={notesArea}
                  bind:value={editSheet.notes}
                  class="w-full min-h-[240px] px-3 py-2 bg-[#242424] border border-[#374151] rounded text-xs leading-relaxed focus:outline-none focus:border-indigo-500"
                  placeholder="Écriture libre — notes de session"
                ></textarea>
              </div>
            {/if}
          </div>
        </div>

        <!-- Modal footer -->
        <div class="h-12 bg-[#111827] border-t border-[#374151] flex items-center gap-2 px-3 shrink-0">
          <span class="text-[9px] text-[#9ca3af] truncate">Les changements s'affichent en direct sur la fiche — sauvegarde manuelle.</span>
          <button
            onclick={cancelEdit}
            disabled={isSaving}
            class="ml-auto px-4 py-1.5 bg-[#242424] hover:bg-[#374151] text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            Annuler
          </button>
          <button
            onclick={saveEdit}
            disabled={isSaving}
            class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Unsaved Changes Modal -->
  {#if showUnsavedModal}
    <div class="fixed inset-0 bg-black/75 flex items-center justify-center z-[60]">
      <div class="bg-[#1f2937] border border-[#374151] rounded-lg p-6 w-[92%] max-w-md">
        <h3 class="text-lg font-bold mb-4">Modifications non sauvegardées</h3>
        <p class="text-[#9ca3af] text-sm mb-6">
          Vous avez des modifications non sauvegardées. Voulez-vous sauvegarder avant de continuer ?
        </p>
        <div class="flex gap-3">
          <button
            onclick={discardAndContinue}
            class="flex-1 px-4 py-2 bg-[#111827] hover:bg-[#374151] text-xs font-semibold rounded-lg transition-colors"
          >
            Ignorer
          </button>
          <button
            onclick={confirmSaveAndContinue}
            class="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold rounded-lg transition-colors"
          >
            Sauvegarder
          </button>
          <button
            onclick={() => {
              showUnsavedModal = false;
              pendingAction = null;
            }}
            class="px-4 py-2 bg-red-900 hover:bg-red-800 text-red-200 text-xs font-semibold rounded-lg transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Delete Confirmation Modal -->
  {#if showDeleteConfirm}
    <div class="fixed inset-0 bg-black/75 flex items-center justify-center z-[60]">
      <div class="bg-[#1f2937] border border-[#374151] rounded-lg p-6 w-[92%] max-w-md">
        <h3 class="text-lg font-bold mb-4">Confirmer la suppression</h3>
        <p class="text-[#9ca3af] text-sm mb-6">
          Êtes-vous sûr de vouloir supprimer cette fiche de personnage ? Cette action est irréversible.
        </p>
        <div class="flex gap-3">
          <button
            onclick={() => (showDeleteConfirm = false)}
            class="flex-1 px-4 py-2 bg-[#111827] hover:bg-[#374151] text-xs font-semibold rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            onclick={handleDelete}
            class="flex-1 px-4 py-2 bg-red-900 hover:bg-red-800 text-red-200 text-xs font-semibold rounded-lg transition-colors"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
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

  /* ── Inventory / weapons editor cards ── */
  .item-editor {
    transition: background-color 0.15s ease, box-shadow 0.15s ease;
  }
  .item-editor:hover {
    background: #16202f;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
  }

  /* ── Read-only inventory rows & weapon cards ── */
  .item-row {
    transition: background-color 0.15s ease;
  }
  .item-row:hover {
    background: #1f2937;
  }
</style>
