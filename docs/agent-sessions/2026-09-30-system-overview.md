# Session — 2026-09-30 — System overview doc

## Goal
Produce a single markdown file explaining the whole Cardenveil system to another model.

## Result
- **`docs/system-overview.md`** (~475 lines): game rules → code mapping, tech stack,
  5 Vite entries + card codegen + manifest, state-sync pipeline (Supabase Realtime,
  optimistic replay with pending cards, `apply_game_action` RPC, Netlify fallback),
  GameState shape + card hydration, all 34 action types, character-sheet system
  (storage, schema, computed combat formulas, roll engine, dice popup flow),
  component map, transports table, conventions/gotchas, file map.
- Committed on branch `agent/system-overview-doc` (commits `a609d11`, `cf47461`).
- `.agent/CONTINUITY.md` updated.

## Verification
- Every section cross-checked against actual source (`deck.js`, `api.js`,
  `characterSheet.js`, `attackRoll.js`, `dice3d.js`, `background.js`,
  `vite.config.js`, `scripts/generate-cards.js`, migrations, Netlify/Supabase functions).
- Inaccurate first-draft claims removed/replaced after verification.
- `npm run test:unit`: 7 suites, **197 tests pass**.
