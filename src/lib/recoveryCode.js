/**
 * One-time recovery codes — the owner's way to hand a GM back their table when
 * the actor guard refuses them.
 *
 * WHY A CODE AND NOT A CREDENTIAL-FREE GM ACTION: `state.gmId` is public (it
 * is in the room state every client can read), so any action keyed on it can
 * be forged — `tests/unit/stateFunction.test.js` asserts that a HARD_RESET
 * without the credential is refused. The recovery therefore needs a secret only
 * the table's owner has.
 *
 * The code is a bearer credential, scoped to one room and one identity, with
 * an expiry: `cv1.<base64url(payload)>.<base64url(hmac)>` where payload is
 * `{roomId, gmId, exp}` and the hmac is HMAC-SHA256 over `cv1.<payload>` with
 * the owner's secret.
 *
 * Shared by the two server functions (through the `_recoveryCode.js` symlink)
 * and by `scripts/mint-recovery-code.mjs`.
 */

export const RECOVERY_CODE_PREFIX = 'cv1';
/** Default lifetime of a minted code: 30 minutes. */
export const RECOVERY_CODE_TTL_MS = 30 * 60 * 1000;

function base64url(bytes) {
  let binary = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}

/**
 * Mint a recovery code.
 * @param {string} secret - the owner's secret (RECOVERY_SECRET)
 * @param {{roomId: string, gmId: string, exp?: number}} payload
 * @returns {Promise<string>} the code to hand to the GM
 */
export async function mintRecoveryCode(secret, payload) {
  if (!secret) throw new Error('RECOVERY_SECRET is not set');
  if (!payload?.roomId || !payload?.gmId) throw new Error('roomId and gmId are required');
  const body = {
    roomId: String(payload.roomId),
    gmId: String(payload.gmId),
    exp: payload.exp ?? Date.now() + RECOVERY_CODE_TTL_MS,
  };
  const encoded = base64url(new TextEncoder().encode(JSON.stringify(body)));
  const signed = `${RECOVERY_CODE_PREFIX}.${encoded}`;
  const signature = base64url(await hmac(secret, signed));
  return `${signed}.${signature}`;
}

/**
 * Verify a recovery code against the room and the identity claiming it.
 * @param {string} secret
 * @param {string} code
 * @param {{roomId: string, gmId: string, now?: number}} expected
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function verifyRecoveryCode(secret, code, expected) {
  if (!secret) return { ok: false, reason: 'recovery_unavailable' };
  const parts = String(code ?? '').trim().split('.');
  if (parts.length !== 3 || parts[0] !== RECOVERY_CODE_PREFIX) {
    return { ok: false, reason: 'malformed_code' };
  }
  const [, encoded, signature] = parts;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64url(encoded)));
  } catch {
    return { ok: false, reason: 'malformed_code' };
  }

  // Signature first: an unsigned payload must not be able to claim anything.
  const expectedSig = toHex(await hmac(secret, `${RECOVERY_CODE_PREFIX}.${encoded}`));
  const givenSig = toHex(fromBase64url(signature));
  if (expectedSig.length !== givenSig.length) return { ok: false, reason: 'bad_signature' };
  let diff = 0;
  for (let i = 0; i < expectedSig.length; i++) diff |= expectedSig.charCodeAt(i) ^ givenSig.charCodeAt(i);
  if (diff !== 0) return { ok: false, reason: 'bad_signature' };

  const now = expected?.now ?? Date.now();
  if (!Number.isFinite(payload?.exp) || payload.exp <= now) {
    return { ok: false, reason: 'expired_code' };
  }
  if (expected?.roomId && payload.roomId !== expected.roomId) {
    return { ok: false, reason: 'wrong_room' };
  }
  if (expected?.gmId && payload.gmId !== expected.gmId) {
    return { ok: false, reason: 'wrong_identity' };
  }
  return { ok: true };
}
