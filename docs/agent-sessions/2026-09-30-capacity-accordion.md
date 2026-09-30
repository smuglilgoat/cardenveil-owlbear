# Session — 2026-09-30 — Capacity accordion + accordion placement

## Goal
1. Give the 🪄 button an accordion like the attack one: Multiplier (0.5–20),
   Base (default Mod Esprit, up to 99), Dice (d4–d100), roll button.
2. Move BOTH accordions (attack + capacity) below the ⚔️/🪄/📝 button row.

## Change (main direct, commit `529f51a`)
- `src/SheetPopover.svelte`:
  - `showCapacity`, `capMultiplier` (×0.5–20, default 1), `capBase` ('' =
    Mod Esprit / canalisation, max 99), `capDice` (d4…d100, default d6);
  - `toggleCapacity` + shared `resizeAccordions(before)` — each toggle
    adjusts the popover height by 190 px per opened/closed accordion;
  - `doCapacityRoll`: in 3D mode throws the stage via the existing attack
    stage pipeline (`throwAttackStage`, includes the 3 s read pause; flat
    fallback on failure), then broadcasts the final flat display with
    total = dice sum × multiplier (2-dp rounded) and logs USE_CAPACITY;
  - 🪄 button now toggles the accordion (active indigo styling like ⚔️);
  - layout: quick-dice row → ⚔️/🪄/📝 button row → attack accordion →
    capacity accordion.

## Verification
- `npm run test:unit`: 206/206 pass; `npm run build`: green.
- NOTE: a first round of markup edits mangled the accordion region
  (duplicated/orphaned blocks); repaired to the final order above before
  commit — the committed diff is the clean result.

## Follow-ups
- Manual check: both accordions resize correctly when toggled together.
