import {
  createInitialGameState,
  createEmptyPlayer,
  drawNormal,
  drawSpecialized,
  makeCard,
  cardFromId,
  hydrateState,
  dehydrateState,
  applyAction,
  handCap,
  addLog,
  GM_CHAR_ID,
} from '../../netlify/functions/_gameLogic.js';

describe('Game Logic', () => {
  describe('createInitialGameState', () => {
    it('should create initial game state with correct structure', () => {
      const state = createInitialGameState();
      
      expect(state).toHaveProperty('discard');
      expect(state).toHaveProperty('pendingExchanges');
      expect(state).toHaveProperty('gmId');
      expect(state).toHaveProperty('gmCharacterId');
      expect(state).toHaveProperty('players');
      expect(state).toHaveProperty('logs');
      expect(state).toHaveProperty('initiativeUrl');
      
      expect(Array.isArray(state.discard)).toBe(true);
      expect(Array.isArray(state.pendingExchanges)).toBe(true);
      expect(typeof state.players).toBe('object');
      expect(Array.isArray(state.logs)).toBe(true);
    });
  });

  describe('createEmptyPlayer', () => {
    it('should create empty player with default values', () => {
      const player = createEmptyPlayer('Test Player');
      
      expect(player.name).toBe('Test Player');
      expect(player.hand).toEqual([]);
      expect(player.crystallized).toEqual([]);
      expect(player.maxHandSize).toBe(3);
      expect(player.tokens).toEqual({ force: 3, agilite: 3, esprit: 3, social: 3 });
      expect(player.maxTokens).toEqual({ force: 3, agilite: 3, esprit: 3, social: 3 });
      expect(player.minDrawValue).toBe(1);
      expect(player.maxDrawValue).toBe(13);
      expect(player.grayedCards).toEqual([]);
      expect(player.spiritBounds).toBe(0);
      expect(player.fatigue).toBe(0);
      expect(player.race).toBeNull();
      expect(player.tieflingDrawEligible).toBe(true);
      expect(player.pendingHalfling).toBeNull();
    });
  });

  describe('drawNormal', () => {
    it('should draw a card with valid structure', () => {
      const card = drawNormal();
      
      expect(card).toHaveProperty('id');
      expect(card).toHaveProperty('suit');
      expect(card).toHaveProperty('value');
      expect(card).toHaveProperty('numericValue');
      expect(card).toHaveProperty('isRed');
      
      expect(['♠', '♣', '♥', '♦']).toContain(card.suit);
      expect(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']).toContain(card.value);
      expect(card.numericValue).toBeGreaterThanOrEqual(1);
      expect(card.numericValue).toBeLessThanOrEqual(13);
    });

    it('should respect min/max draw range', () => {
      for (let i = 0; i < 20; i++) {
        const card = drawNormal(5, 10);
        expect(card.numericValue).toBeGreaterThanOrEqual(5);
        expect(card.numericValue).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('drawSpecialized', () => {
    it('should draw a card from specified suit', () => {
      const card = drawSpecialized('♥');
      
      expect(card.suit).toBe('♥');
      expect(card.isRed).toBe(true);
      expect(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']).toContain(card.value);
    });

    it('should draw black suits correctly', () => {
      const spade = drawSpecialized('♠');
      expect(spade.suit).toBe('♠');
      expect(spade.isRed).toBe(false);
      
      const club = drawSpecialized('♣');
      expect(club.suit).toBe('♣');
      expect(club.isRed).toBe(false);
    });
  });

  describe('makeCard', () => {
    it('should create a card with specified suit and value', () => {
      const card = makeCard('♦', 'A', 'n');
      
      expect(card.suit).toBe('♦');
      expect(card.value).toBe('A');
      expect(card.numericValue).toBe(13);
      expect(card.isRed).toBe(true);
      expect(card.id).toMatch(/^n-D-A-/);
    });
  });

  describe('handCap', () => {
    it('should return base hand size for normal player', () => {
      const player = createEmptyPlayer();
      player.maxHandSize = 5;
      
      expect(handCap(player)).toBe(5);
    });

    it('should add spirit bounds to hand cap', () => {
      const player = createEmptyPlayer();
      player.maxHandSize = 3;
      player.spiritBounds = 2;
      
      expect(handCap(player)).toBe(5);
    });

    it('should add racial bonus for haut-elfe', () => {
      const player = createEmptyPlayer();
      player.maxHandSize = 3;
      player.race = 'haut-elfe';
      
      expect(handCap(player)).toBe(4);
    });

    it('should combine all bonuses', () => {
      const player = createEmptyPlayer();
      player.maxHandSize = 3;
      player.spiritBounds = 1;
      player.race = 'haut-elfe';
      
      expect(handCap(player)).toBe(5);
    });
  });

  describe('hydrateState', () => {
    it('should convert card IDs to card objects', () => {
      const raw = {
        players: {
          'player-1': {
            name: 'Test',
            hand: ['n-S-5-abc123'],
            crystallized: ['s-H-7-xyz789'],
          }
        },
        discard: ['n-C-3-def456'],
        pendingExchanges: [],
        logs: [],
      };
      
      const state = hydrateState(raw);
      
      expect(state.players['player-1'].hand[0]).toHaveProperty('suit', '♠');
      expect(state.players['player-1'].hand[0]).toHaveProperty('value', '5');
      expect(state.players['player-1'].crystallized[0]).toHaveProperty('suit', '♥');
      expect(state.discard[0]).toHaveProperty('suit', '♣');
    });

    it('should apply default values for missing fields', () => {
      const raw = {
        players: {
          'player-1': {
            name: 'Test',
          }
        }
      };
      
      const state = hydrateState(raw);
      const player = state.players['player-1'];
      
      expect(player.hand).toEqual([]);
      expect(player.crystallized).toEqual([]);
      expect(player.maxHandSize).toBe(3);
      expect(player.tokens).toEqual({ force: 3, agilite: 3, esprit: 3, social: 3 });
    });
  });

  describe('dehydrateState', () => {
    it('should convert card objects to IDs', () => {
      const state = {
        players: {
          'player-1': {
            name: 'Test',
            hand: [{ id: 'n-S-5-abc123', suit: '♠', value: '5' }],
            crystallized: [{ id: 's-H-7-xyz789', suit: '♥', value: '7' }],
          }
        },
        discard: [{ id: 'n-C-3-def456', suit: '♣', value: '3' }],
        pendingExchanges: [],
        logs: [],
      };
      
      const raw = dehydrateState(state);
      
      expect(raw.players['player-1'].hand).toEqual(['n-S-5-abc123']);
      expect(raw.players['player-1'].crystallized).toEqual(['s-H-7-xyz789']);
      expect(raw.discard).toEqual(['n-C-3-def456']);
    });
  });

  describe('applyAction', () => {
    let initialState;

    beforeEach(() => {
      initialState = createInitialGameState();
      initialState.gmId = 'gm-player';
      initialState.players = {
        'player-1': createEmptyPlayer('Player 1'),
        'player-2': createEmptyPlayer('Player 2'),
      };
    });

    describe('INIT_GAME', () => {
      it('should initialize game with GM ID', () => {
        const { state } = applyAction(createInitialGameState(), {
          type: 'INIT_GAME',
          playerId: 'gm-player',
        });
        
        expect(state.gmId).toBe('gm-player');
      });
    });

    describe('SYNC_TOKENS', () => {
      it('lets a player sync their own tokens on sheet import (tokens = maxTokens = stat mods + 1)', () => {
        const { state } = applyAction(initialState, {
          type: 'SYNC_TOKENS',
          playerId: 'player-1',
          targetId: 'player-1',
          tokens: { force: 3, agilite: 4, esprit: 5, social: 1 },
        });
        expect(state.players['player-1'].tokens).toEqual({ force: 3, agilite: 4, esprit: 5, social: 1 });
        expect(state.players['player-1'].maxTokens).toEqual({ force: 3, agilite: 4, esprit: 5, social: 1 });
      });

      it('lets the GM sync any player (GM character imports)', () => {
        const { state } = applyAction(initialState, {
          type: 'SYNC_TOKENS',
          playerId: 'gm-player',
          targetId: 'player-1',
          tokens: { force: 2, agilite: 2, esprit: 2, social: 2 },
        });
        expect(state.players['player-1'].tokens).toEqual({ force: 2, agilite: 2, esprit: 2, social: 2 });
      });

      it('rejects a player syncing someone else', () => {
        const { state } = applyAction(initialState, {
          type: 'SYNC_TOKENS',
          playerId: 'player-1',
          targetId: 'player-2',
          tokens: { force: 9, agilite: 9, esprit: 9, social: 9 },
        });
        expect(state.players['player-2'].tokens).toEqual({ force: 3, agilite: 3, esprit: 3, social: 3 });
      });

      it('clamps negatives, junk and oversized values', () => {
        const { state } = applyAction(initialState, {
          type: 'SYNC_TOKENS',
          playerId: 'player-1',
          targetId: 'player-1',
          tokens: { force: -3, agilite: 'junk', esprit: 99, social: undefined },
        });
        expect(state.players['player-1'].tokens).toEqual({ force: 0, agilite: 0, esprit: 10, social: 0 });
      });
    });

    describe('SET_RACE', () => {
      it('should let the GM set any player race', () => {
        const { state } = applyAction(initialState, {
          type: 'SET_RACE',
          playerId: 'gm-player',
          targetId: 'player-1',
          race: 'tieffelin',
        });
        expect(state.players['player-1'].race).toBe('tieffelin');
      });

      it('should let a player set their own race (sheet import sync)', () => {
        const { state } = applyAction(initialState, {
          type: 'SET_RACE',
          playerId: 'player-1',
          targetId: 'player-1',
          race: 'haut-elfe',
        });
        expect(state.players['player-1'].race).toBe('haut-elfe');
      });

      it('should reject a player setting another player race', () => {
        const { state } = applyAction(initialState, {
          type: 'SET_RACE',
          playerId: 'player-1',
          targetId: 'player-2',
          race: 'aasimar',
        });
        expect(state.players['player-2'].race).toBeNull();
      });

      it('should accept the Khajeet and Gobelin race ids', () => {
        const khajeet = applyAction(initialState, {
          type: 'SET_RACE',
          playerId: 'gm-player',
          targetId: 'player-1',
          race: 'khajeet',
        }).state;
        expect(khajeet.players['player-1'].race).toBe('khajeet');
        const gobelin = applyAction(khajeet, {
          type: 'SET_RACE',
          playerId: 'gm-player',
          targetId: 'player-2',
          race: 'gobelin',
        }).state;
        expect(gobelin.players['player-2'].race).toBe('gobelin');
      });

      it('should reject unknown race ids', () => {
        const { state } = applyAction(initialState, {
          type: 'SET_RACE',
          playerId: 'gm-player',
          targetId: 'player-1',
          race: 'Humain',
        });
        expect(state.players['player-1'].race).toBeNull();
      });
    });

    describe('REGISTER_PLAYER', () => {
      it('should register new player', () => {
        const { state } = applyAction(initialState, {
          type: 'REGISTER_PLAYER',
          playerId: 'player-3',
          name: 'Player 3',
        });
        
        expect(state.players['player-3']).toBeDefined();
        expect(state.players['player-3'].name).toBe('Player 3');
      });

      it('should not overwrite existing player', () => {
        const { state } = applyAction(initialState, {
          type: 'REGISTER_PLAYER',
          playerId: 'player-1',
          name: 'New Name',
        });
        
        expect(state.players['player-1'].name).toBe('Player 1');
      });
    });

    describe('DRAW', () => {
      it('should draw a card for player', () => {
        const { state } = applyAction(initialState, {
          type: 'DRAW',
          playerId: 'player-1',
        });
        
        expect(state.players['player-1'].hand.length).toBe(1);
      });

      it('should not draw when hand is full', () => {
        initialState.players['player-1'].hand = [
          makeCard('♠', '2'),
          makeCard('♠', '3'),
          makeCard('♠', '4'),
        ];
        
        const { state } = applyAction(initialState, {
          type: 'DRAW',
          playerId: 'player-1',
        });
        
        expect(state.players['player-1'].hand.length).toBe(3);
      });

      it('should add log entry', () => {
        const { state } = applyAction(initialState, {
          type: 'DRAW',
          playerId: 'player-1',
        });
        
        expect(state.logs.length).toBeGreaterThan(0);
      });
    });

    describe('DISCARD', () => {
      it('should discard card from hand', () => {
        const card = makeCard('♠', '5');
        initialState.players['player-1'].hand = [card];
        
        const { state } = applyAction(initialState, {
          type: 'DISCARD',
          playerId: 'player-1',
          cardId: card.id,
          from: 'hand',
        });
        
        expect(state.players['player-1'].hand.length).toBe(0);
        expect(state.discard.length).toBe(1);
      });

      it('should discard card from crystallized', () => {
        const card = makeCard('♥', '7', 's');
        initialState.players['player-1'].crystallized = [card];
        
        const { state } = applyAction(initialState, {
          type: 'DISCARD',
          playerId: 'player-1',
          cardId: card.id,
          from: 'crystallized',
        });
        
        expect(state.players['player-1'].crystallized.length).toBe(0);
        expect(state.discard.length).toBe(1);
      });
    });

    describe('CRYSTALLIZE', () => {
      it('should move card from hand to crystallized', () => {
        const card = makeCard('♠', '5');
        initialState.players['player-1'].hand = [card];
        initialState.players['player-1'].spiritBounds = 1;
        
        const { state } = applyAction(initialState, {
          type: 'CRYSTALLIZE',
          playerId: 'player-1',
          cardId: card.id,
        });
        
        expect(state.players['player-1'].hand.length).toBe(0);
        expect(state.players['player-1'].crystallized.length).toBe(1);
        expect(state.players['player-1'].spiritBounds).toBe(0);
      });
    });

    describe('SPEND_TOKEN', () => {
      it('should spend token and decrement count', () => {
        const { state } = applyAction(initialState, {
          type: 'SPEND_TOKEN',
          playerId: 'player-1',
          token: 'force',
        });
        
        expect(state.players['player-1'].tokens.force).toBe(2);
      });

      it('should not spend token when count is 0', () => {
        initialState.players['player-1'].tokens.force = 0;
        
        const { state } = applyAction(initialState, {
          type: 'SPEND_TOKEN',
          playerId: 'player-1',
          token: 'force',
        });
        
        expect(state.players['player-1'].tokens.force).toBe(0);
      });
    });

    describe('PROPOSE_EXCHANGE', () => {
      it('should create pending exchange', () => {
        const card = makeCard('♠', '5');
        initialState.players['player-1'].hand = [card];
        initialState.players['player-1'].tokens.social = 1;
        
        const { state } = applyAction(initialState, {
          type: 'PROPOSE_EXCHANGE',
          playerId: 'player-1',
          cardId: card.id,
          targetId: 'player-2',
        });
        
        expect(state.pendingExchanges.length).toBe(1);
        expect(state.pendingExchanges[0].from).toBe('player-1');
        expect(state.pendingExchanges[0].to).toBe('player-2');
      });
    });

    describe('ACCEPT_EXCHANGE', () => {
      it('should complete exchange between players', () => {
        const card1 = makeCard('♠', '5');
        const card2 = makeCard('♥', '7');
        // player-1 proposed exchange, so card1 is already removed from their hand
        initialState.players['player-1'].hand = [];
        initialState.players['player-2'].hand = [card2];
        initialState.pendingExchanges = [{
          id: 'ex-1',
          from: 'player-1',
          to: 'player-2',
          fromCard: card1,
        }];
        
        const { state } = applyAction(initialState, {
          type: 'ACCEPT_EXCHANGE',
          playerId: 'player-2',
          exchangeId: 'ex-1',
          cardId: card2.id,
        });
        
        expect(state.pendingExchanges.length).toBe(0);
        // player-1 (sender) receives card2 from player-2
        expect(state.players['player-1'].hand[0].id).toBe(card2.id);
        // player-2 (recipient) receives card1 from the exchange
        expect(state.players['player-2'].hand[0].id).toBe(card1.id);
      });
    });

    describe('DECLINE_EXCHANGE', () => {
      it('should remove pending exchange and return card', () => {
        const card = makeCard('♠', '5');
        initialState.players['player-1'].hand = [];
        initialState.pendingExchanges = [{
          id: 'ex-1',
          from: 'player-1',
          to: 'player-2',
          fromCard: card,
        }];
        
        const { state } = applyAction(initialState, {
          type: 'DECLINE_EXCHANGE',
          playerId: 'player-2',
          exchangeId: 'ex-1',
        });
        
        expect(state.pendingExchanges.length).toBe(0);
        expect(state.players['player-1'].hand.length).toBe(1);
      });
    });

    describe('REST_ALL', () => {
      it('should reset all tokens to max', () => {
        initialState.players['player-1'].tokens = { force: 0, agilite: 1, esprit: 2, social: 0 };
        initialState.players['player-2'].tokens = { force: 1, agilite: 0, esprit: 0, social: 1 };
        
        const { state } = applyAction(initialState, {
          type: 'REST_ALL',
          playerId: 'gm-player',
        });
        
        expect(state.players['player-1'].tokens).toEqual({ force: 3, agilite: 3, esprit: 3, social: 3 });
        expect(state.players['player-2'].tokens).toEqual({ force: 3, agilite: 3, esprit: 3, social: 3 });
      });
    });

    describe('HARD_RESET', () => {
      it('should reset all game state', () => {
        initialState.players['player-1'].hand = [makeCard('♠', '5')];
        initialState.players['player-1'].tokens = { force: 0, agilite: 0, esprit: 0, social: 0 };
        initialState.discard = [makeCard('♥', '7')];

        const { state } = applyAction(initialState, {
          type: 'HARD_RESET',
          playerId: 'gm-player',
        });

        expect(state.players['player-1'].hand.length).toBe(0);
        expect(state.players['player-1'].tokens).toEqual({ force: 3, agilite: 3, esprit: 3, social: 3 });
        expect(state.discard.length).toBe(0);
      });
    });

    describe('USE_CAPACITY', () => {
      it('should log capacity use with dice result without touching hand or tokens', () => {
        const card = makeCard('♥', '5');
        initialState.players['player-1'].hand = [card];
        initialState.players['player-1'].tokens = { force: 1, agilite: 2, esprit: 3, social: 0 };

        const { state } = applyAction(initialState, {
          type: 'USE_CAPACITY',
          playerId: 'player-1',
          capacityName: 'Garde fulminante',
          formula: '4d6',
          total: 14,
          rolls: [6, 4, 3, 1],
        });

        expect(state.logs.length).toBe(1);
        expect(state.logs[0].playerId).toBe('player-1');
        expect(state.logs[0].msg).toContain('Garde fulminante');
        expect(state.logs[0].msg).toContain('4d6');
        expect(state.logs[0].msg).toContain('14');
        expect(state.players['player-1'].hand).toHaveLength(1);
        expect(state.players['player-1'].tokens).toEqual({ force: 1, agilite: 2, esprit: 3, social: 0 });
        expect(state.discard).toHaveLength(0);
      });

      it('should be a no-op for unknown players', () => {
        const { state } = applyAction(initialState, {
          type: 'USE_CAPACITY',
          playerId: 'unknown-player',
          capacityName: 'Garde fulminante',
          formula: '4d6',
          total: 14,
          rolls: [6, 4, 3, 1],
        });

        expect(state.logs).toHaveLength(0);
        expect(state).toBe(initialState);
      });

      it('should be a no-op when capacity payload is invalid', () => {
        const invalidActions = [
          { type: 'USE_CAPACITY', playerId: 'player-1', formula: '4d6', total: 14 },
          { type: 'USE_CAPACITY', playerId: 'player-1', capacityName: 'Garde fulminante', total: 14 },
          { type: 'USE_CAPACITY', playerId: 'player-1', capacityName: 'Garde fulminante', formula: '4d6' },
        ];

        for (const action of invalidActions) {
          const { state } = applyAction(initialState, action);
          expect(state.logs).toHaveLength(0);
        }
      });
    });
  });

  describe('addLog', () => {
    it('should add log entry to state', () => {
      const state = createInitialGameState();
      const newState = addLog(state, 'player-1', 'Player 1', 'Test message');
      
      expect(newState.logs.length).toBe(1);
      expect(newState.logs[0].playerId).toBe('player-1');
      expect(newState.logs[0].playerName).toBe('Player 1');
      expect(newState.logs[0].msg).toBe('Test message');
    });

    it('should limit log entries to LOG_LIMIT', () => {
      let state = createInitialGameState();
      for (let i = 0; i < 250; i++) {
        state = addLog(state, 'player-1', 'Player 1', `Message ${i}`);
      }
      
      expect(state.logs.length).toBeLessThanOrEqual(200);
    });
  });

  // Payload validation: card ids and exchange ids are public in the broadcast
  // state, so these guards are what stop a buggy or hostile client from moving
  // another player's cards, bricking the room, or writing NaN into tokens.
  describe('action hardening', () => {
    let state;

    beforeEach(() => {
      state = createInitialGameState();
      state.gmId = 'gm-player';
      state.players = {
        'player-1': createEmptyPlayer('Player 1'),
        'player-2': createEmptyPlayer('Player 2'),
        'player-3': createEmptyPlayer('Player 3'),
      };
    });

    function withExchange() {
      const fromCard = makeCard('♠', '5');
      const toCard = makeCard('♥', '9');
      state.players['player-1'].hand = [fromCard];
      state.players['player-2'].hand = [toCard];
      state.pendingExchanges = [{ id: 'ex-1', from: 'player-1', fromCard, to: 'player-2' }];
      return { fromCard, toCard };
    }

    it('lets only the recipient accept an exchange', () => {
      const { toCard } = withExchange();
      const { state: next } = applyAction(state, {
        type: 'ACCEPT_EXCHANGE', playerId: 'player-3', exchangeId: 'ex-1', cardId: toCard.id,
      });
      expect(next).toBe(state);
      expect(next.players['player-1'].hand[0].id).toBe(state.players['player-1'].hand[0].id);
      expect(next.pendingExchanges).toHaveLength(1);
    });

    it('lets only the recipient decline an exchange', () => {
      withExchange();
      const { state: next } = applyAction(state, {
        type: 'DECLINE_EXCHANGE', playerId: 'player-3', exchangeId: 'ex-1',
      });
      expect(next).toBe(state);
    });

    it('still lets the recipient accept', () => {
      const { fromCard, toCard } = withExchange();
      const { state: next } = applyAction(state, {
        type: 'ACCEPT_EXCHANGE', playerId: 'player-2', exchangeId: 'ex-1', cardId: toCard.id,
      });
      expect(next.pendingExchanges).toHaveLength(0);
      expect(next.players['player-1'].hand.map(c => c.id)).toContain(toCard.id);
      expect(next.players['player-2'].hand.map(c => c.id)).toContain(fromCard.id);
    });

    it('refuses an exchange addressed to a player who does not exist', () => {
      const card = makeCard('♠', '5');
      state.players['player-1'].hand = [card];
      const { state: next } = applyAction(state, {
        type: 'PROPOSE_EXCHANGE', playerId: 'player-1', cardId: card.id, targetId: 'ghost',
      });
      expect(next).toBe(state);
      expect(state.players['player-1'].tokens.social).toBe(3);
    });

    it('ignores SET_DRAW_RANGE on a field outside the allowlist', () => {
      const { state: next } = applyAction(state, {
        type: 'SET_DRAW_RANGE', playerId: 'gm-player', targetId: 'player-1', field: 'hand', val: 3,
      });
      expect(next).toBe(state);
      expect(Array.isArray(next.players['player-1'].hand)).toBe(true);
    });

    it('still applies SET_DRAW_RANGE on minDrawValue', () => {
      const { state: next } = applyAction(state, {
        type: 'SET_DRAW_RANGE', playerId: 'gm-player', targetId: 'player-1', field: 'minDrawValue', val: 4,
      });
      expect(next.players['player-1'].minDrawValue).toBe(4);
    });

    it('never writes NaN for an unknown token key', () => {
      const { state: next } = applyAction(state, {
        type: 'SPEND_TOKEN', playerId: 'player-1', token: 'mana',
      });
      expect(next).toBe(state);
      expect(next.players['player-1'].tokens.mana).toBeUndefined();
    });

    it('ignores ADD_TOKEN / SET_MAX_TOKENS with an unknown token key', () => {
      const add = applyAction(state, { type: 'ADD_TOKEN', playerId: 'gm-player', targetId: 'player-1', token: 'mana' });
      const set = applyAction(state, { type: 'SET_MAX_TOKENS', playerId: 'gm-player', targetId: 'player-1', token: 'mana', val: 5 });
      expect(add.state).toBe(state);
      expect(set.state).toBe(state);
    });

    it('ignores GIVE_CARDS with an unknown suit instead of throwing', () => {
      const { state: next } = applyAction(state, {
        type: 'GIVE_CARDS', playerId: 'gm-player', targetId: 'player-1',
        mode: 'specific', cards: [{ suit: 'Z', value: '5' }],
      });
      expect(next).toBe(state);
    });

    it('caps a specific GIVE_CARDS list at 10 cards', () => {
      const cards = Array.from({ length: 40 }, () => ({ suit: '♠', value: '5' }));
      const { state: next } = applyAction(state, {
        type: 'GIVE_CARDS', playerId: 'gm-player', targetId: 'player-1', mode: 'specific', cards,
      });
      expect(next.players['player-1'].hand).toHaveLength(10);
    });

    it('rejects an IMPORT_STATE payload without players', () => {
      const { state: next } = applyAction(state, {
        type: 'IMPORT_STATE', playerId: 'gm-player', state: { discard: [] },
      });
      expect(next).toBe(state);
    });

    it('hydrates dehydrated card ids on IMPORT_STATE', () => {
      const raw = {
        ...createInitialGameState(),
        gmId: 'gm-player',
        players: { 'player-1': { ...createEmptyPlayer('Player 1'), hand: ['n-S-5-abc'] } },
      };
      const { state: next } = applyAction(state, {
        type: 'IMPORT_STATE', playerId: 'gm-player', state: raw,
      });
      expect(next.players['player-1'].hand[0]).toMatchObject({ suit: '♠', value: '5' });
    });

    it('moves a pending Halfling draw to the discard when the race changes', () => {
      const a = makeCard('♠', '3');
      const b = makeCard('♥', '4');
      state.players['player-1'].pendingHalfling = [a, b];
      const { state: next } = applyAction(state, {
        type: 'SET_RACE', playerId: 'gm-player', targetId: 'player-1', race: 'gobelin',
      });
      expect(next.players['player-1'].pendingHalfling).toBeNull();
      expect(next.discard.map(c => c.id)).toEqual([a.id, b.id]);
    });

    it('tolerates an unknown suit id in a stored card id', () => {
      expect(cardFromId('n-Z-5-abc')).toMatchObject({ suit: '?', value: '5' });
      expect(() => hydrateState({ players: { p: { name: 'P', hand: ['garbage'] } } })).not.toThrow();
    });
  });
});
