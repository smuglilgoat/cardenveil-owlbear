import supabase from './_supabaseClient.js';
import { applyAction, hydrateState, dehydrateState, createInitialGameState } from './_gameLogic.js';
import {
  verifyActor,
  mintToken,
  hashToken,
  rememberTokenHash,
  isDuplicateAction,
  rememberActionId,
} from '../../src/lib/actionGuard.js';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(), ...extraHeaders },
  });
}

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const roomId = url.searchParams.get('roomId');
    if (!roomId) return json({ error: 'roomId required' }, 400);

    const { data, error } = await supabase
      .from('game_rooms')
      .select('version, state')
      .eq('room_id', roomId)
      .single();

    if (error || !data) return json({ version: 0, state: null });

    const clientVersion = request.headers.get('If-None-Match');
    if (clientVersion && String(data.version) === clientVersion) {
      return new Response(null, { status: 304, headers: corsHeaders() });
    }

    return json({ version: data.version, state: data.state }, 200, {
      'ETag': String(data.version),
    });
  }

  if (request.method === 'POST') {
    const body = await request.json();
    const { roomId, action } = body;
    if (!roomId || !action) return json({ error: 'roomId and action required' }, 400);

    const MAX_RETRIES = 10;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      const { data: existing, error } = await supabase
        .from('game_rooms')
        .select('version, state')
        .eq('room_id', roomId)
        .single();

      let currentVersion = 0;
      let currentState;

      if (error && error.code !== 'PGRST116') {
        return json({ error: error.message }, 500);
      }

      if (existing) {
        currentVersion = existing.version;
        currentState = hydrateState(existing.state);
      } else {
        currentState = createInitialGameState();
      }

      const actorId = action.actorId ?? action.playerId;

      // A retried action must not be applied twice: when the Edge Function
      // commits but its response is lost, the client re-sends it here.
      if (isDuplicateAction(currentState, action.actionId)) {
        return json({ version: currentVersion, state: existing?.state ?? dehydrateState(currentState) }, 200, {
          'ETag': String(currentVersion),
        });
      }

      const verdict = await verifyActor(currentState, action);
      if (!verdict.ok) {
        return json({ error: 'unauthorized', reason: verdict.reason }, 401);
      }

      const { state: appliedState } = applyAction(currentState, action);
      // Mint for an identity that has no hash yet — including one claimed by
      // this very action (INIT_GAME, REGISTER_PLAYER, CREATE_GM_CHAR). The GM
      // and the GM character act without a player record, so this checks both.
      const actorKnown = !!appliedState.players?.[actorId] || appliedState.gmId === actorId;
      const minted = actorKnown && (appliedState.actorTokens?.[actorId] ?? []).length === 0 ? mintToken() : null;
      let newState = rememberActionId(appliedState, action.actionId);
      if (minted) newState = rememberTokenHash(newState, actorId, await hashToken(minted));

      const dehydrated = dehydrateState(newState);
      const newVersion = currentVersion + 1;

      const { data: rpcData, error: rpcError } = await supabase.rpc('apply_game_action', {
        p_room_id: roomId,
        p_expected_version: currentVersion,
        p_new_version: newVersion,
        p_state: dehydrated,
      });

      if (rpcError) {
        return json({ error: rpcError.message }, 500);
      }

      if (rpcData && rpcData.conflict) {
        attempt++;
        if (attempt < MAX_RETRIES) {
          const delay = Math.min(100 * Math.pow(2, attempt), 2000);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return json({
          error: 'Conflict: version mismatch after max retries',
          version: rpcData.version,
          state: rpcData.state,
        }, 409);
      }

      return json({ version: newVersion, state: dehydrated, token: minted ?? undefined }, 200, {
        'ETag': String(newVersion),
      });
    }

    return json({ error: 'Conflict: unable to apply action after max retries' }, 409);
  }

  return json({ error: 'Method not allowed' }, 405);
};
