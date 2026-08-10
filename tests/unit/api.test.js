import { jest } from '@jest/globals';

// Mock fetch globally
global.fetch = jest.fn();

// Mock Supabase
const mockChannel = {
  on: jest.fn(() => mockChannel),
  subscribe: jest.fn(() => mockChannel),
};

const mockSupabase = {
  channel: jest.fn(() => mockChannel),
  removeChannel: jest.fn(),
  functions: {
    invoke: jest.fn(),
  },
};

jest.unstable_mockModule('../../src/lib/supabaseClient.js', () => ({
  supabase: mockSupabase,
}));

// Import after mocking
const { fetchState, startRealtime, stopRealtime, dispatch } = await import('../../src/lib/api.js');

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
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
});
