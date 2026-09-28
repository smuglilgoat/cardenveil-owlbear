import { groupDiceByRoll, meshDefsFor, rollValueForGroup, MAX_VISIBLE_DICE, visibleRollChip } from '../../src/lib/diceRoll.js';

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

  it('caps displayed die chips and summarizes the rest', () => {
    expect(visibleRollChip(6, 6, MAX_VISIBLE_DICE - 1, 20)).toMatchObject({ value: 6, crit: true });
    expect(visibleRollChip(3, 6, MAX_VISIBLE_DICE, 20)).toEqual({ more: 5 });
    expect(visibleRollChip(3, 6, MAX_VISIBLE_DICE + 1, 20)).toBeNull();
  });
});
