/**
 * Character Sheet API Module
 * Handles CRUD operations for character sheets stored in Supabase
 */
import { supabase } from './supabaseClient.js';

/**
 * Create a default empty character sheet matching the full JSON structure
 */
export function createEmptyCharacterSheet() {
  return {
    schemaVersion: 1,
    templateId: 'cardenveil-standard',
    identity: {
      nom: '',
      joueur: '',
      niveau: 1,
      race: '',
      alignement: '',
      age: '',
      taille: '',
      poids: '',
      yeux: '',
      peau: '',
      cheveux: ''
    },
    portrait: '',
    stats: {
      force: 10,
      agilite: 10,
      esprit: 10,
      social: 10
    },
    progression: {
      xpDepenses: 0,
      xpDisponibles: 0
    },
    derived: {
      pvMax: 0,
      bonusPv: 0,
      pvActuels: 0,
      pvTemporaires: 0,
      mouvement: 0,
      initiative: 0,
      perceptionPassive: 0,
      seuilSauvegarde: 0,
      seuilMiss: 1,
      canalisation: 0,
      bonusAttaque: 0,
      inspiration: false,
      fatigue: 0,
      mort: 0,
      volonte: 0
    },
    defense: {
      parade: 0,
      armure: 0,
      deflexion: 0,
      gardeBonus: 0,
      bonus: 0
    },
    resources: {
      or: 0,
      rations: 0,
      cartesEtTokens: '',
      tokens: {
        force: 3,
        agilite: 3,
        esprit: 3,
        social: 3
      }
    },
    skills: {
      athletisme: { trained: false, bonus: 0 },
      resilience: { trained: false, bonus: 0 },
      acrobaties: { trained: false, bonus: 0 },
      discretion: { trained: false, bonus: 0 },
      escamotage: { trained: false, bonus: 0 },
      arcanes: { trained: false, bonus: 0 },
      investigation: { trained: false, bonus: 0 },
      perception: { trained: false, bonus: 0 },
      culture: { trained: false, bonus: 0 },
      survie: { trained: false, bonus: 0 },
      persuasion: { trained: false, bonus: 0 },
      tromperie: { trained: false, bonus: 0 },
      intimidation: { trained: false, bonus: 0 },
      representation: { trained: false, bonus: 0 },
      perspicacite: { trained: false, bonus: 0 },
      dressage: { trained: false, bonus: 0 }
    },
    weapons: [],
    inventory: {
      equipement: '',
      inventaire: '',
      totem: ''
    },
    totem: {
      nom: '',
      description: '',
      image: ''
    },
    narrative: {
      background: '',
      objectif: '',
      liens: '',
      traitsSpeciaux: [],
      personnalite: '',
      reputation: '',
      education: '',
      croyances: '',
      cicatrices: '',
      pulsion: '',
      maniesEtTics: '',
      instinct: ''
    },
    capacities: [],
    abilityControls: {
      cardMin: 1,
      cardMax: 13,
      knownAbilities: 0,
      maxPreparedAbilities: 0,
      colorReductions: {
        spade: 0,
        heart: 0,
        diamond: 0,
        club: 0
      }
    },
    equipment: {
      casque: { nom: '', raretePrix: '', deflexion: '', volonte: '', enchantement: '', description: '' },
      plastron: { nom: '', raretePrix: '', deflexion: '', armure: '', enchantement: '', description: '' },
      gantelets: { nom: '', raretePrix: '', deflexion: '', initiative: '', enchantement: '', description: '' },
      bottes: { nom: '', raretePrix: '', deflexion: '', vitesse: '', enchantement: '', description: '' },
      anneau: { nom: '', raretePrix: '', enchantement: '', description: '' },
      amulette: { nom: '', raretePrix: '', enchantement: '', description: '' },
      cape: { nom: '', raretePrix: '', enchantement: '', description: '' }
    },
    actions: [],
    reactions: [],
    tokens: [],
    weaponMasteries: [],
    elementalMasteries: [],
    inventoryItems: [],
    feats: []
  };
}

