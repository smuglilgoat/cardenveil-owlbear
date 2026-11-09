/**
 * @jest-environment node
 *
 * Integration test of the real write path: the Netlify handler is driven with a
 * mocked Supabase client (in-memory `game_rooms` row + a CAS emulation for
 * `apply_game_action`). This is the layer that decides whether a write is
 * applied at all — a wrong splice here locks the whole table out or lets an
 * action be applied twice, and no pure-logic test would notice.
 */
import { jest } from '@jest/globals';

let fake = null;

jest.unstable_mockModule('../../netlify/functions/_supabaseClient.js', () => ({
  default: {
    from: () => fake.from(),
    rpc: (name, args) => fake.rpc(name, args),
  },
}));

function makeFakeSupabase(initialRow = null) {
  const rpcCalls = [];
  let row = initialRow;
  let fromCalls = 0;
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: async () =>
      row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } },
  };
  return {
    rpcCalls,
    getRow: () => row,
    getFromCalls: () => fromCalls,
    from: () => {
      fromCalls++;
      return chain;
    },
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      const currentVersion = row?.version ?? 0;
      if (currentVersion !== args.p_expected_version) {
        return { data: { conflict: true, version: currentVersion, state: row?.state ?? null }, error: null };
      }
      row = { version: args.p_new_version, state: args.p_state };
      return { data: { conflict: false }, error: null };
    },
  };
}

const handler = (await import('../../netlify/functions/state.js')).default;

function post(action) {
  return handler(
    new Request('https://example.test/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: 'room-1', action }),
    })
  );
}

const bodyOf = async (res) => JSON.parse(await res.text());

