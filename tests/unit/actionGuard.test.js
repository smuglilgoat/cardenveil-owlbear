/**
 * @jest-environment node
 *
 * The write-path guard is idempotency only (2.10.2 dropped the actor token:
 * `game_rooms` is writable by anyone holding the public anon key, so the
 * credential guarded nothing and locked players out across localStorage
 * partitions).
 */
import { isDuplicateAction, rememberActionId, MAX_ACTION_IDS } from '../../src/lib/actionGuard.js';
import {
  createInitialGameState,
  hydrateState,
  dehydrateState,
} from '../../netlify/functions/_gameLogic.js';

describe('actionGuard', () => {
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
    });

    it('defaults to an empty ring for rows written before the guard existed', () => {
      expect(hydrateState({ players: {} }).lastActionIds).toEqual([]);
    });
  });
});
