# AGENTS.md

## Commands

```bash
npm run dev      # Dev server (CORS open to https://www.owlbear.rodeo; see docs/local-dev.md
                 # to test it inside a real Owlbear room — no Netlify deploy needed)
npm run check    # Build gate: svelte-check, fails on undefined names/modules (also runs before build)
npm run build    # npm run check && Production build → dist/
npm run preview  # Preview built output
npm test         # Run JEST unit tests
npm run test:unit   # Run only unit tests
npm run test:watch  # Run tests in watch mode
npm run test:coverage  # Run tests with coverage report
```

JSDoc type checking is enabled via `jsconfig.json` (`checkJs: true`).

**Build gate (`scripts/check-svelte.mjs`, wired into `npm run build`)**: runs
`svelte-check` and fails only on reference errors — `Cannot find name/module/namespace`.
Those are invisible to Rollup (unbound identifiers look like globals) and have
shipped twice (`RACES is not defined`, `logEvent is not defined` in a popover
callback). The remaining ~1500 diagnostics are pre-existing JS/JSDoc
type-inference noise and are reported as a count only; `npm run check:types`
lists them in full. JEST is configured with `svelte-jester` for Svelte 5 components and `jsdom` environment for browser APIs.

## Architecture

- **Entry points & layout**: `index.html` → `src/entries/main.js` → `src/lib/App.svelte` (main panel), `hand.html` → `src/entries/hand.js` → `src/lib/HandPopover.svelte` (floating card fan), `dice.html` → `src/entries/dice3d.js` (standalone animated dice-roll popup opened via `OBR.popover`), `sheet.html` → `src/entries/sheetPopover.js` → `src/lib/SheetPopover.svelte` (compact character-sheet popover), `sheetFull.html` → `src/entries/sheetFull.js` → `src/lib/SheetFullPage.svelte` → `CharacterSheet` (the full sheet in a plain browser tab, issue #14: identity from `?playerId=&roomId=`, game state from Supabase, rolls relayed into Owlbear by `background.js` over the `cardenveil-roll` BroadcastChannel), and `background.html` → `src/entries/background.js` (persistent dice-popover opener). All are built by Vite as separate rollup inputs. The HTML files stay at the repo root because their built URLs are baked into OBR popovers in live rooms — do not move them.
- **Svelte 5 runes** (`$state`, `$derived`, `$effect`) — not the old reactive-assignment style.
- **Tailwind CSS 4** via `@tailwindcss/vite` plugin (no PostCSS config).
- **OBR SDK calls** happen in `CardGame.svelte`, `PlayerHand.svelte`, `HandPopover.svelte`, `GMDashboard.svelte`, `CharacterSheet.svelte`, and `SheetPopover.svelte`. OBR is used **only** for identity (`player.*`), party info, viewport size, and popovers — **not** for game-state sync. Leaf UI components receive state + `onAction` callback as props — don't scatter OBR calls further.
  - `CharacterSheet.svelte` opens the animated dice-roll popup (`dice.html`, inline result fallback outside OBR) and the compact sheet popover (`sheet.html`) via `OBR.popover`.
  - `GMDashboard.svelte` opens the GM character hand popover (`hand.html?playerId=__gm_char__`).
  - OBR popovers are **not draggable** — `SheetPopover` and `HandPopover` fold/unfold via an in-page toggle + `OBR.popover.setHeight`; their popover id is passed in via the `?popoverId=` URL param.
- **HandPopover (v2.7.0 rework)**: the frame **owns its footprint** (`fitPopover()` measures the rendered bands — bar + fan + modal panel — and calls `setHeight`/`setWidth`, clamped to the viewport; `PlayerHand`/`GMDashboard` only open it with a provisional `460x172`). Layout: one bottom bar (fold toggle + colour left, draw + compact token chips right) and a fan band **exactly the card height** (120 px), so card actions live in a vertical overlay on the active card and every token/Halfling/tieffelin/suit/target/exchange prompt is an in-frame **modal** (`src/lib/HandModal.svelte`, dark backdrop over the cards) instead of a floating panel. The fan is a **straight horizontal line** (`SPREAD_X = 64`), the cards absolutely positioned by index (`transform: translateX(cardTx(i, n))`, `z-index: i`). **The cards can be dragged to reorder them** (issue #18): the hand's order carries **no rules weight** (the rulebook never mentions it, the fatigue malus hits every roll, the reducer only looks cards up by id), so the order is a **local preference** (`src/lib/handOrder.js`: `localStorage` + the `storage` event, like the card colour scheme) applied **after** the fan's sort — the sort would otherwise undo it on every render. No server action, no reducer case, no deploy. The drag is pointer-based and horizontal only; the dragged card follows the pointer and the others slide into place. A drag touches only `transform`/`z-index`, so the fan's measured width (card **count**) and height (a constant band) cannot change — the popover keeps its footprint. OBR popovers cannot be click-through (no pointer-events option in the SDK), so the footprint is the only lever — see `docs/debug-live-room.md` for the standalone preview (`hand.html?cards=15&state=...`) and the 🔍 Diag snapshots.
- **State sync**: all game state lives in **Supabase** (`game_rooms` table: JSONB state + `version` for optimistic concurrency via the `apply_game_action()` RPC), accessed server-authoritatively. Writes go to the **Supabase Edge Function** `action` first and fall back to the Netlify Function (`POST /api/state`); the Netlify GET branch is **retired** and answers `410 Gone`, so a stale bundle cannot spend invocations on reads. State reads go straight to **Supabase** — REST for the first/catch-up fetch, **Realtime** WebSocket push for live updates — with optimistic client-side replay (`api.js` marks random draws as pending placeholders until the server confirms). The action reducer's **single source of truth is `src/lib/deck.js`** — `netlify/functions/_gameLogic.js` and `supabase/functions/action/_gameLogic.ts` are thin re-export shims (the Supabase one via the `_deck.js` symlink, since Supabase deploy bundling does not leave the function dir). **40 action types** are validated and applied atomically. Cards are dehydrated (objects → ID strings) before writing and rehydrated on read. Client-side API in `src/lib/api.js`.
- **Storage partitioning (measured, issue #14)**: a browser tab on the plugin's origin and the room's Owlbear frames (same origin, but embedded in `www.owlbear.rodeo`) do **NOT** share a storage partition — Chrome partitions **BroadcastChannel AND localStorage** by top-level site. Measured in this repo: a cross-site iframe received neither the parent's BroadcastChannel messages nor its `localStorage`. Consequences: the standalone sheet tab cannot talk to the room's frames in-browser (`cardenveil-roll`, `cardenveil-sheet`, `cardenveil-roll-result` all stay inside the frames' partition) and **cannot borrow their actor credential** — so it must never write `game_rooms`. Supabase is a network hop and crosses the boundary, which is why the sheet still syncs.
- **Command channel** (`src/lib/roomBridge.js`, table `room_commands`): how the standalone tab reaches the room. The tab INSERTs a command; the room's frames read it over Realtime (`postgres_changes`) and act with **their own** credentials. `src/entries/background.js` is the executor: it is always inside Owlbear, it holds the room's credential, and it opens the dice popup — it relays a `roll` command over `OBR.broadcast` (only for the command's owner, so the popup's `self` flag still marks the roller). The tab's own `game_rooms` writes are replaced by `action` commands, which keeps exactly one credential per actor, in one partition. Commands are **signed** with an HMAC secret the room mints when it opens the tab (`src/lib/commandSecret.js`): the table is world-writable, so an unsigned command would let anyone act as the tab's owner. The frames read the commands by **polling** the table (one REST read every 1.5 s), not over Realtime: the postgres_changes subscription on this table kept dying with CHANNEL_ERROR while the game's own channels were fine, and a roll that arrives a second late is still a roll that arrives. The signature covers a canonicalised `[kind, room_id, payload]`, and the payload carries the timestamp, so a captured command replayed later is stale; the executor also drops each row when it reads it and remembers the signatures it has already run. Stale commands (> 30 s) are ignored. **Known limit**: the secret travels in the tab's URL (`&k=`) and lives as long as the room — a leaked tab URL is a leaked credential for that player until the room's secret is rotated.
- **Write-path guard** (`src/lib/actionGuard.js`, imported by both server functions — never by the client bundle): **idempotency only**. `actionId` (128-bit, generated per dispatch) makes a retried action a no-op: the same action re-sent to the Netlify fallback after a lost Edge response is ignored instead of applied twice (`lastActionIds`, a 50-entry ring). **The actor token was removed in 2.10.2**: `game_rooms` is writable by anyone holding the public anon key (RLS is `true` for anon and the key ships in the bundle), so a per-identity credential guarded nothing, while it locked out every browser that did not hold the exact one — a second browser, cleared storage, or the dev origin, whose `localStorage` is a different partition from production's. `missing_token` / `bad_token` refusals are gone; there is nothing to reset.
- **Logging**: `src/lib/appLog.js` writes technical errors/lifecycle events to the Supabase `app_logs` table (per-frame `initLogging()`, global error handlers, dedupe + per-session cap, 30-day prune trigger in `supabase/migrations/20261013_create_app_logs.sql`). Reading: `select * from app_logs order by created_at desc limit 100;`. Never log game data or secrets — the in-game action log stays in `game_rooms.logs`.
- **Live-room diagnostics**: `src/lib/diag.js` — the GM's 🔍 Diag button broadcasts `cardenveil-diag` and every frame logs its own `diag_snapshot` (viewport, `data-diag` band rects, interactive bounds + `clippedBelow`) to `app_logs`; `hand.html?cards=N&diag=1` renders a mock fan outside OBR. Workflow: `docs/debug-live-room.md`.
- **Realtime resilience**: `supabaseClient.js` runs the Realtime client with `worker: false` and an explicit 10 s `heartbeatIntervalMs` + `heartbeatCallback` — with a worker, realtime-js disables the socket's own heartbeat and the worker does not run inside OBR's sandboxed iframes, so nothing heartbeats and the server closed the socket every ~30 s. It exposes `onRealtimeHealth` (heartbeat problems are logged as `realtime_heartbeat_problem`); `api.js` keeps the reconnect backoff (counted in consecutive *failed recoveries* — a connection must stay up 60 s to reset it), runs a catch-up `fetchState` after any reconnect, aborts every network call (8–10 s) and never gates the first paint on a fetch.
- **GM character**: reserved ID `__gm_char__` (`GM_CHAR_ID` in `deck.js`) is used for an optional GM player character.
- **Character sheets**: Stored in Supabase `character_sheets` table as JSONB documents. Each sheet is identified by `player_id` + `room_id` (unique constraint). Real-time sync via Supabase subscriptions. See "Character Sheet System" section below.

## Build-time codegen

The plugin version has a single source: `src/version.js` (`APP_VERSION`) — used by `vite.config.js` for `manifest.json` and by `src/lib/appLog.js` for log rows. `package.json`'s `version` mirrors it; bump both together.

`scripts/generate-cards.js` pre-generates 104 card PNGs (52 normal + 52 crystallized) into `public/cards/` using `sharp`. This runs **automatically** via a custom Vite plugin (`generateCards()` in `vite.config.js`) on every build start. A dynamic manifest plugin generates `manifest.json` for OBR with dev/prod naming.

## Documentation (GitBook)

The published docs live at **https://the-aerie.gitbook.io/cardenveil** (`/` = Documentation, `/changelog` = Changelog). The repo is the Git Sync source; two mapped directories, each a self-contained space with its own `.gitbook.yaml`, `README.md` and `SUMMARY.md`:

| Directory | Space | Notes |
|---|---|---|
| `docs/documentation/` | Documentation | 16 pages, English except `game-rules/` (French, player-facing) |
| `docs/changelog/` | Changelog | one page per minor version (`2.7.md`), patch releases are sections in it |

`docs/README.md` explains the layout. Rules that matter:

- **`SUMMARY.md` is the navigation.** A page missing from it is not published — but it is **not** a privacy control. Keep internal material outside the mapped directories: `docs/agent-sessions/` and `docs/design/` are deliberately unmapped. Never "hide" a file by leaving it out of `SUMMARY.md`.
- **Legacy files at the `docs/` root stay put.** `src/lib/attackRoll.js:1` and this file cite `docs/Reglejetdattaque.md` and `docs/debug-live-room.md`; moving them leaves dangling references. Edit the published page under `docs/documentation/` instead.
- **Edit published content in GitBook**, not here — GitBook commits the result back, so a concurrent hand-edit conflicts. GitBook's API can only change content through change requests (open → edit → merge), never directly.
- **Git Sync setup is mostly API-driven but GitHub auth is browser-only.** `POST /git/installations` + `PATCH` with `repositoryId`/`branch` configure it; `repositoryId` for `smuglilgoat/cardenveil-owlbear` is `1108442446`, branch `refs/heads/main`. The initial sync direction must be **Git → GitBook**; the other direction overwrites this repo.
- Do not hand-write `gitbook-docs.yaml` space `key`s — GitBook generates them, and changing a key replaces the space with a new one.
- **The mapping lives in `gitbook-docs.yaml`** (repo root): project directory `""`, each space at `content.directory`. Per-space installations are children of the site installation and **inherit its provider config** — patching a child's `providerConfiguration` returns 400. Move a space by setting `childInstallationProjectDirectories` on the site installation *and* editing `gitbook-docs.yaml` in the same commit; otherwise a sync in between mirrors an empty directory.
- GitBook rewrites pages on export (`*` bullets, `_itals_`, bare links). That form is canonical — do not tidy it back.

### Changelog (patch notes)

The notes are written **for the players and the GM**, not for developers. Describe what changed in play and what to do about it, in French, in their vocabulary — never file names, function names or implementation detail. A reader should be able to tell whether a release affects their table from the title alone.

- **One file per minor version**: `docs/changelog/<major>.<minor>.md` (`2.7.md`, never `2.7.4.md`). Each release is a section in its minor's page — `## <version> — <résumé>`, its categories as `###` — newest first, so a patch release is added at the top of the existing page, never as a new file. A run of patch releases that only touch the same subsystem may stay one section (`## 2.7.1 → 2.7.15 — correctifs du popover de main`), where every bullet carries the version it landed in, in italics. Fifteen pages saying "the popover is 20 px lower" is not a changelog; one page is.
- **Title**: `# Cardenveil <major>.<minor> — <résumé>` for the page, `## <version> — <résumé>` for each release inside it. The résumé is lowercase, has no trailing period, and names the release's dominant change in 3–8 words (`les 24 races et leurs traits`, `correctifs du popover de main`). Never `notes de version` — the space is already the changelog, so it says nothing.
- **Nothing between the title and the body.** No lead line, no `remplace la version X`, no thematic break. Content starts on line 3 with the newest `## <version>` section.
- **`SUMMARY.md` is regenerated by GitBook on export**: a flat list whose labels are the page titles. So the H1 doubles as the sidebar label — keep the résumé short enough to scan (3–8 words), and do not hand-maintain navigation labels or version groups; they will be flattened.
- **Say what the table must do.** When a release needs an action after updating (reload the room once, redeploy), give it an `### À faire une fois après la mise à jour` section, inside that release's section.
- Authoring rules for the body (categories, translating developer detail, what to exclude) live in the
  `cardenveil-release-notes` skill; load it before writing or rewriting a note.
- The consolidated digest is the only exception: `# Cardenveil — notes complètes (<from> → <to>)`, grouped by theme rather than by version.

## Bug reports

Players and the GM file bugs as **GitHub issues** on
`smuglilgoat/cardenveil-owlbear` (two forms: `bug_report.yml`,
`bug_report_detailed.yml`; labels `area:*`, `severite:*`, `role:*`). The
workflow — reproduce, branch `issue/<n>-<slug>`, `Fixes #<n>` in the commit,
ship with a changelog note — is in
`docs/documentation/operations/contributing.md`. The repo is **public**: never
put a player name, a character name or a full room id in an issue. Technical
errors quoted by a reporter live in the Supabase `app_logs` table.

## Conventions

- Components in `src/lib/` as `.svelte` files, Tailwind utilities inline — no per-component CSS.
- Dark theme: `#242424` background, indigo accents, gray surfaces.
- `src/hand.css` and `src/sheetPopover.css` use `background: transparent` (not `#242424`) because the hand/sheet popovers are overlays inside OBR; opaque backgrounds would block the tabletop. Both entries must `@import "tailwindcss"` or the popover renders unstyled.
- UI text is in **French**.
- `dist/` is a build artifact (gitignored); `public/cards/` are generated PNGs tracked in git, regenerated on every build.

## Character Sheet System

### Architecture

- **Supabase storage**: Character sheets are stored in the `character_sheets` table as JSONB documents. Each sheet is identified by `player_id` + `room_id` (unique constraint).
- **Zip-archive import**: IMPORTER accepts `.json` or `.zip`. A zip contains `<sheetId>.rpsheet.json` + `metadata.json` (ignored) + `assets/<sheetId>/` with `portrait.png`, `totem.png`, `capacity-N.png`; the sheet JSON references them by relative path (`/assets/<sheetId>/…`). `src/lib/sheetAssets.js` unzips (`fflate`), uploads every referenced image to the Supabase Storage **`character-assets`** bucket (public read, path `{roomId}/{playerId}/{fileName}`, upsert, `?v=` cache-buster on the stored URL), rewrites the image fields to those URLs, then runs the regular `importCharacterSheet` merge/strip/save. Bucket setup: `supabase/migrations/20260910_create_character_assets_bucket.sql`.
- **Component**: `src/lib/CharacterSheet.svelte` — full character sheet with 6 tabs (COMPÉTENCES, CAPACITÉS, INVENTAIRE, NARRATIF, MAÎTRISES, NOTES). ÉDITION opens a large in-app edit modal (header/tabs stay display-only and show the edit buffer live).
- **Compact popover**: `src/lib/SheetPopover.svelte` (`sheet.html` entry) — basic info + per-turn action diamonds + favorited (📌) skills/capacities click-to-roll; folds/unfolds in place.
- **API module**: `src/lib/characterSheet.js` — CRUD, dice rolling, rule-derived combat values, and shared UI constants (stat colors, skill groups, suit helpers, `EQUIPMENT_CATALOG`).
- **GM integration**: `GMDashboard.svelte` includes a "Fiche de personnage" button per player, opening a modal with view/edit capabilities.

### Data Structure

The live schema source of truth is **`createEmptyCharacterSheet()` in `src/lib/characterSheet.js`** — `docs/character-sheet-analysis.md` is an outdated planning doc. Key fields:
- `identity`: Nom, race, niveau, alignement + extras (joueur, âge, taille, yeux…)
- `stats`: Base attributes (force, agilité, esprit, social)
- `derived`: Computed + manual values (PV, initiative, mouvement, volonte, seuilMiss, canalisation, bonusAttaque, fatigue, mort…)
- `defense`: parade components (deflexion, armure, gardeBonus, bonus)
- `skills`: 16 skills with trained flags and modifiers (bonuses derived from governing stats)
- `capacities`: Abilities with card costs (`cost.total` + `cost.color`), usage text, and dice formulas in `value.main`
- `equipment`: 7 armor slots (casque, plastron, gantelets, bottes, anneau, amulette, cape)
- `weapons` + `inventoryItems`: structured lists with an `equipped` flag; edit forms pre-fill from the static `EQUIPMENT_CATALOG`
- `narrative`: background, objectif, liens, and 8 more narrative fields
- `totem`: nom/description/image (image accepts emoji or URL, see `isImageUrl()`)
- `pinnedSkills` / `pinnedCapacities`: 📌 favorites (click-to-roll in the compact popover)
- `actionChecks`: per-turn `{action, bonus, reaction}` diamond toggles
- `notes` / `evolutions` / `feats` / mastery arrays

### Synchronization

- **Bidirectional sync**: Tokens and fatigue are synchronized between the character sheet and game state in both directions.
- **Immediate updates**: Pins, action diamonds, and game-state token/fatigue changes save to Supabase immediately (via `$effect` in `CharacterSheet.svelte`); sheet edits save on ÉDITION Save.
- **Real-time subscriptions**: Sheets subscribe to Supabase realtime channels. Sheet saves also broadcast on the same-origin `BroadcastChannel('cardenveil-sheet')` (`broadcastSheet()`/`onSheetBroadcast()` in `characterSheet.js`), so other frames of the same browser refresh immediately; the compact popover additionally runs a 1.5s reconcile poll on `actionChecks` as a fallback.

### Dice Rolling

- Capacities include dice formulas (e.g., "4d6", "2d8+3", "Mod Esprit D6") in the `value.main` field — parsed by `parseDiceFormula()`.
- Rolls open the animated **dice popup** (`dice.html` via `OBR.popover`, auto-close 6s; crit gold / natural-1 red flashes) with an inline result panel as fallback outside OBR; results are also logged via the `USE_CAPACITY` action.
- The compact popover rolls favorited skills (d20+mod) and capacities via `api.dispatch`, without importing the game reducer beyond what `api.js` needs.

### Edit Mode

- ÉDITION opens a large in-app edit modal (its own 6-tab bar) with identity/PV/stats editing plus the active tab's edit forms; the main header and tabs display-only and reflect the edit buffer live.
- Save button writes changes to Supabase (after `syncSkillBonuses` + `syncStatsFromEquipment`); Cancel reverts to the last saved state.
- Rule-derived combat values (parade, initiative, mouvement, volonté, seuilMiss, canalisation, bonusAttaque) are **computed, never manual** — see `computeDerived()`.

### Key Implementation Details

- **No form labels**: Accessibility warnings are present but acceptable for this internal tool; all inputs are clearly labeled visually.
- **Capacity costs**: Stored as `cost.total` (numeric card value) + `cost.color` (suit name). Players must have a card matching both to use the ability. COÛT renders the suit symbol with per-suit color; capacity type badges (ACTION/BONUS ACTION/RÉACTION/CONCENTRATION) color-coded from the usage text via `capacityType()`.
- **Combat formulas** (authoritative, decided 2026-09-08): Parade = Déflexion + Garde (equipped melee die/2) + modifier (Agi; Force with shield; Force+Agi for épées droites); Initiative = Agilité − 10 + gantelets; Mouvement = 8 + Agi/2 + bottes; Volonté = mod Résilience + casque; Seuil miss = max(1, 1 − mod Agi). All computed by `computeDerived()`; weapon categories are keyword-matched on free-text fields.
- **Card face colors**: sheet suit-color schema (`suitColorBySymbol()`) applied to cards + hand popover; per-player classic red/black switch via `getCardScheme()` (localStorage `cardenveil-card-scheme`, cross-frame synced).
- **Image slots**: portrait/capacity/totem images accept an emoji OR a URL (`isImageUrl()` decides rendering).
- **Portrait URLs**: Stored as strings; players can paste image URLs or leave blank for a placeholder.
- **In-sheet item add**: `ItemAddPopup` takes `askQuantity` (used by the SAC, ÉDITION and the GM modal): picking a **consumable** shows a quantity step (−/＋ or 1–99 input) before calling `onPick(name, isWeapon, quantity)`, forwarded to `withItemFromTemplate(sheet, name, quantity)`.
- **In-sheet item add**: `src/lib/ItemAddPopup.svelte` (centred modal, full `EQUIPMENT_CATALOG` with icons + blank item/weapon) is opened by the « ＋ Ajouter » button in the INVENTAIRE/SAC view and by the GM sheet modal; both write through the shared pure helpers `withItemFromTemplate` / `withWeaponFromTemplate` in `characterSheet.js` (ÉDITION's dropdowns use them too). No ÉDITION round-trip needed.
- **Racial default weapon**: the Khajeet claws (`Griffes`) are a **built-in attack option** in the compact sheet (no equipment entry; `stripStockGriffe` removes the old stock griffe on load, renamed/edited ones are kept).
- **Gobelin attack rule** (doc `docs/Reglejetdattaque.md` §16): `attackRoll.js` takes `opts.race` — a Gobelin crits on `dé − 1` (`critFrom`) and the explosion chain stops after `GOBELIN_MAX_CRITS` (3) per basic ⚔️ attack; only attack rolls use it, and `critFrom` travels with the roll intent to colour the popup chips.
- **Goliath attack rule**: `attackRoll.js` also takes `opts.race` for `weaponFlags`/`engagementStat` — a Goliath's épée longue counts as Finesse (Agilité engagement), and `isTwoHanded(weapon, race)` returns false for a Goliath (2H weapon in one hand, so the off hand stays free).
- **Weapon model (2.9.0)**: a weapon is `{nom, de, icon, bonus, degats, scaling, finesse, tags[], raretePrix, description}`. `scaling` (force/agilite/esprit/social) feeds `attackBonus()` → the B. ATT. shown top-left; `finesse` (true/false/null) is the GM's checkbox and wins over the Finesse tag when set. `PROPERTY_TAGS` (`characterSheet.js`) is the property vocabulary with its rule text; `weaponTags(weapon)` reads `tags[]` and parses a legacy free-text `proprietes` on the fly, and `migrateWeapon`/`migrateSheet` convert a sheet on read (`fetchCharacterSheet`, `importCharacterSheet`). `weaponFromTemplate` no longer emits `forceAgi`/`avantage`/`critique`/`perfection`/`notes`/`proprietes`.
- **Amplitude / Hybride (2.9.0, Hybride revised in 2.9.1)**: `attackPreview(weapon, stats, { amplitude, finesse })` grants Finesse for that attack when the weapon carries the Amplitude tag (`finesse` is the attack panel's checkbox, issue #10). **Hybride** (GM's rule, issue #17 — it supersedes #12): the weapon counts as Finesse for Agility only — the Agility modifier is already inside the weapon bonus, so nothing is added — `total = dés + bonus + crits × (bonus − max(Force,0))` (a **negative Force is simply not taken into account**, on the crit or on the damage), and the engagement adds `max(Force,0) + max(Agilité,0)` per level, **plus max(Agilité,0) per crit**. The Hybride branch replaces the Finesse repeat (no double count). The rule lives in `docs/Reglejetdattaque.md` §21 and in `CARDENVEIL.md` (propriétés uniques) — it used to exist only in the code, which is how the two versions drifted apart.
- **Brute (2.9.1)**: a weapon with the Brute tag never crits — `runAttack` skips the whole explosion chain and the dice popup gets `noCrit=1` (no gold chip, no crit zoom; `critAt` clamps `critFrom`, so sides+1 would not work).
- **Skills**: 16 skills grouped by attribute (Force: athlétisme, résilience; Agilité: acrobaties, discrétion, escamotage; Esprit: arcanes, investigation, perception, culture, survie; Social: persuasion, tromperie, intimidation, représentation, perspicacité, dressage) — groups/labels derived from the single `SKILL_TO_STAT` map.

### Races

- **Catalog**: 25 races in `RACES` (`src/lib/deck.js`, document order) — the reducer validates `SET_RACE` against `RACE_IDS`. **Trait text lives in `RACE_TRAITS` (`characterSheet.js`)**, keyed by race id and read through `raceTraits(race)`; a unit test asserts the two key sets match. Unknown/free-text races stay untranslated (no traits).
- **Display**: traits are reference text — header tooltip on the sheet + compact popover, full list in ÉDITION → IDENTITÉ. Traits the app cannot track (distances, vision, rests, damage-type resistances, creature tracking) are text only by decision (2026-10-14).
- **Import normalization**: `normalizeRaceName()` (canonical = accentless/lowercase/hyphenated) + `RACE_ALIASES` (Halfelin, Tiefling, Drow, Dark/Wood/High Elf, Half-Elf, Half-Orc, Dwarf, Dragonborn, Undead, Fishman, Centaur, Warforged, Mind Flayer, Fir Bolg, Khajit…), applied by `importCharacterSheet` for both .json and .zip.
- **Reducer passives** (`deck.js`): Haut-Elfe +1 hand (`handCap`), Tieffelin ♠ draw (`DRAW_SPADE`), Aasimar ♥ per token (`maybeAasimarHeart`), Halfling draw-2-keep-1 (`DRAW`/`HALFLING_CHOOSE`), Sporelin free exchange (`SPORELIN_EXCHANGE`), Gobelin crit (attackRoll), **Humain +2 Social** (`tokenCapBonus`/`maxTokensFor` — `maxTokens` stays the base, every cap check/refill goes through the helper; `SET_RACE` grants the delta once), **Hobgoblin `GIVE_TOKEN`**, **Illithid `DEVOUR_MIND`** (+1 Esprit, 30-min `DEVOUR_COOLDOWN_MS`, `lastDevourAt` in the player record).
- **Sheet-computed passives** (`computeDerived`, never written back except the existing sync): Nain PV `+Force` (`racePvBonus`, shown as a PV source), Drakéide +1 armure, Demi-Orque armure ×2 under 50 % PV, Centaure mouvement ×1,5, Gnome Force 5–9 read as 10 (`effectiveStats()` — used by the sheet's mods, skills and attack calls), Mort-vivant fatigue malus ignored below level 5 (`fatiguePenaltyFor`).
- **Roll passives**: racial avantage/désavantage is **text only** (2.9.0): the app no longer rolls 2d20 keep-best/worst for Elfe Noir Discrétion, Goliath Athlétisme, Firbolg Dressage/Initiative or Centaure Acrobaties — the player decides at the table. The generic `rollD20Keep` / `keep` plumbing (flat path, 3D intent, `keep` URL param in `background.js` → `dice3d.js`) stays available but nothing racial feeds it.
- **Nimbri split (2.9.1)**: `SPLIT_CARD` halves one hand card into two equal halves (face value 11 → two 5s, the remainder is lost). `player.splitAvailable` gates it: armed **only by an explicit draw** — `DRAW` and `DRAW_FORCE` — and cleared by the split; no time cooldown (the once-per-round limit is the table's, issue #15). UI: the ✂ button in the HandPopover bar when a card is selected, and a `✂` action on the card in the main-panel hand.
- **Aasimar heart (2.9.0)**: spending a token draws a **normal** ♥ card into the hand (discarded when the hand is full) — no longer a crystallized card.

### Supabase Table Schema

```sql
-- player_id/room_id are TEXT to match OBR ids (same pattern as game_rooms;
-- there is no game_rooms migration in this repo, so no FK)
CREATE TABLE character_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  race TEXT,
  level INTEGER DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_player_room_sheet UNIQUE (player_id, room_id)
);

CREATE INDEX idx_character_sheets_player ON character_sheets(player_id);
CREATE INDEX idx_character_sheets_room ON character_sheets(room_id);

-- Real-time subscription
ALTER PUBLICATION supabase_realtime ADD TABLE character_sheets;

-- Row Level Security (permissive, same as game_rooms)
ALTER TABLE character_sheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations" ON character_sheets FOR ALL USING (true) WITH CHECK (true);
```

### Future Enhancements

- **Dice roll history**: Store all dice rolls in a separate table for audit trail.
- **Capacity usage tracking**: Log which capacities were used and when.
- **Character sheet templates**: Pre-fill common character archetypes.
- **PDF export**: Generate a printable character sheet PDF from the JSON data.
