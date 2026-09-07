import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/lib/supabaseClient.js', () => ({
  supabase: {
    from: jest.fn(),
    channel: jest.fn(),
    removeChannel: jest.fn(),
  },
}));

// Import after mocking
const { isDiceFormula, parseDiceFormula, rollDice, statModifier, skillModifier, syncSkillBonuses, SKILL_TO_STAT, stripBase64Images, importCharacterSheet, MAX_SHEET_BYTES, toNumber, paradeTotal, equipmentStats, syncStatsFromEquipment } = await import('../../src/lib/characterSheet.js');
const { supabase: mockClient } = await import('../../src/lib/supabaseClient.js');

function mockUpsertChain(result) {
  const single = jest.fn().mockResolvedValue(result);
  const select = jest.fn().mockReturnValue({ single });
  const upsert = jest.fn().mockReturnValue({ select });
  mockClient.from.mockReturnValue({ upsert });
  return { upsert };
}

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

  describe('skillModifier', () => {
    const stats = { force: 6, agilite: 14, esprit: 18, social: 14 };

    it('should reflect the governing stat modifier', () => {
      expect(skillModifier(stats, 'athletisme')).toBe(-2);
      expect(skillModifier(stats, 'acrobaties')).toBe(2);
      expect(skillModifier(stats, 'arcanes')).toBe(4);
      expect(skillModifier(stats, 'intimidation')).toBe(2);
    });

    it('should follow the Figma skill grouping (perception/survie → esprit, perspicacité/dressage → social)', () => {
      expect(skillModifier(stats, 'perception')).toBe(4);
      expect(skillModifier(stats, 'survie')).toBe(4);
      expect(skillModifier(stats, 'perspicacite')).toBe(2);
      expect(skillModifier(stats, 'dressage')).toBe(2);
    });

    it('should fall back for unknown skills or missing scores', () => {
      expect(skillModifier(stats, 'astrologie', 7)).toBe(7);
      expect(skillModifier(stats, 'astrologie')).toBe(0);
      expect(skillModifier({}, 'arcanes', 5)).toBe(5);
      expect(skillModifier(null, 'arcanes', 5)).toBe(5);
    });

    it('should map exactly the 16 sheet skills (Force 2 / Esprit 5 / Agilité 3 / Social 6)', () => {
      expect(Object.keys(SKILL_TO_STAT)).toHaveLength(16);
      expect(Object.entries(SKILL_TO_STAT).filter(([, stat]) => stat === 'force')).toHaveLength(2);
      expect(Object.entries(SKILL_TO_STAT).filter(([, stat]) => stat === 'esprit')).toHaveLength(5);
      expect(Object.entries(SKILL_TO_STAT).filter(([, stat]) => stat === 'agilite')).toHaveLength(3);
      expect(Object.entries(SKILL_TO_STAT).filter(([, stat]) => stat === 'social')).toHaveLength(6);
      for (const skill of ['athletisme', 'resilience', 'acrobaties', 'discretion', 'escamotage', 'arcanes', 'investigation', 'perception', 'culture', 'survie', 'persuasion', 'tromperie', 'intimidation', 'representation', 'perspicacite', 'dressage']) {
        expect(SKILL_TO_STAT[skill]).toBeDefined();
      }
    });
  });

  describe('syncSkillBonuses', () => {
    it('should rewrite stored bonuses from stat modifiers', () => {
      const sheet = {
        stats: { force: 6, agilite: 14, esprit: 18, social: 14 },
        skills: {
          arcanes: { trained: true, bonus: 99 },
          acrobaties: { trained: false, bonus: 99 },
        },
      };

      const synced = syncSkillBonuses(sheet);

      expect(synced.skills.arcanes.bonus).toBe(4);
      expect(synced.skills.arcanes.trained).toBe(true);
      expect(synced.skills.acrobaties.bonus).toBe(2);
      // Original sheet untouched
      expect(sheet.skills.arcanes.bonus).toBe(99);
    });

    it('should preserve bonuses for skills without a governing stat', () => {
      const sheet = {
        stats: { force: 6, agilite: 14, esprit: 18, social: 14 },
        skills: {
          astrologie: { trained: false, bonus: 7 },
        },
      };

      expect(syncSkillBonuses(sheet).skills.astrologie.bonus).toBe(7);
    });

    it('should pass through sheets without skills', () => {
      const sheet = { stats: {} };
      expect(syncSkillBonuses(sheet)).toBe(sheet);
      expect(syncSkillBonuses(null)).toBeNull();
    });
  });

  describe('stripBase64Images', () => {
    it('should strip embedded data URLs in nested objects and arrays', () => {
      const sheet = {
        portrait: 'data:image/png;base64,AAA',
        totem: { nom: 'Totem', image: 'data:application/octet-stream;base64,BBB' },
        capacities: [{ name: 'Leyline', image: 'data:image/png;base64,CCC' }],
      };

      expect(stripBase64Images(sheet)).toBe(3);
      expect(sheet.portrait).toBe('');
      expect(sheet.totem.image).toBe('');
      expect(sheet.capacities[0].image).toBe('');
      expect(sheet.totem.nom).toBe('Totem');
    });

    it('should preserve external URLs and asset paths', () => {
      const sheet = {
        portrait: 'https://example.com/portrait.png',
        totem: { image: '/assets/totem.png' },
      };

      expect(stripBase64Images(sheet)).toBe(0);
      expect(sheet.portrait).toBe('https://example.com/portrait.png');
      expect(sheet.totem.image).toBe('/assets/totem.png');
    });

    it('should handle null and primitive values safely', () => {
      expect(stripBase64Images(null)).toBe(0);
      expect(stripBase64Images('data:image/png;base64,AAA')).toBe(0);
      expect(stripBase64Images(42)).toBe(0);
    });
  });

  describe('importCharacterSheet', () => {
    beforeEach(() => {
      mockClient.from.mockReset();
    });

    function validSheetJson(overrides = {}) {
      return JSON.stringify({
        identity: { nom: 'Test', race: '', niveau: 1 },
        stats: { force: 10, agilite: 10, esprit: 10, social: 10 },
        ...overrides,
      });
    }

    it('should strip embedded images before saving', async () => {
      const { upsert } = mockUpsertChain({ data: { id: '1' }, error: null });

      await importCharacterSheet('player-1', 'room-1', validSheetJson({
        portrait: 'data:image/png;base64,AAA',
      }));

      const saved = upsert.mock.calls[0][0];
      expect(saved.data.portrait).toBe('');
      expect(JSON.stringify(saved.data).length).toBeLessThan(MAX_SHEET_BYTES);
    });

    it('should reject payloads that remain oversized after stripping', async () => {
      const { upsert } = mockUpsertChain({ data: { id: '1' }, error: null });

      await expect(importCharacterSheet('player-1', 'room-1', validSheetJson({
        inventory: { inventaire: 'x'.repeat(MAX_SHEET_BYTES + 1) },
      }))).rejects.toThrow('trop volumineuse');

      expect(upsert).not.toHaveBeenCalled();
    });

    it('should reject invalid JSON structure', async () => {
      await expect(importCharacterSheet('player-1', 'room-1', JSON.stringify({ foo: 1 })))
        .rejects.toThrow('missing identity or stats');
    });
  });

  describe('toNumber', () => {
    it('should coerce sheet values to finite numbers', () => {
      expect(toNumber(3)).toBe(3);
      expect(toNumber('3')).toBe(3);
      expect(toNumber('')).toBe(0);
      expect(toNumber(null)).toBe(0);
      expect(toNumber(undefined)).toBe(0);
      expect(toNumber('abc')).toBe(0);
    });
  });

  describe('paradeTotal', () => {
    it('should sum deflexion, garde and bonus', () => {
      expect(paradeTotal({ deflexion: 2, gardeBonus: 3, bonus: 4 })).toBe(9);
      expect(paradeTotal({ deflexion: '1', gardeBonus: '', bonus: null })).toBe(1);
    });

    it('should return 0 without defense data', () => {
      expect(paradeTotal(null)).toBe(0);
      expect(paradeTotal(undefined)).toBe(0);
      expect(paradeTotal({})).toBe(0);
    });
  });

  describe('equipmentStats', () => {
    const equipment = {
      casque: { nom: 'Casque', deflexion: '0', volonte: '3' },
      plastron: { nom: 'Plastron', deflexion: '1', armure: '0' },
      gantelets: { nom: '', deflexion: '', initiative: '' },
      bottes: { nom: '', deflexion: '', vitesse: '' },
    };

    it('should sum slot stats across equipment', () => {
      expect(equipmentStats(equipment, [])).toEqual({
        deflexion: 1,
        armure: 0,
        volonte: 3,
        garde: 0,
      });
    });

    it('should only count equipped weapons for garde', () => {
      const weapons = [
        { nom: 'Bâton', parade: '4', equipped: true },
        { nom: 'Épée courte', parade: '3', equipped: false },
      ];
      expect(equipmentStats(equipment, weapons).garde).toBe(4);
      expect(equipmentStats(equipment, []).garde).toBe(0);
    });

    it('should handle missing equipment and weapons', () => {
      expect(equipmentStats(null, null)).toEqual({ deflexion: 0, armure: 0, volonte: 0, garde: 0 });
      expect(equipmentStats({}, undefined)).toEqual({ deflexion: 0, armure: 0, volonte: 0, garde: 0 });
    });
  });

  describe('syncStatsFromEquipment', () => {
    it('should overwrite stored defense and volonte from equipment', () => {
      const sheet = {
        defense: { deflexion: 99, gardeBonus: 99, bonus: 4, armure: 99 },
        derived: { volonte: 99, initiative: 6 },
        equipment: {
          casque: { deflexion: '0', volonte: '3' },
          plastron: { deflexion: '1', armure: '2' },
        },
        weapons: [{ nom: 'Bâton', parade: '4', equipped: true }],
      };

      const synced = syncStatsFromEquipment(sheet);

      expect(synced.defense.deflexion).toBe(1);
      expect(synced.defense.armure).toBe(2);
      expect(synced.defense.gardeBonus).toBe(4);
      expect(synced.defense.bonus).toBe(4);
      expect(synced.derived.volonte).toBe(3);
      expect(synced.derived.initiative).toBe(6);
      // Original sheet untouched
      expect(sheet.defense.deflexion).toBe(99);
    });

    it('should pass through sheets without equipment data', () => {
      const sheet = { defense: { bonus: 1 } };
      const synced = syncStatsFromEquipment(sheet);
      expect(synced.defense).toEqual({ bonus: 1, deflexion: 0, armure: 0, gardeBonus: 0 });
      expect(synced.derived.volonte).toBe(0);
      expect(syncStatsFromEquipment(null)).toBeNull();
    });
  });
});
