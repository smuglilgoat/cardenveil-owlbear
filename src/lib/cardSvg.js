/**
 * Returns the static URL for a card's SVG file.
 *
 * Files live in public/cards/{suitId}-{value}[-c].svg and are pre-generated
 * by scripts/generate-cards.js at build time.
 * OBR's image renderer fetches images over HTTP, so data: URIs don't work —
 * the files must be served from a real URL.
 */

const SUIT_ID = { '♠': 'S', '♣': 'C', '♥': 'H', '♦': 'D' };

export function cardToSvgUrl(card, crystallized = false) {
  const suitId = SUIT_ID[card.suit] ?? 'S';
  const suffix = crystallized ? '-c' : '';
  return `/cards/${suitId}-${card.value}${suffix}.svg`;
}
