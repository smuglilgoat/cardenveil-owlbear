# Contributing

The commands, the build gate and the branch rules for working on the plugin. The house rules you must follow while editing live in [Conventions and gotchas](../reference/conventions.md).

## Commands

```bash
npm run dev            # dev server, CORS open to https://www.owlbear.rodeo
npm run check          # build gate: svelte-check, fails on undefined names/modules
npm run check:types    # list every svelte-check diagnostic (the ~1500 pre-existing ones)
npm run build          # npm run check && production build → dist/
npm run preview        # preview the built output
npm test               # JEST, whole config
npm run test:unit      # JEST, tests/unit only
npm run test:watch     # watch mode
npm run test:coverage  # coverage report
```

## The build gate

`scripts/check-svelte.mjs` runs `svelte-check` and fails **only on reference errors** — `Cannot find name/module/namespace`. Those are invisible to Rollup, since an unbound identifier looks like a global, and two of them have shipped (`RACES is not defined`, `logEvent is not defined` in a popover callback). The remaining \~1500 diagnostics are pre-existing JS/JSDoc type-inference noise and are reported as a count only; `npm run check:types` lists them in full. The gate is wired into `npm run build`, so a failing build is a real regression, not noise.

## Tests

**280 tests in 9 suites.** `npm test` runs the whole Jest config, `npm run test:unit` only `tests/unit`; Jest runs under `jsdom` with `NODE_OPTIONS=--experimental-vm-modules`.

Eight suites are pure logic: `actionGuard`, `api`, `attackRoll`, `characterSheet`, `deck`, `diceRoll`, `gameLogic`, `sheetAssets`.

The ninth, `tests/unit/stateFunction.test.js`, is an **integration test of the real write path**, not pure logic: the Netlify handler is driven with a mocked Supabase client (an in-memory `game_rooms` row plus an emulation of the `apply_game_action` CAS). It is the suite that guards double application and token spoofing — a wrong splice there locks the whole table out or applies an action twice, and no pure-logic test would notice.

**Component tests are not wired.** `jest.config.js` maps `^.+\.svelte$` to `svelte-jester`, but no `.svelte` test exists: component-level Jest tests were attempted and reverted, because svelte-jester's ESM path is unreachable through Jest 30's transform pipeline (`.agent/CONTINUITY.md`, 2026-10-13). Svelte components have no unit-test harness here — verify them in the browser (see [Debug a live room](debug-live-room.md)) and keep the logic they call in testable modules.

New non-trivial logic — a branch, a loop, a parser, money or security — gets a small test. Trivial changes need none.

## Branches, commits and CI

* Branch, then commit with [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`…). `main` is the deployed branch.
* `npm test` and `npm run check` must pass before a PR — CI enforces both (the workflow runs `npm test` then `npm run build`, which runs the check).
* UI text is **French**; code, comments and docs are English.
* Game-state changes belong in `src/lib/deck.js` (never in a component), and anything player-visible gets a note in `docs/changelog/` following the `cardenveil-release-notes` skill.

## Version bumps

`src/version.js` (`APP_VERSION`) is the single source: `vite.config.js` reads it for the manifest and `src/lib/appLog.js` for log rows. `package.json`'s `version` mirrors it — bump both together.

## Before you touch these

* **Game state** — read [Game state pipeline](../architecture/game-state.md) and [Action types](../reference/action-types.md). New logic goes in `src/lib/deck.js`, never in the server functions.
* **Character sheet** — the schema's source of truth is `createEmptyCharacterSheet()` in `src/lib/characterSheet.js`; `docs/character-sheet-analysis.md` is outdated.
* **Races or draw effects** — read `.agent/CONTINUITY.md` first; the edge cases there are decisions, not accidents.
* **Formulas** — `CARDENVEIL.md` predates some changes (Mouvement is 5 + Agi/2). Cross-check `.agent/CONTINUITY.md`.
