import { hydrateState, applyAction, createInitialGameState, makePendingCard } from './deck.js';
import { supabase, onRealtimeHealth, onRealtimeGap, realtimeProblem } from './supabaseClient.js';
import { logEvent, logError } from './appLog.js';

let currentVersion = 0;
let realtimeChannel = null;
let onStateCallback = null;
let onConnectionCallback = null;
let reconnectTimer = null;
/** Backoff level (index into BACKOFF_STEPS_MS). Reset only once a connection
 *  proved healthy — see scheduleReconnect(). */
let reconnectAttempt = 0;
/** Failed recoveries since the last healthy connection: the budget behind
 *  permanently_disconnected. Cleared only by a connection that stayed up (see
 *  scheduleReconnect), never by the bare act of subscribing — a socket that
 *  dies right after joining proves nothing. */
let failedRecoveries = 0;
/** When the current subscription became live; 0 while not subscribed. */
let connectedAt = 0;
let isSubscribed = false;
let currentRoomId = null;
let permanentlyDisconnected = false;
let connectionGeneration = 0;
let healthUnsub = null;
let healthTimer = null;
let gapUnsub = null;
let visibilityWatched = false;
let hiddenSince = 0;

let lastServerState = null;
let pendingActions = [];

const BACKOFF_STEPS_MS = [1000, 2000, 4000, 8000];
const MAX_BACKOFF_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 30;
/** A connection that survives this long counts as recovered and resets the
 *  backoff; one that dies sooner is a failed recovery and keeps it growing. */
const HEALTHY_CONNECTION_MS = 60000;
/** A socket the environment closed after a working subscription (Owlbear's
 *  sandboxed iframes kill it every ~30 s) is a transient drop, not a sick
 *  server: reconnect at once instead of sitting out a 30 s backoff, during
 *  which the frame is simply disconnected. */
const CLOSE_RETRY_MS = 250;
/** Below this uptime a close says nothing about the environment — fall back to
 *  the escalating backoff so a server that refuses every join is not hammered. */
const QUICK_RETRY_MIN_UPTIME_MS = 5000;
/** Real-time heartbeat every 10 s (supabaseClient.js) — a gap beyond this many
 *  intervals means the frame's timers were frozen (hidden iframe). */
const HEARTBEAT_GAP_FACTOR = 3;
const HEARTBEAT_INTERVAL_MS = 10000;
const FETCH_TIMEOUT_MS = 8000;
const INVOKE_TIMEOUT_MS = 10000;
const HEALTH_CATCH_UP_MS = 2500;

export function isConnected() {
  return isSubscribed;
}

/**
 * Fetch the room state straight from Supabase REST — one PostgREST read instead
 * of a billable Netlify function invocation. Aborts after FETCH_TIMEOUT_MS so a
 * hung read can never freeze the UI.
 *
 * A missing room (or a null state) returns null rather than throwing: callers
 * read null as "no room yet" and the GM then dispatches INIT_GAME. Conflating
 * an error with "no room" would wipe a live game — so a failed read throws.
 */
export async function fetchState(roomId) {
  let read;
  try {
    read = await supabase
      .from('game_rooms')
      .select('version, state')
      .eq('room_id', roomId)
      .abortSignal(timeoutSignal(FETCH_TIMEOUT_MS))
      .maybeSingle();
  } catch (err) {
    throw readFailure(err);
  }
  if (read.error) {
    throw readFailure(read.error);
  }

  const row = read.data;
  // Same short-circuit the ETag/304 gave us: the version already matches, so
  // keep the cached object (identity matters to the caller) and the pending
  // optimistic actions instead of re-hydrating the same state.
  if (row && row.version === currentVersion && lastServerState) return lastServerState;
  if (row?.version != null) currentVersion = row.version;
  if (!row?.state) return null;
  const state = hydrateState(row.state);
  lastServerState = state;
  pendingActions = [];
  return state;
}

/**
 * The Netlify GET path is retired (410), so there is nothing left to fall back
 * to: calling it would spend an invocation to learn what we already know.
 * Log first, then throw — never null, which the caller reads as "no room".
 */
