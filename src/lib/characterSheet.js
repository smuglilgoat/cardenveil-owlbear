/**
 * Character Sheet API Module
 * Handles CRUD operations for character sheets stored in Supabase
 */
import { supabase } from './supabaseClient.js';
import { RACES } from './deck.js';

// ─── Shared UI constants (used by CharacterSheet + SheetPopover) ───
// French display labels for stat keys
export const STAT_LABELS = { force: 'Force', agilite: 'Agilité', esprit: 'Esprit', social: 'Social' };

export const STAT_COLORS = {
  force: '#f87171',
  agilite: '#4ade80',
  esprit: '#a78bfa',
  social: '#60a5fa'
};

/** Skill → governing stat mapping (single source for groups + labels).
 *  WIS-domain skills (perception, survie, perspicacité, dressage) map to
 *  esprit, the mental stat, since the four-stat system has no separate
 *  wisdom score. */
export const SKILL_TO_STAT = {
  athletisme: 'force',
  resilience: 'force',
  acrobaties: 'agilite',
  discretion: 'agilite',
  escamotage: 'agilite',
  arcanes: 'esprit',
  investigation: 'esprit',
  perception: 'esprit',
  culture: 'esprit',
  survie: 'esprit',
  persuasion: 'social',
  tromperie: 'social',
  intimidation: 'social',
  representation: 'social',
  perspicacite: 'social',
  dressage: 'social',
};

export const SKILL_LABELS = {
  athletisme: 'Athlétisme',
  resilience: 'Résilience',
  acrobaties: 'Acrobaties',
  discretion: 'Discrétion',
  escamotage: 'Escamotage',
  arcanes: 'Arcanes',
  investigation: 'Investigation',
  perception: 'Perception',
  culture: 'Culture',
  survie: 'Survie',
  persuasion: 'Persuasion',
  tromperie: 'Tromperie',
  intimidation: 'Intimidation',
  representation: 'Représentation',
  perspicacite: 'Perspicacité',
  dressage: 'Dressage'
};

const STAT_GROUP_LABELS = { force: 'FORCE', agilite: 'AGILITÉ', esprit: 'ESPRIT', social: 'SOCIAL' };

/** Skill groups (for display) derived from SKILL_TO_STAT, in stat order. */
export const SKILL_GROUPS = ['force', 'agilite', 'esprit', 'social'].map((stat) => ({
  stat,
  label: STAT_GROUP_LABELS[stat],
  skills: Object.keys(SKILL_TO_STAT).filter((skill) => SKILL_TO_STAT[skill] === stat),
}));

export const SUIT_LABELS = { heart: 'Cœur', spade: 'Pique', diamond: 'Carreau', club: 'Trèfle' };
export const SUIT_SYMBOLS = { heart: '♥', spade: '♠', diamond: '♦', club: '♣' };
export const SUIT_COLORS = { heart: '#f87171', spade: '#e5e7eb', diamond: '#fbbf24', club: '#4ade80' };

// Per-turn action tracker (3 diamond checkboxes, display only — no reset logic)
export const ACTION_CHECKS = [
  { key: 'action', label: 'ACTION' },
  { key: 'bonus', label: 'BONUS ACTION' },
  { key: 'reaction', label: 'RÉACTION' }
];

export function colorLabel(color) {
  return SUIT_LABELS[(color || '').toLowerCase()] || color || '—';
}

export function suitSymbol(color) {
  return SUIT_SYMBOLS[(color || '').toLowerCase()] || '·';
}

export function suitColor(color) {
  return SUIT_COLORS[(color || '').toLowerCase()] || '#9ca3af';
}

// Same schema keyed by suit SYMBOL (card objects carry symbols, not names).
export const SUIT_SYMBOL_COLORS = { '♥': '#f87171', '♠': '#e5e7eb', '♦': '#fbbf24', '♣': '#4ade80' };
// Same 4 hues darkened for white card faces (spade gray-200 / diamond amber-400
// are illegible at card-corner size on a light background).
export const SUIT_SYMBOL_COLORS_ON_LIGHT = { '♥': '#ef4444', '♠': '#6b7280', '♦': '#d97706', '♣': '#16a34a' };

