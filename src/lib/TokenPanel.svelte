<script>
  /**
   * @type {{
   *   playerState: object,
   *   onSpendToken?: (stat: string) => void,
   *   onAddToken?: (stat: string) => void,
   *   onSetMax?: (stat: string, val: number) => void,
   *   isGM?: boolean
   * }}
   */
  let { playerState, onSpendToken, onAddToken, onSetMax, isGM = false } = $props();

  const STATS = [
    { key: 'force',   label: 'Force',   color: '#ef4444' },
    { key: 'agilite', label: 'Agilité', color: '#22c55e' },
    { key: 'esprit',  label: 'Esprit',  color: '#3b82f6' },
    { key: 'social',  label: 'Social',  color: '#eab308' },
  ];
</script>

<div class="space-y-2">
  {#each STATS as stat}
    {@const current = playerState.tokens[stat.key] ?? 0}
    {@const max = playerState.maxTokens[stat.key] ?? 0}
    <div class="flex items-center gap-2">
      <span class="text-xs text-gray-400 w-12 shrink-0">{stat.label}</span>

      <!-- Token dots -->
      <div class="flex gap-1 flex-1 flex-wrap min-h-4">
        {#each { length: max } as _, i}
          <div
            class="w-4 h-4 rounded-full border border-gray-600 transition-colors"
            style={i < current
              ? `background-color: ${stat.color}; border-color: ${stat.color}`
              : 'background-color: #1f2937'}
          ></div>
        {/each}
        {#if max === 0}
          <span class="text-[10px] text-gray-600 italic">—</span>
        {/if}
      </div>

      <!-- Spend / add controls -->
      <div class="flex gap-1 items-center shrink-0">
        <span class="text-xs text-gray-500 w-8 text-right">{current}/{max}</span>
        {#if onSpendToken}
          <button
            onclick={() => onSpendToken(stat.key)}
            disabled={current <= 0}
            class="w-5 h-5 flex items-center justify-center text-sm bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-30 leading-none"
          >−</button>
        {/if}
        {#if onAddToken}
          <button
            onclick={() => onAddToken(stat.key)}
            disabled={current >= max}
            class="w-5 h-5 flex items-center justify-center text-sm bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-30 leading-none"
          >+</button>
        {/if}
        <!-- GM max editor -->
        {#if isGM && onSetMax}
          <input
            type="number"
            value={max}
            min="0"
            max="10"
            oninput={(e) => onSetMax(stat.key, Number(e.currentTarget.value))}
            class="w-8 text-xs bg-gray-800 border border-gray-600 rounded text-center text-gray-300 py-0.5"
            title="Max tokens"
          />
        {/if}
      </div>
    </div>
  {/each}
</div>
