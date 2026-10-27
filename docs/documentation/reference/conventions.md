# Conventions and gotchas

The house rules that bite when ignored. Each one has already caused a bug or a rejected pull request.

## Code

* **Svelte 5 runes** — `$state`, `$derived`, `$effect`, `$props()`. Never the legacy `$:` statement pattern, never `let`-assignment reactivity.
* **Tailwind utilities inline** — no per-component CSS. Dark theme `#242424` with indigo accents.
* `src/hand.css` and `src/sheetPopover.css` use `background: transparent`, because those popovers overlay the tabletop and an opaque background would block it. Each popover entry must `@import "tailwindcss"` or it renders unstyled.
* **JSDoc type-checking is on** through `jsconfig.json` (`checkJs: true`).
* Form inputs intentionally skip `<label>` elements — the accessibility warnings are accepted for this internal tool, everything is visually labelled.
* **UI text is French.**
* OBR is **only** for identity (`player.*`), party, viewport size, popovers and broadcast — never for game state. Do not scatter OBR calls deeper than the components that already own them (`CardGame`, `PlayerHand`, `HandPopover`, `GMDashboard`, `CharacterSheet`, `SheetPopover`).
* **Never duplicate game logic.** `src/lib/deck.js` is the only reducer; the Netlify and Supabase functions import it through shims.
* Old docs drift: `docs/character-sheet-analysis.md` is outdated, `docs/archive/FIREBASE.md` is a never-executed migration proposal, and `CARDENVEIL.md` predates some formula changes (Mouvement is 5 + Agi/2, not the 8 in the design doc). Cross-check `.agent/CONTINUITY.md` when a formula matters.
* Race and draw edge cases (Halfling, Tieffelin, Aasimar, Sporelin) have documented decisions in `.agent/CONTINUITY.md` — re-read it before touching those flows.
* The reducer's `logs` array is trimmed to the last 200 entries by `addLog`.

## Popovers

OBR popovers are **not draggable** and cannot be click-through (the SDK has no pointer-events option). Each one owns its footprint instead: it is opened with a provisional size, folds and unfolds in place through `OBR.popover.setHeight` / `setWidth`, and reads its own id from the `?popoverId=` URL parameter. Interactive prompts are in-frame modals (`HandModal.svelte`), not floating panels. Anchor and size presets for the hand popover live in `src/lib/handAnchor.js`, shared by the frame and the frame that opened it.

## Write-path guards

`src/lib/actionGuard.js` is imported by both server functions and never by the client bundle. It implements two guards, both stored inside the room state:

* **Actor tokens** — Owlbear cannot prove a player's id to the server, so the first accepted write for an identity mints a 256-bit token. The client keeps it in `localStorage` (`cardenveil-token:<roomId>:<actorId>`, shared by every frame of that browser) and echoes it on every action; only the hash is stored, in `actorTokens`, and broadcast. Up to `MAX_TOKEN_HASHES` (4) hashes are kept per actor, because two frames of the same browser can claim in the same tick and both tokens have to stay valid. A write is rejected (`401 { error: 'unauthorized', reason }`) only when the actor already has a hash and the token does not match (`missing_token` / `bad_token`). An unclaimed identity passes, so a stale frame no-ops instead of erroring.
* **Idempotency** — `actionId` (128-bit, generated per dispatch) is recorded in `lastActionIds`, a ring of `MAX_ACTION_IDS` (50) ids, so a retried action is a no-op. This is what makes the Netlify fallback safe after a lost Edge Function response.

Known limits, all accepted: the first claimant of an unclaimed identity owns it; an OBR GM can still reinitialise a room with `INIT_GAME` (deliberate GM-takeover path); a client that loses its token only re-claims after a GM `HARD_RESET`, which drops the player hashes (the GM running it gets a fresh token). An action older than the 50-id ring can be replayed — that window is deliberate.

**Deploy order matters**: ship the client (Netlify) _before_ redeploying the Edge Function, so every frame already sends a token when verification turns on.

## Logging

`src/lib/appLog.js` writes technical errors and lifecycle events to the Supabase `app_logs` table: per-frame `initLogging()`, global error handlers, dedupe and a per-session cap (a 30-day prune trigger lives in `supabase/migrations/20261013_create_app_logs.sql`). Read it with:

```sql
select * from app_logs order by created_at desc limit 100;
```

Never log game data or secrets — the in-game action log stays in `game_rooms.logs`.

## Realtime resilience

`supabaseClient.js` runs the Realtime client with `worker: true` and a `heartbeatCallback` (Supabase's documented fix for silent disconnections in backgrounded tabs) and exposes `onRealtimeHealth`. `api.js` keeps the reconnect backoff, runs a catch-up `fetchState` after any reconnect, aborts every network call (8–10s) and never gates the first paint on a fetch.
