# Session — 2026-09-30 — Stat button colors

## Goal
Color-code the 4 stat buttons in the 🪄 capacity accordion.

## Change (main direct, commit `824b552`)
- `src/SheetPopover.svelte` — the selected stat button now takes its
  `STAT_COLORS` hue (border + text: Force red, Agilité green, Esprit blue,
  Social purple, matching the stat chips elsewhere); unselected buttons stay
  gray with the indigo hover.

## Verification
- `npm run test:unit`: 206/206 pass; `npm run build`: green.