export function suitColorBySymbol(suit, onLight = false) {
  const map = onLight ? SUIT_SYMBOL_COLORS_ON_LIGHT : SUIT_SYMBOL_COLORS;
  return map[suit] ?? (onLight ? '#6b7280' : '#9ca3af');
}

// ─── Card color scheme (local preference: 'color' schema vs classic red/black) ───
export const CARD_SCHEME_KEY = 'cardenveil-card-scheme';
const cardSchemeListeners = new Set();

export function getCardScheme() {
  try {
    return localStorage.getItem(CARD_SCHEME_KEY) === 'classic' ? 'classic' : 'color';
  } catch {
    return 'color';
  }
}

export function setCardScheme(scheme) {
  try {
    localStorage.setItem(CARD_SCHEME_KEY, scheme === 'classic' ? 'classic' : 'color');
  } catch {
    /* storage unavailable — applies locally only */
  }
  // Notifies same-runtime subscribers (cross-iframe views get the `storage` event)
  cardSchemeListeners.forEach((h) => h(scheme));
}

export function onCardSchemeChange(handler) {
  cardSchemeListeners.add(handler);
  return () => cardSchemeListeners.delete(handler);
}

/** Classic two-color card palette (red suits vs black suits). */
export function classicSuitColor(isRed) {
  return isRed ? '#dc2626' : '#111827';
}

// ─── Inventory item type color coding ───
export const ITEM_TYPE_COLORS = {
  arme: '#f87171',
  armure: '#60a5fa',
  consommable: '#4ade80',
  'équipement': '#fbbf24',
  divers: '#9ca3af'
};

export const ITEM_TYPE_OPTIONS = ['Arme', 'Armure', 'Équipement', 'Consommable', 'Divers'];

export function itemTypeColor(type) {
  return ITEM_TYPE_COLORS[String(type ?? '').trim().toLowerCase()] || '#9ca3af';
}

// ─── Race name normalization (sheet imports carry free-text race names) ───

function canonicalRace(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '-');
}

/**
 * Map a free-text race name to a canonical race id when recognizable
 * ("Haut Elfe" → "haut-elfe"). Unrecognized values pass through untouched
 * so manually typed races ("Humain", …) keep their text.
 * @param {unknown} race - Raw race value
 * @returns {unknown} Race id when matched, otherwise the input unchanged
 */
export function normalizeRaceName(race) {
  if (race == null) return race;
  const raw = String(race).trim();
  if (!raw) return race;
  const canon = canonicalRace(raw);
  const hit = RACES.find((r) => canonicalRace(r.id) === canon || canonicalRace(r.label) === canon);
  return hit ? hit.id : race;
}

/**
 * Display label for a race value (race id → label, anything else as-is).
 * @param {unknown} race - Race id or free text
 * @returns {string}
 */
export function raceLabel(race) {
  const value = String(race ?? '').trim();
  return RACES.find((r) => r.id === value)?.label ?? value;
}

/**
 * Whether an image-slot value is a URL (vs an emoji/glyph to render as text).
 * @param {unknown} value - Portrait/capacity/totem image value
 * @returns {boolean}
 */
export function isImageUrl(value) {
  const v = String(value ?? '');
  return /^https?:\/\//i.test(v) || v.startsWith('data:') || v.startsWith('/');
}