function readFailure(cause) {
  // Coarse, stable message: appLog dedupes on level|event|message, so the raw
  // error text would spend one log slot per distinct failure (MAX_PER_SESSION).
  logEvent('warn', 'fetch_state_failed', {
    message: cause?.code != null ? String(cause.code) : 'read_failed',
    detail: { error: cause?.message ?? String(cause) },
  });
  return new Error('State fetch failed');
}

function nextBackoffMs() {
  return reconnectAttempt < BACKOFF_STEPS_MS.length
    ? BACKOFF_STEPS_MS[reconnectAttempt]
    : MAX_BACKOFF_MS;
}

/** How long the current subscription has been live (0 when not subscribed). */
function connectionUptime() {
  return connectedAt ? Date.now() - connectedAt : 0;
}

/**
 * Schedule a re-subscription. `reason` is 'closed' when the channel reported
 * CLOSED (the socket died) and 'error'/'timeout' for CHANNEL_ERROR/TIMED_OUT
 * (server-side trouble).
 *
 * A socket that died after a working subscription is retried at once: Owlbear's
 * sandboxed iframes close it every ~30 s, and the old policy sat out a 30 s
 * backoff — climbing to its ceiling — so the app was disconnected half the time
 * for no reason. The escalating backoff is reserved for connections that never
 * got going, and only those count against the permanent-disconnect budget.
 */
function scheduleReconnect(reason = 'error') {
  if (reconnectTimer) return;
  if (!currentRoomId) return;
  const uptimeMs = connectionUptime();
  connectedAt = 0;
  // A connection that STAYED up proves the transport works; a bare subscribe
  // that dies at once proves nothing. This is what let the ~30 s disconnect
  // loop run for hours: every cycle reset the budget before it could trip.
  if (uptimeMs >= QUICK_RETRY_MIN_UPTIME_MS) failedRecoveries = 0;
  if (uptimeMs >= HEALTHY_CONNECTION_MS) reconnectAttempt = 0;
  const quick = reason === 'closed' && uptimeMs >= QUICK_RETRY_MIN_UPTIME_MS;
  if (!quick) {
    if (failedRecoveries >= MAX_RECONNECT_ATTEMPTS) {
      if (!permanentlyDisconnected) {
        permanentlyDisconnected = true;
        logEvent('error', 'realtime_permanently_disconnected', { detail: { attempts: failedRecoveries } });
        if (onConnectionCallback) onConnectionCallback('permanently_disconnected');
      }
      return;
    }
    failedRecoveries++;
  }
  const delay = quick ? CLOSE_RETRY_MS : nextBackoffMs();
  if (!quick) reconnectAttempt++;
  logEvent('warn', 'realtime_reconnect_scheduled', {
    detail: { delay, attempt: reconnectAttempt, failedRecoveries, reason, uptimeMs },
  });
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (currentRoomId && onStateCallback) {
      startRealtime(currentRoomId, onStateCallback, onConnectionCallback);
    }
  }, delay);
}

function replayPending(serverState) {
  if (pendingActions.length === 0) return serverState;
  let state = serverState;
  for (const action of pendingActions) {
    const prev = state;
    const result = applyAction(state, action);
    state = markOptimisticDraws(prev, result.state, action);
  }
  return state;
}

/** Token actions whose reducer may append a random card to the hand. */
const USE_AGILITE_LIKE = ['USE_AGILITE', 'USE_ESPRIT', 'SPEND_TOKEN'];

/**
 * Copy of the player with their last `count` hand cards replaced by pending
 * placeholders; null when there is nothing to mark.
 */
function pendingLast(player, count) {
  if (!player || count <= 0) return null;
  const hand = [...(player.hand ?? [])];
  const n = Math.min(count, hand.length);
  if (!n) return null;
  for (let i = hand.length - n; i < hand.length; i++) hand[i] = makePendingCard();
  return hand;
}

/**
 * Replace newly-added random cards with pending placeholders so the UI shows
 * blank cards until the server confirms the actual card identity.
 */
