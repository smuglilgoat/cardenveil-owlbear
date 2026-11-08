import { jest } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';

// jsdom exposes neither SubtleCrypto nor TextEncoder; browsers do.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = TextEncoder;
}

const { signCommand, verifyCommand, canonicalCommand } = await import('../../src/lib/commandSecret.js');

describe('command signatures', () => {
  const command = { kind: 'roll', room_id: 'room-1', payload: { label: 'Test', playerId: 'p1' } };

  it('signs and verifies a command', async () => {
    const signature = await signCommand('secret-1', command);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyCommand('secret-1', { ...command, signature })).toBe(true);
  });

  it('rejects a command signed with another secret', async () => {
    const signature = await signCommand('secret-2', command);
    expect(await verifyCommand('secret-1', { ...command, signature })).toBe(false);
  });

  it('rejects a command whose payload was edited after signing', async () => {
    const signature = await signCommand('secret-1', command);
    const tampered = { ...command, signature, payload: { ...command.payload, label: 'Autre' } };
    expect(await verifyCommand('secret-1', tampered)).toBe(false);
  });

  it('rejects an unsigned command', async () => {
    expect(await verifyCommand('secret-1', command)).toBe(false);
    expect(await verifyCommand('', { ...command, signature: 'x' })).toBe(false);
  });

  it('signs the same string whatever the key order (JSONB reorders keys)', () => {
    const a = { kind: 'roll', room_id: 'r', payload: { b: 1, a: 2 } };
    const b = { kind: 'roll', room_id: 'r', payload: { a: 2, b: 1 } };
    expect(canonicalCommand(a)).toBe(canonicalCommand(b));
  });
});
