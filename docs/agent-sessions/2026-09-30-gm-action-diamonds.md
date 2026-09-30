# Session — 2026-09-30 — GM view: per-player action diamonds

## Goal
In the GM dashboard's player view, show each player's remaining
Action/Bonus Action/Reaction (the per-turn diamonds from their character
sheet).

## Change (main direct, commit `aac2cfb`)
- `src/lib/GMDashboard.svelte`:
  - `playerChecks` map ({playerId → actionChecks}) fed by one
    `subscribeToCharacterSheet` per player plus an initial fetch — sheets
    save diamond toggles immediately, so the GM view is live;
  - `$effect` over `playerIds` subscribes new players (guarded by a plain
    `checkUnsubs` Map, so it stays loop-free; stale entries for removed
    players are harmless since display iterates playerIds);
    unsubscribed in `onDestroy`;
  - each player panel header now shows 3 rotated-square diamonds (no
    labels, tooltip "Action · Bonus · Réaction"): filled indigo = used,
    hollow gray = remaining — same semantics as the sheet's ActionDiamonds.

## Verification
- `npm run test:unit`: 206/206 pass; `npm run build`: green.
- Manual check pending (diamonds update live when a player toggles them).