// ─── Equipment catalog (display data only — no dice/damage logic) ───
// Static skeleton from the equipment rules; enchantements/effets are added
// by hand on top of these entries.
export const EQUIPMENT_CATALOG = [
  {
    group: '⚔️ Épées droites — Garde',
    kind: 'arme',
    items: [
      { nom: 'Dague', de: '1d4', degats: 'tranchant/perçant', proprietes: 'Finesse, Légère, Lancer (10m), Garde' },
      { nom: 'Épée courte', de: '1d6', degats: 'tranchant/perçant', proprietes: 'Finesse, Légère, Garde' },
      { nom: 'Épée longue', de: '1d8', degats: 'tranchant/perçant', proprietes: 'Polyvalente (1d10), Garde' },
      { nom: 'Espadon (grande épée)', de: '1d12', degats: 'tranchant/perçant', proprietes: 'Deux mains, Garde' }
    ]
  },
  {
    group: '🗡 Épées courbes — Fluide',
    kind: 'arme',
    items: [
      { nom: 'Serpe', de: '1d4', degats: 'tranchant', proprietes: 'Légère, Fluide' },
      { nom: 'Épée courbe (cimeterre)', de: '1d6', degats: 'tranchant', proprietes: 'Finesse, Légère, Fluide' },
      { nom: 'Katana (sabre long)', de: '1d10', degats: 'tranchant', proprietes: 'Finesse, Deux mains, Fluide' },
      { nom: 'Grand sabre', de: '1d12', degats: 'tranchant', proprietes: 'Deux mains, Fluide' }
    ]
  },
  {
    group: '🪓 Haches — Brutalité',
    kind: 'arme',
    items: [
      { nom: 'Hachette', de: '1d6', degats: 'tranchant', proprietes: 'Légère, Lancer (10m), Brutalité' },
      { nom: 'Hache d’armes', de: '1d8', degats: 'tranchant', proprietes: 'Polyvalente (1d10), Brutalité' },
      { nom: 'Grande hache', de: '1d12', degats: 'tranchant', proprietes: 'Deux mains, Brutalité' }
    ]
  },
  {
    group: '🔨 Massues — Impact',
    kind: 'arme',
    items: [
      { nom: 'Gourdin', de: '1d4', degats: 'contondant', proprietes: 'Improvisée, Brute, Impact' },
      { nom: 'Marteau de guerre', de: '1d8', degats: 'contondant', proprietes: 'Polyvalente (1d10), Impact' },
      { nom: 'Grand marteau', de: '1d12', degats: 'contondant', proprietes: 'Deux mains, Impact' }
    ]
  },
  {
    group: '🪶 Armes à allonge — Allonge',
    kind: 'arme',
    items: [
      { nom: 'Bâton long', de: '1d6', degats: 'contondant', proprietes: 'Allonge' },
      { nom: 'Lance', de: '1d8', degats: 'perçant', proprietes: 'Polyvalente (1d10), Allonge' },
      { nom: 'Hallebarde', de: '1d12', degats: 'tranchant', proprietes: 'Deux mains, Allonge' }
    ]
  },
  {
    group: '🏹 Arcs — Surplomb',
    kind: 'arme',
    items: [
      { nom: 'Arc court', de: '1d6', degats: 'perçant', proprietes: 'Distance, Deux mains, Surplomb' },
      { nom: 'Arc long', de: '1d8', degats: 'perçant', proprietes: 'Distance, Deux mains, Surplomb' }
    ]
  },
  {
    group: '🔫 Arbalètes — Perforant',
    kind: 'arme',
    items: [
      { nom: 'Arbalète de poing', de: '1d4', degats: 'perçant', proprietes: 'Distance, Brute, Tir léger, Secondaire, Perforant' },
      { nom: 'Arbalète', de: '1d8', degats: 'perçant', proprietes: 'Distance, Deux mains, Perforant' },
      { nom: 'Arbalète lourde', de: '1d12', degats: 'perçant', proprietes: 'Distance, Deux mains, Recharge, Perforant' }
    ]
  },
  {
    group: '🔮 Catalyseurs',
    kind: 'arme',
    items: [
      { nom: 'Focus', de: '1d4', degats: 'magique/élémentaire', proprietes: 'Distance, Brute, Tir léger, Secondaire, Catalyseur' },
      { nom: 'Bâton', de: '1d8', degats: 'magique/élémentaire', proprietes: 'Distance, Deux mains, Catalyseur' }
    ]
  },
  {
    group: '🛡️ Boucliers — Rempart',
    kind: 'arme',
    items: [{ nom: 'Bouclier', de: '1d4', degats: 'contondant', proprietes: 'Brute, Secondaire, Rempart' }]
  },
  {
    group: 'Armes uniques',
    kind: 'arme',
    items: [
      { nom: 'Faux', de: '1d10', degats: 'tranchant', proprietes: 'Deux mains, Fluide, Allonge' },
      { nom: 'Twinblade', de: '1d8', degats: 'tranchant', proprietes: 'Deux mains, Double Frappe' },
      { nom: 'Rapière', de: '1d8', degats: 'perçant', proprietes: 'Finesse, Contre d’Estoc' },
      { nom: 'Fouet', de: '1d6', degats: 'tranchant', proprietes: 'Finesse, Entrave' },
      { nom: 'Fist weapons', de: '1d4', degats: 'contondant', proprietes: 'Comme mains nues, Brute' },
      { nom: 'Fléau', de: '1d8', degats: 'perçant', proprietes: 'Déstabilisation' }
    ]
  },
  {
    group: '🛡️ Armures',
    kind: 'armure',
    items: [
      { nom: 'Plastron', de: '', degats: '', proprietes: 'Déflexion + Armure (plastron)' },
      { nom: 'Casque', de: '', degats: '', proprietes: 'Déflexion + Volonté (casque)' },
      { nom: 'Bottes', de: '', degats: '', proprietes: 'Déflexion + Vitesse (bottes)' },
      { nom: 'Gantelets', de: '', degats: '', proprietes: 'Déflexion + Initiative (gantelets)' }
    ]
  }
];

