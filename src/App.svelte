<script>
  // Importing Svelte's 'onMount' utility function for initialization
  import { onMount } from 'svelte';
  
  // Variable to store the URL entered by the user in the input field
  let inputUrl = '';
  // Variable to store the URL that will be used for the iframe (defaults to null)
  let embedUrl = null;
  // State variable for the error message
  let errorMessage = '';

  // Function to validate and update the embed URL
  function handleEmbed() {
    errorMessage = ''; // Reset the error message

    if (!inputUrl.trim()) {
      errorMessage = "Please enter a valid URL.";
      return;
    }

    let urlToEmbed = inputUrl.trim();

    // Attempts to add the http:// protocol if no protocol is present
    if (!urlToEmbed.startsWith('http://') && !urlToEmbed.startsWith('https://')) {
      urlToEmbed = 'https://' + urlToEmbed;
    }

    try {
      // Validates if it is a well-formed URL
      new URL(urlToEmbed);
      
      // The 'embedUrl' variable is updated, which triggers the iframe display
      embedUrl = urlToEmbed;
      
    } catch (e) {
      errorMessage = "The provided URL is not in the correct format.";
    }
  }

  // Function to return to the URL input page
  function reset() {
    embedUrl = null;
    inputUrl = '';
    errorMessage = '';
  }

  // Svelte hook to ensure the application is ready (if needed)
  onMount(() => {
    console.log("URL Embedder Application started.");
  });

</script>

<!-- Updated: Background color set to custom dark gray #242424 -->
<main class="w-full h-full bg-[#242424] flex flex-col  font-sans">
  
  <!-- Application Header - Now hidden when a URL is embedded -->
  {#if !embedUrl}
    <header class="mb-6 text-center">
      <!-- Updated: Title text color changed to a lighter indigo for contrast -->
      <h1 class="text-3xl font-extrabold text-indigo-400">Improved Initiative Embedder</h1>
      <!-- Updated: Subtitle text color changed to light gray -->
      <p class="text-gray-400">Embed Improved Initiative into your session.</p>
    </header>
  {/if}

  <!-- Main Content -->
  <section class="flex-grow flex flex-col items-center justify-center">

    <!-- Displaying the URL input form -->
    {#if !embedUrl}
      <!-- Updated: Card background changed to a darker gray -->
      <div class="w-full max-w-lg p-6 bg-gray-800 shadow-xl rounded-xl transition duration-300 ease-in-out">
        <!-- Updated: Card title color changed to white -->
        <h2 class="text-xl font-semibold mb-4 text-white">Enter the URL to Embed</h2>
        
        <!-- URL Input Field -->
        <!-- Updated: Input field background, text, and border for dark theme -->
        <input
          type="text"
          bind:value={inputUrl}
          on:keydown={(e) => { if (e.key === 'Enter') handleEmbed(); }}
          placeholder="Ex: https://www.dndbeyond.com"
          class="w-full p-3 border border-gray-700 bg-gray-900 text-gray-100 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition duration-150 mb-3"
        />

        <!-- Error Message -->
        {#if errorMessage}
          <p class="text-red-500 text-sm mb-3 font-medium">{errorMessage}</p>
        {/if}

        <!-- Confirmation Button (Indigo works well on dark) -->
        <button
          on:click={handleEmbed}
          class="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50 transition duration-200 ease-in-out shadow-md hover:shadow-lg"
        >
          Confirm and Embed
        </button>
      </div>

    <!-- Displaying the Embedded Page -->
    {:else}
      <div class="w-full h-full flex flex-col">
        <div class="flex justify-between items-center">
            <!-- Updated: Display text color changed to light gray and indigo highlight -->
            <h2 class="text-lg font-medium text-gray-300 truncate mr-4">
                Displaying: <span class="font-mono text-indigo-400 text-sm">{embedUrl}</span>
            </h2>
            <!-- Button to return to input (Red works well on dark) -->
            <button
                on:click={reset}
                class="flex-shrink-0 bg-red-500 text-white text-sm font-semibold py-2 px-4 rounded-full hover:bg-red-600 transition duration-150 shadow-md"
            >
                Change URL
            </button>
        </div>

        <!-- The iframe that displays the web content -->
        <!-- Updated: Iframe border changed to a darker gray -->
        <iframe
          title="Embedded Web Content"
          src={embedUrl}
          class="w-full flex-grow border-4 border-gray-700 rounded-xl shadow-2xl"
          style="min-height: 600px; min-width: 700px;"
          frameborder="0"
          referrerpolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
        >
          <!-- Fallback error message if the browser does not support iframes -->
          Your browser does not support iframes.
        </iframe>
      </div>
    {/if}
  </section>

</main>

<!-- Note: You don't need the <style> tag here if you are using Tailwind CSS via your Vite setup. -->