function markOptimisticDraws(prevState, optimisticState, action) {
  const { type } = action;

  if (type === 'DRAW' || type === 'DRAW_FORCE' || type === 'DRAW_SPADE') {
    const pid = action.playerId;
    const player = optimisticState.players[pid];

    // HALFLING: pendingHalfling appeared → mark both cards as pending
    if (player?.pendingHalfling && !prevState.players[pid]?.pendingHalfling) {
      const pending = player.pendingHalfling.map(() => makePendingCard());
      return {
        ...optimisticState,
        players: {
          ...optimisticState.players,
          [pid]: { ...player, pendingHalfling: pending },
        },
      };
    }

    const prevLen = prevState.players[pid]?.hand?.length ?? 0;
    const newHand = player?.hand ?? [];
    if (newHand.length > prevLen) {
      const added = newHand.length - prevLen;
      const hand = [
        ...newHand.slice(0, prevLen),
        ...Array.from({ length: added }, () => makePendingCard()),
      ];
      return {
        ...optimisticState,
        players: {
          ...optimisticState.players,
          [pid]: { ...player, hand },
        },
      };
    }
  }

  // Token actions also append cards: USE_AGILITE swaps one card for a random
  // draw, and the Aasimar's « Cœur supplémentaire » adds a random ♥ to the
  // HAND (issue #6 — it used to land in the crystallized zone). Every card the
  // action appended is unconfirmed, so it must show as a placeholder until the
  // server answers; otherwise the locally rolled card changes on every replay.
  if (USE_AGILITE_LIKE.includes(type)) {
    const pid = action.playerId;
    const player = optimisticState.players[pid];
    const prevLen = prevState.players[pid]?.hand?.length ?? 0;
    const newLen = player?.hand?.length ?? 0;
    // USE_AGILITE removed a card AND added one: the replacement is new even
    // when the hand did not grow.
    const added = (type === 'USE_AGILITE' ? 1 : 0) + Math.max(0, newLen - prevLen);
    const hand = pendingLast(player, added);
    if (hand) {
      return {
        ...optimisticState,
        players: { ...optimisticState.players, [pid]: { ...player, hand } },
      };
    }
  }

  // ACCEPT_EXCHANGE: the sender gets the exchanged card back (a known card)
  // plus, for an Aasimar, the random ♥ — only the tail is unconfirmed.
  if (type === 'ACCEPT_EXCHANGE') {
    const ex = (prevState.pendingExchanges ?? []).find(e => e.id === action.exchangeId);
    if (ex) {
      const senderId = ex.from;
      const sender = optimisticState.players[senderId];
      const prevLen = prevState.players[senderId]?.hand?.length ?? 0;
      const newLen = sender?.hand?.length ?? 0;
      const hand = pendingLast(sender, Math.max(0, newLen - prevLen - 1));
      if (hand) {
        return {
          ...optimisticState,
          players: { ...optimisticState.players, [senderId]: { ...sender, hand } },
        };
      }
    }
  }

  if (type === 'GIVE_CARDS') {
    const tid = action.targetId;
    const dest = action.crystal ? 'crystallized' : 'hand';
    const prevLen = prevState.players[tid]?.[dest]?.length ?? 0;
    const newArr = optimisticState.players[tid]?.[dest] ?? [];
    if (newArr.length > prevLen) {
      const added = newArr.length - prevLen;
      const arr = [
        ...newArr.slice(0, prevLen),
        ...Array.from({ length: added }, () => makePendingCard()),
      ];
      return {
        ...optimisticState,
        players: {
          ...optimisticState.players,
          [tid]: { ...optimisticState.players[tid], [dest]: arr },
        },
      };
    }
  }

  if (type === 'DEAL_ALL') {
    let players = { ...optimisticState.players };
    for (const [id, pl] of Object.entries(prevState.players)) {
      if (id === action.playerId) continue;
      const prevLen = pl.hand?.length ?? 0;
      const newHand = players[id]?.hand ?? [];
      const newPending = players[id]?.pendingHalfling;

      // Halfling: pendingHalfling appeared → mark both cards as pending
      if (newPending && !pl.pendingHalfling) {
        players[id] = {
          ...players[id],
          pendingHalfling: newPending.map(() => makePendingCard()),
        };
        continue;
      }

      // Non-Halfling: normal draw placeholder
      if (newHand.length > prevLen) {
        const added = newHand.length - prevLen;
        players[id] = {
          ...players[id],
          hand: [
            ...newHand.slice(0, prevLen),
            ...Array.from({ length: added }, () => makePendingCard()),
          ],
        };
      }
    }
    return { ...optimisticState, players };
  }

  return optimisticState;
}