/**
 * Find a catalog entry by name (returns it with its group + kind).
 * @param {string} [nom] - Catalog item name
 * @returns {Object|null} { nom, de, degats, proprietes, group, kind }
 */
export function findEquipmentTemplate(nom) {
  if (!nom) return null;
  for (const group of EQUIPMENT_CATALOG) {
    const hit = group.items.find((item) => item.nom === nom);
    if (hit) return { ...hit, group: group.group, kind: group.kind };
  }
  return null;
}

/**
 * Detect the action type of a capacity from its free-text usage field.
 * "Bonus action" must be checked before "action"; "Réaction" before both.
 * @param {string} usage - Free-text usage (e.g. "Bonus action / Concentration")
 * @returns {{label: string, color: string}|null} Colored type badge or null
 */
export function capacityType(usage) {
  const u = (usage || '').toLowerCase();
  if (u.includes('réaction') || u.includes('reaction')) {
    return { label: 'RÉACTION', color: '#f87171' };
  }
  if (u.includes('bonus')) {
    return { label: 'BONUS ACTION', color: '#4ade80' };
  }
  if (u.includes('action')) {
    return { label: 'ACTION', color: '#60a5fa' };
  }
  if (u.includes('concentration')) {
    return { label: 'CONCENTRATION', color: '#c084fc' };
  }
  return null;
}

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
    feats: [],
    evolutions: [],
    notes: '',
    pinnedSkills: [],
    pinnedCapacities: [],
    actionChecks: { action: false, bonus: false, reaction: false }
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

/** Maximum serialized character sheet size accepted on import (~1 MB). */
export const MAX_SHEET_BYTES = 1_000_000;

/**
 * Recursively replace embedded base64 data URLs with empty strings.
 * External URLs (http/https) and asset paths are left untouched.
 * Mutates the passed value and returns the number of stripped values.
 * @param {unknown} value - Parsed JSON to clean
 * @returns {number} Number of stripped values
 */
