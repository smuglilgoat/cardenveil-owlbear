<script>
  import { onMount, tick } from 'svelte';
  import OBR from '@owlbear-rodeo/sdk';
  import { tooltip } from './tooltip.js';
  import ActionDiamonds from './ActionDiamonds.svelte';
  import { importSheetArchive } from './sheetAssets.js';
  import { RACES } from './deck.js';
  import {
    STAT_COLORS,
    STAT_LABELS,
    SKILL_GROUPS,
    SKILL_LABELS,
    colorLabel,
    capacityType,
    sanitizeHtml,
    handSlots,
    equipWeapon,
    itemFields,
    itemFieldsFor,
    FAMILY_ICONS,
    ITEM_ICONS,
    normalizeItemType,
    syncSlotsFromItems,
    slotDataFromItem,
    SUIT_LABELS,
    SUIT_SYMBOLS,
    FAMILY_SUMMARIES,
    unequipHand,
    isTwoHanded,
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
    skillRollModifier,
    subscribeToCharacterSheet,
    onSheetBroadcast,
    suitColor,
    suitSymbol,
    isImageUrl,
    EQUIPMENT_CATALOG,
    findEquipmentTemplate,
    itemTypeColor,
    ITEM_TYPE_OPTIONS,
    raceLabel,
    normalizeRaceName,
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
  let isImporting = $state(false);
  let showUnsavedModal = $state(false);
  let showDeleteConfirm = $state(false);
  let pendingAction = $state(null);
  let activeTab = $state('competences');
  let diceResult = $state(null);
  let expandedCapacity = $state(null); // capacity object shown in the expand modal
  let freeFormula = $state('');
  let importError = $state('');
  let expandedSlot = $state(null); // { kind: 'slot', slot } | { kind: 'hand', hand }
  let slotPickerOpen = $state(false);
  let expandedNarrative = $state({});
  let masteryText = $state({});
  let editTab = $state('identite'); // active tab inside the ÉDITION modal

  const TABS = [
    { id: 'competences', label: 'COMPÉTENCES' },
    { id: 'capacites', label: 'CAPACITÉS' },
    { id: 'inventaire', label: 'INVENTAIRE' },
    { id: 'narratif', label: 'NARRATIF' },
    { id: 'maitrises', label: 'MAÎTRISES' },
    { id: 'notes', label: 'NOTES' }
  ];

  // Edit-modal tab bar: identity and stats get their own tabs (not always visible)
  const EDIT_TABS = [{ id: 'identite', label: 'IDENTITÉ' }, { id: 'stats', label: 'STATS' }, ...TABS];

  const ALIGNEMENTS = [
    'Loyal Bon', 'Loyal Neutre', 'Loyal Mauvais',
    'Neutre Bon', 'Neutre Absolu', 'Neutre Mauvais',
    'Chaotique Bon', 'Chaotique Neutre', 'Chaotique Mauvais'
  ];
  const USAGE_OPTIONS = [
    'Action', 'Bonus action', 'Réaction', 'Concentration',
    'Action / Concentration', 'Bonus action / Concentration', 'Réaction / Concentration'
  ];
  const SAVE_OPTIONS = [
    'X',
    ...SKILL_LABELS ? Object.entries(SKILL_LABELS).flatMap(([, label]) => [`${label} (Aucun effet)`, `${label} (Moitié dégâts)`]) : []
  ];
  const INCANTATION_OPTIONS = ['', 'Force', 'Agilité', 'Esprit', 'Social'];

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

      // Subscribe to realtime updates + same-origin instant broadcasts
      const unsubscribe = subscribeToCharacterSheet(playerId, roomId, (newData) => {
        if (newData && !isEditing) {
          sheet = newData.data;
        }
      });
      const offBroadcast = onSheetBroadcast((msg) => {
        if (msg?.playerId === playerId && msg?.roomId === roomId && msg?.data && !isEditing) {
          sheet = msg.data;
        }
      });

      return () => {
        unsubscribe();
        offBroadcast();
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
    editSheet.inventoryItems = (editSheet.inventoryItems ?? []).map((i) =>
      i?.type === 'Armure' ? { ...i, type: 'Équipement' } : i
    );
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
      editSheet = syncStatsFromEquipment(syncSlotsFromItems(syncSkillBonuses(editSheet)));
      await saveCharacterSheet(playerId, roomId, editSheet);
      sheet = editSheet;
      editSheet = null;
      isEditing = false;
      syncRaceToGameState(sheet?.identity?.race);
    } catch (err) {
      console.error('Failed to save:', err);
      alert('Erreur lors de la sauvegarde: ' + err.message);
    } finally {
      isSaving = false;
    }
  }

  // Reflect a recognized sheet race into game state (SET_RACE allows self-assign)
  function syncRaceToGameState(race) {
    const raceId = normalizeRaceName(race);
    if (!RACES.some((r) => r.id === raceId)) return;
    if (gameState?.players?.[playerId]?.race === raceId) return;
    onAction({ type: 'SET_RACE', playerId, targetId: playerId, race: raceId });
  }

  async function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.zip';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      isImporting = true;
      try {
        importError = '';
        const imported = file.name.toLowerCase().endsWith('.zip')
          ? await importSheetArchive(playerId, roomId, await file.arrayBuffer())
          : await importCharacterSheet(playerId, roomId, await file.text());
        sheet = imported.data;
        isEditing = false;
        editSheet = null;
        syncRaceToGameState(sheet?.identity?.race);
      } catch (err) {
        importError = err.message;
        console.error('Import failed:', err);
      } finally {
        isImporting = false;
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
    const mod = skillRollModifier(view.stats, skillKey, view.skills?.[skillKey]);
    const label = SKILL_LABELS[skillKey] || skillKey;
    checkUnsavedChanges(() => handleDiceRoll(label, `d20${mod >= 0 ? '+' + mod : mod}`));
  }

  function handleStatRoll(stat) {
    const mod = getStatModifier(stat);
    checkUnsavedChanges(() => handleDiceRoll(STAT_LABELS[stat] || stat, `d20${mod >= 0 ? '+' + mod : mod}`));
  }

  // Derived combat rolls: initiative and volonté both roll d20 + their value
  function handleInitiativeRoll() {
    checkUnsavedChanges(() => handleDiceRoll('Initiative', `d20${formatModifier(calc.initiative)}`));
  }

  function handleVolonteRoll() {
    checkUnsavedChanges(() => handleDiceRoll('Volonté', `d20${formatModifier(calc.volonte)}`));
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

  function itemCenterValue(item) {
    if (item?.degats) return item.degats;
    const quantity = item?.quantite ?? item?.quantity;
    return quantity != null && quantity !== '' ? `x${quantity}` : '';
  }

  // ─── Paper-doll equipment slots ───
  function slotStatChip(data) {
    for (const [field, label] of [['deflexion', 'DEF'], ['armure', 'ARM'], ['volonte', 'VOL'], ['initiative', 'INIT'], ['vitesse', 'VIT']]) {
      const v = toNumber(data?.[field]);
      if (v) return `+${v} ${label}`;
    }
    return '';
  }

  function slotGlance(label, data) {
    if (!data?.nom) return `${label} — vide`;
    const chip = slotStatChip(data);
    return `${data.nom}${chip ? ` · ${chip}` : ''}`;
  }

  function handGlance(hand, weapon, two) {
    if (!weapon) return hand === 'main' ? 'Main principale — vide' : 'Main secondaire — vide';
    const bonus = formatModifier(attackBonus(weapon, view?.stats ?? {}));
    return `${weapon.nom} · ${weapon.de || '—'} · ${bonus}${two ? ' · à deux mains' : ''}`;
  }

  function saveSheet(next) {
    sheet = next;
    saveCharacterSheet(playerId, roomId, next).catch(console.error);
  }

  // ─── Inline notes editing (NOTES tab, no ÉDITION needed) ───
  let notesDraft = $state('');
  let notesDraftDirty = $state(false);

  // Follow external sheet updates until the user types; after a save the
  // broadcast/realtime update re-syncs the draft to the stored value.
  $effect(() => {
    if (view && !notesDraftDirty) notesDraft = view.notes ?? '';
  });

  function saveNotes() {
    notesDraftDirty = false;
    saveSheet({ ...sheet, notes: notesDraft });
  }

  function applySlotItem(slot, item) {
    // slot object built from the item's own stat fields; mark the item as
    // occupying the slot so ÉDITION shows (and edits) its stat fields
    const items = (sheet?.inventoryItems ?? []).map((i) =>
      i === item || (item?.name && i?.name === item.name) ? { ...i, slot } : i
    );
    saveSheet({
      ...sheet,
      inventoryItems: items,
      equipment: { ...(sheet?.equipment ?? {}), [slot]: slotDataFromItem(item) },
    });
  }

  // Weapon items: slot = main/off equips the matching weapon; any other value unequips it
  function syncItemSlot(item, slot) {
    if (item?.type !== 'Arme') return;
    const name = item?.weaponName || item?.name;
    const weapons = editSheet.weapons ?? [];
    const weapon = weapons.find((w) => w?.nom === name);
    if (!weapon) return;
    if (slot === 'main' || slot === 'off') {
      editSheet.weapons = equipWeapon({ ...editSheet, weapons: [...weapons] }, weapon, slot).weapons;
    } else {
      editSheet.weapons = weapons.map((w) => (w?.nom === name && w?.equipped ? { ...w, equipped: false, hand: null } : w));
    }
  }

  function clearEquipmentSlot(slot) {
    const occupant = (view?.equipment?.[slot] ?? {}).nom;
    const items = (sheet?.inventoryItems ?? []).map((i) =>
      i?.slot === slot && i?.name === occupant ? { ...i, slot: '' } : i
    );
    saveSheet({
      ...sheet,
      inventoryItems: items,
      equipment: { ...(sheet?.equipment ?? {}), [slot]: {} },
    });
  }

  // Possessed items eligible for a slot: import-mapped items first, then Armure/Équipement types
  function slotCandidates(slot) {
    return (view.inventoryItems ?? []).filter(
      (i) => i?.slot === slot && (i?.equipmentData || i?.name || i?.nom)
    );
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

  // ─── Custom saved rolls (free-form formulas pinned to the sheet) ───
  function saveCustomRoll() {
    const formula = (freeFormula || '').trim();
    if (!formula || !isDiceFormula(formula, view?.stats ?? {})) return;
    const name = (prompt('Nom du lancer personnalisé :', formula) || '').trim() || formula;
    const rolls = (sheet?.customRolls ?? []).filter((r) => r.formula !== formula);
    const next = { ...sheet, customRolls: [...rolls, { name, formula }] };
    sheet = next;
    saveCharacterSheet(playerId, roomId, next).catch(console.error);
  }

  function removeCustomRoll(formula) {
    const next = { ...sheet, customRolls: (sheet?.customRolls ?? []).filter((r) => r.formula !== formula) };
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
    <div class="flex-1 flex items-center justify-center text-[#9ca3af] text-[15px]">
      Chargement de la fiche de personnage...
    </div>
  {:else}
    <!-- ═══ TOP BAR ═══ -->
    <div class="h-10 bg-[#1f2937] flex items-center px-3 shrink-0">
      <span class="text-sm font-bold tracking-wide">CARDENVEIL</span>
      <span class="text-xs font-medium text-[#9ca3af] ml-4 truncate hidden @2xl:block">
        {view.identity?.nom || '—'} · {raceLabel(view.identity?.race) || '—'} · Niveau {view.identity?.niveau ?? 1}
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

    {#if isImporting}
      <div class="fixed inset-0 z-[80] bg-black/60 flex flex-col items-center justify-center gap-3">
        <div class="w-8 h-8 rounded-full border-2 border-[#4b5563] border-t-indigo-400 animate-spin"></div>
        <div class="text-[13px] font-semibold text-[#9ca3af]">Import de la fiche en cours…</div>
      </div>
    {/if}

    {#if importError}
      <div class="bg-red-950 border-b border-red-800 px-3 py-2 text-red-200 text-[13px]">
        Erreur d'import : {importError}
      </div>
    {/if}

    <!-- ═══ CHARACTER HEADER (compact ~20%; display-only, edited via ÉDITION) ═══ -->
    <div class="px-3 pt-2 pb-1.5 shrink-0">
      <!-- Identity row -->
      <div class="flex items-center gap-2">
        <div class="w-10 h-10 bg-[#111827] rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
          {#if view.portrait && isImageUrl(view.portrait)}
            <img src={view.portrait} alt="Portrait" class="w-full h-full object-cover" />
          {:else if view.portrait}
            <span class="text-[20px] leading-none">{view.portrait}</span>
          {:else}
            <span class="text-[8px] font-bold text-[#9ca3af]">PORTRAIT</span>
          {/if}
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-[18px] font-bold leading-tight truncate">{view.identity?.nom || 'Sans nom'}</div>
          <div class="text-[10px] font-medium text-[#9ca3af] truncate">
            {raceLabel(view.identity?.race) || '—'} · {view.identity?.alignement || '—'} · Niv. {view.identity?.niveau ?? 1} · XP {view.progression?.xpDepenses ?? 0}/{view.progression?.xpDisponibles ?? 0}
          </div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-[9px] font-bold text-[#9ca3af] leading-none">PV</div>
          <div class="text-[20px] font-bold leading-none mt-0.5">
            {toNumber(view.derived?.pvActuels)}<span class="text-[11px] text-[#9ca3af] font-semibold">/{toNumber(view.derived?.pvMax)}</span>
          </div>
          <div class="text-[9px] text-[#9ca3af] leading-none mt-0.5">
            T{view.derived?.pvTemporaires || 0} · F{toNumber(view.derived?.fatigue) || 0}
          </div>
        </div>
      </div>

      <!-- Stats row (click = d20 roll) -->
      <div class="grid grid-cols-4 gap-1 mt-1.5">
        {#each ['force', 'agilite', 'esprit', 'social'] as stat}
          {@const statLabel = STAT_LABELS[stat]}
          <div
            onclick={() => handleStatRoll(stat)}
            onkeydown={(e) => e.key === 'Enter' && handleStatRoll(stat)}
            role="button"
            tabindex="0"
            use:tooltip={`Jet de ${statLabel} (d20) · Compétences : ${SKILL_GROUPS.find((g) => g.stat === stat)?.skills.map((sk) => SKILL_LABELS[sk] || sk).join(', ') || '—'}`}
            class="bg-[#111827] rounded-md px-1.5 py-1 cursor-pointer hover:bg-[#1f2937] transition-colors text-center"
          >
            <div class="text-[8px] font-bold text-[#9ca3af] leading-none">{statLabel.toUpperCase()}</div>
            <div class="mt-0.5 leading-none">
              <span class="text-[15px] font-bold" style="color: {STAT_COLORS[stat]}">{toNumber(view.stats?.[stat])}</span>
              <span class="text-[12px] font-bold">{formatModifier(getStatModifier(stat))}</span>
            </div>
          </div>
        {/each}
      </div>

      <!-- Combat row -->
      <div class="grid grid-cols-8 gap-1 mt-1">
        <div title={`Parade = ${calc.deflexion} déflexion + ${calc.garde} garde + ${calc.paradeBonus} mod`} class="bg-[#111827] rounded-md px-1 py-1 text-center">
          <div class="text-[8px] font-bold text-[#9ca3af] leading-none">PARADE</div>
          <div class="text-[14px] font-bold leading-none mt-0.5">{calc.parade}</div>
        </div>
        <div
          onclick={handleInitiativeRoll}
          onkeydown={(e) => e.key === 'Enter' && handleInitiativeRoll()}
          role="button"
          tabindex="0"
          title={`Jet d'initiative (d20) = Agi − 10 + gantelets`}
          class="bg-[#111827] rounded-md px-1 py-1 text-center cursor-pointer hover:bg-[#1f2937] transition-colors"
        >
          <div class="text-[8px] font-bold text-[#9ca3af] leading-none">INIT</div>
          <div class="text-[14px] font-bold leading-none mt-0.5" style="color: {STAT_COLORS.agilite}">{calc.initiative}</div>
        </div>
        <div title="Armure (équipement)" class="bg-[#111827] rounded-md px-1 py-1 text-center">
          <div class="text-[8px] font-bold text-[#9ca3af] leading-none">ARMURE</div>
          <div class="text-[14px] font-bold leading-none mt-0.5">{calc.armure}</div>
        </div>
        <div title={`Mouvement = 5 + Agi/2 + bottes`} class="bg-[#111827] rounded-md px-1 py-1 text-center">
          <div class="text-[8px] font-bold text-[#9ca3af] leading-none">VITESSE</div>
          <div class="text-[14px] font-bold leading-none mt-0.5">{calc.mouvement}<span class="text-[9px] font-bold text-[#9ca3af]">m</span></div>
        </div>
        <div title={`Seuil miss = max(1, 1 − mod Agi)`} class="bg-[#111827] rounded-md px-1 py-1 text-center">
          <div class="text-[8px] font-bold text-[#9ca3af] leading-none">MISS</div>
          <div class="text-[14px] font-bold leading-none mt-0.5">{calc.seuilMiss}</div>
        </div>
        <div title={`Bonus attaque = stat + tier de l'arme`} class="bg-[#111827] rounded-md px-1 py-1 text-center">
          <div class="text-[8px] font-bold text-[#9ca3af] leading-none">BNS</div>
          <div class="text-[14px] font-bold leading-none mt-0.5">{formatModifier(calc.bonusAttaque)}</div>
        </div>
        <div title={`Canalisation = mod Esprit`} class="bg-[#111827] rounded-md px-1 py-1 text-center">
          <div class="text-[8px] font-bold text-[#9ca3af] leading-none">CANAL</div>
          <div class="text-[14px] font-bold leading-none mt-0.5">{formatModifier(calc.canalisation)}</div>
        </div>
        <div
          onclick={handleVolonteRoll}
          onkeydown={(e) => e.key === 'Enter' && handleVolonteRoll()}
          role="button"
          tabindex="0"
          title={`Jet de volonté (d20) = mod Résilience + casque`}
          class="bg-[#111827] rounded-md px-1 py-1 text-center cursor-pointer hover:bg-[#1f2937] transition-colors"
        >
          <div class="text-[8px] font-bold text-[#9ca3af] leading-none">VOLONTÉ</div>
          <div class="text-[14px] font-bold leading-none mt-0.5">{calc.volonte}</div>
        </div>
      </div>

      <button
        onclick={() => (activeTab = 'capacites')}
        class="w-full mt-1.5 bg-indigo-600 rounded-md px-2.5 py-1 flex items-center justify-between hover:bg-indigo-500 transition-colors text-left"
      >
        <span class="text-[11px] font-bold truncate">TOTEM &nbsp;{view.totem?.nom || '—'}</span>
        <span class="text-[10px] font-medium text-indigo-200 shrink-0">Voir effet →</span>
      </button>
    </div>

    <!-- ═══ CONTENT VIEWPORT ═══ -->
    <div class="flex-1 min-h-0 bg-[#1f2937] rounded-[10px] mx-2 @2xl:mx-4 overflow-y-auto scrollbar-thin p-3 @2xl:p-4">
      {#if activeTab === 'competences'}
        <!-- TAB: COMPÉTENCES -->
        <div>
          <h2 class="text-[15px] font-bold mb-1">COMPÉTENCES</h2>
          <p class="text-[11px] text-[#9ca3af] mb-3">
            Cliquer sur une compétence lance un jet d20 + modificateur — 📌 épingler en favori
          </p>
          <div class="grid grid-cols-1 @2xl:grid-cols-2 gap-x-6 gap-y-4">
            {#each SKILL_GROUPS as group}
              <div>
                <div class="text-[12px] font-bold mb-1.5" style="color: {STAT_COLORS[group.stat]}">
                  {group.label}
                </div>
                <div class="space-y-1">
                  {#each group.skills as skillKey}
                    {@const mod = skillRollModifier(view.stats, skillKey, view.skills?.[skillKey])}
                    {@const pinned = isPinned(view.pinnedSkills, skillKey)}
                    <div
                      class="skill-row flex items-center gap-2 bg-[#111827] rounded-md px-2.5 py-2 cursor-pointer hover:bg-[#374151] transition-colors"
                      onclick={() => handleSkillRoll(skillKey)}
                      role="button"
                      tabindex="0"
                      onkeydown={(e) => e.key === 'Enter' && handleSkillRoll(skillKey)}
                    >
                      <div class="w-1 h-5 rounded-full shrink-0" style="background: {STAT_COLORS[group.stat]}"></div>
                      <span class="text-[12px] font-medium truncate flex-1">
                        {SKILL_LABELS[skillKey]} {formatModifier(mod)}
                        {#if view.skills?.[skillKey]?.trained}
                          <span class="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 align-middle ml-0.5" title="Maîtrisée — modificateur doublé"></span>
                        {/if}
                      </span>
                      <button
                        onclick={(e) => {
                          e.stopPropagation();
                          togglePin('pinnedSkills', skillKey);
                        }}
                        title={pinned ? 'Retirer des favoris' : 'Épingler en favori'}
                        class="text-[12px] leading-none shrink-0 transition-opacity {pinned
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
          <h2 class="text-[15px] font-bold mb-1">CAPACITÉS</h2>
          <p class="text-[11px] text-[#9ca3af] mb-3">
            La valeur en dés est l'élément automatisable et cliquable.
          </p>

          <!-- Totem effect on top of the tab -->
          <div class="bg-[#111827] rounded-lg p-3 mb-3">
            <div class="text-[11px] font-bold text-[#9ca3af] mb-2.5">TOTEM</div>
            <div class="flex gap-3 items-start">
              <div class="w-14 h-14 bg-[#1f2937] rounded-md flex items-center justify-center shrink-0 overflow-hidden">
                {#if view.totem?.image && isImageUrl(view.totem.image)}
                  <img src={view.totem.image} alt="Totem" class="w-full h-full object-cover" />
                {:else if view.totem?.image}
                  <span class="text-[26px] leading-none">{view.totem.image}</span>
                {:else}
                  <span class="text-[22px] text-[#4b5563]">◈</span>
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-[13px] font-bold">{view.totem?.nom || '—'}</div>
                <div class="rich-html text-[11px] text-[#9ca3af] whitespace-pre-wrap mt-1">{@html sanitizeHtml(view.totem?.description) || '—'}</div>
              </div>
            </div>
          </div>

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
              class="flex-1 min-w-0 px-3 py-2 bg-[#111827] border border-[#374151] rounded-lg text-[13px] focus:outline-none focus:border-indigo-500"
            />
            <button
              onclick={() => handleDiceRoll('Lancer libre', freeFormula)}
              class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-[13px] font-bold rounded-lg transition-colors whitespace-nowrap"
            >
              Lancer
            </button>
            <button
              onclick={saveCustomRoll}
              title="Sauver ce lancer en favori"
              class="px-3 py-2 bg-[#111827] border border-[#374151] hover:bg-[#374151] text-[13px] font-bold rounded-lg transition-colors whitespace-nowrap"
            >
              📌
            </button>
          </div>

          {#if (view.customRolls ?? []).length}
            <div class="flex flex-wrap gap-1.5 mb-3">
              {#each view.customRolls ?? [] as roll}
                {#if roll?.formula}
                  <div class="flex items-center gap-1 bg-[#111827] rounded-md pl-2 pr-1 py-1">
                    <button
                      onclick={() => handleDiceRoll(roll.name || roll.formula, roll.formula)}
                      title={`Lancer ${roll.formula}`}
                      class="text-[11px] font-semibold hover:text-indigo-300 transition-colors"
                    >
                      {roll.name || roll.formula} <span class="text-[#9ca3af]">{roll.formula}</span>
                    </button>
                    <button
                      onclick={() => removeCustomRoll(roll.formula)}
                      title="Supprimer ce lancer"
                      class="text-[10px] text-[#6b7280] hover:text-red-400 leading-none"
                    >
                      ✕
                    </button>
                  </div>
                {/if}
              {/each}
            </div>
          {/if}

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
                      <span class="text-[26px] leading-none">{capacity.image}</span>
                    {:else}
                      <span class="text-[10px] font-bold text-[#9ca3af]">IMAGE</span>
                    {/if}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5">
                      <div class="text-[15px] font-bold truncate">{capacity.name || 'Sans nom'}</div>
                      {#if typeBadge}
                        <span
                          class="px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0"
                          style="color: {typeBadge.color}; background: {typeBadge.color}22"
                        >
                          {typeBadge.label}
                        </span>
                      {/if}
                    </div>
                    <div class="text-[11px] font-medium mt-0.5 truncate">
                      <span style="color: {suitColor(capacity.cost?.color)}">
                        {colorLabel(capacity.cost?.color)} {suitSymbol(capacity.cost?.color)}
                      </span>
                      <span class="text-[#9ca3af]"> · {capacity.usage || '—'}</span>
                    </div>
                    <div class="rich-html text-[12px] text-[#9ca3af] mt-1 line-clamp-2">{@html sanitizeHtml(capacity.description) || '—'}</div>
                  </div>
                  <!-- Cost: big, right-aligned -->
                  <div class="text-right shrink-0 pl-2">
                    <div class="text-[8px] font-bold text-[#9ca3af] leading-none">COÛT</div>
                    <div class="flex items-baseline justify-end gap-0.5 mt-0.5">
                      <div class="text-[26px] @2xl:text-[33px] font-bold leading-none">{capacity.cost?.total ?? 0}</div>
                      <span class="text-[20px] font-bold" style="color: {suitColor(capacity.cost?.color)}">{suitSymbol(capacity.cost?.color)}</span>
                    </div>
                  </div>
                </div>
                <!-- Actions row: full width, bottom -->
                <div class="flex items-center gap-1.5 mt-2 pt-2 border-t border-[#242424]">
                  {#if capacity.value?.main}
                    <button
                      onclick={() => isDiceFormula(capacity.value.main, view?.stats ?? {}) && handleDiceRoll(capacity.name || 'Capacité', capacity.value.main)}
                      disabled={!isDiceFormula(capacity.value.main, view?.stats ?? {})}
                      title={isDiceFormula(capacity.value.main, view?.stats ?? {}) ? `Lancer ${capacity.value.main}` : `Pas une formule de dés — valeur : ${capacity.value.main}`}
                      class="flex-1 min-w-0 px-2 h-8 @2xl:h-9 bg-slate-500 rounded-lg text-[15px] font-bold hover:bg-slate-400 transition-colors truncate disabled:opacity-50 disabled:cursor-default"
                    >
                      🎲 {capacity.value.main}
                    </button>
                  {:else}
                    <div class="flex-1"></div>
                  {/if}
                  {#if capacity.description && stripHtml(capacity.description).length > 120}
                    <button
                      onclick={() => (expandedCapacity = capacity)}
                      title="Afficher toute la capacité"
                      class="w-8 h-8 @2xl:h-9 shrink-0 rounded-lg bg-[#242424] border border-[#374151] text-[#9ca3af] hover:text-white text-[15px] font-bold flex items-center justify-center transition-colors"
                    >
                      +
                    </button>
                  {/if}
                  <button
                    onclick={() => togglePin('pinnedCapacities', pinKey)}
                    title={pinned ? 'Retirer des favoris' : 'Épingler en favori'}
                    class="w-8 h-8 @2xl:h-9 shrink-0 rounded-lg bg-[#242424] border border-[#374151] text-[12px] flex items-center justify-center transition-opacity {pinned
                      ? ''
                      : 'opacity-40 hover:opacity-100'}"
                  >
                    📌
                  </button>
                </div>
              </div>
            {/each}
          </div>

          {#if diceResult}
            {#if diceResult.error}
              <div class="mt-3 bg-red-950 border border-red-800 rounded-lg p-3">
                <div class="text-[13px] text-red-200">Formule invalide : {diceResult.error}</div>
              </div>
            {:else}
              <div class="mt-3 bg-indigo-600 border border-indigo-400 rounded-lg p-3">
                <div class="text-[13px] mb-1">Résultat du lancer ({diceResult.timestamp})</div>
                <div class="text-[26px] font-bold">{diceResult.total}</div>
                <div class="text-[11px] text-indigo-200 mt-1">
                  {diceResult.formula}: {(diceResult.rolls ?? []).join(', ')}{diceResult.modifier ? ` ${diceResult.modifier > 0 ? '+' : ''}${diceResult.modifier}` : ''}
                </div>
              </div>
            {/if}
          {/if}
        </div>
      {:else if activeTab === 'inventaire'}
        <!-- TAB: INVENTAIRE -->
        <div>
          <h2 class="text-[15px] font-bold mb-3">ÉQUIPEMENT</h2>

          <!-- Paper-doll: 7 armor slots + 2 hand slots -->
          {#if view}
            {@const hands = handSlots(view)}
          <div
            class="grid gap-1.5 mx-auto max-w-sm mb-1"
            style="grid-template-columns: repeat(3, 1fr); grid-template-areas: '. casque .' 'main plastron off' 'anneau cape amulette' '. gantelets .' '. bottes .';"
          >
            {#each EQUIP_SLOTS as [slot, slotLabel, icon]}
              {@const data = view.equipment?.[slot] ?? {}}
              {@const occupied = !!data?.nom}
              <div
                style="grid-area: {slot}"
                onclick={() => { expandedSlot = { kind: 'slot', slot }; slotPickerOpen = false; }}
                onkeydown={(e) => e.key === 'Enter' && (expandedSlot = { kind: 'slot', slot })}
                role="button"
                tabindex="0"
                use:tooltip={slotGlance(slotLabel, data)}
                class="rounded-lg p-2 text-center cursor-pointer transition-colors {occupied
                  ? 'bg-[#111827] hover:bg-[#374151]'
                  : 'border border-dashed border-[#374151] hover:border-[#6b7280]'}"
              >
                <div class="text-[18px] leading-none {occupied ? '' : 'opacity-40'}">{icon}</div>
                <div class="text-[8px] font-bold text-[#9ca3af] leading-none mt-1">{slotLabel.toUpperCase()}</div>
                {#if occupied}
                  <div class="text-[11px] font-bold leading-tight mt-0.5 truncate">{data.nom}</div>
                  {#if slotStatChip(data)}
                    <div class="text-[10px] font-bold text-indigo-300 leading-none mt-0.5">{slotStatChip(data)}</div>
                  {/if}
                {:else}
                  <div class="text-[10px] text-[#6b7280] leading-tight mt-0.5">vide</div>
                {/if}
              </div>
            {/each}

            <!-- Main hand -->
            <div
              style="grid-area: main"
              onclick={() => { expandedSlot = { kind: 'hand', hand: 'main' }; slotPickerOpen = false; }}
              onkeydown={(e) => e.key === 'Enter' && (expandedSlot = { kind: 'hand', hand: 'main' })}
              role="button"
              tabindex="0"
              use:tooltip={handGlance('main', hands.main, hands.twoHanded)}
              class="rounded-lg p-2 text-center cursor-pointer transition-colors {hands.main
                ? 'bg-[#111827] hover:bg-[#374151] border-l-4 border-[#f87171]'
                : 'border border-dashed border-[#374151] hover:border-[#6b7280]'}"
            >
              <div class="text-[18px] leading-none {hands.main ? '' : 'opacity-40'}">🗡</div>
              <div class="text-[8px] font-bold text-[#9ca3af] leading-none mt-1">PRINCIPALE</div>
              {#if hands.main}
                <div class="text-[11px] font-bold leading-tight mt-0.5 truncate">{hands.main.nom}</div>
                <div class="text-[10px] font-bold text-slate-300 leading-none mt-0.5">{hands.main.de || '—'}</div>
              {:else}
                <div class="text-[10px] text-[#6b7280] leading-tight mt-0.5">vide</div>
              {/if}
            </div>

            <!-- Off hand -->
            <div
              style="grid-area: off"
              onclick={() => { expandedSlot = { kind: 'hand', hand: hands.twoHanded ? 'main' : 'off' }; slotPickerOpen = false; }}
              onkeydown={(e) => e.key === 'Enter' && (expandedSlot = { kind: 'hand', hand: hands.twoHanded ? 'main' : 'off' })}
              role="button"
              tabindex="0"
              use:tooltip={hands.twoHanded
                ? `${hands.main.nom} — à deux mains (occupe les deux mains)`
                : handGlance('off', hands.off, false)}
              class="rounded-lg p-2 text-center transition-colors {hands.twoHanded || hands.off
                ? 'bg-[#111827] cursor-pointer hover:bg-[#374151] border-l-4 border-[#f87171]'
                : 'border border-dashed border-[#374151] hover:border-[#6b7280] cursor-pointer'}"
            >
              <div class="text-[18px] leading-none {hands.main ? '' : 'opacity-40'}">🗡</div>
              <div class="text-[8px] font-bold text-[#9ca3af] leading-none mt-1">SECONDAIRE</div>
              {#if hands.twoHanded}
                <div class="text-[11px] font-bold leading-tight mt-0.5 truncate opacity-60">{hands.main.nom}</div>
                <div class="text-[9px] font-bold text-[#6b7280] leading-none mt-0.5">occupée — 2M</div>
              {:else if hands.off}
                <div class="text-[11px] font-bold leading-tight mt-0.5 truncate">{hands.off.nom}</div>
                <div class="text-[10px] font-bold text-slate-300 leading-none mt-0.5">{hands.off.de || '—'}</div>
              {:else}
                <div class="text-[10px] text-[#6b7280] leading-tight mt-0.5">vide</div>
              {/if}
            </div>
          </div>
          <div class="text-[10px] text-[#6b7280] text-center mb-4">
            Survoler un emplacement : aperçu · Cliquer : détails et changement d'équipement
          </div>
          {/if}

          <h2 class="text-[15px] font-bold mt-4 mb-2">SAC</h2>
          {#if view}
            <!-- Sac: free items + unequipped weapons + unequipped armor/equipment -->
            {@const unequippedWeapons = (view.weapons ?? []).filter((w) => w?.nom && !w?.equipped)}
            {@const unequippedGear = (view.inventoryItems ?? []).filter((i) =>
              ['Armure', 'Équipement'].includes(i?.type) && i?.name &&
              !Object.values(view.equipment ?? {}).some((d) => d?.nom === (i?.equipmentData?.nom || i?.weaponName || i?.name))
            )}
            {@const bagItems = (view.inventoryItems ?? []).filter((item) => item?.name && !['Arme', 'Armure', 'Équipement'].includes(item?.type))}
            {#if unequippedWeapons.length || unequippedGear.length || bagItems.length}
              <div class="flex flex-wrap gap-1.5">
                {#each unequippedWeapons as weapon}
                  {@const wIcon = (view.inventoryItems ?? []).find(
                    (i) => i?.type === 'Arme' && (i?.weaponName || i?.name) === weapon.nom
                  )?.icon}
                  <div
                    use:tooltip={stripHtml(weapon.notes) || weapon.nom}
                    class="flex items-center gap-1.5 bg-[#111827] rounded-md pl-1.5 pr-2 py-1 border-l-2 cursor-help hover:bg-[#374151] transition-colors"
                    style="border-left-color: {itemTypeColor('Arme')}"
                  >
                    {#if wIcon && isImageUrl(wIcon)}
                      <img src={wIcon} alt="" class="w-4 h-4 rounded object-cover shrink-0" />
                    {:else if wIcon}
                      <span class="text-[12px] leading-none shrink-0">{wIcon}</span>
                    {:else}
                      <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background: {itemTypeColor('Arme')}"></span>
                    {/if}
                    <span class="text-[12px] font-semibold truncate max-w-40">{weapon.nom}</span>
                    {#if weapon.de}<span class="text-[11px] font-bold text-[#9ca3af] shrink-0">{weapon.de}</span>{/if}
                  </div>
                {/each}
                {#each [...unequippedGear, ...bagItems] as item}
                  <div
                    use:tooltip={itemNotes(item) !== '—' ? itemNotes(item) : item?.name}
                    class="flex items-center gap-1.5 bg-[#111827] rounded-md pl-1.5 pr-2 py-1 border-l-2 cursor-help hover:bg-[#374151] transition-colors"
                    style="border-left-color: {itemTypeColor(item?.type)}"
                  >
                    {#if item?.icon && isImageUrl(item.icon)}
                      <img src={item.icon} alt="" class="w-4 h-4 rounded object-cover shrink-0" />
                    {:else if item?.icon}
                      <span class="text-[12px] leading-none shrink-0">{item.icon}</span>
                    {:else}
                      <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background: {itemTypeColor(item?.type)}"></span>
                    {/if}
                    <span class="text-[12px] font-semibold truncate max-w-40">{item.name}</span>
                    {#if itemCenterValue(item)}
                      <span class="text-[11px] font-bold text-[#9ca3af] shrink-0">{itemCenterValue(item)}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            {:else}
              <div class="text-[11px] text-[#9ca3af]">Le sac est vide — armures et armes vivent dans les emplacements ci-dessus.</div>
            {/if}
          {/if}
        </div>
      {:else if activeTab === 'narratif'}
        <!-- TAB: NARRATIF -->
        <div>
          <h2 class="text-[15px] font-bold mb-3">ASPECTS NARRATIFS</h2>
          <div class="grid grid-cols-1 @2xl:grid-cols-2 gap-2.5">
            {#each NARRATIVE_FIELDS as [field, label]}
              <div class="narrative-card bg-[#111827] rounded-lg p-2.5 border border-transparent hover:border-indigo-500 transition-colors">
                <div class="text-[10px] font-bold text-[#9ca3af] mb-1.5">{label}</div>
                <div class="text-[11px] leading-relaxed {expandedNarrative[field] ? '' : 'line-clamp-4'} whitespace-pre-wrap">
                  {view.narrative?.[field] || '—'}
                </div>
                <div class="text-right mt-1.5">
                  <button
                    onclick={() => (expandedNarrative[field] = !expandedNarrative[field])}
                    title={expandedNarrative[field] ? 'Réduire' : 'Développer'}
                    class="w-5 h-5 rounded-full bg-[#111827] border border-[#374151] text-[#9ca3af] hover:text-white text-[10px] font-bold flex items-center justify-center ml-auto transition-colors"
                  >
                    {expandedNarrative[field] ? '−' : '+'}
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else if activeTab === 'maitrises'}
        <!-- TAB: MAÎTRISES -->
        <div>
          <h2 class="text-[15px] font-bold mb-1">MAÎTRISES & ÉVOLUTION</h2>
          <div class="flex gap-2 mb-4 mt-1.5">
            <span class="px-3 py-1 bg-[#111827] rounded-full text-[11px] font-semibold">
              XP dépensés {view.progression?.xpDepenses ?? 0}
            </span>
            <span class="px-3 py-1 bg-[#111827] rounded-full text-[11px] font-semibold">
              XP disponibles {view.progression?.xpDisponibles ?? 0}
            </span>
          </div>

          {#each MASTERY_BLOCKS as [key, dataKey, label]}
            <div class="bg-[#111827] rounded-lg p-3 mb-2.5">
              <div class="text-[11px] font-bold text-[#9ca3af] mb-2.5">{label}</div>
              <div class="flex gap-2.5 flex-wrap">
                {#each masteryItems(key) as item}
                  <span class="pill px-4 py-1.5 bg-indigo-600 rounded-full text-[11px] font-semibold">{item}</span>
                {/each}
                {#if !masteryItems(key).length}
                  <span class="pill px-4 py-1.5 bg-[#1f2937] rounded-full text-[11px] font-semibold text-[#9ca3af]">Aucun</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {:else if activeTab === 'notes'}
        <!-- TAB: NOTES (free inline editing + single save) -->
        <div>
          <h2 class="text-[15px] font-bold mb-3">NOTES</h2>
          <div class="bg-[#111827] rounded-lg p-3.5 min-h-[240px]">
            <div class="flex items-center justify-between mb-2.5">
              <div class="text-[20px] font-bold">Notes de session</div>
              <button
                onclick={saveNotes}
                disabled={!notesDraftDirty}
                title="Sauvegarder les notes"
                class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-default rounded-lg text-[11px] font-bold transition-colors"
              >
                💾 Sauvegarder
              </button>
            </div>
            <textarea
              bind:value={notesDraft}
              oninput={() => (notesDraftDirty = true)}
              placeholder="Écriture libre — notes de session"
              class="w-full min-h-[240px] px-3 py-2 bg-[#242424] border border-[#374151] rounded text-[13px] leading-relaxed focus:outline-none focus:border-indigo-500"
            ></textarea>
            <div class="text-[10px] font-medium text-[#9ca3af] mt-2.5">
              Écriture libre — rendu enrichi (**gras**, __souligné__, HTML) à l'affichage ; le bouton sauvegarde la fiche entière.
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
          <span class="text-[13px] font-bold">ÉDITION</span>
          <span class="text-[11px] text-[#9ca3af] ml-3 truncate">
            {editSheet.identity?.nom || 'Fiche de personnage'}
          </span>
          <span class="text-[10px] text-[#9ca3af] ml-auto">La fiche affiche les valeurs en direct</span>
        </div>

        <!-- Modal tab bar -->
        <div class="flex gap-1 px-2 py-1.5 bg-[#111827] border-b border-[#374151] overflow-x-auto shrink-0">
          {#each EDIT_TABS as tab}
            <button
              onclick={() => (editTab = tab.id)}
              class="px-3 py-1.5 rounded-md text-[9px] font-semibold whitespace-nowrap transition-colors {editTab === tab.id
                ? 'bg-indigo-600 text-white'
                : 'bg-[#1f2937] text-[#9ca3af] hover:bg-[#374151]'}"
            >
              {tab.label}
            </button>
          {/each}
        </div>

        <!-- Modal body -->
        <div class="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3 space-y-4">
          {#if editTab === 'identite'}
          <!-- Identity & core stats -->
          <div>
            <h3 class="text-[11px] font-bold text-[#9ca3af] mb-2">IDENTITÉ</h3>
            <div class="grid grid-cols-2 @2xl:grid-cols-4 gap-2">
              <div>
                <label class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">Nom</label>
                <input type="text" bind:value={editSheet.identity.nom} class="w-full text-[12px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">Race</label>
                <select bind:value={editSheet.identity.race} class="w-full text-[12px] bg-[#242424] border border-[#374151] rounded px-1 py-1 focus:outline-none focus:border-indigo-500">
                  <option value="">— Aucune —</option>
                  {#each RACES as race}
                    <option value={race.id}>{race.label}</option>
                  {/each}
                  {#if editSheet.identity.race && !RACES.some((r) => r.id === editSheet.identity.race)}
                    <option value={editSheet.identity.race}>{editSheet.identity.race}</option>
                  {/if}
                </select>
              </div>
              <div>
                <label class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">Alignement</label>
                <select bind:value={editSheet.identity.alignement} class="w-full text-[12px] bg-[#242424] border border-[#374151] rounded px-1 py-1 focus:outline-none focus:border-indigo-500">
                  <option value="">— Aucun —</option>
                  {#each ALIGNEMENTS as alignement}
                    <option value={alignement}>{alignement}</option>
                  {/each}
                  {#if editSheet.identity.alignement && !ALIGNEMENTS.includes(editSheet.identity.alignement)}
                    <option value={editSheet.identity.alignement}>{editSheet.identity.alignement}</option>
                  {/if}
                </select>
              </div>
              <div>
                <label class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">Niveau</label>
                <input type="number" bind:value={editSheet.identity.niveau} class="w-full text-[12px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
              {#each IDENTITY_EXTRAS as [field, label]}
                <div>
                  <label class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">{label}</label>
                  <input type="text" bind:value={editSheet.identity[field]} class="w-full text-[12px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
                </div>
              {/each}
              <div>
                <label class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">Portrait (URL ou emoji)</label>
                <input type="text" bind:value={editSheet.portrait} class="w-full text-[12px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">XP dépensés</label>
                <input type="number" bind:value={editSheet.progression.xpDepenses} class="w-full text-[12px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">XP disponibles</label>
                <input type="number" bind:value={editSheet.progression.xpDisponibles} class="w-full text-[12px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
            </div>
          </div>

          <div>
            <h3 class="text-[11px] font-bold text-[#9ca3af] mb-2">POINTS DE VIE</h3>
            <div class="grid grid-cols-2 @2xl:grid-cols-4 gap-2">
              <div>
                <label class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">PV actuels</label>
                <input type="number" bind:value={editSheet.derived.pvActuels} class="w-full text-[12px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">PV max</label>
                <input type="number" bind:value={editSheet.derived.pvMax} class="w-full text-[12px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">PV temporaires</label>
                <input type="number" bind:value={editSheet.derived.pvTemporaires} class="w-full text-[12px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">Fatigue</label>
                <input type="number" bind:value={editSheet.derived.fatigue} class="w-full text-[12px] bg-[#242424] border border-[#374151] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500" />
              </div>
            </div>
          </div>

          {:else if editTab === 'stats'}
          <div>
            <h3 class="text-[11px] font-bold text-[#9ca3af] mb-2">CARACTÉRISTIQUES</h3>
            <div class="grid grid-cols-4 gap-2">
              {#each ['force', 'agilite', 'esprit', 'social'] as stat}
                <div>
                  <label class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">{stat.toUpperCase()}</label>
                  <input
                    type="number"
                    bind:value={editSheet.stats[stat]}
                    class="w-full text-[12px] font-bold bg-[#242424] border border-[#374151] rounded px-1.5 py-1 text-center focus:outline-none focus:border-indigo-500"
                    style="color: {STAT_COLORS[stat]}"
                  />
                </div>
              {/each}
            </div>
          </div>

          <div>
            <h3 class="text-[11px] font-bold text-[#9ca3af] mb-2">DÉFENSE &amp; JETS (calculés)</h3>
            <div class="grid grid-cols-2 @2xl:grid-cols-4 gap-2">
              <div class="bg-[#111827] rounded-md px-2 py-1.5">
                <div class="text-[9px] font-bold text-[#9ca3af]">PARADE</div>
                <div class="text-[15px] font-bold">{editCalc.parade} <span class="text-[10px] font-medium text-[#9ca3af]">= {editCalc.deflexion}+{editCalc.garde}+{editCalc.paradeBonus}</span></div>
              </div>
              <div class="bg-[#111827] rounded-md px-2 py-1.5">
                <div class="text-[9px] font-bold text-[#9ca3af]">INITIATIVE</div>
                <div class="text-[15px] font-bold">{editCalc.initiative} <span class="text-[10px] font-medium text-[#9ca3af]">= Agi − 10 + gants</span></div>
              </div>
              <div class="bg-[#111827] rounded-md px-2 py-1.5">
                <div class="text-[9px] font-bold text-[#9ca3af]">MOUVEMENT</div>
                <div class="text-[15px] font-bold">{editCalc.mouvement} <span class="text-[10px] font-medium text-[#9ca3af]">= 5 + Agi/2 + bottes</span></div>
              </div>
              <div class="bg-[#111827] rounded-md px-2 py-1.5">
                <div class="text-[9px] font-bold text-[#9ca3af]">SEUIL MISS</div>
                <div class="text-[15px] font-bold">{editCalc.seuilMiss} <span class="text-[10px] font-medium text-[#9ca3af]">= max(1, 1 − mod Agi)</span></div>
              </div>
              <div class="bg-[#111827] rounded-md px-2 py-1.5">
                <div class="text-[9px] font-bold text-[#9ca3af]">BONUS ATTAQUE</div>
                <div class="text-[15px] font-bold">{formatModifier(editCalc.bonusAttaque)} <span class="text-[10px] font-medium text-[#9ca3af]">= stat + tier de l'arme</span></div>
              </div>
              <div class="bg-[#111827] rounded-md px-2 py-1.5">
                <div class="text-[9px] font-bold text-[#9ca3af]">CANALISATION</div>
                <div class="text-[15px] font-bold">{formatModifier(editCalc.canalisation)} <span class="text-[10px] font-medium text-[#9ca3af]">= mod Esprit</span></div>
              </div>
              <div class="bg-[#111827] rounded-md px-2 py-1.5">
                <div class="text-[9px] font-bold text-[#9ca3af]">VOLONTÉ</div>
                <div class="text-[15px] font-bold">{editCalc.volonte} <span class="text-[10px] font-medium text-[#9ca3af]">= mod Résilience + casque</span></div>
              </div>
            </div>
          </div>

          {/if}

          <!-- Active tab edit form -->
          {#if TABS.some((t) => t.id === editTab)}
          <div class="border-t border-[#374151] pt-3">
            <h3 class="text-[11px] font-bold text-[#9ca3af] mb-2">
              {TABS.find((t) => t.id === editTab)?.label}
            </h3>

            {#if editTab === 'competences'}
              <div class="grid grid-cols-1 @2xl:grid-cols-2 gap-x-5 gap-y-3">
                {#each SKILL_GROUPS as group}
                  <div>
                    <div class="text-[11px] font-bold mb-1.5" style="color: {STAT_COLORS[group.stat]}">{group.label}</div>
                    <div class="space-y-1">
                      {#each group.skills as skillKey}
                        <div class="flex items-center gap-2 bg-[#111827] rounded-md px-2.5 py-1.5">
                          <input type="checkbox" bind:checked={editSheet.skills[skillKey].trained} class="w-3.5 h-3.5 accent-indigo-600" title="Maîtrisée" />
                          <span class="text-[12px] font-medium truncate flex-1">{SKILL_LABELS[skillKey]}</span>
                          <input
                            type="number"
                            bind:value={editSheet.skills[skillKey].bonus}
                            title="Bonus manuel"
                            class="w-14 text-[12px] font-bold bg-[#242424] border border-[#374151] rounded px-1 py-0.5 text-center focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            {:else if editTab === 'capacites'}
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
                  class="px-3 py-1 bg-indigo-600 rounded-full text-[11px] font-semibold hover:bg-indigo-500 transition-colors"
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
                        class="flex-1 min-w-0 px-3 py-2 bg-[#242424] border border-[#374151] rounded text-[13px] font-bold focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        onclick={() => {
                          editSheet.capacities.splice(i, 1);
                          editSheet.capacities = [...editSheet.capacities];
                        }}
                        class="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-red-200 text-[11px] font-semibold rounded transition-colors shrink-0"
                      >
                        Supprimer
                      </button>
                    </div>
                    <textarea
                      placeholder="Description"
                      bind:value={editSheet.capacities[i].description}
                      class="w-full px-3 py-2 bg-[#242424] border border-[#374151] rounded text-[11px] focus:outline-none focus:border-indigo-500"
                      rows="2"
                    ></textarea>
                    <div class="grid grid-cols-2 @2xl:grid-cols-4 gap-2">
                      <div>
                        <label class="block text-[9px] font-bold text-[#9ca3af] mb-1">IMAGE (URL ou emoji)</label>
                        <input type="text" bind:value={editSheet.capacities[i].image} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[11px] focus:outline-none focus:border-indigo-500" />
                      </div>
                      <div>
                        <label class="block text-[9px] font-bold text-[#9ca3af] mb-1">COÛT TOTAL</label>
                        <input type="number" bind:value={editSheet.capacities[i].cost.total} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[11px] focus:outline-none focus:border-indigo-500" />
                      </div>
                      <div>
                        <label class="block text-[9px] font-bold text-[#9ca3af] mb-1">COULEUR</label>
                        <select bind:value={editSheet.capacities[i].cost.color} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[11px] focus:outline-none focus:border-indigo-500">
                          <option value="">— Aucune —</option>
                          {#each Object.keys(SUIT_LABELS) as suit}
                            <option value={suit}>{SUIT_LABELS[suit]} {SUIT_SYMBOLS[suit]}</option>
                          {/each}
                        </select>
                      </div>
                      <div>
                        <label class="block text-[9px] font-bold text-[#9ca3af] mb-1">USAGE</label>
                        <select bind:value={editSheet.capacities[i].usage} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[11px] focus:outline-none focus:border-indigo-500">
                          <option value="">— Aucun —</option>
                          {#each USAGE_OPTIONS as usageOption}
                            <option value={usageOption}>{usageOption}</option>
                          {/each}
                          {#if editSheet.capacities[i].usage && !USAGE_OPTIONS.includes(editSheet.capacities[i].usage)}
                            <option value={editSheet.capacities[i].usage}>{editSheet.capacities[i].usage}</option>
                          {/if}
                        </select>
                      </div>
                    </div>
                    <div class="grid grid-cols-2 @2xl:grid-cols-3 gap-2">
                      <div>
                        <label class="block text-[9px] font-bold text-[#9ca3af] mb-1">DÉS (formule)</label>
                        <input type="text" bind:value={editSheet.capacities[i].value.main} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[11px] focus:outline-none focus:border-indigo-500" />
                      </div>
                      <div>
                        <label class="block text-[9px] font-bold text-[#9ca3af] mb-1">INCANTATION</label>
                        <select bind:value={editSheet.capacities[i].incantation} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[11px] focus:outline-none focus:border-indigo-500">
                          <option value="">— Aucune —</option>
                          {#each INCANTATION_OPTIONS.filter(Boolean) as stat}
                            <option value={stat}>{stat}</option>
                          {/each}
                          {#if editSheet.capacities[i].incantation && !INCANTATION_OPTIONS.includes(editSheet.capacities[i].incantation)}
                            <option value={editSheet.capacities[i].incantation}>{editSheet.capacities[i].incantation}</option>
                          {/if}
                        </select>
                      </div>
                      <div>
                        <label class="block text-[9px] font-bold text-[#9ca3af] mb-1">SAUVEGARDE</label>
                        <select bind:value={editSheet.capacities[i].save} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[11px] focus:outline-none focus:border-indigo-500">
                          {#each SAVE_OPTIONS as saveOption}
                            <option value={saveOption}>{saveOption === 'X' ? 'X — Aucune' : saveOption}</option>
                          {/each}
                          {#if editSheet.capacities[i].save && !SAVE_OPTIONS.includes(editSheet.capacities[i].save)}
                            <option value={editSheet.capacities[i].save}>{editSheet.capacities[i].save}</option>
                          {/if}
                        </select>
                      </div>
                    </div>
                    <label class="flex items-center gap-2 text-[11px] text-[#9ca3af]">
                      <input type="checkbox" bind:checked={editSheet.capacities[i].prepared} class="w-3.5 h-3.5 accent-indigo-600" />
                      Préparée
                    </label>
                  </div>
                {/each}
              </div>

              <div class="bg-[#111827] rounded-lg p-3 mt-3">
                <div class="text-[11px] font-bold text-[#9ca3af] mb-2">TOTEM</div>
                <div class="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label class="block text-[9px] font-bold text-[#9ca3af] mb-1">Nom</label>
                    <input type="text" bind:value={editSheet.totem.nom} class="w-full px-3 py-1.5 bg-[#242424] border border-[#374151] rounded text-[13px] focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label class="block text-[9px] font-bold text-[#9ca3af] mb-1">Image (URL ou emoji)</label>
                    <input type="text" bind:value={editSheet.totem.image} class="w-full px-3 py-1.5 bg-[#242424] border border-[#374151] rounded text-[13px] focus:outline-none focus:border-indigo-500" />
                  </div>
                </div>
                <label class="block text-[9px] font-bold text-[#9ca3af] mb-1">Description</label>
                <textarea bind:value={editSheet.totem.description} class="w-full px-3 py-2 bg-[#242424] border border-[#374151] rounded text-[13px] focus:outline-none focus:border-indigo-500" rows="3"></textarea>
              </div>
            {:else if editTab === 'inventaire'}
              <div class="space-y-3">
                <div>
                  <h4 class="text-[11px] font-bold text-[#9ca3af] mb-1.5">ÉQUIPEMENT</h4>
                  <div class="grid grid-cols-1 @2xl:grid-cols-2 gap-2">
                    {#each EQUIP_SLOTS as [slot, slotLabel, icon]}
                      <div class="bg-[#111827] rounded-lg p-2.5">
                        <div class="text-[11px] font-bold mb-1.5">{icon} {slotLabel}</div>
                        <div class="grid grid-cols-2 gap-1.5">
                          {#each Object.keys(editSheet.equipment?.[slot] ?? {}) as field}
                            <div>
                              <label class="block text-[9px] font-bold text-[#9ca3af] mb-0.5 capitalize">{field}</label>
                              {#if field === 'description' || field === 'enchantement'}
                                <textarea bind:value={editSheet.equipment[slot][field]} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[11px] focus:outline-none focus:border-indigo-500" rows="2"></textarea>
                              {:else}
                                <input type="text" bind:value={editSheet.equipment[slot][field]} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[11px] focus:outline-none focus:border-indigo-500" />
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
                    <h4 class="text-[11px] font-bold text-[#9ca3af]">INVENTAIRE</h4>
                    <div class="flex items-center gap-1.5">
                      <select
                        bind:value={itemTemplate}
                        title="Choisir un modèle d'équipement"
                        class="px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[11px] focus:outline-none focus:border-indigo-500 max-w-[170px]"
                      >
                        <option value="">— Modèle —</option>
                        {#each EQUIPMENT_CATALOG.filter((grp) => grp.kind !== 'arme') as grp}
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
                          const fam = tpl?.family ?? '';
                          editSheet.inventoryItems = [...(editSheet.inventoryItems || []), {
                            type: tpl ? 'Équipement' : 'Divers',
                            icon: tpl ? (ITEM_ICONS[tpl.nom] ?? FAMILY_ICONS[fam] ?? '') : '',
                            slot: tpl?.slot ?? '',
                            name: tpl?.nom ?? '',
                            degats: tpl?.de ? `${tpl.de}${tpl.degats ? ` ${tpl.degats}` : ''}` : '',
                            family: fam,
                            familySummary: fam ? FAMILY_SUMMARIES[fam] ?? '' : '',
                            ...(fam === 'Catalyseurs' ? { catalystColor: '' } : {}),
                            attributs: tpl?.proprietes ?? '',
                            description: ''
                          }];
                          itemTemplate = '';
                        }}
                        class="px-3 py-1 bg-indigo-600 rounded-full text-[11px] font-semibold hover:bg-indigo-500 transition-colors whitespace-nowrap"
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
                          onchange={(e) => {
                          item.type = e.currentTarget.value;
                          if (item.type === 'Équipement' && !item.family) item.family = 'Équipement';
                        }}
                          class="px-2 py-1.5 rounded-md text-[11px] font-bold border bg-[#242424] focus:outline-none shrink-0"
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
                          class="flex-1 min-w-0 px-2.5 py-1.5 bg-[#242424] border border-[#374151] rounded-md text-[13px] font-bold focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          onclick={() => {
                            const list = editSheet.inventoryItems;
                            list.splice(list.indexOf(item), 1);
                            editSheet.inventoryItems = [...list];
                          }}
                          class="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-red-200 text-[11px] font-semibold rounded-md transition-colors shrink-0"
                        >
                          Supprimer
                        </button>
                      </div>
                      <!-- fields -->
                      <div class="grid grid-cols-1 @2xl:grid-cols-2 gap-2.5 px-3 pb-3">
                        {#each itemFieldsFor(item?.type, item?.slot) as field}
                          <div class={field === 'description' || field === 'enchantement' || field === 'familySummary' ? 'col-span-full' : ''}>
                            <label class="block text-[10px] font-bold text-[#9ca3af] mb-1 capitalize">{field === 'familySummary' ? 'Résumé de famille (auto)' : field}</label>
                            {#if field === 'description'}
                              <textarea bind:value={item[field]} class="w-full px-2.5 py-1.5 bg-[#242424] border border-[#374151] rounded-md text-[11px] focus:outline-none focus:border-indigo-500" rows="2"></textarea>
                            {:else if field === 'enchantement'}
                              <textarea bind:value={item[field]} class="rich-html px-2.5 py-1.5 bg-[#242424] border border-[#374151] rounded-md text-[11px] focus:outline-none focus:border-indigo-500" rows="2"></textarea>
                              <textarea bind:value={item[field]} class="w-full px-2.5 py-1.5 bg-[#242424] border border-[#374151] rounded-md text-[11px] focus:outline-none focus:border-indigo-500" rows="2"></textarea>
                            {:else if field === 'slot'}
                              <select
                                bind:value={item.slot}
                                onchange={(e) => syncItemSlot(item, e.currentTarget.value)}
                                class="w-full px-2 py-1.5 bg-[#242424] border border-[#374151] rounded-md text-[11px] focus:outline-none focus:border-indigo-500"
                              >
                                <option value="">— Aucun emplacement —</option>
                                {#each EQUIP_SLOTS as [sl, slLabel]}
                                  <option value={sl}>{slLabel}</option>
                                {/each}
                                {#if item?.type === 'Arme'}
                                  <option value="main">Main principale</option>
                                  <option value="off">Main secondaire</option>
                                {/if}
                              </select>
                            {:else if field === 'catalystColor'}
                              <select bind:value={item.catalystColor} class="w-full px-2 py-1.5 bg-[#242424] border border-[#374151] rounded-md text-[11px] focus:outline-none focus:border-indigo-500">
                                <option value="">— Aucune couleur —</option>
                                {#each Object.keys(SUIT_LABELS) as suit}
                                  <option value={suit}>{SUIT_LABELS[suit]} {SUIT_SYMBOLS[suit]}</option>
                                {/each}
                              </select>
                            {:else if field === 'family'}
                              <select
                                bind:value={item.family}
                                onchange={(e) => {
                                  const fam = e.currentTarget.value;
                                  item.familySummary = FAMILY_SUMMARIES[fam] ?? '';
                                  if (fam === 'Catalyseurs') item.catalystColor = item.catalystColor ?? '';
                                }}
                                class="w-full px-2 py-1.5 bg-[#242424] border border-[#374151] rounded-md text-[11px] focus:outline-none focus:border-indigo-500"
                              >
                                <option value="">— Aucune famille —</option>
                                {#each Object.keys(FAMILY_SUMMARIES) as fam}
                                  <option value={fam}>{fam}</option>
                                {/each}
                              </select>
                            {:else if field === 'familySummary'}
                              <div class="rich-html px-2.5 py-1.5 bg-[#242424] border border-[#374151] rounded-md text-[11px] text-[#9ca3af]">{@html sanitizeHtml(item.familySummary) || '—'}</div>
                            {:else if ['deflexion', 'armure', 'volonte', 'initiative', 'vitesse'].includes(field)}
                              <input type="number" bind:value={item[field]} class="w-full px-2.5 py-1.5 bg-[#242424] border border-[#374151] rounded-md text-[11px] text-center font-bold focus:outline-none focus:border-indigo-500" />
                            {:else}
                              <input type="text" bind:value={item[field]} class="w-full px-2.5 py-1.5 bg-[#242424] border border-[#374151] rounded-md text-[11px] focus:outline-none focus:border-indigo-500" />
                            {/if}
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/each}
                  {#if !(editSheet.inventoryItems || []).length}
                    <div class="text-[11px] text-[#9ca3af] bg-[#111827] rounded-lg px-3 py-3 text-center">
                      Aucun objet — choisissez un modèle (ou « — Modèle — » pour un objet vide) puis cliquez « + Ajouter un objet ».
                    </div>
                  {/if}
                </div>

                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <h4 class="text-[11px] font-bold text-[#9ca3af]">ARMES</h4>
                    <div class="flex items-center gap-1.5">
                      <select
                        bind:value={weaponTemplate}
                        title="Choisir un modèle d'arme"
                        class="px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[11px] focus:outline-none focus:border-indigo-500 max-w-[170px]"
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
                            icon: tpl ? FAMILY_ICONS[tpl.family] ?? '' : '',
                            nom: tpl?.nom ?? '',
                            de: tpl?.de ?? '',
                            degats: tpl?.degats ?? '',
                            propriétés: tpl?.proprietes ?? '',
                            forceAgi: '', critique: '', avantage: '',
                            bonus: '', perfection: '', notes: '', equipped: false
                          }];
                          weaponTemplate = '';
                        }}
                        class="px-3 py-1 bg-indigo-600 rounded-full text-[11px] font-semibold hover:bg-indigo-500 transition-colors whitespace-nowrap"
                      >
                        + Ajouter une arme
                      </button>
                    </div>
                  </div>
                  {#each editSheet.weapons || [] as weapon, i}
                    <div class="item-editor bg-[#111827] rounded-lg mb-3 border-l-4 border-[#f87171] overflow-hidden">
                      <!-- header: equipped + name + delete -->
                      <div class="flex items-center gap-2 px-3 pt-3 pb-2">
                        <select
                          value={weapon?.equipped ? (weapon.hand ?? 'main') : ''}
                          onchange={(e) => {
                            const hand = e.currentTarget.value;
                            if (hand) {
                              // pass the original array — equipWeapon matches the weapon by reference
                              editSheet.weapons = equipWeapon({ ...editSheet, weapons: [...editSheet.weapons] }, weapon, hand).weapons;
                            } else {
                              editSheet.weapons = editSheet.weapons.map((w, j) => (j === i ? { ...weapon, equipped: false, hand: null } : w));
                            }
                          }}
                          title="Emplacement d'équipement{isTwoHanded(weapon) ? ' — à deux mains : occupe les deux mains' : ''}"
                          class="px-2 py-1.5 rounded-md text-[11px] font-bold border bg-[#242424] focus:outline-none shrink-0 {weapon?.equipped
                            ? 'text-indigo-300 border-indigo-500'
                            : 'text-[#9ca3af] border-[#374151]'}"
                        >
                          <option value="">— Non équipée —</option>
                          <option value="main">Main principale</option>
                          <option value="off">Main secondaire</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Nom de l'arme"
                          bind:value={editSheet.weapons[i].nom}
                          class="flex-1 min-w-0 px-2.5 py-1.5 bg-[#242424] border border-[#374151] rounded-md text-[13px] font-bold focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          onclick={() => {
                            editSheet.weapons.splice(i, 1);
                            editSheet.weapons = [...editSheet.weapons];
                          }}
                          class="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-red-200 text-[11px] font-semibold rounded-md transition-colors shrink-0"
                        >
                          Supprimer
                        </button>
                      </div>
                      <!-- fields -->
                      <div class="grid grid-cols-2 @2xl:grid-cols-4 gap-2.5 px-3 pb-3">
                        {#each Object.entries(weapon ?? {}).filter(([field]) => field !== 'nom' && field !== 'equipped' && field !== 'hand') as [field]}
                          <div class={field === 'notes' || field === 'propriétés' ? 'col-span-full' : ''}>
                            <label class="block text-[10px] font-bold text-[#9ca3af] mb-1 capitalize">{field}</label>
                            {#if field === 'notes'}
                              <textarea bind:value={editSheet.weapons[i][field]} class="w-full px-2.5 py-1.5 bg-[#242424] border border-[#374151] rounded-md text-[11px] focus:outline-none focus:border-indigo-500" rows="2"></textarea>
                            {:else}
                              <input type="text" bind:value={editSheet.weapons[i][field]} class="w-full px-2.5 py-1.5 bg-[#242424] border border-[#374151] rounded-md text-[11px] focus:outline-none focus:border-indigo-500" />
                            {/if}
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/each}
                  {#if !(editSheet.weapons || []).length}
                    <div class="text-[11px] text-[#9ca3af] bg-[#111827] rounded-lg px-3 py-3 text-center">
                      Aucune arme — choisissez un modèle (ou « — Modèle — » pour une arme vide) puis cliquez « + Ajouter une arme ».
                    </div>
                  {/if}
                </div>
              </div>
            {:else if editTab === 'narratif'}
              <div class="grid grid-cols-1 @2xl:grid-cols-2 gap-2.5">
                {#each NARRATIVE_FIELDS as [field, label]}
                  <div class="bg-[#111827] rounded-lg p-2.5">
                    <div class="text-[10px] font-bold text-[#9ca3af] mb-1.5">{label}</div>
                    <textarea bind:value={editSheet.narrative[field]} class="w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[11px] focus:outline-none focus:border-indigo-500" rows="4"></textarea>
                  </div>
                {/each}
              </div>
            {:else if editTab === 'maitrises'}
              {#each MASTERY_BLOCKS as [key, dataKey, label]}
                <div class="bg-[#111827] rounded-lg p-3 mb-2.5">
                  <div class="text-[11px] font-bold text-[#9ca3af] mb-2">{label}</div>
                  <textarea bind:value={masteryText[key]} placeholder="Un élément par ligne" class="w-full px-3 py-2 bg-[#242424] border border-[#374151] rounded text-[11px] focus:outline-none focus:border-indigo-500" rows="3"></textarea>
                </div>
              {/each}
            {:else if editTab === 'notes'}
              <div class="bg-[#111827] rounded-md px-2 py-2 flex gap-2 mb-2.5 flex-wrap">
                <button onclick={() => wrapNotesSelection('**', '**')} title="Gras" class="px-4 py-1 bg-indigo-600 rounded-full text-[11px] font-semibold hover:bg-indigo-500 transition-colors">B</button>
                <button onclick={() => wrapNotesSelection('__', '__')} title="Souligné" class="px-4 py-1 bg-indigo-600 rounded-full text-[11px] font-semibold hover:bg-indigo-500 transition-colors">U</button>
                <button title="Taille du texte — non implémenté" class="px-4 py-1 bg-[#1f2937] rounded-full text-[11px] font-semibold text-[#9ca3af] cursor-default">T-</button>
                <button title="Taille du texte — non implémenté" class="px-4 py-1 bg-[#1f2937] rounded-full text-[11px] font-semibold text-[#9ca3af] cursor-default">T+</button>
                <button onclick={() => prefixNotesLines('• ')} title="Liste à puces" class="px-3 py-1 bg-[#1f2937] rounded-full text-[11px] font-semibold hover:bg-[#374151] transition-colors">• Liste</button>
                <button onclick={() => prefixNotesLines('☐ ')} title="Case à cocher" class="px-3 py-1 bg-[#1f2937] rounded-full text-[11px] font-semibold hover:bg-[#374151] transition-colors">☐</button>
                <button onclick={() => insertNotesText('— ')} title="Insérer un tiret" class="px-3 py-1 bg-[#1f2937] rounded-full text-[11px] font-semibold hover:bg-[#374151] transition-colors">—</button>
              </div>
              <div class="bg-[#111827] rounded-lg p-3">
                <div class="text-[15px] font-bold mb-2">Notes de session</div>
                <textarea
                  bind:this={notesArea}
                  bind:value={editSheet.notes}
                  class="w-full min-h-[240px] px-3 py-2 bg-[#242424] border border-[#374151] rounded text-[13px] leading-relaxed focus:outline-none focus:border-indigo-500"
                  placeholder="Écriture libre — notes de session"
                ></textarea>
              </div>
            {/if}
          </div>
          {/if}
        </div>

        <!-- Modal footer -->
        <div class="h-12 bg-[#111827] border-t border-[#374151] flex items-center gap-2 px-3 shrink-0">
          <span class="text-[10px] text-[#9ca3af] truncate">Les changements s'affichent en direct sur la fiche — sauvegarde manuelle.</span>
          <button
            onclick={cancelEdit}
            disabled={isSaving}
            class="ml-auto px-4 py-1.5 bg-[#242424] hover:bg-[#374151] text-[12px] font-semibold rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            Annuler
          </button>
          <button
            onclick={saveEdit}
            disabled={isSaving}
            class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-[12px] font-semibold rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
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
        <h3 class="text-[20px] font-bold mb-4">Modifications non sauvegardées</h3>
        <p class="text-[#9ca3af] text-[15px] mb-6">
          Vous avez des modifications non sauvegardées. Voulez-vous sauvegarder avant de continuer ?
        </p>
        <div class="flex gap-3">
          <button
            onclick={discardAndContinue}
            class="flex-1 px-4 py-2 bg-[#111827] hover:bg-[#374151] text-[13px] font-semibold rounded-lg transition-colors"
          >
            Ignorer
          </button>
          <button
            onclick={confirmSaveAndContinue}
            class="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-[13px] font-semibold rounded-lg transition-colors"
          >
            Sauvegarder
          </button>
          <button
            onclick={() => {
              showUnsavedModal = false;
              pendingAction = null;
            }}
            class="px-4 py-2 bg-red-900 hover:bg-red-800 text-red-200 text-[13px] font-semibold rounded-lg transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Equipment Slot Detail Popup (paper-doll) -->
  {#if expandedSlot}
    {@const hands = handSlots(view)}
    {@const slotDef = expandedSlot.kind === 'slot' ? EQUIP_SLOTS.find(([sl]) => sl === expandedSlot.slot) : null}
    {@const slotData = expandedSlot.kind === 'slot' ? (view.equipment?.[expandedSlot.slot] ?? {}) : null}
    {@const weapon = expandedSlot.kind === 'hand' ? (expandedSlot.hand === 'main' ? hands.main : hands.off) : null}
    {@const candidates = expandedSlot.kind === 'slot' ? slotCandidates(expandedSlot.slot) : (view.weapons ?? []).filter((w) => w?.nom)}
    <div
      class="fixed inset-0 bg-black/75 flex items-center justify-center z-[70] p-4"
      onclick={() => { expandedSlot = null; slotPickerOpen = false; }}
      onkeydown={(e) => e.key === 'Escape' && (expandedSlot = null)}
      role="button"
      tabindex="0"
    >
      <div
        class="bg-[#1f2937] border border-[#374151] rounded-lg p-5 w-[92%] max-w-lg max-h-[85vh] overflow-y-auto scrollbar-thin"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div class="flex items-start gap-3">
          <span class="text-[33px] leading-none shrink-0">{expandedSlot.kind === 'hand' ? '🗡' : slotDef?.[2]}</span>
          <div class="flex-1 min-w-0">
            <div class="text-[18px] font-bold">
              {#if expandedSlot.kind === 'hand'}
                {expandedSlot.hand === 'main' ? 'Main principale' : 'Main secondaire'}
                {#if hands.twoHanded}<span class="text-[11px] font-bold text-amber-400 ml-1">à deux mains</span>{/if}
              {:else}
                {slotDef?.[1]}
              {/if}
            </div>
            <div class="text-[12px] text-[#9ca3af] mt-0.5">
              {#if expandedSlot.kind === 'hand'}
                {weapon ? weapon.nom : 'Vide'}
              {:else}
                {slotData?.nom || 'Vide'}
              {/if}
            </div>
          </div>
          <button
            onclick={() => { expandedSlot = null; slotPickerOpen = false; }}
            title="Fermer"
            class="w-7 h-7 rounded-full bg-[#111827] border border-[#374151] text-[#9ca3af] hover:text-white text-[12px] font-bold flex items-center justify-center shrink-0 transition-colors"
          >
            ✕
          </button>
        </div>

        {#if !slotPickerOpen}
          <!-- Details -->
          <div class="mt-3 space-y-1.5">
            {#if expandedSlot.kind === 'hand' && weapon}
              <div class="flex gap-2 text-[12px]">
                <span class="text-[#9ca3af] w-24 shrink-0">Dégâts</span>
                <span class="font-bold">{weapon.de || '—'}</span>
              </div>
              <div class="flex gap-2 text-[12px]">
                <span class="text-[#9ca3af] w-24 shrink-0">Bonus attaque</span>
                <span class="font-bold" style="color: {STAT_COLORS.force}">{formatModifier(attackBonus(weapon, view?.stats ?? {}))}</span>
              </div>
              {#if weapon.notes}
                <div class="flex gap-2 text-[12px]">
                  <span class="text-[#9ca3af] w-24 shrink-0">Propriétés</span>
                  <div class="rich-html flex-1">{@html sanitizeHtml(weapon.notes)}</div>
                </div>
              {/if}
            {:else if expandedSlot.kind === 'slot' && slotData?.nom}
              {#each Object.entries(slotData) as [field, value]}
                {#if value !== '' && value != null}
                  <div class="flex gap-2 text-[12px]">
                    <span class="text-[#9ca3af] w-24 shrink-0 capitalize">{field}</span>
                    <div class="rich-html flex-1 whitespace-pre-wrap">{@html sanitizeHtml(value)}</div>
                  </div>
                {/if}
              {/each}
            {:else}
              <div class="text-[11px] text-[#9ca3af]">Emplacement vide.</div>
            {/if}
          </div>

          <div class="flex gap-2 mt-4">
            <button
              onclick={() => (slotPickerOpen = true)}
              class="flex-1 px-3 h-10 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-[13px] font-bold transition-colors"
            >
              ⇄ Changer d'équipement
            </button>
            {#if (expandedSlot.kind === 'hand' && weapon) || (expandedSlot.kind === 'slot' && slotData?.nom)}
              <button
                onclick={() => {
                  if (expandedSlot.kind === 'hand') saveSheet(unequipHand(sheet, expandedSlot.hand));
                  else clearEquipmentSlot(expandedSlot.slot);
                }}
                title="Vider l'emplacement"
                class="px-3 h-10 bg-[#111827] border border-[#374151] hover:bg-[#374151] rounded-lg text-[13px] font-bold text-[#9ca3af] hover:text-white transition-colors"
              >
                Vider
              </button>
            {/if}
          </div>
        {:else}
          <!-- Switcher: possessed items of this category -->
          <div class="mt-3">
            <div class="text-[10px] font-bold text-[#9ca3af] mb-1.5">
              {expandedSlot.kind === 'hand' ? 'ARMES POSSÉDÉES — cliquer pour équiper' : 'OBJETS POSSÉDÉS — cliquer pour équiper'}
            </div>
            <div class="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin pr-1">
              {#each candidates as candidate}
                {@const candName = expandedSlot.kind === 'hand' ? candidate.nom : (candidate?.equipmentData?.nom || candidate?.weaponName || candidate?.name)}
                <button
                  class="w-full flex items-center gap-2 bg-[#111827] hover:bg-[#374151] rounded-md px-2.5 py-2 text-left transition-colors"
                  onclick={() => {
                    if (expandedSlot.kind === 'hand') saveSheet(equipWeapon(sheet, candidate, expandedSlot.hand));
                    else applySlotItem(expandedSlot.slot, candidate);
                    slotPickerOpen = false;
                  }}
                >
                  <div
                    class="w-6 h-6 rounded-md bg-[#242424] border border-[#374151] flex items-center justify-center text-[10px] shrink-0"
                  >
                    {#if candidate?.icon && isImageUrl(candidate.icon)}
                      <img src={candidate.icon} alt="" class="w-full h-full object-cover rounded" />
                    {:else if candidate?.icon}
                      <span>{candidate.icon}</span>
                    {:else if expandedSlot.kind === 'slot' && candidate?.equipmentData?.nom}
                      <span class="text-[10px]">{candidate.equipmentData.nom === 'Casque' ? '⛑' : candidate.equipmentData.nom === 'Plastron' ? '🛡' : '◈'}</span>
                    {:else}
                      ›
                    {/if}
                  </div>
                  <span class="text-[12px] font-semibold truncate flex-1">{candName || '—'}</span>
                  {#if expandedSlot.kind === 'hand'}
                    <span class="text-[11px] text-[#9ca3af] shrink-0">{candidate.de || '—'}{isTwoHanded(candidate) ? ' · 2M' : ''}{candidate.equipped ? ' · équipée' : ''}</span>
                  {:else if candidate?.family}
                    <span class="text-[10px] text-[#9ca3af] shrink-0">{candidate.family}</span>
                  {/if}
                </button>
              {:else}
                <div class="text-[11px] text-[#9ca3af] bg-[#111827] rounded-md p-2.5">
                  Aucun objet de cette catégorie dans le sac.
                </div>
              {/each}
            </div>
            <button
              onclick={() => (slotPickerOpen = false)}
              class="w-full mt-2 px-3 py-1.5 bg-[#111827] border border-[#374151] hover:bg-[#374151] rounded-lg text-[11px] font-bold text-[#9ca3af] hover:text-white transition-colors"
            >
              ← Retour aux détails
            </button>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Capacity Expand Modal -->
  {#if expandedCapacity}
    <div
      class="fixed inset-0 bg-black/75 flex items-center justify-center z-[70] p-4"
      onclick={() => (expandedCapacity = null)}
      onkeydown={(e) => e.key === 'Escape' && (expandedCapacity = null)}
      role="button"
      tabindex="0"
    >
      <div
        class="bg-[#1f2937] border border-[#374151] rounded-lg p-5 w-[92%] max-w-lg max-h-[85vh] overflow-y-auto scrollbar-thin"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div class="flex items-start gap-3">
          {#if expandedCapacity.image && isImageUrl(expandedCapacity.image)}
            <img src={expandedCapacity.image} alt={expandedCapacity.name || 'Capacité'} class="w-16 h-16 object-cover rounded-md shrink-0" />
          {:else if expandedCapacity.image}
            <span class="text-[33px] leading-none shrink-0">{expandedCapacity.image}</span>
          {/if}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <div class="text-[18px] font-bold">{expandedCapacity.name || 'Sans nom'}</div>
              {#if capacityType(expandedCapacity.usage)}
                {@const typeBadge = capacityType(expandedCapacity.usage)}
                <span
                  class="px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0"
                  style="color: {typeBadge.color}; background: {typeBadge.color}22"
                >
                  {typeBadge.label}
                </span>
              {/if}
            </div>
            <div class="text-[12px] font-medium mt-1">
              <span class="text-[#9ca3af]">COÛT</span>
              <span class="ml-1.5 font-bold">{expandedCapacity.cost?.total ?? 0}</span>
              <span class="ml-0.5 font-bold" style="color: {suitColor(expandedCapacity.cost?.color)}">{suitSymbol(expandedCapacity.cost?.color)}</span>
              <span class="text-[#9ca3af]"> · {expandedCapacity.usage || '—'}</span>
            </div>
          </div>
          <button
            onclick={() => (expandedCapacity = null)}
            title="Fermer"
            class="w-7 h-7 rounded-full bg-[#111827] border border-[#374151] text-[#9ca3af] hover:text-white text-[12px] font-bold flex items-center justify-center shrink-0 transition-colors"
          >
            ✕
          </button>
        </div>
        {#if stripHtml(expandedCapacity.description)}
          <div class="rich-html text-[13px] text-[#d1d5db] leading-relaxed mt-3">{@html sanitizeHtml(expandedCapacity.description)}</div>
        {/if}
        {#if expandedCapacity.value?.main || expandedCapacity.incantation || expandedCapacity.save}
          <div class="mt-3 space-y-1.5 border-t border-[#374151] pt-3">
            {#if expandedCapacity.value?.main}
              <div class="flex gap-2 text-[11px]">
                <span class="text-[#9ca3af] w-24 shrink-0">Valeur</span>
                <span class="font-bold flex-1">{expandedCapacity.value.main}{expandedCapacity.value.bonus ? ` / ${expandedCapacity.value.bonus}` : ''}</span>
              </div>
            {/if}
            {#if expandedCapacity.incantation}
              <div class="flex gap-2 text-[11px]">
                <span class="text-[#9ca3af] w-24 shrink-0">Incantation</span>
                <span class="font-bold flex-1">{expandedCapacity.incantation}</span>
              </div>
            {/if}
            {#if expandedCapacity.save}
              <div class="flex gap-2 text-[11px]">
                <span class="text-[#9ca3af] w-24 shrink-0">Sauvegarde</span>
                <span class="font-bold flex-1">{expandedCapacity.save}</span>
              </div>
            {/if}
            {#if expandedCapacity.prepared}
              <div class="flex gap-2 text-[11px]">
                <span class="text-[#9ca3af] w-24 shrink-0">Statut</span>
                <span class="px-1.5 py-0.5 bg-indigo-600 text-white text-[9px] font-bold rounded">Préparée</span>
              </div>
            {/if}
          </div>
        {/if}
        {#if expandedCapacity.value?.main && isDiceFormula(expandedCapacity.value.main, view?.stats ?? {})}
          <button
            onclick={() => handleDiceRoll(expandedCapacity.name || 'Capacité', expandedCapacity.value.main)}
            title="Lancer {expandedCapacity.value.main}"
            class="mt-3 px-4 h-10 bg-slate-500 rounded-lg text-[15px] font-bold hover:bg-slate-400 transition-colors"
          >
            🎲 Lancer {expandedCapacity.value.main}
          </button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Delete Confirmation Modal -->
  {#if showDeleteConfirm}
    <div class="fixed inset-0 bg-black/75 flex items-center justify-center z-[60]">
      <div class="bg-[#1f2937] border border-[#374151] rounded-lg p-6 w-[92%] max-w-md">
        <h3 class="text-[20px] font-bold mb-4">Confirmer la suppression</h3>
        <p class="text-[#9ca3af] text-[15px] mb-6">
          Êtes-vous sûr de vouloir supprimer cette fiche de personnage ? Cette action est irréversible.
        </p>
        <div class="flex gap-3">
          <button
            onclick={() => (showDeleteConfirm = false)}
            class="flex-1 px-4 py-2 bg-[#111827] hover:bg-[#374151] text-[13px] font-semibold rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            onclick={handleDelete}
            class="flex-1 px-4 py-2 bg-red-900 hover:bg-red-800 text-red-200 text-[13px] font-semibold rounded-lg transition-colors"
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

  /* ── Rich HTML descriptions (sanitized) ── */
  .rich-html :is(ul) {
    list-style: disc;
    padding-left: 1.2em;
  }
  .rich-html :is(ol) {
    list-style: decimal;
    padding-left: 1.2em;
  }
  .rich-html :is(p) {
    margin: 0.25em 0;
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
