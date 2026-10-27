# Action types

37 action types, all validated and applied atomically by `applyAction` in `src/lib/deck.js`; both server functions use the same reducer through thin shims. Every action returns `{ state, log }` and is a **no-op when its prerequisites fail** — an invalid action never throws and never half-applies.

An action is `{ type, ...payload }`. The client dispatches it with `api.dispatch(roomId, action)`, which also attaches `actorId` and `actionId` (see [Conventions and gotchas](./conventions.md#write-path-guards)).

## Player and bootstrap (20)

| Action              | What it does                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `INIT_GAME`         | creates or reinitializes the room state; the GM-takeover path                                                     |
| `REGISTER_PLAYER`   | adds a player record (name, role); idempotent on the same id                                                      |
| `REGISTER_PARTY`    | registers the party members known to the GM                                                                       |
| `DRAW`              | draw a card into the hand — normal pool, or the specialized pool when a suit is requested; runs race draw effects |
| `DISCARD`           | discard from the hand or the crystallized zone; blocked below `spiritBounds` and on greyed cards                  |
| `CRYSTALLIZE`       | turn a hand card into a crystallized one; costs one Spirit Bound                                                  |
| `DRAW_FORCE`        | Force token: draw from the normal pool                                                                            |
| `USE_AGILITE`       | Agilité token: discard one card and draw a chosen suit                                                            |
| `USE_ESPRIT`        | Esprit token: +1 Spirit Bound (extra hand slot)                                                                   |
| `PROPOSE_EXCHANGE`  | Social token: offer a card to another player (token held in `pendingExchanges`)                                   |
| `ACCEPT_EXCHANGE`   | accept a pending exchange; the Aasimar heart goes to the sender                                                   |
| `DECLINE_EXCHANGE`  | decline a pending exchange; the proposer's token is refunded                                                      |
| `SPEND_TOKEN`       | spend a token on a combat upgrade (double strike, 3 targets, reverb, mark) and log it                             |
| `TOGGLE_GRAY`       | grey a card out so it cannot be discarded or spent                                                                |
| `DRAW_SPADE`        | Tieffelin's one free ♠ draw per game                                                                              |
| `HALFLING_CHOOSE`   | Halfling draw-2-keep-1: pick one of the two cards drawn                                                           |
| `SPORELIN_EXCHANGE` | Sporelin's free card exchange                                                                                     |
| `USE_CAPACITY`      | log-only: records a capacity use and its roll                                                                     |
| `GIVE_TOKEN`        | Hobgoblin (or GM): hand one of your own tokens to an ally, target cap enforced                                    |
| `DEVOUR_MIND`       | Illithid: +1 Esprit, with a 30-minute cooldown (`lastDevourAt`)                                                   |

## GM, or self-service (17)

`SET_INITIATIVE_URL` is strictly GM. `SET_RACE` and `SYNC_TOKENS` also accept a player acting on their own record — that is the path the character-sheet import uses to push a race and the token counts into game state without GM rights.

| Action               | What it does                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GIVE_CARDS`         | give a random count or exact cards, to the hand or the crystallized zone                                                                             |
| `DEAL_ALL`           | deal to everyone; skips players at cap, in an exchange, or with `pendingHalfling`                                                                    |
| `SWAP_CARD`          | replace one card of a player with another                                                                                                            |
| `ADD_TOKEN`          | add tokens to a player's pool                                                                                                                        |
| `SET_MAX_HAND`       | change a player's hand size                                                                                                                          |
| `SET_DRAW_RANGE`     | set the draw range (1–13, or A = 1)                                                                                                                  |
| `SET_MAX_TOKENS`     | change a player's token caps                                                                                                                         |
| `REST_ALL`           | full rest: every token back to its max                                                                                                               |
| `HARD_RESET`         | fresh state, keeping name and race; drops the actor tokens                                                                                           |
| `IMPORT_STATE`       | import a whole exported state JSON                                                                                                                   |
| `CREATE_GM_CHAR`     | create the GM character (`__gm_char__`)                                                                                                              |
| `REMOVE_GM_CHAR`     | remove the GM character                                                                                                                              |
| `SET_FATIGUE`        | set a player's fatigue level (0–4)                                                                                                                   |
| `SET_RACE`           | assign a race (validated against `RACE_IDS`); the GM for anyone, or a player for their own record (sheet import); grants the Humain token delta once |
| `CANCEL_EXCHANGE`    | cancel a pending exchange                                                                                                                            |
| `SYNC_TOKENS`        | the GM, or a player on their own record: set `tokens = maxTokens` to the values sent from the sheet (stat mod + 1)                                   |
| `SET_INITIATIVE_URL` | GM only: set the initiative-tracker URL that everyone sees                                                                                           |

## Why the split matters

The client sends every action through the same `api.dispatch`, so the server reducer is the only judge. Actions that touch another player are GM-only; `SET_RACE` and `SYNC_TOKENS` check `isSelf` (`action.playerId === action.targetId`) and accept either the GM or the player themselves. A new action is added in `deck.js` only — the Netlify and Supabase shims re-export the module.
