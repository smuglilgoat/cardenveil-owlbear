# Session — 2026-09-08 — Over-engineering audit applied

## Goal
Apply the repo-wide over-engineering audit (user-approved "go ahead"): cut dead code, duplicated reducers, stale docs — no behavior changes.

## Outcome
- Branch `agent/audit-cuts`, merged fast-forward to `main` as `35c682e`. Not pushed to origin.
- **−2706 lines, +65 lines, 0 dependencies removed.** Tests 122 → 117 (−5 removed with their functions), all passing. `npm run build` clean.

## Files changed (20)
- `netlify/functions/_gameLogic.js`, `supabase/functions/action/_gameLogic.ts` — reduced to one-line shims re-exporting `src/lib/deck.js` (shared logic verified identical before cut)
- Deleted: `src/lib/handScene.js`, `src/lib/cardSvg.js`, `src/lib/Counter.svelte`, `SUPABASE.md`, `BLOB.md`, `tests/api/`, `tests/integration/`, `docs/…Zone.Identifier`
- `src/lib/deck.js` — dropped `shuffle`/`createNormalDeck`/`createSpecializedDecks`/`isPendingCard`; added shared `SUITS_INFO`
- `src/lib/characterSheet.js` — `SKILL_GROUPS`/`SKILL_LABELS` derived from single `SKILL_TO_STAT`; `paradeTotal` removed; BroadcastChannel actionChecks helpers removed
- `CharacterSheet.svelte`, `SheetPopover.svelte` — broadcast wiring removed (realtime + 1.5s reconcile poll remain for diamond sync)
- `GMDashboard.svelte`, `PlayerHand.svelte`, `HandPopover.svelte` — import shared `SUITS_INFO`; `paradeTotal` inlined; inline sort → `sortCards`; `crystalPickOpen` removed
- Tests: `deck.test.js` (shuffle block), `characterSheet.test.js` (paradeTotal block), `tests/README.md`
- Docs: `AGENTS.md` (handScene/BLOB references removed), `scripts/generate-cards.js` (stale coupling comment)

## Commands run
- `npm test` (before: 122 pass; after: 117 pass), `npm run build` (clean)
- `git rm`, edits, `git commit`, `git merge --ff-only agent/audit-cuts` on main

## Verification
- Diffed Netlify reducer vs `deck.js` function-by-function (whitespace-insensitive): identical before shimming
- Grep sweep: no remaining references to any deleted symbol/file in src/tests/netlify/supabase/scripts
- LSP diagnostics on edited Svelte files: only pre-existing implicit-any noise (documented in CONTINUITY)

## Follow-up
- UNCONFIRMED: first `supabase functions deploy` must bundle the `../../src/lib/deck.js` relative import — verify, else inline a copy back into the function dir
- README.md "Architecture Notes" still claims OBR room metadata (stale; out of audit scope)
- `docs/character-sheet-analysis.md` predates pinnedSkills/actionChecks/totem fields (stale; out of scope)
