/**
 * Returns an absolute URL for a card's PNG file.
 *
 * OBR's image renderer fetches URLs from its own service-worker context,
 * so relative paths like "/cards/..." won't resolve to the plugin origin.
 * We must use window.location.origin to build a fully-qualified URL.
 */

const SUIT_ID = { '♠': 'S', '♣': 'C', '♥': 'H', '♦': 'D' };

export function cardToSvgUrl(card, crystallized = false) {
  const suitId = SUIT_ID[card.suit] ?? 'S';
  const suffix = crystallized ? '-c' : '';
  return `${window.location.origin}/cards/${suitId}-${card.value}${suffix}.png`;
}
