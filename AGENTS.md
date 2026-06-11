# AGENTS.md

## Commands

```bash
npm run dev      # Dev server (CORS open to https://www.owlbear.rodeo)
npm run build    # Production build → dist/
npm run preview  # Preview built output
```

No test, lint, or typecheck scripts exist. JSDoc type checking is enabled via `jsconfig.json` (`checkJs: true`).

## Architecture

- **Two entry points**: `index.html` → `src/main.js` → `App.svelte` (main panel) and `hand.html` → `src/hand.js` → `HandPopover.svelte` (floating card fan). Both are built by Vite as separate rollup inputs.
- **Svelte 5 runes** (`$state`, `$derived`, `$effect`) — not the old reactive-assignment style.
- **Tailwind CSS 4** via `@tailwindcss/vite` plugin (no PostCSS config).
- **OBR SDK calls** are confined to `CardGame.svelte`, `PlayerHand.svelte`, and `HandPopover.svelte`. OBR is used **only** for identity (`player.getId()`, `player.getName()`, `player.getRole()`) and party info — **not** for state sync. Other components receive state + `onAction` callback as props — do not import OBR SDK in leaf components.
  - Exception: `src/lib/handScene.js` renders cards as OBR scene items and uses `buildImage` from the SDK; it is only called by `HandPopover.svelte`.
  - `src/lib/Counter.svelte` is a leftover demo and should not be used as a pattern.
- **State sync**: all game state lives in **Netlify Blobs** (KV store), accessed via a server-authoritative Netlify Function (`netlify/functions/state.js`). Clients poll every 1.5s and dispatch actions via `POST /api/action`. The action reducer in `netlify/functions/_gameLogic.js` validates and applies all 28 action types atomically. Cards are dehydrated (objects → ID strings) before writing and rehydrated on read. Client-side API in `src/lib/api.js`. See `BLOB.md` for full architecture docs.
- **Hand scene rendering**: `handScene.js` renders the player's hand as local OBR scene image items in a fan layout. Card image URLs **must** be absolute (`window.location.origin + '/cards/...'`) because OBR's image renderer fetches from its own service-worker context. See `src/lib/cardSvg.js`.
- **GM character**: reserved ID `__gm_char__` (`GM_CHAR_ID` in `deck.js`) is used for an optional GM player character.

## Build-time codegen

`scripts/generate-cards.js` pre-generates 104 card PNGs (52 normal + 52 crystallized) into `public/cards/` using `sharp`. This runs **automatically** via a custom Vite plugin (`generateCards()` in `vite.config.js`) on every build start. A dynamic manifest plugin generates `manifest.json` for OBR with dev/prod naming.

**Critical coupling**: `PNG_W` / `PNG_H` in `scripts/generate-cards.js` must match `CARD_W` / `CARD_H` in `src/lib/handScene.js` (currently 120×180). Changing one without the other breaks the scene card rendering.

## Conventions

- Components in `src/lib/` as `.svelte` files, Tailwind utilities inline — no per-component CSS.
- Dark theme: `#242424` background, indigo accents, gray surfaces.
- `src/hand.css` uses `background: transparent` (not `#242424`) because the hand popover is an overlay inside OBR; opaque backgrounds would block the tabletop.
- UI text is in **French**.
- `dist/` and `public/cards/` are build artifacts (dist is gitignored).
