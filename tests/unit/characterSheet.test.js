import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/lib/supabaseClient.js', () => ({
  supabase: {
    from: jest.fn(),
    channel: jest.fn(),
    removeChannel: jest.fn(),
  },
}));

// Import after mocking
const { isDiceFormula, parseDiceFormula, rollDice, statModifier, skillModifier, syncSkillBonuses, SKILL_TO_STAT, stripBase64Images, importCharacterSheet, MAX_SHEET_BYTES, toNumber, paradeTotal, equipmentStats, syncStatsFromEquipment, paradeModifier, attackBonus, computeDerived, isImageUrl, EQUIPMENT_CATALOG, findEquipmentTemplate, suitColorBySymbol, CARD_SCHEME_KEY, getCardScheme, setCardScheme, onCardSchemeChange, classicSuitColor } = await import('../../src/lib/characterSheet.js');
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

    it('should only count equipped melee weapons for garde (die / 2)', () => {
      const weapons = [
        { nom: 'Espadon', de: '1d12', equipped: true },
        { nom: 'Dague', de: '1d4', equipped: true },
        { nom: 'Épée courte', de: '1d6', equipped: false },
      ];
      // Dual wield: 1d12 → 6, 1d4 → 2
      expect(equipmentStats({}, weapons).garde).toBe(8);
      expect(equipmentStats({}, []).garde).toBe(0);
    });

    it('should exclude ranged weapons from garde', () => {
      const weapons = [
        { nom: 'Arc long', de: '1d8', propriétés: 'Distance, Tir', equipped: true },
        { nom: 'Focus', de: '1d4', family: 'Catalyseur, Distance', equipped: true },
        { nom: 'Bâton', de: '1d8', equipped: true },
      ];
      // Only the Bâton (melee) counts: 8/2 = 4
      expect(equipmentStats({}, weapons).garde).toBe(4);
    });

    it('should sum dice count × sides / 2 for multi-dice weapons', () => {
      expect(equipmentStats({}, [{ nom: 'Hache double', de: '2d6', equipped: true }]).garde).toBe(6);
      expect(equipmentStats({}, [{ nom: 'Arme', de: '', equipped: true }]).garde).toBe(0);
    });

    it('should handle missing equipment and weapons', () => {
      expect(equipmentStats(null, null)).toEqual({ deflexion: 0, armure: 0, volonte: 0, garde: 0 });
      expect(equipmentStats({}, undefined)).toEqual({ deflexion: 0, armure: 0, volonte: 0, garde: 0 });
    });
  });

  describe('syncStatsFromEquipment', () => {
    it('should overwrite stored defense/derived fields with computed values', () => {
      const sheet = {
        stats: { force: 14, agilite: 12, esprit: 10, social: 10 },
        defense: { deflexion: 99, gardeBonus: 99, bonus: 4, armure: 99 },
        derived: { volonte: 99, initiative: 6, mouvement: 0, seuilMiss: 9, canalisation: 9, bonusAttaque: 9 },
        equipment: {
          casque: { deflexion: '0', volonte: '3' },
          plastron: { deflexion: '1', armure: '2' },
        },
        weapons: [{ nom: 'Bâton', de: '1d8', forceAgi: 'Esprit', bonus: '2', equipped: true }],
      };

      const synced = syncStatsFromEquipment(sheet);

      expect(synced.defense.deflexion).toBe(1);
      expect(synced.defense.armure).toBe(2);
      expect(synced.defense.gardeBonus).toBe(4); // 1d8 / 2
      expect(synced.defense.bonus).toBe(1); // agilité mod (12 → +1)
      expect(synced.derived.volonte).toBe(5); // résilience (force 14 → +2) + casque 3
      expect(synced.derived.initiative).toBe(2); // 12 - 10
      expect(synced.derived.mouvement).toBe(14); // 8 + 12/2
      expect(synced.derived.seuilMiss).toBe(1); // max(1, 1 - 1)
      expect(synced.derived.canalisation).toBe(0); // esprit 10
      expect(synced.derived.bonusAttaque).toBe(2); // esprit mod 0 + tier 2
      // Original sheet untouched
      expect(sheet.defense.deflexion).toBe(99);
    });

    it('should treat missing stats as 10 for sheets without equipment data', () => {
      const sheet = { defense: { bonus: 1 } };
      const synced = syncStatsFromEquipment(sheet);
      expect(synced.defense).toEqual({ bonus: 0, deflexion: 0, armure: 0, gardeBonus: 0 });
      expect(synced.derived.volonte).toBe(0);
      expect(synced.derived.initiative).toBe(0);
      expect(synced.derived.mouvement).toBe(13);
      expect(synced.derived.seuilMiss).toBe(1);
      expect(synced.derived.canalisation).toBe(0);
      expect(synced.derived.bonusAttaque).toBe(0);
      expect(syncStatsFromEquipment(null)).toBeNull();
    });
  });

  describe('paradeModifier', () => {
    const stats = { force: 14, agilite: 16, esprit: 10, social: 10 }; // force +2, agi +3

    it('should use agilité by default', () => {
      expect(paradeModifier([{ nom: 'Bâton', equipped: true }], stats)).toBe(3);
      expect(paradeModifier([], stats)).toBe(3);
    });

    it('should use force with a shield (bouclier/rempart)', () => {
      expect(paradeModifier([{ nom: 'Épée', equipped: true }, { nom: 'Bouclier', de: '1d4', equipped: true }], stats)).toBe(2);
      expect(paradeModifier([{ nom: 'Targe', propriétés: 'Rempart', equipped: true }], stats)).toBe(2);
      // Unequipped shield is ignored
      expect(paradeModifier([{ nom: 'Bouclier', equipped: false }], stats)).toBe(3);
    });

    it('should use force + agilité for straight swords (épées droites / garde)', () => {
      expect(paradeModifier([{ nom: 'Rapière', propriétés: 'Épée droite', equipped: true }], stats)).toBe(5);
      expect(paradeModifier([{ nom: 'Espadon', propriétés: 'Garde, Deux-mains', equipped: true }], stats)).toBe(5);
    });

    it('should be accent- and case-insensitive', () => {
      expect(paradeModifier([{ nom: 'Bouclier de fer', equipped: true }], stats)).toBe(2);
    });
  });

  describe('attackBonus', () => {
    const stats = { force: 18, agilite: 12, esprit: 10, social: 10 }; // force +4, agi +1

    it('should add the governing stat modifier and the weapon tier', () => {
      expect(attackBonus({ nom: 'Hache', de: '1d8', forceAgi: 'Force', bonus: '2' }, stats)).toBe(6);
      expect(attackBonus({ nom: 'Dague', de: '1d4', forceAgi: 'agilité', bonus: '1' }, stats)).toBe(2);
      expect(attackBonus({ nom: 'Focus', de: '1d4', forceAgi: 'Esprit', bonus: '3' }, stats)).toBe(3);
    });

    it('should handle missing stat or tier', () => {
      expect(attackBonus({ nom: 'Arme', forceAgi: 'Force' }, stats)).toBe(4);
      expect(attackBonus({ nom: 'Arme', bonus: '2' }, stats)).toBe(2);
      expect(attackBonus(null, stats)).toBe(0);
    });
  });

  describe('computeDerived', () => {
    const sheet = {
      stats: { force: 14, agilite: 6, esprit: 16, social: 10 }, // force +2, agi -2, esprit +3
      equipment: {
        casque: { deflexion: '1', volonte: '2' },
        plastron: { deflexion: '3', armure: '4' },
        gantelets: { deflexion: '1', initiative: '5' },
        bottes: { deflexion: '0', vitesse: '2' },
      },
      weapons: [{ nom: 'Espadon', de: '1d12', forceAgi: 'Force', bonus: '2', equipped: true }],
    };

    it('should compute parade from deflexion + garde + modifier', () => {
      const calc = computeDerived(sheet);
      // deflexion 1+3+1+0 = 5, garde 12/2 = 6, modifier agi -2
      expect(calc.parade).toBe(9);
      expect(calc.paradeBonus).toBe(-2);
    });

    it('should compute initiative, mouvement, seuilMiss, canalisation, volonte, bonusAttaque', () => {
      const calc = computeDerived(sheet);
      expect(calc.initiative).toBe(1); // 6 - 10 + 5 (gantelets)
      expect(calc.mouvement).toBe(13); // 8 + 3 (agi/2 floored) + 2 (bottes)
      expect(calc.seuilMiss).toBe(3); // max(1, 1 - (-2))
      expect(calc.canalisation).toBe(3); // esprit 16 → +3
      expect(calc.volonte).toBe(4); // résilience (force +2) + casque 2
      expect(calc.bonusAttaque).toBe(4); // force +2 + tier 2
    });

    it('should switch the parade modifier to force with a shield', () => {
      const shielded = {
        ...sheet,
        weapons: [
          { nom: 'Épée', de: '1d8', equipped: true },
          { nom: 'Bouclier', de: '1d4', equipped: true },
        ],
      };
      const calc = computeDerived(shielded);
      expect(calc.paradeBonus).toBe(2); // force
      expect(calc.garde).toBe(6); // 1d8/2 + 1d4/2
    });

    it('should handle an empty sheet', () => {
      const calc = computeDerived({});
      expect(calc.parade).toBe(0);
      expect(calc.initiative).toBe(0);
      expect(calc.mouvement).toBe(13);
      expect(calc.seuilMiss).toBe(1);
      expect(calc.bonusAttaque).toBe(0);
    });
  });

  describe('isImageUrl', () => {
    it('should detect URLs and data URIs', () => {
      expect(isImageUrl('https://example.com/a.png')).toBe(true);
      expect(isImageUrl('http://example.com/a.png')).toBe(true);
      expect(isImageUrl('data:image/png;base64,abc')).toBe(true);
      expect(isImageUrl('/cards/a.png')).toBe(true);
    });

    it('should treat non-URL values as emoji/glyphs', () => {
      expect(isImageUrl('🐉')).toBe(false);
      expect(isImageUrl('⚔️')).toBe(false);
      expect(isImageUrl('')).toBe(false);
      expect(isImageUrl(null)).toBe(false);
    });
  });

  describe('EQUIPMENT_CATALOG', () => {
    it('should expose the full weapon/armor table', () => {
      const names = EQUIPMENT_CATALOG.flatMap((g) => g.items.map((i) => i.nom));
      expect(names).toContain('Épée longue');
      expect(names).toContain('Bouclier');
      expect(names).toContain('Arbalète lourde');
      expect(names).toContain('Faux');
      expect(names).toContain('Plastron');
    });

    it('should find templates with their group and kind', () => {
      const katana = findEquipmentTemplate('Katana (sabre long)');
      expect(katana.de).toBe('1d10');
      expect(katana.proprietes).toContain('Fluide');
      expect(katana.kind).toBe('arme');

      const plastron = findEquipmentTemplate('Plastron');
      expect(plastron.kind).toBe('armure');

      expect(findEquipmentTemplate('Inexistant')).toBeNull();
      expect(findEquipmentTemplate('')).toBeNull();
      expect(findEquipmentTemplate(undefined)).toBeNull();
    });
  });

  describe('suitColorBySymbol', () => {
    it('should map suit symbols to the sheet COÛT palette', () => {
      expect(suitColorBySymbol('♥')).toBe('#f87171');
      expect(suitColorBySymbol('♠')).toBe('#e5e7eb');
      expect(suitColorBySymbol('♦')).toBe('#fbbf24');
      expect(suitColorBySymbol('♣')).toBe('#4ade80');
    });

    it('should return darkened variants for light card faces', () => {
      expect(suitColorBySymbol('♥', true)).toBe('#ef4444');
      expect(suitColorBySymbol('♠', true)).toBe('#6b7280');
      expect(suitColorBySymbol('♦', true)).toBe('#d97706');
      expect(suitColorBySymbol('♣', true)).toBe('#16a34a');
    });

    it('should fall back for unknown suits', () => {
      expect(suitColorBySymbol('')).toBe('#9ca3af');
      expect(suitColorBySymbol(undefined, true)).toBe('#6b7280');
    });
  });

  describe('card color scheme', () => {
    it('should default to the color schema', () => {
      expect(getCardScheme()).toBe('color');
    });

    it('should persist the scheme and notify same-runtime listeners', () => {
      const seen = [];
      const off = onCardSchemeChange((s) => seen.push(s));
      setCardScheme('classic');
      expect(localStorage.getItem(CARD_SCHEME_KEY)).toBe('classic');
      expect(getCardScheme()).toBe('classic');
      expect(seen).toEqual(['classic']);
      off();
      setCardScheme('color');
      expect(seen).toEqual(['classic']);
      expect(getCardScheme()).toBe('color');
    });

    it('should map classic red/black colors', () => {
      expect(classicSuitColor(true)).toBe('#dc2626');
      expect(classicSuitColor(false)).toBe('#111827');
    });
  });
});
