import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/lib/supabaseClient.js', () => ({
  supabase: { from: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() }
}));

const { rollAttack, attackPreview, pickAttackWeapon, weaponFlags, engagementStat } = await import('../../src/lib/attackRoll.js');

// Deterministic RNG: `rolls` is the list of die outcomes consumed in order
// across the whole attack (initial pool, then each explosion). Uniform in
// [0,1) so floor(rng()*sides)+1 hits the exact face (values too close to a
// face boundary would round down).
function withRolls(rolls, sides, fn) {
  let i = 0;
  const rng = () => {
    if (i >= rolls.length) throw new Error('roll queue exhausted');
    // uniform point at the middle of the queued face's slot: floor(v*sides) === face−1
    // (v = (face−0.5)/sides — exact regardless of die size)
    return (rolls[i++] - 0.5) / sides;
  };
  return fn(rng);
}

const die = (sides, face) => 1 + Math.floor(((face - 1) / 1e9) * sides);

const stats = { force: 16, agilite: 14, esprit: 10, social: 10 }; // mods +3/+2/0
const noMiss = (w) => ({ ...w, seuilMiss: 0 });

describe('pickAttackWeapon (panel selection)', () => {
  const hache = { nom: 'Grande hache', equipped: true, hand: 'main' };
  const dagueMain = { nom: 'Dague', equipped: true, hand: 'main' };
  const dagueOff = { nom: 'Dague', equipped: true, hand: 'off' };

  it('resolves a two-handed weapon equipped alone', () => {
    expect(pickAttackWeapon([hache]).weapon).toBe(hache);
  });

  it('resolves an off-hand-only equipped weapon', () => {
    expect(pickAttackWeapon([{ nom: 'Dague', equipped: true, hand: 'off' }]).weapon).toMatchObject({ hand: 'off' });
  });

  it('falls back to the main hand when the saved name is stale (no longer equipped)', () => {
    // saved attack used the hache, sheet now has only the dagger equipped
    expect(pickAttackWeapon([dagueMain, { nom: 'Grande hache', equipped: false }], 'Grande hache').weapon).toBe(dagueMain);
  });

  it('keeps the saved weapon when still equipped', () => {
    expect(pickAttackWeapon([dagueMain, dagueOff], 'Dague').weapon).toBe(dagueMain);
  });

  it('prefers main hand over array order when no name is set', () => {
    const off = { nom: 'Dague', equipped: true, hand: 'off' };
    expect(pickAttackWeapon([off, dagueMain]).weapon).toBe(dagueMain);
  });

  it('returns null with no equipped weapons', () => {
    expect(pickAttackWeapon([{ nom: 'Dague', equipped: false }]).weapon).toBeNull();
    expect(pickAttackWeapon([]).weapon).toBeNull();
  });

  it('returns the equipped list for the dropdown', () => {
    expect(pickAttackWeapon([{ nom: 'X' }, dagueMain, hache]).equipped).toEqual([dagueMain, hache]);
  });
});

describe('weaponFlags / engagementStat', () => {
  it('detects Finesse, Catalyseur and Hache (Brutalité) flags', () => {
    expect(weaponFlags({ nom: 'Dague', proprietes: 'Finesse, Légère' })).toEqual({ finesse: true, catalyseur: false, hache: false });
    expect(weaponFlags({ nom: 'Grande hache', proprietes: 'Deux mains, Brutalité' })).toEqual({ finesse: false, catalyseur: false, hache: true });
    expect(weaponFlags({ nom: 'Focus', proprietes: 'Distance, Catalyseur' })).toEqual({ finesse: false, catalyseur: true, hache: false });
  });

  it('maps engagement stat per weapon type', () => {
    expect(engagementStat({ proprietes: 'Finesse' })).toBe('agilite');
    expect(engagementStat({ proprietes: 'Catalyseur' })).toBe('esprit');
    expect(engagementStat({ proprietes: 'Deux mains, Brutalité' })).toBe('force');
  });

  it('reads properties from the accented key older sheets carry (propriétés)', () => {
    // weapon editor templates historically stored the key as `propriétés`
    const dagger = { nom: 'Dague', proprietes: undefined, 'propriétés': 'Finesse, Légère, Lancer (10m), Garde' };
    expect(engagementStat(dagger)).toBe('agilite');
    expect(weaponFlags(dagger)).toEqual({ finesse: true, catalyseur: false, hache: false });
  });

  it('detects Finesse on serpe / arcs / arbalètes (2026-09 rules update)', () => {
    for (const nom of ['Serpe', 'Arc court', 'Arc long', 'Arbalète de poing', 'Arbalète', 'Arbalète lourde']) {
      expect(weaponFlags({ nom, proprietes: 'Finesse' })).toMatchObject({ finesse: true });
    }
  });
});

