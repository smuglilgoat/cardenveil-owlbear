import { groupDiceByRoll, meshDefsFor, rollValueForGroup } from '../../src/lib/diceRoll.js';

describe('3D dice result grouping', () => {
  it('keeps each die in a multi-die term as a separate result', () => {
    const defs = meshDefsFor([{ count: 4, sides: 6 }]);
    const dice = defs.map((def) => ({ def }));
    const groups = groupDiceByRoll(dice);
    const faces = ['1', '2', '4', '6'];
    const rolls = groups.map((group) => rollValueForGroup(group, (die) => faces[die.def.rollIndex]));

    expect(rolls).toEqual([1, 2, 4, 6]);
    expect(rolls.reduce((sum, value) => sum + value, 0)).toBe(13);
  });

  it('keeps percentile and ones dice paired for d100 rolls', () => {
    const defs = meshDefsFor([{ count: 2, sides: 100 }]);
    const groups = groupDiceByRoll(defs.map((def) => ({ def })));
    const face = (die) => die.def.type === 'd100' ? '0' : die.def.rollIndex === 0 ? '0' : '4';

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => rollValueForGroup(group, face))).toEqual([100, 4]);
  });
});
