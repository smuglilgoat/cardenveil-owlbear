# Race passives

24 races, catalogued in `RACES` (`src/lib/deck.js`, document order). The reducer validates `SET_RACE` against `RACE_IDS`. **Trait text lives in `RACE_TRAITS`** (`src/lib/characterSheet.js`), keyed by race id and read through `raceTraits(race)`; `tests/unit/characterSheet.test.js` asserts that the two key sets match. Unknown or free-text races stay untranslated (no traits).

Traits are reference text: a header tooltip on the sheet and on the compact popover, and the full list in ÉDITION → IDENTITÉ. Traits the app cannot track (distances, vision, rests, damage-type resistances, creature tracking) stay text-only by decision (2026-10-14).

## Reducer passives

| Race      | Effect                                          | Action                           |
| --------- | ----------------------------------------------- | -------------------------------- |
| Haut-Elfe | +1 hand slot                                    | `handCap`                        |
| Tieffelin | one free ♠ draw per game                        | `DRAW_SPADE`                     |
| Aasimar   | free crystallized ♥ per token spent             | `maybeAasimarHeart`              |
| Halfling  | draw 2, keep 1                                  | `DRAW` / `HALFLING_CHOOSE`       |
| Sporelin  | free card exchange                              | `SPORELIN_EXCHANGE`              |
| Gobelin   | crit on (die − 1), max 3 crits per basic attack | `attackRoll.js`                  |
| Humain    | +2 Social tokens                                | `tokenCapBonus` / `maxTokensFor` |
| Hobgoblin | gives its own tokens to an ally                 | `GIVE_TOKEN`                     |
| Illithid  | +1 Esprit, 30-minute cooldown                   | `DEVOUR_MIND`                    |

`maxTokens` stays the base value: every cap check and refill goes through the `maxTokensFor` helper, and `SET_RACE` grants the Humain delta once.

## Sheet-computed passives

Computed by `computeDerived()` or by the sheet's stat helpers, never written back:

| Race        | Effect                                                                           |
| ----------- | -------------------------------------------------------------------------------- |
| Nain        | PV + Force (`racePvBonus`, shown as a PV source)                                 |
| Drakéide    | +1 armure                                                                        |
| Demi-Orque  | armure ×2 below 50% PV                                                           |
| Centaure    | mouvement ×1,5                                                                   |
| Gnome       | Force 5–9 read as 10 (`effectiveStats()`, used by mods, skills and attack calls) |
| Mort-vivant | fatigue malus ignored below level 5 (`fatiguePenaltyFor`)                        |

## Roll passives

`raceRollAdvantage(race, kind)` returns +1, −1 or 0 and drives the avantage/désavantage of named rolls:

| Race      | Roll                     |
| --------- | ------------------------ |
| Elfe Noir | +Discrétion              |
| Goliath   | +Athlétisme              |
| Firbolg   | +Dressage, −Initiative   |
| Centaure  | +Athlétisme, −Acrobaties |

The roll becomes **2d20 keep best/worst**: `rollD20Keep` on the flat path, a manual `{ terms: [{ count: 2, sides: 20 }], modifier, keep }` intent on the 3D path, and a `keep` URL parameter from `background.js` to `dice3d.js`, where `rollTotal` / `rollCrit` / `rollFail` only look at the kept die.

## Attack-roll races

`attackRoll.js` also takes `opts.race`:

* **Gobelin** — crits on (die − 1) via `critFrom`, and the explosion chain stops after `GOBELIN_MAX_CRITS` (3) per basic ⚔️ attack. `critFrom` travels with the roll intent to colour the popup chips. Only attack rolls are affected; stat, skill and capacity rolls keep the plain max-face crit.
* **Goliath** — an épée longue counts as Finesse (Agilité governs engagement), and `isTwoHanded(weapon, race)` returns false, so a two-handed weapon leaves the off hand free.

## Import and display

`normalizeRaceName()` (canonical form: accentless, lowercase, hyphenated) plus `RACE_ALIASES` handle imported sheets: Halfelin, Tiefling, Drow, Dark/Wood/High Elf, Half-Elf, Half-Orc, Dwarf, Dragonborn, Undead, Fishman, Centaur, Warforged, Mind Flayer, Fir Bolg, Khajit and so on. Both the `.json` and `.zip` import paths apply it. "Halfelin" is an **import alias only**: the race is `halfling` in `RACES` and in `RACE_TRAITS`.

The Khajeet claws (`Griffes`) are a **built-in attack option** in the compact sheet, with no equipment entry; `stripStockGriffe` removes the old stock griffe on load and keeps renamed or edited ones.
