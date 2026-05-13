/**
 * Generate a base64 SVG data URI for a playing card.
 * Using base64 (not percent-encoding) to correctly handle Unicode suit symbols.
 */
export function cardToSvgDataUrl(card, crystallized = false) {
  const color   = card.isRed ? '#dc2626' : '#111827';
  const bg      = crystallized ? '#fefce8' : '#ffffff';
  const stroke  = crystallized ? '#f59e0b' : '#d1d5db';
  const sw      = crystallized ? '3' : '1.5';
  const val     = escXml(card.value);
  const suit    = card.suit;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="90" viewBox="0 0 60 90">
  <rect width="60" height="90" rx="6" fill="${bg}" stroke="${stroke}" stroke-width="${sw}"/>
  <text x="4" y="16" font-family="Georgia,serif" font-size="13" font-weight="bold" fill="${color}">${val}</text>
  <text x="4" y="30" font-family="Georgia,serif" font-size="14" fill="${color}">${suit}</text>
  <text x="30" y="51" font-family="Georgia,serif" font-size="26" fill="${color}" text-anchor="middle" dominant-baseline="middle">${suit}</text>
  <g transform="rotate(180,30,45)">
    <text x="4" y="16" font-family="Georgia,serif" font-size="13" font-weight="bold" fill="${color}">${val}</text>
    <text x="4" y="30" font-family="Georgia,serif" font-size="14" fill="${color}">${suit}</text>
  </g>
</svg>`;

  // btoa with unescape+encodeURIComponent handles the Unicode suit symbols
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
