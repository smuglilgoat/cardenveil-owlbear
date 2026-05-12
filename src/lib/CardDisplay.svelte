<script>
  /** @type {{ card: object, faceDown?: boolean, actions?: Array<{label: string, onClick: () => void}>, crystallized?: boolean }} */
  let { card, faceDown = false, actions = [], crystallized = false } = $props();
</script>

{#if faceDown}
  <div class="relative w-12 h-[4.5rem] rounded-md border-2 border-indigo-700 bg-indigo-950 flex items-center justify-center select-none shrink-0">
    <div class="w-8 h-12 rounded border border-indigo-700 bg-indigo-900 flex items-center justify-center">
      <span class="text-indigo-500 text-xs">✦</span>
    </div>
  </div>
{:else}
  <div
    class="relative w-12 h-[4.5rem] rounded-md bg-white select-none shrink-0 shadow-sm group"
    class:ring-2={crystallized}
    class:ring-amber-400={crystallized}
    class:cursor-pointer={actions.length > 0}
  >
    <!-- Card border -->
    <div class="absolute inset-0 rounded-md border border-gray-200 pointer-events-none"></div>

    <!-- Top corner -->
    <div
      class="absolute top-0.5 left-0.5 leading-none text-[9px] font-bold"
      class:text-red-600={card.isRed}
      class:text-gray-900={!card.isRed}
    >
      {card.value}<br /><span class="text-[10px]">{card.suit}</span>
    </div>

    <!-- Center suit -->
    <div
      class="absolute inset-0 flex items-center justify-center text-lg pointer-events-none"
      class:text-red-600={card.isRed}
      class:text-gray-900={!card.isRed}
    >
      {card.suit}
    </div>

    <!-- Bottom corner (rotated) -->
    <div
      class="absolute bottom-0.5 right-0.5 leading-none text-[9px] font-bold rotate-180"
      class:text-red-600={card.isRed}
      class:text-gray-900={!card.isRed}
    >
      {card.value}<br /><span class="text-[10px]">{card.suit}</span>
    </div>

    <!-- Hover action overlay -->
    {#if actions.length > 0}
      <div class="absolute inset-0 bg-black/80 rounded-md hidden group-hover:flex flex-col items-center justify-center gap-0.5 p-1 z-10">
        {#each actions as action}
          <button
            onclick={action.onClick}
            class="text-[8px] bg-indigo-600 hover:bg-indigo-500 text-white px-1 py-0.5 rounded w-full text-center leading-tight"
          >
            {action.label}
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}
