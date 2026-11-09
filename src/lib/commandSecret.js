/**
 * Signing for the command channel (issue #14).
 *
 * The command table is readable and writable by anyone holding the public
 * anon key, so a command must prove it came from the tab the room opened.
 * When a frame opens the tab it generates a secret and keeps it in its own
 * storage partition; the tab receives it in its URL. Only a holder of the
 * secret can sign a command, and only the room's frames can verify it.
 *
 * The signature covers the payload, so a captured command cannot be edited.
 * Both sides sign the SAME canonical string: JSONB reorders object keys, so
 * the payload is canonicalised (keys sorted) before it is stringified.
 */

const SECRET_PREFIX = 'cardenveil-cmd';

/** localStorage key holding the room's command secret (in the frames' partition). */
export function commandSecretKey(roomId) {
  return `${SECRET_PREFIX}:${roomId}`;
}

/** A fresh 256-bit secret. */
export function newCommandSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The room's command secret, created on first use and kept for the room's
 * life (several tabs may be open at once, so it must not rotate).
 * @param {string} roomId
 * @returns {string} '' when storage is unavailable
 */
export function getOrCreateCommandSecret(roomId) {
  const key = commandSecretKey(roomId);
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const secret = newCommandSecret();
    localStorage.setItem(key, secret);
    return secret;
  } catch {
    return '';
  }
}

/** The room's command secret, or '' when there is none. */
export function readCommandSecret(roomId) {
  try {
    return localStorage.getItem(commandSecretKey(roomId)) ?? '';
  } catch {
    return '';
  }
}

/** Sort object keys recursively so both sides sign the same string. */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalize(value[key]);
        return acc;
      }, {});
  }
  return value;
}

/** The exact bytes both sides sign. */
export function canonicalCommand(command) {
  return JSON.stringify([
    command?.kind ?? '',
    command?.room_id ?? '',
    canonicalize(command?.payload ?? {}),
  ]);
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Sign a command with the room's secret.
 * @param {string} secret
 * @param {{kind: string, room_id: string, payload: any}} command
 * @returns {Promise<string>} hex signature
 */
export async function signCommand(secret, command) {
  if (!secret) throw new Error('no command secret');
  // crypto.subtle needs a secure context (https, or localhost in dev).
  if (!globalThis.crypto?.subtle) throw new Error('crypto.subtle unavailable');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(canonicalCommand(command))
  );
  return toHex(signature);
}

/**
 * Verify a command's signature.
 * @param {string} secret
 * @param {{kind: string, room_id: string, payload: any, signature?: string}} command
 * @returns {Promise<boolean>}
 */
export async function verifyCommand(secret, command) {
  if (!secret || !command?.signature) return false;
  try {
    const expected = await signCommand(secret, command);
    const given = String(command.signature);
    if (expected.length !== given.length) return false;
    // Length-independent comparison would need constant time; a mismatch here
    // only tells an attacker that their signature was wrong.
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}
