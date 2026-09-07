<script>
  import { onMount } from 'svelte';
  import { 
    fetchCharacterSheet, 
    saveCharacterSheet, 
    deleteCharacterSheet,
    importCharacterSheet,
    createEmptyCharacterSheet,
    rollDice,
    subscribeToCharacterSheet
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
  let activeTab = $state('identity');
  let diceResult = $state(null);
  let importError = $state('');

  const TABS = [
    { id: 'identity', label: 'Identité' },
    { id: 'stats', label: 'Stats' },
    { id: 'skills', label: 'Compétences' },
    { id: 'capacities', label: 'Capacités' },
    { id: 'equipment', label: 'Équipement' },
    { id: 'narrative', label: 'Narratif' }
  ];

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
    isEditing = true;
  }

  function cancelEdit() {
    editSheet = null;
    isEditing = false;
  }

  async function saveEdit() {
    isSaving = true;
    try {
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
      const result = rollDice(formula);
      diceResult = {
        formula,
        ...result,
        timestamp: new Date().toLocaleTimeString()
      };
      onAction({
        type: 'USE_CAPACITY',
        playerId,
        capacityName,
        formula,
        total: result.total,
        rolls: result.rolls,
      });
    } catch (err) {
      diceResult = { error: err.message };
    }
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
    const value = sheet?.stats?.[stat] || 10;
    return Math.floor((value - 10) / 2);
  }

  function formatModifier(value) {
    return value >= 0 ? `+${value}` : `${value}`;
  }
</script>

