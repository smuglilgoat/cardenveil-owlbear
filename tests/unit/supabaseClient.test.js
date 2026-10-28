import { jest } from '@jest/globals';

// The real supabaseClient.js, with only createClient mocked, so the Realtime
// options actually handed to supabase-js are asserted.
const createClient = jest.fn(() => ({ realtime: { connect: jest.fn() } }));
jest.unstable_mockModule('@supabase/supabase-js', () => ({ createClient }));

await import('../../src/lib/supabaseClient.js');

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
