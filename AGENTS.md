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
- **OBR SDK calls** are confined to `App.svelte`, `PlayerHand.svelte`, and `HandPopover.svelte`. Other components receive state + `onUpdate` callback as props — do not import OBR SDK in leaf components.
- **State sync**: all game state lives in OBR room metadata under key `com.cardenveil/gameState`. Cards are dehydrated (objects → ID strings) before writing and rehydrated on read to stay within OBR metadata size limits. Logic in `src/lib/deck.js`.

## Build-time codegen

`scripts/generate-cards.js` pre-generates 104 card PNGs (52 normal + 52 crystallized) into `public/cards/` using `sharp`. This runs **automatically** via a custom Vite plugin (`generateCards()` in `vite.config.js`) on every build start. A dynamic manifest plugin generates `manifest.json` for OBR with dev/prod naming.

## Conventions

- Components in `src/lib/` as `.svelte` files, Tailwind utilities inline — no per-component CSS.
- Dark theme: `#242424` background, indigo accents, gray surfaces.
- UI text is in **French**.
- `dist/` and `public/cards/` are build artifacts (dist is gitignored).
