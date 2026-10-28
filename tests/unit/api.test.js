import { jest } from '@jest/globals';

// Mock fetch globally
global.fetch = jest.fn();

// Mock Supabase
const mockChannel = {
  on: jest.fn(() => mockChannel),
  subscribe: jest.fn((cb) => {
    mockChannel.emitStatus = cb;
    return mockChannel;
  }),
};

// game_rooms read chain (the state read path) — resolves to gameRoomsResult.
let gameRoomsResult = { data: null, error: null };
const mockGameRoomsRead = jest.fn(() => Promise.resolve(gameRoomsResult));
const mockGameRoomsQuery = {
  select: jest.fn(() => mockGameRoomsQuery),
  eq: jest.fn(() => mockGameRoomsQuery),
  abortSignal: jest.fn(() => mockGameRoomsQuery),
  maybeSingle: mockGameRoomsRead,
};
// appLog sink: assert-free no-op so logging paths never throw in tests
const mockAppLogInsert = jest.fn(() => Promise.resolve({ error: null }));

const mockSupabase = {
  channel: jest.fn(() => mockChannel),
  removeChannel: jest.fn(),
  functions: {
    invoke: jest.fn(),
  },
  from: jest.fn((table) =>
    table === 'game_rooms' ? mockGameRoomsQuery : { insert: mockAppLogInsert }
  ),
};

// Realtime health listeners api.js registers (the heartbeat watchdog path).
const mockHealthListeners = new Set();

jest.unstable_mockModule('../../src/lib/supabaseClient.js', () => ({
  supabase: mockSupabase,
  onRealtimeHealth: (cb) => {
    mockHealthListeners.add(cb);
    return () => mockHealthListeners.delete(cb);
  },
  realtimeProblem: () => '',
}));

/** Deliver a heartbeat problem the way supabaseClient's onHeartbeat would. */
function emitHealthProblem(status) {
  for (const listener of [...mockHealthListeners]) listener(status);
}

