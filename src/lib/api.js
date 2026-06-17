import { hydrateState, applyAction, createInitialGameState, makePendingCard } from './deck.js';
import { supabase } from './supabaseClient.js';

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

let lastServerState = null;
let pendingActions = [];

const BACKOFF_STEPS_MS = [1000, 2000, 4000, 8000];
const MAX_BACKOFF_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 30;

export function isConnected() {
  return isSubscribed;
}

export async function fetchState(roomId) {
  const res = await fetch(`/api/state?roomId=${encodeURIComponent(roomId)}`, {
    headers: currentVersion ? { 'If-None-Match': String(currentVersion) } : {},
  });
  if (res.status === 304) return null;
  if (!res.ok) throw new Error(`State fetch failed: ${res.status}`);
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
      if (onConnectionCallback) onConnectionCallback('permanently_disconnected');
    }
    return;
  }
  const delay = nextBackoffMs();
  reconnectAttempt++;
  console.log(`Realtime: scheduling reconnect in ${delay}ms (attempt ${reconnectAttempt})`);
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

export function startRealtime(roomId, onState, onConnectionChange) {
  onStateCallback = onState;
  onConnectionCallback = onConnectionChange || null;
  stopRealtime();

  currentRoomId = roomId;
  permanentlyDisconnected = false;
  const myGen = ++connectionGeneration;

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
        console.log(wasReconnect ? 'Realtime reconnected' : 'Realtime subscribed');
        isSubscribed = true;
        reconnectAttempt = 0;
        permanentlyDisconnected = false;
        if (onConnectionCallback) onConnectionCallback('connected');
        if (wasReconnect) {
          const catchUpGen = myGen;
          fetchState(roomId)
            .then((state) => {
              if (catchUpGen !== connectionGeneration) return;
              if (state && onStateCallback) onStateCallback(state);
            })
            .catch((e) => console.warn('Realtime catch-up fetch failed:', e));
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('Realtime channel error:', err);
        isSubscribed = false;
        if (onConnectionCallback) onConnectionCallback('disconnected');
        scheduleReconnect();
      } else if (status === 'CLOSED') {
        console.warn('Realtime channel closed');
        isSubscribed = false;
        if (onConnectionCallback) onConnectionCallback('disconnected');
        scheduleReconnect();
      }
    });
}

export function stopRealtime() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  isSubscribed = false;
  currentRoomId = null;
  reconnectAttempt = 0;
  permanentlyDisconnected = false;
  connectionGeneration++;
  lastServerState = null;
  pendingActions = [];
}

const MAX_CLIENT_RETRIES = 3;

export async function dispatch(roomId, action) {
  const currentState = lastServerState
    ? replayPending(lastServerState)
    : (await fetchState(roomId)) ?? createInitialGameState();

  const { state: rawOptimistic } = applyAction(currentState, action);
  const optimisticState = markOptimisticDraws(currentState, rawOptimistic, action);
  if (onStateCallback) {
    onStateCallback(optimisticState);
  }

  const pendingEntry = { ...action, _dispatchTime: Date.now() };
  pendingActions.push(pendingEntry);

  (async () => {
    let lastError;
    let useFallback = false;

    for (let attempt = 0; attempt < MAX_CLIENT_RETRIES; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke('action', {
          body: { roomId, action },
        });

        if (error) {
          lastError = error;
          useFallback = true;
          break;
        }

        if (data?.version != null) {
          pendingEntry._confirmedVersion = data.version;
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
      console.warn('Edge Function failed, falling back to Netlify:', lastError?.message);
      for (let attempt = 0; attempt < MAX_CLIENT_RETRIES; attempt++) {
        try {
          const res = await fetch('/api/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId, action }),
          });

          if (res.ok) {
            const data = await res.json();
            pendingEntry._confirmedVersion = data.version;
            return;
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

    console.error('Dispatch failed after retries:', lastError);
    pendingActions = pendingActions.filter(a => a !== pendingEntry);
    if (currentRoomId) {
      try {
        const state = await fetchState(currentRoomId);
        if (state && onStateCallback) onStateCallback(state);
      } catch (e) {
        console.error('Recovery fetch failed:', e);
      }
    }
  })();

  return optimisticState;
}
