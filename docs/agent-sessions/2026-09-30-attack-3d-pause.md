# Session — 2026-09-30 — Attack 3D stage read pause

## Goal
Stage switches in the 3D attack flow happened instantly on dice read; add a
3-second hold so players can read the settled dice before the next stage (or
the final summary) replaces them.

## Change (branch `agent/attack-3d-pause`, commit `d6f80d1`)
- `src/SheetPopover.svelte`: `throwAttackStage` now delays `STAGE_PAUSE_MS`
  (3 s) after the physics report resolves, before returning the dice to the
  `runAttack` walk — this pauses before *every* switch (crit explosions and
  the final summary alike). The 6 s popup auto-close still covers the pause;
  the 10 s stage timeout is unaffected (it bounds the report, not the pause).

## Verification
- `npm run test:unit`: 200/200 pass; `npm run build`: green.
- Manual check in a live room still pending (same matrix as 2026-09-30 attack-3d).
