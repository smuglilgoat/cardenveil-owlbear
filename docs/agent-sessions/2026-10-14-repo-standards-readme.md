# 2026-10-14 — Repo standards, code review & README

**Goal (user request):** code review; reorganize the codebase; check tests and
linters; cleanup with ponytail discipline; rework the README into a proper
GitHub page once the codebase reaches professional standards.

**Branch:** `chore/repo-standards-readme` · **Version:** unchanged (2.7.18, no
player-visible change beyond the reviewed bug fixes) · **Cost:** 8 commits

---

## Scope decisions (user-approved before any change)

| Question | Chosen |
|---|---|
| Reorg depth | Structure + junk only — no giant-component splitting |
| Junk in git | Delete from HEAD, **keep history** (no rewrite, no force-push) |
| Linting | Keep the existing svelte-check gate — no new linter |
| README | Players first, developers below |

## Baseline (before)

`npm test` → 220 passed / 7 suites · `npm run check` → 0 reference errors,
1550 pre-existing type-inference diagnostics · `git status` clean on `main`.

## Commits

| # | Commit | What |
|---|---|---|
| 1 | `chore(repo): drop tracked session dumps, oversized fixtures and unused assets` | −35 MB from HEAD |
| 2 | `chore: fix version drift, stale doc pointers and dead doc references` | `package.json` 0.3.7→2.7.18, CLAUDE.md → pointer, TESTING.md, FIREBASE.md → `docs/archive/` |
| 3 | `refactor(src): group entry scripts under src/entries, components under src/lib` | layout matches the documented convention |
| 4 | `docs: group release notes and design mockups into subfolders` | `docs/patch-notes/`, `docs/design/` |
| 5 | `fix(game,api,ui): close the verified review findings` | 15 defects, 14 new tests |
| 6 | `chore: remove the unused Vite scaffold icon` | `public/vite.svg` |
| 7 | `ci: run tests and the production build on every push and pull request` | `.github/workflows/ci.yml` |
| 8 | `docs(readme): rewrite as a player-first GitHub page` | install flow verified against the official OBR docs |

## Code review — 3 parallel read-only reviewers

Delegated to `reviewer` subagents: (1) reducer + server functions, (2) state
sync / networking, (3) large Svelte components. Every finding was re-checked
against the code before patching.

### Fixed (with regression tests where the logic is pure)

- **Exchange ownership** — `ACCEPT_EXCHANGE`/`DECLINE_EXCHANGE` had no
  recipient check; exchange ids and card ids are public, so anyone could move a
  victim's chosen card to the sender with no spoofing. Now `playerId === ex.to`.
- **`SET_DRAW_RANGE`** — took a free-form field name; `field: 'hand'` stored a
  number where an array belongs and broke hydration for every client. Allowlisted.
- **Token keys** — `SPEND_TOKEN`/`ADD_TOKEN`/`SET_MAX_TOKENS` accepted any key
  and wrote `NaN`. Validated against a `TOKEN_KEYS` set.
- **`GIVE_CARDS`** — an unknown suit threw a 500 (`makeCard`), the specific list
  was unbounded. Validated + capped at 10 like random mode.
- **`IMPORT_STATE`** — pushed the payload verbatim; an unhydrated payload reached
  `dehydrateState()` and threw. Now shape-checked and normalised through
  `hydrateState()`.
- **`cardFromId`** — an unknown suit id threw; one bad id in the row bricked
  hydration for the whole room. Now degrades to `?`.
- **304 semantics** — `fetchState` returned `null` for both "not modified" and
  "no room"; callers read `null` as "no room" and dispatch a game-wiping
  `INIT_GAME`. Now returns the cached state, and `teardownRealtime(false)`
  resets `currentVersion` (a stale version also silently dropped realtime rows).
- **Double-rendered action** — when Realtime delivered the confirmed state
  before the function response, the optimistic entry was replayed on top
  (an extra card until the next room event). `confirmPending()` now drops it and
  re-renders from server truth.
