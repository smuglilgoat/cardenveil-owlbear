# File map

Where each behaviour lives. If a file is not here, it is either a leaf UI component or generated.

## Docs ladder

```
AGENTS.md            ← commands, architecture, conventions (the short cheat sheet)
CLAUDE.md            ← pointer to AGENTS.md
README.md
TESTING.md           ← testing guide
CARDENVEIL.md        ← game design, French (some formulas superseded)
docs/system-overview.md          ← full architecture map (this GitBook is its structure)
docs/Reglejetdattaque.md         ← damage-roll spec, implemented by attackRoll.js
docs/patch.md                    ← clarifications appended to that spec (cited by attackRoll.js)
docs/patch-notes/*.md            ← release notes per version
.agent/CONTINUITY.md             ← living decision log; read the top entries first
```

`docs/character-sheet-analysis.md` is **outdated** — the sheet schema's source of truth is `createEmptyCharacterSheet()`. `docs/archive/FIREBASE.md` is a migration proposal that was never executed.

## Build entries

```
index.html hand.html dice.html sheet.html background.html   ← 5 Vite entries (4 pages + background)
src/entries/{main,hand,sheetPopover,background,dice3d}.js
src/app.css src/hand.css src/sheetPopover.css               ← one Tailwind entry per page/shell
vite.config.js                                              ← inputs + generateCards() + dynamicManifest()
src/version.js                                              ← APP_VERSION, single source
scripts/generate-cards.js                                   ← sharp SVG→PNG card generator
```

## Logic

```
src/lib/deck.js                ← game reducer + cards + races + handCap
src/lib/characterSheet.js      ← sheet schema + CRUD + formulas + dice rolls
src/lib/api.js                 ← realtime + optimistic dispatch
src/lib/actionGuard.js         ← actor tokens + idempotency (server functions only)
src/lib/attackRoll.js          ← attack-dice engine per the rules doc
src/lib/diceRoll.js            ← 3D-dice helpers (mesh → roll mapping)
src/lib/rollBroadcast.js       ← OBR roll broadcast + local result channel
src/lib/handAnchor.js          ← hand popover anchor presets + remembered size, shared between frames
src/lib/sheetAssets.js         ← zip import → Supabase Storage images
src/lib/supabaseClient.js      ← Supabase client init (Realtime worker + heartbeat)
src/lib/appLog.js              ← technical logs → app_logs table
src/lib/diag.js                ← 🔍 Diag snapshots
src/lib/tooltip.js             ← Svelte tooltip action (0.5s hover)
```

## Components

```
src/lib/App.svelte             ← 3-tab root + identity provider
src/lib/CardGame.svelte        ← OBR bootstrapping + realtime wiring
src/lib/PlayerHand.svelte      ← player UI
src/lib/GMDashboard.svelte     ← GM UI
src/lib/CharacterSheet.svelte  ← full sheet + edit modal
src/lib/SheetPopover.svelte    ← compact sheet popover
src/lib/HandPopover.svelte     ← card-fan popover
src/lib/HandModal.svelte       ← in-frame modal (tokens, races, exchanges…)
src/lib/ActionDiamonds.svelte  ← per-turn ACTION / BONUS / RÉACTION toggles
src/lib/ActionLog.svelte       ← collapsible action log
src/lib/CardDisplay.svelte     ← reusable card face
src/lib/TokenPanel.svelte      ← token bar
src/lib/ItemAddPopup.svelte    ← catalogue picker with quantity step
```

## Server

```
netlify/functions/state.js                ← GET/POST fallback server
netlify/functions/_gameLogic.js           ← reducer shim
netlify/functions/_supabaseClient.js      ← client shim
supabase/functions/action/index.ts        ← primary write path (Deno Edge Function)
supabase/functions/action/_gameLogic.ts   ← shim
supabase/functions/action/_deck.js        ← symlink → src/lib/deck.js
supabase/migrations/20240101_create_character_sheets.sql
supabase/migrations/20260910_create_character_assets_bucket.sql
supabase/migrations/20261013_create_app_logs.sql
tests/unit/*                              ← 280 JEST unit tests (9 suites)
```

## Component map

`App.svelte` is a 3-tab layout with lazy-visited tabs:

1. **Cartes & Tokens** → `CardGame.svelte` (OBR identity bootstrapping, then `PlayerHand` for players / `GMDashboard` for the GM), which exposes state upward through `onGameChange` (gameState, myRole, myId, onAction).
2. **Character Sheet** → `CharacterSheet.svelte`.
3. **Initiative Tracker** → the GM sets a URL (game state `initiativeUrl`), an iframe embeds it for everyone.

| Component                                   | Role                                                                                                                                                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PlayerHand.svelte`                         | hand fan, tokens, incoming/outgoing exchanges, grey-out, race buttons (`DRAW_SPADE` for Tieffelin, `HALFLING_CHOOSE`, `SPORELIN_EXCHANGE`), crystallized zone                                                                      |
| `GMDashboard.svelte`                        | player panels (tokens +N, hand size, fatigue, draw range), give cards (random or specific), swap, race assignment, `DEAL_ALL` / `REST_ALL` / `HARD_RESET`, state import/export, action log, per-player "Fiche de personnage" modal |
| `CardGame.svelte`                           | OBR bootstrap: identity (player id/name/role), party, room id; registers self and the GM character; starts the realtime API; routes actions                                                                                        |
| `CharacterSheet.svelte`                     | the full sheet and the edit modal; opens the dice popup and the compact-sheet popover through `OBR.popover`                                                                                                                        |
| `SheetPopover.svelte`, `HandPopover.svelte` | self-contained popovers reading `?popoverId=` / `?playerId=`                                                                                                                                                                       |
| `ActionDiamonds.svelte`                     | per-turn toggles, shared by sheet and popover                                                                                                                                                                                      |
| `CardDisplay.svelte`                        | card face, handles `_pending` placeholders and grey-out                                                                                                                                                                            |
| `src/entries/dice3d.js`                     | physics roller: three.js scene, seeded Rapier sim, collider hulls, Web Audio clacks                                                                                                                                                |

Styling is Tailwind only, dark theme `#242424` with indigo accents; all UI text is French. Leaf components take state and an `onAction` callback as props — OBR calls stay in the components listed above.
