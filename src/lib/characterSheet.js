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

const DICE_FORMULA_RE = /^(\d+)d(\d+)([+-]\d+)?$/;

/**
 * Check whether a string is a rollable dice formula (e.g. "4d6", "2d8+3").
 * Capacity values like "X" or "20 PVs Temporaires" are not rollable.
 * @param {unknown} value - Value to check
 * @returns {boolean}
 */
export function isDiceFormula(value) {
  return typeof value === 'string' && DICE_FORMULA_RE.test(value.trim());
}

/**
 * Roll dice based on a formula like "4d6" or "2d8+3"
 * @param {string} formula - Dice formula (e.g., "4d6", "2d8+3")
 * @returns {{total: number, rolls: number[], modifier: number}}
 */
export function rollDice(formula) {
  const text = typeof formula === 'string' ? formula.trim() : '';
  const match = text.match(DICE_FORMULA_RE);
  if (!match) {
    throw new Error(`Invalid dice formula: ${formula}`);
  }

  const count = parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;

  const rolls = [];
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1);
  }

  const sum = rolls.reduce((a, b) => a + b, 0);
  const total = sum + modifier;

  return { total, rolls, modifier };
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
