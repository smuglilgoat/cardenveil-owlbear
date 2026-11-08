import { jest } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';

// jsdom exposes neither SubtleCrypto nor TextEncoder; browsers and Deno do.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = TextEncoder;
}
if (!globalThis.TextDecoder) {
  globalThis.TextDecoder = TextDecoder;
}

const { mintRecoveryCode, verifyRecoveryCode, RECOVERY_CODE_TTL_MS } = await import('../../src/lib/recoveryCode.js');

const SECRET = 'owner-secret';
const room = { roomId: 'room-1', gmId: 'gm-1' };

describe('recovery codes', () => {
  it('mints a code that verifies for its room and identity', async () => {
    const code = await mintRecoveryCode(SECRET, room);
    expect(code.startsWith('cv1.')).toBe(true);
    expect(await verifyRecoveryCode(SECRET, code, room)).toEqual({ ok: true });
  });

  it('expires on its own', async () => {
    const code = await mintRecoveryCode(SECRET, { ...room, exp: Date.now() + 1000 });
    const later = Date.now() + RECOVERY_CODE_TTL_MS + 5000;
    expect(await verifyRecoveryCode(SECRET, code, { ...room, now: later })).toEqual({
      ok: false,
      reason: 'expired_code',
    });
  });

  it('refuses another room and another identity', async () => {
    const code = await mintRecoveryCode(SECRET, room);
    expect(await verifyRecoveryCode(SECRET, code, { roomId: 'room-2', gmId: 'gm-1' })).toEqual({
      ok: false,
      reason: 'wrong_room',
    });
    expect(await verifyRecoveryCode(SECRET, code, { roomId: 'room-1', gmId: 'gm-2' })).toEqual({
      ok: false,
      reason: 'wrong_identity',
    });
  });

  it('refuses a code signed with another secret', async () => {
    const code = await mintRecoveryCode('other-secret', room);
    expect(await verifyRecoveryCode(SECRET, code, room)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('refuses a tampered payload', async () => {
    const code = await mintRecoveryCode(SECRET, room);
    const [, payload, signature] = code.split('.');
    const forged = Buffer.from(JSON.stringify({ ...room, gmId: 'gm-evil', exp: Date.now() + 60000 })).toString('base64url');
    expect(await verifyRecoveryCode(SECRET, `cv1.${forged}.${signature}`, room)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
    expect(await verifyRecoveryCode(SECRET, `cv1.${payload}.${signature}`, room)).toEqual({ ok: true });
  });

  it('refuses a malformed code and a missing secret', async () => {
    expect(await verifyRecoveryCode(SECRET, 'nope', room)).toEqual({ ok: false, reason: 'malformed_code' });
    expect(await verifyRecoveryCode('', 'cv1.abc.def', room)).toEqual({
      ok: false,
      reason: 'recovery_unavailable',
    });
  });
});
