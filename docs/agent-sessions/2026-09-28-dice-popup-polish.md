# Dice popup layout polish

- **Goal:** Enlarge the roll popup, prevent large dice pools from producing a vertical scrollbar, and show the roller's portrait beside the roll title.
- **Branch:** `agent/dice-popup-polish`
- **Assumption:** The portrait is the existing character-sheet portrait. The Owlbear SDK `Player` shape does not expose an account avatar.
- **Files changed:** `dice.html`, `src/background.js`, `src/dice3d.js`, `src/lib/CharacterSheet.svelte`, `src/SheetPopover.svelte`, `src/lib/diceRoll.js`, `tests/unit/diceRoll.test.js`, `.agent/CONTINUITY.md`.
- **Implementation:** Popup increased from 460×380 to 520×440. All roll paths show up to 15 die-value chips plus `+N`; every die is still simulated and included in the total. Both character-sheet roll entry points pass portrait data; the popup shows the portrait image/emoji, or the player's initial when no portrait exists.
- **Commands run:** `npm test -- --runInBand`; `npm run build`; `git diff --check`; `rg -n "broadcastRoll\\(" src`.
- **Verification:** 166 tests pass; production build succeeds; diff check passes. Build emits the repository's existing Svelte accessibility warnings and large dice-chunk warning. Live Owlbear visual verification remains pending.
