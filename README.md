# Cardenveil — Owlbear Rodeo Plugin

[![Netlify Status](https://api.netlify.com/api/v1/badges/21cebd18-e9be-4c69-b522-2688b061cfa7/deploy-status)](https://app.netlify.com/projects/cardenveil/deploys)
[![CI](https://github.com/smuglilgoat/cardenveil-owlbear/actions/workflows/ci.yml/badge.svg)](https://github.com/smuglilgoat/cardenveil-owlbear/actions/workflows/ci.yml)

Digital support for the **Cardenveil** tabletop RPG inside [Owlbear Rodeo](https://www.owlbear.rodeo):
card hands, characteristic tokens, full character sheets, card exchanges and a GM
dashboard — all synchronized in real time across the table.

> **The plugin interface is in French.** The game rules (French) are in
> [CARDENVEIL.md](CARDENVEIL.md).

| | |
|---|---|
| **Install link** | `https://cardenveil.netlify.app/manifest.json` |
| **Version** | 2.7.18 — see [release notes](docs/patch-notes/) |
| **Requires** | Owlbear Rodeo 2 (extension manifest v1) |
| **Built with** | Svelte 5 · Vite 7 · Tailwind CSS 4 · Supabase |

---

## Install

Everyone at the table installs the extension; the GM initialises the game.

1. In your **Owlbear Rodeo profile**, click **Add Extension** and paste the
   install link above.
2. Create a room and enable **Cardenveil** in the create-room dialog — or, in an
   existing room, add it from the extension menu.
3. The GM opens the plugin panel and clicks **Initialiser la partie**. Players
   then join, pick a race and open their character sheet.

Each player can pop the card fan out over the tabletop (**Éventail**), and the
GM can open the same fan for the optional GM character from the dashboard.

---

## What it does

### For players

- **Card hand** — draw, discard and crystallize cards; hand size is per character
  (Spirit Slots, Haut-Elfe bonus), with a floating fan popover over the tabletop
- **Characteristic tokens** — Force, Agilité, Esprit and Social, each with a
  *Card* and a *Combat* usage
- **Race passives** — Haut-Elfe, Tieffelin, Aasimar, Halfling, Sporelin, Khajeet
  and Gobelin (including the Gobelin critical rule: a natural *die − 1* crits,
  with the explosion chain capped at 3 per basic attack)
- **Card exchanges** — propose a trade to an ally with a Social token; the
  recipient accepts or declines in place
- **Full character sheet** — 6 tabs (COMPÉTENCES, CAPACITÉS, INVENTAIRE,
  NARRATIF, MAÎTRISES, NOTES), equipment slots, weapons and inventory with
  rule-derived combat values, and an ÉDITION modal that can override them
- **Compact popover** — basic info, per-turn action diamonds and 📌 favorited
  skills/capacities, click-to-roll
- **Animated dice rolls** — capacities and skills roll through a 3D dice popup
  with crit/natural-1 flashes, and are written to the table's action log
- **Per-player card colours** — 4-suit schema or classic red/black

### For the GM

- **Dashboard** — every player's hand, tokens, fatigue and race, with all cards
  visible
- **Card control** — give or swap specific cards, set per-player draw ranges,
  hand size and token caps
- **GM character** — an optional extra character with its own hand, tokens,
  exchanges and popover
- **Character sheet oversight** — view and edit any player's sheet, import one
  from `.json`/`.zip`, transfer an item directly to an ally's sheet
- **Table tools** — import/export the whole game state as JSON, action log,
  initiative tracker URL, and a 🔍 diagnostics button for live-room debugging
- **Rest / reset** — restore every token, or hard-reset the room keeping races

---

## Running your own copy

The plugin is a static site built by Vite, plus Supabase for state and realtime.

### Prerequisites

- Node.js 20.19+ or 22.12+
- A [Supabase](https://supabase.com) project (Postgres + Realtime + Storage +
  Edge Functions)
- Any static host; the official build uses Netlify (the Netlify Function
  `/api/state` is the write fallback)

### Environment variables

| Where | Variable | Purpose |
|---|---|---|
| Client (Vite) | `VITE_SUPABASE_URL` | Supabase project URL |
| Client (Vite) | `VITE_SUPABASE_ANON_KEY` | anon key (public, RLS-protected) |
| Netlify Function | `SUPABASE_URL` | project URL |
| Netlify Function | `SUPABASE_SERVICE_ROLE_KEY` | service role key — **server-side only** |
| Edge Function `action` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | set from the Supabase dashboard |

### Database

Apply the migrations in [`supabase/migrations/`](supabase/migrations/):

- `20240101_create_character_sheets.sql` — character sheets (+ Realtime)
- `20260910_create_character_assets_bucket.sql` — public `character-assets` bucket
- `20261013_create_app_logs.sql` — technical log table (+ 30-day prune trigger)

> **Not in the repo:** the `game_rooms` table and the `apply_game_action()` RPC
> that provides atomic, version-checked writes. Their observed contract is
> documented in [docs/system-overview.md](docs/system-overview.md) §4 — recreate
> them in your project before running the plugin.

### Develop

```bash
npm install
npm run dev            # dev server, CORS-open to https://www.owlbear.rodeo
npm run build          # npm run check && vite build  → dist/
npm run preview        # serve the built output
```

To try it inside OBR, install your local manifest
(`http://localhost:5173/manifest.json`) as an extension exactly like the hosted
one, then open a room.

### Tests and gates

```bash
npm test               # 280 JEST unit tests (9 suites)
npm run test:unit      # unit tests only
npm run test:watch     # watch mode
npm run test:coverage  # coverage report
npm run check          # build gate: svelte-check, fails on undefined names/modules
npm run check:types    # full svelte-check report (pre-existing type noise)
```

`npm run check` exists because Rollup cannot see unbound identifiers — they look
like globals — and two `ReferenceError`s reached production that way. It fails
only on `Cannot find name/module/namespace`; the JS/JSDoc type-inference
baseline is reported as a count. CI runs `npm test` and `npm run build` on every
push and pull request.

### Deploy

1. Deploy the static build (Netlify: build `npm run build`, publish `dist`).
2. Redeploy the Supabase Edge Function `action` **whenever
   `src/lib/deck.js` or `src/lib/actionGuard.js` changes** — the game reducer and
   the write-path guards are the single source of truth and the Edge Function
   reaches them through symlinks (`supabase/functions/action/_deck.js`,
   `_actionGuard.js`), so a stale deploy silently rejects new actions.
3. If you are upgrading a room that already exists, **deploy the client before
   the Edge Function**: every frame then already sends its actor token when
   server-side verification turns on. Players who were in a room before this
   feature keep playing — their identity is claimed on their next write.
4. Bump the version in **one** place: [`src/version.js`](src/version.js)
   (`APP_VERSION`), which feeds `manifest.json` and the log rows. Mirror it in
   `package.json`.

---

## Project structure

```
index.html hand.html dice.html sheet.html background.html   # 5 Vite entries (public URLs — do not move)
src/
  entries/         # one boot script per entry: main, hand, sheetPopover, background, dice3d
  lib/             # all components and game modules
    deck.js        # THE game reducer: cards, races, tokens, 35 validated actions
    characterSheet.js  # sheet schema, CRUD, combat formulas, dice formulas
    api.js         # realtime subscriptions, optimistic dispatch, reconnect
    attackRoll.js  # attack dice engine (advantage, crits, Gobelin rule)
    appLog.js      # technical logs → Supabase app_logs
    diag.js        # live-room diagnostics (🔍 Diag)
    CardGame.svelte / GMDashboard.svelte / PlayerHand.svelte
    CharacterSheet.svelte / SheetPopover.svelte / HandPopover.svelte …
netlify/functions/         # POST write fallback (GET → 410) + reducer shim
supabase/functions/action/ # primary write path (Edge Function) + reducer shim
supabase/migrations/       # character sheets, storage bucket, app logs
tests/unit/                # JEST unit tests
scripts/                   # card PNG generator, svelte-check gate
```

The HTML files stay at the repository root because their built URLs
(`/hand.html`, `/dice.html`, `/sheet.html`) are baked into OBR popovers already
open in live rooms.

## Architecture in one screen

- **State lives in Supabase.** One `game_rooms` row per room: a JSONB state
  column plus a `version` for optimistic concurrency, written through the
  `apply_game_action()` RPC.
- **Server-authoritative writes.** The client dispatches to the Supabase Edge
  Function `action`; a Netlify Function (`POST /api/state`) is the fallback.
  Reads arrive over Supabase Realtime, with optimistic client-side replay:
  random draws show placeholder cards until the server confirms their identity.
- **One reducer.** `src/lib/deck.js` is the single source of truth for all 35
  action types; both server functions are thin re-export shims over it. Cards
  are dehydrated to ID strings before storage and rehydrated on read.
- **OBR is only used for identity** (`player.*`, party, viewport, popovers) and
  broadcast — never for game-state sync.
- **Every write is authenticated and de-duplicated.** The server mints a
  per-actor token on an identity's first write and stores only its hash; the
  client keeps the token in `localStorage` and sends an `actionId` with every
  action. A write is refused when the token does not match, and a replayed
  `actionId` is ignored instead of applied twice. Recovery from a lost token is
  a GM **HARD_RESET**. See AGENTS.md for the limits of this scheme.
- **Realtime resilience.** The socket's own heartbeat is kept on (`worker: false`
  — with a worker, realtime-js disables it, and the worker does not run inside
  OBR's sandboxed iframes) with a 10 s interval plus `heartbeatCallback`;
  backoff with a catch-up fetch after reconnects, and request timeouts so no
  network call can freeze the UI.
- **Popovers are not draggable** in OBR. The hand fan measures its own content
  and calls `setHeight`/`setWidth`; it folds into its bar instead of being moved.

## Documentation

| Document | What it covers |
|---|---|
| [AGENTS.md](AGENTS.md) | Maintainer guide: commands, architecture, conventions, gotchas |
| [docs/system-overview.md](docs/system-overview.md) | Full system mapping: rules → code, data model, transports |
| [docs/patch-notes/](docs/patch-notes/) | Release notes per version (+ a consolidated summary) |
| [CARDENVEIL.md](CARDENVEIL.md) | The game's rules (French) |
| [docs/Reglejetdattaque.md](docs/Reglejetdattaque.md) | Attack-roll rules (French) |
| [TESTING.md](TESTING.md) | Testing guide and the build gate |
| [docs/debug-live-room.md](docs/debug-live-room.md) | Live-room diagnostics workflow |
| [docs/design/](docs/design/) | Figma prototype transcriptions and UI proposals |
| [docs/archive/](docs/archive/) | Historical documents, superseded (e.g. the Firebase proposal) |

## Contributing

- Branch, then commit with [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `chore:`…). `main` is the deployed branch.
- `npm test` and `npm run check` must pass before a PR — CI enforces both.
- UI text is **French**; code, comments and docs are English.
- Game-state changes belong in `src/lib/deck.js` (never in a component), and
  anything player-visible gets a note in `docs/patch-notes/`.

## License

[MIT](LICENSE). The game rules in `CARDENVEIL.md` are the author's own work.
