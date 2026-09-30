# Session — 2026-09-30 — Depleted consumables in the SAC

## Goal
Consumable chips at quantity 0 in the INVENTAIRE/SAC view must be grayed out
and non-clickable.

## Change (main direct, commit `cfa65f9`)
- `src/lib/CharacterSheet.svelte` — SAC chip rendering now derives two flags:
  - `consumable`: view mode + type Consommable + quantity ≠ 0 → clickable
    (opens the consume confirmation as before);
  - `depleted`: type Consommable + quantity 0 → `cursor-not-allowed`,
    `opacity-40 grayscale`, no onclick.
- Items without a quantity field keep behaving as quantity 1 (consistent
  with the consume logic's default).

## Verification
- `npm run test:unit`: 206/206 pass; `npm run build`: green.
