# CONTINUITY.md — Cardenveil Agent Briefing

## [PLANS]
- Race passives feature: **COMPLETED** on branch `feat/race-passives` (2026-06-16)

## [DECISIONS]
- `[2026-06-16T23:00Z]` `[USER]` Hard reset preserves player race assignment
- `[2026-06-16T23:00Z]` `[USER]` DEAL_ALL triggers Halfling passive (draw 2, choose 1)
- `[2026-06-16T23:00Z]` `[USER]` Sporeling exchange blocked if any pending exchange exists; also blocks DEAL_ALL for that player
- `[2026-06-16T23:00Z]` `[USER]` Aasimar triggers only on token consumption (Carte or Combat), NOT on Sporeling exchange, NOT when exchanged with
- `[2026-06-16T23:00Z]` `[USER]` pendingHalfling blocks everything for that player including GM DEAL_ALL
- `[2026-06-16T23:00Z]` `[USER]` Aasimar triggers on USE_ESPRIT (spending slot), NOT on CRYSTALLIZE
- `[2026-06-16T23:00Z]` `[CODE]` `handCap()` helper centralizes hand size formula: `maxHandSize + spiritBounds + (race === 'haut-elfe' ? 1 : 0)`
- `[2026-06-16T23:00Z]` `[CODE]` `maybeAasimarHeart()` helper appends crystallized Heart if player race is 'aasimar'

## [PROGRESS]
- `[MILESTONE]` Race passives: all 5 races implemented, build passes, committed on `feat/race-passives`

## [DISCOVERIES]
- `[2026-06-16T23:00Z]` `[CODE]` `_gameLogic.js` (server) and `deck.js` (client) are duplicated — both must stay in sync for `createEmptyPlayer`, `hydrateState`, `applyAction`, `handCap`, `maybeAasimarHeart`
- `[2026-06-16T23:00Z]` `[CODE]` `PlayerHand.svelte` and `HandPopover.svelte` are duplicated UI — both need race passive UI updates
- `[2026-06-16T23:00Z]` `[CODE]` Pre-existing LSP errors (implicit `any` types in Svelte) are not caused by race changes

## [OUTCOMES]
- `[2026-06-16T23:00Z]` `[CODE]` 6 files changed, 796 insertions, 101 deletions across server reducer, client reducer, API optimistic layer, GM dashboard, player panel, and hand popover
