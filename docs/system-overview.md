# Cardenveil — System Overview for AI models

> This document explains the **entire Cardenveil system** — the game rules, the
> plugin architecture, the data flow, and the conventions — in one file, written
> for another model or developer to get productive without reading every file.
> AGENTS.md is a short cheat-sheet; this is the full map.
>
> Sources of truth, in order of authority:
> 1. This doc (architecture) + AGENTS.md (commands/conventions)
> 2. `src/lib/deck.js` (game reducer), `src/lib/characterSheet.js` (sheet schema)
> 3. `CARDENVEIL.md` (game rules, French) + `docs/Reglejetdattaque.md` (attack dice)
> 4. `.agent/CONTINUITY.md` (living decision log — check the top entries first;
>    some CARDENVEIL.md formulas are superseded there, e.g. Mouvement = 5 + Agi/2)

---

## 1. What Cardenveil is

**Cardenveil** is a tabletop RPG system (design doc: `CARDENVEIL.md`, French) and
an **Owlbear Rodeo (OBR) plugin** (this repo) that implements it digitally:
card hands, tokens, GM tools, character sheets, and animated dice, all synced
in real time for everyone in the room.

The game system rests on three resources:

- **Dés** — randomness. d20 for skill tests/initiative; d4–d12 for weapons and
  capacities. Advantage: +2 dice on non-d20 rolls (+1 on d20), keep best
  (worst for désavantage); advantages/désavantages cancel first (patch §1).
- **Cartes** — the fuel. "Standard 52-card deck" mental/physical resources used
  to pay for capacities. Suits map to capacity domains: ♥ Cœurs = healing/buffs,
  ♦ Carreaux = raw damage, ♣ Trèfles = control, ♠ Piques = subtle magic/mobility.
- **Tokens** — one pool per stat (Force/Agilité/Esprit/Social), spent to
  manipulate draws or upgrade attacks (double strike, 3 targets, reverb, ally mark).

Key rule: **a capacity costs cards of a specific suit**: pay cards whose summed
value ≥ the capacity's cost, all matching the capacity's color. All cards can
also be played as a 1 of any suit, and crystallized cards play like normal
ones.

The app implements the *resource management* (cards/tokens/exchanges/logs) and
*roll assist* (dice, attack engine) — combat narration itself stays with the
GM. It does **not** model the battle grid, HP bars, or turn order mechanically:
those are managed by the GM (optionally via an embedded initiative-tracker URL).

### Key game rules mapped to code

| Rule | Code |
|---|---|
| Hand cap = maxHandSize + spiritBounds + racial | `handCap()` in `deck.js` |
| Crystallized cards exempt from hand cap | `crystallized` is a separate array, never capped |
| Spirit token buys an extra hand slot ("Spirit Bound") | `USE_ESPRIT` → `spiritBounds +1` |
| Crystallize costs one Spirit Bound | `CRYSTALLIZE` → `spiritBounds −1` |
| Force token: draw from normal pool (or repeat attack, logged as `SPEND_TOKEN`) | `DRAW_FORCE` / `SPEND_TOKEN` |
| Agilité token: discard 1 card, draw chosen suit (specialized pool) | `USE_AGILITE` |
| Esprit token: extend hand / crystallize; combat: Réverbération | `USE_ESPRIT` / `SPEND_TOKEN` |
| Social token: propose card exchange; refund on decline; combat: Marque | `PROPOSE/ACCEPT/DECLINE_EXCHANGE`, `SPEND_TOKEN` |
| Race (maison) draw effects | `RACES` + race branches in `DRAW`, `DRAW_SPADE`, `SPORELIN_EXCHANGE`, `HALFLING_CHOOSE` |
| Fatigue level −1/−2/−4/−6 penalty | `FATIGUE_PENALTY` in `deck.js` (die-penalty constant used by the UI; level is set by the GM) |
| GM deal / give / swap / rest / fatigue | `DEAL_ALL`, `GIVE_CARDS`, `SWAP_CARD`, `REST_ALL`, `SET_FATIGUE` |
| Init tracker URL on all screens | `SET_INITIATIVE_URL` + `App.svelte` tab 3 |
| Attack dice engine (one roll, kept die, crit explosions…) | `src/lib/attackRoll.js` per `docs/Reglejetdattaque.md` + `docs/patch.md` |
| Combat formulas (Parade, Initiative, Mouvement, Volonté, Seuil miss, Canalisation, Bonus attaque) | `computeDerived()` in `characterSheet.js` |
| Dice parse/roll "4d6", "2d8+3", "Mod Esprit D6", compounds | `parseDiceFormula` / `rollDice` / `parseDiceSpec` |
| Card cost check + capacity roll logging | sheet UI + `USE_CAPACITY` (log-only action) |

