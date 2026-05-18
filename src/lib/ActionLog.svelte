<script>
  /** @type {{ logs: object[], myId: string, isGM?: boolean }} */
  let { logs, myId, isGM = false } = $props();

  let visible = $state(false);

  // Players see only their own actions — GM ops and GM character are GM-only
  let filtered = $derived(
    isGM ? logs : logs.filter((/** @type {any} */ e) => e.playerId === myId)
  );

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
</script>

<div class="shrink-0">
  <button
    onclick={() => visible = !visible}
    class="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors"
    style="background: rgba(15,15,25,0.6); border-top: 1px solid rgba(255,255,255,0.06);"
  >
    <span>Journal d'actions {#if filtered.length > 0}<span class="text-gray-500">({filtered.length})</span>{/if}</span>
    <span class="text-[10px]">{visible ? '▼' : '▲'}</span>
  </button>

  {#if visible}
    <div
      class="overflow-y-auto flex flex-col-reverse gap-px px-2 py-1.5"
      style="max-height: 160px; background: rgba(10,10,20,0.85); border-top: 1px solid rgba(255,255,255,0.05);"
    >
      {#if filtered.length === 0}
        <p class="text-[10px] text-gray-600 italic text-center py-2">Aucune action enregistrée.</p>
      {:else}
        {#each [...filtered].reverse() as entry (entry.id)}
          <div class="flex gap-1.5 text-[10px] leading-snug py-0.5">
            <span class="shrink-0 text-gray-600 font-mono">{formatTime(entry.ts)}</span>
            <span class="shrink-0 font-semibold" style="color: {entry.playerId === 'gm' ? '#818cf8' : '#a3e635'};">{entry.playerName}</span>
            <span class="text-gray-300 break-words">{entry.msg}</span>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
