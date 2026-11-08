#!/usr/bin/env node
/**
 * Mint a one-time recovery code for a table (the owner's tool).
 *
 * A GM whose actor credential the guard refuses cannot re-claim on their own:
 * HARD_RESET is an ordinary write and the guard refuses it too. This mints the
 * code that lets them back in. The code is scoped to one room and one identity
 * and expires (30 minutes by default).
 *
 * Usage:
 *   RECOVERY_SECRET=<secret> node scripts/mint-recovery-code.mjs --room <roomId> [--gm <gmId>] [--minutes 30]
 *
 * RECOVERY_SECRET must be the same value as the one the server functions hold
 * (`supabase secrets set RECOVERY_SECRET=... --project-ref <ref>` for the Edge
 * Function, and the Netlify environment variable of the same name for the
 * fallback). The room's GM id is read from the room state; `--gm` overrides it.
 */
import { mintRecoveryCode } from '../src/lib/recoveryCode.js';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const roomId = arg('room');
const minutes = Number(arg('minutes', '30'));
const secret = process.env.RECOVERY_SECRET || '';

if (!roomId) {
  console.error('Usage: RECOVERY_SECRET=... node scripts/mint-recovery-code.mjs --room <roomId> [--gm <gmId>] [--minutes 30]');
  process.exit(1);
}
if (!secret) {
  console.error('RECOVERY_SECRET is not set — it must match the server functions\u2019 secret.');
  process.exit(1);
}

async function roomGmId(id) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const res = await fetch(`${url}/rest/v1/game_rooms?room_id=eq.${encodeURIComponent(id)}&select=state`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0]?.state?.gmId ?? null;
}

const gmId = arg('gm') || (await roomGmId(roomId));
if (!gmId) {
  console.error(`Could not read the GM id of room ${roomId} — pass --gm <gmId>.`);
  process.exit(1);
}

const code = await mintRecoveryCode(secret, {
  roomId,
  gmId,
  exp: Date.now() + minutes * 60 * 1000,
});

console.log(`Room : ${roomId}`);
console.log(`GM   : ${gmId}`);
console.log(`Valid: ${minutes} minutes`);
console.log('');
console.log(code);