/**
 * Fetch a character sheet for a specific player in a room
 * @param {string} playerId - OBR player ID
 * @param {string} roomId - OBR room ID
 * @returns {Promise<Object|null>} Character sheet data or null if not found
 */
export async function fetchCharacterSheet(playerId, roomId) {
  try {
    const { data, error } = await supabase
      .from('character_sheets')
      .select('*')
      .eq('player_id', playerId)
      .eq('room_id', roomId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - sheet doesn't exist yet
        return null;
      }
      throw error;
    }

    return data;
  } catch (err) {
    console.error('Failed to fetch character sheet:', err);
    throw err;
  }
}

/**
 * Save (upsert) a character sheet
 * @param {string} playerId - OBR player ID
 * @param {string} roomId - OBR room ID
 * @param {Object} sheetData - Complete character sheet data
 * @returns {Promise<Object>} Saved character sheet
 */
export async function saveCharacterSheet(playerId, roomId, sheetData) {
  try {
    const record = {
      player_id: playerId,
      room_id: roomId,
      name: sheetData.identity?.nom || '',
      race: sheetData.identity?.race || null,
      level: sheetData.identity?.niveau || 1,
      data: sheetData,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('character_sheets')
      .upsert(record, { onConflict: 'player_id,room_id' })
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (err) {
    console.error('Failed to save character sheet:', err);
    throw err;
  }
}

/**
 * Delete a character sheet
 * @param {string} playerId - OBR player ID
 * @param {string} roomId - OBR room ID
 */
export async function deleteCharacterSheet(playerId, roomId) {
  try {
    const { error } = await supabase
      .from('character_sheets')
      .delete()
      .eq('player_id', playerId)
      .eq('room_id', roomId);

    if (error) throw error;
  } catch (err) {
    console.error('Failed to delete character sheet:', err);
    throw err;
  }
}

/**
 * Import a character sheet from JSON string
 * @param {string} playerId - OBR player ID
 * @param {string} roomId - OBR room ID
 * @param {string} jsonString - JSON string to import
 * @returns {Promise<Object>} Imported character sheet
 */
export async function importCharacterSheet(playerId, roomId, jsonString) {
  try {
    const parsed = JSON.parse(jsonString);

    // Validate basic structure
    if (!parsed.identity || !parsed.stats) {
      throw new Error('Invalid character sheet format: missing identity or stats');
    }

    // Merge with empty template to ensure all fields exist
    const empty = createEmptyCharacterSheet();
    const merged = {
      ...empty,
      ...parsed,
      identity: { ...empty.identity, ...parsed.identity },
      stats: { ...empty.stats, ...parsed.stats },
      progression: { ...empty.progression, ...parsed.progression },
      derived: { ...empty.derived, ...parsed.derived },
      defense: { ...empty.defense, ...parsed.defense },
      resources: { ...empty.resources, ...parsed.resources },
      skills: { ...empty.skills, ...parsed.skills },
      narrative: { ...empty.narrative, ...parsed.narrative },
      equipment: { ...empty.equipment, ...parsed.equipment }
    };

    return await saveCharacterSheet(playerId, roomId, merged);
  } catch (err) {
    console.error('Failed to import character sheet:', err);
    throw err;
  }
}

const STANDARD_DICE_RE = /^(\d*)\s*d\s*(\d+)\s*([+-]\s*\d+)?$/i;
const STAT_DICE_RE = /^(?:(\d+)\s*)?mod\s+([a-zàâäéèêëîïôöùûüç]+)\s*d\s*(\d+)\s*([+-]\s*\d+)?$/i;

const STAT_KEYS = ['force', 'agilite', 'esprit', 'social'];

/**
 * Normalize a stat name (case- and accent-insensitive) to a stat key.
 * @param {string} name - Stat name (e.g. "Esprit", "agilité")
 * @returns {string|null} Stat key or null when unknown
 */
function normalizeStatName(name) {
  const normalized = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return STAT_KEYS.includes(normalized) ? normalized : null;
}

/**
 * Compute a stat modifier from a raw score (e.g. 18 → +4).
 * @param {unknown} score - Raw stat score
 * @returns {number}
 */
export function statModifier(score) {
  return Math.floor((Number(score) - 10) / 2);
}

/**
 * Parse a dice formula into { count, sides, modifier, formula }.
 * Supports standard ("4d6", "4D6", "2d8+3", "d6") and stat-based
 * ("Mod Esprit D6" → Esprit modifier dice, "3 Mod Esprit D6" → 3 ×
 * modifier dice) forms. For stat-based forms, `stats` must provide the
 * raw score; the dice count is the stat modifier times the optional
 * leading multiplier (minimum 1). Returns null when unparseable.
 * @param {unknown} value - Formula to parse
 * @param {Object} [stats] - Raw stat scores ({ force, agilite, esprit, social })
 * @returns {{count: number, sides: number, modifier: number, formula: string}|null}
 */
export function parseDiceFormula(value, stats = {}) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const format = (count, sides, modifier) =>
    `${count}d${sides}${modifier ? `${modifier > 0 ? '+' : ''}${modifier}` : ''}`;

  let match = text.match(STANDARD_DICE_RE);
  if (match) {
    const count = match[1] === '' ? 1 : parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);
    const modifier = match[3] ? parseInt(match[3].replace(/\s+/g, ''), 10) : 0;
    if (!(count >= 1) || !(sides >= 2)) return null;
    return { count, sides, modifier, formula: format(count, sides, modifier) };
  }

  match = text.match(STAT_DICE_RE);
  if (match) {
    const key = normalizeStatName(match[2]);
    const score = Number(stats?.[key]);
    if (!key || !Number.isFinite(score)) return null;
    const multiplier = match[1] === undefined ? 1 : parseInt(match[1], 10);
    if (!(multiplier >= 1)) return null;
    const count = Math.max(1, multiplier * statModifier(score));
    const sides = parseInt(match[3], 10);
    if (!(sides >= 2)) return null;
    const modifier = match[4] ? parseInt(match[4].replace(/\s+/g, ''), 10) : 0;
    return { count, sides, modifier, formula: format(count, sides, modifier) };
  }

  return null;
}

