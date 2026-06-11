# Plan: Supabase Migration Bug Fixes

## TL;DR

> **Fix 3 bugs found during SUPABASE.md implementation review**: a critical race condition in concurrent writes, missing realtime error handling, and a docs endpoint mismatch. The race condition can cause silent data loss when two players act simultaneously.

**Deliverables**:
- Atomic state upsert via stored procedure in `state.js`
- Realtime subscription error handling with reconnection in `api.js`
- Corrected SUPABASE.md documentation

**Estimated Effort**: Quick
**Parallel Execution**: YES - 2 waves
**Critical Path**: Task 1 (SQL + state.js) → Task 3 (docs)

---

## Context

### Original Request
Review the Supabase migration implementation for correctness and suggest improvements.

### Review Findings

**Bug 1 — Critical: Race condition on concurrent writes** (`state.js` POST handler)

The read-then-write pattern is not atomic:
```
Player A: reads state v5
Player B: reads state v5
Player A: upserts v6 with their action applied to v5
Player B: upserts v6 with their action applied to v5  ← Player A's action is LOST
```

Both players read version 5, both compute version 6, and the second upsert overwrites the first. The Supabase `upsert()` uses `ON CONFLICT (room_id) DO UPDATE` which doesn't check the `version` column.

**Fix**: Create a PostgreSQL stored procedure `apply_game_action()` that atomically reads the current version, compares it against an expected version, and only writes if the version matches. This is OCC (optimistic concurrency control). If the version doesn't match, the function returns the current row so the client can retry.

**Bug 2 — No realtime subscription error handling** (`api.js`)

`startRealtime()` calls `.subscribe()` without listening for connection state. If the WebSocket drops:
- No error is shown to the user
- No automatic reconnection is attempted
- The game silently falls behind

**Fix**: Add a `subscribe((status, err))` callback that handles `CHANNEL_ERROR` and `TIMED_OUT` with automatic reconnection, and surface connection issues to the UI.

**Bug 3 (Minor) — SUPABASE.md endpoint mismatch**

Section 4.3 shows `fetch('/api/action')` for POST, but `netlify.toml` routes `/api/*` to `/.netlify/functions/:splat`, meaning only `/api/state` exists. The actual `dispatch()` correctly uses `/api/state`. This is a documentation-only issue.

### Metis Review
**Identified Gaps** (addressed):
- Race condition → using OCC stored procedure
- Silent connection drops → adding subscribe status handler
- Docs error → correcting endpoint path

---

## Work Objectives

### Core Objective
Fix the 3 bugs found in the Supabase migration to ensure data integrity and connection reliability.

### Concrete Deliverables
- `netlify/functions/state.js` — rewritten to use `supabase.rpc('apply_game_action', ...)` with retry loop
- SQL migration adding the `apply_game_action()` stored procedure
- `src/lib/api.js` — `startRealtime()` with error/reconnection handling
- `SUPABASE.md` — corrected endpoint path

### Definition of Done
- [ ] Two players acting simultaneously never lose data
- [ ] WebSocket disconnection surfaces an error and auto-reconnects
- [ ] SUPABASE.md section 4.3 uses `/api/state` not `/api/action`

### Must Have
- Atomic write — no state lost on concurrent actions
- Auto-reconnect on realtime connection drop
- Version-mismatch retry logic in `state.js`

