import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/lib/supabaseClient.js', () => ({
  supabase: {
    from: jest.fn(),
    channel: jest.fn(),
    removeChannel: jest.fn(),
  },
}));

// Import after mocking
const { isDiceFormula, parseDiceFormula, rollDice, statModifier } = await import('../../src/lib/characterSheet.js');

describe('Character Sheet dice helpers', () => {
  describe('isDiceFormula', () => {
    it('should accept standard dice formulas', () => {
      expect(isDiceFormula('4d6')).toBe(true);
      expect(isDiceFormula('2d8+3')).toBe(true);
      expect(isDiceFormula('1d20-1')).toBe(true);
      expect(isDiceFormula(' 3d6 ')).toBe(true);
    });

    it('should accept common variants (uppercase, spaces, bare die)', () => {
      expect(isDiceFormula('4D6')).toBe(true);
      expect(isDiceFormula('2D8+3')).toBe(true);
      expect(isDiceFormula('2d6 + 3')).toBe(true);
      expect(isDiceFormula('d6')).toBe(true);
      expect(isDiceFormula('d20')).toBe(true);
    });

    it('should reject non-dice capacity values', () => {
      expect(isDiceFormula('X')).toBe(false);
      expect(isDiceFormula('20 PVs Temporaires')).toBe(false);
      expect(isDiceFormula('')).toBe(false);
      expect(isDiceFormula('2nd attack')).toBe(false);
    });

    it('should require stats for stat-based formulas', () => {
      expect(isDiceFormula('Mod Esprit D6')).toBe(false);
      expect(isDiceFormula('Mod Esprit D6', { esprit: 18 })).toBe(true);
      expect(isDiceFormula('Mod Esprit D6', {})).toBe(false);
      expect(isDiceFormula('Mod Foo D6', { foo: 18 })).toBe(false);
    });

    it('should accept leading multipliers on stat-based formulas', () => {
      expect(isDiceFormula('3 Mod Esprit D6', { esprit: 18 })).toBe(true);
      expect(isDiceFormula('4 Mod Esprit D6', { esprit: 18 })).toBe(true);
      expect(isDiceFormula('0 Mod Esprit D6', { esprit: 18 })).toBe(false);
    });

    it('should reject non-string values', () => {
      expect(isDiceFormula(null)).toBe(false);
      expect(isDiceFormula(undefined)).toBe(false);
      expect(isDiceFormula(42)).toBe(false);
    });
  });

  describe('rollDice', () => {
    it('should roll the requested number of dice within range', () => {
      const { total, rolls, modifier } = rollDice('4d6');

      expect(rolls).toHaveLength(4);
      expect(modifier).toBe(0);
      for (const roll of rolls) {
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(6);
      }
      expect(total).toBe(rolls.reduce((a, b) => a + b, 0));
    });

    it('should apply positive and negative modifiers', () => {
      expect(rollDice('2d8+3').modifier).toBe(3);
      expect(rollDice('1d20-1').modifier).toBe(-1);
      const { total, rolls } = rollDice('2d8+3');
      expect(total).toBe(rolls.reduce((a, b) => a + b, 0) + 3);
    });

    it('should throw on invalid formulas instead of returning undefined rolls', () => {
      expect(() => rollDice('X')).toThrow('Invalid dice formula');
      expect(() => rollDice('20 PVs Temporaires')).toThrow('Invalid dice formula');
      expect(() => rollDice('')).toThrow('Invalid dice formula');
    });

    it('should handle uppercase and spaced variants like isDiceFormula accepts', () => {
      const upper = rollDice('4D6');
      expect(upper.rolls).toHaveLength(4);

      const spaced = rollDice('2d6 + 3');
      expect(spaced.modifier).toBe(3);
      expect(spaced.total).toBe(spaced.rolls.reduce((a, b) => a + b, 0) + 3);

      const bare = rollDice('d6');
      expect(bare.rolls).toHaveLength(1);
    });

    it('should resolve stat-based formulas to modifier dice', () => {
      // Esprit 18 → modifier +4 → 4d6
      const result = rollDice('Mod Esprit D6', { esprit: 18 });
      expect(result.rolls).toHaveLength(4);
      expect(result.formula).toBe('4d6');
      for (const roll of result.rolls) {
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(6);
      }
    });

    it('should handle stat names case- and accent-insensitively', () => {
      expect(rollDice('mod esprit d6', { esprit: 18 }).rolls).toHaveLength(4);
      expect(rollDice('Mod Agilité D8', { agilite: 14 }).rolls).toHaveLength(2);
      expect(rollDice('MOD FORCE D6', { force: 16 }).rolls).toHaveLength(3);
    });

    it('should clamp stat-based dice to a minimum of one die', () => {
      // Esprit 10 → modifier +0 → clamped to 1d6
      const result = rollDice('Mod Esprit D6', { esprit: 10 });
      expect(result.rolls).toHaveLength(1);
      expect(result.formula).toBe('1d6');
    });

    it('should multiply the modifier dice by a leading multiplier', () => {
      // Esprit 18 → modifier +4 → 3 × 4 = 12d6
      const triple = rollDice('3 Mod Esprit D6', { esprit: 18 });
      expect(triple.rolls).toHaveLength(12);
      expect(triple.formula).toBe('12d6');

      // Esprit 18 → modifier +4 → 4 × 4 = 16d6
      const quad = rollDice('4 Mod Esprit D6', { esprit: 18 });
      expect(quad.rolls).toHaveLength(16);
      expect(quad.formula).toBe('16d6');
    });

    it('should throw for stat-based formulas without usable stats', () => {
      expect(() => rollDice('Mod Esprit D6')).toThrow('Invalid dice formula');
      expect(() => rollDice('Mod Esprit D6', {})).toThrow('Invalid dice formula');
      expect(() => rollDice('Mod Foo D6', { foo: 18 })).toThrow('Invalid dice formula');
    });
  });

  describe('parseDiceFormula', () => {
    it('should parse standard formulas', () => {
      expect(parseDiceFormula('4d6')).toEqual({ count: 4, sides: 6, modifier: 0, formula: '4d6' });
      expect(parseDiceFormula('2d8+3')).toEqual({ count: 2, sides: 8, modifier: 3, formula: '2d8+3' });
      expect(parseDiceFormula('d6')).toEqual({ count: 1, sides: 6, modifier: 0, formula: '1d6' });
    });

    it('should resolve stat-based formulas against provided stats', () => {
      expect(parseDiceFormula('Mod Esprit D6', { esprit: 18 })).toEqual({ count: 4, sides: 6, modifier: 0, formula: '4d6' });
      expect(parseDiceFormula('Mod Force D8+2', { force: 16 })).toEqual({ count: 3, sides: 8, modifier: 2, formula: '3d8+2' });
    });

    it('should apply leading multipliers to stat-based dice counts', () => {
      expect(parseDiceFormula('3 Mod Esprit D6', { esprit: 18 })).toEqual({ count: 12, sides: 6, modifier: 0, formula: '12d6' });
      expect(parseDiceFormula('4 Mod Esprit D6', { esprit: 18 })).toEqual({ count: 16, sides: 6, modifier: 0, formula: '16d6' });
      expect(parseDiceFormula('0 Mod Esprit D6', { esprit: 18 })).toBeNull();
    });

    it('should return null for unparseable values', () => {
      expect(parseDiceFormula('X')).toBeNull();
      expect(parseDiceFormula('20 PVs Temporaires')).toBeNull();
      expect(parseDiceFormula(null)).toBeNull();
    });
  });

  describe('statModifier', () => {
    it('should compute D&D-style modifiers', () => {
      expect(statModifier(18)).toBe(4);
      expect(statModifier(16)).toBe(3);
      expect(statModifier(14)).toBe(2);
      expect(statModifier(10)).toBe(0);
      expect(statModifier(6)).toBe(-2);
    });
  });
});
