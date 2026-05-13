/**
 * Pre-generates all card SVGs into public/cards/.
 * Run via: node scripts/generate-cards.js
 * Also called automatically in the vite build (see vite.config.js).
 */
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../public/cards');

fs.mkdirSync(OUT, { recursive: true });

const SUITS = [
  { symbol: '♠', id: 'S', isRed: false },
  { symbol: '♣', id: 'C', isRed: false },
  { symbol: '♥', id: 'H', isRed: true  },
  { symbol: '♦', id: 'D', isRed: true  },
];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function makeSvg(suit, value, isRed, crystallized) {
  const color  = isRed ? '#dc2626' : '#111827';
  const bg     = crystallized ? '#fefce8' : '#ffffff';
  const stroke = crystallized ? '#f59e0b' : '#d1d5db';
  const sw     = crystallized ? '3' : '1.5';
  const val    = escXml(value);
  const s      = suit; // Unicode — fine in SVG text

  return `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="90" viewBox="0 0 60 90">
  <rect width="60" height="90" rx="6" fill="${bg}" stroke="${stroke}" stroke-width="${sw}"/>
  <text x="4" y="16" font-family="Georgia,serif" font-size="13" font-weight="bold" fill="${color}">${val}</text>
  <text x="4" y="30" font-family="Georgia,serif" font-size="14" fill="${color}">${s}</text>
  <text x="30" y="51" font-family="Georgia,serif" font-size="26" fill="${color}" text-anchor="middle" dominant-baseline="middle">${s}</text>
  <g transform="rotate(180,30,45)">
    <text x="4" y="16" font-family="Georgia,serif" font-size="13" font-weight="bold" fill="${color}">${val}</text>
    <text x="4" y="30" font-family="Georgia,serif" font-size="14" fill="${color}">${s}</text>
  </g>
</svg>`;
}

let count = 0;
for (const suit of SUITS) {
  for (const value of VALUES) {
    for (const crystallized of [false, true]) {
      const suffix = crystallized ? '-c' : '';
      const name   = `${suit.id}-${value}${suffix}.svg`;
      fs.writeFileSync(path.join(OUT, name), makeSvg(suit.symbol, value, suit.isRed, crystallized));
      count++;
    }
  }
}
console.log(`Generated ${count} card SVGs → public/cards/`);
