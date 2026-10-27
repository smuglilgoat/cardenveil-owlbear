# Game state pipeline

One reducer, one row per room, one write path. The client never owns the truth: it applies optimistically, then reconciles with what the server confirms.

## The pipeline

```
UI (PlayerHand / GMDashboard / …)
  └─ api.dispatch(roomId, action)
      ├─ 1. optimistic: applyAction(current, action) locally
      ├─ 2. replace random draws with makePendingCard() placeholders
      ├─ 3. supabase.functions.invoke('action', { roomId, action })
      │       └─ on error → POST /api/state (Netlify fallback)
      │           └─ optimistic concurrency via the apply_game_action RPC
      └─ 4. server writes the row with version+1 into game_rooms
              └─ Supabase Realtime PUSHES the new row to ALL clients
                  └─ api.js: hydrate → re-apply pending actions → push to UI
```

## Key files

* **`src/lib/deck.js`** — the single-source game reducer (`applyAction`), card factories (`drawNormal`, `drawSpecialized`, `makeCard`, `makePendingCard`), `handCap()`, `RACES`, and hydration (`hydrateState` / `dehydrateState`). Both server functions import it through thin shims (`netlify/functions/_gameLogic.js`, `supabase/functions/action/_gameLogic.ts` — the Supabase one re-exports `./_deck.js`, a symlink to `src/lib/deck.js`, because Supabase deploy bundling does not leave the function directory). **Never duplicate game logic elsewhere.**
* **`src/lib/api.js`** — the only client API for game state. It owns:
  * the Realtime channel (`game:{roomId}` on the `game_rooms` table);
  * version-gated updates (`currentVersion`; stale rows are ignored);
  * **optimistic replay**: server state plus re-applied pending actions, with random draws kept as `_pending` placeholder cards until the server confirms them (`markOptimisticDraws`, handled per action type, including the Halfling two-card choice and the Aasimar auto-heart);
  * reconnection with backoff (1s/2s/4s/8s, then 30s, 30 attempts, then a permanent disconnect reported through the connection callback) and a catch-up `fetchState` after a successful reconnect;
  * dispatch with 3 retries, then the Netlify `POST /api/state` fallback; a 409 conflict rebases onto the server state and replays.
* **`supabase/functions/action/index.ts`** — the Deno Edge Function, primary write path: read the row, apply the action, CAS-update through the `apply_game_action` RPC (`p_room_id`, `p_expected_version`, `p_new_version`, `p_state`) with a retry loop of 10 (exponential backoff, 409 on exhaustion).
* **`netlify/functions/state.js`** — the Netlify fallback: GET (ETag `If-None-Match` version → 304 on match) and POST (same reducer, same RPC retry loop). Used as fallback and for the initial catch-up fetch.
* **`src/lib/actionGuard.js`** — write-path guards imported by both server functions, never by the client bundle. See [Conventions and gotchas](../reference/conventions.md#write-path-guards).

## Data model

**`game_rooms`** holds one row per OBR room, keyed by `room_id`, with a JSONB state column (the dehydrated game state) and a `version INTEGER` used for optimistic concurrency. Its `CREATE TABLE` lives in the Supabase project, **not in this repository** — only the `character_sheets` and storage-bucket migrations are in `supabase/migrations/`. RLS is permissive (the same "Allow all operations" pattern as `character_sheets`), the table is in the Realtime publication, and clients filter with `room_id=eq.{roomId}`.

```js
{
  discard: [cardId…],
  pendingExchanges: [{ id, from, fromCard, to }],
  gmId,                // OBR player id of the GM
  gmCharacterId,       // GM_CHAR_ID ('__gm_char__') when the GM character is active
  players: {
    [id]: {
      name,
      hand: [],            // card objects on the client, id strings in storage
      crystallized: [],
      maxHandSize: 3, spiritBounds: 0,
      tokens: { force, agilite, esprit, social },
      maxTokens: { force, agilite, esprit, social },
      minDrawValue: 1, maxDrawValue: 13,   // GM-set draw range
      grayedCards: [],     // card ids the player declined to use for tokens
      fatigue: 0..4,
      race: null | <RACES id>,
      lastDevourAt: 0,               // Illithid cooldown, ms epoch
      tieflingDrawEligible: bool,    // one free ♠ draw per game
      pendingHalfling: null | [cardA, cardB]
    }
  },
  logs: [{ id, ts, playerId, playerName, msg }],  // trimmed to the last 200
  initiativeUrl: string | null,
}
```

Cards have two shapes:

* **Storage (dehydrated)** — just the id string, `{prefix}-{suitId}-{value}-{uid}`, e.g. `n-S-10-k3j2f1` (normal draw) or `s-H-Q-z8k1a` (specialized). The deck is infinite, so the card is reconstructable from its id and the JSONB row stays small.
* **Client (hydrated)** — `{ id, suit: '♠', value: '10', numericValue: 1..13, isRed }`, plus `_pending: true` for placeholders.

## The 37 action types

Every mutation goes through these. Each validates its own prerequisites and returns `{ state, log }`, or a no-op when invalid. The full table is in [Action types](../reference/action-types.md).

* **Player and bootstrap (20)** — `INIT_GAME`, `REGISTER_PLAYER`, `REGISTER_PARTY`, `DRAW`, `DISCARD`, `CRYSTALLIZE`, `DRAW_FORCE`, `USE_AGILITE`, `USE_ESPRIT`, `PROPOSE_EXCHANGE`, `ACCEPT_EXCHANGE`, `DECLINE_EXCHANGE`, `SPEND_TOKEN`, `TOGGLE_GRAY`, `DRAW_SPADE`, `HALFLING_CHOOSE`, `SPORELIN_EXCHANGE`, `USE_CAPACITY`, `GIVE_TOKEN`, `DEVOUR_MIND`.
* **GM, or self-service (17)** — `GIVE_CARDS`, `DEAL_ALL`, `SWAP_CARD`, `ADD_TOKEN`, `SET_MAX_HAND`, `SET_DRAW_RANGE`, `SET_MAX_TOKENS`, `REST_ALL`, `HARD_RESET`, `IMPORT_STATE`, `CREATE_GM_CHAR`, `REMOVE_GM_CHAR`, `SET_FATIGUE`, `SET_RACE`, `CANCEL_EXCHANGE`, `SYNC_TOKENS`, `SET_INITIATIVE_URL`. `SET_INITIATIVE_URL` is strictly GM; `SET_RACE` and `SYNC_TOKENS` accept either the GM or the player themselves (`isSelf`), which is how the sheet import syncs a race and the token counts.

## Reducer rules worth knowing

* Every token-consuming action also runs `maybeAasimarHeart()` — a free crystallized ♥ for Aasimar characters (on `ACCEPT_EXCHANGE` it goes to the **sender**). Not on `PROPOSE_EXCHANGE`, since the token may be refunded.
* `pendingHalfling` blocklists every other action for that player until they choose one of the two cards they drew.
* Greyed cards cannot be discarded or used for token actions.
* You cannot discard below your `spiritBounds`.
* `maxTokens` stays the base value; every cap check and refill goes through `maxTokensFor()`, so a Humain's +2 Social applies everywhere. `SET_RACE` grants the delta once.
* `SYNC_TOKENS` (self or GM) sets `tokens = maxTokens` to the values sent from the sheet (stat mod + 1), so the GM's `REST_ALL` restores stat-derived counts.
* `logs` is trimmed to the last 200 entries by `addLog`.

## Authoritative writes vs. OBR

Owlbear Rodeo is used only for identity (`player.*`), party info, viewport size, popovers and broadcast. It is never the transport for game state — Supabase is.
