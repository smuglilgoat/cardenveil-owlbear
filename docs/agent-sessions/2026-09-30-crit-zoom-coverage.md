# Session — 2026-09-30 — Crit zoom coverage fix

## Goal
The camera zoom on crit faces didn't fire for most weapon dice.

## Root cause
The zoom trigger lived only in `snapDie`, which runs **only** for dice
balanced on a tip/edge. The settle loop has two paths:

- clean settle (face up ≥ 0.92) → `lockDie(d)` — **no snap, no zoom trigger**
- tip/edge balance → `snapDie` → zoom fired

A die landing perfectly flat on its max face (very common with multiple
dice) took the first path and never zoomed.

## Change (main direct, commit `e921a0e`)
- `src/dice3d.js`: the crit-zoom trigger now also fires in the value-chip
  path (`crit && !critZoom` → camera onto `group[0]`), covering every crit
  regardless of how the die settled. The `snapDie` trigger remains for an
  earlier start on wobbly crits (the zoom eases over the same 600 ms).

## Verification
- `npm run test:unit`: 206/206 pass; `npm run build`: green.
