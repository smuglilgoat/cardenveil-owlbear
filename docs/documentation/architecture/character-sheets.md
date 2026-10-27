# Character sheets

A sheet is a JSONB document in its own table, keyed by `(player_id, room_id)`, synced independently of game state. The schema's live source of truth is **`createEmptyCharacterSheet()`** in `src/lib/characterSheet.js`. `docs/character-sheet-analysis.md` is an outdated planning document — do not trust it.

## Storage

```sql
CREATE TABLE IF NOT EXISTS character_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL,
  room_id TEXT NOT NULL,

  name TEXT NOT NULL DEFAULT '',
  race TEXT,
  level INTEGER DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_player_room_sheet UNIQUE (player_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_character_sheets_player ON character_sheets(player_id);
CREATE INDEX IF NOT EXISTS idx_character_sheets_room ON character_sheets(room_id);

ALTER TABLE character_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations"
  ON character_sheets
  FOR ALL
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE character_sheets;
```

That is `supabase/migrations/20240101_create_character_sheets.sql` (which also adds the `updated_at` trigger). Note `room_id` is **TEXT, not UUID**, and there is no foreign key to `game_rooms` — OBR ids are opaque strings, and `game_rooms` has no migration in this repository. There is no per-user auth: "Allow all operations" is deliberate, because the plugin runs in an OBR frame with no user identity the server could verify; validation happens in the server functions.

## Module `src/lib/characterSheet.js`

CRUD, live sync (`subscribeToCharacterSheet`), the empty-sheet factory, the rule-derived formulas, race traits and the shared UI constants (stat colours, skill groups, suit helpers, `EQUIPMENT_CATALOG`). A save also posts on the same-origin **BroadcastChannel `cardenveil-sheet`**, so the other frames of the same browser (the compact popover in particular) refresh immediately instead of waiting for Realtime. The compact popover also runs a 1.5s reconcile poll on `actionChecks` as a fallback.

## Sheet shape

* `schemaVersion` (`1`) and `templateId` (`'cardenveil-standard'`) — version and template tags written by the factory.
* `identity` — Nom, race, niveau, alignement, plus extras (joueur, âge, taille, yeux…) and `diceColor`.
* `portrait` — emoji or URL (`isImageUrl()` decides).
* `stats` — force, agilite, esprit, social.
* `progression` — xp.
* `derived` — pv, initiative, mouvement, volonte, seuilMiss, canalisation, bonusAttaque, fatigue, mort… plus `overrides` for user-set values.
* `defense` — parade components: deflexion, armure, gardeBonus, bonus.
* `skills` — 16 skills with `{ trained, bonus }`, grouped by attribute through the single `SKILL_TO_STAT` map: Force (athlétisme, résilience), Agilité (acrobaties, discrétion, escamotage), Esprit (arcanes, investigation, perception, culture, survie), Social (persuasion, tromperie, intimidation, représentation, perspicacité, dressage).
* `weapons[]` and `inventoryItems[]` — structured, with `equipped`/`hand` tags; `type` is Arme / Équipement / Consommable / Divers (legacy `Armure` normalizes to Équipement).
* `equipment` — 7 armour slots: casque, plastron, gantelets, bottes, anneau, amulette, cape.
* `totem` — nom, description, image (emoji or URL).
* `narrative` — background, objectif, liens, plus 9 more: `traitsSpeciaux` (array), personnalite, reputation, education, croyances, cicatrices, pulsion, maniesEtTics, instinct.
* `capacities[]` — each with a dice formula in `value.main`, `cost.total` and `cost.color` (suit name).
* `abilityControls` — `cardMin`, `cardMax`, `knownAbilities`, `maxPreparedAbilities` and per-suit `colorReductions`.
* `resources` — or, rations, tokens.
* `actions`, `reactions`, `tokens` — freeform lists of the character's own options.
* `pinnedSkills` / `pinnedCapacities` — 📌 favourites, click-to-roll in the compact popover.
* `actionChecks` — per-turn ACTION / BONUS / RÉACTION diamond toggles.
* `notes`, `evolutions`, `feats`, `weaponMasteries`, `elementalMasteries`, `customRolls`.

## Derived combat values

Computed by `computeDerived()`, never entered by hand (overridable through `derived.overrides`):

```
parade       = Σ deflexion (equipped pieces) + garde (melee die/2, dual-wield sums)
               + mod (Agi; Force with a shield; Force+Agi for épées droites)
initiative   = Agilité − 10 + gantelets
mouvement    = 5 + Agi/2 + bottes
volonté      = mod Résilience + casque
seuilMiss    = max(1, 1 − mod Agi)
canalisation = mod Esprit
bonusAttaque = attackBonus(main-hand weapon) = governing stat mod + weapon tier
```