The GM makes the calls; the app supplies the numbers. Note: **the cost of a
capacity is reduced by (associated stat − 10)** — the sheet records the base
cost, but the stat-reduction and totem discounts are applied narratively in
play, not computed by the app.

---

## 2. Tech stack

Svelte 5 (runes — `$state`/`$derived`/`$effect`, never `let`-assignment
reactivity) via **Vite 7**, styling Tailwind 4 (`@tailwindcss/vite`, no
PostCSS) with inline utilities/no per-component CSS, **OBR SDK v3** for
identity/party/popovers/broadcast, **Supabase** (Postgres + Realtime + Edge
Functions + Storage) as authoritative backend, deployed on **Netlify**
(Netlify Function as reducer fallback). Dice physics: **three.js + Rapier**
(seeded). Tests: **Jest 30** (`svelte-jester`, jsdom, `NODE_OPTIONS=--experimental-vm-modules`).
JSDoc check-JS is on (`jsconfig.json`). UI language is **French**.

```bash
npm run dev        # Vite dev server, CORS open to https://www.owlbear.rodeo
npm run build      # pre-generates cards (sharp SVG→PNG) then Vite build
npm run preview
npm test / test:unit / test:watch / test:coverage
```

Server-side deps come through the Supabase Edge Function `@esm.sh` import of
`@supabase/supabase-js@2` (`Deno.serve`).

---

## 3. Entry points & build pipeline

`vite.config.js` builds **5 rollup inputs** (4 pages + the background script):

| HTML | Script/Component | Serves as |
|---|---|---|
| `index.html` | `src/main.js` → `App.svelte` | main plugin panel (opened via manifest `action.popover`) |
| `hand.html` | `src/hand.js` → `HandPopover.svelte` | floating card-fan popover (player + GM character) |
| `dice.html` | inline `<script type="module">` | animated dice-roll popup (three.js + Rapier physics, flat CSS fallback) |
| `sheet.html` | `src/sheetPopover.js` → `SheetPopover.svelte` | compact character-sheet popover |
| `background.html` | `src/background.js` | persistent per-client page that listens on OBR broadcast and opens the dice popover for every roll |

Two custom Vite plugins glue it together:

- **`generateCards()`** — runs `node scripts/generate-cards.js` before *every*
  build/dev start. **sharp** rasterizes 52 normal + 52 crystallized SVGs into
  `public/cards/*.png` (`{suitId}-{value}[-c].png`, e.g. `S-10.png` /
  `H-3-c.png`, 120×180). `public/cards/` is tracked in git and regenerated,
  so builds are deterministic.
- **`dynamicManifest()`** — serves `/manifest.json` in dev (middleware) and
  writes `dist/manifest.json` in build. The manifest (OBR plugin manifest,
  version 2.4.0) declares the panel popover (`/`), the icon, and — critically —
  `background_url: '/background.html'` (the persistent dice listener).

`dist/` is a build artifact (gitignored); `public/cards/` is generated but
**tracked in git** (regenerated on every build, stable PNG bytes).

---

## 4. Game-state architecture (source of truth pipeline)

```
UI (PlayerHand/GMDashboard/etc.)
  └─ api.dispatch(roomId, action)
      ├─ 1. optimistic: applyAction(current, action) locally
      ├─ 2. replace random draws with makePendingCard() placeholders
      ├─ 3. supabase.functions.invoke('action', { roomId, action })
      │       └─ on error → POST /api/state (Netlify fallback)
      │           └─ optimistic-concurrency via the `apply_game_action` RPC
      └─ 4. server writes row with version+1 into `game_rooms`
              └─ Supabase Realtime PUSHES new row to ALL clients
                  └─ api.js: hydrate → re-apply pending actions → push to UI
```

