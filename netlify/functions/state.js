import { getStore } from '@netlify/blobs';
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

  const store = getStore('cardenveil-state');

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const roomId = url.searchParams.get('roomId');
    if (!roomId) return json({ error: 'roomId required' }, 400);

    const data = await store.get(`game:${roomId}`, { consistency: 'strong' });
    if (!data) return json({ version: 0, state: null });

    const blob = JSON.parse(data);
    const clientVersion = request.headers.get('If-None-Match');
    if (clientVersion && String(blob.version) === clientVersion) {
      return new Response(null, { status: 304, headers: corsHeaders() });
    }

    return json({ version: blob.version, state: blob.state }, 200, {
      'ETag': String(blob.version),
    });
  }

  if (request.method === 'POST') {
    const body = await request.json();
    const { roomId, action } = body;
    if (!roomId || !action) return json({ error: 'roomId and action required' }, 400);

    const key = `game:${roomId}`;
    const data = await store.get(key, { consistency: 'strong' });
    let currentVersion = 0;
    let currentState;

    if (data) {
      const blob = JSON.parse(data);
      currentVersion = blob.version;
      currentState = hydrateState(blob.state);
    } else {
      currentState = createInitialGameState();
    }

    const { state: newState } = applyAction(currentState, action);
    const dehydrated = dehydrateState(newState);
    const newVersion = currentVersion + 1;

    await store.set(key, JSON.stringify({ version: newVersion, state: dehydrated }));

    return json({ version: newVersion, state: dehydrated }, 200, {
      'ETag': String(newVersion),
    });
  }

  return json({ error: 'Method not allowed' }, 405);
};
