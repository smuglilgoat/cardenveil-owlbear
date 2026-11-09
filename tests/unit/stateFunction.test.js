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

  it('accepts a write from a client that never presented a credential', async () => {
    // 2.10.2: the actor-token guard is gone. A browser that holds no credential
    // for an identity (a second browser, cleared storage, or the dev origin,
    // whose localStorage is a different partition) must still be able to play.
    fake = makeFakeSupabase();
    expect((await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1' })).status).toBe(200);

    const drawn = await bodyOf(await post({ type: 'DRAW', playerId: 'p1', actorId: 'p1' }));
    expect(drawn.state.players.p1.hand).toHaveLength(1);

    const replayed = await bodyOf(await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1' }));
    expect(replayed.state.players.p1.hand).toHaveLength(1);
  });

  it('applies a token action instead of dropping it on the token field', async () => {
    // Issue #16: the credential used to be written into `token`, the very field
    // that carries the token TYPE, so every token action was a silent no-op on
    // the server while the client showed it optimistically.
    fake = makeFakeSupabase();
    await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1' });
    const before = (await bodyOf(await post({ type: 'DRAW', playerId: 'p1' }))).state;

    const body = await bodyOf(
      await post({ type: 'SPEND_TOKEN', playerId: 'p1', actorId: 'p1', token: 'force' })
    );

    expect(body.state.players.p1.tokens.force).toBe(2);
    expect(body.state.players.p1.tokens.force).toBeLessThan(before.players.p1.tokens.force ?? 4);
  });

  it('applies a GM token edit to another player', async () => {
    fake = makeFakeSupabase();
    await post({ type: 'INIT_GAME', playerId: 'gm-1' });
    await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1' });

    const body = await bodyOf(
      await post({
        type: 'SET_TOKENS', playerId: 'gm-1', actorId: 'gm-1', targetId: 'p1',
        token: 'force', val: 1,
      })
    );

    expect(body.state.players.p1.tokens.force).toBe(1);
  });

  it('applies a replayed actionId only once', async () => {
    fake = makeFakeSupabase();
    await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1' });

    const action = { type: 'DRAW', playerId: 'p1', actorId: 'p1', actionId: 'dup-1' };
    const first = await bodyOf(await post(action));
    const rpcAfterFirst = fake.rpcCalls.length;

    const replay = await bodyOf(await post(action));

    expect(first.state.players.p1.hand).toHaveLength(1);
    expect(replay.state.players.p1.hand).toHaveLength(1);
    expect(rpcAfterFirst).toBe(2); // REGISTER_PLAYER + DRAW
    expect(fake.rpcCalls).toHaveLength(rpcAfterFirst); // the replay wrote nothing
  });

  it('keeps working for a client that sends no actionId', async () => {
    fake = makeFakeSupabase();
    await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1' });

    expect((await post({ type: 'DRAW', playerId: 'p1' })).status).toBe(200);
  });

  it('never stores a credential hash in the room state', async () => {
    fake = makeFakeSupabase();
    await post({ type: 'INIT_GAME', playerId: 'gm-1' });
    const body = await bodyOf(await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1' }));

    expect(body.token).toBeUndefined();
    expect(fake.getRow().state.actorTokens).toBeUndefined();
  });

  it('a reset that does not come from the room GM changes nothing', async () => {
    fake = makeFakeSupabase();
    await post({ type: 'INIT_GAME', playerId: 'gm-1' });
    await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1' });
    const before = fake.getRow().state;

    const stranger = await bodyOf(await post({ type: 'HARD_RESET', playerId: 'stranger', actorId: 'stranger' }));
    expect(stranger.state.gmId).toBe('gm-1');
    expect(fake.getRow().state.logs).toEqual(before.logs);
  });

  it('lets the room GM reset the table', async () => {
    fake = makeFakeSupabase();
    await post({ type: 'INIT_GAME', playerId: 'gm-1' });
    await post({ type: 'REGISTER_PLAYER', playerId: 'p1', name: 'P1' });

    const reset = await bodyOf(await post({ type: 'HARD_RESET', playerId: 'gm-1' }));
    expect(reset.state.gmId).toBe('gm-1');
    expect(reset.state.players.p1.hand).toHaveLength(0);
  });
});
