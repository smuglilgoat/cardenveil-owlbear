/**
 * Write-path guards shared by both server functions: actor identity and
 * idempotency. Imported by `netlify/functions/state.js` and
 * `supabase/functions/action/index.ts` (via the `_actionGuard.js` symlink) —
 * never by the client bundle.
 *
 * WHY a token rather than a session:
 * Owlbear Rodeo cannot prove a player's id to our server — there is no shared
 * identity provider, and the client sends `playerId` itself. So the first
 * accepted write for a player mints a 256-bit token; the client keeps it in
 * localStorage and echoes it on every action, and only the token's SHA-256
 * hash is stored in the room state. The hash is public (the whole state is
 * broadcast) but the token is not derivable from it.
 *
 * KNOWN LIMITS (accepted, documented in AGENTS.md):
 * - the first writer to claim an id owns it (a race only an attacker in the
 *   room could win, and only before the real client's first write);
 * - a client that loses its token cannot re-claim: recovery is GM-mediated —
 *   HARD_RESET recreates the player records, which drops every hash.
 */

const TOKEN_BYTES = 32;
const MAX_TOKEN_HASHES = 4;

/** How many recent action ids are remembered for de-duplication. */
export const MAX_ACTION_IDS = 50;

function toHex(bytes) {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/** A fresh opaque token. 256 bits from the platform CSPRNG. */
export function mintToken() {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/**
 * SHA-256 (hex) of a token. WebCrypto is available in browsers, Node 20+ and
 * Deno — the three runtimes this module runs in.
 * @param {string} token
 * @param {SubtleCrypto} [subtle]
 * @returns {Promise<string>}
 */
export async function hashToken(token, subtle = globalThis.crypto?.subtle) {
  const data = new TextEncoder().encode(String(token));
  const digest = await subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(digest));
}

/**
 * Decide whether an action may be applied.
 *
 * Identities live in `state.actorTokens` (a map of actorId → token hashes),
 * not on the player records: the GM and the GM character act too, and the GM
 * usually has no player record at all.
 *
 * Only a *provable lie* is rejected: if the actor has never been issued a
 * token, the action passes (the reducer's own guards still decide what that
 * actor is allowed to do). That keeps a stale client — a frame that has not
 * registered yet, or a browser whose storage was cleared — from erroring on
 * every no-op.
 *
 * Whether to mint is decided by the caller from the state *after* applyAction,
 * because an identity claimed by this very action (INIT_GAME, REGISTER_PLAYER)
 * has no hash yet.
 *
 * @param {object} state hydrated room state
 * @param {object} action
 * @param {(token: string) => Promise<string>} [hash]
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function verifyActor(state, action, hash = hashToken) {
  const actorId = action?.actorId ?? action?.playerId;
  if (!actorId) return { ok: false, reason: 'no_actor' };

  const hashes = state?.actorTokens?.[actorId] ?? [];
  if (hashes.length === 0) return { ok: true };

  const token = action?.token;
  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, reason: 'missing_token' };
  }
  return hashes.includes(await hash(token))
    ? { ok: true }
    : { ok: false, reason: 'bad_token' };
}

/**
 * Remember a token hash for an actor. Keeps the most recent hashes only: two
 * frames of the same browser can claim in the same tick (before either sees the
 * other's token), and both must stay valid.
 * @param {object} state
 * @param {string} actorId
 * @param {string} hash
 */
export function rememberTokenHash(state, actorId, hash) {
  if (!actorId) return state;
  const tokens = state?.actorTokens ?? {};
  const hashes = [hash, ...(tokens[actorId] ?? []).filter(h => h !== hash)];
  return {
    ...state,
    actorTokens: { ...tokens, [actorId]: hashes.slice(0, MAX_TOKEN_HASHES) },
  };
}

/**
 * True when this action id was already applied. Clients that predate the guard
 * send no id, so their behaviour is unchanged.
 * @param {object} state
 * @param {string|undefined} actionId
 */
export function isDuplicateAction(state, actionId) {
  if (!actionId) return false;
  return (state?.lastActionIds ?? []).includes(actionId);
}

/** Record an action id, keeping the ring bounded. */
export function rememberActionId(state, actionId) {
  if (!actionId) return state;
  const ids = [...(state?.lastActionIds ?? []), actionId];
  return {
    ...state,
    lastActionIds: ids.length > MAX_ACTION_IDS ? ids.slice(-MAX_ACTION_IDS) : ids,
  };
}
