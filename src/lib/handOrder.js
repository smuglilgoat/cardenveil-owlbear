/**
 * The player's own order of the cards in their hand (issue #18).
 *
 * The order carries NO rules weight: the rulebook never mentions it, the
 * fatigue malus hits every roll (not a card), and the reducer only ever looks
 * cards up BY ID (`p.hand.find(c => c.id === action.cardId)` for discard,
 * crystallise, use…). So the order is a local preference, exactly like the
 * card colour scheme: it is stored per room and per player, never sent to the
 * server, and the other players' hands (and the GM's view) keep the sorted
 * order.
 *
 * It is applied AFTER the fan's sort — the fan sorts by suit and value, so a
 * player's order would otherwise be undone on every render.
 */

const ORDER_PREFIX = 'cardenveil-hand-order';
const orderListeners = new Set();

export function handOrderKey(roomId, playerId) {
  return `${ORDER_PREFIX}:${roomId}:${playerId}`;
}

/**
 * The stored order: card id → rank (the lower the rank, the further left).
 * @returns {Record<string, number>}
 */
export function getHandOrder(roomId, playerId) {
  try {
    const raw = localStorage.getItem(handOrderKey(roomId, playerId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Store the order and notify this frame's subscribers. Other frames of the
 * same browser get the `storage` event ✅ (same origin, same partition ✅).
 */
export function setHandOrder(roomId, playerId, order) {
  try {
    localStorage.setItem(handOrderKey(roomId, playerId), JSON.stringify(order));
  } catch {
    /* storage unavailable — the order stays for this frame only */
  }
  orderListeners.forEach((handler) => handler(order));
}

/** Subscribe to the order changes of this frame. */
export function onHandOrderChange(handler) {
  orderListeners.add(handler);
  return () => orderListeners.delete(handler);
}

/**
 * Apply the player's order to a sorted hand: the cards that carry a rank come
 * first, in rank order; the others (a card drawn since the last reorder) keep
 * their sorted order after them.
 * @param {any[]} cards
 * @param {Record<string, number>} order
 */
export function applyHandOrder(cards, order) {
  const ranks = order ?? {};
  if (!Object.keys(ranks).length) return cards;
  const rank = new Map(Object.entries(ranks));
  return [...cards].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra == null && rb == null) return 0; // stable: the sorted order is kept
    if (ra == null) return 1;
    if (rb == null) return -1;
    return ra - rb;
  });
}
