import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/lib/supabaseClient.js', () => ({
  supabase: { from: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() },
}));

const { isStaleCommand, COMMAND_MAX_AGE_MS } = await import('../../src/lib/roomBridge.js');

describe('roomBridge.isStaleCommand', () => {
  const now = Date.parse('2026-11-08T12:00:00Z');

  it('accepts a fresh command', () => {
    expect(isStaleCommand({ payload: { ts: now - 1000 } }, now)).toBe(false);
  });

  it('rejects a command older than the window (the tab closed before the frames read it)', () => {
    expect(isStaleCommand({ payload: { ts: now - COMMAND_MAX_AGE_MS - 1000 } }, now)).toBe(true);
  });

  it('ignores created_at — the inserter can set it, only the signed ts counts', () => {
    const command = { created_at: new Date(now).toISOString(), payload: { ts: now - COMMAND_MAX_AGE_MS - 1000 } };
    expect(isStaleCommand(command, now)).toBe(true);
  });

  it('accepts a command with no timestamp rather than dropping it', () => {
    expect(isStaleCommand({ payload: {} }, now)).toBe(false);
  });
});
