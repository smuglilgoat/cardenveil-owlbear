# Session — 2026-09-30 — Slower dice face snap

## Goal
In the Rapier 3D dice simulation, make the snap-to-face easing slower so the
final toppling onto the reading face is visible.

## Change (main direct, commit `aa97a90`)
- `src/dice3d.js`: `SNAP_DURATION_MS` 250 → 600. That constant drives the
  cubic-out quaternion slerp in `snapDie`/`animate` — both the tip/edge-balance
  snap and the hard-deadline snap use it. No logic change; the die stays
  locked in place (rotations/translations frozen) while easing.

## Verification
- `npm run test:unit`: 206/206 pass; `npm run build`: green.
- Visual check pending in a live room (250 → 600 ms is a deliberate slow-down;
  tune the constant if it still feels too fast/slow).
