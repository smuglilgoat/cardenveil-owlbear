/**
 * @jest-environment node
 *
 * node (not jsdom): these guards use WebCrypto's `subtle`, which jsdom does
 * not implement but every runtime we deploy to does (browser, Node, Deno).
 */
import {
  mintToken,
  hashToken,
  verifyActor,
  rememberTokenHash,
  isDuplicateAction,
  rememberActionId,
  MAX_ACTION_IDS,
} from '../../src/lib/actionGuard.js';
import {
  createInitialGameState,
  createEmptyPlayer,
  hydrateState,
  dehydrateState,
} from '../../netlify/functions/_gameLogic.js';

function stateWithActor(id, tokenHashes) {
  const state = createInitialGameState();
  state.players = { [id]: createEmptyPlayer('Player') };
  if (tokenHashes.length > 0) state.actorTokens = { [id]: tokenHashes };
  return state;
}

function stateWithGm(gmId, tokenHashes) {
  const state = createInitialGameState();
  state.gmId = gmId;
  if (tokenHashes.length > 0) state.actorTokens = { [gmId]: tokenHashes };
  return state;
}

describe('actionGuard', () => {
  describe('mintToken', () => {
    it('mints a 256-bit hex token, different every time', () => {
      const a = mintToken();
      const b = mintToken();
      expect(a).toMatch(/^[0-9a-f]{64}$/);
      expect(a).not.toBe(b);
    });
  });

  describe('hashToken', () => {
    it('is deterministic and irreversible-looking', async () => {
      const token = mintToken();
      const h1 = await hashToken(token);
      const h2 = await hashToken(token);
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
      expect(h1).not.toBe(token);
      expect(await hashToken(mintToken())).not.toBe(h1);
    });
  });

  describe('verifyActor', () => {
    it('passes an action for an actor that has no record yet', async () => {
      const state = createInitialGameState();
      const verdict = await verifyActor(state, { type: 'DRAW', playerId: 'ghost' });
      expect(verdict).toEqual({ ok: true });
    });

    it('lets a first write pass for an actor with no token issued yet', async () => {
      const state = stateWithActor('p1', []);
      const verdict = await verifyActor(state, { type: 'DRAW', playerId: 'p1' });
      expect(verdict).toEqual({ ok: true });
    });

    it('rejects a registered actor that sends no token', async () => {
      const state = stateWithActor('p1', [await hashToken('secret')]);
      const verdict = await verifyActor(state, { type: 'DRAW', playerId: 'p1' });
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toBe('missing_token');
    });

    it('rejects a wrong token', async () => {
      const state = stateWithActor('p1', [await hashToken('secret')]);
      const verdict = await verifyActor(state, { type: 'DRAW', playerId: 'p1', token: 'guessed' });
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toBe('bad_token');
    });

    it('accepts the right token', async () => {
      const token = mintToken();
      const state = stateWithActor('p1', [await hashToken(token)]);
      const verdict = await verifyActor(state, { type: 'DRAW', playerId: 'p1', token });
      expect(verdict).toEqual({ ok: true });
    });

    it('authenticates the actor, not the target — a GM acting on another player', async () => {
      const gmToken = mintToken();
      const victimToken = mintToken();
      const state = createInitialGameState();
      state.gmId = 'gm';
      state.players = { p1: createEmptyPlayer('P1') };
      state.actorTokens = {
        gm: [await hashToken(gmToken)],
        p1: [await hashToken(victimToken)],
      };

      // The GM's own token authorises the write against p1…
      const gmWrite = await verifyActor(state, {
        type: 'ADD_TOKEN', playerId: 'gm', targetId: 'p1', actorId: 'gm', token: gmToken,
      });
      expect(gmWrite.ok).toBe(true);

      // …and the victim's token does not, even with the GM's id spoofed.
      const spoofed = await verifyActor(state, {
        type: 'ADD_TOKEN', playerId: 'gm', targetId: 'p1', actorId: 'gm', token: victimToken,
      });
      expect(spoofed.ok).toBe(false);
    });

    it('rejects an action with no actor at all', async () => {
      const verdict = await verifyActor(createInitialGameState(), { type: 'DRAW' });
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toBe('no_actor');
    });
  });

  describe('rememberTokenHash', () => {
    it('prepends, de-duplicates and caps the hash list', async () => {
      let state = stateWithActor('p1', []);
      const hashes = [];
      for (let i = 0; i < 6; i++) {
        const h = await hashToken(`token-${i}`);
        hashes.push(h);
        state = rememberTokenHash(state, 'p1', h);
      }
      const stored = state.actorTokens.p1;
      expect(stored).toHaveLength(4);
      expect(stored[0]).toBe(hashes[5]);

      // re-remembering an existing hash moves it to the front, no duplicate
      state = rememberTokenHash(state, 'p1', hashes[3]);
      expect(state.actorTokens.p1.filter(h => h === hashes[3])).toHaveLength(1);
      expect(state.actorTokens.p1[0]).toBe(hashes[3]);
    });

    it('works for an identity with no player record (the GM)', () => {
      let state = stateWithGm('gm', []);
      state = rememberTokenHash(state, 'gm', 'abc');
      expect(state.actorTokens.gm).toEqual(['abc']);
    });

    it('keeps the last 4 hashes for two racing frames of one browser', () => {
      let state = stateWithActor('p1', []);
      for (const h of ['h1', 'h2', 'h3', 'h4', 'h5']) state = rememberTokenHash(state, 'p1', h);
      expect(state.actorTokens.p1).toHaveLength(4);
      expect(state.actorTokens.p1[0]).toBe('h5');
      expect(state.actorTokens.p1).not.toContain('h1');
    });
  });

  describe('idempotency', () => {
    it('ignores a repeated action id and keeps a bounded ring', () => {
      let state = createInitialGameState();
      expect(isDuplicateAction(state, 'a1')).toBe(false);

      state = rememberActionId(state, 'a1');
      expect(isDuplicateAction(state, 'a1')).toBe(true);
      expect(isDuplicateAction(state, 'a2')).toBe(false);

      for (let i = 0; i < MAX_ACTION_IDS * 2; i++) state = rememberActionId(state, `id-${i}`);
      expect(state.lastActionIds).toHaveLength(MAX_ACTION_IDS);
      expect(isDuplicateAction(state, 'id-0')).toBe(false);
      expect(isDuplicateAction(state, `id-${MAX_ACTION_IDS * 2 - 1}`)).toBe(true);
    });

    it('treats a missing id as neither duplicate nor remembered (old clients)', () => {
      const state = createInitialGameState();
      expect(isDuplicateAction(state, undefined)).toBe(false);
      expect(rememberActionId(state, undefined)).toBe(state);
    });

    it('survives the dehydrate/hydrate round trip', () => {
      const state = rememberActionId(createInitialGameState(), 'a1');
      const raw = dehydrateState(state);
      expect(raw.lastActionIds).toEqual(['a1']);
      expect(hydrateState(raw).lastActionIds).toEqual(['a1']);
      expect(hydrateState({ players: {} }).actorTokens).toEqual({});
    });

    it('defaults to an empty ring for rows written before the guard existed', () => {
      expect(hydrateState({ players: {} }).lastActionIds).toEqual([]);
    });
  });
});