/**
 * Tear down the channel and timers. `keepCounters` preserves the reconnect
 * attempt count + optimistic state, so a retry driven by scheduleReconnect()
 * keeps its backoff and pending actions (startRealtime used to reset them).
 */
function teardownRealtime(keepCounters = false) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  isSubscribed = false;
  connectedAt = 0;
  connectionGeneration++;
  if (!keepCounters) {
    currentRoomId = null;
    reconnectAttempt = 0;
    failedRecoveries = 0;
    permanentlyDisconnected = false;
    lastServerState = null;
    pendingActions = [];
    // A stopped frame must not claim to know a version: a stale one would make
    // the next read short-circuit and drop realtime rows.
    currentVersion = 0;
  }
}

function clearHealthTimer() {
  if (healthTimer) {
    clearTimeout(healthTimer);
    healthTimer = null;
  }
}

/** Realtime transport problems (heartbeat error/timeout/disconnected) do not
 *  fire a channel status event: resync from the server a moment later. */
function watchRealtimeHealth() {
  if (!healthUnsub) {
    healthUnsub = onRealtimeHealth((status) => {
      if (!currentRoomId) return;
      // appLog dedupes on level|event|message and caps the session: one row per
      // status per 30 s, never one per heartbeat.
      logEvent('warn', 'realtime_heartbeat_problem', {
        message: status,
        detail: { subscribed: isSubscribed, uptimeMs: connectionUptime() },
      });
      if (onConnectionCallback) onConnectionCallback('disconnected');
      clearHealthTimer();
      healthTimer = setTimeout(() => {
        healthTimer = null;
        // A backoff is already waiting to reconnect. Reconnecting now would
        // cancel it (startRealtime tears the timer down) and pin the delay near
        // 1 s in exactly the sick-socket case the backoff exists for; the
        // scheduled reconnect also re-reads the state on SUBSCRIBED.
        if (reconnectTimer) return;
        recoverConnection();
      }, HEALTH_CATCH_UP_MS);
    });
  }
  if (!gapUnsub) {
    // Diagnostic only: a heartbeat gap means this frame's timers stopped
    // running for a while (hidden iframe), which is what makes the socket go
    // idle on the server and get closed. Recorded so the next report is
    // explainable; recovery stays with the health watchdog above.
    gapUnsub = onRealtimeGap((gapMs) => {
      logEvent('warn', 'realtime_heartbeat_gap', {
        detail: {
          gapMs,
          subscribed: isSubscribed,
          visibility: typeof document !== 'undefined' ? document.visibilityState : '',
        },
      });
    });
  }
}

/** Log when this frame comes back from hidden, with how long it was hidden. */
function watchVisibility() {
  if (visibilityWatched || typeof document === 'undefined') return;
  visibilityWatched = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenSince = Date.now();
      return;
    }
    logEvent('info', 'realtime_visibility', {
      detail: {
        visibility: 'visible',
        hiddenMs: hiddenSince ? Date.now() - hiddenSince : 0,
        subscribed: isSubscribed,
      },
    });
    hiddenSince = 0;
  });
}

/**
 * Re-subscribe + resync after a silent drop (also used on tab refocus).
 * Safe to call at any time: a no-op when the room was never started.
 *
 * User-initiated calls (visibilitychange, online) are expected to force an
 * immediate re-subscribe: that cancels a pending backoff timer, but keeps both
 * the backoff level and the recovery budget, so a failing socket still escalates.
 * The heartbeat watchdog must not use this while a backoff is pending — see
 * watchRealtimeHealth().
 */
export function recoverConnection() {
  if (!currentRoomId || !onStateCallback) return;
  logEvent('info', 'connection_recover', {
    detail: { problem: realtimeProblem(), subscribed: isSubscribed },
  });
  if (!isSubscribed) {
    startRealtime(currentRoomId, onStateCallback, onConnectionCallback);
    return;
  }
  const gen = connectionGeneration;
  return fetchState(currentRoomId)
    .then((state) => {
      if (gen !== connectionGeneration) return;
      if (state && onStateCallback) onStateCallback(replayPending(state));
      if (onConnectionCallback) onConnectionCallback('connected');
    })
    .catch((err) => {
      logError('connection_recover_failed', err);
    });
}

