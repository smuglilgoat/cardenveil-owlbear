# Session — 2026-09-30 — ÉDITION tab sync + SAC item order

## Goal
1. Clicking ÉDITION should open the edit modal directly on the section of the
   tab the user is viewing (ÉDITION from INVENTAIRE → lands on INVENTAIRE).
2. (Carried over) A newly added item should appear at the top of the list,
   not the bottom.

## Findings
- The ÉDITION item/weapon lists already prepend (commit `3ce8032`, 2.4.0) —
  a new item is already first there.
- The only place a new item really showed up at the bottom was the view-mode
  **SAC chips**: `[...unequippedGear, ...bagItems]` rendered gear first, so a
  freshly added consumable/Divers landed last.

## Change (main direct, commit `e2514be`)
- `startEdit()` now sets `editTab = activeTab` — `EDIT_TABS` ids are exactly
  the view tab ids plus identite/stats, so the mapping is direct.
- SAC chips flipped to `[...bagItems, ...unequippedGear]`: since ÉDITION-add
  prepends to `inventoryItems`, newly added consumables/Divers now show first.

## Verification
- `npm run test:unit`: 201/201 pass; `npm run build`: green.
- Assumption flagged to user: if they meant a different list than the SAC
  chips, they should say so (the ÉDITION list already shows new items on top).
