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

const mockSupabase = {
  channel: jest.fn(() => mockChannel),
  removeChannel: jest.fn(),
  functions: {
    invoke: jest.fn(),
  },
  // appLog sink: assert-free no-op so logging paths never throw in tests
  from: jest.fn(() => ({ insert: jest.fn(() => Promise.resolve({ error: null })) })),
};

jest.unstable_mockModule('../../src/lib/supabaseClient.js', () => ({
  supabase: mockSupabase,
  onRealtimeHealth: () => () => {},
  realtimeProblem: () => '',
}));

// Import after mocking
const { fetchState, startRealtime, stopRealtime, dispatch, isConnected } = await import('../../src/lib/api.js');

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // reset (not just clear): a leftover mockResolvedValueOnce from a previous
    // test would otherwise satisfy this test's first fetch with the wrong body
    global.fetch.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchState', () => {
    it('should fetch state successfully', async () => {
      const mockState = {
        version: 1,
        state: {
          players: {},
          discard: [],
          pendingExchanges: [],
          logs: [],
        },
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockState,
      });

      const result = await fetchState('test-room');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/state?roomId=test-room'),
        expect.any(Object)
      );
      expect(result).toBeDefined();
      expect(result.players).toBeDefined();
    });

    it('should return null on 304 Not Modified', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 304,
      });

      const result = await fetchState('test-room');

      expect(result).toBeNull();
    });

    it('should throw error on failed request', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(fetchState('test-room')).rejects.toThrow();
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
    it('should send action to Supabase function', async () => {
      mockSupabase.functions.invoke.mockResolvedValueOnce({
        data: { version: 2 },
        error: null,
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          version: 1,
          state: {
            players: { 'player-1': { hand: [], crystallized: [] } },
            discard: [],
            pendingExchanges: [],
            logs: [],
          },
        }),
      });

      const action = { type: 'DRAW', playerId: 'player-1' };
      await dispatch('test-room', action);

      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
        'action',
        expect.objectContaining({
          body: { roomId: 'test-room', action },
          timeout: expect.any(Number),
        })
      );
    });

    it('should fallback to Netlify on Supabase error', async () => {
      mockSupabase.functions.invoke.mockResolvedValueOnce({
        data: null,
        error: new Error('Supabase error'),
      });

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            version: 1,
            state: {
              players: { 'player-1': { hand: [], crystallized: [] } },
              discard: [],
              pendingExchanges: [],
              logs: [],
            },
          }),
        })
        .mockResolvedValueOnce({
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
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ version: 9, state: { players: {}, discard: [], pendingExchanges: [], logs: [] } }),
      });
      const onState = jest.fn();

      startRealtime('test-room', onState);
      mockChannel.emitStatus('SUBSCRIBED');
      expect(global.fetch).not.toHaveBeenCalled();

      // Channel drops → backoff timer → startRealtime() from scheduleReconnect
      mockChannel.emitStatus('CHANNEL_ERROR');
      jest.advanceTimersByTime(1000);
      mockChannel.emitStatus('SUBSCRIBED');

      jest.useRealTimers();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/state?roomId=test-room'),
        expect.any(Object)
      );
      expect(onState).toHaveBeenCalled();

      stopRealtime();
      jest.useRealTimers();
    });

    it('keeps growing the reconnect backoff instead of resetting it', () => {
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
  });
});
