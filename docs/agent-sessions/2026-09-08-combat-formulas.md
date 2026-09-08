# Agent Session — 2026-09-08 — Rule-accurate combat formulas

## Goal
User restated the authoritative combat formulas and asked to recheck the
implementation against them:

- **Parade** = Déflexion + Garde + Modificateur
  - Déflexion = sum of déflexion of ALL equipped items (not inventory)
  - Garde = die of the equipped melee weapon / 2 (dual wield: sum both)
  - Modificateur = Agilité — Force if a shield is equipped, Force + Agilité
    if the weapon is category "épées droites"
- **Initiative** = Agilité − 10 + initiative des gantelets
- **Mouvement** = 8 + Agilité/2 + mouvement des bottes
- **Bonus attaque** = Force/Agi/Esprit (weapon stat) + tier de l'arme
  (what is added to the weapon die)
- **Canalisation** = mod Esprit (canalising grants advantage)
- **Volonté** = modificateur de Résilience + volonté du casque
- **Seuil de miss** = max(1, 1 − mod Agilité)

## Findings (before)
- Garde was `sum(w.parade)` over equipped weapons — wrong field, no die/2, no melee filter.
- Parade modifier (`defense.bonus`) was a manual input.
- Initiative / Mouvement / Volonté / Seuil miss / Canalisation / Bonus attaque were
  manual free-text fields (Volonté ignored the resilience modifier).

## Changes
- `src/lib/characterSheet.js`
  - `equipmentStats()`: garde = per equipped **melee** weapon, parse its `de`
    field ("1d8") → floor(count × sides / 2); ranged weapons (keyword:
    distance/tir/lancer/javelot/fronde/arbalete/arc) excluded; dual wield sums naturally.
  - `paradeModifier(weapons, stats)`: shield (bouclier/rempart) → Force mod;
    straight sword (épée droite / Garde property) → Force + Agi mods; else Agi mod.
    Missing stats count as 10 (mod 0).
  - `attackBonus(weapon, stats)`: stat mod of the weapon's `forceAgi` field
    (accent/case-insensitive force/agilite/esprit) + `bonus` field (tier).
  - `computeDerived(sheet)`: returns deflexion, armure, garde, paradeBonus,
    parade, initiative, mouvement, volonte, seuilMiss, canalisation, bonusAttaque.
  - `syncStatsFromEquipment(sheet)`: persists all computed values into
    `defense` (incl. `bonus`) and `derived` (volonte, initiative, mouvement,
    seuilMiss, canalisation, bonusAttaque) — runs on save + JSON import.
- `src/lib/CharacterSheet.svelte`
  - Header + edit modal now display live-computed values (formula breakdowns
    shown: "= Défl + Garde + Mod", "= Agi − 10 + gants", etc.).
  - Manual inputs removed for parade bonus, seuil miss, bonus attaque,
    canalisation (read-only computed chips in the modal).
  - Each weapon card in ARMES shows its own attack bonus next to its die.
- `tests/unit/characterSheet.test.js` — updated garde/sync tests, added
  paradeModifier / attackBonus / computeDerived suites (melee filter, dual
  wield, ranged exclusion, shield/straight-sword modifiers, seuil miss,
  accent-insensitive keywords). 12 new tests.

## Assumptions (flagged to user)
- Weapon categories detected by keyword matching on free-text weapon fields
  (`ponytail:` comment marks the upgrade path to a structured field).
- "Garde = dé / 2" interpreted as (dice count × die size) / 2 ("1d8" → 4, "2d6" → 6).
- Agilité/2 floored for Mouvement (odd Agilité).
- Canalisation = Esprit modifier only (CARDENVEIL.md also adds the catalyst
  bonus; the user's formula omits it).
- Canalisation color association is rule text; the numeric value displayed is mod Esprit.

## Verification
- `npm test` → 109/109 pass (was 97).
- `npm run build` → OK.

## Files
- `src/lib/characterSheet.js`
- `src/lib/CharacterSheet.svelte`
- `tests/unit/characterSheet.test.js`
- `.agent/CONTINUITY.md`, this file

Branch: `agent/sheet-formulas` (commit `b1db0cb`, on top of main `fea589d`).