<div class="w-full h-full bg-gray-900 flex flex-col overflow-hidden">
  {#if isLoading}
    <div class="flex-1 flex items-center justify-center">
      <div class="text-gray-400">Chargement de la fiche de personnage...</div>
    </div>
  {:else}
    <!-- Header -->
    <div class="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-4">
        <div class="w-16 h-16 bg-gray-700 rounded-lg flex items-center justify-center text-2xl">
          🎭
        </div>
        <div>
          <h1 class="text-xl font-bold text-white">
            {sheet.identity?.nom || 'Sans nom'}
          </h1>
          <p class="text-sm text-gray-400">
            {sheet.identity?.race || 'Race inconnue'} • Niveau {sheet.identity?.niveau || 1}
          </p>
        </div>
      </div>
      <div class="flex gap-2">
        {#if isEditing}
          <button
            onclick={cancelEdit}
            disabled={isSaving}
            class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onclick={saveEdit}
            disabled={isSaving}
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        {:else}
          <button
            onclick={handleImport}
            class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Importer
          </button>
          <button
            onclick={() => showDeleteConfirm = true}
            class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            Supprimer
          </button>
          <button
            onclick={startEdit}
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
          >
            Éditer
          </button>
        {/if}
      </div>
    </div>

    {#if importError}
      <div class="bg-red-900 border-b border-red-700 px-6 py-3 text-red-200 text-sm">
        Erreur d'import: {importError}
      </div>
    {/if}

    <!-- Tabs -->
    <div class="bg-gray-800 border-b border-gray-700 flex shrink-0">
      {#each TABS as tab}
        <button
          onclick={() => activeTab = tab.id}
          class="px-6 py-3 text-sm font-medium transition-colors border-b-2"
          class:border-indigo-500={activeTab === tab.id}
          class:text-white={activeTab === tab.id}
          class:border-transparent={activeTab !== tab.id}
          class:text-gray-400={activeTab !== tab.id}
          class:hover:text-gray-300={activeTab !== tab.id}
        >
          {tab.label}
        </button>
      {/each}
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6">
      {#if activeTab === 'identity'}
        <div class="max-w-4xl mx-auto space-y-6">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Nom</label>
              {#if isEditing}
                <input
                  type="text"
                  bind:value={editSheet.identity.nom}
                  class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              {:else}
                <div class="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white">
                  {sheet.identity?.nom || '—'}
                </div>
              {/if}
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Joueur</label>
              {#if isEditing}
                <input
                  type="text"
                  bind:value={editSheet.identity.joueur}
                  class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              {:else}
                <div class="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white">
                  {sheet.identity?.joueur || '—'}
                </div>
              {/if}
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Race</label>
              {#if isEditing}
                <input
                  type="text"
                  bind:value={editSheet.identity.race}
                  class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              {:else}
                <div class="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white">
                  {sheet.identity?.race || '—'}
                </div>
              {/if}
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Niveau</label>
              {#if isEditing}
                <input
                  type="number"
                  bind:value={editSheet.identity.niveau}
                  class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              {:else}
                <div class="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white">
                  {sheet.identity?.niveau || 1}
                </div>
              {/if}
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Alignement</label>
              {#if isEditing}
                <input
                  type="text"
                  bind:value={editSheet.identity.alignement}
                  class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              {:else}
                <div class="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white">
                  {sheet.identity?.alignement || '—'}
                </div>
              {/if}
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Âge</label>
              {#if isEditing}
                <input
                  type="text"
                  bind:value={editSheet.identity.age}
                  class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              {:else}
                <div class="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white">
                  {sheet.identity?.age || '—'}
                </div>
              {/if}
            </div>
          </div>
        </div>

      {:else if activeTab === 'stats'}
        <div class="max-w-4xl mx-auto space-y-6">
          <h2 class="text-lg font-bold text-white">Attributs</h2>
          <div class="grid grid-cols-2 gap-4">
            {#each ['force', 'agilite', 'esprit', 'social'] as stat}
              <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <div class="flex justify-between items-center mb-2">
                  <label class="text-sm font-medium text-gray-300 capitalize">{stat}</label>
                  <span class="text-lg font-bold text-white">
                    {formatModifier(getStatModifier(stat))}
                  </span>
                </div>
                {#if isEditing}
                  <input
                    type="number"
                    bind:value={editSheet.stats[stat]}
                    class="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-center text-xl font-bold focus:outline-none focus:border-indigo-500"
                  />
                {:else}
                  <div class="px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-center text-xl font-bold">
                    {sheet.stats?.[stat] || 10}
                  </div>
                {/if}
              </div>
            {/each}
          </div>

          <h2 class="text-lg font-bold text-white mt-8">Points de vie</h2>
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">PV Max</label>
              {#if isEditing}
                <input type="number" bind:value={editSheet.derived.pvMax} class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
              {:else}
                <div class="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white">{sheet.derived?.pvMax || 0}</div>
              {/if}
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">PV Actuels</label>
              {#if isEditing}
                <input type="number" bind:value={editSheet.derived.pvActuels} class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
              {:else}
                <div class="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white">{sheet.derived?.pvActuels || 0}</div>
              {/if}
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">PV Temporaires</label>
              {#if isEditing}
                <input type="number" bind:value={editSheet.derived.pvTemporaires} class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
              {:else}
                <div class="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white">{sheet.derived?.pvTemporaires || 0}</div>
              {/if}
            </div>
          </div>

          <h2 class="text-lg font-bold text-white mt-8">Tokens</h2>
          <div class="grid grid-cols-4 gap-4">
            {#each ['force', 'agilite', 'esprit', 'social'] as token}
              <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
                <label class="block text-xs font-medium text-gray-400 mb-2 capitalize">{token}</label>
                {#if isEditing}
                  <input type="number" bind:value={editSheet.resources.tokens[token]} class="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-center" />
                {:else}
                  <div class="px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-center font-bold">
                    {sheet.resources?.tokens?.[token] || 0}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>

      {:else if activeTab === 'skills'}
        <div class="max-w-4xl mx-auto">
          <h2 class="text-lg font-bold text-white mb-4">Compétences</h2>
          <div class="grid grid-cols-2 gap-3">
            {#each Object.entries(sheet.skills || {}) as [skill, data]}
              <div class="bg-gray-800 border border-gray-700 rounded-lg p-3 flex items-center justify-between">
                <div class="flex items-center gap-3">
                  {#if isEditing}
                    <input type="checkbox" bind:checked={editSheet.skills[skill].trained} class="w-4 h-4" />
                  {:else}
                    <div class="w-4 h-4 rounded border-2 {data.trained ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600'}"></div>
                  {/if}
                  <span class="text-sm text-white capitalize">{skill}</span>
                </div>
                {#if isEditing}
                  <input type="number" bind:value={editSheet.skills[skill].bonus} class="w-16 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-center text-sm" />
                {:else}
                  <span class="text-sm font-bold text-white">{formatModifier(data.bonus || 0)}</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>

      {:else if activeTab === 'capacities'}
        <div class="max-w-4xl mx-auto">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold text-white">Capacités</h2>
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
                class="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded transition-colors"
              >
                + Ajouter
              </button>
            {/if}
          </div>

          <div class="space-y-3">
            {#each sheet.capacities || [] as capacity, i}
              <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
                {#if isEditing}
                  <div class="space-y-3">
                    <input
                      type="text"
                      placeholder="Nom de la capacité"
                      bind:value={editSheet.capacities[i].name}
                      class="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white font-bold"
                    />
                    <textarea
                      placeholder="Description"
                      bind:value={editSheet.capacities[i].description}
                      class="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm"
                      rows="2"
                    ></textarea>
                    <div class="grid grid-cols-3 gap-2">
                      <div>
                        <label class="block text-xs text-gray-400 mb-1">Coût total</label>
                        <input type="number" bind:value={editSheet.capacities[i].cost.total} class="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-sm" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-400 mb-1">Couleur</label>
                        <input type="text" bind:value={editSheet.capacities[i].cost.color} class="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-sm" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-400 mb-1">Usage</label>
                        <input type="text" bind:value={editSheet.capacities[i].usage} class="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-sm" />
                      </div>
                    </div>
                    <div class="flex gap-2">
                      <label class="flex items-center gap-2 text-sm text-gray-300">
                        <input type="checkbox" bind:checked={editSheet.capacities[i].prepared} class="w-4 h-4" />
                        Préparée
                      </label>
                      <button
                        onclick={() => {
                          editSheet.capacities.splice(i, 1);
                          editSheet.capacities = [...editSheet.capacities];
                        }}
                        class="ml-auto px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                {:else}
                  <div class="flex justify-between items-start">
                    <div class="flex-1">
                      <div class="flex items-center gap-2 mb-1">
                        <h3 class="text-base font-bold text-white">{capacity.name || 'Sans nom'}</h3>
                        {#if capacity.prepared}
                          <span class="px-2 py-0.5 bg-indigo-600 text-white text-xs rounded">Préparée</span>
                        {/if}
                      </div>
                      <p class="text-sm text-gray-400 mb-2">{capacity.description || ''}</p>
                      <div class="flex gap-4 text-xs text-gray-500">
                        <span>Coût: {capacity.cost?.total || 0} {capacity.cost?.color || ''}</span>
                        <span>Usage: {capacity.usage || '—'}</span>
                      </div>
                    </div>
                    {#if capacity.value?.main}
                      <button
                        onclick={() => checkUnsavedChanges(() => handleDiceRoll(capacity.name || 'Capacité', capacity.value.main))}
                        class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold rounded transition-colors"
                      >
                        {capacity.value.main}
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>

          {#if diceResult}
            <div class="mt-4 bg-indigo-900 border border-indigo-700 rounded-lg p-4">
              <div class="text-sm text-indigo-200 mb-1">Résultat du lancer ({diceResult.timestamp})</div>
              <div class="text-2xl font-bold text-white">{diceResult.total}</div>
              <div class="text-xs text-indigo-300 mt-1">
                {diceResult.formula}: {diceResult.rolls.join(', ')}{diceResult.modifier ? ` ${diceResult.modifier > 0 ? '+' : ''}${diceResult.modifier}` : ''}
              </div>
            </div>
          {/if}
        </div>

      {:else if activeTab === 'equipment'}
        <div class="max-w-4xl mx-auto space-y-6">
          <h2 class="text-lg font-bold text-white">Équipement</h2>
          {#each ['casque', 'plastron', 'gantelets', 'bottes', 'anneau', 'amulette', 'cape'] as slot}
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <h3 class="text-sm font-bold text-gray-300 mb-3 capitalize">{slot}</h3>
              <div class="space-y-2">
                <div>
                  <label class="block text-xs text-gray-400 mb-1">Nom</label>
                  {#if isEditing}
                    <input type="text" bind:value={editSheet.equipment[slot].nom} class="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm" />
                  {:else}
                    <div class="px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm">{sheet.equipment?.[slot]?.nom || '—'}</div>
                  {/if}
                </div>
                <div>
                  <label class="block text-xs text-gray-400 mb-1">Description</label>
                  {#if isEditing}
                    <textarea bind:value={editSheet.equipment[slot].description} class="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm" rows="2"></textarea>
                  {:else}
                    <div class="px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm">{sheet.equipment?.[slot]?.description || '—'}</div>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>

      {:else if activeTab === 'narrative'}
        <div class="max-w-4xl mx-auto space-y-6">
          <h2 class="text-lg font-bold text-white">Narratif</h2>
          {#each ['background', 'objectif', 'personnalite', 'reputation', 'education', 'croyances', 'cicatrices', 'pulsion', 'maniesEtTics', 'instinct'] as field}
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2 capitalize">{field}</label>
              {#if isEditing}
                <textarea bind:value={editSheet.narrative[field]} class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" rows="3"></textarea>
              {:else}
                <div class="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white whitespace-pre-wrap">{sheet.narrative?.[field] || '—'}</div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Unsaved Changes Modal -->
  {#if showUnsavedModal}
    <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-md">
        <h3 class="text-lg font-bold text-white mb-4">Modifications non sauvegardées</h3>
        <p class="text-gray-300 mb-6">
          Vous avez des modifications non sauvegardées. Voulez-vous sauvegarder avant de continuer ?
        </p>
        <div class="flex gap-3">
          <button
            onclick={discardAndContinue}
            class="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Ignorer
          </button>
          <button
            onclick={confirmSaveAndContinue}
            class="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
          >
            Sauvegarder
          </button>
          <button
            onclick={() => { showUnsavedModal = false; pendingAction = null; }}
            class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Delete Confirmation Modal -->
  {#if showDeleteConfirm}
    <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-md">
        <h3 class="text-lg font-bold text-white mb-4">Confirmer la suppression</h3>
        <p class="text-gray-300 mb-6">
          Êtes-vous sûr de vouloir supprimer cette fiche de personnage ? Cette action est irréversible.
        </p>
        <div class="flex gap-3">
          <button
            onclick={() => showDeleteConfirm = false}
            class="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            onclick={handleDelete}
            class="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
