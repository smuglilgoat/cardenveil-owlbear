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

const SUIT_SORT_ORDER = { '♥': 0, '♣': 1, '♦': 2, '♠': 3 };

/** Fatigue level → card penalty mapping: level 0=0, 1=-1, 2=-2, 3=-4, 4=-6 */
export const FATIGUE_PENALTY = [0, 1, 2, 4, 6];

export function sortCards(cards) {
  return [...cards].sort((a, b) => {
    if (a._pending && !b._pending) return 1;
    if (!a._pending && b._pending) return -1;
    if (a._pending && b._pending) return 0;
    return (SUIT_SORT_ORDER[a.suit] - SUIT_SORT_ORDER[b.suit]) || (a.numericValue - b.numericValue);
  });
}

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

let _pendingUid = 0;

/** Create a placeholder card shown while waiting for the server to confirm a draw. */
export function makePendingCard() {
  return { id: `pending-${Date.now()}-${++_pendingUid}`, _pending: true, suit: '', value: '?', numericValue: 0, isRed: false };
}

/** Check whether a card is a pending (unconfirmed) placeholder. */
export function isPendingCard(card) {
  return !!card._pending;
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

export const RACES = [
  { id: 'haut-elfe', label: 'Haut-Elfe' },
  { id: 'tieffelin', label: 'Tieffelin' },
  { id: 'aasimar',   label: 'Aasimar' },
  { id: 'halfling',  label: 'Halfling' },
  { id: 'sporelin',  label: 'Sporelin' },
];

const RACE_IDS = new Set(RACES.map(r => r.id));

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
    fatigue:       0,
    race:          null,
    tieflingDrawEligible: true,
    pendingHalfling: null,
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

function isGM(state, playerId) {
  return state.gmId === playerId;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/** Effective hand cap including racial bonus. */
export function handCap(player) {
  const raceBonus = player.race === 'haut-elfe' ? 1 : 0;
  return (player.maxHandSize ?? 3) + (player.spiritBounds ?? 0) + raceBonus;
}

/** If the player is Aasimar, append a random crystallized Heart card. */
function maybeAasimarHeart(player) {
  if (player.race !== 'aasimar') return player;
  const heart = drawSpecialized('♥');
  return {
    ...player,
    crystallized: [...player.crystallized, heart],
  };
}

export function applyAction(state, action) {
  const { type } = action;

  switch (type) {
    case 'INIT_GAME': {
      const fresh = createInitialGameState();
      return { state: { ...fresh, gmId: action.playerId }, log: null };
    }

    case 'REGISTER_PLAYER': {
      if (state.players[action.playerId]) return { state, log: null };
      const s = {
        ...state,
        players: { ...state.players, [action.playerId]: createEmptyPlayer(action.name) },
      };
      return { state: s, log: null };
    }

    case 'REGISTER_PARTY': {
      if (!isGM(state, action.playerId)) return { state, log: null };
      let players = { ...state.players };
      for (const p of (action.players ?? [])) {
        if (!players[p.id]) {
          players[p.id] = createEmptyPlayer(p.name);
        }
      }
      return { state: { ...state, players }, log: null };
    }

    case 'DRAW': {
      const p = state.players[action.playerId];
      if (!p || p.pendingHalfling) return { state, log: null };
      const cap = handCap(p);
      if (p.hand.length >= cap) return { state, log: null };
      const mn = p.minDrawValue ?? 1, mx = p.maxDrawValue ?? 13;

      // HALFLING: draw 2, store in pendingHalfling
      if (p.race === 'halfling') {
        const cardA = drawNormal(mn, mx);
        const cardB = drawNormal(mn, mx);
        const s = {
          ...state,
          players: { ...state.players, [action.playerId]: {
            ...p,
            pendingHalfling: [cardA, cardB],
            tieflingDrawEligible: p.race === 'tieffelin' ? true : p.tieflingDrawEligible,
          }},
        };
        return { state: addLog(s, action.playerId, p.name, `pioche Halfling : choisissez une carte`), log: null };
      }

      const card = drawNormal(mn, mx);
      const s = {
        ...state,
        players: { ...state.players, [action.playerId]: {
          ...p,
          hand: [...p.hand, card],
          tieflingDrawEligible: p.race === 'tieffelin' ? true : p.tieflingDrawEligible,
        }},
      };
      return { state: addLog(s, action.playerId, p.name, `pioche ${card.value}${card.suit}`), log: null };
    }

    case 'DRAW_FORCE': {
      const p = state.players[action.playerId];
      if (!p || p.tokens.force <= 0 || p.pendingHalfling) return { state, log: null };
      const mn = p.minDrawValue ?? 1, mx = p.maxDrawValue ?? 13;
      let updatedPlayer;

      if (p.race === 'halfling') {
        const cardA = drawNormal(mn, mx);
        const cardB = drawNormal(mn, mx);
        updatedPlayer = {
          ...p,
          tokens: { ...p.tokens, force: p.tokens.force - 1 },
          pendingHalfling: [cardA, cardB],
        };
      } else {
        const card = drawNormal(mn, mx);
        updatedPlayer = {
          ...p,
          tokens: { ...p.tokens, force: p.tokens.force - 1 },
          hand: [...p.hand, card],
        };
      }

      // AASIMAR: crystallized Heart after full token resolution
      updatedPlayer = maybeAasimarHeart(updatedPlayer);

      const s = {
        ...state,
        players: { ...state.players, [action.playerId]: updatedPlayer },
      };
      return { state: addLog(s, action.playerId, p.name, `token Force : pioche ${p.race === 'halfling' ? '(Halfling : choix)' : ''}`), log: null };
    }

    case 'GIVE_CARDS': {
      if (!isGM(state, action.playerId)) return { state, log: null };
      const target = state.players[action.targetId];
      if (!target) return { state, log: null };
      const crystal = !!action.crystal;
      const prefix = crystal ? 's' : 'n';
      let cards;
      if (action.mode === 'specific' && Array.isArray(action.cards) && action.cards.length > 0) {
        cards = action.cards.map(c => makeCard(c.suit, c.value, prefix));
      } else {
        const count = clamp(action.count ?? 1, 1, 10);
        const mn = target.minDrawValue ?? 1, mx = target.maxDrawValue ?? 13;
        cards = Array.from({ length: count }, () => drawNormal(mn, mx));
      }
      const dest = crystal ? 'crystallized' : 'hand';
      const s = {
        ...state,
        players: { ...state.players, [action.targetId]: {
          ...target, [dest]: [...target[dest], ...cards],
        }},
      };
      const label = crystal ? 'cristallisée(s)' : 'normale(s)';
      return { state: addLog(s, 'gm', 'MJ', `donne ${cards.length} carte(s) ${label} à ${target.name} : ${cards.map(c => c.value + c.suit).join(', ')}`), log: null };
    }

    case 'DEAL_ALL': {
      if (!isGM(state, action.playerId)) return { state, log: null };
      const updatedPlayers = { ...state.players };
      const dealtTo = [];
      for (const [id, pl] of Object.entries(state.players)) {
        if (id === action.playerId) continue;
        const cap = handCap(pl);
        if (pl.hand.length >= cap) continue;
        if (pl.pendingHalfling) continue;
        const hasExchange = (state.pendingExchanges ?? [])
          .some(e => e.from === id || e.to === id);
        if (hasExchange) continue;
        const mn = pl.minDrawValue ?? 1, mx = pl.maxDrawValue ?? 13;

        if (pl.race === 'halfling') {
          const cardA = drawNormal(mn, mx);
          const cardB = drawNormal(mn, mx);
          updatedPlayers[id] = { ...pl, pendingHalfling: [cardA, cardB] };
          dealtTo.push(pl.name + ' (Halfling)');
        } else {
          const card = drawNormal(mn, mx);
          updatedPlayers[id] = { ...pl, hand: [...pl.hand, card] };
          dealtTo.push(pl.name);
        }
      }
      const s = { ...state, players: updatedPlayers };
      return { state: addLog(s, 'gm', 'MJ', `distribue 1 carte à tous (${dealtTo.join(', ') || 'aucun'})`), log: null };
    }

    case 'DISCARD': {
      const p = state.players[action.playerId];
      if (!p) return { state, log: null };
      const from = action.from ?? 'hand';
      if (from === 'hand') {
        const isGrayed = (p.grayedCards ?? []).includes(action.cardId);
        const spiritLocked = p.hand.length <= (p.spiritBounds ?? 0);
        if (isGrayed || spiritLocked) return { state, log: null };
        const card = p.hand.find(c => c.id === action.cardId);
        if (!card) return { state, log: null };
        const s = {
          ...state,
          discard: [...state.discard, card],
          players: { ...state.players, [action.playerId]: {
            ...p, hand: p.hand.filter(c => c.id !== action.cardId),
          }},
        };
        return { state: addLog(s, action.playerId, p.name, `défausse ${card.value}${card.suit}`), log: null };
      } else {
        const card = p.crystallized.find(c => c.id === action.cardId);
        if (!card) return { state, log: null };
        const s = {
          ...state,
          discard: [...state.discard, card],
          players: { ...state.players, [action.playerId]: {
            ...p, crystallized: p.crystallized.filter(c => c.id !== action.cardId),
          }},
        };
        return { state: addLog(s, action.playerId, p.name, `joue/défausse cristallisée ${card.value}${card.suit}`), log: null };
      }
    }

    case 'CRYSTALLIZE': {
      const p = state.players[action.playerId];
      if (!p || (p.spiritBounds ?? 0) <= 0) return { state, log: null };
      const card = p.hand.find(c => c.id === action.cardId);
      if (!card) return { state, log: null };
      const s = {
        ...state,
        players: { ...state.players, [action.playerId]: {
          ...p,
          hand: p.hand.filter(c => c.id !== action.cardId),
          crystallized: [...p.crystallized, card],
          grayedCards: (p.grayedCards ?? []).filter(id => id !== action.cardId),
          spiritBounds: (p.spiritBounds ?? 0) - 1,
        }},
      };
      return { state: addLog(s, action.playerId, p.name, `cristallise ${card.value}${card.suit} (−1 Spirit Bound)`), log: null };
    }

    case 'USE_AGILITE': {
      const p = state.players[action.playerId];
      if (!p || p.tokens.agilite <= 0 || p.pendingHalfling) return { state, log: null };
      const actionCard = p.hand.find(c => c.id === action.cardId);
      if (!actionCard) return { state, log: null };
      const mn = p.minDrawValue ?? 1, mx = p.maxDrawValue ?? 13;
      const newCard = drawSpecialized(action.suit, mn, mx);
      let updatedPlayer = {
        ...p,
        tokens: { ...p.tokens, agilite: p.tokens.agilite - 1 },
        hand: [...p.hand.filter(c => c.id !== action.cardId), newCard],
      };
      updatedPlayer = maybeAasimarHeart(updatedPlayer);
      const s = {
        ...state,
        discard: [...state.discard, actionCard],
        players: { ...state.players, [action.playerId]: updatedPlayer },
      };
      return { state: addLog(s, action.playerId, p.name, `token Agilité : défausse ${actionCard.value}${actionCard.suit}, pioche ${newCard.value}${newCard.suit} (${action.suit})`), log: null };
    }

    case 'USE_ESPRIT': {
      const p = state.players[action.playerId];
      if (!p || p.tokens.esprit <= 0 || p.pendingHalfling) return { state, log: null };
      let updatedPlayer = {
        ...p,
        tokens: { ...p.tokens, esprit: p.tokens.esprit - 1 },
        spiritBounds: (p.spiritBounds ?? 0) + 1,
      };
      updatedPlayer = maybeAasimarHeart(updatedPlayer);
      const s = {
        ...state,
        players: { ...state.players, [action.playerId]: updatedPlayer },
      };
      return { state: addLog(s, action.playerId, p.name, `token Esprit : +1 Spirit Bound (total ${(p.spiritBounds ?? 0) + 1})`), log: null };
    }

    case 'PROPOSE_EXCHANGE': {
      const p = state.players[action.playerId];
      if (!p || p.tokens.social <= 0 || p.pendingHalfling) return { state, log: null };
      const card = p.hand.find(c => c.id === action.cardId);
      if (!card) return { state, log: null };
      const exchange = {
        id: `${action.playerId}-${Date.now()}`,
        from: action.playerId,
        fromCard: card,
        to: action.targetId,
      };
      let updatedPlayer = {
        ...p,
        tokens: { ...p.tokens, social: p.tokens.social - 1 },
        hand: p.hand.filter(c => c.id !== action.cardId),
      };
      updatedPlayer = maybeAasimarHeart(updatedPlayer);
      const s = {
        ...state,
        pendingExchanges: [...(state.pendingExchanges ?? []), exchange],
        players: { ...state.players, [action.playerId]: updatedPlayer },
      };
      const targetName = state.players[action.targetId]?.name ?? action.targetId.slice(0, 8);
      return { state: addLog(s, action.playerId, p.name, `token Social : propose échange ${card.value}${card.suit} → ${targetName}`), log: null };
    }

    case 'ACCEPT_EXCHANGE': {
      const ex = (state.pendingExchanges ?? []).find(e => e.id === action.exchangeId);
      if (!ex) return { state, log: null };
      const recipient = state.players[ex.to];
      const sender = state.players[ex.from];
      if (!recipient || !sender) return { state, log: null };
      const myCard = recipient.hand.find(c => c.id === action.cardId);
      if (!myCard) return { state, log: null };
      const s = {
        ...state,
        pendingExchanges: state.pendingExchanges.filter(e => e.id !== ex.id),
        players: {
          ...state.players,
          [ex.from]: { ...sender, hand: [...sender.hand, myCard] },
          [ex.to]: { ...recipient, hand: [...recipient.hand.filter(c => c.id !== myCard.id), ex.fromCard] },
        },
      };
      return { state: addLog(s, ex.to, recipient.name, `accepte échange avec ${sender.name} : donne ${myCard.value}${myCard.suit}, reçoit ${ex.fromCard.value}${ex.fromCard.suit}`), log: null };
    }

    case 'DECLINE_EXCHANGE': {
      const ex = (state.pendingExchanges ?? []).find(e => e.id === action.exchangeId);
      if (!ex) return { state, log: null };
      const sender = state.players[ex.from];
      if (!sender) return { state, log: null };
      const s = {
        ...state,
        pendingExchanges: state.pendingExchanges.filter(e => e.id !== ex.id),
        players: {
          ...state.players,
          [ex.from]: {
            ...sender,
            hand: [...sender.hand, ex.fromCard],
            tokens: { ...sender.tokens, social: sender.tokens.social + 1 },
          },
        },
      };
      const recipient = state.players[action.playerId];
      return { state: addLog(s, action.playerId, recipient?.name ?? '', `refuse échange de ${sender.name} (${ex.fromCard.value}${ex.fromCard.suit})`), log: null };
    }

    case 'CANCEL_EXCHANGE': {
      if (!isGM(state, action.playerId)) return { state, log: null };
      const ex = (state.pendingExchanges ?? []).find(e => e.id === action.exchangeId);
      if (!ex) return { state, log: null };
      const sender = state.players[ex.from];
      if (!sender) return { state, log: null };
      const s = {
        ...state,
        pendingExchanges: state.pendingExchanges.filter(e => e.id !== ex.id),
        players: {
          ...state.players,
          [ex.from]: { ...sender, hand: [...sender.hand, ex.fromCard] },
        },
      };
      return { state: s, log: null };
    }

    case 'SPEND_TOKEN': {
      const p = state.players[action.playerId];
      if (!p || p.tokens[action.token] <= 0 || p.pendingHalfling) return { state, log: null };
      let updatedPlayer = {
        ...p,
        tokens: { ...p.tokens, [action.token]: p.tokens[action.token] - 1 },
      };
      updatedPlayer = maybeAasimarHeart(updatedPlayer);
      const s = {
        ...state,
        players: { ...state.players, [action.playerId]: updatedPlayer },
      };
      return { state: addLog(s, action.playerId, p.name, `token ${action.token} : usage combat`), log: null };
    }

    case 'ADD_TOKEN': {
      if (!isGM(state, action.playerId)) return { state, log: null };
      const p = state.players[action.targetId];
      if (!p || p.tokens[action.token] >= p.maxTokens[action.token]) return { state, log: null };
      const s = {
        ...state,
        players: { ...state.players, [action.targetId]: {
          ...p,
          tokens: { ...p.tokens, [action.token]: p.tokens[action.token] + 1 },
        }},
      };
      return { state: s, log: null };
    }

    case 'TOGGLE_GRAY': {
      const p = state.players[action.playerId];
      if (!p) return { state, log: null };
      const grayed = p.grayedCards ?? [];
      const next = grayed.includes(action.cardId)
        ? grayed.filter(id => id !== action.cardId)
        : [...grayed, action.cardId];
      const s = {
        ...state,
        players: { ...state.players, [action.playerId]: { ...p, grayedCards: next } },
      };
      return { state: s, log: null };
    }

    case 'SWAP_CARD': {
      if (!isGM(state, action.playerId)) return { state, log: null };
      const p = state.players[action.targetId];
      if (!p) return { state, log: null };
      const oldCard = p.hand.find(c => c.id === action.oldCardId);
      if (!oldCard) return { state, log: null };
      const prefix = action.source === 'normal' ? 'n' : 's';
      const newCard = makeCard(action.suit, action.value, prefix);
      const s = {
        ...state,
        discard: [...state.discard, oldCard],
        players: {
          ...state.players,
          [action.targetId]: { ...p, hand: p.hand.map(c => c.id === oldCard.id ? newCard : c) },
        },
      };
      return { state: addLog(s, 'gm', 'MJ', `remplace ${oldCard.value}${oldCard.suit} → ${newCard.value}${newCard.suit} dans la main de ${p.name}`), log: null };
    }

    case 'SET_MAX_HAND': {
      if (!isGM(state, action.playerId)) return { state, log: null };
      const p = state.players[action.targetId];
      if (!p) return { state, log: null };
      const s = {
        ...state,
        players: { ...state.players, [action.targetId]: {
          ...p, maxHandSize: clamp(Number(action.val), 0, 15),
        }},
      };
      return { state: s, log: null };
    }

    case 'SET_DRAW_RANGE': {
      if (!isGM(state, action.playerId)) return { state, log: null };
      const p = state.players[action.targetId];
      if (!p) return { state, log: null };
      const s = {
        ...state,
        players: { ...state.players, [action.targetId]: {
          ...p, [action.field]: clamp(Number(action.val), 1, 13),
        }},
      };
      return { state: s, log: null };
    }

    case 'SET_MAX_TOKENS': {
      if (!isGM(state, action.playerId)) return { state, log: null };
      const p = state.players[action.targetId];
      if (!p) return { state, log: null };
      const s = {
        ...state,
        players: { ...state.players, [action.targetId]: {
          ...p,
          maxTokens: { ...p.maxTokens, [action.token]: clamp(Number(action.val), 0, 10) },
        }},
      };
      return { state: s, log: null };
    }

    case 'REST_ALL': {
      if (!isGM(state, action.playerId)) return { state, log: null };
      const updated = {};
      for (const [id, p] of Object.entries(state.players)) {
        updated[id] = { ...p, tokens: { ...p.maxTokens } };
      }
      return { state: { ...state, players: updated }, log: null };
    }

    case 'HARD_RESET': {
      if (!isGM(state, action.playerId)) return { state, log: null };
      const fresh = createInitialGameState();
      const players = {};
      for (const [id, p] of Object.entries(state.players)) {
        const np = createEmptyPlayer(p.name);
        np.race = p.race ?? null;
        players[id] = np;
      }
      return { state: { ...fresh, gmId: state.gmId, players }, log: null };
    }

    case 'IMPORT_STATE': {
      if (!isGM(state, action.playerId)) return { state, log: null };
      return { state: action.state, log: null };
    }

    case 'CREATE_GM_CHAR': {
      if (!isGM(state, action.playerId)) return { state, log: null };
      const s = {
        ...state,
        gmCharacterId: GM_CHAR_ID,
        players: { ...state.players, [GM_CHAR_ID]: createEmptyPlayer('Personnage MJ') },
      };
      return { state: s, log: null };
    }

    case 'REMOVE_GM_CHAR': {
      if (!isGM(state, action.playerId)) return { state, log: null };
      const players = { ...state.players };
      delete players[GM_CHAR_ID];
      const pendingExchanges = (state.pendingExchanges ?? []).filter(
        e => e.from !== GM_CHAR_ID && e.to !== GM_CHAR_ID,
      );
      return { state: { ...state, gmCharacterId: null, pendingExchanges, players }, log: null };
    }

    case 'SET_FATIGUE': {
      if (!isGM(state, action.playerId)) return { state, log: null };
      const p = state.players[action.targetId];
      if (!p) return { state, log: null };
      const level = clamp(Number(action.level), 0, 4);
      const s = {
        ...state,
        players: { ...state.players, [action.targetId]: {
          ...p, fatigue: level,
        }},
      };
      return { state: addLog(s, 'gm', 'MJ', `fatigue de ${p.name} → niveau ${level}`), log: null };
    }

    case 'SET_RACE': {
      if (!isGM(state, action.playerId)) return { state, log: null };
      const p = state.players[action.targetId];
      if (!p) return { state, log: null };
      const race = action.race && RACE_IDS.has(action.race) ? action.race : null;
      const s = {
        ...state,
        players: { ...state.players, [action.targetId]: {
          ...p,
          race,
          tieflingDrawEligible: true,
          pendingHalfling: null,
        }},
      };
      const label = race ? RACES.find(r => r.id === race)?.label ?? race : 'aucune';
      return { state: addLog(s, 'gm', 'MJ', `race de ${p.name} → ${label}`), log: null };
    }

    case 'DRAW_SPADE': {
      const p = state.players[action.playerId];
      if (!p || p.race !== 'tieffelin' || !p.tieflingDrawEligible) return { state, log: null };
      if (p.pendingHalfling) return { state, log: null };
      const cap = handCap(p);
      if (p.hand.length >= cap) return { state, log: null };
      const mn = p.minDrawValue ?? 1, mx = p.maxDrawValue ?? 13;
      const card = drawSpecialized('♠', mn, mx);
      const s = {
        ...state,
        players: { ...state.players, [action.playerId]: {
          ...p,
          hand: [...p.hand, card],
          tieflingDrawEligible: false,
        }},
      };
      return { state: addLog(s, action.playerId, p.name, `pioche Pique ${card.value}${card.suit} (Tieffelin)`), log: null };
    }

    case 'HALFLING_CHOOSE': {
      const p = state.players[action.playerId];
      if (!p || !p.pendingHalfling) return { state, log: null };
      const chosen = p.pendingHalfling.find(c => c.id === action.cardId);
      if (!chosen) return { state, log: null };
      const discarded = p.pendingHalfling.find(c => c.id !== action.cardId);
      const s = {
        ...state,
        discard: discarded ? [...state.discard, discarded] : state.discard,
        players: { ...state.players, [action.playerId]: {
          ...p,
          hand: [...p.hand, chosen],
          pendingHalfling: null,
        }},
      };
      return { state: addLog(s, action.playerId, p.name, `Halfling : choisit ${chosen.value}${chosen.suit}`), log: null };
    }

    case 'SPORELIN_EXCHANGE': {
      const p = state.players[action.playerId];
      if (!p || p.race !== 'sporelin' || p.pendingHalfling) return { state, log: null };
      const hasExchange = (state.pendingExchanges ?? [])
        .some(e => e.from === action.playerId || e.to === action.playerId);
      if (hasExchange) return { state, log: null };
      const card = p.hand.find(c => c.id === action.cardId);
      if (!card) return { state, log: null };
      const exchange = {
        id: `${action.playerId}-${Date.now()}`,
        from: action.playerId,
        fromCard: card,
        to: action.targetId,
      };
      const s = {
        ...state,
        pendingExchanges: [...(state.pendingExchanges ?? []), exchange],
        players: { ...state.players, [action.playerId]: {
          ...p,
          hand: p.hand.filter(c => c.id !== action.cardId),
        }},
      };
      const targetName = state.players[action.targetId]?.name ?? action.targetId.slice(0, 8);
      return { state: addLog(s, action.playerId, p.name, `échange Sporelin : propose ${card.value}${card.suit} → ${targetName}`), log: null };
    }

    default:
      return { state, log: null };
  }
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
      race:         p.race ?? null,
      tieflingDrawEligible: p.tieflingDrawEligible ?? true,
      pendingHalfling: p.pendingHalfling ?? null,
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
