# Session — 2026-09-30 — Capacity accordion slider rework

## Goal
🪄 accordion: no more input fields — sliders like the ⚔️ accordion.
1. Slider 1: MULTIPLICATEUR 0.5–20, default 1.
2. Row of 4 buttons selecting the stat for the mod base (default Esprit).
3. Slider 3: the stat Mod, running from the selected stat's mod up to 20,
   defaulting to the stat mod. Dice is always a d6.

## Change (main direct, commit `9e08a96`)
- `src/SheetPopover.svelte`:
  - states: `capStat` (default 'esprit'), `capMod` (reset to the stat mod on
    each stat pick via `pickCapStat`); `capBase`/`capDice` removed;
  - MULTIPLICATEUR slider (0.5–20, step 0.5) with a live `×{capMult}` readout;
  - 4 stat buttons (STAT_LABELS, selected = indigo border);
  - MOD slider `min={statMod(capStat)} max=20` with a live readout;
  - pool formula unchanged: `capCount = round(capMult × mod)` clamped 1–999,
    always d6 (`doCapacityRoll` sides = 6), >50 dice → flat pre-rolled;
  - stale duplicate `capCount`/`capMult` deriveds (referencing the removed
    `capBase`) cleaned up.

## Verification
- `npm run test:unit`: 206/206 pass; `npm run build`: green.