/**
 * Check whether a string is a rollable dice formula
 * (e.g. "4d6", "4D6", "2d8+3", "d6", "Mod Esprit D6" with stats).
 * Capacity values like "X" or "20 PVs Temporaires" are not rollable.
 * @param {unknown} value - Value to check
 * @param {Object} [stats] - Raw stat scores, required for stat-based formulas
 * @returns {boolean}
 */
export function isDiceFormula(value, stats = {}) {
  return parseDiceFormula(value, stats) !== null;
}

/**
 * Roll dice based on a formula like "4d6", "2d8+3" or "Mod Esprit D6"
 * @param {string} formula - Dice formula
 * @param {Object} [stats] - Raw stat scores, required for stat-based formulas
 * @returns {{total: number, rolls: number[], modifier: number, formula: string}}
 */
export function rollDice(formula, stats = {}) {
  const parsed = parseDiceFormula(formula, stats);
  if (!parsed) {
    throw new Error(`Invalid dice formula: ${formula}`);
  }

  const { count, sides, modifier } = parsed;
  const rolls = [];
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1);
  }

  const sum = rolls.reduce((a, b) => a + b, 0);
  const total = sum + modifier;

  return { total, rolls, modifier, formula: parsed.formula };
}

/**
 * Subscribe to realtime updates for a character sheet
 * @param {string} playerId - OBR player ID
 * @param {string} roomId - OBR room ID
 * @param {Function} callback - Callback when sheet changes
 * @returns {Function} Unsubscribe function
 */
export function subscribeToCharacterSheet(playerId, roomId, callback) {
  const channel = supabase
    .channel(`character_sheet:${playerId}:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'character_sheets',
        filter: `player_id=eq.${playerId}&room_id=eq.${roomId}`
      },
      (payload) => {
        callback(payload.new);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