describe('attackPreview', () => {
  it('counts dice per advantage level (1 + 2×level, keep max)', () => {
    const w = { de: '1d12', bonus: 5, proprietes: '' };
    expect(attackPreview(w, stats, { advantage: 2 })).toMatchObject({ level: 2, diceCount: 5, keep: 'max' });
    expect(attackPreview(w, stats, { advantage: 0 })).toMatchObject({ level: 0, diceCount: 1, keep: null });
    expect(attackPreview(w, stats, { advantage: -1 })).toMatchObject({ level: -1, diceCount: 3, keep: 'min' });
  });

  it('cancels advantage against disadvantage before engagement', () => {
    const w = { de: '1d12', bonus: 5, proprietes: '' };
    // +3 adv, −1 disadv → +2 net; then 1 engagement → +1 net (patch §1)
    expect(attackPreview(w, stats, { advantage: 2, engagement: 1 })).toMatchObject({ level: 1, diceCount: 3, keep: 'max' });
    // 2 adv - 1 eng = 1 adv
    expect(attackPreview(w, stats, { advantage: 2, engagement: 1 })).toMatchObject({ level: 1 });
    // 2 adv - 2 eng = neutral
    expect(attackPreview(w, stats, { advantage: 2, engagement: 2 })).toMatchObject({ level: 0, diceCount: 1, keep: null });
  });

  it('picks engagement stat mod per weapon type', () => {
    expect(attackPreview({ de: '1d8', proprietes: 'Finesse' }, stats, { engagement: 1 })).toMatchObject({ engagementStat: 'agilite', engagementMod: 2 });
    expect(attackPreview({ de: '1d8', proprietes: 'Catalyseur' }, stats, { engagement: 1 })).toMatchObject({ engagementStat: 'esprit', engagementMod: 0 });
    expect(attackPreview({ de: '1d8', proprietes: '' }, stats, { engagement: 1 })).toMatchObject({ engagementStat: 'force', engagementMod: 3 });
  });

  it('uses the accented propriétés key when deriving the engagement stat', () => {
    // Dagger from an older sheet: Finesse lives under `propriétés`
    const w = { de: '1d4', proprietes: undefined, 'propriétés': 'Finesse, Légère, Lancer (10m), Garde' };
    expect(attackPreview(w, stats, { engagement: 1 })).toMatchObject({ engagementStat: 'agilite', engagementMod: 2, finesse: true });
  });

  it('returns null for a weapon without a die', () => {
    expect(attackPreview({ de: '' }, stats)).toBeNull();
  });

  it('accepts a BONUS ATT. override in place of the weapon bonus field', () => {
    const w = { de: '1d6', bonus: 2, proprietes: '' };
    expect(attackPreview(w, stats, { bonus: 7 }).weaponBonus).toBe(7);
    expect(attackPreview(w, stats, { bonus: '' }).weaponBonus).toBe(2); // empty = weapon field
    expect(attackPreview(w, stats).weaponBonus).toBe(2);
    // and the roll uses it: face 4 + bonus 7 = 11
    const r = withRolls([4], 6, (rng) => rollAttack(w, stats, { bonus: 7, rng }));
    expect(r.total).toBe(11);
  });
});