- **`effect_update_depth_exceeded`** — `CardGame`'s connection effect read *and*
  wrote `toasts`; the guard used a non-reactive `let`. A `lastStatus` guard
  kills the loop (the 12 errors on record) and the duplicate "Connexion rétablie".
- **`onSheetBroadcast`** — the last subscriber replaced the previous
  `channel.onmessage` and its unsubscribe could never match. Now a listener Set.
- **GM sheet save** — the GM modal bound `derived.initiative`/`mouvement`/… but
  `syncStatsFromEquipment` overwrote them; ÉDITION writes `derived.overrides`.
  The GM path now does the same, so typed values survive.
- **Leaks / robustness** — stale per-player sheet subscriptions released;
  `viewCharacterSheet` request guard; `SheetPopover`'s initial fetch can no
  longer revert a newer sheet; `popover.open` rejections caught and logged;
  dead `RACE_PASSIVE_TIP` copy deleted from `HandPopover`.

### Implemented after the review (user decision: "both now")

- **Actor tokens** (`src/lib/actionGuard.js`, both server functions): the first
  accepted write for an identity mints a 256-bit token, the client keeps it in
  `localStorage` and echoes it, and only its SHA-256 hash is stored in
  `state.actorTokens` (keyed by actor, so the GM and `__gm_char__` work too).
  A mismatch is a 401; an unclaimed identity passes so stale frames no-op.
- **Idempotency**: a 128-bit `actionId` per dispatch + a 50-entry
  `state.lastActionIds` ring; a replayed id returns the current row without a
  write, so the Edge→Netlify retry can no longer double-apply a draw or a token
  spend.
- **Recovery / limits** (documented in AGENTS.md): the first claimant of an
  unclaimed identity owns it; an OBR GM can still `INIT_GAME` a room
  (deliberate takeover path); a lost token needs a GM `HARD_RESET`.
- **Deploy order**: client (Netlify) first, then the Edge Function.
- `LICENSE` (MIT) + README License section.

### Reported, deliberately NOT fixed

- **A reviewer's `INIT_GAME` guard was rejected**: `CardGame.svelte:92`
  deliberately re-inits when an OBR GM opens a room whose `gmId` belongs to
  someone else, so the "stopgap" would have bricked GM takeover.
- **`game_rooms` + `apply_game_action()` are not in the repo** — the whole
  optimistic-concurrency story depends on SQL that isn't versioned.
- **`character_sheets` has no version column** — concurrent whole-document
  upserts can silently lose one edit.
- **`CANCEL_EXCHANGE` doesn't refund the sender's Social token** while
  `DECLINE_EXCHANGE` does — a rules decision.
- Cosmetic drift: duplicated token-tooltip tables in `PlayerHand`/`HandPopover`;
  `app.css`/`hand.css` share the Vite scaffold block while `sheetPopover.css`
  doesn't; `pendingHalfling` is stored as objects while everything else is ids.

## Verification (after)

- `npm test` → **260 passed / 9 suites** (25 new guard/idempotency tests,
  including a Netlify-handler integration test with a mocked `game_rooms` row)
- `npm run check` → 0 reference errors (1581 type-inference diagnostics, the
  pre-existing noise class)
- `npm run build` → green, all 5 entries emitted at `dist/` root
- `docs/system-overview.md` file map + entry table updated to the new layout
- Live manifest (`https://cardenveil.netlify.app/manifest.json`) verified as
  2.7.18 so the README's install link and version claim are accurate

## Follow-ups

1. Commit the `game_rooms` DDL + `apply_game_action()` SQL to
   `supabase/migrations/`.
2. Add screenshots to the README (no images are tracked; the Figma prototype
   HTML is the only visual reference).
3. Consider a `version` column for `character_sheets` (lost-update fix).
4. Decide whether `CANCEL_EXCHANGE` should refund the sender's Social token
   (it does not, while `DECLINE_EXCHANGE` does).
5. Deploy order for this branch: client (Netlify) first, then the Supabase Edge
   Function `action` — verification only turns on with the second deploy.
