<script>
  /**
   * In-sheet "add an item / weapon" popup — same centred-overlay pattern as the
   * capacity expand and equipment-slot popups.
   *
   * Flow: catalogue list (or « vierge ») → **pre-filled form** → « Ajouter ».
   * The form starts from `itemFromTemplate` / `weaponFromTemplate`, so a blank
   * entry is born with a name (the SAC filters on it, which is why unnamed
   * entries never showed up) and a unique weapon can be described before it
   * lands in the sheet.
   *
   * `onPick({ name, isWeapon, quantity, draft })`; `onPick(null)` = dismissed.
   * `mode` narrows the list: 'all' (SAC), 'items' (ÉDITION INVENTAIRE),
   * 'weapons' (ÉDITION ARMES).
   */
  import {
    EQUIPMENT_CATALOG,
    FAMILY_ICONS,
    ITEM_ICONS,
    ITEM_TYPE_OPTIONS,
    findEquipmentTemplate,
    itemFromTemplate,
    weaponFromTemplate,
  } from './characterSheet.js';

  let { onPick, mode = 'all' } = $props();

  const BLANK_WEAPON = 'Nouvelle arme';
  const BLANK_ITEM = 'Nouvel objet';
  const INPUT =
    'w-full px-2 py-1 bg-[#242424] border border-[#374151] rounded text-[12px] text-gray-100 focus:outline-none focus:border-indigo-500';

  let step = $state('list'); // 'list' | 'form'
  let templateName = $state('');
  let isWeapon = $state(false);
  let draft = $state(/** @type {any} */ (null));

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
  let canAdd = $derived(Boolean((isWeapon ? draft?.nom : draft?.name)?.trim()));
  let itemQuantityField = $derived(draft?.type === 'Consommable' || draft?.type === 'Divers');

  function iconFor(item, group) {
    return ITEM_ICONS[item.nom] ?? FAMILY_ICONS[group.family] ?? '';
  }

  /** Send one payload object (positional args silently dropped a value once). */
  function pick(payload) {
    onPick?.(payload);
  }

  function dismiss() {
    pick(null);
  }

  /** Catalogue row (or blank): open the pre-filled form. */
  function openForm(name, weapon) {
    templateName = name;
    isWeapon = weapon;
    if (weapon) {
      draft = { ...weaponFromTemplate(name), nom: name ? weaponFromTemplate(name).nom : BLANK_WEAPON };
    } else {
      draft = { ...itemFromTemplate(name), name: name ? itemFromTemplate(name).name : BLANK_ITEM };
    }
    step = 'form';
  }

  function submit() {
    if (!canAdd) return;
    const quantity = itemQuantityField ? draft.quantite : undefined;
    pick({ name: templateName, isWeapon, quantity, draft: { ...draft } });
  }
</script>

