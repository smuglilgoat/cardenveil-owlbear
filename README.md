# Cardenveil — Owlbear Rodeo Plugin

[![Netlify Status](https://api.netlify.com/api/v1/badges/21cebd18-e9be-4c69-b522-2688b061cfa7/deploy-status)](https://app.netlify.com/projects/cardenveil/deploys)

A plugin for [Owlbear Rodeo](https://www.owlbear.rodeo/) that provides full digital support for the Cardenveil tabletop RPG system — card management, token tracking, exchanges, and a GM dashboard, all synced in real time across all players in the room.

The full game rules are documented in [CARDENVEIL.md](CARDENVEIL.md) (in French).

---

## Tech Stack

| | |
|---|---|
| Framework | Svelte 5 (runes-style reactivity) |
| Build tool | Vite 7 |
| Styling | Tailwind CSS 4 |
| OBR integration | `@owlbear-rodeo/sdk` v3 |
| Backend | Supabase (PostgreSQL + Realtime + Edge Functions) |
| Deployment | Netlify |

## Getting Started

```bash
npm install
npm run dev      # Dev server (CORS-allowed from https://www.owlbear.rodeo)
npm run build    # Production build → dist/
npm run preview  # Preview built output locally
```

To test the plugin inside OBR, load it as an extension pointing at your local dev server URL.

## Project Structure

```
src/
  App.svelte              # Root — 3 tabs: cards/tokens, character sheet, initiative tracker
  main.js                 # Entry point
  HandPopover.svelte      # Floating card-fan popover (player + GM character)
  SheetPopover.svelte     # Compact character-sheet popover (basic info + favorited rolls)
  lib/
    CharacterSheet.svelte # Full character sheet (6 tabs) + edit modal
    ActionDiamonds.svelte # Per-turn ACTION/BONUS/RÉACTION diamond toggles
    GMDashboard.svelte    # Full GM control panel
    PlayerHand.svelte     # Player panel (hand, tokens, exchanges)
    ActionLog.svelte      # Collapsible action log
    CardDisplay.svelte    # Reusable card component
    deck.js               # Single-source game reducer + deck logic + hydration
    characterSheet.js     # Character sheet CRUD, dice rolling, combat formulas
    api.js                # Realtime subscriptions + optimistic action dispatch
    supabaseClient.js     # Supabase client initialization
  app.css                 # Global styles
tests/
  unit/                   # JEST unit tests (game logic, deck, API client, character sheet)
  httpie/                 # HTTPie test files for manual API testing
netlify/functions/        # Netlify fallback function + reducer shim
supabase/functions/action # Supabase Edge Function (primary dispatch) + reducer shim
public/                   # Static assets (incl. 104 generated card PNGs)
dist/                     # Build output (gitignored)
```

## Features

### Player
- **Card hand** — draw, discard, and crystallize cards; hand size enforced per character
- **Spirit Bounds** — spend Esprit tokens to add extra hand slots; crystallizing a card consumes one
- **Token actions** — each token (Force, Agilité, Esprit, Social) offers a **Card** or **Combat** usage when activated
- **Card exchanges** — initiate and accept trades with other players or the GM character via Social token
- **Gray-out** — mark cards as grayed; grayed cards are excluded from token interactions
- **Floating popover** — card fan rendered as an overlay at the bottom of the OBR viewport, foldable in place
- **Card colors** — per-player switch between the 4-suit color schema and classic red/black

### GM
- **Player management** — view and manage all players' hands, tokens, fatigue, races, and crystallized cards
- **Distribute cards** — give any card from the full deck directly to a player's hand or crystallized pile
- **Draw range control** — set per-player min/max drawable card values
- **GM character** — optional GM player character (`__gm_char__`) with its own hand, tokens, exchanges, and popover
- **Import / Export** — save and restore full game state as JSON
- **Action log** — GM sees all actions; players see only their own
- **Character sheet oversight** — GM can view and edit any player's character sheet via the "Fiche de personnage" button in each player's expanded panel

## Character Sheet System

Cardenveil includes a fully integrated character sheet system that stores character data in Supabase and synchronizes with game state in real time.

### Features

- **6-tab sheet**: COMPÉTENCES, CAPACITÉS, INVENTAIRE, NARRATIF, MAÎTRISES, NOTES — ÉDITION opens a large edit modal
- **Bidirectional sync**: Tokens and fatigue automatically sync between character sheet and game state
- **Dice rolling**: Click capacity/skill buttons to roll (e.g., "4d6", "2d8+3", "Mod Esprit D6") — animated popup over the tabletop, crit gold / natural-1 flashes
- **Per-turn action diamonds**: ACTION / BONUS ACTION / RÉACTION toggles on the sheet + compact popover
- **📌 Favorites**: pin skills/capacities; they become click-to-roll buttons in the compact popover
- **Compact popover** (`COMPACT` button): basic info + favorited rolls, folds/unfolds in place
- **Combat formulas**: parade, initiative, mouvement, volonté, seuil miss computed from gear/stats — never manual
- **GM oversight**: GM can view and edit any player's character sheet
- **Real-time updates**: Changes propagate instantly across all clients via Supabase real-time subscriptions
- **Import/Export**: Load character sheets from JSON files; export to backup or share

### For Players

1. Click the "Character Sheet" tab in the main panel
2. Toggle ÉDITION to open the edit modal, then Save to persist to Supabase
3. Click capacity/skill buttons to roll dice
4. Open COMPACT to dock the mini sheet (favorited rolls) beside the tabletop

### For GM

1. Open the GM Dashboard
2. Expand any player's panel
3. Click "Fiche de personnage" to view/edit their character sheet
4. Use "Réinitialiser" to reset a character sheet to defaults

### Storage

Character sheets are stored in Supabase as JSONB documents in the `character_sheets` table. Each sheet is uniquely identified by `room_id` + `player_id`.

The live schema source of truth is `createEmptyCharacterSheet()` in `src/lib/characterSheet.js` — `docs/character-sheet-analysis.md` is an outdated planning document.

## Architecture Notes

**State sync** — all game state lives in a Supabase `game_rooms` table (JSONB + a `version` counter for optimistic concurrency). Writes go through a server-authoritative Supabase Edge Function (`supabase/functions/action`) with the Netlify Function (`/api/state`) as fallback; reads arrive via Supabase Realtime WebSocket push, with optimistic client-side replay (random draws show pending placeholders until the server confirms).

**Single-source reducer** — the game reducer lives once in `src/lib/deck.js`; the Netlify and Supabase functions are thin re-export shims over it (the Supabase one via a symlink, since Supabase deploy bundling doesn't leave the function directory).

**Infinite decks** — draws use `drawNormal` / `drawSpecialized` from `deck.js` which generate cards on the fly rather than from a finite pile, so the deck never runs out.

**OBR SDK** is used only for identity (`player.*`), party info, viewport size, and popovers (dice popup, hand fan, compact sheet) — never for game-state sync. Popovers are not draggable; they fold/unfold via an in-page toggle.
