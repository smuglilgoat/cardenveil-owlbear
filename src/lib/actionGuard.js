/**
 * Write-path guard shared by both server functions: idempotency only. Imported
 * by `netlify/functions/state.js` and `supabase/functions/action/index.ts` (via
 * the `_actionGuard.js` symlink) — never by the client bundle.
 *
 * WHY only idempotency: a retried action (this function committed but the
 * response was lost, and the client re-sent it to the Netlify fallback) must
 * not be applied twice.
 *
 * WHY no actor token: until 2.10.2 the first accepted write for an identity
 * minted a 256-bit credential that every later write had to echo. It guarded
 * nothing — `game_rooms` is writable by anyone holding the public anon key
 * (RLS is `true` for anon, and the key ships in the bundle) — and it locked out
 * every browser that did not hold the exact credential: a second browser, a
 * cleared storage, or the dev origin, whose localStorage is a different
 * partition from production's.
 */

/** How many recent action ids are remembered for de-duplication. */
export const MAX_ACTION_IDS = 50;

/**
 * True when this action id was already applied. Clients that send no id are
 * never treated as duplicates.
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
