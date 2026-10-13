<script>
  /**
   * In-sheet "add an item / weapon" popup — same centred-overlay pattern as
   * the capacity expand and equipment-slot popups. Unlike the ÉDITION
   * dropdown, this one adds straight into the sheet (the caller saves), so
   * players never have to enter ÉDITION just to drop a potion in the bag.
   *
   * `onPick(name, isWeapon)` — name '' means a blank entry.
   * `mode` narrows the list: 'all' (SAC), 'items' (ÉDITION INVENTAIRE),
   * 'weapons' (ÉDITION ARMES).
   */
  import { EQUIPMENT_CATALOG, FAMILY_ICONS, ITEM_ICONS } from './characterSheet.js';

  let { onPick, mode = 'all' } = $props();

  let groups = $derived(
    mode === 'weapons'
      ? EQUIPMENT_CATALOG.filter((grp) => grp.kind === 'arme')
      : mode === 'items'
        ? EQUIPMENT_CATALOG.filter((grp) => grp.kind !== 'arme')
        : EQUIPMENT_CATALOG
  );
  let title = $derived(
    mode === 'weapons' ? 'Ajouter une arme' : mode === 'items' ? 'Ajouter un objet' : 'Ajouter un objet ou une arme'
  );

  function iconFor(item, group) {
    return ITEM_ICONS[item.nom] ?? FAMILY_ICONS[group.family] ?? '';
  }

  function pick(name, isWeapon) {
    onPick?.(name, isWeapon);
  }
</script>

<div
  class="fixed inset-0 bg-black/75 flex items-center justify-center z-[75] p-4"
  onclick={() => pick(null, false)}
  onkeydown={(e) => e.key === 'Escape' && pick(null, false)}
  role="button"
  tabindex="0"
>
  <div
    class="bg-[#1f2937] border border-[#374151] rounded-lg p-4 w-[92%] max-w-md max-h-[80vh] flex flex-col"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="presentation"
  >
    <div class="flex items-start gap-3">
      <span class="text-[26px] leading-none shrink-0">🎒</span>
      <div class="flex-1 min-w-0">
        <div class="text-[16px] font-bold">{title}</div>
        <div class="text-[11px] text-[#9ca3af] mt-0.5">Ajouté directement à la fiche (pas besoin d'ÉDITION)</div>
      </div>
      <button
        onclick={() => pick(null, false)}
        title="Fermer"
        class="w-7 h-7 rounded-full bg-[#111827] border border-[#374151] text-[#9ca3af] hover:text-white text-[12px] font-bold flex items-center justify-center shrink-0 transition-colors"
      >
        ✕
      </button>
    </div>

    <div class="mt-3 flex gap-1.5">
      {#if mode !== 'weapons'}
        <button
          onclick={() => pick('', false)}
          class="flex-1 px-2 py-1.5 bg-[#111827] border border-[#374151] hover:bg-[#374151] rounded-md text-[11px] font-semibold text-indigo-300 transition-colors"
        >
          ＋ Objet vierge
        </button>
      {/if}
      {#if mode !== 'items'}
        <button
          onclick={() => pick('', true)}
          class="flex-1 px-2 py-1.5 bg-[#111827] border border-[#374151] hover:bg-[#374151] rounded-md text-[11px] font-semibold text-indigo-300 transition-colors"
        >
          🗡 Arme vierge
        </button>
      {/if}
    </div>

    <div class="mt-3 flex-1 overflow-y-auto scrollbar-thin pr-1">
      {#each groups as group}
        <div class="px-1 py-1 text-[9px] font-bold text-[#9ca3af] tracking-wide border-t border-[#374151] mt-1 pt-1.5 first:border-t-0 first:mt-0 first:pt-0">
          {group.group}
        </div>
        {#each group.items as item}
          <button
            onclick={() => pick(item.nom, group.kind === 'arme')}
            title={item.proprietes || item.effet}
            class="w-full text-left px-2 py-1.5 rounded-md text-[11px] text-gray-100 hover:bg-[#374151] transition-colors flex items-center gap-2"
          >
            <span class="w-4 shrink-0 text-center text-[13px] leading-none">{iconFor(item, group)}</span>
            <span class="truncate flex-1">{item.nom}</span>
            {#if item.de}
              <span class="text-[10px] text-[#9ca3af] shrink-0">{item.de}</span>
            {/if}
          </button>
        {/each}
      {/each}
    </div>
  </div>
</div>
