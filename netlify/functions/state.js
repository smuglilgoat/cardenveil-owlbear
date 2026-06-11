import supabase from './_supabaseClient.js';
import { applyAction, hydrateState, dehydrateState, createInitialGameState } from './_gameLogic.js';

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

    const { data: existing, error } = await supabase
      .from('game_rooms')
      .select('version, state')
      .eq('room_id', roomId)
      .single();

    let currentVersion = 0;
    let currentState;

    if (existing && !error) {
      currentVersion = existing.version;
      currentState = hydrateState(existing.state);
    } else {
      currentState = createInitialGameState();
    }

    const { state: newState } = applyAction(currentState, action);
    const dehydrated = dehydrateState(newState);
    const newVersion = currentVersion + 1;

    const { error: upsertError } = await supabase
      .from('game_rooms')
      .upsert({
        room_id: roomId,
        version: newVersion,
        state: dehydrated,
        updated_at: new Date().toISOString(),
      });

    if (upsertError) {
      return json({ error: upsertError.message }, 500);
    }

    return json({ version: newVersion, state: dehydrated }, 200, {
      'ETag': String(newVersion),
    });
  }

  return json({ error: 'Method not allowed' }, 405);
};
