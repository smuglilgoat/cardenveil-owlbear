<script>
  /**
   * In-frame modal for the hand popover — same look as the inventory modals:
   * a dark backdrop over the cards + bar and a centred panel. The hand popover
   * grows itself while one is open (see `fitPopover` in HandPopover), so the
   * panel is measured through `[data-modal-panel]`.
   *
   * `closable={false}` for forced decisions (Halfling choice, incoming
   * exchange): no ✕, and backdrop/Escape do nothing.
   */
  let { title = '', accent = '#6366f1', closable = true, onClose = () => {}, children } = $props();
</script>

<div
  class="fixed inset-0 z-[200] flex items-center justify-center p-2"
  style="background: rgba(0,0,0,0.72);"
  onclick={() => closable && onClose()}
  onkeydown={(e) => e.key === 'Escape' && closable && onClose()}
  role="button"
  tabindex="0"
>
  <div
    data-modal-panel
    class="bg-[#1f2937] border border-[#374151] rounded-lg p-3 w-full max-w-[520px] max-h-[68vh] overflow-y-auto scrollbar-thin"
    style="border-top: 2px solid {accent};"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="presentation"
  >
    <div class="flex items-start gap-2">
      <div class="text-[12px] font-bold flex-1" style="color: {accent}">{title}</div>
      {#if closable}
        <button
          onclick={onClose}
          title="Fermer"
          class="w-6 h-6 p-0 flex items-center justify-center rounded-full bg-[#111827] border border-[#374151] text-[#9ca3af] hover:text-white text-[11px] font-bold shrink-0 transition-colors"
        >✕</button>
      {/if}
    </div>
    <div class="mt-2.5">{@render children?.()}</div>
  </div>
</div>
