// Attack roll engine — implements docs/Reglejetdattaque.md (+ its patch).
// One roll, kept die = damage die; each avantage/désavantage level adds 2
// dice keeping max/min; they cancel first, then engagement adds its levels
// as désavantages + its stat mod to damage. Crit = kept die at max face →
// explosion chains (advantage decays one level per explosion; désavantage
// explosions are always plain 1dX; Hache/Brutalité explodes 2dX summed with
// doubles chaining). Finesse repeats weapon + engagement bonuses once per
// crit. Stat keys follow the sheet convention (agilite, unaccented).
// Gobelin crit cap (3): deferred per doc §16 — no sheet uses it yet.
import { statModifier, toNumber } from './characterSheet.js';

const FINESS_RE = /finesse/i;
const CATALYSEUR_RE = /catalyseur/i;
const HACHE_RE = /brutalité|hache/i;
const STAT_LABELS_FR = { force: 'Force', agilite: 'Agilité', esprit: 'Esprit' };

/** Weapon flags from the free-text `proprietes` field (+ name fallback).
 *  Reads both spellings — older sheets store it as `propriétés` (accented).
 */
export function weaponFlags(weapon) {
  const props = weapon?.proprietes ?? weapon?.['propriétés'] ?? '';
  const text = `${weapon?.nom ?? ''} ${props}`;
  return {
    finesse: FINESS_RE.test(text),
    catalyseur: CATALYSEUR_RE.test(text),
    hache: HACHE_RE.test(text)
  };
}

/** Stat whose modifier engagement adds to damage (Finesse→agilite, Catalyseur→esprit, else force). */
export function engagementStat(weapon) {
  const { finesse, catalyseur } = weaponFlags(weapon);
  if (finesse) return 'agilite';
  if (catalyseur) return 'esprit';
  return 'force';
}

function statMod(stats, stat) {
  const score = Number(stats?.[stat]);
  return statModifier(Number.isFinite(score) ? score : 10);
}

const fmtMod = (value) => (value >= 0 ? `+${value}` : String(value));

function rollDice(count, sides, rng = Math.random) {
  return Array.from({ length: count }, () => 1 + Math.floor(rng() * sides));
}

const keepValue = (dice, keep) =>
  keep === 'max' ? Math.max(...dice) : keep === 'min' ? Math.min(...dice) : dice[0];

/**
 * Resolve which equipped weapon the attack panel targets. Falls back through
 * the saved name → main hand → first equipped, so a stale/missing selection
 * never leaves the panel blank (e.g. after re-equipping). Duplicate names
 * resolve to array order.
 * @param {Array} [weapons] - Sheet weapons array
 * @param {string} [preferredName] - Last used / saved weapon name
 * @returns {{weapon: Object|null, equipped: Array}} Selected weapon + equipped list
 */
export function pickAttackWeapon(weapons = [], preferredName = '') {
  const equipped = weapons.filter((w) => w?.equipped);
  if (!equipped.length) return { weapon: null, equipped };
  const preferred = preferredName ? equipped.find((w) => w?.nom === preferredName) : null;
  const weapon = preferred ?? equipped.find((w) => (w?.hand ?? 'main') === 'main') ?? equipped[0] ?? null;
  return { weapon, equipped };
}

/**
 * Static parts of an attack (no dice): die count, keep rule, bonuses,
 * engagement stat. Powers the live preview in SheetPopover.
 * @param {Object} weapon - Equipped weapon ({ de, bonus, proprietes, nom })
 * @param {Object} [stats] - Raw stats ({ force, agilite, esprit, social })
 * @param {{advantage?: number, engagement?: number, bonus?: number, rng?: Function}} [opts]
 *   advantage: −7…+7 (− = désavantage, + = avantage); engagement: 0…7 levels;
 *   bonus: optional bonus override (the BONUS ATT. stat) — undefined/empty
 *   falls back to the weapon's `bonus` field; rng: injectable die source
 *   for tests (default Math.random)
 * @returns {null|{level, diceCount, keep, sides, weaponBonus, engagementMod,
 *   engagementStat, finesse, hache}}
 */
export function attackPreview(weapon, stats = {}, { advantage = 0, engagement = 0, bonus } = {}) {
  const match = String(weapon?.de ?? '').match(/(\d*)\s*d\s*(\d+)/i);
  if (!match) return null;
  const sides = parseInt(match[2], 10);
  if (!(sides >= 2)) return null;
  const eStat = engagementStat(weapon);
  const eng = Math.max(0, Math.round(Number(engagement) || 0));
  const adv = Math.round(Number(advantage) || 0);
  // Avantage/désavantage cancel BEFORE engagement applies (patch §1).
  const level = adv - eng;
  const kept = level > 0 ? 'max' : level < 0 ? 'min' : null;
  return {
    level,
    diceCount: 1 + 2 * Math.abs(level),
    keep: kept,
    sides,
    weaponBonus: bonus === undefined || bonus === null || bonus === '' ? toNumber(weapon?.bonus) : toNumber(bonus),
    engagementMod: statMod(stats, eStat),
    engagementStat: eStat,
    ...weaponFlags(weapon),
    advantage: adv,
    engagement: eng
  };
}

