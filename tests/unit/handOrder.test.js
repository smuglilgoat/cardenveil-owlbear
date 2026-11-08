import { jest } from '@jest/globals';

// jsdom has no localStorage unless the environment provides one; give it one.
const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const { applyHandOrder, getHandOrder, setHandOrder } = await import('../../src/lib/handOrder.js');

const cards = [
  { id: 'a', suit: '♠' },
  { id: 'b', suit: '♥' },
  { id: 'c', suit: '♦' },
  { id: 'd', suit: '♣' },
];

describe('hand order', () => {
  it('leaves the hand untouched when there is no order', () => {
    expect(applyHandOrder(cards, {})).toEqual(cards);
  });

  it('applies the player ranks', () => {
    const ordered = applyHandOrder(cards, { c: 0, a: 1, b: 2 });
    expect(ordered.map((c) => c.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('keeps a card without a rank last, in its sorted order', () => {
    const ordered = applyHandOrder(cards, { d: 0 });
    expect(ordered.map((c) => c.id)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('round-trips through the store', () => {
    setHandOrder('room-1', 'player-1', { b: 0, a: 1 });
    expect(getHandOrder('room-1', 'player-1')).toEqual({ b: 0, a: 1 });
    expect(getHandOrder('room-2', 'player-1')).toEqual({});
  });
});
