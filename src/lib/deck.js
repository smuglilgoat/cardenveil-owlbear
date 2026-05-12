const SUITS = [
  { symbol: '♠', isRed: false, id: 'S' },
  { symbol: '♣', isRed: false, id: 'C' },
  { symbol: '♥', isRed: true,  id: 'H' },
  { symbol: '♦', isRed: true,  id: 'D' },
];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Normal stack: 3 full 52-card decks shuffled together (156 cards).
 * IDs are prefixed with 'n-' and include the copy number.
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
 * Specialized stack: 3x52 cards separated into 4 piles by suit (39 cards each).
 * IDs are prefixed with 's-' to avoid collision with normal deck cards.
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
    tokens: { force: 3, agilite: 3, esprit: 3, social: 3 },
    maxTokens: { force: 3, agilite: 3, esprit: 3, social: 3 },
  };
}

export function createInitialGameState() {
  return {
    normalDeck: createNormalDeck(),
    specializedDecks: createSpecializedDecks(),
    discard: [],
    pendingExchanges: [],
    gmId: null,
    gmCharacterId: null,
    players: {},
  };
}