export function stopRealtime() {
  clearHealthTimer();
  teardownRealtime(false);
}

export function startRealtime(roomId, onState, onConnectionChange) {
  onStateCallback = onState;
  onConnectionCallback = onConnectionChange || null;
  teardownRealtime(true);

  currentRoomId = roomId;
  permanentlyDisconnected = false;
  const myGen = ++connectionGeneration;
  watchRealtimeHealth();
  watchVisibility();

  realtimeChannel = supabase
    .channel(`game:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'game_rooms',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        const newRow = payload.new;
        if (!newRow) return;
        if (newRow.version <= currentVersion) return;
        currentVersion = newRow.version;
        const serverState = hydrateState(newRow.state);
        lastServerState = serverState;
        pendingActions = pendingActions.filter(a => a._confirmedVersion == null || a._confirmedVersion > currentVersion);
        const displayState = replayPending(serverState);
        if (onStateCallback) {
          onStateCallback(displayState);
        }
      }
    )
    .subscribe((status, err) => {
      if (myGen !== connectionGeneration) return;

      if (status === 'SUBSCRIBED') {
        // A subscribe that followed a scheduled reconnect: read the row we may
        // have missed while the socket was down.
        const wasReconnect = reconnectAttempt > 0;
        logEvent('info', wasReconnect ? 'realtime_reconnected' : 'realtime_subscribed', {
          detail: { attempt: reconnectAttempt },
        });
        isSubscribed = true;
        // The backoff level is NOT reset here: it is cleared only once this
        // connection has proven itself (see scheduleReconnect). Same for the
        // recovery budget — a subscribe that dies 30 s later is not a recovery.
        connectedAt = Date.now();
        permanentlyDisconnected = false;
        if (onConnectionCallback) onConnectionCallback('connected');
        if (wasReconnect) {
          const catchUpGen = myGen;
          // This read is the only way to recover a row written while the socket
          // was down: postgres_changes does not replay missed rows.
          fetchState(roomId)
            .then((state) => {
              if (catchUpGen !== connectionGeneration) return;
              if (state && onStateCallback) onStateCallback(replayPending(state));
            })
            .catch((e) => logError('realtime_catchup_failed', e));
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        logEvent('warn', 'realtime_channel_error', {
          message: status,
          detail: { error: err?.message, uptimeMs: connectionUptime() },
        });
        isSubscribed = false;
        if (onConnectionCallback) onConnectionCallback('disconnected');
        scheduleReconnect('error');
      } else if (status === 'CLOSED') {
        logEvent('warn', 'realtime_channel_closed', { detail: { uptimeMs: connectionUptime() } });
        isSubscribed = false;
        if (onConnectionCallback) onConnectionCallback('disconnected');
        scheduleReconnect('closed');
      }
    });
}

/** AbortSignal.timeout when available, AbortController otherwise (jsdom). */
function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

const MAX_CLIENT_RETRIES = 3;

// ─── Actor tokens ───────────────────────────────────────────────────────
// The server mints a token on a player's first accepted write and returns it
// once; every later write must echo it. Shared through localStorage so the
// main panel, the hand fan and the compact sheet all present the same token.
const TOKEN_PREFIX = 'cardenveil-token';

function tokenKey(roomId, actorId) {
  return `${TOKEN_PREFIX}:${roomId}:${actorId}`;
}

function getActorToken(roomId, actorId) {
  try {
    return localStorage.getItem(tokenKey(roomId, actorId));
  } catch {
    return null;
  }
}

function setActorToken(roomId, actorId, token) {
  try {
    localStorage.setItem(tokenKey(roomId, actorId), token);
  } catch {
    /* private mode / storage disabled: the next write simply re-claims */
  }
}

/** 128-bit id used by the server to ignore a retried action. */
function newActionId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Mark a dispatched action as confirmed. If Realtime already delivered that
 * version, drop the optimistic entry and re-render: replaying it on top of a
 * state that already contains it would show the action twice (an extra card).
 */
function confirmPending(pendingEntry, version) {
  pendingEntry._confirmedVersion = version;
  if (version > currentVersion) return;
  pendingActions = pendingActions.filter(a => a !== pendingEntry);
  if (lastServerState && onStateCallback) onStateCallback(replayPending(lastServerState));
}

export async function dispatch(roomId, action) {
  const currentState = lastServerState
    ? replayPending(lastServerState)
    : (await fetchState(roomId)) ?? createInitialGameState();

  const actorId = action.actorId ?? action.playerId;
  const token = actorId ? getActorToken(roomId, actorId) : null;
  const wireAction = {
    ...action,
    actorId,
    actionId: newActionId(),
    ...(token ? { token } : {}),
  };

  const { state: rawOptimistic } = applyAction(currentState, action);
  const optimisticState = markOptimisticDraws(currentState, rawOptimistic, action);
  if (onStateCallback) {
    onStateCallback(optimisticState);
  }

  const pendingEntry = { ...wireAction, _dispatchTime: Date.now() };
  pendingActions.push(pendingEntry);

  /** Persist a first-claim token so the next write is accepted. */
  function acceptToken(data) {
    if (data?.token) setActorToken(roomId, actorId, data.token);
  }

  (async () => {
    let lastError;
    let useFallback = false;

    for (let attempt = 0; attempt < MAX_CLIENT_RETRIES; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke('action', {
          body: { roomId, action: wireAction },
          timeout: INVOKE_TIMEOUT_MS,
        });

        if (error) {
          lastError = error;
          useFallback = true;
          break;
        }

        if (data?.version != null) {
          acceptToken(data);
          confirmPending(pendingEntry, data.version);
          return;
        }

        if (data?.error) {
          lastError = new Error(data.error);
        }
      } catch (e) {
        lastError = e;
        useFallback = true;
        break;
      }
    }

    if (useFallback) {
      // Coarse, stable message (appLog dedupes on level|event|message); the raw
      // error text varies per failure and would spend one log slot each time.
      // Edge Function errors carry no `.code` — their `.name` is the class that
      // discriminates them (FunctionsHttpError / RelayError / FetchError).
      logEvent('warn', 'dispatch_fallback_netlify', {
        message: String(lastError?.code ?? lastError?.name ?? 'edge_function_failed'),
        detail: { action: action?.type, error: lastError?.message ?? String(lastError) },
      });
      for (let attempt = 0; attempt < MAX_CLIENT_RETRIES; attempt++) {
        try {
          const res = await fetch('/api/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId, action: wireAction }),
            signal: timeoutSignal(FETCH_TIMEOUT_MS),
          });

          if (res.ok) {
            const data = await res.json();
            acceptToken(data);
            confirmPending(pendingEntry, data.version);
            return;
          }

          if (res.status === 401) {
            // The actor could not prove its id (a stale token, or a client
            // that lost localStorage). Retrying cannot help: the GM resets the
            // room's records to let the client claim a fresh token.
            const data = await res.json().catch(() => ({}));
            logEvent('error', 'action_unauthorized', {
              detail: { action: action?.type, roomId, reason: data?.reason },
            });
            lastError = new Error('Action refusée : identité du joueur non reconnue');
            break;
          }

          if (res.status === 409) {
            const data = await res.json();
            if (data.version != null) currentVersion = data.version;
            if (data.state && onStateCallback) {
              const serverState = hydrateState(data.state);
              lastServerState = serverState;
              const displayState = replayPending(serverState);
              onStateCallback(displayState);
            }
            await new Promise(r => setTimeout(r, 100));
            continue;
          }

          lastError = new Error(`Netlify dispatch failed: ${res.status}`);
        } catch (e) {
          lastError = e;
        }
      }
    }

    logEvent('error', 'dispatch_failed', {
      message: lastError?.message ?? String(lastError),
      detail: { action: action?.type, roomId },
    });
    pendingActions = pendingActions.filter(a => a !== pendingEntry);
    if (currentRoomId) {
      try {
        const state = await fetchState(currentRoomId);
        if (state && onStateCallback) onStateCallback(state);
      } catch (e) {
        logError('dispatch_recovery_fetch_failed', e);
      }
    }
  })();

  return optimisticState;
}
