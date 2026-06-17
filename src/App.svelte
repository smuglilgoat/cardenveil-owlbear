<script>
  import CardGame from './lib/CardGame.svelte';

  let activeTab = $state('game');

  /** @type {Set<string>} */
  let visited = $state(new Set(['game']));

  function selectTab(id) {
    activeTab = id;
    visited = new Set([...visited, id]);
  }

  // Shared game state received from CardGame via callback
  /** @type {any} */
  let gameState = $state(null);
  /** @type {string | null} */
  let myRole    = $state(null);
  /** @type {string | null} */
  let myId      = $state(null);
  /** @type {((action: any) => Promise<void>) | null} */
  let onAction  = $state(null);

  function handleGameChange(data) {
    gameState = data.gameState;
    myRole    = data.myRole;
    myId      = data.myId;
    onAction  = data.onAction;
  }

  // Initiative tracker embed state
  let inputUrl     = $state('');
  let errorMessage = $state('');

  let initiativeUrl = $derived(gameState?.initiativeUrl ?? null);

  function handleEmbed() {
    errorMessage = '';
    if (!inputUrl.trim()) { errorMessage = 'Veuillez entrer une URL valide.'; return; }
    let url = inputUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    try {
      new URL(url);
      onAction?.({ type: 'SET_INITIATIVE_URL', playerId: myId, url });
      inputUrl = '';
    } catch {
      errorMessage = "L'URL fournie n'est pas valide.";
    }
  }

  function clearUrl() {
    onAction?.({ type: 'SET_INITIATIVE_URL', playerId: myId, url: null });
  }

  const TABS = [
    { id: 'game',   label: 'Cartes & Tokens' },
    { id: 'sheet',  label: 'Character Sheet' },
    { id: 'embed',  label: 'Initiative Tracker' },
  ];
</script>

<main class="w-full h-screen bg-[#242424] flex flex-col font-sans overflow-hidden">

  <!-- Tab bar -->
  <div class="flex shrink-0 border-b border-gray-700 bg-gray-900 overflow-x-auto">
    {#each TABS as tab}
      <button
        onclick={() => selectTab(tab.id)}
        class="px-4 py-2 text-xs font-semibold transition-colors border-b-2 whitespace-nowrap"
        class:text-indigo-400={activeTab === tab.id}
        class:border-indigo-500={activeTab === tab.id}
        class:text-gray-500={activeTab !== tab.id}
        class:border-transparent={activeTab !== tab.id}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-hidden relative">

    <div class="w-full h-full" style:display={activeTab !== 'game' ? 'none' : ''}>
      <CardGame onGameChange={handleGameChange} />
    </div>

    {#if visited.has('sheet')}
      <div class="absolute inset-0" style:display={activeTab !== 'sheet' ? 'none' : ''}>
        <iframe
          title="Character Sheet"
          src="https://cardenveil-sheet.pages.dev/"
          class="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
        ></iframe>
      </div>
    {/if}

    {#if visited.has('embed')}
      <div class="absolute inset-0" style:display={activeTab !== 'embed' ? 'none' : ''}>
        <div class="w-full h-full flex flex-col">
          {#if !initiativeUrl}
            <div class="flex-1 flex flex-col items-center justify-center p-4">
              {#if myRole === 'GM'}
                <div class="w-full max-w-sm space-y-3">
                  <h2 class="text-sm font-semibold text-white">URL du tracker d'initiative</h2>
                  <input
                    type="text"
                    bind:value={inputUrl}
                    onkeydown={(e) => { if (e.key === 'Enter') handleEmbed(); }}
                    placeholder="Ex: https://www.improved-initiative.com"
                    class="w-full p-2.5 border border-gray-700 bg-gray-900 text-gray-100 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  {#if errorMessage}
                    <p class="text-red-400 text-xs">{errorMessage}</p>
                  {/if}
                  <button
                    onclick={handleEmbed}
                    class="w-full bg-indigo-600 text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Confirmer et intégrer
                  </button>
                </div>
              {:else}
                <p class="text-gray-400 text-sm text-center">
                  En attente du lien du tracker d'initiative par le MJ…
                </p>
              {/if}
            </div>
          {:else}
            <div class="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border-b border-gray-700 shrink-0">
              <span class="text-xs text-gray-400 truncate flex-1 font-mono">{initiativeUrl}</span>
              {#if myRole === 'GM'}
                <button onclick={clearUrl} class="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded shrink-0">
                  Changer
                </button>
              {/if}
            </div>
            <iframe
              title="Tracker d'initiative"
              src={initiativeUrl}
              class="w-full flex-1 border-0"
              referrerpolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
            ></iframe>
          {/if}
        </div>
      </div>
    {/if}

  </div>
</main>
