<script>
  /**
   * In-sheet "add an item / weapon" popup — same centred-overlay pattern as
   * the capacity expand and equipment-slot popups. Unlike the ÉDITION
   * dropdown, this one adds straight into the sheet (the caller saves), so
   * players never have to enter ÉDITION just to drop a potion in the bag.
   *
   * `onPick(name, isWeapon, quantity)` — name '' means a blank entry.
   * `mode` narrows the list: 'all' (SAC), 'items' (ÉDITION INVENTAIRE),
   * 'weapons' (ÉDITION ARMES).
   * `askQuantity` inserts a quantity step for consumables (used by the GM so
   * he can drop 3 potions in one go instead of adding them one by one).
   */
  import { EQUIPMENT_CATALOG, FAMILY_ICONS, ITEM_ICONS, findEquipmentTemplate } from './characterSheet.js';

  let { onPick, mode = 'all', askQuantity = false } = $props();

  const MAX_QTY = 99;

  // Consumable awaiting a quantity: { name } while the step is shown
  let qtyTarget = $state(/** @type {{name: string}|null} */ (null));
  let qty = $state(1);
  let qtyName = $derived(qtyTarget?.name ?? '');
  let qtyIcon = $derived(ITEM_ICONS[qtyName] ?? FAMILY_ICONS['Consommables'] ?? '🧪');

  function setQty(next) {
    qty = Math.max(1, Math.min(MAX_QTY, Math.round(Number(next) || 1)));
  }

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

  /** Catalogue rows: consumables go through the quantity step when asked. */
  function pickTemplate(item, group) {
    const isWeapon = group.kind === 'arme';
    if (askQuantity && !isWeapon && findEquipmentTemplate(item.nom)?.kind === 'consommable') {
      qtyTarget = { name: item.nom };
      setQty(1);
      return;
    }
    pick(item.nom, isWeapon);
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
        onclick={() => (qtyTarget ? (qtyTarget = null) : pick(null, false))}
        title="Fermer"
        class="w-7 h-7 rounded-full bg-[#111827] border border-[#374151] text-[#9ca3af] hover:text-white text-[12px] font-bold flex items-center justify-center shrink-0 transition-colors"
      >
        ✕
      </button>
    </div>

    {#if qtyTarget}
      <!-- Quantity step (consumables) -->
      <div class="mt-3 bg-[#111827] border border-[#374151] rounded-lg p-3">
        <div class="flex items-center gap-2">
          <span class="text-[18px] leading-none shrink-0">{qtyIcon}</span>
          <span class="text-[13px] font-semibold text-white truncate flex-1">{qtyName}</span>
        </div>
        <div class="flex items-center justify-between gap-2 mt-2.5">
          <span class="text-[10px] font-bold text-[#9ca3af]">QUANTITÉ</span>
          <div class="flex items-center gap-1.5">
            <button
              onclick={() => setQty(qty - 1)}
              class="w-7 h-7 rounded-md bg-[#242424] border border-[#374151] text-white font-bold hover:bg-[#374151] transition-colors"
            >−</button>
            <input
              type="number" min="1" max={MAX_QTY} step="1"
              bind:value={qty}
              oninput={() => setQty(qty)}
              class="w-16 px-1.5 py-1 bg-[#242424] border border-[#374151] rounded-md text-center text-[13px] font-bold focus:outline-none focus:border-indigo-500"
            />
            <button
              onclick={() => setQty(qty + 1)}
              class="w-7 h-7 rounded-md bg-[#242424] border border-[#374151] text-white font-bold hover:bg-[#374151] transition-colors"
            >＋</button>
          </div>
        </div>
        <div class="flex gap-1.5 mt-3">
          <button
            onclick={() => (qtyTarget = null)}
            class="flex-1 px-2 py-1.5 bg-[#242424] border border-[#374151] hover:bg-[#374151] rounded-md text-[11px] font-semibold text-[#9ca3af] hover:text-white transition-colors"
          >← Retour</button>
          <button
            onclick={() => { const name = qtyName; const n = qty; qtyTarget = null; pick(name, false, n); }}
            class="flex-1 px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-md text-[11px] font-bold text-white transition-colors"
          >Ajouter ×{qty}</button>
        </div>
      </div>
    {/if}

    <div class="mt-3 flex gap-1.5" class:hidden={qtyTarget}>
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

    <div class="mt-3 flex-1 overflow-y-auto scrollbar-thin pr-1" class:hidden={qtyTarget}>
      {#each groups as group}
        <div class="px-1 py-1 text-[9px] font-bold text-[#9ca3af] tracking-wide border-t border-[#374151] mt-1 pt-1.5 first:border-t-0 first:mt-0 first:pt-0">
          {group.group}
        </div>
        {#each group.items as item}
          <button
            onclick={() => pickTemplate(item, group)}
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