Key files:

- **`src/lib/deck.js`** — the **single-source game reducer** (`applyAction`),
  card factories (`drawNormal`, `drawSpecialized`, `makeCard`, `makePendingCard`),
  `handCap()`, races, and hydration (`hydrateState`/`dehydrateState`).
  Both server functions import it via thin shims
  (`netlify/functions/_gameLogic.js`, `supabase/functions/action/_gameLogic.ts`
  — the Supabase one re-exports `./_deck.js`, a **symlink to `src/lib/deck.js`,
  because Supabase deploy bundling does not leave the function dir).
  **Never duplicate game logic elsewhere.**
- **`src/lib/api.js`** — the only client API for the game state. Owns:
  - Realtime channel (`game:{roomId}` on `game_rooms` table)
  - version-gated state updates (`currentVersion`, ignore stale rows)
  - **optimistic replay**: server state + re-applied pending actions; random
    draws are `_pending` placeholder cards until the server confirms identity
    (`markOptimisticDraws` — handled per action type, incl. Halfling
    two-card choice and Aasimar auto-heart)
  - reconnect with backoff (1s/2s/4s/8s, then 30s, 30 attempts → permanent
    disconnect reported via the connection callback; catch-up `fetchState`
    after a successful reconnect)
  - dispatch with 3 retries → Netlify `POST /api/state` fallback; conflicts
    (409) rebase onto the server state and replay
- **`supabase/functions/action/index.ts`** — Deno Edge Function, the primary
  write path: reads the row, applies the action, then CAS-updates via the
  **`apply_game_action` RPC** (`p_room_id`, `p_expected_version`,
  `p_new_version`, `p_state`) with a retry loop of 10 (exponential backoff,
  409 on exhaustion).
- **`netlify/functions/state.js`** — Netlify fallback server: GET (ETag
  `If-None-Match` version → 304 on match) and POST (same reducer + same RPC
  retry loop). Used as fallback and for the initial catch-up fetch.

### Data model

- **`game_rooms`** table — **its CREATE TABLE lives in the Supabase project,
  not in this repo** (only `character_sheets` and the storage-bucket migration
  are in `supabase/migrations/`). Observed shape: one row per OBR room keyed
  by `room_id`, a JSONB state column holding the dehydrated game state, and a
  `version INTEGER` used for optimistic concurrency. RLS permissive (same
  "Allow all" pattern as `character_sheets` — see below); the Realtime
  publication carries it and clients filter by `room_id=eq.{roomId}`.

**GameState shape** (from `createInitialGameState` / `hydrateState`):

```js
{
  discard: [cardId…],
  pendingExchanges: [{ id, from (playerId), fromCard (card), to }],
  gmId,                // OBR player id of the GM
  gmCharacterId,       // GM_CHAR_ID ('__gm_char__') when GM char active
  players: {
    [id: string]: {
      name,
      hand: [],            // card objects (client) / id strings (storage)
      crystallized: [],
      maxHandSize: 3, spiritBounds: 0,
      tokens: {force, agilite, esprit, social},  // current
      maxTokens: {force, agilite, esprit, social},
      minDrawValue: 1, maxDrawValue: 13,  // GM-set draw range 1–13 (A=1 or 1–13)
      grayedCards: [],   // card ids the player declined to use for tokens
      fatigue: 0..4,
      race: null | 'haut-elfe' | 'tieffelin' | 'aasimar' | 'halfling' | 'sporelin',
      tieflingDrawEligible: bool,     // one free ♠ draw per game until a ♠
      pendingHalfling: null | [cardA, cardB]  // draw 2, pick 1
    }
  },
  logs: [{id, ts, playerId, playerName, msg}] // trimmed to last 200
  initiativeUrl: string | null,
}
```

Cards have two shapes:

- **Storage (dehydrated)**: just the `id` string,
  format `{prefix}-{suitId}-{value}-{uid}` e.g. `n-S-10-k3j2f1`
  (normal draw) or `s-H-Q-z8k1a` (specialized) — reconstructable since the
  deck is infinite → keeps the JSONB row tiny.
