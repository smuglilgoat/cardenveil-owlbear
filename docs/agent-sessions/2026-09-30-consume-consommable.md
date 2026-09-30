# Session — 2026-09-30 — Consume consumables from the SAC view

## Goal
Consommable items in the INVENTAIRE/SAC section of the character sheet should
be consumable directly from that view: clickable chip → confirmation overlay →
quantity −1.

## Change (branch `agent/consume-consommable`, commit `8d59062`)
- `src/lib/CharacterSheet.svelte`:
  - `consumeTarget` state + `consumeItem()` — decrements the clicked item's
    `quantite` by 1 (floors at 0; the item stays at 0 rather than being removed)
    and saves immediately via `saveSheet` (same immediate-save + sync path as
    pins/action diamonds);
  - Consommable chips in the SAC view get `cursor-pointer` + hover ring and an
    `onclick` (view mode only — inert while ÉDITION is open; reference match,
    `view === sheet` outside editing);
  - confirmation overlay styled after the existing delete-confirm overlay
    (icon + name + quantity + effet, Annuler / Consommer);
  - only `Consommable` items are clickable — Divers/weapons/gear unchanged.

## Verification
- `npm run test:unit`: 201/201 pass; `npm run build`: green.
- Manual live-room check pending (chips render in view mode, overlay, −1,
  sync to compact popover).

## Notes
- An edit slip briefly damaged the `showDeleteConfirm` overlay markup; it was
  restored byte-identical in the same commit (no behavioral change).
- Items at quantity 0 remain listed; add auto-removal later if desired.
