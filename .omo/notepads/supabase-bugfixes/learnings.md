# Supabase Realtime Bugfixes — Learnings

## Wave 1 — Realtime subscription error handling & auto-reconnect

### Problem
- `startRealtime()` called `.subscribe()` with **no callback** — the channel could
  drop silently and the user would never know.
- `stopRealtime()` did not clear any pending reconnect timer.
- No way for UI to reflect connection state.

### Fix (api.js)
- Added `(status, err) => { ... }` callback to `.subscribe()`.
- Status mapping:
  - `SUBSCRIBED` → mark healthy, reset attempt counter. If `wasReconnect`,
    call `fetchState(roomId)` to catch up on missed state.
  - `CHANNEL_ERROR` / `TIMED_OUT` → mark lost, schedule reconnect.
  - `CLOSED` → mark lost, schedule reconnect.
- Backoff: `1s, 2s, 4s, 8s, then capped at 30s`. Max 30 attempts, after which
  a `permanently_disconnected` event fires (cardinal stop, not infinite loop).
- `reconnectTimer` module-level, cleared in `stopRealtime()`.
- `isConnected()` exported — returns current subscription state.
- `connectionGeneration` counter guards against stale callbacks (e.g. error
  fires from an old channel after a new one was created).
- `currentRoomId` set to `null` in `stopRealtime()` so a pending reconnect
  timer bails out if the user unmounts.

### Fix (CardGame.svelte)
- Imported `isConnected` (for external monitoring / future use).
- New `$state` `connectionStatus` + `$effect` that shows toasts on transitions.
- `hadInitialConnection` flag suppresses the "reconnected" toast on the first
  SUBSCRIBED callback (no point telling the user it connected on mount).
- Three toast variants:
  - `disconnected` → `addToast('Connexion perdue — reconnexion en cours...', 'error')`
  - `connected` (after disconnect) → `addToast('Connexion rétablie', 'info')`
  - `permanently_disconnected` → `addToast('Connexion perdue — rafraîchissez la page.', 'error')`

### Signature change — backward compat preserved
- `startRealtime(roomId, onState)` still works (HandPopover.svelte unchanged).
- New third param `onConnectionChange` is optional.

### Pitfalls
- The `subscribe` callback is **async** — an error from an old channel can
  fire AFTER a new `startRealtime` call. The `connectionGeneration` counter
  solves this by letting stale callbacks bail early.
- `stopRealtime()` must be called BEFORE `currentRoomId` is reassigned in
  `startRealtime()`, otherwise the old channel's `scheduleReconnect` would
  re-create a new channel on top of the one we just made.
- Forgetting to clear `reconnectTimer` in `stopRealtime()` would cause the
  timer to fire after unmount, calling `startRealtime` on a destroyed
  component → silent memory leak.
- The `wasReconnect` check is `reconnectAttempt > 0` — `reconnectAttempt` is
  incremented inside `scheduleReconnect`, so a successful SUBSCRIBED on
  initial subscribe will see 0. A reconnect attempt's SUBSCRIBED will see ≥1.
- `fetchState` on reconnect uses the existing `If-None-Match` version header,
  so a 304 means we already have the latest and we don't overwrite state.
