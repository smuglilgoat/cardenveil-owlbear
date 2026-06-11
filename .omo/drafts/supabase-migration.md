# Draft: Migrate from Netlify Blobs to Supabase Realtime

## Requirements (confirmed)
- Replace Netlify Blobs KV store with Supabase PostgreSQL
- Replace 300ms HTTP polling with Supabase Realtime WebSocket subscriptions
- Writes still go through Netlify Functions (server-authoritative pattern remains)
- Reads switch from polling to realtime push (~100ms latency vs 300ms+ polling)
- All game logic in `_gameLogic.js` stays unchanged (database-agnostic)
- UI components only change their polling/realtime lifecycle calls

## Technical Decisions
- **Architecture**: Server-authoritative writes via Netlify Function, realtime reads via Supabase WebSocket (matches SUPABASE.md)
- **Endpoint path**: Current code POSTs actions to `/api/state`, SUPABASE.md suggests `/api/action`. NEEDS DECISION.
- **Polling interval discrepancy**: Current code uses 300ms (not 1500ms as BLOB.md claims). This becomes irrelevant with realtime.

## Research Findings
- `@netlify/blobs` is used only in `netlify/functions/state.js` (1 file)
- `src/lib/api.js` has `startPolling`, `stopPolling`, `fetchState`, `dispatch` - all 4 need replacement
- `src/lib/CardGame.svelte` lines 6, 72-74, 94 - polling lifecycle
- `src/HandPopover.svelte` lines 5, 35-37, 46 - polling lifecycle
- `_gameLogic.js` is completely database-agnostic (565 lines, no storage imports)
- `deck.js` has client-side `hydrateState()` used by `api.js`
- No `.env` files exist yet - environment variables needed
- `netlify.toml` has existing `/api/*` → `/.netlify/functions/:splat` redirect (no changes needed for same-endpoint pattern)

## Open Questions
- ~~Have they created the Supabase project yet?~~ → YES, credentials ready
- ~~Endpoint path: keep `/api/state` or separate `/api/action`?~~ → KEEP `/api/state`
- ~~Add fallback polling for WebSocket disconnects?~~ → YES, add reconnect+polling fallback

## Resolved Decisions
- Endpoint: Keep `/api/state` for both GET and POST (zero client URL changes needed)
- Resilience: Add reconnect+polling fallback when WebSocket disconnects
- Supabase project: Already created with credentials available

## Critical Discrepancies Found (vs SUPABASE.md)
1. SUPABASE.md says POST to `/api/action` — actual code uses `/api/state`. Keeping `/api/state`.
2. Two separate Vite entries (CardGame + HandPopover) → two independent Supabase channels needed.
3. `dispatching` race-guard flag becomes unnecessary with realtime push.
4. Duplicate hydrateState/dehydrateState in `_gameLogic.js` (server) and `deck.js` (client) — kept separate.
5. `startPolling` default is 300ms but callers pass 1500ms — actual interval is 1500ms.

## Scope Boundaries
- INCLUDE: Server-side state.js rewrite (Blobs → Supabase)
- INCLUDE: New _supabaseClient.js (server-side Supabase client)
- INCLUDE: New supabaseClient.js (client-side Supabase client)
- INCLUDE: api.js rewrite (polling → realtime + fallback)
- INCLUDE: CardGame.svelte import/lifecycle changes (3 lines)
- INCLUDE: HandPopover.svelte import/lifecycle changes (3 lines)
- INCLUDE: package.json dep swap (remove @netlify/blobs, add @supabase/supabase-js)
- INCLUDE: Supabase project/table/RLS setup SQL
- INCLUDE: Netlify environment variables guidance
- INCLUDE: Reconnect + polling fallback mechanism
- EXCLUDE: Changes to `_gameLogic.js` (database-agnostic, untouched)
- EXCLUDE: Changes to UI component visuals/structure
- EXCLUDE: Changes to `deck.js` (client-side hydration stays)
- EXCLUDE: Any new features beyond the migration
- EXCLUDE: BLOB.md/SUPABASE.md documentation updates

## Test Strategy Decision
- **Infrastructure exists**: NO
- **Automated tests**: YES (TDD) — write failing tests first, then implement
- **Framework**: Need to choose (vitest recommended for Vite/Svelte projects)
- **Agent-Executed QA**: ALWAYS (mandatory for all tasks regardless)