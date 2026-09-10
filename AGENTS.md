# AGENTS.md

## Commands

```bash
npm run dev      # Dev server (CORS open to https://www.owlbear.rodeo)
npm run build    # Production build → dist/
npm run preview  # Preview built output
npm test         # Run JEST unit tests
npm run test:unit   # Run only unit tests
npm run test:watch  # Run tests in watch mode
npm run test:coverage  # Run tests with coverage report
```

JSDoc type checking is enabled via `jsconfig.json` (`checkJs: true`). JEST is configured with `svelte-jester` for Svelte 5 components and `jsdom` environment for browser APIs.

## Architecture

- **Four entry points**: `index.html` → `src/main.js` → `App.svelte` (main panel), `hand.html` → `src/hand.js` → `HandPopover.svelte` (floating card fan), `dice.html` (standalone animated dice-roll popup opened via `OBR.popover`), and `sheet.html` → `src/sheetPopover.js` → `SheetPopover.svelte` (compact character-sheet popover: basic info + favorited rolls). All are built by Vite as separate rollup inputs.
- **Svelte 5 runes** (`$state`, `$derived`, `$effect`) — not the old reactive-assignment style.
- **Tailwind CSS 4** via `@tailwindcss/vite` plugin (no PostCSS config).
- **OBR SDK calls** happen in `CardGame.svelte`, `PlayerHand.svelte`, `HandPopover.svelte`, `GMDashboard.svelte`, `CharacterSheet.svelte`, and `SheetPopover.svelte`. OBR is used **only** for identity (`player.*`), party info, viewport size, and popovers — **not** for game-state sync. Leaf UI components receive state + `onAction` callback as props — don't scatter OBR calls further.
  - `CharacterSheet.svelte` opens the animated dice-roll popup (`dice.html`, inline result fallback outside OBR) and the compact sheet popover (`sheet.html`) via `OBR.popover`.
  - `GMDashboard.svelte` opens the GM character hand popover (`hand.html?playerId=__gm_char__`).
  - OBR popovers are **not draggable** — `SheetPopover` and `HandPopover` fold/unfold via an in-page toggle + `OBR.popover.setHeight`; their popover id is passed in via the `?popoverId=` URL param.
- **State sync**: all game state lives in **Supabase** (`game_rooms` table: JSONB state + `version` for optimistic concurrency via the `apply_game_action()` RPC), accessed server-authoritatively. Writes go to the **Supabase Edge Function** `action` first and fall back to the Netlify Function (`POST /api/state`); reads arrive via **Supabase Realtime** WebSocket push with optimistic client-side replay (`api.js` marks random draws as pending placeholders until the server confirms). The action reducer's **single source of truth is `src/lib/deck.js`** — `netlify/functions/_gameLogic.js` and `supabase/functions/action/_gameLogic.ts` are thin re-export shims (the Supabase one via the `_deck.js` symlink, since Supabase deploy bundling does not leave the function dir). **34 action types** are validated and applied atomically. Cards are dehydrated (objects → ID strings) before writing and rehydrated on read. Client-side API in `src/lib/api.js`.
- **GM character**: reserved ID `__gm_char__` (`GM_CHAR_ID` in `deck.js`) is used for an optional GM player character.
- **Character sheets**: Stored in Supabase `character_sheets` table as JSONB documents. Each sheet is identified by `player_id` + `room_id` (unique constraint). Real-time sync via Supabase subscriptions. See "Character Sheet System" section below.

## Build-time codegen

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
- **Compact popover**: `src/SheetPopover.svelte` (`sheet.html` entry) — basic info + per-turn action diamonds + favorited (📌) skills/capacities click-to-roll; folds/unfolds in place.
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
