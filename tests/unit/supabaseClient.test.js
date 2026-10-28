import { jest } from '@jest/globals';

// The real supabaseClient.js, with only createClient mocked, so the Realtime
// options actually handed to supabase-js are asserted.
const createClient = jest.fn(() => ({ realtime: { connect: jest.fn() } }));
jest.unstable_mockModule('@supabase/supabase-js', () => ({ createClient }));

const { onRealtimeHealth, realtimeProblem } = await import('../../src/lib/supabaseClient.js');

const realtimeOptions = createClient.mock.calls[0][2].realtime;

describe('supabaseClient realtime options', () => {
  it('does not rely on the Web Worker for heartbeats', () => {
    // With worker: true, realtime-js sets autoSendHeartbeat = !worker and the
    // Worker becomes the only heartbeat source; in OBR's sandboxed iframes it
    // does not run, nothing heartbeats and the server closes the socket ~30 s.
    expect(realtimeOptions.worker).toBe(false);
  });

  it('heartbeats well inside the socket default interval', () => {
    // Socket default 30 s / RealtimeClient default 25 s: too close to the
    // server's idle tolerance. 10 s gives three chances.
    expect(realtimeOptions.heartbeatIntervalMs).toBe(10000);
  });

  it('keeps the health callback wired to the heartbeat', () => {
    expect(typeof realtimeOptions.heartbeatCallback).toBe('function');
  });
});

describe('supabaseClient heartbeat problems', () => {
  const heartbeat = realtimeOptions.heartbeatCallback;
  let seen;
  let unsubscribe;

  beforeEach(() => {
    jest.useFakeTimers();
    seen = [];
    unsubscribe = onRealtimeHealth((status) => seen.push(status));
  });

  afterEach(() => {
    unsubscribe();
    jest.useRealTimers();
  });

  it('collapses repeated problems of one status into one signal per window', () => {
    // A sick connection reports a problem on every heartbeat (10 s). A window
    // no wider than the interval would turn each beat into a read + reconnect.
    heartbeat('timeout');
    heartbeat('timeout');
    jest.advanceTimersByTime(10000); // exactly one heartbeat interval
    heartbeat('timeout');
    expect(seen).toEqual(['timeout']);

    jest.advanceTimersByTime(10000); // past the window: one reminder is enough
    heartbeat('timeout');
    expect(seen).toEqual(['timeout', 'timeout']);
  });

  it('reports a new problem after a healthy heartbeat cleared the last one', () => {
    heartbeat('error');
    heartbeat('ok');
    heartbeat('timeout');
    expect(seen).toEqual(['error', 'timeout']);
    expect(realtimeProblem()).toBe('timeout');
  });
});