- **Client (hydrated)**: `{ id, suit: '♠', value: '10', numericValue: 1..13,
  isRed }` (+ `_pending: true` for placeholders).

### The 34 action types

Everything mutating game state must go through these; each validates its own
prerequisites and is a no-op-if-invalid `{ state, log }` return:

**Player + bootstrap**: `INIT_GAME`, `REGISTER_PLAYER`, `REGISTER_PARTY`,
`DRAW`, `DISCARD` (hand or crystallized), `CRYSTALLIZE`, `DRAW_FORCE`,
`USE_AGILITE`, `USE_ESPRIT`, `PROPOSE_EXCHANGE`, `ACCEPT_EXCHANGE`,
`DECLINE_EXCHANGE`, `SPEND_TOKEN`, `TOGGLE_GRAY`, `DRAW_SPADE` (Tieffelin
free draw), `HALFLING_CHOOSE`, `SPORELIN_EXCHANGE`, `USE_CAPACITY`
(log-only), `SET_INITIATIVE_URL` (GM sets, everyone sees).

**GM-only**: `GIVE_CARDS` (random count or exact cards, hand or crystallized),
`DEAL_ALL` (skips players at cap, in exchange, or Halfling-pending),
`SWAP_CARD`, `ADD_TOKEN`, `SET_MAX_HAND`, `SET_DRAW_RANGE`, `SET_MAX_TOKENS`,
`REST_ALL` (tokens = max), `HARD_RESET` (fresh state, keep name+race),
`IMPORT_STATE`, `CREATE_GM_CHAR`, `REMOVE_GM_CHAR`, `SET_FATIGUE`,
`SET_RACE`, `CANCEL_EXCHANGE`.

Rules baked into the reducer worth knowing:

- Every token-consuming action also runs `maybeAasimarHeart()` — a free
  crystallized ♥ for Aasimar characters (on ACCEPT_EXCHANGE it goes to the
  **sender**). Not on `PROPOSE_EXCHANGE` (the token may be refunded).
- `pendingHalfling` blocklists every other action for that player until they
  choose one of their two drawn cards.
- Greyed cards can't be discarded or used for token actions.
- You cannot go below your `spiritBounds` when discarding from hand.

---

## 5. Character sheet system

### Storage

- Table **`character_sheets`** (`20240101_create_character_sheets.sql`):
  `player_id TEXT`, `room_id TEXT`, unique `(player_id, room_id)`, denormalized
  `name/race/level`, `data JSONB` (entire sheet), `updated_at` trigger, RLS
  permissive, enabled in Realtime publication. No RLS user auth — "Allow all"
  is deliberate (OBR plugin context has no per-user auth).
- CRUD/live sync module: `src/lib/characterSheet.js`; per-player
  subscription (`subscribeToCharacterSheet`); save also posts to the
  same-origin **BroadcastChannel `cardenveil-sheet`** so cross-frame (main
  view → compact popover) updates are instant — Realtime alone is slow and
  BroadcastChannel was re-introduced deliberately (see CONTINUITY 2026-09-15).
  Compact popover additionally runs a 1.5s reconcile poll as fallback.
- Cross-storage **asset import**: `src/lib/sheetAssets.js` — import a `.zip`
  containing `<sheetId>.rpsheet.json` + `assets/<sheetId>/…` images (portrait,
  totem, capacities). All referenced images are uploaded to Storage bucket
  **`character-assets`** (public read, path `{roomId}/{playerId}/{fileName}`,
  upsert, `?v=`), the sheet image fields are rewritten to those URLs, then the
  regular JSON import runs. `importCharacterSheet` (max ~1 MB payload)
  **strips all `data:` base64 images** (they were bloating Supabase writes).

### Sheet shape (source of truth: `createEmptyCharacterSheet()`)

