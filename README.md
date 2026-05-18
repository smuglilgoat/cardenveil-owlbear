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
  App.svelte            # Root — routes between GM and player views
  main.js               # Entry point
  HandPopover.svelte    # Floating card-fan popover (player view)
  lib/
    GMDashboard.svelte  # Full GM control panel
    PlayerHand.svelte   # Player panel (hand, tokens, exchanges)
    ActionLog.svelte    # Collapsible action log
    CardDisplay.svelte  # Reusable card component
    deck.js             # Deck logic, state hydration/dehydration
  app.css               # Global styles
public/                 # Static assets
dist/                   # Build output (gitignored)
```

## Features

### Player
- **Card hand** — draw, discard, and crystallize cards; hand size enforced per character
- **Spirit Bounds** — spend Esprit tokens to add extra hand slots; crystallizing a card consumes one
- **Token actions** — each token (Force, Agilité, Esprit, Social) offers a **Card** or **Combat** usage when activated
- **Card exchanges** — initiate and accept trades with other players or the GM character via Social token
- **Gray-out** — mark cards as grayed; grayed cards are excluded from token interactions
- **Floating popover** — card fan rendered as an overlay at the bottom of the OBR viewport

### GM
- **Player management** — view and manage all players' hands, tokens, and crystallized cards
- **Distribute cards** — give any card from the full deck directly to a player's hand or crystallized pile
- **Draw range control** — set per-player min/max drawable card values
- **Import / Export** — save and restore full game state as JSON
- **Action log** — GM sees all actions; players see only their own

## Architecture Notes

**State sync** — all game state lives in OBR room metadata under the key `com.cardenveil/gameState`. State is dehydrated (card objects → ID strings) before writing to stay within OBR's metadata size limits, and rehydrated on every read.

**Infinite decks** — draws use `drawNormal` / `drawSpecialized` from `deck.js` which generate cards on the fly rather than from a finite pile, so the deck never runs out.

**OBR SDK calls** are confined to `App.svelte`, `PlayerHand.svelte`, and `HandPopover.svelte` — UI components receive state and an `onUpdate` callback as props.
