const SUITS = [
  { symbol: '♠', isRed: false, id: 'S' },
  { symbol: '♣', isRed: false, id: 'C' },
  { symbol: '♥', isRed: true,  id: 'H' },
  { symbol: '♦', isRed: true,  id: 'D' },
];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const SUIT_BY_ID = {
  S: { symbol: '♠', isRed: false },
  C: { symbol: '♣', isRed: false },
  H: { symbol: '♥', isRed: true  },
  D: { symbol: '♦', isRed: true  },
};

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

/** Create a specific card (by suit symbol + value) with a fresh unique ID. */
export function makeCard(suitSymbol, value, prefix = 'n') {
  const suit = SUITS.find(s => s.symbol === suitSymbol);
  const i    = VALUES.indexOf(value);
  return { id: `${prefix}-${suit.id}-${value}-${uid()}`, suit: suit.symbol, value, numericValue: i + 1, isRed: suit.isRed };
}

/** Draw one random card from the full 52-card set (normal pool, infinite). */
export function drawNormal(min = 1, max = 13) {
  const pool   = VALUES.filter((_, i) => i + 1 >= min && i + 1 <= max);
  const arr    = pool.length > 0 ? pool : VALUES;
  const suit   = SUITS[Math.floor(Math.random() * SUITS.length)];
  const value  = arr[Math.floor(Math.random() * arr.length)];
  const i      = VALUES.indexOf(value);
  return { id: `n-${suit.id}-${value}-${uid()}`, suit: suit.symbol, value, numericValue: i + 1, isRed: suit.isRed };
}

/** Draw one random card from the 13 cards of the given suit (specialized pool, infinite). */
export function drawSpecialized(suitSymbol, min = 1, max = 13) {
  const pool   = VALUES.filter((_, i) => i + 1 >= min && i + 1 <= max);
  const arr    = pool.length > 0 ? pool : VALUES;
  const suit   = SUITS.find(s => s.symbol === suitSymbol);
  const value  = arr[Math.floor(Math.random() * arr.length)];
  const i      = VALUES.indexOf(value);
  return { id: `s-${suit.id}-${value}-${uid()}`, suit: suit.symbol, value, numericValue: i + 1, isRed: suit.isRed };
}

/** All 52 cards of the standard deck (for swap picker UI). */
export function fullDeck() {
  return SUITS.flatMap(suit =>
    VALUES.map((value, i) => ({
      id: `pick-${suit.id}-${value}`,
      suit: suit.symbol, value, numericValue: i + 1, isRed: suit.isRed,
    }))
  );
}

/** All 13 cards of a given suit (for swap picker UI). */
export function fullSuit(suitSymbol) {
  const suit = SUITS.find(s => s.symbol === suitSymbol);
  return VALUES.map((value, i) => ({
    id: `pick-${suit.id}-${value}`,
    suit: suit.symbol, value, numericValue: i + 1, isRed: suit.isRed,
  }));
}

/** Reconstruct a full card object from its ID string. */
export function cardFromId(id) {
  // id format: "{prefix}-{suitId}-{value}-{copy}"  e.g. "n-S-10-1"
  const parts = id.split('-');
  const suitId = parts[1];
  const value  = parts[2];
  const { symbol, isRed } = SUIT_BY_ID[suitId];
  return { id, suit: symbol, value, numericValue: VALUES.indexOf(value) + 1, isRed };
}

/** Accept an ID string or an already-hydrated card object. */
function toCard(item) {
  return typeof item === 'string' ? cardFromId(item) : item;
}

/**
 * Normal stack: 3 full 52-card decks shuffled together (156 cards).
 */
export function createNormalDeck() {
  const cards = [];
  for (let copy = 1; copy <= 3; copy++) {
    for (const suit of SUITS) {
      for (let i = 0; i < VALUES.length; i++) {
        cards.push({
          id: `n-${suit.id}-${VALUES[i]}-${copy}`,
          suit: suit.symbol,
          value: VALUES[i],
          numericValue: i + 1,
          isRed: suit.isRed,
        });
      }
    }
  }
  return shuffle(cards);
}

/**
 * Specialized stack: 3×52 cards split into 4 piles by suit (39 cards each).
 */
