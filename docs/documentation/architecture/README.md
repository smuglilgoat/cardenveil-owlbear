# Architecture

How the plugin is put together: build entries, the authoritative game-state pipeline, the character-sheet system, and the transports that carry data between frames and clients. Read this section before changing behaviour — every mutation of game state has to go through the reducer described in [Game state pipeline](./game-state.md).

* [System overview](./system-overview.md) — entry points, build pipeline, rules mapped to code.
* [Game state pipeline](./game-state.md) — reducer, optimistic dispatch, Supabase round-trip.
* [Character sheets](./character-sheets.md) — storage, schema, derived formulas, dice flow.
* [Cross-frame transports](./transports.md) — which channel carries what.
