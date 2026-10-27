# Cross-frame transports

Several channels carry data at once, each with one job. Mixing them up is the usual cause of "it updates for me but not for the others".

| Transport                                                            | What it carries                                                              | Where                                          |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------- |
| Supabase Realtime (`game_rooms` row)                                 | authoritative game state                                                     | `api.js`                                       |
| Supabase Realtime (`character_sheets` row)                           | cross-client sheet sync                                                      | `characterSheet.js`                            |
| `BroadcastChannel('cardenveil-sheet')`                               | same-origin frames: main sheet ↔ popover                                     | `characterSheet.js`                            |
| `BroadcastChannel('cardenveil-roll-result')`                         | roller's result → its own sheet frames                                       | `rollBroadcast.js`                             |
| `localStorage('cardenveil-card-scheme')`                             | card colour scheme (classic vs 4-suit), shared by every frame of the browser | `characterSheet.js`                            |
| `OBR.broadcast` (`cardenveil-prefs`, roll intent, `cardenveil-diag`) | room-wide broadcast, including dice intents and the GM diagnostic request    | `background.js`, `rollBroadcast.js`, `diag.js` |

## Choosing a channel

* **Game state** never travels over OBR. Writes go through `api.dispatch`, reads arrive on the Realtime row.
* **A sheet change** must reach the other frames of the same browser instantly — that is what the BroadcastChannel is for; the Realtime row covers other clients, and the compact popover's 1.5s poll covers the gaps.
* **A roll** must reach every client in the room, including people with no sheet open — that is an OBR broadcast, picked up by each client's persistent `background.html`.
* **A preference** that every frame should agree on (card colour scheme) lives in `localStorage`, with an OBR broadcast to refresh the other clients' frames.

## Popover plumbing

OBR popovers are **not draggable** and cannot be made click-through. Each popover therefore owns its footprint: it is opened with a provisional size, then calls `OBR.popover.setHeight` / `setWidth` as its bands fold and unfold, and recovers its own id from the `?popoverId=` query parameter. The hand popover measures its rendered bands (`fitPopover()`) and clamps to the viewport — see [Debug a live room](../operations/debug-live-room.md) for the diagnostic snapshots.
