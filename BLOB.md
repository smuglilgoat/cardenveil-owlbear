# BLOB.md - Server-Authoritative State Architecture

## Overview

Cardenveil now uses a **server-authoritative state architecture** with Netlify Functions and Netlify Blobs for persistent storage. This replaces the previous OBR room metadata system which suffered from desyncs due to last-write-wins conflicts.

## Architecture

```
┌─────────────────┐
│   Client App    │
│  (Svelte + OBR) │
└────────┬────────┘
         │
         │  POST /api/action
         │  { roomId, action }
         ▼
┌─────────────────────────────────┐
│   Netlify Function (state.js)   │
│                                 │
│  1. Read current state from     │
│     Netlify Blobs               │
│  2. Apply action atomically     │
│  3. Write new state + version   │
│  4. Return updated state        │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│      Netlify Blobs (KV)         │
│                                 │
│  Key: game:{roomId}             │
│  Value: { version, state }      │
│  Size: ~25-30 KB per room       │
└─────────────────────────────────┘
```

## Key Components

### 1. Netlify Function: `netlify/functions/state.js`

**Endpoints:**
- `GET /api/state?roomId=X` - Read current state (with ETag/304 support)
- `POST /api/action` - Apply action and return new state

**Request format for POST:**
```json
{
  "roomId": "abc123",
  "action": {
    "type": "DRAW",
    "playerId": "player-uuid"
  }
}
```

**Response format:**
```json
{
  "version": 42,
  "state": { /* dehydrated state */ }
}
```

### 2. Game Logic: `netlify/functions/_gameLogic.js`

Contains the **action reducer** that handles all 28 action types:

| Action Type | Description | Who Can Use |
|------------|-------------|-------------|
| `INIT_GAME` | Initialize new game | GM only |
| `REGISTER_PLAYER` | Player self-registration | Any |
| `REGISTER_PARTY` | Bulk register party members | GM only |
| `DRAW` | Draw from normal pile | Any (self) / GM |
| `DRAW_FORCE` | Spend Force token to draw | Any (self) |
| `DEAL` | GM deals N cards to player | GM only |
| `DEAL_ALL` | GM deals 1 card to all | GM only |
| `DISCARD` | Discard from hand/crystallized | Any/GM |
| `CRYSTALLIZE` | Move card to crystallized | Any (self) |
| `GIVE_CRYSTAL` | GM gives crystallized card | GM only |
| `USE_AGILITE` | Spend Agilité for specialized draw | Any (self) |
| `USE_ESPRIT` | Spend Esprit for +1 Spirit Bound | Any (self) |
| `PROPOSE_EXCHANGE` | Initiate card exchange | Any (self) |
| `ACCEPT_EXCHANGE` | Accept incoming exchange | Recipient |
| `DECLINE_EXCHANGE` | Decline incoming exchange | Recipient |
| `CANCEL_EXCHANGE` | Admin cancel exchange | GM only |
| `SPEND_TOKEN` | Spend token (combat usage) | Any/GM |
| `ADD_TOKEN` | Add token to player | GM only |
| `TOGGLE_GRAY` | Toggle card gray-out | Any (self) |
| `SWAP_CARD` | Replace card in player's hand | GM only |
| `SET_MAX_HAND` | Set max hand size | GM only |
| `SET_DRAW_RANGE` | Set min/max draw values | GM only |
| `SET_MAX_TOKENS` | Set max token counts | GM only |
| `REST_ALL` | Reset all tokens to max | GM only |
| `HARD_RESET` | Wipe game state | GM only |
| `IMPORT_STATE` | Import state from JSON | GM only |
| `CREATE_GM_CHAR` | Create GM character | GM only |
| `REMOVE_GM_CHAR` | Remove GM character | GM only |

**Validation:**
- All actions validate preconditions (hand full? enough tokens? correct player?)
- GM-only actions check `state.gmId === action.playerId`
- Invalid actions return state unchanged (no-op)

### 3. Client API: `src/lib/api.js`

**Functions:**
```javascript
// Start polling for state updates (1.5s interval)
startPolling(roomId, onStateCallback)

// Stop polling
stopPolling()

// Dispatch an action and get new state
const newState = await dispatch(roomId, { type: 'DRAW', playerId: myId })

// Fetch current state (used on mount)
const state = await fetchState(roomId)
```

