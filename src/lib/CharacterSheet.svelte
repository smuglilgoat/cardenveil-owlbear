<script>
  import { onMount, tick } from 'svelte';
  import OBR from '@owlbear-rodeo/sdk';
  import {
    fetchCharacterSheet,
    saveCharacterSheet,
    deleteCharacterSheet,
    importCharacterSheet,
    createEmptyCharacterSheet,
    equipmentStats,
    isDiceFormula,
    paradeTotal,
    rollDice,
    skillModifier,
    subscribeToCharacterSheet,
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

  // Tailwind-app-native stat colors (red/green/violet/blue 400)
  const STAT_COLORS = {
    force: '#f87171',
    agilite: '#4ade80',
    esprit: '#a78bfa',
    social: '#60a5fa'
  };

  const SKILL_GROUPS = [
    { stat: 'force', label: 'FORCE', skills: ['athletisme', 'resilience'] },
    { stat: 'agilite', label: 'AGILITÉ', skills: ['acrobaties', 'discretion', 'escamotage'] },
    {
      stat: 'esprit',
      label: 'ESPRIT',
      skills: ['arcanes', 'investigation', 'perception', 'culture', 'survie']
    },
    {
      stat: 'social',
      label: 'SOCIAL',
      skills: [
        'persuasion',
        'tromperie',
        'intimidation',
        'representation',
        'perspicacite',
        'dressage'
      ]
    }
  ];

  const SKILL_LABELS = {
    athletisme: 'Athlétisme',
    resilience: 'Résilience',
    acrobaties: 'Acrobaties',
    discretion: 'Discrétion',
    escamotage: 'Escamotage',
    arcanes: 'Arcanes',
    investigation: 'Investigation',
    perception: 'Perception',
    culture: 'Culture',
    survie: 'Survie',
    persuasion: 'Persuasion',
    tromperie: 'Tromperie',
    intimidation: 'Intimidation',
    representation: 'Représentation',
    perspicacite: 'Perspicacité',
    dressage: 'Dressage'
  };

  const SUIT_LABELS = { heart: 'Cœur', spade: 'Pique', diamond: 'Carreau', club: 'Trèfle' };
  const SUIT_SYMBOLS = { heart: '♥', spade: '♠', diamond: '♦', club: '♣' };
  const SUIT_COLORS = { heart: '#f87171', spade: '#e5e7eb', diamond: '#fbbf24', club: '#4ade80' };

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

  // Live view: the edit buffer while editing, the saved sheet otherwise.
  let view = $derived(isEditing && editSheet ? editSheet : sheet);
  let eqStats = $derived(equipmentStats(view?.equipment, view?.weapons));
  let defenseBonus = $derived(view?.defense?.bonus ?? 0);

  const DICE_POPOVER_ID = 'cardenveil-dice';
  let dicePopoverTimer;

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

      return unsubscribe;
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
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        importError = '';
        const text = await file.text();
        const imported = await importCharacterSheet(playerId, roomId, text);
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

  function updateField(path, value) {
    const keys = path.split('.');
    let obj = editSheet;
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
  }

  function getStatModifier(stat) {
    const value = view?.stats?.[stat] || 10;
    return Math.floor((value - 10) / 2);
  }

  function formatModifier(value) {
    return value >= 0 ? `+${value}` : `${value}`;
  }

  function colorLabel(color) {
    return SUIT_LABELS[(color || '').toLowerCase()] || color || '—';
  }

  function suitSymbol(color) {
    return SUIT_SYMBOLS[(color || '').toLowerCase()] || '·';
  }

  function suitColor(color) {
    return SUIT_COLORS[(color || '').toLowerCase()] || '#9ca3af';
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
    if (isEditing) {
      const list = editSheet[listKey] ?? [];
      editSheet[listKey] = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
    } else {
      const list = sheet?.[listKey] ?? [];
      const pinned = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
      const next = { ...sheet, [listKey]: pinned };
      sheet = next;
      saveCharacterSheet(playerId, roomId, next).catch(console.error);
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
  class="@container w-full h-full bg-[#242424] text-white rounded-2xl border border-[#374151] overflow-hidden flex flex-col relative"
>
  {#if isLoading}
    <div class="flex-1 flex items-center justify-center text-[#9ca3af] text-sm">
      Chargement de la fiche de personnage...
    </div>
  {:else}
    <!-- ═══ TOP BAR ═══ -->
    <div class="h-9 bg-[#1f2937] flex items-center px-3 shrink-0">
      <span class="text-sm font-bold tracking-wide">CARDENVEIL</span>
      <span class="text-xs font-medium text-[#9ca3af] ml-6 truncate hidden @2xl:block">
        {view.identity?.nom || '—'} · {view.identity?.race || '—'} · Niveau {view.identity?.niveau ?? 1}
      </span>
      <div class="ml-auto flex items-center gap-1 shrink-0">
        {#if isEditing}
          <button
            onclick={cancelEdit}
            disabled={isSaving}
            title="Annuler les modifications"
            class="min-w-7 h-7 px-2 bg-[#111827] rounded-full text-[11px] font-semibold text-[#9ca3af] hover:text-white transition-colors disabled:opacity-50"
          >
            <span class="hidden @2xl:inline">ANNULER</span><span class="@2xl:hidden">✕</span>
          </button>
          <button
            onclick={saveEdit}
            disabled={isSaving}
            title="Sauvegarder"
            class="min-w-7 h-7 px-2 bg-indigo-600 rounded-full text-[11px] font-semibold hover:bg-indigo-500 transition-colors disabled:opacity-50"
          >
            <span class="hidden @2xl:inline">{isSaving ? 'SAUVEGARDE...' : 'SAUVEGARDER'}</span><span class="@2xl:hidden">{isSaving ? '…' : '✓'}</span>
          </button>
        {:else}
          <button
            onclick={handleImport}
            title="Importer une fiche JSON"
            class="min-w-7 h-7 px-2 bg-[#111827] rounded-full text-[11px] font-semibold text-[#9ca3af] hover:text-white transition-colors"
          >
            <span class="hidden @2xl:inline">IMPORTER</span><span class="@2xl:hidden">⇩</span>
          </button>
          <button
            onclick={() => (showDeleteConfirm = true)}
            title="Supprimer la fiche"
            class="min-w-7 h-7 px-2 bg-[#111827] rounded-full text-[11px] font-semibold text-[#9ca3af] hover:text-red-400 transition-colors"
          >
            <span class="hidden @2xl:inline">SUPPRIMER</span><span class="@2xl:hidden">🗑</span>
          </button>
        {/if}
        <button
          onclick={() => (isEditing ? cancelEdit() : startEdit())}
          class="h-7 px-2.5 bg-[#111827] rounded-full text-[10px] font-semibold text-[#9ca3af] hover:text-white transition-colors"
        >
          ÉDITION {isEditing ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>

    {#if importError}
      <div class="bg-red-950 border-b border-red-800 px-3 py-2 text-red-200 text-xs">
        Erreur d'import : {importError}
      </div>
    {/if}

    <!-- ═══ CHARACTER HEADER (compact) ═══ -->
    <div class="px-3 pt-2.5 pb-2 shrink-0">
      <div class="flex items-center gap-3">
        <!-- Portrait -->
        <div class="w-12 h-14 bg-[#111827] rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
          {#if view.portrait}
            <img src={view.portrait} alt="Portrait" class="w-full h-full object-cover" />
          {:else}
            <span class="text-[7px] font-bold text-[#9ca3af]">PORTRAIT</span>
          {/if}
        </div>

        <!-- Identity -->
        <div class="flex-1 min-w-0">
          {#if isEditing}
            <input
              type="text"
              bind:value={editSheet.identity.nom}
              placeholder="Nom"
              class="w-full text-lg font-bold bg-transparent border-b border-[#374151] focus:outline-none focus:border-indigo-500"
            />
            <div class="flex gap-2 mt-1">
              <input
                type="text"
                bind:value={editSheet.identity.race}
                placeholder="Race"
                class="flex-1 min-w-0 text-[10px] font-medium text-[#9ca3af] bg-transparent border-b border-[#374151] focus:outline-none focus:border-indigo-500"
              />
              <input
                type="text"
                bind:value={editSheet.identity.alignement}
                placeholder="Alignement"
                class="flex-1 min-w-0 text-[10px] font-medium text-[#9ca3af] bg-transparent border-b border-[#374151] focus:outline-none focus:border-indigo-500"
              />
            </div>
          {:else}
            <h1 class="text-lg font-bold leading-tight truncate">{view.identity?.nom || 'Sans nom'}</h1>
            <p class="text-[10px] font-medium text-[#9ca3af] truncate">
              {view.identity?.race || '—'} · {view.identity?.alignement || '—'}
            </p>
          {/if}
          <div class="flex gap-1 mt-1 flex-wrap">
            <span class="px-2 py-0.5 bg-[#111827] rounded-full text-[9px] font-semibold">
              XP {view.progression?.xpDepenses ?? 0}/{view.progression?.xpDisponibles ?? 0}
            </span>
            <span class="px-2 py-0.5 bg-[#111827] rounded-full text-[9px] font-semibold">
              Niv. {view.identity?.niveau ?? 1}
            </span>
          </div>
        </div>

        <!-- PV compact -->
        <div class="text-right shrink-0">
          <div class="text-[8px] font-bold text-[#9ca3af]">PV</div>
          {#if isEditing}
            <div class="flex items-baseline gap-1 justify-end mt-0.5">
              <input
                type="number"
                bind:value={editSheet.derived.pvActuels}
                class="w-12 text-lg font-bold bg-[#111827] border border-[#374151] rounded px-1 focus:outline-none focus:border-indigo-500"
              />
              <span class="text-[10px] font-semibold text-[#9ca3af]">/</span>
              <input
                type="number"
                bind:value={editSheet.derived.pvMax}
                class="w-10 text-[10px] font-bold bg-[#111827] border border-[#374151] rounded px-1 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div class="flex items-center gap-1 justify-end mt-1 text-[8px] text-[#9ca3af]">
              <span>TEMP</span>
              <input
                type="number"
                bind:value={editSheet.derived.pvTemporaires}
                class="w-9 text-[8px] bg-[#111827] border border-[#374151] rounded px-0.5 focus:outline-none focus:border-indigo-500"
              />
              <span>FAT</span>
              <input
                type="number"
                bind:value={editSheet.derived.fatigue}
                class="w-9 text-[8px] bg-[#111827] border border-[#374151] rounded px-0.5 focus:outline-none focus:border-indigo-500"
              />
            </div>
          {:else}
            <div class="flex items-baseline gap-0.5 justify-end mt-0.5">
              <span class="text-xl font-bold leading-none">{toNumber(view.derived?.pvActuels)}</span>
              <span class="text-[10px] font-semibold text-[#9ca3af]">/ {toNumber(view.derived?.pvMax)}</span>
            </div>
            <div class="text-[8px] text-[#9ca3af] mt-1">
              TEMP {view.derived?.pvTemporaires || '—'} · FAT
              {#if toNumber(view.derived?.fatigue) > 0}
                {'●'.repeat(Math.min(10, toNumber(view.derived.fatigue)))}
              {:else}—{/if}
            </div>
          {/if}
        </div>
      </div>

      <!-- Identity extras (edit mode only) -->
      {#if isEditing}
        <div class="grid grid-cols-2 @2xl:grid-cols-4 gap-2 mt-2">
          {#each IDENTITY_EXTRAS as [field, label]}
            <div>
              <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5">{label}</label>
              <input
                type="text"
                bind:value={editSheet.identity[field]}
                class="w-full text-[10px] bg-[#111827] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500"
              />
            </div>
          {/each}
          <div>
            <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5">Portrait (URL)</label>
            <input
              type="text"
              bind:value={editSheet.portrait}
              class="w-full text-[10px] bg-[#111827] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5">XP dépensés</label>
            <input
              type="number"
              bind:value={editSheet.progression.xpDepenses}
              class="w-full text-[10px] bg-[#111827] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5">XP disponibles</label>
            <input
              type="number"
              bind:value={editSheet.progression.xpDisponibles}
              class="w-full text-[10px] bg-[#111827] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5">Niveau</label>
            <input
              type="number"
              bind:value={editSheet.identity.niveau}
              class="w-full text-[10px] bg-[#111827] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      {/if}

      <!-- ═══ STATS ROW ═══ -->
      <div class="grid grid-cols-4 gap-1.5 mt-2">
        {#each ['force', 'agilite', 'esprit', 'social'] as stat}
          <div class="bg-[#111827] rounded-md p-1.5">
            <div class="text-[7px] font-bold text-[#9ca3af]">{stat.toUpperCase()}</div>
            <div class="flex items-center justify-between mt-0.5">
              {#if isEditing}
                <input
                  type="number"
                  bind:value={editSheet.stats[stat]}
                  class="w-10 text-sm font-bold bg-[#242424] border border-[#374151] rounded px-1 focus:outline-none focus:border-indigo-500"
                  style="color: {STAT_COLORS[stat]}"
                />
              {:else}
                <span class="text-sm font-bold" style="color: {STAT_COLORS[stat]}">
                  {toNumber(view.stats?.[stat])}
                </span>
              {/if}
              <span class="text-xs font-bold">{formatModifier(getStatModifier(stat))}</span>
            </div>
          </div>
        {/each}
      </div>

      <!-- ═══ DEFENSE ROW ═══ -->
      <div class="grid grid-cols-3 gap-1.5 mt-1.5">
        <!-- Parade -->
        <div class="bg-[#1f2937] rounded-md p-1.5">
          <div class="text-[7px] font-bold text-[#9ca3af]">PARADE</div>
          <div class="flex items-baseline gap-1 mt-0.5">
            <span class="text-base font-bold leading-none">
              {paradeTotal({ deflexion: eqStats.deflexion, gardeBonus: eqStats.garde, bonus: defenseBonus })}
            </span>
            {#if isEditing}
              <input
                type="text"
                bind:value={editSheet.defense.bonus}
                title="Bonus de parade"
                class="w-8 text-[9px] font-bold text-[#9ca3af] bg-[#242424] border border-[#374151] rounded px-0.5 text-center focus:outline-none focus:border-indigo-500"
              />
            {:else}
              <span class="text-[8px] text-[#9ca3af] font-medium">
                = <span class="text-teal-400 font-bold">{eqStats.deflexion}</span>+
                <span class="text-orange-400 font-bold">{eqStats.garde}</span>+
                <span class="font-bold">{toNumber(defenseBonus)}</span>
              </span>
            {/if}
          </div>
          <div class="text-[7px] text-[#9ca3af] mt-0.5">Armure {eqStats.armure}</div>
        </div>

        <!-- Initiative -->
        <div class="bg-[#1f2937] rounded-md p-1.5">
          <div class="text-[7px] font-bold text-[#9ca3af]">INITIATIVE</div>
          <div class="flex items-baseline gap-1 mt-0.5">
            {#if isEditing}
              <input
                type="number"
                bind:value={editSheet.derived.initiative}
                class="w-12 text-base font-bold bg-[#242424] border border-[#374151] rounded px-1 focus:outline-none focus:border-indigo-500"
                style="color: {STAT_COLORS.agilite}"
              />
            {:else}
              <span class="text-base font-bold leading-none" style="color: {STAT_COLORS.agilite}">
                {toNumber(view.derived?.initiative)}
              </span>
            {/if}
            <span class="text-[8px] font-medium text-[#9ca3af]">
              {formatModifier(getStatModifier('agilite'))}
            </span>
          </div>
          <div class="text-[7px] text-[#9ca3af] mt-0.5 hidden @2xl:block">Jet / ordre de tour</div>
        </div>

        <!-- Mouvement -->
        <div class="bg-[#1f2937] rounded-md p-1.5">
          <div class="text-[7px] font-bold text-[#9ca3af]">MOUVEMENT</div>
          <div class="flex items-baseline gap-0.5 mt-0.5">
            {#if isEditing}
              <input
                type="number"
                bind:value={editSheet.derived.mouvement}
                class="w-12 text-base font-bold bg-[#242424] border border-[#374151] rounded px-1 focus:outline-none focus:border-indigo-500"
                style="color: {STAT_COLORS.social}"
              />
            {:else}
              <span class="text-base font-bold leading-none" style="color: {STAT_COLORS.social}">
                {toNumber(view.derived?.mouvement)}
              </span>
            {/if}
            <span class="text-[9px] font-bold text-[#9ca3af]">m</span>
          </div>
          <div class="text-[7px] text-[#9ca3af] mt-0.5 hidden @2xl:block">Déplacement disponible</div>
        </div>
      </div>

      <!-- ═══ PILLS ROW ═══ -->
      <div class="grid grid-cols-4 gap-1.5 mt-1.5">
        <div class="bg-[#111827] rounded-md px-1.5 py-1">
          <div class="text-[7px] font-bold text-[#9ca3af]">SEUIL MISS</div>
          {#if isEditing}
            <input
              type="text"
              bind:value={editSheet.derived.seuilMiss}
              class="w-full text-[11px] font-bold bg-[#242424] border border-[#374151] rounded px-1 mt-0.5 focus:outline-none focus:border-indigo-500"
            />
          {:else}
            <div class="text-[11px] font-bold">{view.derived?.seuilMiss ?? '—'}</div>
          {/if}
        </div>
        <div class="bg-[#111827] rounded-md px-1.5 py-1">
          <div class="text-[7px] font-bold text-[#9ca3af]">BNS ATT.</div>
          {#if isEditing}
            <input
              type="text"
              bind:value={editSheet.derived.bonusAttaque}
              class="w-full text-[11px] font-bold bg-[#242424] border border-[#374151] rounded px-1 mt-0.5 focus:outline-none focus:border-indigo-500"
            />
          {:else}
            <div class="text-[11px] font-bold">
              {view.derived?.bonusAttaque === '' || view.derived?.bonusAttaque == null
                ? '—'
                : view.derived?.bonusAttaque}
            </div>
          {/if}
        </div>
        <div class="bg-[#111827] rounded-md px-1.5 py-1">
          <div class="text-[7px] font-bold text-[#9ca3af]">CANALIS.</div>
          {#if isEditing}
            <input
              type="text"
              bind:value={editSheet.derived.canalisation}
              class="w-full text-[11px] font-bold bg-[#242424] border border-[#374151] rounded px-1 mt-0.5 focus:outline-none focus:border-indigo-500"
            />
          {:else}
            <div class="text-[11px] font-bold">{view.derived?.canalisation ?? '—'}</div>
          {/if}
        </div>
        <div class="bg-[#111827] rounded-md px-1.5 py-1">
          <div class="text-[7px] font-bold text-[#9ca3af]">VOLONTÉ</div>
          <div class="text-[11px] font-bold">{eqStats.volonte}</div>
        </div>
      </div>
      <button
        onclick={() => (activeTab = 'capacites')}
        class="w-full mt-1.5 bg-indigo-600 rounded-md px-2 py-1 flex items-center justify-between hover:bg-indigo-500 transition-colors text-left"
      >
        <span class="text-[9px] font-bold truncate">TOTEM &nbsp;{view.totem?.nom || '—'}</span>
        <span class="text-[8px] font-medium text-indigo-200 shrink-0">Voir effet →</span>
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
                      class="skill-row flex items-center gap-2 bg-[#111827] rounded-md px-2.5 py-1.5 {isEditing
                        ? ''
                        : 'cursor-pointer'} hover:bg-[#1f2937] transition-colors"
                      onclick={() => !isEditing && handleSkillRoll(skillKey)}
                      role="button"
                      tabindex="0"
                      onkeydown={(e) => e.key === 'Enter' && !isEditing && handleSkillRoll(skillKey)}
                    >
                      <div class="w-1 h-5 rounded-full shrink-0" style="background: {STAT_COLORS[group.stat]}"></div>
                      {#if isEditing}
                        <input type="checkbox" bind:checked={editSheet.skills[skillKey].trained} class="w-3.5 h-3.5 accent-indigo-600" />
                        <span class="text-[11px] font-medium truncate flex-1">{SKILL_LABELS[skillKey]}</span>
                        <input
                          type="number"
                          bind:value={editSheet.skills[skillKey].bonus}
                          title="Bonus manuel"
                          class="w-14 text-[11px] font-bold bg-[#242424] border border-[#374151] rounded px-1 py-0.5 text-center focus:outline-none focus:border-indigo-500"
                        />
                      {:else}
                        <span class="text-[11px] font-medium truncate flex-1">
                          {SKILL_LABELS[skillKey]} {formatModifier(mod)}
                        </span>
                      {/if}
                      <button
                        onclick={(e) => {
                          e.stopPropagation();
                          togglePin('pinnedSkills', skillKey);
                        }}
                        title={pinned ? 'Retirer des favoris' : 'Épingler en favori'}
                        class="text-[10px] leading-none shrink-0 transition-opacity {pinned
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

          <!-- Free roll -->
          <div class="flex gap-2 mb-3">
            <input
              type="text"
              bind:value={freeFormula}
              placeholder="Lancer libre — ex. 2d20+5"
              onkeydown={(e) => {
                if (e.key === 'Enter') checkUnsavedChanges(() => handleDiceRoll('Lancer libre', freeFormula));
              }}
              class="flex-1 min-w-0 px-3 py-2 bg-[#111827] border border-[#374151] rounded-lg text-xs focus:outline-none focus:border-indigo-500"
            />
            <button
              onclick={() => checkUnsavedChanges(() => handleDiceRoll('Lancer libre', freeFormula))}
              class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold rounded-lg transition-colors"
            >
              Lancer
            </button>
          </div>

          <div class="flex justify-between items-center mb-2.5">
            <h2 class="text-xs font-bold">LISTE</h2>
            {#if isEditing}
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
            {/if}
          </div>

          <div class="space-y-2.5">
            {#each (isEditing && editSheet ? editSheet.capacities : view.capacities) || [] as capacity, i}
              {@const pinKey = capacityPinKey(capacity, i)}
              {@const pinned = isPinned(view.pinnedCapacities, pinKey)}
              <div class="capacity-card bg-[#111827] rounded-lg p-2.5 hover:bg-[#1f2937] transition-colors">
                {#if isEditing}
                  <div class="space-y-2">
                    <div class="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Nom de la capacité"
                        bind:value={editSheet.capacities[i].name}
                        class="flex-1 min-w-0 px-3 py-2 bg-[#242424] border border-[#374151] rounded text-xs font-bold focus:outline-none focus:border-indigo-500"
                      />
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
                    <textarea
                      placeholder="Description"
                      bind:value={editSheet.capacities[i].description}
                      class="w-full px-3 py-2 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500"
                      rows="2"
                    ></textarea>
                    <div class="grid grid-cols-2 @2xl:grid-cols-4 gap-2">
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ca3af] mb-1">IMAGE (URL)</label>
                        <input
                          type="text"
                          bind:value={editSheet.capacities[i].image}
                          class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ca3af] mb-1">COÛT TOTAL</label>
                        <input
                          type="number"
                          bind:value={editSheet.capacities[i].cost.total}
                          class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ca3af] mb-1">COULEUR</label>
                        <input
                          type="text"
                          bind:value={editSheet.capacities[i].cost.color}
                          class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ca3af] mb-1">USAGE</label>
                        <input
                          type="text"
                          bind:value={editSheet.capacities[i].usage}
                          class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                    <div class="grid grid-cols-2 @2xl:grid-cols-3 gap-2">
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ca3af] mb-1">DÉS (formule)</label>
                        <input
                          type="text"
                          bind:value={editSheet.capacities[i].value.main}
                          class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ca3af] mb-1">INCANTATION</label>
                        <input
                          type="text"
                          bind:value={editSheet.capacities[i].incantation}
                          class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ca3af] mb-1">SAUVEGARDE</label>
                        <input
                          type="text"
                          bind:value={editSheet.capacities[i].save}
                          class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                    <div class="flex gap-2 items-center">
                      <label class="flex items-center gap-2 text-[10px] text-[#9ca3af]">
                        <input type="checkbox" bind:checked={editSheet.capacities[i].prepared} class="w-3.5 h-3.5 accent-indigo-600" />
                        Préparée
                      </label>
                      <button
                        onclick={() => {
                          editSheet.capacities.splice(i, 1);
                          editSheet.capacities = [...editSheet.capacities];
                        }}
                        class="ml-auto px-3 py-1 bg-red-900 hover:bg-red-800 text-red-200 text-[10px] font-semibold rounded transition-colors"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                {:else}
                  <div class="flex gap-2.5">
                    <div class="w-14 h-14 @2xl:w-20 @2xl:h-20 bg-indigo-600 rounded-md flex items-center justify-center shrink-0 overflow-hidden">
                      {#if capacity.image}
                        <img src={capacity.image} alt={capacity.name || 'Capacité'} class="w-full h-full object-cover" />
                      {:else}
                        <span class="text-[9px] font-bold text-[#9ca3af]">IMAGE</span>
                      {/if}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-1">
                        <div class="text-sm font-bold truncate flex-1">{capacity.name || 'Sans nom'}</div>
                        <button
                          onclick={() => togglePin('pinnedCapacities', pinKey)}
                          title={pinned ? 'Retirer des favoris' : 'Épingler en favori'}
                          class="text-[10px] leading-none shrink-0 transition-opacity {pinned
                            ? ''
                            : 'opacity-25 hover:opacity-70'}"
                        >
                          📌
                        </button>
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
                          onclick={() => checkUnsavedChanges(() => handleDiceRoll(capacity.name || 'Capacité', capacity.value.main))}
                          title="Lancer les dés"
                          class="w-16 h-9 text-sm @2xl:w-24 @2xl:h-12 @2xl:text-base bg-slate-500 rounded-lg font-bold hover:bg-slate-400 transition-colors"
                        >
                          {capacity.value.main}
                        </button>
                      {/if}
                      <span class="text-base text-[#9ca3af] hidden @2xl:block" title={capacity.description || ''}>?</span>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>

          <!-- Totem -->
          <div class="bg-[#111827] rounded-lg p-3 mt-5">
            <div class="text-[10px] font-bold text-[#9ca3af] mb-2.5">TOTEM</div>
            <div class="mb-2.5">
              <label class="block text-[9px] font-bold text-[#9ca3af] mb-1">Nom</label>
              {#if isEditing}
                <input
                  type="text"
                  bind:value={editSheet.totem.nom}
                  class="w-full px-3 py-1.5 bg-[#242424] border border-[#374151] rounded text-xs focus:outline-none focus:border-indigo-500"
                />
              {:else}
                <div class="text-xs font-bold">{view.totem?.nom || '—'}</div>
              {/if}
            </div>
            <div>
              <label class="block text-[9px] font-bold text-[#9ca3af] mb-1">Description</label>
              {#if isEditing}
                <textarea
                  bind:value={editSheet.totem.description}
                  class="w-full px-3 py-2 bg-[#242424] border border-[#374151] rounded text-xs focus:outline-none focus:border-indigo-500"
                  rows="3"
                ></textarea>
              {:else}
                <div class="text-[10px] text-[#9ca3af] whitespace-pre-wrap">{view.totem?.description || '—'}</div>
              {/if}
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
              {@const slotData = (isEditing && editSheet ? editSheet.equipment?.[slot] : view.equipment?.[slot]) ?? {}}
              <div class="equip-slot bg-[#111827] rounded-lg p-2.5 cursor-pointer hover:bg-[#1f2937] transition-colors">
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
                  <div class="mt-2 space-y-2 border-t border-[#374151] pt-2">
                    {#each Object.entries(slotData) as [field, value]}
                      {#if isEditing || (value !== '' && value != null)}
                        <div>
                          <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5 capitalize">{field}</label>
                          {#if isEditing}
                            {#if field === 'description' || field === 'enchantement'}
                              <textarea
                                bind:value={editSheet.equipment[slot][field]}
                                class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500"
                                rows="2"
                              ></textarea>
                            {:else}
                              <input
                                type="text"
                                bind:value={editSheet.equipment[slot][field]}
                                class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500"
                              />
                            {/if}
                          {:else}
                            <div class="text-[10px] whitespace-pre-wrap">{value || '—'}</div>
                          {/if}
                        </div>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>

          <div class="flex items-center justify-between mb-2.5">
            <h2 class="text-xs font-bold">INVENTAIRE</h2>
            {#if isEditing}
              <button
                onclick={() => {
                  editSheet.inventoryItems = [...(editSheet.inventoryItems || []), { type: 'Divers', name: '', description: '' }];
                }}
                class="px-3 py-1 bg-indigo-600 rounded-full text-[10px] font-semibold hover:bg-indigo-500 transition-colors"
              >
                + Ajouter un objet
              </button>
            {/if}
          </div>

          {#if (isEditing && editSheet ? editSheet.inventoryItems : view.inventoryItems)?.length}
            {#each inventoryGroups(isEditing && editSheet ? editSheet.inventoryItems : view.inventoryItems) as [type, items], groupIndex}
              <div class="bg-[#111827] rounded-md px-2.5 py-2 flex items-center gap-2.5 {groupIndex > 0 ? 'mt-2' : ''}">
                <span class="text-[8px] font-bold text-[#9ca3af] w-20 uppercase">{type}</span>
                <span class="text-[9px] font-medium text-[#9ca3af] truncate">{itemFamilies(items)}</span>
              </div>
              {#each items as item}
                {#if isEditing}
                  <div class="bg-[#111827] rounded-md px-2.5 py-2 space-y-2">
                    {#each Object.entries(item ?? {}).filter(([field]) => field !== 'equipmentData') as [field, value]}
                      <div class="flex items-center gap-2">
                        <label class="text-[8px] font-bold text-[#9ca3af] w-24 shrink-0 capitalize">{field}</label>
                        {#if field === 'description'}
                          <textarea
                            bind:value={item[field]}
                            class="flex-1 px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500"
                            rows="2"
                          ></textarea>
                        {:else}
                          <input
                            type="text"
                            bind:value={item[field]}
                            class="flex-1 px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500"
                          />
                        {/if}
                      </div>
                    {/each}
                    <button
                      onclick={() => {
                        const list = editSheet.inventoryItems;
                        list.splice(list.indexOf(item), 1);
                        editSheet.inventoryItems = [...list];
                      }}
                      class="px-3 py-1 bg-red-900 hover:bg-red-800 text-red-200 text-[10px] font-semibold rounded transition-colors"
                    >
                      Supprimer
                    </button>
                  </div>
                {:else}
                  <div class="bg-[#111827] rounded-md px-2.5 py-2 flex items-center gap-2">
                    <span class="text-xs font-semibold flex-1 truncate">{item?.name || '—'}</span>
                    <span class="text-xs font-bold w-12 text-center">{itemCenterValue(item)}</span>
                    <span class="text-[9px] text-[#9ca3af] w-24 @2xl:w-52 text-right truncate">{itemNotes(item)}</span>
                  </div>
                {/if}
              {/each}
            {/each}
          {:else}
            <div class="text-[10px] text-[#9ca3af]">Aucun objet dans l'inventaire.</div>
          {/if}

          <!-- Weapons -->
          <div class="flex items-center justify-between mt-5 mb-2.5">
            <h2 class="text-xs font-bold">ARMES</h2>
            {#if isEditing}
              <button
                onclick={() => {
                  editSheet.weapons = [...(editSheet.weapons || []), {
                    nom: '', de: '', forceAgi: '', critique: '', avantage: '',
                    bonus: '', perfection: '', notes: '', equipped: false
                  }];
                }}
                class="px-3 py-1 bg-indigo-600 rounded-full text-[10px] font-semibold hover:bg-indigo-500 transition-colors"
              >
                + Ajouter une arme
              </button>
            {/if}
          </div>
          {#each (isEditing && editSheet ? editSheet.weapons : view.weapons) || [] as weapon, i}
            {#if isEditing || weapon?.nom}
              {@const weaponFields = Object.entries(weapon ?? {}).filter(([field]) => field !== 'nom' && field !== 'equipped')}
              <div class="bg-[#111827] rounded-lg p-2.5 mb-2">
                <div class="flex items-center gap-2.5 mb-2">
                  {#if isEditing}
                    <label class="flex items-center gap-2 text-[10px] text-[#9ca3af]">
                      <input type="checkbox" bind:checked={editSheet.weapons[i].equipped} class="w-3.5 h-3.5 accent-indigo-600" />
                      Équipée
                    </label>
                    <input
                      type="text"
                      placeholder="Nom de l'arme"
                      bind:value={editSheet.weapons[i].nom}
                      class="flex-1 min-w-0 px-2 py-1 bg-[#242424] border border-[#374151] rounded text-xs font-bold focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      onclick={() => {
                        editSheet.weapons.splice(i, 1);
                        editSheet.weapons = [...editSheet.weapons];
                      }}
                      class="px-3 py-1 bg-red-900 hover:bg-red-800 text-red-200 text-[10px] font-semibold rounded transition-colors"
                    >
                      Supprimer
                    </button>
                  {:else}
                    {#if weapon?.equipped}
                      <span class="px-2 py-0.5 bg-indigo-600 text-[9px] font-semibold rounded">Équipée</span>
                    {/if}
                    <span class="text-xs font-bold truncate">{weapon?.nom || 'Sans nom'}</span>
                    {#if weapon?.de}
                      <span class="ml-auto text-xs font-bold">{weapon.de}</span>
                    {/if}
                  {/if}
                </div>
                {#if isEditing}
                  <div class="grid grid-cols-2 @2xl:grid-cols-3 gap-2">
                    {#each weaponFields as [field, value]}
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ca3af] mb-0.5 capitalize">{field}</label>
                        {#if field === 'notes'}
                          <textarea
                            bind:value={editSheet.weapons[i][field]}
                            class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500"
                            rows="2"
                          ></textarea>
                        {:else}
                          <input
                            type="text"
                            bind:value={editSheet.weapons[i][field]}
                            class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500"
                          />
                        {/if}
                      </div>
                    {/each}
                  </div>
                {:else}
                  <div class="text-[9px] text-[#9ca3af] truncate">
                    {weaponFields
                      .filter(([, value]) => value !== '' && value != null)
                      .map(([field, value]) => `${field}: ${stripHtml(value)}`)
                      .join(' · ') || '—'}
                  </div>
                {/if}
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
                {#if isEditing}
                  <textarea
                    bind:value={editSheet.narrative[field]}
                    class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500"
                    rows="4"
                  ></textarea>
                {:else}
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
                {/if}
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
              {#if isEditing}
                <textarea
                  bind:value={masteryText[key]}
                  placeholder="Un élément par ligne"
                  class="w-full px-3 py-2 bg-[#242424] border border-[#374151] rounded text-[10px] focus:outline-none focus:border-indigo-500"
                  rows="3"
                ></textarea>
                <div class="text-[9px] text-[#9ca3af] mt-1">Un élément par ligne.</div>
              {:else}
                <div class="flex gap-2.5 flex-wrap">
                  {#each masteryItems(key) as item}
                    <span class="pill px-4 py-1.5 bg-indigo-600 rounded-full text-[10px] font-semibold">{item}</span>
                  {/each}
                  {#if !masteryItems(key).length}
                    <span class="pill px-4 py-1.5 bg-[#1f2937] rounded-full text-[10px] font-semibold text-[#9ca3af]">Aucun</span>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {:else if activeTab === 'notes'}
        <!-- TAB: NOTES -->
        <div>
          <h2 class="text-sm font-bold mb-3">NOTES</h2>

          <!-- Toolbar -->
          <div class="bg-[#111827] rounded-md px-2 py-2 flex gap-2 mb-3 flex-wrap">
            <button
              onclick={() => wrapNotesSelection('**', '**')}
              title="Gras (autour de la sélection)"
              class="px-4 py-1 bg-indigo-600 rounded-full text-[10px] font-semibold hover:bg-indigo-500 transition-colors"
            >
              B
            </button>
            <button
              onclick={() => wrapNotesSelection('__', '__')}
              title="Souligné (autour de la sélection)"
              class="px-4 py-1 bg-indigo-600 rounded-full text-[10px] font-semibold hover:bg-indigo-500 transition-colors"
            >
              U
            </button>
            <button
              title="Taille du texte — non implémenté"
              class="px-4 py-1 bg-[#1f2937] rounded-full text-[10px] font-semibold text-[#9ca3af] cursor-default"
            >
              T-
            </button>
            <button
              title="Taille du texte — non implémenté"
              class="px-4 py-1 bg-[#1f2937] rounded-full text-[10px] font-semibold text-[#9ca3af] cursor-default"
            >
              T+
            </button>
            <button
              onclick={() => prefixNotesLines('• ')}
              title="Liste à puces"
              class="px-3 py-1 bg-[#1f2937] rounded-full text-[10px] font-semibold hover:bg-[#374151] transition-colors"
            >
              • Liste
            </button>
            <button
              onclick={() => prefixNotesLines('☐ ')}
              title="Case à cocher"
              class="px-3 py-1 bg-[#1f2937] rounded-full text-[10px] font-semibold hover:bg-[#374151] transition-colors"
            >
              ☐
            </button>
            <button
              onclick={() => insertNotesText('— ')}
              title="Insérer un tiret"
              class="px-3 py-1 bg-[#1f2937] rounded-full text-[10px] font-semibold hover:bg-[#374151] transition-colors"
            >
              —
            </button>
          </div>

          <!-- Editor -->
          <div class="bg-[#111827] rounded-lg p-3.5 min-h-[300px]">
            <div class="text-lg font-bold mb-2.5">Notes de session</div>
            {#if isEditing}
              <textarea
                bind:this={notesArea}
                bind:value={editSheet.notes}
                class="w-full min-h-[240px] px-3 py-2 bg-[#242424] border border-[#374151] rounded text-xs leading-relaxed focus:outline-none focus:border-indigo-500"
                placeholder="Écriture libre — notes de session"
              ></textarea>
            {:else}
              <div class="text-xs leading-relaxed whitespace-pre-wrap min-h-[220px]">
                {view.notes || 'Aucune note pour le moment.'}
              </div>
            {/if}
            <div class="text-[9px] font-medium text-[#9ca3af] mt-6 pt-2.5 border-t border-[#374151]">
              Écriture libre — gras — souligné — taille du texte — listes
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
          class="h-9 @2xl:h-11 rounded-md text-[9px] font-semibold transition-colors {activeTab === tab.id
            ? 'bg-indigo-600 text-white'
            : 'bg-[#111827] text-[#9ca3af] hover:bg-[#374151]'}"
        >
          {tab.label}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Unsaved Changes Modal -->
  {#if showUnsavedModal}
    <div class="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
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
    <div class="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
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
</style>
