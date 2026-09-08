import {
  sortCards,
  makePendingCard,
  handCap,
  GM_CHAR_ID,
  RACES,
  FATIGUE_PENALTY,
} from '../../src/lib/deck.js';

describe('Deck Utilities', () => {
  describe('sortCards', () => {
    it('should sort cards by suit then value', () => {
      const cards = [
        { id: '1', suit: '♠', value: '5', numericValue: 5, _pending: false },
        { id: '2', suit: '♥', value: '3', numericValue: 3, _pending: false },
        { id: '3', suit: '♥', value: '7', numericValue: 7, _pending: false },
        { id: '4', suit: '♣', value: '2', numericValue: 2, _pending: false },
      ];

      const sorted = sortCards(cards);

      expect(sorted[0].suit).toBe('♥');
      expect(sorted[0].value).toBe('3');
      expect(sorted[1].suit).toBe('♥');
      expect(sorted[1].value).toBe('7');
      expect(sorted[2].suit).toBe('♣');
      expect(sorted[3].suit).toBe('♠');
    });

    it('should place pending cards at the end', () => {
      const cards = [
        { id: '1', suit: '♠', value: '5', numericValue: 5, _pending: false },
        { id: '2', suit: '♥', value: '3', numericValue: 3, _pending: true },
        { id: '3', suit: '♣', value: '2', numericValue: 2, _pending: false },
      ];

      const sorted = sortCards(cards);

      expect(sorted[2]._pending).toBe(true);
    });
  });

  describe('makePendingCard', () => {
    it('should create pending card with correct structure', () => {
      const card = makePendingCard();

      expect(card._pending).toBe(true);
      expect(card.suit).toBe('');
      expect(card.value).toBe('?');
      expect(card.numericValue).toBe(0);
      expect(card.id).toMatch(/^pending-/);
    });

    it('should generate unique IDs', () => {
      const card1 = makePendingCard();
      const card2 = makePendingCard();

      expect(card1.id).not.toBe(card2.id);
    });
  });

  describe('handCap', () => {
    it('should return base hand size', () => {
      const player = { maxHandSize: 5, spiritBounds: 0, race: null };
      expect(handCap(player)).toBe(5);
    });

    it('should add spirit bounds', () => {
      const player = { maxHandSize: 3, spiritBounds: 2, race: null };
      expect(handCap(player)).toBe(5);
    });

    it('should add haut-elfe bonus', () => {
      const player = { maxHandSize: 3, spiritBounds: 0, race: 'haut-elfe' };
      expect(handCap(player)).toBe(4);
    });
  });

  describe('Constants', () => {
    it('should have GM_CHAR_ID defined', () => {
      expect(GM_CHAR_ID).toBe('__gm_char__');
    });

    it('should have RACES array', () => {
      expect(Array.isArray(RACES)).toBe(true);
      expect(RACES.length).toBeGreaterThan(0);
      expect(RACES[0]).toHaveProperty('id');
      expect(RACES[0]).toHaveProperty('label');
    });

    it('should have FATIGUE_PENALTY array', () => {
      expect(Array.isArray(FATIGUE_PENALTY)).toBe(true);
      expect(FATIGUE_PENALTY[0]).toBe(0);
      expect(FATIGUE_PENALTY[1]).toBe(1);
    });
  });
});
