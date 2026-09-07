<script>
  import { onMount, tick } from 'svelte';
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

  const STAT_COLORS = {
    force: '#d1474f',
    agilite: '#51a863',
    esprit: '#7559ba',
    social: '#5489db'
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

  function handleDiceRoll(capacityName, formula) {
    try {
      const result = rollDice(formula, view?.stats ?? {});
      diceResult = {
        ...result,
        timestamp: new Date().toLocaleTimeString()
      };
      onAction({
        type: 'USE_CAPACITY',
        playerId,
        capacityName,
        formula: result.formula,
        total: result.total,
        rolls: result.rolls,
      });
    } catch (err) {
      diceResult = { error: err.message };
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
  class="w-full h-full bg-[#0b0e13] text-[#eff2f9] rounded-2xl border border-[#353d4c] overflow-hidden flex flex-col relative"
  style="font-family: 'Inter', system-ui, sans-serif;"
>
  {#if isLoading}
    <div class="flex-1 flex items-center justify-center text-[#9ba5b7] text-sm">
      Chargement de la fiche de personnage...
    </div>
  {:else}
    <!-- ═══ TOP BAR ═══ -->
    <div class="h-10 bg-[#13161e] flex items-center px-4 shrink-0">
      <span class="text-sm font-bold tracking-wide">CARDENVEIL</span>
      <span class="text-xs font-medium text-[#9ba5b7] ml-6 truncate">
        {view.identity?.nom || '—'} · {view.identity?.race || '—'} · Niveau {view.identity?.niveau ?? 1}
      </span>
      <div class="ml-auto flex items-center gap-1.5 shrink-0">
        {#if isEditing}
          <button
            onclick={cancelEdit}
            disabled={isSaving}
            class="px-3 py-1.5 bg-[#1a1e27] rounded-full text-[10px] font-semibold text-[#9ba5b7] hover:text-[#eff2f9] transition-colors disabled:opacity-50"
          >
            ANNULER
          </button>
          <button
            onclick={saveEdit}
            disabled={isSaving}
            class="px-3 py-1.5 bg-[#49387a] rounded-full text-[10px] font-semibold hover:opacity-85 transition-opacity disabled:opacity-50"
          >
            {isSaving ? 'SAUVEGARDE...' : 'SAUVEGARDER'}
          </button>
        {:else}
          <button
            onclick={handleImport}
            title="Importer une fiche JSON"
            class="px-3 py-1.5 bg-[#1a1e27] rounded-full text-[10px] font-semibold text-[#9ba5b7] hover:text-[#eff2f9] transition-colors"
          >
            IMPORTER
          </button>
          <button
            onclick={() => (showDeleteConfirm = true)}
            title="Supprimer la fiche"
            class="px-3 py-1.5 bg-[#1a1e27] rounded-full text-[10px] font-semibold text-[#9ba5b7] hover:text-red-400 transition-colors"
          >
            SUPPRIMER
          </button>
        {/if}
        <button
          onclick={() => (isEditing ? cancelEdit() : startEdit())}
          class="px-4 py-1.5 bg-[#1a1e27] rounded-full text-[10px] font-semibold text-[#9ba5b7] hover:text-[#eff2f9] transition-colors"
        >
          ÉDITION {isEditing ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>

    {#if importError}
      <div class="bg-red-950 border-b border-red-800 px-4 py-2 text-red-200 text-xs">
        Erreur d'import : {importError}
      </div>
    {/if}

    <!-- ═══ CHARACTER HEADER ═══ -->
    <div class="px-4 pt-4 pb-3 shrink-0">
      <div class="flex flex-wrap gap-4">
        <!-- Portrait -->
        <div class="w-20 h-24 bg-[#1a1e27] rounded-lg flex flex-col items-center justify-center shrink-0 overflow-hidden">
          {#if view.portrait}
            <img src={view.portrait} alt="Portrait" class="w-full h-full object-cover" />
          {:else}
            <span class="text-[9px] font-bold text-[#9ba5b7]">PORTRAIT</span>
          {/if}
        </div>

        <!-- Identity -->
        <div class="flex-1 min-w-[180px]">
          {#if isEditing}
            <input
              type="text"
              bind:value={editSheet.identity.nom}
              placeholder="Nom"
              class="w-full text-2xl font-bold bg-transparent border-b border-[#353d4c] focus:outline-none focus:border-[#49387a]"
            />
            <div class="flex gap-2 mt-2">
              <input
                type="text"
                bind:value={editSheet.identity.race}
                placeholder="Race"
                class="flex-1 text-xs font-medium text-[#9ba5b7] bg-transparent border-b border-[#353d4c] focus:outline-none focus:border-[#49387a]"
              />
              <input
                type="text"
                bind:value={editSheet.identity.alignement}
                placeholder="Alignement"
                class="flex-1 text-xs font-medium text-[#9ba5b7] bg-transparent border-b border-[#353d4c] focus:outline-none focus:border-[#49387a]"
              />
            </div>
          {:else}
            <h1 class="text-2xl font-bold truncate">{view.identity?.nom || 'Sans nom'}</h1>
            <p class="text-xs font-medium text-[#9ba5b7] mt-1">
              {view.identity?.race || '—'} · {view.identity?.alignement || '—'}
            </p>
          {/if}
          <div class="flex flex-wrap gap-2 mt-3">
            <span class="px-3 py-1 bg-[#1a1e27] rounded-full text-[10px] font-semibold">
              XP dép. {view.progression?.xpDepenses ?? 0}
            </span>
            <span class="px-3 py-1 bg-[#1a1e27] rounded-full text-[10px] font-semibold">
              XP dispo. {view.progression?.xpDisponibles ?? 0}
            </span>
            <span class="px-3 py-1 bg-[#1a1e27] rounded-full text-[10px] font-semibold">
              Niv. {view.identity?.niveau ?? 1}
            </span>
          </div>
        </div>

        <!-- HP Block -->
        <div class="w-[358px] max-w-full h-24 bg-[#13161e] rounded-[10px] p-4 relative shrink-0 border border-[#353d4c]/40">
          <div class="text-[10px] font-bold text-[#9ba5b7]">PV</div>
          {#if isEditing}
            <div class="flex items-baseline gap-1 mt-1">
              <input
                type="number"
                bind:value={editSheet.derived.pvActuels}
                class="w-16 text-2xl font-bold bg-[#0b0e13] border border-[#353d4c] rounded px-1 py-0.5 focus:outline-none focus:border-[#49387a]"
              />
              <span class="text-base font-semibold text-[#9ba5b7]">/</span>
              <input
                type="number"
                bind:value={editSheet.derived.pvMax}
                class="w-14 text-base font-bold bg-[#0b0e13] border border-[#353d4c] rounded px-1 py-0.5 focus:outline-none focus:border-[#49387a]"
              />
            </div>
          {:else}
            <div class="flex items-baseline gap-1 mt-1">
              <span class="text-3xl font-bold">{toNumber(view.derived?.pvActuels)}</span>
              <span class="text-base font-semibold text-[#9ba5b7]">/ {toNumber(view.derived?.pvMax)}</span>
            </div>
          {/if}
          <div class="absolute right-4 top-3 flex flex-col items-end gap-0.5 text-right">
            <span class="text-[10px] font-semibold text-[#9ba5b7]">
              TEMP {#if isEditing}<input
                  type="number"
                  bind:value={editSheet.derived.pvTemporaires}
                  class="w-12 text-[10px] bg-[#0b0e13] border border-[#353d4c] rounded px-1 focus:outline-none focus:border-[#49387a]"
                />{:else}{view.derived?.pvTemporaires || '—'}{/if}
            </span>
            <span class="text-[9px] font-bold text-[#9ba5b7]">
              FATIGUE {#if isEditing}<input
                  type="number"
                  bind:value={editSheet.derived.fatigue}
                  class="w-10 text-[9px] bg-[#0b0e13] border border-[#353d4c] rounded px-1 focus:outline-none focus:border-[#49387a]"
                />{/if}
            </span>
            <span class="text-sm font-medium tracking-widest">
              {#if !isEditing && toNumber(view.derived?.fatigue) > 0}
                {'● '.repeat(Math.min(10, toNumber(view.derived.fatigue))).trim()}
              {:else if !isEditing}
                —
              {/if}
            </span>
          </div>
        </div>
      </div>

      <!-- Identity extras (edit mode only) -->
      {#if isEditing}
        <div class="grid grid-cols-4 gap-2 mt-2">
          {#each IDENTITY_EXTRAS as [field, label]}
            <div>
              <label class="block text-[8px] font-bold text-[#9ba5b7] mb-0.5">{label}</label>
              <input
                type="text"
                bind:value={editSheet.identity[field]}
                class="w-full text-[10px] bg-[#1a1e27] border border-[#353d4c] rounded px-1.5 py-1 focus:outline-none focus:border-[#49387a]"
              />
            </div>
          {/each}
          <div>
            <label class="block text-[8px] font-bold text-[#9ba5b7] mb-0.5">Portrait (URL)</label>
            <input
              type="text"
              bind:value={editSheet.portrait}
              class="w-full text-[10px] bg-[#1a1e27] border border-[#353d4c] rounded px-1.5 py-1 focus:outline-none focus:border-[#49387a]"
            />
          </div>
          <div>
            <label class="block text-[8px] font-bold text-[#9ba5b7] mb-0.5">XP dépensés</label>
            <input
              type="number"
              bind:value={editSheet.progression.xpDepenses}
              class="w-full text-[10px] bg-[#1a1e27] border border-[#353d4c] rounded px-1.5 py-1 focus:outline-none focus:border-[#49387a]"
            />
          </div>
          <div>
            <label class="block text-[8px] font-bold text-[#9ba5b7] mb-0.5">XP disponibles</label>
            <input
              type="number"
              bind:value={editSheet.progression.xpDisponibles}
              class="w-full text-[10px] bg-[#1a1e27] border border-[#353d4c] rounded px-1.5 py-1 focus:outline-none focus:border-[#49387a]"
            />
          </div>
          <div>
            <label class="block text-[8px] font-bold text-[#9ba5b7] mb-0.5">Niveau</label>
            <input
              type="number"
              bind:value={editSheet.identity.niveau}
              class="w-full text-[10px] bg-[#1a1e27] border border-[#353d4c] rounded px-1.5 py-1 focus:outline-none focus:border-[#49387a]"
            />
          </div>
        </div>
      {/if}

      <!-- ═══ STATS ROW ═══ -->
      <div class="grid grid-cols-4 gap-2 mt-3">
        {#each ['force', 'agilite', 'esprit', 'social'] as stat}
          <div class="bg-[#1a1e27] rounded-lg p-2.5">
            <div class="text-[9px] font-bold text-[#9ba5b7]">{stat.toUpperCase()}</div>
            <div class="flex items-center justify-between mt-0.5">
              {#if isEditing}
                <input
                  type="number"
                  bind:value={editSheet.stats[stat]}
                  class="w-12 text-lg font-bold bg-[#0b0e13] border border-[#353d4c] rounded px-1 focus:outline-none focus:border-[#49387a]"
                  style="color: {STAT_COLORS[stat]}"
                />
              {:else}
                <span class="text-lg font-bold" style="color: {STAT_COLORS[stat]}">
                  {toNumber(view.stats?.[stat])}
                </span>
              {/if}
              <span class="text-lg font-bold">{formatModifier(getStatModifier(stat))}</span>
            </div>
          </div>
        {/each}
      </div>

      <!-- ═══ DEFENSE / DERIVED ROW ═══ -->
      <div class="grid grid-cols-3 gap-2 mt-2">
        <!-- Parade -->
        <div class="bg-[#13161e] rounded-[10px] p-3 border border-[#353d4c]/40">
          <div class="text-[10px] font-bold text-[#9ba5b7] mb-1">PARADE</div>
          <div class="flex items-center gap-2">
            <span class="text-[42px] font-bold leading-none">
              {paradeTotal({ deflexion: eqStats.deflexion, gardeBonus: eqStats.garde, bonus: defenseBonus })}
            </span>
            <div class="flex flex-col gap-0.5">
              <div class="flex items-center gap-1">
                <span class="text-base font-bold text-[#9ba5b7]">=</span>
                <span class="text-xl font-bold text-teal-400">{eqStats.deflexion}</span>
                <span class="text-base font-bold text-[#9ba5b7]">+</span>
                <span class="text-xl font-bold text-orange-400">{eqStats.garde}</span>
                <span class="text-base font-bold text-[#9ba5b7]">+</span>
                {#if isEditing}
                  <input
                    type="text"
                    bind:value={editSheet.defense.bonus}
                    class="w-10 text-xl font-bold text-[#9ba5b7] bg-[#0b0e13] border border-[#353d4c] rounded px-1 text-center focus:outline-none focus:border-[#49387a]"
                  />
                {:else}
                  <span class="text-xl font-bold text-[#9ba5b7]">{toNumber(defenseBonus)}</span>
                {/if}
              </div>
              <div class="flex gap-3 text-[9px] font-medium text-[#9ba5b7]">
                <span>Déflexion</span>
                <span>Garde</span>
                <span>Bonus</span>
              </div>
            </div>
          </div>
          <div class="text-[10px] font-semibold text-[#9ba5b7] mt-1">Armure {eqStats.armure}</div>
        </div>

        <!-- Initiative -->
        <div class="bg-[#13161e] rounded-[10px] p-3 border border-[#353d4c]/40">
          <div class="text-[10px] font-bold text-[#9ba5b7] mb-1">INITIATIVE</div>
          <div class="flex items-baseline gap-1">
            {#if isEditing}
              <input
                type="number"
                bind:value={editSheet.derived.initiative}
                class="w-16 text-4xl font-bold bg-[#0b0e13] border border-[#353d4c] rounded px-1 focus:outline-none focus:border-[#49387a]"
                style="color: {STAT_COLORS.agilite}"
              />
            {:else}
              <span class="text-4xl font-bold" style="color: {STAT_COLORS.agilite}">
                {toNumber(view.derived?.initiative)}
              </span>
            {/if}
            <span class="text-[10px] font-medium text-[#9ba5b7] ml-2">
              Bonus {formatModifier(getStatModifier('agilite'))}
            </span>
          </div>
          <div class="text-[9px] text-[#9ba5b7] mt-3">Jet / ordre de tour</div>
        </div>

        <!-- Mouvement -->
        <div class="bg-[#13161e] rounded-[10px] p-3 border border-[#353d4c]/40">
          <div class="text-[10px] font-bold text-[#9ba5b7] mb-1">MOUVEMENT</div>
          <div class="flex items-baseline gap-1">
            {#if isEditing}
              <input
                type="number"
                bind:value={editSheet.derived.mouvement}
                class="w-16 text-4xl font-bold bg-[#0b0e13] border border-[#353d4c] rounded px-1 focus:outline-none focus:border-[#49387a]"
                style="color: {STAT_COLORS.social}"
              />
              <span class="text-sm font-bold text-[#9ba5b7]">m</span>
            {:else}
              <span class="text-4xl font-bold" style="color: {STAT_COLORS.social}">
                {toNumber(view.derived?.mouvement)}
              </span>
              <span class="text-sm font-bold text-[#9ba5b7]">m</span>
            {/if}
          </div>
          <div class="text-[9px] text-[#9ba5b7] mt-3">Déplacement disponible</div>
        </div>
      </div>

      <!-- ═══ SMALL PILLS ROW ═══ -->
      <div class="grid grid-cols-5 gap-2 mt-2">
        <div class="bg-[#1a1e27] rounded-md px-2 py-1.5">
          <div class="text-[8px] font-bold text-[#9ba5b7]">SEUIL MISS</div>
          {#if isEditing}
            <input
              type="text"
              bind:value={editSheet.derived.seuilMiss}
              class="w-full text-sm font-bold bg-[#0b0e13] border border-[#353d4c] rounded px-1 mt-0.5 focus:outline-none focus:border-[#49387a]"
            />
          {:else}
            <div class="text-sm font-bold">{view.derived?.seuilMiss ?? '—'}</div>
          {/if}
        </div>
        <div class="bg-[#1a1e27] rounded-md px-2 py-1.5">
          <div class="text-[8px] font-bold text-[#9ba5b7]">BNS ATTAQUE</div>
          {#if isEditing}
            <input
              type="text"
              bind:value={editSheet.derived.bonusAttaque}
              class="w-full text-sm font-bold bg-[#0b0e13] border border-[#353d4c] rounded px-1 mt-0.5 focus:outline-none focus:border-[#49387a]"
            />
          {:else}
            <div class="text-sm font-bold">
              {view.derived?.bonusAttaque === '' || view.derived?.bonusAttaque == null
                ? '—'
                : view.derived?.bonusAttaque}
            </div>
          {/if}
        </div>
        <div class="bg-[#1a1e27] rounded-md px-2 py-1.5">
          <div class="text-[8px] font-bold text-[#9ba5b7]">CANALISATION</div>
          {#if isEditing}
            <input
              type="text"
              bind:value={editSheet.derived.canalisation}
              class="w-full text-sm font-bold bg-[#0b0e13] border border-[#353d4c] rounded px-1 mt-0.5 focus:outline-none focus:border-[#49387a]"
            />
          {:else}
            <div class="text-sm font-bold">{view.derived?.canalisation ?? '—'}</div>
          {/if}
        </div>
        <div class="bg-[#1a1e27] rounded-md px-2 py-1.5">
          <div class="text-[8px] font-bold text-[#9ba5b7]">VOLONTÉ</div>
          <div class="text-sm font-bold">{eqStats.volonte}</div>
        </div>
        <button
          onclick={() => (activeTab = 'capacites')}
          class="bg-[#49387a] rounded-md px-3 py-1.5 flex items-center justify-between hover:opacity-85 transition-opacity text-left"
        >
          <span class="text-[10px] font-bold truncate">
            TOTEM &nbsp;{view.totem?.nom || '—'}
          </span>
          <span class="text-[9px] font-medium text-[#9ba5b7] shrink-0">Voir effet →</span>
        </button>
      </div>
    </div>

    <!-- ═══ CONTENT VIEWPORT ═══ -->
    <div class="flex-1 min-h-0 bg-[#13161e] rounded-[10px] mx-4 overflow-y-auto scrollbar-thin p-4">
      {#if activeTab === 'competences'}
        <!-- TAB: COMPÉTENCES -->
        <div>
          <h2 class="text-sm font-bold mb-1">COMPÉTENCES</h2>
          <p class="text-[10px] text-[#9ba5b7] mb-4">
            Cliquer sur une compétence lance directement le jet{#if !isEditing} — 📌 épingler au mode compact{/if}
          </p>
          <div class="grid grid-cols-2 gap-x-6 gap-y-4">
            {#each SKILL_GROUPS as group}
              <div>
                <div class="text-[11px] font-bold mb-2" style="color: {STAT_COLORS[group.stat]}">
                  {group.label}
                </div>
                <div class="space-y-1">
                  {#each group.skills as skillKey}
                    {@const mod = skillModifier(view.stats, skillKey, view.skills?.[skillKey]?.bonus ?? 0)}
                    <div
                      class="skill-row flex items-center gap-3 bg-[#1a1e27] rounded-md px-3 py-2 {isEditing
                        ? ''
                        : 'cursor-pointer'} hover:bg-[#232836] transition-colors"
                      onclick={() => !isEditing && handleSkillRoll(skillKey)}
                      role="button"
                      tabindex="0"
                      onkeydown={(e) => e.key === 'Enter' && !isEditing && handleSkillRoll(skillKey)}
                    >
                      <div class="w-1 h-6 rounded-full shrink-0" style="background: {STAT_COLORS[group.stat]}"></div>
                      {#if isEditing}
                        <input type="checkbox" bind:checked={editSheet.skills[skillKey].trained} class="w-3.5 h-3.5 accent-[#49387a]" />
                        <span class="text-[11px] font-medium truncate">{SKILL_LABELS[skillKey]}</span>
                        <input
                          type="number"
                          bind:value={editSheet.skills[skillKey].bonus}
                          title="Bonus manuel"
                          class="ml-auto w-14 text-[11px] font-bold bg-[#0b0e13] border border-[#353d4c] rounded px-1 py-0.5 text-center focus:outline-none focus:border-[#49387a]"
                        />
                      {:else}
                        <span class="text-[11px] font-medium truncate">
                          {SKILL_LABELS[skillKey]} {formatModifier(mod)}
                        </span>
                        {#if view.skills?.[skillKey]?.trained}
                          <span class="ml-auto text-[9px] text-[#9ba5b7]" title="Maîtrisée">★</span>
                        {/if}
                      {/if}
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
          <p class="text-[10px] text-[#9ba5b7] mb-4">
            La valeur en dés est l'élément automatisable et cliquable.
          </p>

          <!-- Free roll -->
          <div class="flex gap-2 mb-4">
            <input
              type="text"
              bind:value={freeFormula}
              placeholder="Lancer libre — ex. 2d20+5"
              onkeydown={(e) => {
                if (e.key === 'Enter') checkUnsavedChanges(() => handleDiceRoll('Lancer libre', freeFormula));
              }}
              class="flex-1 px-3 py-2 bg-[#1a1e27] border border-[#353d4c] rounded-lg text-xs focus:outline-none focus:border-[#49387a]"
            />
            <button
              onclick={() => checkUnsavedChanges(() => handleDiceRoll('Lancer libre', freeFormula))}
              class="px-4 py-2 bg-[#49387a] hover:opacity-85 text-xs font-bold rounded-lg transition-opacity"
            >
              Lancer
            </button>
          </div>

          <div class="flex justify-between items-center mb-3">
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
                class="px-3 py-1 bg-[#49387a] rounded-full text-[10px] font-semibold hover:opacity-85 transition-opacity"
              >
                + Ajouter une capacité
              </button>
            {/if}
          </div>

          <div class="space-y-3">
            {#each (isEditing && editSheet ? editSheet.capacities : view.capacities) || [] as capacity, i}
              <div class="capacity-card bg-[#1a1e27] rounded-lg p-3 hover:bg-[#232836] transition-colors">
                {#if isEditing}
                  <div class="space-y-2">
                    <input
                      type="text"
                      placeholder="Nom de la capacité"
                      bind:value={editSheet.capacities[i].name}
                      class="w-full px-3 py-2 bg-[#0b0e13] border border-[#353d4c] rounded text-xs font-bold focus:outline-none focus:border-[#49387a]"
                    />
                    <textarea
                      placeholder="Description"
                      bind:value={editSheet.capacities[i].description}
                      class="w-full px-3 py-2 bg-[#0b0e13] border border-[#353d4c] rounded text-[10px] focus:outline-none focus:border-[#49387a]"
                      rows="2"
                    ></textarea>
                    <div class="grid grid-cols-4 gap-2">
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ba5b7] mb-1">IMAGE (URL)</label>
                        <input
                          type="text"
                          bind:value={editSheet.capacities[i].image}
                          class="w-full px-2 py-1 bg-[#0b0e13] border border-[#353d4c] rounded text-[10px] focus:outline-none focus:border-[#49387a]"
                        />
                      </div>
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ba5b7] mb-1">COÛT TOTAL</label>
                        <input
                          type="number"
                          bind:value={editSheet.capacities[i].cost.total}
                          class="w-full px-2 py-1 bg-[#0b0e13] border border-[#353d4c] rounded text-[10px] focus:outline-none focus:border-[#49387a]"
                        />
                      </div>
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ba5b7] mb-1">COULEUR</label>
                        <input
                          type="text"
                          bind:value={editSheet.capacities[i].cost.color}
                          class="w-full px-2 py-1 bg-[#0b0e13] border border-[#353d4c] rounded text-[10px] focus:outline-none focus:border-[#49387a]"
                        />
                      </div>
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ba5b7] mb-1">USAGE</label>
                        <input
                          type="text"
                          bind:value={editSheet.capacities[i].usage}
                          class="w-full px-2 py-1 bg-[#0b0e13] border border-[#353d4c] rounded text-[10px] focus:outline-none focus:border-[#49387a]"
                        />
                      </div>
                    </div>
                    <div class="grid grid-cols-3 gap-2">
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ba5b7] mb-1">DÉS (formule)</label>
                        <input
                          type="text"
                          bind:value={editSheet.capacities[i].value.main}
                          class="w-full px-2 py-1 bg-[#0b0e13] border border-[#353d4c] rounded text-[10px] focus:outline-none focus:border-[#49387a]"
                        />
                      </div>
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ba5b7] mb-1">INCANTATION</label>
                        <input
                          type="text"
                          bind:value={editSheet.capacities[i].incantation}
                          class="w-full px-2 py-1 bg-[#0b0e13] border border-[#353d4c] rounded text-[10px] focus:outline-none focus:border-[#49387a]"
                        />
                      </div>
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ba5b7] mb-1">SAUVEGARDE</label>
                        <input
                          type="text"
                          bind:value={editSheet.capacities[i].save}
                          class="w-full px-2 py-1 bg-[#0b0e13] border border-[#353d4c] rounded text-[10px] focus:outline-none focus:border-[#49387a]"
                        />
                      </div>
                    </div>
                    <div class="flex gap-2 items-center">
                      <label class="flex items-center gap-2 text-[10px] text-[#9ba5b7]">
                        <input type="checkbox" bind:checked={editSheet.capacities[i].prepared} class="w-3.5 h-3.5 accent-[#49387a]" />
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
                  <div class="flex gap-3">
                    <div class="w-20 h-20 bg-[#49387a] rounded-md flex items-center justify-center shrink-0 overflow-hidden">
                      {#if capacity.image}
                        <img src={capacity.image} alt={capacity.name || 'Capacité'} class="w-full h-full object-cover" />
                      {:else}
                        <span class="text-[9px] font-bold text-[#9ba5b7]">IMAGE</span>
                      {/if}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-bold truncate">{capacity.name || 'Sans nom'}</div>
                      <div class="text-[10px] font-medium text-[#9ba5b7] mt-0.5">
                        {colorLabel(capacity.cost?.color)} · {capacity.usage || '—'}
                      </div>
                      <div class="text-[10px] text-[#9ba5b7] mt-1.5 line-clamp-2">{capacity.description || '—'}</div>
                    </div>
                    <div class="text-right shrink-0 flex flex-col items-end gap-1">
                      <div class="text-[8px] font-bold text-[#9ba5b7]">COÛT</div>
                      <div class="text-lg font-bold">{capacity.cost?.total ?? 0}</div>
                      {#if capacity.value?.main && isDiceFormula(capacity.value.main, view?.stats ?? {})}
                        <button
                          onclick={() => checkUnsavedChanges(() => handleDiceRoll(capacity.name || 'Capacité', capacity.value.main))}
                          title="Lancer les dés"
                          class="w-24 h-12 bg-slate-500 rounded-lg text-base font-bold hover:bg-slate-400 transition-colors"
                        >
                          {capacity.value.main}
                        </button>
                      {/if}
                      <span class="text-base text-[#9ba5b7]" title={capacity.description || ''}>?</span>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>

          <!-- Totem -->
          <div class="bg-[#1a1e27] rounded-lg p-4 mt-6">
            <div class="text-[10px] font-bold text-[#9ba5b7] mb-3">TOTEM</div>
            <div class="mb-3">
              <label class="block text-[9px] font-bold text-[#9ba5b7] mb-1">Nom</label>
              {#if isEditing}
                <input
                  type="text"
                  bind:value={editSheet.totem.nom}
                  class="w-full px-3 py-1.5 bg-[#0b0e13] border border-[#353d4c] rounded text-xs focus:outline-none focus:border-[#49387a]"
                />
              {:else}
                <div class="text-xs font-bold">{view.totem?.nom || '—'}</div>
              {/if}
            </div>
            <div>
              <label class="block text-[9px] font-bold text-[#9ba5b7] mb-1">Description</label>
              {#if isEditing}
                <textarea
                  bind:value={editSheet.totem.description}
                  class="w-full px-3 py-2 bg-[#0b0e13] border border-[#353d4c] rounded text-xs focus:outline-none focus:border-[#49387a]"
                  rows="3"
                ></textarea>
              {:else}
                <div class="text-[10px] text-[#9ba5b7] whitespace-pre-wrap">{view.totem?.description || '—'}</div>
              {/if}
            </div>
          </div>

          {#if diceResult}
            {#if diceResult.error}
              <div class="mt-4 bg-red-950 border border-red-800 rounded-lg p-4">
                <div class="text-xs text-red-200">Formule invalide : {diceResult.error}</div>
              </div>
            {:else}
              <div class="mt-4 bg-[#49387a] border border-[#5a4a96] rounded-lg p-4">
                <div class="text-xs mb-1">Résultat du lancer ({diceResult.timestamp})</div>
                <div class="text-2xl font-bold">{diceResult.total}</div>
                <div class="text-[10px] text-[#c9c2e8] mt-1">
                  {diceResult.formula}: {(diceResult.rolls ?? []).join(', ')}{diceResult.modifier ? ` ${diceResult.modifier > 0 ? '+' : ''}${diceResult.modifier}` : ''}
                </div>
              </div>
            {/if}
          {/if}
        </div>
      {:else if activeTab === 'inventaire'}
        <!-- TAB: INVENTAIRE -->
        <div>
          <h2 class="text-sm font-bold mb-4">ÉQUIPEMENT</h2>

          <div class="grid grid-cols-3 gap-3 mb-6">
            {#each EQUIP_SLOTS as [slot, slotLabel, icon]}
              {@const slotData = (isEditing && editSheet ? editSheet.equipment?.[slot] : view.equipment?.[slot]) ?? {}}
              <div class="equip-slot bg-[#1a1e27] rounded-lg p-3 cursor-pointer hover:bg-[#232836] transition-colors">
                <div
                  onclick={() => (openSlot = openSlot === slot ? null : slot)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => e.key === 'Enter' && (openSlot = openSlot === slot ? null : slot)}
                >
                  <div class="flex items-center gap-3">
                    <span class="text-xl text-[#9ba5b7]">{icon}</span>
                    <div class="min-w-0">
                      <div class="text-xs font-bold truncate">{slotData?.nom || slotLabel}</div>
                      <div class="text-[9px] font-semibold text-[#9ba5b7]">{equipSummary(slot, slotData)}</div>
                    </div>
                    <div class="ml-auto text-xs font-bold">›</div>
                  </div>
                  {#if openSlot !== slot}
                    <div class="text-[9px] text-[#9ba5b7] mt-2 line-clamp-2">
                      {stripHtml(slotData?.description) || '—'}
                    </div>
                  {/if}
                </div>
                {#if openSlot === slot}
                  <div class="mt-2 space-y-2 border-t border-[#353d4c] pt-2">
                    {#each Object.entries(slotData) as [field, value]}
                      {#if isEditing || (value !== '' && value != null)}
                        <div>
                          <label class="block text-[8px] font-bold text-[#9ba5b7] mb-0.5 capitalize">{field}</label>
                          {#if isEditing}
                            {#if field === 'description' || field === 'enchantement'}
                              <textarea
                                bind:value={editSheet.equipment[slot][field]}
                                class="w-full px-2 py-1 bg-[#0b0e13] border border-[#353d4c] rounded text-[10px] focus:outline-none focus:border-[#49387a]"
                                rows="2"
                              ></textarea>
                            {:else}
                              <input
                                type="text"
                                bind:value={editSheet.equipment[slot][field]}
                                class="w-full px-2 py-1 bg-[#0b0e13] border border-[#353d4c] rounded text-[10px] focus:outline-none focus:border-[#49387a]"
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

          <div class="flex items-center justify-between mb-3">
            <h2 class="text-xs font-bold">INVENTAIRE</h2>
            {#if isEditing}
              <button
                onclick={() => {
                  editSheet.inventoryItems = [...(editSheet.inventoryItems || []), { type: 'Divers', name: '', description: '' }];
                }}
                class="px-3 py-1 bg-[#49387a] rounded-full text-[10px] font-semibold hover:opacity-85 transition-opacity"
              >
                + Ajouter un objet
              </button>
            {/if}
          </div>

          {#if (isEditing && editSheet ? editSheet.inventoryItems : view.inventoryItems)?.length}
            {#each inventoryGroups(isEditing && editSheet ? editSheet.inventoryItems : view.inventoryItems) as [type, items], groupIndex}
              <div class="bg-[#1a1e27] rounded-md px-3 py-2.5 flex items-center gap-3 {groupIndex > 0 ? 'mt-2' : ''}">
                <span class="text-[8px] font-bold text-[#9ba5b7] w-20 uppercase">{type}</span>
                <span class="text-[9px] font-medium text-[#9ba5b7] truncate">{itemFamilies(items)}</span>
              </div>
              {#each items as item}
                {#if isEditing}
                  <div class="bg-[#1a1e27] rounded-md px-3 py-2.5 space-y-2">
                    {#each Object.entries(item ?? {}).filter(([field]) => field !== 'equipmentData') as [field, value]}
                      <div class="flex items-center gap-2">
                        <label class="text-[8px] font-bold text-[#9ba5b7] w-24 shrink-0 capitalize">{field}</label>
                        {#if field === 'description'}
                          <textarea
                            bind:value={item[field]}
                            class="flex-1 px-2 py-1 bg-[#0b0e13] border border-[#353d4c] rounded text-[10px] focus:outline-none focus:border-[#49387a]"
                            rows="2"
                          ></textarea>
                        {:else}
                          <input
                            type="text"
                            bind:value={item[field]}
                            class="flex-1 px-2 py-1 bg-[#0b0e13] border border-[#353d4c] rounded text-[10px] focus:outline-none focus:border-[#49387a]"
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
                  <div class="bg-[#1a1e27] rounded-md px-3 py-2.5 flex items-center">
                    <span class="text-xs font-semibold flex-1 truncate">{item?.name || '—'}</span>
                    <span class="text-xs font-bold w-12 text-center">{itemCenterValue(item)}</span>
                    <span class="text-[9px] text-[#9ba5b7] w-52 text-right truncate">{itemNotes(item)}</span>
                  </div>
                {/if}
              {/each}
            {/each}
          {:else}
            <div class="text-[10px] text-[#9ba5b7]">Aucun objet dans l'inventaire.</div>
          {/if}

          <!-- Weapons -->
          <div class="flex items-center justify-between mt-6 mb-3">
            <h2 class="text-xs font-bold">ARMES</h2>
            {#if isEditing}
              <button
                onclick={() => {
                  editSheet.weapons = [...(editSheet.weapons || []), {
                    nom: '', de: '', forceAgi: '', critique: '', avantage: '',
                    bonus: '', perfection: '', notes: '', equipped: false
                  }];
                }}
                class="px-3 py-1 bg-[#49387a] rounded-full text-[10px] font-semibold hover:opacity-85 transition-opacity"
              >
                + Ajouter une arme
              </button>
            {/if}
          </div>
          {#each (isEditing && editSheet ? editSheet.weapons : view.weapons) || [] as weapon, i}
            {#if isEditing || weapon?.nom}
              {@const weaponFields = Object.entries(weapon ?? {}).filter(([field]) => field !== 'nom' && field !== 'equipped')}
              <div class="bg-[#1a1e27] rounded-lg p-3 mb-2">
                <div class="flex items-center gap-3 mb-2">
                  {#if isEditing}
                    <label class="flex items-center gap-2 text-[10px] text-[#9ba5b7]">
                      <input type="checkbox" bind:checked={editSheet.weapons[i].equipped} class="w-3.5 h-3.5 accent-[#49387a]" />
                      Équipée
                    </label>
                    <input
                      type="text"
                      placeholder="Nom de l'arme"
                      bind:value={editSheet.weapons[i].nom}
                      class="flex-1 px-2 py-1 bg-[#0b0e13] border border-[#353d4c] rounded text-xs font-bold focus:outline-none focus:border-[#49387a]"
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
                      <span class="px-2 py-0.5 bg-[#49387a] text-[9px] font-semibold rounded">Équipée</span>
                    {/if}
                    <span class="text-xs font-bold truncate">{weapon?.nom || 'Sans nom'}</span>
                    {#if weapon?.de}
                      <span class="ml-auto text-xs font-bold">{weapon.de}</span>
                    {/if}
                  {/if}
                </div>
                {#if isEditing}
                  <div class="grid grid-cols-3 gap-2">
                    {#each weaponFields as [field, value]}
                      <div>
                        <label class="block text-[8px] font-bold text-[#9ba5b7] mb-0.5 capitalize">{field}</label>
                        {#if field === 'notes'}
                          <textarea
                            bind:value={editSheet.weapons[i][field]}
                            class="w-full px-2 py-1 bg-[#0b0e13] border border-[#353d4c] rounded text-[10px] focus:outline-none focus:border-[#49387a]"
                            rows="2"
                          ></textarea>
                        {:else}
                          <input
                            type="text"
                            bind:value={editSheet.weapons[i][field]}
                            class="w-full px-2 py-1 bg-[#0b0e13] border border-[#353d4c] rounded text-[10px] focus:outline-none focus:border-[#49387a]"
                          />
                        {/if}
                      </div>
                    {/each}
                  </div>
                {:else}
                  <div class="text-[9px] text-[#9ba5b7] truncate">
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
          <h2 class="text-sm font-bold mb-4">ASPECTS NARRATIFS</h2>
          <div class="grid grid-cols-2 gap-3">
            {#each NARRATIVE_FIELDS as [field, label]}
              <div class="narrative-card bg-[#1a1e27] rounded-lg p-3 border border-transparent hover:border-[#49387a] transition-colors">
                <div class="text-[9px] font-bold text-[#9ba5b7] mb-2">{label}</div>
                {#if isEditing}
                  <textarea
                    bind:value={editSheet.narrative[field]}
                    class="w-full px-2 py-1 bg-[#0b0e13] border border-[#353d4c] rounded text-[10px] focus:outline-none focus:border-[#49387a]"
                    rows="4"
                  ></textarea>
                {:else}
                  <div class="text-[10px] leading-relaxed {expandedNarrative[field] ? '' : 'line-clamp-4'} whitespace-pre-wrap">
                    {view.narrative?.[field] || '—'}
                  </div>
                  <div class="text-right mt-2">
                    <button
                      onclick={() => (expandedNarrative[field] = !expandedNarrative[field])}
                      class="text-[9px] font-semibold text-[#9ba5b7] hover:text-[#eff2f9] transition-colors"
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
          <div class="flex gap-2 mb-5 mt-2">
            <span class="px-3 py-1 bg-[#1a1e27] rounded-full text-[10px] font-semibold">
              XP dépensés {view.progression?.xpDepenses ?? 0}
            </span>
            <span class="px-3 py-1 bg-[#1a1e27] rounded-full text-[10px] font-semibold">
              XP disponibles {view.progression?.xpDisponibles ?? 0}
            </span>
          </div>

          {#each MASTERY_BLOCKS as [key, dataKey, label]}
            <div class="bg-[#1a1e27] rounded-lg p-4 mb-3">
              <div class="text-[10px] font-bold text-[#9ba5b7] mb-3">{label}</div>
              {#if isEditing}
                <textarea
                  bind:value={masteryText[key]}
                  placeholder="Un élément par ligne"
                  class="w-full px-3 py-2 bg-[#0b0e13] border border-[#353d4c] rounded text-[10px] focus:outline-none focus:border-[#49387a]"
                  rows="3"
                ></textarea>
                <div class="text-[9px] text-[#9ba5b7] mt-1">Un élément par ligne.</div>
              {:else}
                <div class="flex gap-3 flex-wrap">
                  {#each masteryItems(key) as item}
                    <span class="pill px-4 py-1.5 bg-[#49387a] rounded-full text-[10px] font-semibold">{item}</span>
                  {/each}
                  {#if !masteryItems(key).length}
                    <span class="pill px-4 py-1.5 bg-[#13161e] rounded-full text-[10px] font-semibold text-[#9ba5b7]">Aucun</span>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {:else if activeTab === 'notes'}
        <!-- TAB: NOTES -->
        <div>
          <h2 class="text-sm font-bold mb-4">NOTES</h2>

          <!-- Toolbar -->
          <div class="bg-[#1a1e27] rounded-md px-2 py-2 flex gap-2 mb-4 flex-wrap">
            <button
              onclick={() => wrapNotesSelection('**', '**')}
              title="Gras (autour de la sélection)"
              class="px-4 py-1 bg-[#49387a] rounded-full text-[10px] font-semibold hover:opacity-85 transition-opacity"
            >
              B
            </button>
            <button
              onclick={() => wrapNotesSelection('__', '__')}
              title="Souligné (autour de la sélection)"
              class="px-4 py-1 bg-[#49387a] rounded-full text-[10px] font-semibold hover:opacity-85 transition-opacity"
            >
              U
            </button>
            <button
              title="Taille du texte — non implémenté"
              class="px-4 py-1 bg-[#13161e] rounded-full text-[10px] font-semibold text-[#9ba5b7] cursor-default"
            >
              T-
            </button>
            <button
              title="Taille du texte — non implémenté"
              class="px-4 py-1 bg-[#13161e] rounded-full text-[10px] font-semibold text-[#9ba5b7] cursor-default"
            >
              T+
            </button>
            <button
              onclick={() => prefixNotesLines('• ')}
              title="Liste à puces"
              class="px-3 py-1 bg-[#13161e] rounded-full text-[10px] font-semibold hover:opacity-85 transition-opacity"
            >
              • Liste
            </button>
            <button
              onclick={() => prefixNotesLines('☐ ')}
              title="Case à cocher"
              class="px-3 py-1 bg-[#13161e] rounded-full text-[10px] font-semibold hover:opacity-85 transition-opacity"
            >
              ☐
            </button>
            <button
              onclick={() => insertNotesText('— ')}
              title="Insérer un tiret"
              class="px-3 py-1 bg-[#13161e] rounded-full text-[10px] font-semibold hover:opacity-85 transition-opacity"
            >
              —
            </button>
          </div>

          <!-- Editor -->
          <div class="bg-[#1a1e27] rounded-lg p-4 min-h-[400px]">
            <div class="text-lg font-bold mb-3">Notes de session</div>
            {#if isEditing}
              <textarea
                bind:this={notesArea}
                bind:value={editSheet.notes}
                class="w-full min-h-[300px] px-3 py-2 bg-[#0b0e13] border border-[#353d4c] rounded text-xs leading-relaxed focus:outline-none focus:border-[#49387a]"
                placeholder="Écriture libre — notes de session"
              ></textarea>
            {:else}
              <div class="text-xs leading-relaxed whitespace-pre-wrap min-h-[280px]">
                {view.notes || 'Aucune note pour le moment.'}
              </div>
            {/if}
            <div class="text-[9px] font-medium text-[#9ba5b7] mt-8 pt-3 border-t border-[#353d4c]">
              Écriture libre — gras — souligné — taille du texte — listes
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- ═══ BOTTOM NAV ═══ -->
    <div class="h-16 bg-[#13161e] flex items-center gap-1.5 px-2 shrink-0">
      {#each TABS as tab}
        <button
          onclick={() => (activeTab = tab.id)}
          class="flex-1 h-11 rounded-md text-[9px] font-semibold transition-colors {activeTab === tab.id
            ? 'bg-[#49387a] text-[#eff2f9]'
            : 'bg-[#1a1e27] text-[#9ba5b7] hover:bg-[#232836]'}"
        >
          {tab.label}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Unsaved Changes Modal -->
  {#if showUnsavedModal}
    <div class="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
      <div class="bg-[#13161e] border border-[#353d4c] rounded-lg p-6 max-w-md">
        <h3 class="text-lg font-bold mb-4">Modifications non sauvegardées</h3>
        <p class="text-[#9ba5b7] text-sm mb-6">
          Vous avez des modifications non sauvegardées. Voulez-vous sauvegarder avant de continuer ?
        </p>
        <div class="flex gap-3">
          <button
            onclick={discardAndContinue}
            class="flex-1 px-4 py-2 bg-[#1a1e27] hover:bg-[#232836] text-xs font-semibold rounded-lg transition-colors"
          >
            Ignorer
          </button>
          <button
            onclick={confirmSaveAndContinue}
            class="flex-1 px-4 py-2 bg-[#49387a] hover:opacity-85 text-xs font-semibold rounded-lg transition-opacity"
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
      <div class="bg-[#13161e] border border-[#353d4c] rounded-lg p-6 max-w-md">
        <h3 class="text-lg font-bold mb-4">Confirmer la suppression</h3>
        <p class="text-[#9ba5b7] text-sm mb-6">
          Êtes-vous sûr de vouloir supprimer cette fiche de personnage ? Cette action est irréversible.
        </p>
        <div class="flex gap-3">
          <button
            onclick={() => (showDeleteConfirm = false)}
            class="flex-1 px-4 py-2 bg-[#1a1e27] hover:bg-[#232836] text-xs font-semibold rounded-lg transition-colors"
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
    background: #353d4c;
    border-radius: 2px;
  }
  .scrollbar-thin::-webkit-scrollbar-thumb {
    background: #9ba5b7;
    border-radius: 2px;
  }
</style>