describe('netlify /api/state write path', () => {
  beforeEach(() => {
    fake = null;
    process.env.RECOVERY_SECRET = 'owner-secret';
  });

  it('answers GET with 410 Gone without touching the database', async () => {
    // The read path lives in Supabase. A stale bundle still polling here must
    // get a permanent answer (410, never retried) and cost no query.
    fake = makeFakeSupabase();
    const res = await handler(
      new Request('https://example.test/api/state?roomId=room-1', { method: 'GET' })
    );
    const body = await bodyOf(res);

    expect(res.status).toBe(410);
    expect(body.error).toBe('deprecated');
    expect(body.message).toMatch(/Supabase/);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(fake.getFromCalls()).toBe(0);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('mints a token on a first write and stores only its hash', async () => {
    fake = makeFakeSupabase();
    const res = await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1' });
    const body = await bodyOf(res);

    expect(res.status).toBe(200);
    expect(body.token).toMatch(/^[0-9a-f]{64}$/);

    const stored = fake.getRow().state;
    expect(stored.actorTokens.p1).toHaveLength(1);
    expect(stored.actorTokens.p1[0]).not.toBe(body.token);
    // the raw token must never reach the broadcast row
    expect(JSON.stringify(stored)).not.toContain(body.token);
  });

  it('rejects a registered actor that presents no token', async () => {
    fake = makeFakeSupabase();
    const first = await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1' });
    await bodyOf(first);

    const res = await post({ type: 'DRAW', playerId: 'p1' });
    const body = await bodyOf(res);

    expect(res.status).toBe(401);
    expect(body.reason).toBe('missing_token');
    expect(fake.rpcCalls).toHaveLength(1); // only the first write hit the RPC
  });

  it('rejects a spoofed player id', async () => {
    fake = makeFakeSupabase();
    await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1' });
    const p2 = await bodyOf(await post({ type: 'REGISTER_PLAYER', playerId: 'p2', name: 'P2' }));

    // p2 holds a valid token for itself, but acts as p1
    const res = await post({ type: 'DRAW', playerId: 'p1', actorId: 'p1', actorToken: p2.token });

    expect(res.status).toBe(401);
    expect((await bodyOf(res)).reason).toBe('bad_token');
  });

  it('accepts the right token and applies the action', async () => {
    fake = makeFakeSupabase();
    const { token } = await bodyOf(await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1' }));

    const res = await post({ type: 'DRAW', playerId: 'p1', actorId: 'p1', actorToken: token });
    const body = await bodyOf(res);

    expect(res.status).toBe(200);
    expect(body.state.players.p1.hand).toHaveLength(1);
  });

  it('applies a token action instead of dropping it on the credential field', async () => {
    // Issue #16: the credential used to be written into `token`, the very field
    // that carries the token TYPE, so every token action was a silent no-op on
    // the server while the client showed it optimistically.
    fake = makeFakeSupabase();
    const { token } = await bodyOf(await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1' }));
    const before = (await bodyOf(await post({ type: 'DRAW', playerId: 'p1', actorToken: token }))).state;

    const res = await post({
      type: 'SPEND_TOKEN', playerId: 'p1', actorId: 'p1', token: 'force', actorToken: token,
    });
    const body = await bodyOf(res);

    expect(res.status).toBe(200);
    const spent = body.state.players.p1.tokens.force;
    expect(spent).toBe(3 - 1);
    expect(spent).toBeLessThan(before.players.p1.tokens.force ?? 4);
  });

  it('applies a GM token edit to another player', async () => {
    fake = makeFakeSupabase();
    const init = await bodyOf(await post({ type: 'INIT_GAME', playerId: 'gm-1' }));
    await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1' });

    const res = await post({
      type: 'SET_TOKENS', playerId: 'gm-1', actorId: 'gm-1', targetId: 'p1',
      token: 'force', val: 1, actorToken: init.token,
    });
    const body = await bodyOf(res);

    expect(res.status).toBe(200);
    expect(body.state.players.p1.tokens.force).toBe(1);
  });

  it('applies a replayed actionId only once', async () => {
    fake = makeFakeSupabase();
    const { token } = await bodyOf(await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1' }));

    const action = { type: 'DRAW', playerId: 'p1', actorId: 'p1', actorToken: token, actionId: 'dup-1' };
    const first = await bodyOf(await post(action));
    const rpcAfterFirst = fake.rpcCalls.length;

    const replay = await bodyOf(await post(action));

    expect(first.state.players.p1.hand).toHaveLength(1);
    expect(replay.state.players.p1.hand).toHaveLength(1);
    expect(rpcAfterFirst).toBe(2); // REGISTER_PLAYER + DRAW
    expect(fake.rpcCalls).toHaveLength(rpcAfterFirst); // the replay wrote nothing
  });

  it('keeps working for a client that predates the guard (no actionId, claimed record)', async () => {
    fake = makeFakeSupabase();
    const { token } = await bodyOf(await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1' }));

    const res = await post({ type: 'DRAW', playerId: 'p1', actorToken: token });
    expect(res.status).toBe(200);
  });

  it('issues, then requires, a token for a GM who has no player record', async () => {
    fake = makeFakeSupabase();
    const init = await bodyOf(await post({ type: 'INIT_GAME', playerId: 'gm-1' }));

    expect(init.token).toMatch(/^[0-9a-f]{64}$/);
    expect(fake.getRow().state.players).toEqual({});
    expect(fake.getRow().state.actorTokens['gm-1']).toHaveLength(1);

    // The reset is the way back from a refused credential: it goes through
    // without one, because it drops the stored hashes — every client re-claims
    // on its next write. The reducer still ignores a reset that does not come
    // from the room's GM.
    const allowed = await bodyOf(await post({ type: 'HARD_RESET', playerId: 'gm-1' }));
    expect(allowed.state.gmId).toBe('gm-1');
    expect(allowed.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('drops player hashes on HARD_RESET so clients can claim again (recovery path)', async () => {
    fake = makeFakeSupabase();
    const init = await bodyOf(await post({ type: 'INIT_GAME', playerId: 'gm-1' }));
    const p1 = await bodyOf(await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1' }));
    expect(fake.getRow().state.actorTokens['p1']).toHaveLength(1);

    const reset = await bodyOf(
      await post({ type: 'HARD_RESET', playerId: 'gm-1', actorId: 'gm-1', actorToken: init.token })
    );

    // HARD_RESET recreates the player records, so every player identity is
    // unclaimed again — while the GM running it is issued a fresh token.
    expect(reset.state.actorTokens['p1']).toBeUndefined();
    expect(reset.state.actorTokens['gm-1']).toHaveLength(1);
    expect(reset.state.actorTokens['gm-1'][0]).not.toBe(init.token);

    const reclaimed = await bodyOf(await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1' }));
    expect(reclaimed.token).toMatch(/^[0-9a-f]{64}$/);
    expect(reclaimed.token).not.toBe(p1.token);
  });

  it('lets the GM reset the table even when their own credential is refused', async () => {
    fake = makeFakeSupabase();
    await post({ type: 'INIT_GAME', playerId: 'gm-1' });

    // The GM's credential is gone: the room keeps the hash, the client has no
    // token — every write is refused.
    const stale = 'a'.repeat(64);
    const refused = await post({
      type: 'REGISTER_PLAYER',
      playerId: 'p1',
      name: 'P1',
      actorId: 'gm-1',
      actorToken: stale,
    });
    expect(refused.status).toBe(401);
    expect((await bodyOf(refused)).reason).toBe('bad_token');

    // The reset is the way back: it goes through even with the refused
    // credential, and it drops the stored hashes.
    const reset = await bodyOf(await post({ type: 'HARD_RESET', playerId: 'gm-1', actorId: 'gm-1' }));
    // The GM gets a fresh credential; every other identity is unclaimed again
    // and re-claims on its next write.
    expect(reset.state.actorTokens['gm-1']).toHaveLength(1);
    expect(reset.state.actorTokens['p1']).toBeUndefined();

    // The GM is back in with a fresh credential.
    const ok = await post({
      type: 'REGISTER_PLAYER',
      playerId: 'p1',
      name: 'P1',
      actorId: 'gm-1',
      actorToken: reset.token,
    });
    expect(ok.status).toBe(200);
  });

  it('a reset that does not come from the room GM changes nothing', async () => {
    fake = makeFakeSupabase();
    const init = await bodyOf(await post({ type: 'INIT_GAME', playerId: 'gm-1' }));
    await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1', actorId: 'gm-1', actorToken: init.token });
    const before = fake.getRow().state;

    const stranger = await bodyOf(await post({ type: 'HARD_RESET', playerId: 'stranger', actorId: 'stranger' }));
    expect(stranger.state.gmId).toBe('gm-1');
    expect(fake.getRow().state.logs).toEqual(before.logs);
  });
});
