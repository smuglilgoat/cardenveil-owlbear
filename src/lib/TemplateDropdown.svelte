<script>
  import { FAMILY_ICONS, ITEM_ICONS } from './characterSheet.js';

  /**
   * Dropdown add-button for equipment-catalog templates. Renders a pill
   * button that opens a menu ABOVE the button (the add buttons live at the
   * bottom of the ÉDITION INVENTAIRE section): a blank entry ("— Vide —")
   * + one section per catalog group, each row carrying its item/family icon
   * so weapons are tellable at a glance.
   */
  let { label, groups, onPick } = $props();

  let open = $state(false);

  function pick(name) {
    open = false;
    onPick(name);
  }

  /** Specific item icon first, catalog-family icon as fallback. */
  function iconFor(item, group) {
    return ITEM_ICONS[item.nom] ?? FAMILY_ICONS[group.family] ?? '';
  }
</script>

<div class="relative shrink-0">
  <button
    onclick={() => (open = !open)}
    class="px-3 py-1 bg-indigo-600 rounded-full text-[11px] font-semibold text-white hover:bg-indigo-500 transition-colors whitespace-nowrap flex items-center gap-1"
  >
    {label} <span class="text-[8px] leading-none">▴</span>
  </button>
  {#if open}
    <!-- click-away catcher: dims the page instead of an opaque overlay -->
    <div class="fixed inset-0 z-20 bg-black/30" onclick={() => (open = false)} role="presentation"></div>
    <div class="absolute right-0 bottom-full mb-1 w-64 max-h-72 overflow-y-auto bg-[#111827] border border-[#374151] rounded-lg shadow-xl z-30 py-1">
      <button
        onclick={() => pick('')}
        class="w-full text-left px-3 py-1.5 text-[11px] font-semibold text-indigo-300 hover:bg-[#1f2937] transition-colors"
      >
        — Vide —
      </button>
      {#each groups as grp}
        <div class="px-3 py-1 text-[9px] font-bold text-[#9ca3af] tracking-wide border-t border-[#374151] mt-1 pt-1.5">{grp.group}</div>
        {#each grp.items as item}
          <button
            onclick={() => pick(item.nom)}
            title={item.proprietes || item.effet}
            class="w-full text-left px-3 py-1.5 text-[11px] text-gray-100 hover:bg-[#1f2937] transition-colors flex items-center gap-1.5"
          >
            <span class="w-4 shrink-0 text-center text-[12px] leading-none">{iconFor(item, grp)}</span>
            <span class="truncate">{item.nom}{item.de ? ` — ${item.de}` : ''}</span>
          </button>
        {/each}
      {/each}
    </div>
  {/if}
</div>
