import { jest } from '@jest/globals';

const { identityResetSql } = await import('../../src/lib/credentialRecovery.js');

describe('identityResetSql', () => {
  it('targets the room and clears the credential hashes', () => {
    const sql = identityResetSql('room-1');
    expect(sql).toContain("where room_id = 'room-1';");
    expect(sql).toContain("jsonb_set(state, '{actorTokens}', '{}'::jsonb, true)");
    // The version MUST move: a client whose cached version is not older
    // ignores the row.
    expect(sql).toContain('version = version + 1');
  });

  it('touches nothing else', () => {
    const sql = identityResetSql('room-1');
    expect(sql).not.toContain('delete');
    expect(sql).not.toContain('players');
    expect(sql).not.toContain('logs');
  });

  it('is empty without a room', () => {
    expect(identityResetSql('')).toBe('');
    expect(identityResetSql(null)).toBe('');
  });
});
