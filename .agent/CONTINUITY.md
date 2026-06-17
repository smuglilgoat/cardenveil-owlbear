# CONTINUITY.md — Cardenveil Agent Briefing

## [PLANS]
- Race passives feature: **COMPLETED** and merged to main (2026-06-16)
- Tooltip feature: **COMPLETED** and merged to main (2026-06-16)
- GM-only initiative tracker URL: **COMPLETED** on branch `agent/gm-initiative-url` (2026-06-17)
- Aasimar exchange passive fix: **COMPLETED** on branch `fix/aasimar-exchange-passive` (2026-06-17)

## [DECISIONS]
- `[2026-06-16T23:00Z]` `[USER]` Hard reset preserves player race assignment
- `[2026-06-16T23:00Z]` `[USER]` DEAL_ALL triggers Halfling passive (draw 2, choose 1)
- `[2026-06-16T23:00Z]` `[USER]` Sporeling exchange blocked if any pending exchange exists; also blocks DEAL_ALL for that player
- `[2026-06-16T23:00Z]` `[USER]` Aasimar triggers only on token consumption (Carte or Combat), NOT on Sporeling exchange, NOT when exchanged with
- `[2026-06-16T23:00Z]` `[USER]` pendingHalfling blocks everything for that player including GM DEAL_ALL
- `[2026-06-16T23:00Z]` `[USER]` Aasimar triggers on USE_ESPRIT (spending slot), NOT on CRYSTALLIZE
- `[2026-06-16T23:00Z]` `[USER]` Tooltips: 0.5s hover delay, all buttons, French text, spec-driven content
- `[2026-06-16T23:00Z]` `[CODE]` `handCap()` helper centralizes hand size formula: `maxHandSize + spiritBounds + (race === 'haut-elfe' ? 1 : 0)`
- `[2026-06-16T23:00Z]` `[CODE]` `maybeAasimarHeart()` helper appends crystallized Heart if player race is 'aasimar'
- `[2026-06-16T23:30Z]` `[CODE]` `tooltip.js` Svelte action: positioned div, auto-flips at viewport edge, 500ms delay, max-width 220px, dark theme
- `[2026-06-17T18:55Z]` `[USER]` Only GM inputs initiative tracker URL; it shows on every player screen via shared state
- `[2026-06-17T18:55Z]` `[CODE]` `initiativeUrl` added as top-level field in game state (null by default), synced via Supabase Realtime
- `[2026-06-17T18:55Z]` `[CODE]` `CardGame.svelte` exposes state upward via `onGameChange` callback prop (`$props()`), consumed by `App.svelte`
- `[2026-06-17T19:28Z]` `[USER]` Aasimar Heart should NOT be generated on PROPOSE_EXCHANGE (token may be refunded on decline). Generate on ACCEPT_EXCHANGE instead.
- `[2026-06-17T19:28Z]` `[CODE]` Moved `maybeAasimarHeart` call from PROPOSE_EXCHANGE to ACCEPT_EXCHANGE for sender. Updated optimistic UI to look up exchange sender.

## [PROGRESS]
- `[MILESTONE]` Race passives: all 5 races implemented, merged to main
- `[MILESTONE]` Tooltips: all buttons across 7 files have hover tooltips, merged to main
- `[MILESTONE]` GM initiative URL: shared state + UI rewrite, on branch `agent/gm-initiative-url`
- `[MILESTONE]` Aasimar exchange fix: Heart generation moved to ACCEPT, on branch `fix/aasimar-exchange-passive`

## [DISCOVERIES]
- `[2026-06-16T23:00Z]` `[CODE]` `_gameLogic.js` (server) and `deck.js` (client) are duplicated — both must stay in sync for `createEmptyPlayer`, `hydrateState`, `applyAction`, `handCap`, `maybeAasimarHeart`
- `[2026-06-16T23:00Z]` `[CODE]` `PlayerHand.svelte` and `HandPopover.svelte` are duplicated UI — both need race passive UI updates
- `[2026-06-16T23:00Z]` `[CODE]` Pre-existing LSP errors (implicit `any` types in Svelte) are not caused by race changes
- `[2026-06-16T23:30Z]` `[CODE]` 81 buttons across 7 files needed tooltips — Svelte action pattern (`use:tooltip`) was chosen over wrapper component for minimal markup
- `[2026-06-17T18:55Z]` `[CODE]` Three copies of the reducer exist: `_gameLogic.js` (Netlify), `_gameLogic.ts` (Supabase Edge), `deck.js` (client) — all must stay in sync for state shape + action handlers
- `[2026-06-17T19:12Z]` `[CODE]` Supabase `_gameLogic.ts` was silently broken — race passives, fatigue, and 5 action types fell through to `default` case. Now synced to match Netlify source of truth.
- `[2026-06-17T19:12Z]` `[CODE]` Dispatch flow: Supabase Edge Function is primary, Netlify is fallback. Both must have identical reducers.
- `[2026-06-17T19:28Z]` `[CODE]` Optimistic UI for ACCEPT_EXCHANGE Aasimar Heart must look up exchange by ID to find sender (not action.playerId which is recipient).

## [OUTCOMES]
- `[2026-06-16T23:00Z]` `[CODE]` Race passives: 6 files changed, 796 insertions, 101 deletions
- `[2026-06-16T23:30Z]` `[CODE]` Tooltips: 7 files changed, 205 insertions, 7 deletions
- `[2026-06-17T18:55Z]` `[CODE]` GM initiative URL: 5 files changed, 100 insertions, 31 deletions
- `[2026-06-17T19:12Z]` `[CODE]` Supabase reducer sync: 1 file changed, 223 insertions, 36 deletions
- `[2026-06-17T19:28Z]` `[CODE]` Aasimar exchange fix: 4 files changed, 33 insertions, 7 deletions