export function stripBase64Images(value) {
  let stripped = 0;
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        if (typeof node[i] === 'string') {
          if (node[i].startsWith('data:')) {
            node[i] = '';
            stripped++;
          }
        } else if (node[i] && typeof node[i] === 'object') {
          walk(node[i]);
        }
      }
    } else if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        if (typeof node[key] === 'string') {
          if (node[key].startsWith('data:')) {
            node[key] = '';
            stripped++;
          }
        } else if (node[key] && typeof node[key] === 'object') {
          walk(node[key]);
        }
      }
    }
  };
  walk(value);
  return stripped;
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

    // Strip embedded base64 images: they bloat payloads to tens of MB
    // and make Supabase time out. External URLs are preserved.
    const strippedImages = stripBase64Images(parsed);
    if (strippedImages > 0) {
      console.warn(`Stripped ${strippedImages} embedded image(s) from character sheet import`);
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

    // Exports often carry free-text race names ("Haut Elfe") — canonize to
    // the race id so game-side race lookups keep working.
    merged.identity.race = normalizeRaceName(merged.identity.race);

    const synced = syncStatsFromEquipment(syncSkillBonuses(merged));

    const payloadBytes = JSON.stringify(synced).length;
    if (payloadBytes > MAX_SHEET_BYTES) {
      throw new Error(
        `Fiche trop volumineuse (${(payloadBytes / 1048576).toFixed(1)} Mo, limite 1 Mo). Retirez les images intégrées du fichier JSON.`
      );
    }

    return await saveCharacterSheet(playerId, roomId, synced);
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
 * Coerce any value to a finite number, defaulting to 0.
 * Sheet fields are often "" or numeric strings.
 * @param {unknown} value - Value to coerce
 * @returns {number}
 */
export function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Weapon categories are free-text fields, so they are detected by keyword.
// ponytail: keyword matching on weapon text, structured `categorie` field if misclassification bites
const SHIELD_RE = /\b(bouclier|rempart)\b/;
const STRAIGHT_SWORD_RE = /\b(epees? droites?|garde)\b/;
const RANGED_RE = /\b(distance|tir|lancer|javelot|fronde|arbalete|arc)\b/;

/**
 * Join all string values of a weapon into normalized (lowercase,
 * accent-free) text for keyword detection.
 * @param {Object} [weapon]
 * @returns {string}
 */
function weaponText(weapon) {
  return Object.values(weapon ?? {})
    .filter((v) => typeof v === 'string')
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Garde contribution of one equipped melee weapon: its die / 2
 * (e.g. "1d8" → 4, "2d6" → 6). Ranged weapons contribute nothing.
 * Dual wield naturally sums via equipmentStats.
 * @param {Object} [weapon]
 * @returns {number}
 */
function weaponGarde(weapon) {
  if (!weapon?.equipped || RANGED_RE.test(weaponText(weapon))) return 0;
  const match = String(weapon?.de ?? '').match(/(\d*)\s*d\s*(\d+)/i);
  if (!match) return 0;
  const count = match[1] === '' ? 1 : parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  if (!(count >= 1) || !(sides >= 2)) return 0;
  return Math.floor((count * sides) / 2);
}

/**
 * Derive stats from equipped gear. Only the 7 equipment slots and weapons
 * flagged as equipped count; inventory items never contribute.
 * Garde = sum of equipped melee weapons' die / 2 (dual wield sums both).
 * @param {Object} [equipment] - Equipment slots object
 * @param {Array} [weapons] - Weapons array (each may carry `equipped: true`)
 * @returns {{deflexion: number, armure: number, volonte: number, garde: number}}
 */
export function equipmentStats(equipment = {}, weapons = []) {
  const slots = Object.values(equipment ?? {});
  const sum = (field) => slots.reduce((total, slot) => total + toNumber(slot?.[field]), 0);
  const garde = (weapons ?? []).reduce((total, w) => total + weaponGarde(w), 0);
  return {
    deflexion: sum('deflexion'),
    armure: sum('armure'),
    volonte: sum('volonte'),
    garde,
  };
}

/**
 * Parade modifier from the equipped weapons: Agilité, except with a
 * shield (Force) or a straight sword / "Garde" weapon (Force + Agilité).
 * @param {Array} [weapons] - Weapons array
 * @param {Object} [stats] - Raw stat scores
 * @returns {number}
 */
export function paradeModifier(weapons = [], stats = {}) {
  const equipped = (weapons ?? []).filter((w) => w?.equipped);
  const mod = (key) => statModifier(weaponStatScore(stats, key));
  if (equipped.some((w) => SHIELD_RE.test(weaponText(w)))) return mod('force');
  if (equipped.some((w) => STRAIGHT_SWORD_RE.test(weaponText(w)))) {
    return mod('force') + mod('agilite');
  }
  return mod('agilite');
}

/**
 * Stat score with missing values treated as 10 (modifier 0).
 * @param {Object} [stats]
 * @param {string} key - Stat key
 * @returns {number}
 */
function weaponStatScore(stats, key) {
  const score = Number(stats?.[key]);
  return Number.isFinite(score) ? score : 10;
}

/**
 * Attack bonus of one weapon: modifier of its governing stat (the
 * free-text `forceAgi` field: force / agilité / esprit) + the weapon's
 * tier (its `bonus` field) — what gets added to the weapon's die.
 * @param {Object} [weapon]
 * @param {Object} [stats] - Raw stat scores
 * @returns {number}
 */
export function attackBonus(weapon, stats = {}) {
  const key = normalizeStatName(weapon?.forceAgi);
  const statMod = key ? statModifier(weaponStatScore(stats, key)) : 0;
  return statMod + toNumber(weapon?.bonus);
}

/**
 * Compute all rule-derived combat values from a sheet.
 * - parade      = déflexion (equipped items) + garde (melee die/2) + modificateur
 * - initiative  = Agilité - 10 + initiative des gantelets
 * - mouvement   = 8 + Agilité/2 + vitesse des bottes
 * - volonte     = modificateur de Résilience + volonté du casque
 * - seuilMiss   = max(1, 1 - mod Agilité)
 * - canalisation = modificateur d'Esprit
 * - bonusAttaque = attack bonus of the first equipped weapon
 * @param {Object} [sheet] - Character sheet data
 * @returns {Object} Computed values
 */
export function computeDerived(sheet = {}) {
  const stats = sheet?.stats ?? {};
  const equipment = sheet?.equipment ?? {};
  const weapons = sheet?.weapons ?? [];
  const eq = equipmentStats(equipment, weapons);
  const agiMod = statModifier(weaponStatScore(stats, 'agilite'));
  const gantelets = toNumber(equipment.gantelets?.initiative);
  const bottes = toNumber(equipment.bottes?.vitesse);
  const casque = toNumber(equipment.casque?.volonte);
  const firstEquipped = (weapons ?? []).find((w) => w?.equipped);
  const paradeBonus = paradeModifier(weapons, stats);
  return {
    ...eq,
    // Rule value: resilience modifier + casque. (eq.volonte above is the raw slot sum.)
    volonte: skillModifier(stats, 'resilience') + casque,
    paradeBonus,
    parade: eq.deflexion + eq.garde + paradeBonus,
    initiative: weaponStatScore(stats, 'agilite') - 10 + gantelets,
    mouvement: 8 + Math.floor(weaponStatScore(stats, 'agilite') / 2) + bottes,
    seuilMiss: Math.max(1, 1 - agiMod),
    canalisation: statModifier(weaponStatScore(stats, 'esprit')),
    bonusAttaque: firstEquipped ? attackBonus(firstEquipped, stats) : 0,
  };
}

/**
 * Overwrite stored defense/derived fields with computed values.
 * All combat values are rule-derived; none are manual anymore.
 * @param {Object} sheet - Character sheet data
 * @returns {Object} New sheet object with synced fields
 */
export function syncStatsFromEquipment(sheet) {
  if (!sheet) return sheet;
  const c = computeDerived(sheet);
  return {
    ...sheet,
    defense: {
      ...(sheet.defense ?? {}),
      deflexion: c.deflexion,
      armure: c.armure,
      gardeBonus: c.garde,
      bonus: c.paradeBonus,
    },
    derived: {
      ...(sheet.derived ?? {}),
      volonte: c.volonte,
      initiative: c.initiative,
      mouvement: c.mouvement,
      seuilMiss: c.seuilMiss,
      canalisation: c.canalisation,
      bonusAttaque: c.bonusAttaque,
    },
  };
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
 * Compute a skill's modifier from its governing stat.
 * Falls back to `fallback` for unknown skills or missing scores.
 * @param {Object} [stats] - Raw stat scores ({ force, agilite, esprit, social })
 * @param {string} skill - Skill key (e.g. "arcanes")
 * @param {number} [fallback] - Value when the skill has no governing stat
 * @returns {number}
 */
export function skillModifier(stats, skill, fallback = 0) {
  const key = SKILL_TO_STAT[String(skill ?? '').toLowerCase()];
  if (!key) return fallback;
  const score = Number(stats?.[key]);
  if (!Number.isFinite(score)) return fallback;
  return statModifier(score);
}

/**
 * Rewrite stored skill bonuses from governing stat modifiers.
 * Skills without a governing stat keep their stored bonus.
 * @param {Object} sheet - Character sheet data
 * @returns {Object} New sheet object with synced bonuses
 */
export function syncSkillBonuses(sheet) {
  if (!sheet?.skills) return sheet;
  const skills = {};
  for (const [skill, data] of Object.entries(sheet.skills)) {
    skills[skill] = {
      ...data,
      bonus: SKILL_TO_STAT[skill] ? skillModifier(sheet.stats, skill, data?.bonus ?? 0) : (data?.bonus ?? 0),
    };
  }
  return { ...sheet, skills };
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
