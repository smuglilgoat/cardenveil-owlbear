<script>
  import CardGame from './lib/CardGame.svelte';

  let activeTab = $state('game');

  // Initiative tracker embed state
  let inputUrl    = $state('');
  let embedUrl    = $state(null);
  let errorMessage = $state('');

  function handleEmbed() {
    errorMessage = '';
    if (!inputUrl.trim()) { errorMessage = 'Veuillez entrer une URL valide.'; return; }
    let url = inputUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    try {
      new URL(url);
      embedUrl = url;
    } catch {
      errorMessage = "L'URL fournie n'est pas valide.";
    }
  }

  function resetEmbed() { embedUrl = null; inputUrl = ''; errorMessage = ''; }

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
        onclick={() => activeTab = tab.id}
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
  <div class="flex-1 overflow-hidden">

    {#if activeTab === 'game'}
      <CardGame />

    {:else if activeTab === 'sheet'}
      <iframe
        title="Character Sheet"
        src="https://cardenveil-sheet.pages.dev/"
        class="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
      ></iframe>

    {:else}
      <div class="w-full h-full flex flex-col">
        {#if !embedUrl}
          <div class="flex-1 flex flex-col items-center justify-center p-4">
            <div class="w-full max-w-sm space-y-3">
              <h2 class="text-sm font-semibold text-white">URL à intégrer</h2>
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
          </div>
        {:else}
          <div class="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border-b border-gray-700 shrink-0">
            <span class="text-xs text-gray-400 truncate flex-1 font-mono">{embedUrl}</span>
            <button onclick={resetEmbed} class="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded shrink-0">
              Changer
            </button>
          </div>
          <iframe
            title="Contenu intégré"
            src={embedUrl}
            class="w-full flex-1 border-0"
            referrerpolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
          ></iframe>
        {/if}
      </div>
    {/if}

  </div>
</main>
