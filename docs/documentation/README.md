# Cardenveil

**Cardenveil** is a tabletop RPG system (design doc `CARDENVEIL.md`, French) and an **Owlbear Rodeo (OBR) plugin** — this repository — that runs it digitally: card hands, tokens, GM tools, character sheets and animated dice, synced in real time for everyone at the table.

The system rests on three resources:

* **Dés** — randomness. d20 for skill tests and initiative, d4–d12 for weapons and capacities. An advantage adds 2 dice (+1 on d20) and keeps the best, a disadvantage keeps the worst, and the two cancel before any dice are added.
* **Cartes** — the fuel. A "standard 52-card deck" mental and physical resource used to pay for capacities. Suits map to domains: ♥ Cœurs healing and buffs, ♦ Carreaux raw damage, ♣ Trèfles control, ♠ Piques subtle magic and mobility.
* **Tokens** — one pool per stat (Force, Agilité, Esprit, Social), spent to manipulate draws or upgrade attacks (double strike, three targets, reverb, ally mark).

A capacity costs cards of one suit: pay cards whose summed value is at least the cost, all matching the capacity's colour. Any card can also be played as a 1 of any suit, and crystallized cards play like normal ones. The cost is reduced by (associated stat − 10); the sheet stores the base cost and that reduction is applied narratively, not computed.

## What the app does, and does not do

It implements **resource management** (cards, tokens, exchanges, activity log) and **roll assist** (dice, attack engine). Combat narration stays with the GM. The app does not model the battle grid, HP bars or turn order — the GM runs those at the table, optionally with an initiative-tracker URL embedded in the panel for everyone.

## Tech stack

* **Svelte 5** with runes (`$state` / `$derived` / `$effect`; never the legacy `$:` assignment pattern), built by **Vite 7**.
* **Tailwind 4** through `@tailwindcss/vite` — inline utilities, no per-component CSS, no PostCSS config.
* **Owlbear Rodeo SDK** for identity (`player.*`), party, viewport size, popovers and broadcast — never for game state.
* **Supabase** (Postgres, Realtime, Edge Functions, Storage) as the authoritative backend, deployed on **Netlify** (a Netlify Function acts as reducer fallback).
* **three.js + Rapier** for the seeded 3D dice; **Jest 30** (`svelte-jester`, jsdom) for tests; JSDoc type-checking via `jsconfig.json` (`checkJs: true`).
* UI text is **French**.

## Reading order

| If you need to…                       | Read                                                                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| get the whole picture                 | [System overview](./architecture/system-overview.md)                                                                |
| change game state, actions or sync    | [Game state pipeline](./architecture/game-state.md), then [Action types](./reference/action-types.md) |
| touch the character sheet             | [Character sheets](./architecture/character-sheets.md)                                                              |
| find the file that owns a behaviour   | [File map](./reference/file-map.md)                                                                                 |
| follow the house rules before editing | [Conventions and gotchas](./reference/conventions.md)                                                               |
| work on races                         | [Race passives](./reference/race-passives.md)                                                                       |
| debug inside a live room              | [Debug a live room](./operations/debug-live-room.md)                                                                |
| build, check or commit                | [Contributing](./operations/contributing.md)                                                                        |

## Sources of truth, in order of authority

1. This documentation and `AGENTS.md`.
2. `src/lib/deck.js` (game reducer) and `src/lib/characterSheet.js` (sheet schema).
3. `CARDENVEIL.md` (game rules, French) and the [damage-roll rules](./game-rules/damage-rolls.md) (French).
4. `.agent/CONTINUITY.md` — the living decision log. Check the top entries first; some `CARDENVEIL.md` formulas are superseded there.