`identity` (nom/joueur/niveau/race/alignement/…+ diceColor), `portrait`,
`stats` (force/agilite/esprit/social), `progression` (xp), `derived`
(pv/…/bonusAttaque/seuilMiss/volonte + `overrides` for user-set values),
`defense` (parade/armure/deflexion/gardeBonus/bonus), `resources` (or/rations
/tokens), `skills` (16 `{trained, bonus}` mapped from stats via
`SKILL_TO_STAT`), `weapons[]`, `equipment` (7 slots: casque, plastron,
gantelets, bottes, anneau, amulette, cape), `inventoryItems` (with `type` Arme/Équipement/Consommable/Divers — legacy
`Armure` normalizes to Équipement; `slot` for gear; weapons carry
`equipped`/`hand` tags), `totem`,
`narrative` (+10 fields), `capacities[]` (each with `value.main` dice formula,
`cost.total`, `cost.color` suit name), `abilityControls`, `actions/reactions
/tokens` (freeform lists), `weaponMasteries` / `elementalMasteries`, `feats`,
`evolutions`, `notes`, `pinnedSkills` / `pinnedCapacities` (favorites),
`customRolls`, `actionChecks` (ACTION/BONUS/RÉACTION diamond toggles).

Derived melee combat formulas **computed, never manual** — `computeDerived()`
(overridable via `derived.overrides`):

```
parade      = Σ deflexion (equipped pieces) + garde (melee die/2, dual-wield sums) + mod (Agi; Force with shield; Force+Agi for épées droites)
initiative  = Agilité − 10 + gantelets.initiative
mouvement   = 5 + Agi/2 + bottes.vitesse        (was 8 before 2026-09-14)
volonté     = mod Résilience + casque.volonte
seuilMiss   = max(1, 1 − mod Agi)
canalisation= mod Esprit
bonusAttaque= attackBonus(main-hand weapon) = governing stat mod + weapon tier
paradeModifier picks its stat by keyword-matching the free-text weapon
properties (bouclier → force, épée droite/garde → force+agi, else agi)
```

Syncing happens whenever the sheet loads/saves via `syncStatsFromEquipment()`
+ `syncSkillBonuses()`; `handSlots()` resolves main/off weapons including
legacy sheets (equipped without a `hand` tag ⇒ main; two-handers occupy both).

**Weapon categories are keyword-matched** from free-text fields (`proprietes`
spelled either `proprietes`/`propriétés`; `attackRoll.js` reads both). Fallback
is conservative (ponytail note in characterSheet.js).

### Roll engine

- Dice formulas live in capacity `value.main` (`4d6`, `2d8+3`, `Mod Esprit D6`,
  `3 mod FORCE D8`), plus compounds `1d6+1d4`. `isDiceFormula` decides
  rollability; `parseDiceSpec` expands them for the roller.
- **`attackRoll.js`** is the engine implementing `docs/Reglejetdattaque.md`
  (+ `docs/patch.md`): one die rolled, one die kept; each advantage level adds
  2 dice keep-high, désavantage keep-low; they cancel before engagement
  applies; **crit** = kept die at max face → explosive chain re-roll (Finesse
  repeats weapon + engagement bonuses once per crit; Hache/Brutalité explodes
  2dX with doubles chaining; Finesse + Hache are mutually exclusive).
  Engagement adds désavantage levels plus its governing-stat mod to damage.
  Skill rolls are generic — components use `skillRollModifier()`.

### Dice rolling flow

A roll starts in `CharacterSheet.svelte` or `SheetPopover.svelte` (favorited
skills/capacities), or from the attack panel (`attackRoll.js`).

1. `broadcastRoll()` (OBR broadcast, destination ALL) sends the roll intent:
   in **3D mode** a seeded spec `{diceSpec, modifier, seed}` — each client's
   popup runs the same deterministic Rapier simulation, so everyone sees the
   same numbers; in **flat ("GM Classique") mode** pre-rolled `{rolls,
   diceTypes, total}`.
2. The persistent `background.html` page (manifest `background_url`) receives
   it and opens the `dice.html` popover on every client (roller bottom-left,
   others bottom-right; auto-closes 6 s; crit gold / natural-1 red flashes).
3. The roller's popup reports its result on a local BroadcastChannel
   (`cardenveil-roll-result` via `reportRollResult`) so its own sheet frames
   log it; only the roller logs the result.
