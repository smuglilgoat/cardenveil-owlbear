# Session — 2026-09-30 — Crit zoom restricted to attack/stat/skill rolls

## Goal
The camera punch-in on crit faces should happen only for attack rolls (⚔️),
stat rolls (Force/Agilité/Esprit/Social) and COMPÉTENCES — not for capacity
rolls, quick dice, custom rolls, etc.

## Change (main direct, commit `90eb561`)
- Roll intents now carry a `zoomCrit` flag:
  - `SheetPopover`: `throwAttackStage` (attack stages) always sets it;
    `doRoll(label, formula, {zoomCrit: true})` on the stat chips and pinned
    skill buttons;
  - `CharacterSheet`: `handleDiceRoll(..., {zoomCrit: true})` on stat clicks
    and in `handleSkillRoll`;
  - `background.js` forwards it as a `zoomCrit` URL param;
  - `dice3d.js` gates BOTH zoom triggers (snap path + chip path) on it.
- Not zoomed: capacity rolls (🪄 accordion, pinned capacities, capacity
  cards), Jet rapide, custom rolls, Lancer libre, Initiative/Vitesse/Volonté.

## Verification
- `npm run test:unit`: 206/206 pass; `npm run build`: green.
