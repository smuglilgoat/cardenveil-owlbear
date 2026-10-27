# System overview

How a change reaches a running room: five Vite entries, two custom plugins, and one reducer behind every mutation of game state. Each subsystem has its own page — [Game state pipeline](./game-state.md), [Character sheets](./character-sheets.md), [Cross-frame transports](./transports.md).

## Entry points

`vite.config.js` builds **5 rollup inputs** (4 pages + the background script):

| HTML              | Script / component                                            | Serves as                                                                                          |
| ----------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `index.html`      | `src/entries/main.js` → `src/lib/App.svelte`                  | main plugin panel (manifest `action.popover`)                                                      |
| `hand.html`       | `src/entries/hand.js` → `src/lib/HandPopover.svelte`          | floating card-fan popover (player and GM character)                                                |
| `dice.html`       | `src/entries/dice3d.js`                                       | animated dice-roll popup (three.js + Rapier, flat CSS fallback)                                    |
| `sheet.html`      | `src/entries/sheetPopover.js` → `src/lib/SheetPopover.svelte` | compact character-sheet popover                                                                    |
| `background.html` | `src/entries/background.js`                                   | persistent per-client page that listens on OBR broadcast and opens the dice popover for every roll |

The HTML files stay at the repository root on purpose: their built URLs (`/hand.html`, `/dice.html`, `/sheet.html`) are baked into OBR popovers already open in live rooms. Moving them breaks every existing room.

## Build pipeline

Two custom Vite plugins glue it together:

* **`generateCards()`** runs `node scripts/generate-cards.js` before *every* build and dev start. **sharp** rasterizes 52 normal + 52 crystallized SVGs into `public/cards/*.png` (`{suitId}-{value}[-c].png`, e.g. `S-10.png` or `H-3-c.png`, 120×180). `public/cards/` is tracked in git and regenerated, so builds are deterministic.
* **`dynamicManifest()`** serves `/manifest.json` in dev (middleware) and writes `dist/manifest.json` at build. The OBR plugin manifest declares the panel popover (`/`), the icon and — critically — `background_url: '/background.html'`, the persistent dice listener.

The plugin version has a single source: `src/version.js` (`APP_VERSION`), read by `vite.config.js` for the manifest and by `src/lib/appLog.js` for log rows. `package.json`'s `version` mirrors it — bump both together.

`dist/` is a build artefact (gitignored). `public/cards/` is generated but **tracked in git**.

## Game rules mapped to code

| Rule                                                                                              | Code                                                                                            |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Hand cap = maxHandSize + spiritBounds + racial                                                    | `handCap()` in `deck.js`                                                                        |
| Crystallized cards exempt from the hand cap                                                       | `crystallized` is a separate array, never capped                                                |
| Spirit token buys an extra hand slot ("Spirit Bound")                                             | `USE_ESPRIT` → `spiritBounds +1`                                                                |
| Crystallize costs one Spirit Bound                                                                | `CRYSTALLIZE` → `spiritBounds −1`                                                               |
| Force token: draw from the normal pool, or repeat an attack (logged as `SPEND_TOKEN`)             | `DRAW_FORCE` / `SPEND_TOKEN`                                                                    |
| Agilité token: discard 1 card, draw a chosen suit                                                 | `USE_AGILITE`                                                                                   |
| Esprit token: extend the hand or crystallize; in combat, Réverbération                            | `USE_ESPRIT` / `SPEND_TOKEN`                                                                    |
| Social token: propose a card exchange, refunded on decline; in combat, Marque                     | `PROPOSE_EXCHANGE` / `ACCEPT_EXCHANGE` / `DECLINE_EXCHANGE`, `SPEND_TOKEN`                      |
| Race (maison) draw effects                                                                        | `RACES` + race branches in `DRAW`, `DRAW_SPADE`, `SPORELIN_EXCHANGE`, `HALFLING_CHOOSE`         |
| Humain +2 jetons de Social                                                                        | `tokenCapBonus` / `maxTokensFor`                                                                |
| Hobgoblin gives its tokens away                                                                   | `GIVE_TOKEN`                                                                                    |
| Illithid recovers an Esprit token                                                                 | `DEVOUR_MIND` (`DEVOUR_COOLDOWN_MS`, `lastDevourAt`)                                            |
| Race traits (reference text)                                                                      | `RACE_TRAITS` + `raceTraits()` in `characterSheet.js`                                           |
| Fatigue penalty −1/−2/−4/−6                                                                       | `FATIGUE_PENALTY` in `deck.js` (constant used by the UI; the level is set by the GM)            |
| GM deal / give / swap / rest / fatigue                                                            | `DEAL_ALL`, `GIVE_CARDS`, `SWAP_CARD`, `REST_ALL`, `SET_FATIGUE`                                |
| Initiative tracker URL on every screen                                                            | `SET_INITIATIVE_URL` + `App.svelte` tab 3                                                       |
| Attack dice engine (one roll, kept die, crit explosions)                                          | `src/lib/attackRoll.js` per the [damage-roll rules](../game-rules/damage-rolls.md) |
| Combat formulas (Parade, Initiative, Mouvement, Volonté, Seuil miss, Canalisation, Bonus attaque) | `computeDerived()` in `characterSheet.js`                                                       |
| Dice parse/roll ("4d6", "2d8+3", "Mod Esprit D6", compounds)                                      | `parseDiceFormula` / `rollDice` / `parseDiceSpec`                                               |
| Card cost check + capacity roll logging                                                           | sheet UI + `USE_CAPACITY` (log-only action)                                                     |

The GM makes the calls; the app supplies the numbers. A capacity's cost is reduced by (associated stat − 10) — the sheet records the base cost and the reduction is applied narratively.

## What a session does

1. `CardGame.svelte` waits for `OBR.onReady`, reads the player id, name and role plus the party and room id, registers the player (or the GM character) through `api.dispatch`, and opens the realtime channel.
2. Players draw, pay capacities and spend tokens — each click is one action dispatched to the server.
3. The GM dashboard deals, rests, assigns races and fatigue, and everyone reads the shared log.
4. A roll intent is broadcast room-wide; every client's `background.html` opens a dice popover showing the same numbers.
5. Character sheets live in their own table and sync on their own channel.

The plugin is deliberately **not** a combat tracker: no grid, no HP bars, no turn order.