4. On any simulation failure (or unsupported die side) the popup falls back
   to a static display of the pre-rolled/inline result.

---

## 6. Component map

`App.svelte` (root panel) — a 3-tab layout with lazy-visited tabs:
1. **`Cartes & Tokens`** → `CardGame.svelte` (OBR identity bootstrapping, then
   `PlayerHand` for players / `GMDashboard` for GM), exposes state upward via
   `onGameChange` (gameState, myRole, myId, onAction).
2. **`Character Sheet`** → `CharacterSheet.svelte` (tabs: COMPÉTENCES,
   CAPACITÉS, INVENTAIRE, NARRATIF, MAÎTRISES, NOTES; modal editor).
3. **`Initiative Tracker`** → GM sets URL (game state `initiativeUrl`), an
   iframe embeds it for everyone.

OBR popovers are **not draggable**: `hand.html` (card fan, per player +
`__gm_char__`, `?playerId=`), `sheet.html` (compact sheet), `dice.html`.
They fold/unfold via in-page toggles + `OBR.popover.setHeight`, and get their
`popoverId` back through the `?popoverId=` query param.

Important components:

- `PlayerHand.svelte` (834 l.) — player view: hand fan, tokens, exchanges
  incoming/outgoing, gray-out, race buttons (`DRAW_SPADE` for Tieffelin,
  `HALFLING_CHOOSE`, `SPORELIN_EXCHANGE`), crystallized zone.
- `GMDashboard.svelte` (1770 l.) — GM control: player panels (tokens +N, hand
  size, fatigue, draw range), give cards (random/specific), swap, race assign,
  `DEAL_ALL`/`REST_ALL`/`HARD_RESET`, import/export of state JSON, action log,
  per-player "Fiche de personnage" modal.
- `CardGame.svelte` — OBR bootstrap: identity (player id/name/role), party,
  room id; registers self + GM character; starts api realtime; routes actions.
- `CharacterSheet.svelte` (2396 l.) — the big sheet + edit modal; opens the
  dice popup and compact-sheet popover via `OBR.popover`; pins/action-diamonds
  and game-state token/fatigue syncs save **immediately** (via `$effect`);
  sheet edits save on ÉDITION Save. Bidirectional sheet ↔ game-state sync
  covers tokens and fatigue.
- `SheetPopover.svelte` (759 l.) / `HandPopover.svelte` (933 l.) — popovers
  (self-contained; read `?popoverId=`/`?playerId=` URL params and render).
- `ActionDiamonds.svelte` — per-turn ACTION/BONUS/RÉACTION toggles, shared by
  sheet and popover.
- `ActionLog.svelte` — collapsible log list from `state.logs`.
- `CardDisplay.svelte` — reusable card face (handles `_pending` placeholder
  cards and gray-out).
- `src/dice3d.js` (652 l.) — the physics dice roller used by the `dice.html`
  popup (three.js scene, seeded Rapier sim, collider hulls, Web Audio clacks).

Tailwind styling only, dark theme `#242424` bg / indigo accents. All UI text
French.

---

## 7. Cross-frame & cross-client transports (summary)

| Transport | What | Where |
|---|---|---|
| Supabase Realtime (`game_rooms` row) | authoritative game state | `api.js` |
| Supabase Realtime (`character_sheets` row) | cross-client sheet sync | `characterSheet.js` |
| `BroadcastChannel('cardenveil-sheet')` | same-origin frames (main sheet ↔ popover) | `characterSheet.js` |
| `BroadcastChannel('cardenveil-roll-result')` | roller's result → its sheet frames | `rollBroadcast.js` |
| `localStorage('cardenveil-card-scheme')` | card color scheme (classic vs 4-suit) | `characterSheet.js` |
| `OBR.broadcast` (`cardenveil-prefs`, roll intent) | OBR room-wide broadcast incl. dice intents | `background.js`, `rollBroadcast.js` |

---

## 8. Conventions & gotchas

- **Svelte 5 runes** (`$state`, `$derived`, `$effect`, `$props()`) — never the
  legacy `$: statement` pattern.