### Must NOT Have (Guardrails)
- No changes to `_gameLogic.js` or UI components
- No changes to the database table schema (columns stay the same)
- No polling fallback — keep realtime WebSocket approach

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None (no test framework in project)
- **Agent-Executed QA**: ALWAYS (mandatory)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - SQL + server fix + client fix):
├── Task 1: Add stored procedure + update state.js for atomic writes [deep]
├── Task 2: Add realtime error handling + reconnection in api.js [quick]
└── Task 3: Fix SUPABASE.md endpoint documentation [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Manual QA via curl (unspecified-high)
└── Task F4: Scope fidelity check (deep)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1    | -         | F3     |
| 2    | -         | F3     |
| 3    | -         | -      |
| F1-F4| 1, 2, 3  | -      |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `deep`, T2 → `quick`, T3 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix race condition with atomic stored procedure + version-gated upsert

  **What to do**:
  - Add a PostgreSQL stored procedure `apply_game_action(p_room_id TEXT, p_expected_version INTEGER, p_new_version INTEGER, p_state JSONB)` to the SUPABASE.md SQL schema section (section 2.1)
  - The procedure should:
    1. Check if a row exists for `p_room_id`
    2. If no row exists: INSERT the new row (initial game creation)
    3. If row exists and `version = p_expected_version`: UPDATE to `p_new_version` and `p_state`
    4. If row exists but `version != p_expected_version`: RETURN the current row with a `conflict: true` flag
  - Rewrite `netlify/functions/state.js` POST handler to:
    1. Read current state + version from Supabase
    2. Apply action locally (as now)
    3. Call `supabase.rpc('apply_game_action', { pRoomId, pExpectedVersion: currentVersion, pNewVersion: currentVersion + 1, pState: dehydrated })` instead of `.upsert()`
    4. If RPC returns `conflict: true`: retry the entire read-apply-write cycle (max 3 retries)
    5. If retries exhausted: return 409 Conflict
  - Also update the `upsert()` in the INIT_GAME path: when `existing` is null/errored, use `insert()` instead of `upsert()`, and handle the race where another player just created the room

  **Must NOT do**:
  - Do NOT change `_gameLogic.js` — it stays database-agnostic
  - Do NOT change the `game_rooms` table schema
  - Do NOT add polling fallback

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: OCC retry logic requires careful state management; edge cases in concurrent game initialization
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: no browser UI involved

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: F3
  - **Blocked By**: None

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `netlify/functions/state.js:47-88` — current POST handler with the race condition (read → compute → upsert without version check)
  - `netlify/functions/_gameLogic.js:62-71` — `createInitialGameState()` used when room doesn't exist yet
  - `netlify/functions/_supabaseClient.js` — service role Supabase client for RPC calls

  **API/Type References** (contracts to implement against):
  - `netlify/functions/_gameLogic.js:149-564` — `applyAction()` returns `{ state: newState, log }` — this is the local transform function
  - Supabase `rpc()` API: `supabase.rpc('function_name', { param1: value1, ... })` returns `{ data, error }`
  - PostgreSQL function signature: `CREATE OR REPLACE FUNCTION apply_game_action(p_room_id TEXT, p_expected_version INTEGER DEFAULT -1, p_new_version INTEGER, p_state JSONB) RETURNS JSONB`

  **Test References** (testing patterns to follow):
  - None — no test framework in project

  **External References** (libraries and frameworks):
  - Supabase RPC docs: https://supabase.com/docs/reference/javascript/rpc
  - PostgreSQL CREATE FUNCTION: https://www.postgresql.org/docs/current/sql-createfunction.html
  - Occ pattern: compare-and-swap using version column as the CAS token

  **WHY Each Reference Matters**:
  - `state.js:47-88` — this is the exact code being rewritten; the race condition occurs at lines 52-79
  - `_gameLogic.js:62-71` — needed to understand what `createInitialGameState()` returns for the INSERT path
  - `rpc()` API — the new mechanism replacing `upsert()`
  - PostgreSQL function docs — needed to write the correct stored procedure syntax

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY**

  **If TDD (tests enabled):** No — no test framework

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Concurrent writes don't lose data
    Tool: Bash (curl)
    Preconditions: Local dev server running with Supabase connected
    Steps:
      1. Create a game room: `curl -X POST http://localhost:8888/api/state -H 'Content-Type: application/json' -d '{"roomId":"test-concurrent","action":{"type":"INIT_GAME","playerId":"gm1"}}'`
      2. Note the version from response (should be 1)
      3. In parallel, send two actions simultaneously: `curl -X POST http://localhost:8888/api/state -H 'Content-Type: application/json' -d '{"roomId":"test-concurrent","action":{"type":"DRAW","playerId":"gm1"}}' & curl -X POST http://localhost:8888/api/state -H 'Content-Type: application/json' -d '{"roomId":"test-concurrent","action":{"type":"DRAW","playerId":"gm1"}}'`
      4. Fetch final state: `curl "http://localhost:8888/api/state?roomId=test-concurrent"`
      5. Assert: version should be exactly 3 (INIT + 2 DRAWS), not 2 (which would mean one DRAW was lost)
    Expected Result: Both draws are applied, version increments correctly, no data loss
    Failure Indicators: version is 2 instead of 3, or one player's hand doesn't show the drawn card
    Evidence: .omo/evidence/task-1-concurrent-writes.txt

  Scenario: Version conflict triggers retry and succeeds
    Tool: Bash (curl)
    Preconditions: Game room exists with version 1
    Steps:
      1. Send a DRAW action: `curl -X POST http://localhost:8888/api/state -H 'Content-Type: application/json' -d '{"roomId":"test-retry","action":{"type":"DRAW","playerId":"gm1"}}'`
      2. Verify response contains version 2
      3. Send another DRAW: same curl command
      4. Verify response contains version 3 (not 409 error)
    Expected Result: Sequential actions succeed without 409 errors
    Evidence: .omo/evidence/task-1-retry-success.txt

  Scenario: Invalid action returns gracefully
    Tool: Bash (curl)
    Preconditions: No game room exists
    Steps:
      1. `curl -X POST http://localhost:8888/api/state -H 'Content-Type: application/json' -d '{"roomId":"test-new-room","action":{"type":"DRAW","playerId":"p1"}}'`
      2. Verify response has version 1 (new game created) — or appropriate error
    Expected Result: Server handles gracefully, no 500 error
    Evidence: .omo/evidence/task-1-invalid-action.txt
  ```

  **Commit**: YES
  - Message: `fix(state): use atomic OCC stored procedure for concurrent writes`
  - Files: `netlify/functions/state.js`, `SUPABASE.md` (SQL section)
  - Pre-commit: manual curl test

- [x] 2. Add realtime subscription error handling + reconnection in api.js

  **What to do**:
  - In `src/lib/api.js`, update `startRealtime()` to:
    1. Add a `subscribe((status, err) => { ... })` callback to the channel
    2. On `'SUBSCRIBED'`: log success, mark connection as healthy
    3. On `'CHANNEL_ERROR'` or `'TIMED_OUT'`: log error, call `stopRealtime()` then `startRealtime(roomId, onStateCallback)` to reconnect (with a small delay to avoid tight loops)
    4. On `'CLOSED'`: mark connection as lost
    5. Add exponential backoff for reconnections: 1s, 2s, 4s, max 30s
    6. After successful reconnect, call `fetchState(roomId)` to catch up on any missed state
  - Add a `connectionState` export (or a simple `isConnected()` function) so the UI can show connection status
  - In `CardGame.svelte`, import and display a toast when connection is lost/reconnected

  **Must NOT do**:
  - Do NOT add polling fallback
  - Do NOT change the `dispatch()` function
  - Do NOT change `HandPopover.svelte` (CardGame is the primary state manager)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Well-defined change to a single file, pattern is clear
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: F3
  - **Blocked By**: None

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `src/lib/api.js:20-45` — current `startRealtime()` implementation without error handling
  - `src/lib/CardGame.svelte:1-97` — where `startRealtime`/`stopRealtime` are called; has toast system (`addToast`)
  - `src/lib/CardGame.svelte:18-26` — toast system pattern (`addToast(msg, type)`)

  **API/Type References** (contracts to implement against):
  - Supabase channel subscription API: `channel.subscribe((status, err) => { ... })` where status is `'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR'`
  - `supabase.removeChannel(channel)` — cleanup

  **External References** (libraries and frameworks):
  - Supabase Realtime docs: https://supabase.com/docs/guides/realtime/broadcast#client-side-usage — `subscribe()` callback signature and status values

  **WHY Each Reference Matters**:
  - `api.js:20-45` — the exact function being modified
  - `CardGame.svelte:18-26` — toast system to surface connection errors to users
  - Supabase Realtime docs — to confirm the correct `subscribe()` callback API

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY**

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Realtime subscription connects successfully
    Tool: Bash (curl) + Playwright
    Preconditions: Dev server running, Supabase connected
    Steps:
      1. Open the app in browser
      2. Initialize a game as GM
      3. Check browser console for log: "Realtime connected"
    Expected Result: No errors in console, state syncs normally
    Evidence: .omo/evidence/task-2-realtime-connect.png

  Scenario: Reconnection after connection drop
    Tool: Bash (curl) + manual observation
    Preconditions: Game active, realtime connected
    Steps:
      1. Observe game is working normally
      2. Disconnect network briefly (5 seconds)
      3. Reconnect network
      4. Verify game state updates resume
    Expected Result: After reconnect, state catches up automatically
    Evidence: .omo/evidence/task-2-reconnection.txt
  ```

  **Commit**: YES
  - Message: `fix(api): add realtime error handling and auto-reconnection`
  - Files: `src/lib/api.js`, `src/lib/CardGame.svelte`
  - Pre-commit: manual verification

- [x] 3. Fix SUPABASE.md endpoint documentation

  **What to do**:
  - In `SUPABASE.md` section 4.3 (line ~300), change `fetch('/api/action')` to `fetch('/api/state')`
  - This matches the actual `netlify.toml` routing: `/api/*` → `/.netlify/functions/:splat`, meaning only `/api/state` exists
  - Also add the stored procedure SQL to section 2.1 after the table creation (from Task 1)

  **Must NOT do**:
  - Do NOT change any code files
  - Do NOT change the `netlify.toml` routing

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Documentation-only change
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: None
  - **Blocked By**: Task 1 (for the stored procedure SQL)

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `netlify.toml` — shows `/api/*` → `/.netlify/functions/:splat` redirect
  - `src/lib/api.js:55` — `dispatch()` uses `fetch('/api/state', { method: 'POST' })`

  **WHY Each Reference Matters**:
  - The endpoint path must match what the Netlify function routing actually supports

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY**

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Documentation matches implementation
    Tool: Bash (grep)
    Preconditions: Code changes from Tasks 1 and 2 are complete
    Steps:
      1. grep -r "api/action" SUPABASE.md — should return no results
      2. grep -r "api/state" SUPABASE.md — should find the dispatch reference
    Expected Result: No references to /api/action in documentation
    Evidence: .omo/evidence/task-3-docs-check.txt
  ```

  **Commit**: YES
  - Message: `docs(supabase): fix endpoint path and add stored procedure`
  - Files: `SUPABASE.md`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Specifically verify: stored procedure handles all edge cases (null room, version mismatch), retry logic doesn't infinite loop, reconnection has backoff cap.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from Tasks 1-3 — follow exact steps, capture evidence. Test the concurrent-write scenario specifically (two curl calls in parallel). Verify realtime reconnection works.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1**: `fix(state): use atomic OCC stored procedure for concurrent writes`
- **2**: `fix(api): add realtime error handling and auto-reconnection`
- **3**: `docs(supabase): fix endpoint path and add stored procedure`

---

## Success Criteria

### Verification Commands
```bash
# Verify no reference to /api/action in docs
grep -r "api/action" SUPABASE.md  # Expected: no results

# Verify dispatch uses /api/state
grep "/api/state" src/lib/api.js  # Expected: 1 match in fetch()

# Verify stored procedure is referenced in state.js
grep "rpc" netlify/functions/state.js  # Expected: 1+ match
```

### Final Checklist
- [ ] Concurrent writes don't lose data (version check + retry)
- [ ] Realtime disconnect auto-reconnects with backoff
- [ ] Documentation endpoint matches implementation