Mouvement was 8 + Agi/2 before 2026-09-14; `CARDENVEIL.md` still shows the old formula. Weapon categories (`paradeModifier`, Finesse, two-handed) are **keyword-matched on the free-text weapon fields** — `proprietes` and `propriétés` are both read, and the fallback is deliberately conservative. `handSlots()` resolves main/off hand, including legacy sheets (an equipped weapon with no `hand` tag counts as main; a two-hander occupies both).

Syncing happens on load and save through `syncStatsFromEquipment()` + `syncSkillBonuses()`.

## Component and entry points

* **`CharacterSheet.svelte`** — full sheet, 6 tabs (COMPÉTENCES, CAPACITÉS, INVENTAIRE, NARRATIF, MAÎTRISES, NOTES). ÉDITION opens a large in-app edit modal with its own tab bar; the header and tabs stay display-only and reflect the edit buffer live. Save writes to Supabase (after the two syncs); Cancel reverts to the last saved state.
* **`SheetPopover.svelte`** (`sheet.html`) — compact popover: basic info, per-turn action diamonds, and click-to-roll favourites. Folds/unfolds in place through `OBR.popover.setHeight`; it reads its `?popoverId=` from the URL.
* **GMDashboard** — a "Fiche de personnage" button per player opens the same sheet in a modal, view and edit.
* **`ItemAddPopup.svelte`** — centred modal listing the whole `EQUIPMENT_CATALOG` plus blank item/weapon entries. Opened by « ＋ Ajouter » in INVENTAIRE/SAC and by the GM modal; consumables ask for a quantity first. Both write through the pure helpers `withItemFromTemplate` / `withWeaponFromTemplate`.

## Synchronization

* Tokens and fatigue sync **both ways** between sheet and game state. A race chosen on the sheet reaches game state through `SET_RACE`, which a player may send for their own record (no GM rights needed).
* Pins, action diamonds and game-state token/fatigue changes save immediately (a `$effect` in `CharacterSheet.svelte`); sheet edits save on ÉDITION Save.
* Sheets subscribe to their own Supabase realtime channel, per player.

## Import and assets

`importCharacterSheet` accepts `.json` or `.zip`. A zip contains `<sheetId>.rpsheet.json` + `metadata.json` (ignored) + `assets/<sheetId>/` with `portrait.png`, `totem.png`, `capacity-N.png`; the JSON references them by relative path (`/assets/<sheetId>/…`). `src/lib/sheetAssets.js` unzips (fflate), uploads every referenced image to the Supabase Storage bucket **`character-assets`** (public read, path `{roomId}/{playerId}/{fileName}`, upsert, `?v=` cache buster), rewrites the image fields to those URLs, then runs the regular merge/strip/save. Bucket setup: `supabase/migrations/20260910_create_character_assets_bucket.sql`.

The import also strips every `data:` base64 image (they bloated Supabase writes) and normalizes race names: `normalizeRaceName()` (accentless, lowercase, hyphenated) plus `RACE_ALIASES` for Halfelin, Tiefling, Drow, the elf variants, Half-Elf, Half-Orc, Dwarf, Dragonborn, Undead, Fishman, Centaur, Warforged, Mind Flayer, Fir Bolg, Khajit and friends.

## Dice rolling

Capacity dice formulas live in `value.main` ("4d6", "2d8+3", "Mod Esprit D6", "3 mod FORCE D8") and may be compound ("1d6+1d4"). `isDiceFormula` decides rollability, `parseDiceSpec` expands them, `attackRoll.js` handles attacks.

1. `broadcastRoll()` (OBR broadcast, destination ALL) sends the roll intent: in **3D mode** a seeded spec `{ diceSpec, modifier, seed }`, so every client's popup runs the same deterministic Rapier simulation and shows the same numbers; in **flat ("GM Classique") mode** pre-rolled `{ rolls, diceTypes, total }`.
2. The persistent `background.html` page receives it and opens `dice.html` on every client — roller bottom-left, others bottom-right, auto-close after 6s, crit gold and natural-1 red flashes.
3. The roller's popup reports its result on the local BroadcastChannel `cardenveil-roll-result`, so its own sheet frames log it. Only the roller logs.
4. On any simulation failure (or an unsupported die side) the popup falls back to a static display of the pre-rolled or inline result.

Rolls triggered inside a sheet use `attackRoll.js` or `skillRollModifier()`; race advantages turn a roll into 2d20 keep best/worst — see [Race passives](../reference/race-passives.md).
