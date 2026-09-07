import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/lib/supabaseClient.js', () => ({
  supabase: {
    from: jest.fn(),
    channel: jest.fn(),
    removeChannel: jest.fn(),
  },
}));

// Import after mocking
const { isDiceFormula, rollDice } = await import('../../src/lib/characterSheet.js');

describe('Character Sheet dice helpers', () => {
  describe('isDiceFormula', () => {
    it('should accept standard dice formulas', () => {
      expect(isDiceFormula('4d6')).toBe(true);
      expect(isDiceFormula('2d8+3')).toBe(true);
      expect(isDiceFormula('1d20-1')).toBe(true);
      expect(isDiceFormula(' 3d6 ')).toBe(true);
    });

    it('should reject non-dice capacity values', () => {
      expect(isDiceFormula('X')).toBe(false);
      expect(isDiceFormula('20 PVs Temporaires')).toBe(false);
      expect(isDiceFormula('Mod Esprit D6')).toBe(false);
      expect(isDiceFormula('')).toBe(false);
      expect(isDiceFormula('d6')).toBe(false);
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
  });
});