// Import after mocking
const { fetchState, startRealtime, stopRealtime, recoverConnection, dispatch, isConnected } = await import('../../src/lib/api.js');

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // reset (not just clear): a leftover mockResolvedValueOnce from a previous
    // test would otherwise satisfy this test's first fetch with the wrong body
    global.fetch.mockReset();
    gameRoomsResult = { data: null, error: null };
    // api.js keeps module state (version, cached state, pending actions):
    // stop it so each test starts from a known frame.
    stopRealtime();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchState', () => {
    const roomState = {
      players: {},
      discard: [],
      pendingExchanges: [],
      logs: [],
    };

    it('should read state from Supabase', async () => {
      gameRoomsResult = { data: { version: 1, state: roomState }, error: null };

      const result = await fetchState('test-room');

      expect(mockSupabase.from).toHaveBeenCalledWith('game_rooms');
      expect(mockGameRoomsQuery.select).toHaveBeenCalledWith('version, state');
      expect(mockGameRoomsQuery.eq).toHaveBeenCalledWith('room_id', 'test-room');
      expect(mockGameRoomsRead).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
      expect(result.players).toBeDefined();
    });

    it('should not call the Netlify function on the happy path', async () => {
      // THE regression test for the credit burn: every state read used to be
      // one billable /api/state invocation.
      gameRoomsResult = { data: { version: 1, state: roomState }, error: null };

      await fetchState('test-room');

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return null (not throw) when the room does not exist', async () => {
      // CardGame reads null as "no room yet" and dispatches INIT_GAME. Throwing
      // here would stop a GM's game from ever initialising.
      gameRoomsResult = { data: null, error: null };

      await expect(fetchState('test-room')).resolves.toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return null when the room exists but has no state', async () => {
      gameRoomsResult = { data: { version: 4, state: null }, error: null };

      await expect(fetchState('test-room')).resolves.toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return the cached state when the version is unchanged', async () => {
      gameRoomsResult = { data: { version: 7, state: roomState }, error: null };
      const first = await fetchState('test-room');
      expect(first.players).toBeDefined();

      gameRoomsResult = { data: { version: 7, state: roomState }, error: null };
      const cached = await fetchState('test-room');

      // An unchanged version must not be conflated with "the room has no
      // state": callers treat null as "no room" and would dispatch a
      // game-wiping INIT_GAME. Identity is load-bearing too — returning the
      // same object keeps the pending optimistic actions untouched.
      expect(cached).toBe(first);
    });

    it('throws (never returns null) when the Supabase read fails, without calling Netlify', async () => {
      // The Netlify GET path is retired (410): calling it would burn a billable
      // invocation to learn what we already know. Throwing — not null — is the
      // point: null means "no room" and the GM would dispatch INIT_GAME.
      gameRoomsResult = { data: null, error: { code: 'PGRST000', message: 'connection refused' } };

      await expect(fetchState('test-room')).rejects.toThrow();
      expect(global.fetch).not.toHaveBeenCalled();

      // The failure must be visible in app_logs.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const rows = mockAppLogInsert.mock.calls.map(([row]) => row);
      const fallback = rows.find((row) => row.event === 'fetch_state_fallback_netlify');
      expect(fallback).toBeDefined();
      expect(fallback.message).toBe('PGRST000');
      expect(fallback.detail.error).toBe('connection refused');
    });

    it('throws when the Supabase read itself rejects', async () => {
      mockGameRoomsRead.mockRejectedValueOnce(new Error('network down'));

      await expect(fetchState('test-room')).rejects.toThrow();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('startRealtime', () => {
    it('should create Supabase channel and subscribe', () => {
      const onState = jest.fn();
      
      startRealtime('test-room', onState);

      expect(mockSupabase.channel).toHaveBeenCalledWith('game:test-room');
      expect(mockChannel.on).toHaveBeenCalled();
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    it('should clean up previous channel on restart', () => {
      const onState = jest.fn();
      
      startRealtime('test-room', onState);
      startRealtime('test-room', onState);

      expect(mockSupabase.removeChannel).toHaveBeenCalled();
    });
  });

  describe('stopRealtime', () => {
    it('should remove channel and reset state', () => {
      const onState = jest.fn();
      startRealtime('test-room', onState);
      
      stopRealtime();

      expect(mockSupabase.removeChannel).toHaveBeenCalled();
    });
  });

  describe('dispatch', () => {
    beforeEach(() => {
      // dispatch reads the current state first (Supabase), then applies
      gameRoomsResult = {
        data: {
          version: 1,
          state: {
            players: { 'player-1': { hand: [], crystallized: [] } },
            discard: [],
            pendingExchanges: [],
            logs: [],
          },
        },
        error: null,
      };
    });

    it('should send action to Supabase function', async () => {
      mockSupabase.functions.invoke.mockResolvedValueOnce({
        data: { version: 2 },
        error: null,
      });

      const action = { type: 'DRAW', playerId: 'player-1' };
      await dispatch('test-room', action);

      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
        'action',
        expect.objectContaining({
          body: {
            roomId: 'test-room',
            action: expect.objectContaining({
              type: 'DRAW',
              playerId: 'player-1',
              actorId: 'player-1',
              actionId: expect.any(String),
            }),
          },
          timeout: expect.any(Number),
        })
      );
    });

    it('stores a first-claim token and echoes it on the next dispatch', async () => {
      localStorage.removeItem('cardenveil-token:test-room:player-1');
      const token = 'a'.repeat(64);

      mockSupabase.functions.invoke.mockResolvedValueOnce({
        data: { version: 3, token },
        error: null,
      });
      await dispatch('test-room', { type: 'DRAW', playerId: 'player-1' });
      await new Promise((r) => setTimeout(r, 0));
      expect(localStorage.getItem('cardenveil-token:test-room:player-1')).toBe(token);

      mockSupabase.functions.invoke.mockResolvedValueOnce({
        data: { version: 4 },
        error: null,
      });
      await dispatch('test-room', { type: 'DRAW', playerId: 'player-1' });

      const body = mockSupabase.functions.invoke.mock.calls.at(-1)[1].body;
      expect(body.action.token).toBe(token);
      // A retried action must be recognisable as the same action instance.
      expect(body.action.actionId).toEqual(expect.any(String));
    });

    it('should fallback to Netlify on Supabase error', async () => {
      mockSupabase.functions.invoke.mockResolvedValueOnce({
        data: null,
        error: new Error('Supabase error'),
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ version: 2 }),
      });

      const action = { type: 'DRAW', playerId: 'player-1' };
      await dispatch('test-room', action);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/state',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String),
        })
      );
    });

    it('logs a coarse, stable message when the write fallback fires', async () => {
      const flush = () => new Promise((r) => setTimeout(r, 0));
      const invokeError = (raw) => Object.assign(new Error(raw), { code: 'FUNC_TIMEOUT' });
      const fallbackRows = () =>
        mockAppLogInsert.mock.calls
          .map(([row]) => row)
          .filter((row) => row.event === 'dispatch_fallback_netlify');

      mockSupabase.functions.invoke.mockResolvedValueOnce({ data: null, error: invokeError('boom one') });
      global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ version: 2 }) });
      await dispatch('test-room', { type: 'DRAW', playerId: 'player-1' });
      await flush();

      expect(fallbackRows()).toHaveLength(1);
      expect(fallbackRows()[0].message).toBe('FUNC_TIMEOUT');
      expect(fallbackRows()[0].detail.error).toBe('boom one');

      // A different raw error text must produce the same log key, so appLog's
      // dedupe keeps it to one slot: nothing new is inserted the second time.
      mockAppLogInsert.mockClear();
      mockSupabase.functions.invoke.mockResolvedValueOnce({ data: null, error: invokeError('boom two') });
      global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ version: 3 }) });
      await dispatch('test-room', { type: 'DRAW', playerId: 'player-1' });
      await flush();

      expect(global.fetch).toHaveBeenCalledTimes(2); // both runs reached the POST fallback
      expect(fallbackRows()).toHaveLength(0);
    });
  });

  describe('realtime reconnect', () => {
    it('marks the connection live once the channel subscribes', () => {
      startRealtime('test-room', jest.fn());
      expect(isConnected()).toBe(false);
      mockChannel.emitStatus('SUBSCRIBED');
      expect(isConnected()).toBe(true);
      stopRealtime();
    });

    it('runs the catch-up fetch after a reconnection, not on the first subscribe', async () => {
      jest.useFakeTimers();
      gameRoomsResult = {
        data: { version: 9, state: { players: {}, discard: [], pendingExchanges: [], logs: [] } },
        error: null,
      };
      const onState = jest.fn();

      startRealtime('test-room', onState);
      mockChannel.emitStatus('SUBSCRIBED');
      await jest.advanceTimersByTimeAsync(0);
      expect(mockGameRoomsRead).not.toHaveBeenCalled();

      // Channel drops → backoff timer → startRealtime() from scheduleReconnect
      mockChannel.emitStatus('CHANNEL_ERROR');
      jest.advanceTimersByTime(1000);
      mockChannel.emitStatus('SUBSCRIBED');
      await jest.advanceTimersByTimeAsync(0);

      expect(mockGameRoomsRead).toHaveBeenCalledTimes(1);
      expect(onState).toHaveBeenCalled();

      stopRealtime();
      jest.useRealTimers();
    });

    it('re-reads the state when recoverConnection runs right after a read', async () => {
      // The read is the only recovery for a row missed while the socket was
      // down, so no read-window throttle may suppress it.
      gameRoomsResult = {
        data: { version: 3, state: { players: {}, discard: [], pendingExchanges: [], logs: [] } },
        error: null,
      };
      const onState = jest.fn();
      const onConn = jest.fn();
      startRealtime('test-room', onState, onConn);
      mockChannel.emitStatus('SUBSCRIBED');

      const first = await fetchState('test-room');
      expect(first).not.toBeNull();
      mockGameRoomsRead.mockClear();
      gameRoomsResult = {
        data: { version: 4, state: { players: {}, discard: [], pendingExchanges: [], logs: [] } },
        error: null,
      };

      await recoverConnection();

      expect(mockGameRoomsRead).toHaveBeenCalledTimes(1);
      expect(onState).toHaveBeenCalledTimes(1);
      expect(onConn).toHaveBeenLastCalledWith('connected');

      stopRealtime();
    });

    it('doubles the backoff on each successive drop', () => {
      jest.useFakeTimers();
      startRealtime('test-room', jest.fn());
      mockChannel.emitStatus('SUBSCRIBED');

      mockChannel.emitStatus('CHANNEL_ERROR');
      jest.advanceTimersByTime(1000); // attempt 1 → 1 s
      mockChannel.emitStatus('CHANNEL_ERROR');
      const channelsAfterFirstRetry = mockSupabase.channel.mock.calls.length;
      jest.advanceTimersByTime(1000); // 2 s backoff: not elapsed yet
      expect(mockSupabase.channel.mock.calls.length).toBe(channelsAfterFirstRetry);
      jest.advanceTimersByTime(1000); // now 2 s elapsed → retry
      expect(mockSupabase.channel.mock.calls.length).toBe(channelsAfterFirstRetry + 1);

      stopRealtime();
      jest.useRealTimers();
    });

    it('keeps growing the backoff when the socket dies right after resubscribing', () => {
      jest.useFakeTimers();
      startRealtime('test-room', jest.fn());

      mockChannel.emitStatus('SUBSCRIBED');
      mockChannel.emitStatus('CHANNEL_ERROR'); // failed recovery #1 → 1 s
      jest.advanceTimersByTime(1000);

      // Subscribing is not a recovery: a connection that dies again at once
      // must not reset the counter to 0 (that was the flat 1 s reconnect loop).
      mockChannel.emitStatus('SUBSCRIBED');
      mockChannel.emitStatus('CHANNEL_ERROR'); // failed recovery #2 → 2 s
      const afterFirstRetry = mockSupabase.channel.mock.calls.length;
      jest.advanceTimersByTime(1000);
      expect(mockSupabase.channel.mock.calls.length).toBe(afterFirstRetry);
      jest.advanceTimersByTime(1000);
      expect(mockSupabase.channel.mock.calls.length).toBe(afterFirstRetry + 1);

      stopRealtime();
      jest.useRealTimers();
    });

    it('does not let the heartbeat watchdog cancel a scheduled backoff', () => {
      jest.useFakeTimers();
      startRealtime('test-room', jest.fn());
      mockChannel.emitStatus('SUBSCRIBED');

      // Climb to the 30 s step so the watchdog (2.5 s) would win the race.
      for (const delay of [1000, 2000, 4000, 8000]) {
        mockChannel.emitStatus('CHANNEL_ERROR');
        jest.advanceTimersByTime(delay);
      }
      mockChannel.emitStatus('CHANNEL_ERROR'); // next recovery is 30 s away
      const scheduled = mockSupabase.channel.mock.calls.length;

      emitHealthProblem('timeout');
      jest.advanceTimersByTime(2500); // the watchdog used to reconnect here
      expect(mockSupabase.channel.mock.calls.length).toBe(scheduled);

      jest.advanceTimersByTime(27500); // 30 s after the drop: the backoff fires
      expect(mockSupabase.channel.mock.calls.length).toBe(scheduled + 1);

      stopRealtime();
      jest.useRealTimers();
    });

    it('still reconnects at once on tab refocus while a backoff is pending', () => {
      jest.useFakeTimers();
      startRealtime('test-room', jest.fn());
      mockChannel.emitStatus('SUBSCRIBED');
      mockChannel.emitStatus('CHANNEL_ERROR'); // 1 s backoff pending
      const before = mockSupabase.channel.mock.calls.length;

      recoverConnection(); // the visibilitychange path

      // No timer advanced: the user coming back gets an immediate resync.
      expect(mockSupabase.channel.mock.calls.length).toBe(before + 1);

      // Forcing it keeps the ladder: this resubscribe is a failed recovery too.
      const forced = mockSupabase.channel.mock.calls.length;
      mockChannel.emitStatus('SUBSCRIBED');
      mockChannel.emitStatus('CHANNEL_ERROR');
      jest.advanceTimersByTime(1000); // 2 s step, not 1 s
      expect(mockSupabase.channel.mock.calls.length).toBe(forced);
      jest.advanceTimersByTime(1000);
      expect(mockSupabase.channel.mock.calls.length).toBe(forced + 1);

      stopRealtime();
      jest.useRealTimers();
    });

    it('grants a fresh recovery budget on a successful subscribe after exhaustion', () => {
      jest.useFakeTimers();
      const onConn = jest.fn();
      startRealtime('test-room', jest.fn(), onConn);
      mockChannel.emitStatus('SUBSCRIBED');

      const steps = [1000, 2000, 4000, 8000];
      for (let i = 0; i < 30; i++) {
        mockChannel.emitStatus('CHANNEL_ERROR');
        jest.advanceTimersByTime(steps[i] ?? 30000);
      }
      mockChannel.emitStatus('CHANNEL_ERROR'); // attempt 31: budget exhausted
      expect(onConn).toHaveBeenLastCalledWith('permanently_disconnected');

      // The transport comes back (e.g. tab refocus re-subscribes): the budget
      // must not leave the client dead at 30.
      recoverConnection();
      mockChannel.emitStatus('SUBSCRIBED');
      jest.advanceTimersByTime(30000); // the pre-fix death cadence
      mockChannel.emitStatus('CHANNEL_ERROR');

      const channels = mockSupabase.channel.mock.calls.length;
      jest.advanceTimersByTime(30000); // 30 s step (uptime was under 60 s)
      expect(mockSupabase.channel.mock.calls.length).toBe(channels + 1);
      expect(onConn).not.toHaveBeenLastCalledWith('permanently_disconnected');

      stopRealtime();
      jest.useRealTimers();
    });

    it('resets the backoff once a connection stayed up past the healthy threshold', () => {
      jest.useFakeTimers();
      startRealtime('test-room', jest.fn());

      mockChannel.emitStatus('SUBSCRIBED');
      mockChannel.emitStatus('CHANNEL_ERROR'); // failed recovery #1 → 1 s
      jest.advanceTimersByTime(1000);
      mockChannel.emitStatus('SUBSCRIBED');
      mockChannel.emitStatus('CHANNEL_ERROR'); // failed recovery #2 → 2 s
      jest.advanceTimersByTime(2000);
      mockChannel.emitStatus('SUBSCRIBED');

      // Healthy for longer than HEALTHY_CONNECTION_MS (60 s): the next drop is
      // a transient blip, so the backoff starts over from 1 s.
      jest.advanceTimersByTime(61000);
      mockChannel.emitStatus('CHANNEL_ERROR');
      const before = mockSupabase.channel.mock.calls.length;
      jest.advanceTimersByTime(1000);
      expect(mockSupabase.channel.mock.calls.length).toBe(before + 1);

      stopRealtime();
      jest.useRealTimers();
    });

    it('gives up after MAX_RECONNECT_ATTEMPTS consecutive failed recoveries', () => {
      jest.useFakeTimers();
      const onConn = jest.fn();
      startRealtime('test-room', jest.fn(), onConn);
      mockChannel.emitStatus('SUBSCRIBED');

      // 1, 2, 4, 8 s then MAX_BACKOFF_MS (30 s) for every further attempt.
      const steps = [1000, 2000, 4000, 8000];
      for (let i = 0; i < 30; i++) {
        mockChannel.emitStatus('CHANNEL_ERROR');
        jest.advanceTimersByTime(steps[i] ?? 30000);
      }
      expect(mockSupabase.channel.mock.calls.length).toBe(31);

      mockChannel.emitStatus('CHANNEL_ERROR'); // attempt 31: budget exhausted
      const channels = mockSupabase.channel.mock.calls.length;
      jest.advanceTimersByTime(120000);

      expect(mockSupabase.channel.mock.calls.length).toBe(channels);
      expect(onConn).toHaveBeenLastCalledWith('permanently_disconnected');

      stopRealtime();
      jest.useRealTimers();
    });

    it('drops the optimistic entry when realtime delivers the confirmed state first', async () => {
      let realtimeCb = null;
      mockChannel.on.mockImplementationOnce((_event, _config, cb) => {
        realtimeCb = cb;
        return mockChannel;
      });

      const onState = jest.fn();
      startRealtime('test-room', onState);
      mockChannel.emitStatus('SUBSCRIBED');

      const row = (version, hand) => ({
        version,
        state: {
          players: {
            'player-1': {
              name: 'P',
              hand,
              crystallized: [],
              tokens: { force: 3, agilite: 3, esprit: 3, social: 3 },
              maxTokens: { force: 3, agilite: 3, esprit: 3, social: 3 },
            },
          },
          discard: [],
          pendingExchanges: [],
          logs: [],
        },
      });

      gameRoomsResult = { data: row(1, []), error: null };
      await fetchState('test-room');

      let resolveInvoke;
      mockSupabase.functions.invoke.mockImplementationOnce(
        () => new Promise((resolve) => { resolveInvoke = resolve; })
      );

      const dispatching = dispatch('test-room', { type: 'DRAW', playerId: 'player-1' });
      expect(onState.mock.calls.at(-1)[0].players['player-1'].hand).toHaveLength(1);

      // The row for version 2 (which already contains the draw) lands before
      // the function response does — the classic double-apply window.
      realtimeCb({ new: row(2, ['n-S-5-a']) });

      resolveInvoke({ data: { version: 2 }, error: null });
      await dispatching;

      // Confirmation must re-render from server truth: exactly one card.
      const shown = onState.mock.calls.at(-1)[0].players['player-1'].hand;
      expect(shown).toHaveLength(1);
      expect(shown[0]._pending).toBeUndefined();

      stopRealtime();
    });

    it('keeps the optimistic entry when a same-version read short-circuits', async () => {
      let realtimeCb = null;
      mockChannel.on.mockImplementationOnce((_event, _config, cb) => {
        realtimeCb = cb;
        return mockChannel;
      });

      const onState = jest.fn();
      startRealtime('test-room', onState);
      mockChannel.emitStatus('SUBSCRIBED');

      const row = (version, hand) => ({
        version,
        state: {
          players: {
            'player-1': {
              name: 'P',
              hand,
              crystallized: [],
              tokens: { force: 3, agilite: 3, esprit: 3, social: 3 },
              maxTokens: { force: 3, agilite: 3, esprit: 3, social: 3 },
            },
          },
          discard: [],
          pendingExchanges: [],
          logs: [],
        },
      });

      gameRoomsResult = { data: row(1, []), error: null };
      await fetchState('test-room');

      let resolveInvoke;
      mockSupabase.functions.invoke.mockImplementationOnce(
        () => new Promise((resolve) => { resolveInvoke = resolve; })
      );
      const dispatching = dispatch('test-room', { type: 'DRAW', playerId: 'player-1' });

      // Same version as currentVersion: fetchState returns the cached state
      // without re-hydrating, and must NOT clear the pending optimistic action.
      gameRoomsResult = { data: row(1, []), error: null };
      await fetchState('test-room');

      // A row for another player's write (version 2, no draw for player-1).
      realtimeCb({ new: row(2, []) });

      const shown = onState.mock.calls.at(-1)[0].players['player-1'].hand;
      expect(shown).toHaveLength(1);
      expect(shown[0]._pending).toBe(true);

      resolveInvoke({ data: { version: 2 }, error: null });
      await dispatching;

      stopRealtime();
    });
  });
});
