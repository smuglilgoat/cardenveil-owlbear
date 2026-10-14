# AGENTS.md

## Commands

```bash
npm run dev      # Dev server (CORS open to https://www.owlbear.rodeo)
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

- **Entry points & layout**: `index.html` → `src/entries/main.js` → `src/lib/App.svelte` (main panel), `hand.html` → `src/entries/hand.js` → `src/lib/HandPopover.svelte` (floating card fan), `dice.html` → `src/entries/dice3d.js` (standalone animated dice-roll popup opened via `OBR.popover`), `sheet.html` → `src/entries/sheetPopover.js` → `src/lib/SheetPopover.svelte` (compact character-sheet popover), and `background.html` → `src/entries/background.js` (persistent dice-popover opener). All are built by Vite as separate rollup inputs. The HTML files stay at the repo root because their built URLs are baked into OBR popovers in live rooms — do not move them.
- **Svelte 5 runes** (`$state`, `$derived`, `$effect`) — not the old reactive-assignment style.
- **Tailwind CSS 4** via `@tailwindcss/vite` plugin (no PostCSS config).
- **OBR SDK calls** happen in `CardGame.svelte`, `PlayerHand.svelte`, `HandPopover.svelte`, `GMDashboard.svelte`, `CharacterSheet.svelte`, and `SheetPopover.svelte`. OBR is used **only** for identity (`player.*`), party info, viewport size, and popovers — **not** for game-state sync. Leaf UI components receive state + `onAction` callback as props — don't scatter OBR calls further.
  - `CharacterSheet.svelte` opens the animated dice-roll popup (`dice.html`, inline result fallback outside OBR) and the compact sheet popover (`sheet.html`) via `OBR.popover`.
  - `GMDashboard.svelte` opens the GM character hand popover (`hand.html?playerId=__gm_char__`).
  - OBR popovers are **not draggable** — `SheetPopover` and `HandPopover` fold/unfold via an in-page toggle + `OBR.popover.setHeight`; their popover id is passed in via the `?popoverId=` URL param.
- **HandPopover (v2.7.0 rework)**: the frame **owns its footprint** (`fitPopover()` measures the rendered bands — bar + fan + modal panel — and calls `setHeight`/`setWidth`, clamped to the viewport; `PlayerHand`/`GMDashboard` only open it with a provisional `460x172`). Layout: one bottom bar (fold toggle + colour left, draw + compact token chips right) and a fan band **exactly the card height** (120 px), so card actions live in an in-card strip and every token/Halfling/tieffelin/suit/target/exchange prompt is an in-frame **modal** (`src/lib/HandModal.svelte`, dark backdrop over the cards) instead of a floating panel. OBR popovers cannot be click-through (no pointer-events option in the SDK), so the footprint is the only lever — see `docs/debug-live-room.md` for the standalone preview (`hand.html?cards=15&state=...`) and the 🔍 Diag snapshots.
- **State sync**: all game state lives in **Supabase** (`game_rooms` table: JSONB state + `version` for optimistic concurrency via the `apply_game_action()` RPC), accessed server-authoritatively. Writes go to the **Supabase Edge Function** `action` first and fall back to the Netlify Function (`POST /api/state`); reads arrive via **Supabase Realtime** WebSocket push with optimistic client-side replay (`api.js` marks random draws as pending placeholders until the server confirms). The action reducer's **single source of truth is `src/lib/deck.js`** — `netlify/functions/_gameLogic.js` and `supabase/functions/action/_gameLogic.ts` are thin re-export shims (the Supabase one via the `_deck.js` symlink, since Supabase deploy bundling does not leave the function dir). **35 action types** are validated and applied atomically. Cards are dehydrated (objects → ID strings) before writing and rehydrated on read. Client-side API in `src/lib/api.js`.
- **Logging**: `src/lib/appLog.js` writes technical errors/lifecycle events to the Supabase `app_logs` table (per-frame `initLogging()`, global error handlers, dedupe + per-session cap, 30-day prune trigger in `supabase/migrations/20261013_create_app_logs.sql`). Reading: `select * from app_logs order by created_at desc limit 100;`. Never log game data or secrets — the in-game action log stays in `game_rooms.logs`.
- **Live-room diagnostics**: `src/lib/diag.js` — the GM's 🔍 Diag button broadcasts `cardenveil-diag` and every frame logs its own `diag_snapshot` (viewport, `data-diag` band rects, interactive bounds + `clippedBelow`) to `app_logs`; `hand.html?cards=N&diag=1` renders a mock fan outside OBR. Workflow: `docs/debug-live-room.md`.
- **Realtime resilience**: `supabaseClient.js` runs the Realtime client with `worker: true` + `heartbeatCallback` (Supabase's documented fix for silent disconnections in backgrounded tabs) and exposes `onRealtimeHealth`; `api.js` keeps the reconnect backoff, runs a catch-up `fetchState` after any reconnect, aborts every network call (8–10 s) and never gates the first paint on a fetch.
- **GM character**: reserved ID `__gm_char__` (`GM_CHAR_ID` in `deck.js`) is used for an optional GM player character.
- **Character sheets**: Stored in Supabase `character_sheets` table as JSONB documents. Each sheet is identified by `player_id` + `room_id` (unique constraint). Real-time sync via Supabase subscriptions. See "Character Sheet System" section below.

## Build-time codegen

The plugin version has a single source: `src/version.js` (`APP_VERSION`) — used by `vite.config.js` for `manifest.json` and by `src/lib/appLog.js` for log rows. `package.json`'s `version` mirrors it; bump both together.

`scripts/generate-cards.js` pre-generates 104 card PNGs (52 normal + 52 crystallized) into `public/cards/` using `sharp`. This runs **automatically** via a custom Vite plugin (`generateCards()` in `vite.config.js`) on every build start. A dynamic manifest plugin generates `manifest.json` for OBR with dev/prod naming.

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
- **Real-time subscriptions**: Sheets subscribe to Supabase realtime channels; the compact popover additionally runs a 1.5s reconcile poll on `actionChecks` to guarantee cross-view sync (BroadcastChannel transport was removed as redundant).

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
- **Racial default weapon**: `ensureRacialWeapon(sheet, race)` (characterSheet.js) grants `RACIAL_WEAPONS` entries (khajeet → Griffe 🐾 1d6 Finesse, catalogue `Armes uniques`) on import, ÉDITION save and the GM sheet/race paths; equipped in the main hand only when both hands are free. The GM race dropdown also writes the target sheet's `identity.race` because the attack engine reads the sheet, not game state.
- **Gobelin attack rule** (doc `docs/Reglejetdattaque.md` §16): `attackRoll.js` takes `opts.race` — a Gobelin crits on `dé − 1` (`critFrom`) and the explosion chain stops after `GOBELIN_MAX_CRITS` (3) per basic ⚔️ attack; only attack rolls use it, and `critFrom` travels with the roll intent to colour the popup chips.
- **Skills**: 16 skills grouped by attribute (Force: athlétisme, résilience; Agilité: acrobaties, discrétion, escamotage; Esprit: arcanes, investigation, perception, culture, survie; Social: persuasion, tromperie, intimidation, représentation, perspicacité, dressage) — groups/labels derived from the single `SKILL_TO_STAT` map.

### Supabase Table Schema

```sql
CREATE TABLE character_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, player_id)
);

-- Real-time subscription
ALTER PUBLICATION supabase_realtime ADD TABLE character_sheets;

-- Row Level Security (permissive, same as game_rooms)
ALTER TABLE character_sheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON character_sheets FOR ALL USING (true) WITH CHECK (true);
```

### Future Enhancements

- **Dice roll history**: Store all dice rolls in a separate table for audit trail.
- **Capacity usage tracking**: Log which capacities were used and when.
- **Character sheet templates**: Pre-fill common character archetypes.
- **PDF export**: Generate a printable character sheet PDF from the JSON data.
