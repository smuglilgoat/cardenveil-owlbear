# Agent Session — 2026-09-08 — Character sheet Figma UI restyle

## Goal
Rewrite `src/lib/CharacterSheet.svelte` so its disposition, layout and style match
`docs/character-sheet-prototype.html` exactly (3-zone Figma layout replacing the
plain gray-900 tab form), per user-approved defaults:
1. Layout fills panel width (not fixed 760×1120) — header/nav fixed, content scrolls.
2. All 7 equipment slots rendered (incl. `bottes`, absent from prototype).
3. Maîtrises pills render string arrays (item shape unconfirmed; empty in real sheets).
4. Added `notes` (string) + `evolutions` (array) to `createEmptyCharacterSheet`.
5. Narrative extras (réputation, éducation, maniesEtTics) kept as additional cards.
6. Skill click rolls `d20 + skillModifier` via `USE_CAPACITY`.

## Files changed
- `src/lib/CharacterSheet.svelte` — full template rewrite (~1100 lines): top bar
  (CARDENVEIL, identity summary, IMPORTER/SUPPRIMER/ANNULER/SAUVEGARDER pills,
  ÉDITION toggle), persistent header (portrait img/placeholder, identity, XP pills,
  HP block with TEMP/FATIGUE dots, 4 colored stat cards, Parade breakdown
  (teal Déflexion / orange Garde / Bonus), Initiative (agilité color), Mouvement,
  5-pill row incl. accent TOTEM pill → jumps to Capacités tab), scrollable viewport
  with 6 tabs (COMPÉTENCES grouped by stat with colored bars; CAPACITÉS with 80×80
  image slot, COÛT column, slate dice buttons, free roller, totem block; INVENTAIRE
  with equipment card grid + expandable slots + grouped inventory list + ARMES
  section; NARRATIF card grid with Développer toggle; MAÎTRISES pill blocks; NOTES
  toolbar + editor), bottom nav, restyled modals. All prior logic kept (realtime
  subscribe, token/fatigue $effect sync, syncStatsFromEquipment, manual save,
  base64-strip import, USE_CAPACITY dispatch, unsaved-changes guard).
  Edit mode: identity extras row (joueur/âge/taille/poids/yeux/peau/cheveux/
  portrait URL/XP/niveau), inline inputs in header, per-capacity form, slot fields,
  dynamic inventory item fields, weapon fields, narrative textareas, mastery
  textareas (one item per line), notes textarea with selection tools.
- `src/lib/characterSheet.js` — `createEmptyCharacterSheet` gains `evolutions: []`, `notes: ''`.
- `index.html` — Google Fonts Inter (400–700) preconnect + stylesheet.

## Commands run
- `git checkout -b agent/sheet-figma-ui`
- `npm test` → 97/97 pass (4 suites)
- `npm run build` → OK (existing a11y warnings only)
- Commit `93614b7` on `agent/sheet-figma-ui` (not merged — awaiting user)

## Notes / deviations
- Stat colors applied via inline `style` (not Tailwind classes) so `text-stat-*`
  utilities are unnecessary; all Figma hexes verified present in built CSS bundle.
- Initiative "Bonus" bound to agilité modifier; Mouvement bonus omitted (no data
  source — `equipmentStats` returns only deflexion/armure/volonte/garde).
- Notes toolbar: B/U wrap selection (`**`/`__`), •/☐ prefix lines, — inserts dash;
  T-/T+ rendered but non-functional (title "non implémenté").
- Equipment slot cards expand on click (›) to show/edit all slot fields.
- Inventory view groups by item `type` (matches real sheets: Arme/Équipement/
  Consommable); HTML tags stripped from descriptions for display.
