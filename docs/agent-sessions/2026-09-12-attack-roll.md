# 2026-09-12 — Attack Roll (Bonus Attaque) rework

## Goal
Implement the new attack rules from `docs/Reglejetdattaque.md` on the ⚔️ button in the compact sheet popover (was a flat `1d6+bonusAttaque` placeholder).

## Files changed
- `src/lib/attackRoll.js` (new) — rules engine: cancellation → engagement ordering, `1+2×level` pool with max/min keep, seuil de miss on initial roll only, crit explosion chains (advantage decay 5d→3d→1d, plain 1dX on désavantage, Hache 2dX doubles), Finesse `(weapon bonus + engagement mods) × (1+crits)`, §20 breakdown lines. Injectable RNG for tests.
- `tests/unit/attackRoll.test.js` (new) — 20 tests, all doc §19 table rows + patch examples.
- `src/SheetPopover.svelte` — accordion attack panel under the header: equipped-weapons select, −7…+7 avantage slider with die-count readout, 0…7 engagement slider with stat readout, live preview, ATTAQUER → pre-rolled broadcast + USE_CAPACITY log; settings persisted per player in localStorage; popover height via existing `setHeight` mechanism.
- `src/background.js`, `src/dice3d.js`, `dice.html` — breakdown lines pass through as a URL param and render in a detail box under the total.

## Decisions
- Attacks are **pre-rolled** (flat pipeline) even in 3D dice mode — the 3D seeded-sim flow can't replay reactive crit explosions. Marked with a `ponytail:` comment.
- Slider semantics: single signed −7…+7 (advantage > 0, disadvantage < 0); engagement 0…7 subtracts from it per patch §1.
- Gobelin crit cap (§16): deliberately deferred, commented in engine.

## Verification
- `npm run test:unit` → 186 passed (incl. 20 new)
- `npm run build` → green
- Branch `agent/attack-roll`, commits `54743f3` (docs) + `ac4055c` (feat)

## Follow-ups
- 3D/physics attack animation if wanted (needs seeded server-side replay)
- Gobelin crit cap when a Gobelin character exists
- Attack panel in full sheet / GM dashboard if wanted