<div
  class="fixed inset-0 bg-black/75 flex items-center justify-center z-[75] p-4"
  onclick={() => (step === 'form' ? (step = 'list') : dismiss())}
  onkeydown={(e) => e.key === 'Escape' && (step === 'form' ? (step = 'list') : dismiss())}
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
      <span class="text-[26px] leading-none shrink-0">{step === 'form' ? (isWeapon ? '🗡' : '🎒') : '🎒'}</span>
      <div class="flex-1 min-w-0">
        <div class="text-[16px] font-bold">
          {step === 'form' ? (isWeapon ? 'Nouvelle arme' : 'Nouvel objet') : title}
        </div>
        <div class="text-[11px] text-[#9ca3af] mt-0.5">
          {step === 'form'
            ? templateName
              ? `Prérempli depuis « ${templateName} » — modifie puis ajoute`
              : 'Vierge — complète puis ajoute'
            : 'Ajouté directement à la fiche (pas besoin d\'ÉDITION)'}
        </div>
      </div>
      <button
        onclick={() => (step === 'form' ? (step = 'list') : dismiss())}
        title={step === 'form' ? 'Retour à la liste' : 'Fermer'}
        class="w-7 h-7 rounded-full bg-[#111827] border border-[#374151] text-[#9ca3af] hover:text-white text-[12px] font-bold flex items-center justify-center shrink-0 transition-colors"
      >
        ✕
      </button>
    </div>

    {#if step === 'form' && draft}
      <!-- ── Pre-filled form ─────────────────────────────────────────── -->
      <div class="mt-3 space-y-2">
        {#if isWeapon}
          <div class="flex gap-1.5">
            <label class="flex-1 min-w-0">
              <span class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">NOM</span>
              <input class={INPUT} bind:value={draft.nom} autofocus />
            </label>
            <label class="w-16 shrink-0">
              <span class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">ICÔNE</span>
              <input class="{INPUT} text-center" bind:value={draft.icon} placeholder="🐾" />
            </label>
          </div>
          <div class="flex gap-1.5">
            <label class="w-20 shrink-0">
              <span class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">DÉ</span>
              <input class={INPUT} bind:value={draft.de} placeholder="1d8" />
            </label>
            <label class="flex-1 min-w-0">
              <span class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">DÉGÂTS</span>
              <input class={INPUT} bind:value={draft.degats} placeholder="tranchant" />
            </label>
            <label class="w-20 shrink-0">
              <span class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">BONUS</span>
              <input class={INPUT} bind:value={draft.bonus} placeholder="+2" />
            </label>
          </div>
          <label class="block">
            <span class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">PROPRIÉTÉS</span>
            <input class={INPUT} bind:value={draft.proprietes} placeholder="Finesse, Légère, Garde" />
          </label>
        {:else}
          <div class="flex gap-1.5">
            <label class="flex-1 min-w-0">
              <span class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">NOM</span>
              <input class={INPUT} bind:value={draft.name} autofocus />
            </label>
            <label class="w-16 shrink-0">
              <span class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">ICÔNE</span>
              <input class="{INPUT} text-center" bind:value={draft.icon} placeholder="🧪" />
            </label>
          </div>
          <div class="flex gap-1.5">
            <label class="flex-1 min-w-0">
              <span class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">TYPE</span>
              <select class={INPUT} bind:value={draft.type}>
                {#each ITEM_TYPE_OPTIONS as option}
                  <option value={option}>{option}</option>
                {/each}
              </select>
            </label>
            {#if itemQuantityField}
              <label class="w-20 shrink-0">
                <span class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">QUANTITÉ</span>
                <input type="number" min="1" max="99" class={INPUT} bind:value={draft.quantite} />
              </label>
            {/if}
          </div>
          {#if draft.type === 'Arme'}
            <label class="block">
              <span class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">DÉGÂTS</span>
              <input class={INPUT} bind:value={draft.degats} placeholder="1d6 tranchant" />
            </label>
          {/if}
          <label class="block">
            <span class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">ATTRIBUTS</span>
            <input class={INPUT} bind:value={draft.attributs} placeholder="Effet, propriétés…" />
          </label>
          <label class="block">
            <span class="block text-[9px] font-bold text-[#9ca3af] mb-0.5">DESCRIPTION</span>
            <textarea rows="2" class={INPUT} bind:value={draft.description}></textarea>
          </label>
        {/if}
      </div>

      <div class="flex gap-1.5 mt-3">
        <button
          onclick={() => (step = 'list')}
          class="flex-1 px-2 py-1.5 bg-[#242424] border border-[#374151] hover:bg-[#374151] rounded-md text-[11px] font-semibold text-[#9ca3af] hover:text-white transition-colors"
        >← Retour</button>
        <button
          onclick={submit}
          disabled={!canAdd}
          title={canAdd ? 'Ajouter à la fiche' : 'Donne un nom à l\'objet'}
          class="flex-1 px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-md text-[11px] font-bold text-white transition-colors"
        >＋ Ajouter</button>
      </div>
    {:else}
      <!-- ── Catalogue list ───────────────────────────────────────────── -->
      <div class="mt-3 flex gap-1.5">
        {#if mode !== 'weapons'}
          <button
            onclick={() => openForm('', false)}
            class="flex-1 px-2 py-1.5 bg-[#111827] border border-[#374151] hover:bg-[#374151] rounded-md text-[11px] font-semibold text-indigo-300 transition-colors"
          >
            ＋ Objet vierge
          </button>
        {/if}
        {#if mode !== 'items'}
          <button
            onclick={() => openForm('', true)}
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
              onclick={() => openForm(item.nom, group.kind === 'arme')}
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
    {/if}
  </div>
</div>
