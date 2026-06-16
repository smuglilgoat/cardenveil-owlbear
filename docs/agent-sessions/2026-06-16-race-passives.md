# Agent Session — 2026-06-16

## Goal
Implement race passives feature for the Cardenveil card game. 5 races with unique mechanics:
- **Haut-Elfe**: +1 max hand size
- **Tieffelin**: choose to draw a Spade (alternating eligibility)
- **Aasimar**: auto-generate crystallized Heart on every token use
- **Halfling**: draw 2, choose 1 (all draws including DEAL_ALL and Force token)
- **Sporelin**: free card exchange (no Social token, bypasses freeze)

## Files Changed
| File | Changes |
|------|---------|
| `netlify/functions/_gameLogic.js` | Added RACES, handCap(), maybeAasimarHeart(), SET_RACE, DRAW_SPADE, HALFLING_CHOOSE, SPORELIN_EXCHANGE actions. Modified DRAW, DRAW_FORCE, DEAL_ALL, USE_AGILITE, USE_ESPRIT, PROPOSE_EXCHANGE, SPEND_TOKEN, HARD_RESET |
| `src/lib/deck.js` | Mirror all server-side changes (createEmptyPlayer, hydrateState, applyAction, helpers) |
| `src/lib/api.js` | Updated markOptimisticDraws for DRAW_SPADE, Halfling pendingHalfling, Aasimar auto-heart, DEAL_ALL+Halfling |
| `src/lib/GMDashboard.svelte` | Added race selector per player, race badge, handCap() display, setRace() |
| `src/lib/PlayerHand.svelte` | Added handCap import, drawBlocked derived, interactionFrozen update, Tiefling modal, Halfling modal, Sporeling flow, race badge, Sporeling button |
| `src/HandPopover.svelte` | Same UI changes as PlayerHand: handCap, drawBlocked, interactionFrozen, Tiefling/Halfling/Sporeling modals, Sporeling button |

## Commands Run
- `npm run build` — passed (261 modules, no errors)
- `git checkout -b feat/race-passives`
- `git add -A && git commit` — 796 insertions, 101 deletions

## Key Design Decisions
- `handCap()` helper centralizes hand size formula
- `maybeAasimarHeart()` called after full token resolution in 5 actions
- `pendingHalfling` blocks all player actions + DEAL_ALL skip
- `SPORELIN_EXCHANGE` bypasses token cost but blocked by existing exchanges
- `HARD_RESET` preserves race assignment
