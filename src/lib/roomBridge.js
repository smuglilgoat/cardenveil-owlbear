/**
 * Command channel between the standalone sheet tab (issue #14) and the room's
 * Owlbear frames.
 *
 * WHY NOT BroadcastChannel: a tab on the plugin's origin and the Owlbear frames
 * (same origin, but embedded in www.owlbear.rodeo) do NOT share a storage
 * partition. Chrome partitions BroadcastChannel AND localStorage by top-level
 * site, measured in this repo: a cross-site iframe receives neither the
 * parent's BroadcastChannel messages nor its localStorage. So the tab can
 * neither talk to the frames in-browser nor borrow their actor credential.
 *
 * Supabase is a network hop, so it crosses that boundary. The tab INSERTs a
 * command; the room's frames read it over postgres_changes and act with their
 * OWN credentials — the tab never writes game_rooms.
 */
import { supabase } from './supabaseClient.js';
import { signCommand } from './commandSecret.js';
import { logEvent } from './appLog.js';

export const COMMAND_ROLL = 'roll';
export const COMMAND_ACTION = 'action';

/** A command older than this is stale (the tab closed before the frames read
 *  it, or the row was left behind) and must not be executed. */
export const COMMAND_MAX_AGE_MS = 30000;

/**
 * Send a command to the room's frames.
 *
 * The command is SIGNED with the secret the room handed to the tab: the table
 * is writable by anyone holding the public anon key, so an unsigned command
 * would let anyone act as the tab's owner.
 *
 * @param {string} roomId
 * @param {string} kind - COMMAND_ROLL | COMMAND_ACTION
 * @param {object} payload
 * @param {string} secret - the room's command secret
 * @returns {Promise<{id: string}>}
 */
export async function publishCommand(roomId, kind, payload, secret) {
  // The timestamp lives INSIDE the signed payload: `created_at` is assigned
  // by the server but writable by the inserter, so it cannot be what proves a
  // command is fresh. A captured command replayed later keeps its old ts and
  // is refused as stale.
  const signed = { ...payload, ts: Date.now() };
  const command = { kind, room_id: roomId, payload: signed };
  const signature = await signCommand(secret, command);
  const { data, error } = await supabase
    .from('room_commands')
    .insert({ room_id: roomId, kind, payload: signed, signature })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Delete a command once it has been delivered (the frames read it over
 * Realtime, which fires before the insert resolves on the sender's side).
 * @param {string} id
 */
export function discardCommand(id) {
  if (!id) return Promise.resolve();
  return supabase.from('room_commands').delete().eq('id', id).then(() => {});
}

/**
 * Listen to the room's commands.
 * @param {string} roomId
 * @param {(command: {id: string, kind: string, payload: any, created_at: string}) => void} callback
 * @returns {() => void} unsubscribe
 */
export function onCommand(roomId, callback) {
  const channel = supabase
    .channel(`commands:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'room_commands',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => callback(payload.new)
    );
  channel.subscribe((status) => {
    // A command that is never delivered must be diagnosable, not silent.
    if (status === 'SUBSCRIBED') return;
    logEvent('warn', 'command_channel_status', { message: String(status) });
  });
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * True when a command is too old to be worth executing. The timestamp is the
 * SIGNED one (payload.ts) — `created_at` comes from a column the inserter can
 * set, so it says nothing about freshness.
 */
export function isStaleCommand(command, now = Date.now()) {
  const ts = Number(command?.payload?.ts);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  return now - ts > COMMAND_MAX_AGE_MS;
}
