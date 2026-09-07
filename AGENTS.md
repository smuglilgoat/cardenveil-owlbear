# AGENTS.md

## Commands

```bash
npm run dev      # Dev server (CORS open to https://www.owlbear.rodeo)
npm run build    # Production build → dist/
npm run preview  # Preview built output
npm test         # Run JEST tests (unit + API)
npm run test:unit   # Run only unit tests
npm run test:api    # Run only API tests
npm run test:coverage  # Run tests with coverage report
```

JSDoc type checking is enabled via `jsconfig.json` (`checkJs: true`). JEST is configured with `svelte-jester` for Svelte 5 components and `jsdom` environment for browser APIs.

## Architecture

- **Four entry points**: `index.html` → `src/main.js` → `App.svelte` (main panel), `hand.html` → `src/hand.js` → `HandPopover.svelte` (floating card fan), `dice.html` (standalone animated dice-roll popup opened via `OBR.popover`), and `sheet.html` → `src/sheetPopover.js` → `SheetPopover.svelte` (compact character-sheet popover: basic info + favorited rolls). All are built by Vite as separate rollup inputs.
- **Svelte 5 runes** (`$state`, `$derived`, `$effect`) — not the old reactive-assignment style.
- **Tailwind CSS 4** via `@tailwindcss/vite` plugin (no PostCSS config).
- **OBR SDK calls** are confined to `CardGame.svelte`, `PlayerHand.svelte`, and `HandPopover.svelte`. OBR is used **only** for identity (`player.getId()`, `player.getName()`, `player.getRole()`) and party info — **not** for state sync. Other components receive state + `onAction` callback as props — do not import OBR SDK in leaf components.
  - Exception: `src/lib/CharacterSheet.svelte` uses `OBR.popover` only, to open the animated dice-roll popup (`dice.html` entry) over the tabletop; falls back to an inline result panel if the popover fails.
  - Exception: `src/lib/handScene.js` renders cards as OBR scene items and uses `buildImage` from the SDK; it is only called by `HandPopover.svelte`.
  - `src/lib/Counter.svelte` is a leftover demo and should not be used as a pattern.
- **State sync**: all game state lives in **Netlify Blobs** (KV store), accessed via a server-authoritative Netlify Function (`netlify/functions/state.js`). Clients poll every 1.5s and dispatch actions via `POST /api/action`. The action reducer in `netlify/functions/_gameLogic.js` validates and applies all 28 action types atomically. Cards are dehydrated (objects → ID strings) before writing and rehydrated on read. Client-side API in `src/lib/api.js`. See `BLOB.md` for full architecture docs.
- **Hand scene rendering**: `handScene.js` renders the player's hand as local OBR scene image items in a fan layout. Card image URLs **must** be absolute (`window.location.origin + '/cards/...'`) because OBR's image renderer fetches from its own service-worker context. See `src/lib/cardSvg.js`.
- **GM character**: reserved ID `__gm_char__` (`GM_CHAR_ID` in `deck.js`) is used for an optional GM player character.
- **Character sheets**: Stored in Supabase `character_sheets` table as JSONB documents. Each sheet is identified by `player_id` + `room_id` (unique constraint). Real-time sync via Supabase subscriptions. See "Character Sheet System" section below.

## Build-time codegen

`scripts/generate-cards.js` pre-generates 104 card PNGs (52 normal + 52 crystallized) into `public/cards/` using `sharp`. This runs **automatically** via a custom Vite plugin (`generateCards()` in `vite.config.js`) on every build start. A dynamic manifest plugin generates `manifest.json` for OBR with dev/prod naming.

**Critical coupling**: `PNG_W` / `PNG_H` in `scripts/generate-cards.js` must match `CARD_W` / `CARD_H` in `src/lib/handScene.js` (currently 120×180). Changing one without the other breaks the scene card rendering.

## Conventions

- Components in `src/lib/` as `.svelte` files, Tailwind utilities inline — no per-component CSS.
- Dark theme: `#242424` background, indigo accents, gray surfaces.
- `src/hand.css` uses `background: transparent` (not `#242424`) because the hand popover is an overlay inside OBR; opaque backgrounds would block the tabletop.
- UI text is in **French**.
- `dist/` and `public/cards/` are build artifacts (dist is gitignored).

## Character Sheet System

### Architecture

- **Supabase storage**: Character sheets are stored in the `character_sheets` table as JSONB documents. Each sheet is identified by `player_id` + `room_id` (unique constraint).
- **Component**: `src/lib/CharacterSheet.svelte` — full character sheet editor with 6 tabs (identity, stats, skills, capacities, equipment, narrative).
- **API module**: `src/lib/characterSheet.js` — CRUD operations, dice rolling, and Supabase queries.
- **GM integration**: `GMDashboard.svelte` includes a "Fiche de personnage" button for each player, opening a modal with full edit capabilities.

### Data Structure

Character sheets follow the JSON structure documented in `docs/character-sheet-analysis.md`. Key sections:
- `identity`: Name, race, level, alignment
- `stats`: Base attributes (force, agilité, esprit, social)
- `derived`: Computed values (PV, initiative, mouvement, tokens)
- `skills`: 16 skills with trained flags and modifiers
- `capacities`: Abilities with card costs and dice formulas
- `equipment`: 7 armor slots + inventory items
- `narrative`: Background, personality, goals, flaws

### Synchronization

- **Bidirectional sync**: Tokens and fatigue are synchronized between the character sheet and game state in both directions.
- **Immediate updates**: Changes to the character sheet are saved to Supabase immediately; changes to game state (tokens spent, fatigue applied) update the character sheet via `$effect` in `CharacterSheet.svelte`.
- **Real-time subscriptions**: Character sheets subscribe to Supabase real-time channels for live updates across clients.

### Dice Rolling

- Capacities include dice formulas (e.g., "4d6", "2d8+3") in the `value.main` field.
- Clicking a capacity button calls `rollDice(formula)` from `characterSheet.js`.
- Results are displayed in a toast notification and logged to the action log.

### Edit Mode

- Players and GM can toggle between view and edit modes.
- Edit mode shows input fields for all editable properties.
- Save button writes changes to Supabase; Cancel reverts to the last saved state.
- GM can reset a character sheet to defaults via the "Réinitialiser" button.

### Key Implementation Details

- **No form labels**: Accessibility warnings are present but acceptable for this internal tool; all inputs are clearly labeled visually.
- **Capacity costs**: Stored as `cost.total` (numeric card value) + `cost.color` (suit name). Players must have a card matching both to use the ability.
- **Portrait URLs**: Stored as strings; players can paste image URLs or leave blank for a placeholder.
- **Skills**: 16 skills grouped by attribute (Force: athlétisme, résilience; Agilité: acrobaties, discrétion, escamotage; Esprit: arcanes, investigation, perception, culture, survie; Social: persuasion, tromperie, intimidation, représentation, perspicacité, dressage).

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