- Dark theme `#242424`, indigo accents; `src/hand.css` and
  `src/sheetPopover.css` use `background: transparent` because those popovers
  overlay the tabletop — an opaque background would block it. Each popover
  entry must `@import "tailwindcss"` or it renders unstyled.
- JSDoc type-checking is on via `jsconfig.json` (`checkJs: true`).
- **197 unit tests** (7 suites) cover the pure logic (`deck`,
  `characterSheet`, `api`, `attackRoll`, `diceRoll`, `gameLogic`,
  `sheetAssets`). Run `npm run test:unit`.
- Form inputs intentionally skip `<label>` elements (a11y warnings accepted —
  internal tool; everything is visually labeled).
- OBR is **only** for identity (`player.*`), party, viewport size, popovers,
  and broadcast — never for game-state sync. Don't scatter OBR calls deeper
  than the components that already own them.
- Popovers are not draggable; they fold/unfold in place via
  `OBR.popover.setHeight` with the `?popoverId=` param.
- UI text is French. Race/draw/passive edge cases (Halfling, Tieffelin,
  Aasimar, Sporelin) have documented decisions in `.agent/CONTINUITY.md` —
  re-read it before touching those flows.
- Old docs drift: `docs/character-sheet-analysis.md` is outdated,
  `FIREBASE.md` is a migration proposal (never executed), CARDENVEIL.md
  predates some formula changes — cross-check CONTINUITY.md when formulas
  matter (e.g. Mouvement is 5 + Agi/2, not the 8 in CARDENVEIL.md).
- The reducer's `logs` array is trimmed to the last 200 entries by `addLog`.

---

## 9. Map of important files

```
AGENTS.md CLAUDE.md README.md CARDENVEIL.md   ← docs ladder (FIREBASE.md = legacy proposal)
docs/Reglejetdattaque.md + docs/patch.md      ← attack dice spec (implemented by attackRoll.js)
docs/patch-notes-*.md                         ← release notes per version

index.html hand.html dice.html sheet.html background.html   ← 5 Vite entries (4 pages + background)
src/main.js src/hand.js src/sheetPopover.js src/background.js src/dice3d.js

src/lib/deck.js                ← game reducer + cards + races + handCap (863)
src/lib/characterSheet.js      ← sheet schema + CRUD + formulas + dice rolls (1479)
src/lib/api.js                 ← realtime + optimistic dispatch (415)
src/lib/attackRoll.js          ← attack-dice engine per rules doc (212)
src/lib/diceRoll.js            ← 3D-dice helpers (mesh→roll mapping, 47)
src/lib/rollBroadcast.js       ← OBR roll broadcast + local result channels (57)
src/lib/sheetAssets.js         ← zip import → Supabase Storage images (149)
src/lib/supabaseClient.js      ← Supabase client init (6)
src/lib/tooltip.js             ← Svelte tooltip action (0.5 s hover, 83)
src/lib/CardGame.svelte        ← OBR bootstrapping + realtime wiring (182)
src/lib/PlayerHand.svelte      ← player UI (834)
src/lib/GMDashboard.svelte     ← GM UI (1770)
src/lib/CharacterSheet.svelte  ← full sheet + edit modal (2396)
src/lib/ActionDiamonds.svelte  ← per-turn ACTION/BONUS/RÉACTION toggles
src/lib/ActionLog.svelte       ← collapsible action log
src/lib/CardDisplay.svelte     ← reusable card face
src/lib/TokenPanel.svelte      ← token bar
src/SheetPopover.svelte        ← compact sheet popover (759)
src/HandPopover.svelte         ← card-fan popover (933)
src/App.svelte                 ← 3-tab root + identity provider (168)

netlify/functions/state.js     ← GET/POST fallback server
netlify/functions/_gameLogic.js, _supabaseClient.js  ← reducer/client shims
supabase/functions/action/{index.ts, _gameLogic.ts, _deck.js(symlink→src/lib/deck.js)}
supabase/migrations/20240101_create_character_sheets.sql
supabase/migrations/20260910_create_character_assets_bucket.sql
tests/unit/*                   ← 197 JEST unit tests (7 suites)
scripts/generate-cards.js      ← sharp SVG→PNG card generator
```