**Optimizations:**
- Uses `If-None-Match` header with version number
- Server returns `304 Not Modified` if version matches
- Polling pauses during dispatch to avoid race conditions

### 4. State Storage

**Netlify Blobs:**
- Store name: `cardenveil-state`
- Key format: `game:{roomId}`
- Value format: `{ version: number, state: dehydratedState }`
- Size limit: 10 MB per blob (our state is ~25-30 KB)
- Total storage: 500 MB (free tier)

**Dehydration/Hydration:**
- Cards are stored as ID strings only (e.g., `"n-S-10-abc12"`)
- `dehydrateState()` converts card objects to ID strings
- `hydrateState()` reconstructs full card objects from IDs
- This keeps state size minimal

## Component Changes

### CardGame.svelte
- Removed: OBR metadata listener, `pushState()`
- Added: Polling via `startPolling()`, dispatch via `onAction()`
- Props passed to children: `onAction` (instead of `onUpdate`)

### PlayerHand.svelte
- Removed: All inline state mutations (`onUpdate({...gameState, ...})`)
- Added: `onAction({ type: 'ACTION', ...params })` calls
- Example: `drawCard()` now calls `onAction({ type: 'DRAW', playerId: myId })`

### GMDashboard.svelte
- Removed: All inline state mutations, `onSync` prop
- Added: `onAction()` calls for all GM actions
- Sync button removed (polling handles sync automatically)

### HandPopover.svelte
- Removed: OBR metadata listener, `pushState()`
- Added: Own polling loop via `startPolling()`
- All mutations use `onAction()` which calls `dispatch()`

## Data Flow

### Write Path (Player Action)
1. User clicks "Piocher" button
2. `PlayerHand.svelte` calls `onAction({ type: 'DRAW', playerId: myId })`
3. `CardGame.svelte` calls `dispatch(roomId, action)`
4. `api.js` sends `POST /api/action` to Netlify Function
5. `state.js` reads current state from Blobs
6. `applyAction()` validates and applies the action
7. New state is dehydrated and written to Blobs with incremented version
8. Response returns new state to client
9. Client updates `gameState` with hydrated state

### Read Path (Polling)
1. `api.js` polls every 1.5s via `GET /api/state?roomId=X`
2. Sends `If-None-Match: {version}` header
3. If version matches, server returns `304` (no data transfer)
4. If version differs, server returns new state
5. Client updates `gameState` with hydrated state

## Storage Limits

- **Netlify Blobs:** 500 MB total, 10 MB per blob
- **Our state:** ~25-30 KB worst case (200 log entries + 7 players + cards)
- **Capacity:** Thousands of concurrent games on free tier

## Migration Notes

### What Changed
- OBR SDK is now used **only** for identity (`player.getId()`, `player.getName()`, `player.getRole()`) and party info (`party.getPlayers()`, `party.onChange()`)
- OBR room metadata is **no longer used** for game state
- All state mutations go through the server

### What Stayed the Same
- Card generation logic (now server-side in `_gameLogic.js`)
- UI components and their visual structure
- Action state machines (card selection, suit picking) remain client-side
- French UI text

## Testing

### Local Development
```bash
# Start local dev server with Netlify Functions
netlify dev

# Or just the frontend
npm run dev
```

### Production
```bash
npm run build
netlify deploy --prod
```

## Troubleshooting

### Desyncs Still Occurring?
- Check that all components use `onAction()` instead of direct state mutations
- Verify polling is running (`startPolling()` called on mount)
- Check browser console for dispatch errors

### State Not Persisting?
- Verify Netlify Blobs store exists: `netlify blobs:list`
- Check function logs: `netlify functions:log state`
- Ensure `@netlify/blobs` is in `package.json` dependencies

### High Latency?
- Reduce polling interval in `api.js` (currently 1500ms)
- Consider adding WebSocket support for real-time updates

## Future Enhancements

1. **Real-time updates:** Replace polling with WebSocket/SSE for instant sync
2. **Optimistic updates:** Update UI immediately, rollback on server rejection
3. **Conflict resolution:** Add vector clocks for concurrent edits
4. **State compression:** Use binary encoding for cards instead of JSON
5. **Analytics:** Track action frequency, session duration