/**
 * Resolve a full attack per the rules doc.
 * @param {Object} weapon - Equipped weapon ({ de, bonus, proprietes, nom, seuilMiss })
 * @param {Object} [stats] - Raw stats
 * @param {{advantage?: number, engagement?: number, bonus?: number}} [opts]
 *   bonus: BONUS ATT. stat override (see attackPreview)
 * @returns {Object|null} { total (0 on miss), miss, critCount, kept,
 *   stages: [{label, pool, keep, dice, kept, sides}], breakdown (§20 lines),
 *   finesse, hache, level, sides, weaponBonus, engagementMod, engagementStat,
 *   advantage, engagement }
 */
export function rollAttack(weapon, stats = {}, { advantage = 0, engagement = 0, bonus, rng = Math.random } = {}) {
  const p = attackPreview(weapon, stats, { advantage, engagement, bonus });
  if (!p) return null;
  const { sides, level, finesse, hache, weaponBonus, engagementMod, engagementStat: eStat, engagement: engLevel } = p;
  const keepMode = level > 0 ? 'max' : level < 0 ? 'min' : null;
  const stages = [];
  const breakdown = [];

  const stage = (pool, keep) => {
    const dice = rollDice(pool, sides, rng);
    const kept = keepValue(dice, keep);
    stages.push({ label: `${pool}d${sides} · garder ${keep ?? 'seul'}`, pool, keep, dice, kept, sides });
    return kept;
  };

  const levelNote = level === 0 ? '' : ` (${level > 0 ? '+' : '−'}${Math.abs(level)} ${Math.abs(level) === 1 ? 'niveau' : 'niveaux'})`;
  const keepNote = keepMode ? ` · garder ${keepMode}` : '';

  const initial = stage(p.diceCount, keepMode);
  breakdown[0] = `Jet : ${p.diceCount}d${sides}${levelNote}${keepNote} [${stages[0].dice.join(', ')}] — gardé ${initial}`;
  let critCount = 0;
  const seuilMiss = toNumber(weapon?.seuilMiss);
  if (initial <= seuilMiss) {
    breakdown[0] = `Jet : ${p.diceCount}d${sides}${levelNote} [${stages[0].dice.join(', ')}] — gardé ${initial} ≤ seuil ${seuilMiss} → MISS`;
    breakdown.push('Dégâts : 0');
    return result(0, true);
  }

  let kept = initial;
  if (hache) {
    if (initial === sides) breakdown[0] += ' → CRIT';
    // Hache: advantage applies only to the initial roll (doc §18); each
    // explosion is 2dX summed, a double chains a new crit (§17-18).
    while (kept === sides) {
      critCount++;
      const pair = rollDice(2, sides, rng);
      const sum = pair[0] + pair[1];
      stages.push({ label: `Explosion : 2d${sides} · somme`, pool: 2, keep: 'somme', dice: pair, kept: sum, sides });
      breakdown.push(`Explosion : 2d${sides} [${pair[0]}, ${pair[1]}] = ${sum}${pair[0] === pair[1] ? ' → CRIT (double)' : ''}`);
      kept = pair[0] === pair[1] ? sides : 0;
    }
  } else {
    let remainingLevel = level;
    while (kept === sides) {
      critCount++;
      // Advantage decays one level per explosion (§8); désavantage explosions
      // are always a plain 1dX (§9).
      const keepNext = level > 0 && remainingLevel - 1 > 0 ? 'max' : null;
      const pool = keepNext ? 1 + 2 * (Math.abs(remainingLevel) - 1) : 1;
      const dice = rollDice(pool, sides, rng);
      const kept2 = Math.max(...dice);
      stages.push({ label: `Explosion : ${pool}d${sides}${pool > 1 ? ' · garder max' : ''}`, pool, keep: pool > 1 ? 'max' : null, dice, kept: kept2, sides });
      breakdown.push(`Explosion : ${pool}d${sides} [${dice.join(', ')}] — gardé ${kept2}${kept2 === sides ? ' → CRIT' : ''}`);
      kept = kept2;
      remainingLevel -= 1;
    }
    breakdown.push(`Critiques : ${critCount}`);
  }

  // Bonuses. Finesse: (weapon bonus + engagement mods) × (1 + crit count)
  // (patch §2); otherwise weapon bonus once + engagement mods flat.
  const engagementMods = engLevel * engagementMod;
  const flatBonus = finesse ? (weaponBonus + engagementMods) * (1 + critCount) : weaponBonus + engagementMods;
  const diceTotal = stages.reduce((sum, s) => sum + s.kept, 0);
  const total = diceTotal + flatBonus;

  // §20 equation.
  const parts = stages.map((s) => String(s.kept));
  if (flatBonus > 0) parts.push(String(flatBonus));
  else if (flatBonus < 0) parts.push(fmtMod(flatBonus));
  breakdown.push(`Calcul : ${parts.join(' + ')}`);
  breakdown.push(`Dégâts : ${total}`);
  if (finesse && critCount > 0) breakdown.splice(-2, 0, `Bonus répété ×${1 + critCount} (Finesse)`);
  return result(total, false);

  function result(total, miss) {
    return {
      total,
      miss,
      critCount,
      kept: initial,
      stages,
      breakdown,
      finesse,
      hache,
      level,
      sides,
      weaponBonus,
      engagementMod,
      engagementStat: eStat,
      advantage: level + engagement,
      engagement
    };
  }
}