export function createSpecializedDecks() {
  const decks = {};
  for (const suit of SUITS) {
    const cards = [];
    for (let copy = 1; copy <= 3; copy++) {
      for (let i = 0; i < VALUES.length; i++) {
        cards.push({
          id: `s-${suit.id}-${VALUES[i]}-${copy}`,
          suit: suit.symbol,
          value: VALUES[i],
          numericValue: i + 1,
          isRed: suit.isRed,
        });
      }
    }
    decks[suit.symbol] = shuffle(cards);
  }
  return decks;
}

/** Reserved ID for the optional GM player-character */
export const GM_CHAR_ID = '__gm_char__';

export function createEmptyPlayer(name = '') {
  return {
    name,
    hand: [],
    crystallized: [],
    maxHandSize: 3,
    tokens:       { force: 3, agilite: 3, esprit: 3, social: 3 },
    maxTokens:    { force: 3, agilite: 3, esprit: 3, social: 3 },
    minDrawValue:  1,
    maxDrawValue:  13,
    grayedCards:   [],
    spiritBounds:  0,
  };
}

export function createInitialGameState() {
  return {
    discard:          [],
    pendingExchanges: [],
    gmId:             null,
    gmCharacterId:    null,
    players:          {},
    logs:             [],
  };
}

const LOG_LIMIT = 200;

/**
 * Append a log entry to state. Trims to the last LOG_LIMIT entries.
 * @param {object} state
 * @param {string} playerId
 * @param {string} playerName
 * @param {string} msg
 */
export function addLog(state, playerId, playerName, msg) {
  const entry = { id: uid(), ts: Date.now(), playerId, playerName, msg };
  const logs = [...(state.logs ?? []), entry];
  return { ...state, logs: logs.length > LOG_LIMIT ? logs.slice(-LOG_LIMIT) : logs };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hydration / Dehydration
//
// OBR room metadata has a limited payload size. Storing full card objects
// (id + suit + value + numericValue + isRed) for 156 + 156 cards would
// exceed that limit. Instead we store only card ID strings (~9 chars each)
// and reconstruct full objects on the client side.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert raw OBR-stored state (ID strings everywhere) back to runtime state
 * (full card objects). Also handles legacy formats where full objects were stored.
 */
export function hydrateState(raw) {
  const players = {};
  for (const [id, p] of Object.entries(raw.players ?? {})) {
    players[id] = {
      ...p,
      maxHandSize:  p.maxHandSize  ?? 3,
      hand:         (p.hand        ?? []).map(toCard),
      crystallized: (p.crystallized ?? []).map(toCard),
      tokens:       p.tokens    ?? { force: 3, agilite: 3, esprit: 3, social: 3 },
      maxTokens:    p.maxTokens ?? { force: 3, agilite: 3, esprit: 3, social: 3 },
      minDrawValue: p.minDrawValue ?? 1,
      maxDrawValue: p.maxDrawValue ?? 13,
      grayedCards:  p.grayedCards  ?? [],
      spiritBounds: p.spiritBounds ?? 0,
    };
  }

  const pendingExchanges = (raw.pendingExchanges ?? []).map(ex => ({
    ...ex,
    fromCard: toCard(ex.fromCard),
  }));

  return {
    discard:          (raw.discard ?? []).map(toCard),
    pendingExchanges,
    gmId:             raw.gmId          ?? null,
    gmCharacterId:    raw.gmCharacterId ?? null,
    players,
    logs:             raw.logs ?? [],
  };
}

/**
 * Convert runtime state (full card objects) to compact storage state (ID strings only).
 * This is what gets written to OBR metadata.
 */
export function dehydrateState(state) {
  const toId = c => c.id;

  const players = {};
  for (const [id, p] of Object.entries(state.players)) {
    players[id] = {
      ...p,
      hand:         p.hand.map(toId),
      crystallized: p.crystallized.map(toId),
    };
  }

  return {
    discard:          state.discard.map(toId),
    pendingExchanges: state.pendingExchanges.map(ex => ({ ...ex, fromCard: ex.fromCard.id })),
    gmId:             state.gmId,
    gmCharacterId:    state.gmCharacterId,
    players,
    logs:             state.logs ?? [],
  };
}
