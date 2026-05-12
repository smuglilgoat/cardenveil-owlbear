# Cardenveil — Owlbear Rodeo Plugin

## Project Overview

Cardenveil is an **Owlbear Rodeo (OBR) plugin** that supports the Cardenveil tabletop RPG system. It is built as a Svelte 5 + Vite app deployed on Netlify, embedded inside the OBR virtual tabletop via their extension SDK.

The full game rules are documented in [CARDENVEIL.md](CARDENVEIL.md) (in French).

## Tech Stack

- **Framework**: Svelte 5 (using runes-style reactivity)
- **Build tool**: Vite 7
- **Styling**: Tailwind CSS 4 (via `@tailwindcss/vite` plugin)
- **OBR integration**: `@owlbear-rodeo/sdk` v3
- **Deployment**: Netlify

### Dev commands

```bash
npm run dev      # Start local dev server (CORS allowed from https://www.owlbear.rodeo)
npm run build    # Build to dist/
npm run preview  # Preview built output
```

## OBR Integration Notes

- The Vite dev server is configured to allow CORS from `https://www.owlbear.rodeo` — this is required for OBR to load the plugin in development.
- The plugin runs as an OBR extension panel/embed. Use `@owlbear-rodeo/sdk` APIs for scene/room state, player data, etc.
- The plugin UI must work within OBR's iframe constraints.

## Game System Summary (Cardenveil)

The Cardenveil system uses three core mechanics:

### Dice
- **d20**: skill checks and initiative rolls
- **Other dice (d4–d12)**: weapon and ability damage
- **Advantage**: roll extra dice, keep the best (d20 → +1 die; others → +2 dice)
- **Criticals**: max die value; advantage dice can be used sequentially on re-rolls

### Cards
- Each player holds a hand of **3 cards** (2 base + 1 drawn per turn in combat)
- **Normal cards**: drawn and discarded throughout play
- **Crystallized cards**: special cards outside hand limit, immune to token/totem interactions
- Cards activate powers, interact with the Totem mechanic, and fuel narrative systems

### Tokens
- Linked to the four **characteristics** (Force, Agilité, Esprit, Social)
- Consumable resource, reset after rest
- Used to manipulate cards, modify attacks, and trigger special effects

### Characteristics (52 points, each 0–20)

| Stat | Key mechanics |
|---|---|
| **Force** | HP = 35 + 2×Force; draw extra cards; repeat attacks; armor capacity |
| **Agilité** | Movement = 5 + Agilité/2↑; Initiative = 2×mod; choose deck to draw from; curve attacks |
| **Esprit** | Known abilities = Esprit/2↑; extend hand; reverberate attacks; magic damage stat |
| **Social** | Exchange cards with allies; key for RP/social tests |

Modifier formula: `(value − 10) / 2` (rounded down for values < 10, normal for ≥ 10).

### Narrative Systems
- **Aspects**: background flavor tied to each characteristic (2 options per stat, pick 1); can grant bonuses (give a card to the GM → add its value to a roll) or penalties (draw crystallized card, GM creates a complication)
- **Bonds**: relational constraints between PCs; help/hinder balance must never differ by more than 1
- **Goals**: personal narrative objective; acting toward it rewards a random crystallized card
- **Flashbacks**: retroactively alter the story; cost 40–150 card value paid to the GM

## Project Structure

```
src/
  App.svelte       # Main application component
  main.js          # Entry point
  lib/             # Shared components
  app.css          # Global styles
public/            # Static assets
dist/              # Build output (gitignored)
```

## Conventions

- Components live in `src/lib/` as `.svelte` files
- Tailwind utility classes are used directly in components — no separate CSS files per component
- Keep OBR SDK calls isolated; don't scatter them throughout UI components
- The UI uses a dark theme (`#242424` background, indigo accents, gray surfaces)
