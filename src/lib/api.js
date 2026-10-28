import { hydrateState, applyAction, createInitialGameState, makePendingCard } from './deck.js';
import { supabase, onRealtimeHealth, realtimeProblem } from './supabaseClient.js';
import { logEvent, logError } from './appLog.js';

let currentVersion = 0;
let realtimeChannel = null;
let onStateCallback = null;
let onConnectionCallback = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let isSubscribed = false;
let currentRoomId = null;
let permanentlyDisconnected = false;
let connectionGeneration = 0;
let healthUnsub = null;
let healthTimer = null;

let lastServerState = null;
let pendingActions = [];

const BACKOFF_STEPS_MS = [1000, 2000, 4000, 8000];
const MAX_BACKOFF_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 30;
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
 * an error with "no room" would wipe a live game.
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
    return fetchStateFromNetlify(roomId, err);
  }
  if (read.error) {
    return fetchStateFromNetlify(roomId, read.error);
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

/** Last resort when the Supabase read fails: the Netlify function's GET path. */
async function fetchStateFromNetlify(roomId, cause) {
  // Coarse, stable message: appLog dedupes on level|event|message, so the raw
  // error text would spend one log slot per distinct failure (MAX_PER_SESSION).
  logEvent('warn', 'fetch_state_fallback_netlify', {
    message: cause?.code != null ? String(cause.code) : 'read_failed',
    detail: { error: cause?.message ?? String(cause) },
  });
  let res;
  try {
    res = await fetch(`/api/state?roomId=${encodeURIComponent(roomId)}`, {
      headers: currentVersion ? { 'If-None-Match': String(currentVersion) } : {},
      signal: timeoutSignal(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    logEvent('warn', 'fetch_state_failed', { message: err?.message ?? String(err), detail: { timeoutMs: FETCH_TIMEOUT_MS } });
    throw new Error('State fetch timed out');
  }
  if (res.status === 304) return lastServerState;
  if (!res.ok) {
    logEvent('warn', 'fetch_state_failed', { message: `HTTP ${res.status}` });
    throw new Error(`State fetch failed: ${res.status}`);
  }
  const data = await res.json();
  if (data.version != null) currentVersion = data.version;
  if (!data.state) return null;
  const state = hydrateState(data.state);
  lastServerState = state;
  pendingActions = [];
  return state;
}

function nextBackoffMs() {
  return reconnectAttempt < BACKOFF_STEPS_MS.length
    ? BACKOFF_STEPS_MS[reconnectAttempt]
    : MAX_BACKOFF_MS;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  if (!currentRoomId) return;
  if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
    if (!permanentlyDisconnected) {
      permanentlyDisconnected = true;
      logEvent('error', 'realtime_permanently_disconnected', { detail: { attempts: reconnectAttempt } });
      if (onConnectionCallback) onConnectionCallback('permanently_disconnected');
    }
    return;
  }
  const delay = nextBackoffMs();
  reconnectAttempt++;
  logEvent('warn', 'realtime_reconnect_scheduled', { detail: { delay, attempt: reconnectAttempt } });
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

  if (type === 'USE_AGILITE') {
    const pid = action.playerId;
    const newHand = optimisticState.players[pid]?.hand ?? [];
    // USE_AGILITE removes 1 card and adds 1 — the last card is the new draw
    if (newHand.length > 0) {
      const hand = [...newHand.slice(0, -1), makePendingCard()];
      return {
        ...optimisticState,
        players: {
          ...optimisticState.players,
          [pid]: { ...optimisticState.players[pid], hand },
        },
      };
    }
  }

  // AASIMAR auto-heart: after any token-consuming action, mark the new crystallized card as pending
  if (['DRAW_FORCE', 'USE_AGILITE', 'USE_ESPRIT', 'SPEND_TOKEN'].includes(type)) {
    const pid = action.playerId;
    const player = optimisticState.players[pid];
    if (player?.race === 'aasimar') {
      const prevCrystLen = prevState.players[pid]?.crystallized?.length ?? 0;
      const cryst = player.crystallized;
      if (cryst.length > prevCrystLen) {
        const updated = [...cryst.slice(0, -1), makePendingCard()];
        return {
          ...optimisticState,
          players: {
            ...optimisticState.players,
            [pid]: { ...player, crystallized: updated },
          },
        };
      }
    }
  }

  // AASIMAR auto-heart on ACCEPT_EXCHANGE: the sender (who spent the Social token) gets the Heart
  if (type === 'ACCEPT_EXCHANGE') {
    const ex = (prevState.pendingExchanges ?? []).find(e => e.id === action.exchangeId);
    if (ex) {
      const senderId = ex.from;
      const sender = optimisticState.players[senderId];
      if (sender?.race === 'aasimar') {
        const prevCrystLen = prevState.players[senderId]?.crystallized?.length ?? 0;
        const cryst = sender.crystallized;
        if (cryst.length > prevCrystLen) {
          const updated = [...cryst.slice(0, -1), makePendingCard()];
          return {
            ...optimisticState,
            players: {
              ...optimisticState.players,
              [senderId]: { ...sender, crystallized: updated },
            },
          };
        }
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
  connectionGeneration++;
  if (!keepCounters) {
    currentRoomId = null;
    reconnectAttempt = 0;
    permanentlyDisconnected = false;
    lastServerState = null;
    pendingActions = [];
    // A stopped frame must not claim to know a version: a stale version makes
    // the next fetch send a bogus If-None-Match (304) and drops realtime rows.
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
      logEvent('warn', 'realtime_health_problem', { message: status });
      if (onConnectionCallback) onConnectionCallback('disconnected');
      clearHealthTimer();
      healthTimer = setTimeout(() => {
        healthTimer = null;
        recoverConnection();
      }, HEALTH_CATCH_UP_MS);
    });
  }
}

/**
 * Re-subscribe + resync after a silent drop (also used on tab refocus).
 * Safe to call at any time: a no-op when the room was never started.
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
        const wasReconnect = reconnectAttempt > 0;
        logEvent('info', wasReconnect ? 'realtime_reconnected' : 'realtime_subscribed', {
          detail: { attempt: reconnectAttempt },
        });
        isSubscribed = true;
        reconnectAttempt = 0;
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
        logEvent('warn', 'realtime_channel_error', { message: status, detail: { error: err?.message } });
        isSubscribed = false;
        if (onConnectionCallback) onConnectionCallback('disconnected');
        scheduleReconnect();
      } else if (status === 'CLOSED') {
        logEvent('warn', 'realtime_channel_closed', {});
        isSubscribed = false;
        if (onConnectionCallback) onConnectionCallback('disconnected');
        scheduleReconnect();
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
      logEvent('warn', 'dispatch_fallback_netlify', {
        message: lastError?.message ?? String(lastError),
        detail: { action: action?.type },
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
