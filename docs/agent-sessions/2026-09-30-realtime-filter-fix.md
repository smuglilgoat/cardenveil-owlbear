# Session — 2026-09-30 — Sheet realtime filter fix

## Goal
GM dashboard Action/Bonus/Réaction diamonds didn't update when players
toggled them.

## Root cause (verified against Supabase docs)
`subscribeToCharacterSheet` filtered its realtime subscription with
`player_id=eq.X&room_id=eq.Y`. Supabase's multi-column AND filters are
**comma-separated** (`col=eq.a,col=eq.b` — AND-shipped 2026-08-05); an
`&`-joined string matches nothing, so **no character-sheets events were ever
delivered** to any subscriber. Same-browser tests were masked by the
`cardenveil-sheet` BroadcastChannel + the compact popover's 1.5 s poll, which
is why the cross-client break went unnoticed until the GM dashboard — the one
view that relied purely on Realtime.

## Change (main direct, commit `268dd38`)
- `src/lib/characterSheet.js`: filter fixed to
  `player_id=eq.X,room_id=eq.Y` — this repairs realtime sheet sync for the
  full sheet view, the compact popover, and the GM dashboard alike.
- `src/lib/GMDashboard.svelte`: also listens on the `cardenveil-sheet`
  BroadcastChannel for instant same-browser diamond updates (Realtime stays
  the cross-client path); cleanup wired into `onDestroy`.

## Verification
- `npm run test:unit`: 206/206 pass; `npm run build`: green.
- Live check pending: toggle diamonds in one client, watch them move in a
  second browser's GM dashboard (comma-AND must be supported by the hosted
  project's realtime — it shipped 2026-08-05; if it isn't, drop the
  room_id column from the filter as fallback).
