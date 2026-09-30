# Session — 2026-09-30 — Capacity roll formula fix

## Goal
The 🪄 capacity roll had the wrong formula: it was `BASE dDice × MULT`
(multiply the sum). The rule is **MULT × BASE d Dice** — the dice pool size is
the product, summed as-is. Also replace the dice dropdown with the quick-roll
die buttons.

## Change (main direct, commit `eea290e`)
- `src/SheetPopover.svelte`:
  - `capCount = round(capMult × capBase)` clamped 1–999; the roll's total is
    the plain sum of the pool (no post-multiplication anymore);
  - breakdown/log strings simplified to `{count}d{sides}`;
  - DÉS dropdown replaced with the QUICK_DICE-style die-icon buttons acting
    as a radio selector (selected die shows the indigo border); the orphaned
    `CAP_DICE` const removed;
  - preview line: `{count}d{sides} ({mult} × {base})`;
  - `ponytail:` guard — pools above 50 dice skip the 3D physics throw and
    pre-roll flat (browser/Rapier safety); below that the staged pipeline
    (with the 3 s read pause) still applies.

## Verification
- `npm run test:unit`: 206/206 pass; `npm run build`: green.