describe('rollAttack — basic resolution', () => {
  it('rolls 1 die and adds weapon bonus (doc §2 example: 8+5)', () => {
    const w = noMiss({ de: '1d12', bonus: 5, proprietes: '' });
    const r = withRolls([8], 12, (rng) => rollAttack(w, stats, { rng }));
    expect(r.total).toBe(8 + 5);
    expect(r.critCount).toBe(0);
  });

  it('misses when kept die ≤ seuilMiss → 0 damage (doc §3)', () => {
    const w = { de: '1d6', bonus: 5, proprietes: '', seuilMiss: 5 };
    const r = withRolls([3], 6, (rng) => rollAttack(w, stats, { rng }));
    expect(r.miss).toBe(true);
    expect(r.total).toBe(0);
  });

  it('crits on max face and explodes (doc §4: 12→12→7)', () => {
    const w = noMiss({ de: '1d12', bonus: 5, proprietes: '' });
    const r = withRolls([12, 12, 7], 12, (rng) => rollAttack(w, stats, { rng }));
    expect(r.critCount).toBe(2);
    expect(r.total).toBe(12 + 12 + 7 + 5);
    expect(r.breakdown.join('\n')).toContain('Critiques : 2');
  });

  it('keeps max of the pool with advantage (doc §5: 5d12 example)', () => {
    const w = noMiss({ de: '1d12', bonus: 0, proprietes: '' });
    // 5 dice, kept = max = 12 → crit → 3d12 keep max (12 again) → 1d12 → 1d12
    const r = withRolls([4, 12, 7, 9, 3, 3, 12, 2, 5], 12, (rng) => rollAttack(w, stats, { advantage: 2, rng }));
    expect(r.stages[0].pool).toBe(5);
    expect(r.stages[0].kept).toBe(12);
    // explosion pools: 3 then 1 then 1
    expect(r.stages[1].pool).toBe(3);
    expect(r.stages[2].pool).toBe(1);
    expect(r.critCount).toBeGreaterThanOrEqual(2);
  });

  it('repeats the bonus once per crit only for Finesse (doc §10: 46 total)', () => {
    const wFinesse = noMiss({ de: '1d12', bonus: 5, proprietes: 'Finesse' });
    const wNormal = noMiss({ de: '1d12', bonus: 5, proprietes: '' });
    const rolls = [12, 12, 7];
    const rf = withRolls(rolls, 12, (rng) => rollAttack(wFinesse, stats, { rng }));
    const rn = withRolls(rolls, 12, (rng) => rollAttack(wNormal, stats, { rng }));
    // normal: 12+12+7+5 = 36; finesse: 12+12+7 +5×(1+2) = 46
    expect(rn.total).toBe(36);
    expect(rf.total).toBe(46);
  });

  it('engagement adds 1 désavantage + flat stat mod (doc §13: d12 f Minh 3d12)', () => {
    const w = noMiss({ de: '1d12', bonus: 5, proprietes: '' });
    // 3d12 keep min: dice 8, 2, 6 → kept 2 → damage 2 + 5 + 3 (force)
    const r = withRolls([8, 2, 6], 12, (rng) => rollAttack(w, stats, { engagement: 1, rng }));
    expect(r.stages[0].pool).toBe(3);
    expect(r.stages[0].keep).toBe('min');
    expect(r.stages[0].kept).toBe(2);
    expect(r.total).toBe(2 + 5 + 3);
    expect(r.level).toBe(-1);
  });

  it('engagement reduces advantage net level (doc §12: 2 adv + 1 eng → 3d keep max, +3 dmg)', () => {
    const w = noMiss({ de: '1d12', bonus: 5, proprietes: '' });
    const r = withRolls([4, 12, 7, 3, 6, 2], 12, (rng) => rollAttack(w, stats, { advantage: 2, engagement: 1, rng }));
    expect(r.stages[0].pool).toBe(3);
    expect(r.stages[0].keep).toBe('max');
    expect(r.stages[0].kept).toBe(12);
    // kept 12 = crit → explosion with 1 remaining adv level → 3d12 [7,?…] keep max
    expect(r.critCount).toBeGreaterThanOrEqual(1);
    expect(r.total).toBeGreaterThanOrEqual(12 + 5 + 3);
  });

  it('finesse repeats engagement mods per crit (patch §2: ds + 33)', () => {
    // d12 finesse, +5 weapon, agi +2, 2 engagements, 2 crits
    const w = noMiss({ de: '1d12', bonus: 5, proprietes: 'Finesse' });
    // initial kept max round 1 = 12 (crit), pool 5→3→1: rolls 12 (crit), 12 (crit), 7
    const r = withRolls([12, 12, 12, 12, 12, 12, 7], 12, (rng) => rollAttack(w, stats, { engagement: 2, rng }));
    // kept min of all-12s → min(12s) = 12 = crit ; désavantage explosions are
    // plain 1dX (§9) — 12 again → crit, 7 ends the chain. critCount 2.
    // bonus per crit: 5 + (2×2 agi) = 9 ; repeated ×(1+2 crits) = 27
    expect(r.total).toBe(12 + 12 + 7 + (5 + 4) * 3);
    expect(r.critCount).toBe(2);
  });

  it('axe explodes 2dX summed and chains on doubles (doc §17)', () => {
    const w = noMiss({ de: '1d6', bonus: 0, proprietes: 'Brutalité' });
    // initial 6 → crit → explosion 4+3=7 (no double, chain ends)
    const r = withRolls([6, 4, 3], 6, (rng) => rollAttack(w, stats, { rng }));
    expect(r.critCount).toBe(1);
    expect(r.total).toBe(6 + 7);
    expect(r.hache).toBe(true);
  });

  it('axe double chains another 2dX explosion (doc §17)', () => {
    const w = noMiss({ de: '1d6', bonus: 0, proprietes: 'Brutalité' });
    // 6 → crit → 2+2 double → crit → 5+1=6 no double → end
    const r = withRolls([6, 2, 2, 5, 1], 6, (rng) => rollAttack(w, stats, { rng }));
    expect(r.critCount).toBe(2);
    expect(r.total).toBe(6 + 4 + 6);
  });

  it('axe with advantage: pools apply to initial roll only (doc §18)', () => {
    const w = noMiss({ de: '1d6', bonus: 0, proprietes: 'Brutalité' });
    // 3 advantages → 7 dice initial, kept max 6 → crit → explosion is 2d6 (not 5d6)
    const r = withRolls([1, 2, 3, 4, 5, 6, 2, 3, 4], 6, (rng) => rollAttack(w, stats, { advantage: 3, rng }));
    expect(r.stages[0].pool).toBe(7);
    expect(r.stages[1].pool).toBe(2);
    expect(r.hache).toBe(true);
  });

  it('disadvantage crits explode with a plain 1dX (doc §9)', () => {
    const w = noMiss({ de: '1d12', bonus: 2, proprietes: '' });
    // 3d12 keep min, rolls 12, 5, 12 → kept min = 5? no: min(12,5,12)=5 → no crit. Use: 12,1,1 →
    // min(12,1,1) = 1. Hmm. Desadvantage with a crit means kept = max face
    // AND min → all dice must be 12.
    const r = withRolls([12, 12, 12, 7], 12, (rng) => rollAttack(w, stats, { advantage: -1, rng }));
    expect(r.stages[0].keep).toBe('min');
    expect(r.stages[0].kept).toBe(12);
    expect(r.stages[1].pool).toBe(1); // désavantage explosion = 1dX
    expect(r.critCount).toBeGreaterThanOrEqual(1);
  });

  it('miss check only applies to the initial roll, never explosions', () => {
    const w = { de: '1d6', bonus: 0, proprietes: '', seuilMiss: 6 };
    // kept 6 ≤ 6 → miss on initial despite "crit" face
    const r = withRolls([6], 6, (rng) => rollAttack(w, stats, { rng }));
    expect(r.miss).toBe(true);
  });

  it('builds the §20 breakdown with stages, crit count and equation', () => {
    const w = noMiss({ de: '1d12', bonus: 5, proprietes: 'Finesse' });
    const r = withRolls([12, 12, 7], 12, (rng) => rollAttack(w, stats, { rng }));
    const text = r.breakdown.join('\n');
    expect(text).toMatch(/Jet : 1d12/);
    expect(text).toMatch(/Critiques : 2/);
    expect(text).toMatch(/Calcul : 12 \+ 12 \+ 7 \+ 15/);
    expect(text).toMatch(/Dégâts : 46/);
  });
});
