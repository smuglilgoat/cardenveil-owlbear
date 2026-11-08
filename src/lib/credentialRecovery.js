/**
 * Recovery of a table whose player identities the server refuses.
 *
 * The write guard stores a hash of each actor's credential in the room state
 * (`state.actorTokens`). A client whose credential no longer matches is
 * refused, and it cannot re-claim on its own: HARD_RESET is an ordinary write
 * and the guard refuses it too when the GM is the stale client. The way out is
 * owner-level — one UPDATE that clears the hashes, after which every client
 * re-claims on its next write.
 *
 * Runbook: docs/credential-recovery.md.
 */

/**
 * The owner's SQL that clears the room's stored credential hashes.
 * @param {string} roomId
 * @returns {string} '' when the room is unknown
 */
export function identityResetSql(roomId) {
  if (!roomId) return '';
  return (
    `-- Remet à zéro les identifiants de la table ${roomId}\n` +
    `-- (le propriétaire de la table exécute ce SQL dans l'éditeur SQL de Supabase)\n` +
    `update game_rooms\n` +
    `   set state  = jsonb_set(state, '{actorTokens}', '{}'::jsonb, true),\n` +
    `       version = version + 1\n` +
    ` where room_id = '${roomId}';`
  );
}
