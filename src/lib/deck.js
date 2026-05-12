const SUITS = [
  { symbol: '♠', isRed: false, id: 'S' },
  { symbol: '♣', isRed: false, id: 'C' },
  { symbol: '♥', isRed: true,  id: 'H' },
  { symbol: '♦', isRed: true,  id: 'D' },
];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function createDeck() {
  const cards = [];
  for (const suit of SUITS) {
    for (let i = 0; i < VALUES.length; i++) {
      cards.push({
        id: `${suit.id}-${VALUES[i]}`,
        suit: suit.symbol,
        value: VALUES[i],
        numericValue: i + 1,
        isRed: suit.isRed,
      });
    }
  }
  return cards;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const createShuffledDeck = () => shuffle(createDeck());

export function createEmptyPlayer(name = '') {
  return {
    name,
    hand: [],
    crystallized: [],
    tokens: { force: 3, agilite: 3, esprit: 3, social: 3 },
    maxTokens: { force: 3, agilite: 3, esprit: 3, social: 3 },
  };
}

export function createInitialGameState() {
  return {
    deck: createShuffledDeck(),
    discard: [],
    players: {},
  };
}
