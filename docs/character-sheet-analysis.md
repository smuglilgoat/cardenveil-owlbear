# Character Sheet Integration Analysis

## Overview

This document analyzes the character sheet JSON structure for integration into the Cardenveil application. The character sheet system uses a card-based magic system where abilities (capacities) cost specific card values to activate.

**Character Example:** Afreaux Shaufeois (Haut Elfe, Level 1)

---

## JSON Structure Analysis

### Top-Level Metadata

```json
{
  "schemaVersion": 1,
  "id": "afreaux-shaufeois",
  "templateId": "cardenveil-standard",
  "createdAt": "2026-05-12T00:00:00+00:00",
  "updatedAt": "2026-06-13T14:45:12.351Z"
}
```

**Purpose:** Versioning and identification
- `schemaVersion`: For future migrations
- `id`: Unique character identifier (URL-friendly slug)
- `templateId`: Character sheet template type
- `createdAt/updatedAt`: Timestamps for sync

---

## Core Sections

### 1. Identity (`identity`)

Basic character information:

```json
{
  "nom": "Afreaux Shaufeois",
  "joueur": "",
  "niveau": 1,
  "race": "Haut Elfe",
  "alignement": "Neutre Neutre",
  "age": "90",
  "taille": "1m75",
  "poids": "64kg",
  "yeux": "marron",
  "peau": "blanche",
  "cheveux": "Longs/Noirs"
}
```

**Integration Points:**
- `nom` → Display name in UI
- `race` → Maps to `player.race` (already exists: 'haut-elfe', 'tieffelin', 'aasimar', 'halfling', 'sporelin')
- `niveau` → Level progression (not currently tracked)
- `joueur` → Player name (from OBR identity)

**Recommendation:** Store in `player.characterSheet.identity`

---

### 2. Portrait (`portrait`)

```json
"portrait": "/assets/afreaux-shaufeois/portrait.png"
```

**Purpose:** Character image for UI display
**Storage:** File path relative to character assets
**Integration:** Display in player panel and character sheet view

---

### 3. Core Stats (`stats`)

```json
{
  "force": 6,
  "agilite": 14,
  "esprit": 18,
  "social": 14
}
```

**Purpose:** Base attribute scores (ability modifiers)
**Integration:** These are the **attribute modifiers**, not the token counts
- Used for calculating skill bonuses
- Used for capacity incantation reductions
- Not directly used in card game mechanics

**Mapping:**
- `force` → Strength modifier
- `agilite` → Dexterity modifier
- `esprit` → Intelligence/Wisdom modifier (primary for casters)
- `social` → Charisma modifier

**Recommendation:** Store in `player.characterSheet.stats`

---

### 4. Progression (`progression`)

```json
{
  "xpDepenses": 0,
  "xpDisponibles": 0
}
```

**Purpose:** Experience point tracking
- `xpDepenses`: XP spent on upgrades
- `xpDisponibles`: XP available to spend

**Integration:** Not currently tracked in game state
**Recommendation:** Add to `player.characterSheet.progression`

---

### 5. Derived Stats (`derived`)

Calculated values based on core stats and equipment:

```json
{
  "pvMax": 45,
  "bonusPv": "",
  "pvActuels": 90,
  "pvTemporaires": "",
  "mouvement": 12,
  "initiative": 4,
  "perceptionPassive": 14,
  "seuilSauvegarde": "",
  "seuilMiss": 1,
  "canalisation": 4,
  "bonusAttaque": "",
  "inspiration": "",
  "fatigue": "",
  "mort": "",
  "volonte": -2
}
```

**Key Fields:**
- `pvMax/pvActuels/pvTemporaires`: Health points (current: 90/45 - overhealed?)
- `mouvement`: Movement speed (12m)
- `initiative`: Initiative bonus (+4)
- `perceptionPassive`: Passive perception (14)
- `canalisation`: Channeling stat (4) - used for capacity cost reduction
- `fatigue`: Fatigue level (maps to `player.fatigue`)
- `volonte`: Will save modifier (-2)

**Integration Points:**
- `fatigue` → Already tracked in `player.fatigue` (0-4 scale)
- `pvActuels` → Should be tracked for combat
- `initiative` → Used for turn order

**Recommendation:** Store in `player.characterSheet.derived`, sync `fatigue` with `player.fatigue`

---

### 6. Defense (`defense`)

```json
{
  "parade": "",
  "armure": "",
  "deflexion": 0,
  "gardeBonus": "",
  "bonus": ""
}
```

**Purpose:** Defensive stats
- `parade`: Parry bonus
- `armure`: Armor bonus
- `deflexion`: Deflection bonus (0)
- `gardeBonus`: Guard bonus
- `bonus`: Total defense bonus

**Integration:** Not currently tracked
**Recommendation:** Store in `player.characterSheet.defense`

---

### 7. Resources (`resources`)

```json
{
  "or": "",
  "rations": "",
  "cartesEtTokens": "",
  "tokens": {
    "force": 0,
    "agilite": 3,
    "esprit": 5,
    "social": 3
  }
}
```

**Purpose:** Currency and token tracking
- `or`: Gold pieces
- `rations`: Food supplies
- `cartesEtTokens`: Card/token notes
- `tokens`: **Current token counts** (maps to `player.tokens`)

**Critical Integration:**
- `resources.tokens` → **Directly maps to `player.tokens`**
- This is the actual token count used in game mechanics
- `stats` are modifiers, `resources.tokens` are spendable resources

**Mapping:**
```javascript
player.tokens = {
  force: resources.tokens.force,      // 0
  agilite: resources.tokens.agilite,  // 3
  esprit: resources.tokens.esprit,    // 5
  social: resources.tokens.social     // 3
}
```

**Recommendation:** Sync `resources.tokens` with `player.tokens` bidirectionally

---

### 8. Skills (`skills`)

16 skills with training and bonuses:

```json
{
  "athletisme": { "trained": false, "bonus": -2 },
  "acrobaties": { "trained": false, "bonus": 2 },
  "arcanes": { "trained": true, "bonus": 4 },
  // ... 13 more skills
}
```

**Skills List:**
1. athletisme (Athletics) - STR
2. resilience (Resilience) - CON
3. acrobaties (Acrobatics) - DEX
4. discretion (Stealth) - DEX
5. escamotage (Sleight of Hand) - DEX
6. arcanes (Arcana) - INT
7. investigation (Investigation) - INT
8. perception (Perception) - WIS
9. culture (Culture) - INT
10. survie (Survival) - WIS
11. persuasion (Persuasion) - CHA
12. tromperie (Deception) - CHA
13. intimidation (Intimidation) - CHA
14. representation (Performance) - CHA
15. perspicacite (Insight) - WIS
16. dressage (Animal Handling) - WIS

**Integration:** Used for skill checks and capacity saves
**Recommendation:** Store in `player.characterSheet.skills`

---

### 9. Weapons (`weapons`)

Array of 3 weapon slots:

```json
[
  {
    "nom": "",
    "de": "",
    "forceAgi": "",
    "critique": "",
    "avantage": "",
    "bonus": "",
    "perfection": "",
    "notes": ""
  }
]
```

**Fields:**
- `nom`: Weapon name
- `de`: Damage die (e.g., "1d8")
- `forceAgi`: STR or DEX based
- `critique`: Critical hit range
- `avantage`: Advantage conditions
- `bonus`: Attack bonus
- `perfection`: Mastery level
- `notes`: Special properties

**Integration:** Not currently tracked
**Recommendation:** Store in `player.characterSheet.weapons`

---

### 10. Inventory (`inventory`)

```json
{
  "equipement": "",
  "inventaire": "",
  "totem": "..."
}
```

**Purpose:** General equipment and items
- `equipement`: Equipped gear description
- `inventaire`: Carried items
- `totem`: Totem description (duplicated in `totem` section)

**Integration:** Free-form text fields
**Recommendation:** Store in `player.characterSheet.inventory`

---

### 11. Totem (`totem`)

Special ability tied to card discarding:

```json
{
  "nom": "Totem du paradoxe élémentaire",
  "description": "Défaussez une carte qui vous met dans un état élémentaire...",
  "image": "/assets/afreaux-shaufeois/totem.png"
}
```

**Mechanic:** Discard a card to enter elemental state
- ♦ Carreaux → Feu (Fire)
- ♣ Trèfles → Glace (Ice)
- ♠ Piques → Eau (Water)
- ♥ Cœurs → Foudre (Lightning)

**Effects:**
- All damage becomes that element
- Stack +1 mod Esprit per ability of that element
- After mod Esprit abilities, stacks go negative (exhaustion)
- Can use stacks for harmonization/alteration rolls

**Integration:** This is a **card game mechanic** that interacts with the discard system
**Recommendation:** 
- Store in `player.characterSheet.totem`
- Add action type: `USE_TOTEM` that discards a card and sets elemental state
- Track `player.elementalState` and `player.elementalStacks`

---

### 12. Narrative (`narrative`)

Character background and personality:

```json
{
  "background": "Chercheur en linguistique de la magie.",
  "objectif": "Comprendre la linguistique des arcanes de ce monde.",
  "liens": "",
  "traitsSpeciaux": ["+ 1 capacité, +1 carte en main (haut elfe)"],
  "personnalite": "Est froid et très intimidant.",
  "reputation": "Est perçu comme très intelligent...",
  "education": "A étudié les théories de la magie...",
  "croyances": "",
  "cicatrices": "S'est brûlé le visage...",
  "pulsion": "",
  "maniesEtTics": "",
  "instinct": ""
}
```

**Integration:** Display-only, no game mechanics
**Recommendation:** Store in `player.characterSheet.narrative`

---

### 13. Capacities (`capacities`)

**Core mechanic:** Abilities that cost cards to activate

```json
[
  {
    "name": "Leyline",
    "prepared": true,
    "image": "/assets/afreaux-shaufeois/capacity-1.png",
    "description": "Invoquez Leyline, une rune de 3m de diamètre...",
    "value": {
      "main": "X",
      "bonus": ""
    },
    "cost": {
      "color": "heart",
      "base": 13,
      "incantationReduction": 8,
      "colorReduction": 0,
      "awakeningReduction": 0,
      "weaponMasteryReduction": 0,
      "total": 5
    },
    "incantation": "Esprit",
    "save": "X",
    "usage": "Bonus action / Concentration"
  }
]
```

**Key Fields:**
- `name`: Ability name
- `prepared`: Is it prepared for use?
- `image`: Ability icon
- `description`: Effect description
- `value.main/bonus`: Damage/effect values
- `cost`: Card cost structure
- `incantation`: Which stat reduces cost (Esprit = INT)
- `save`: Saving throw to resist
- `usage`: Action type (Action/Bonus action/Réaction)

**Cost Structure:**
```json
{
  "color": "heart",           // Required suit (♥)
  "base": 13,                 // Base card value needed (King)
  "incantationReduction": 8,  // Reduction from Esprit stat
  "colorReduction": 0,        // Reduction from color mastery
  "awakeningReduction": 0,    // Reduction from awakening
  "weaponMasteryReduction": 0,// Reduction from weapon mastery
  "total": 5                  // Final card value needed (5♥)
}
```

**Mechanic:** To use "Leyline", player must discard a 5♥ (or higher heart card)

**Integration:** This is the **core card game integration**
- Capacities cost cards from hand
- Player discards card → ability activates
- Card value must meet or exceed `cost.total`
- Card suit must match `cost.color` (if specified)

**Recommendation:**
- Store in `player.characterSheet.capacities`
- Add action type: `USE_CAPACITY` that validates card cost and discards
- Track prepared capacities separately
- Display in UI with card cost indicators

---

### 14. Ability Controls (`abilityControls`)

```json
{
  "cardMin": "",
  "cardMax": "",
  "knownAbilities": "9",
  "maxPreparedAbilities": "",
  "colorReductions": {
    "spade": 0,
    "heart": 0,
    "diamond": 0,
    "club": 0
  }
}
```

**Purpose:** Ability management rules
- `cardMin/cardMax`: Card value range for abilities
- `knownAbilities`: Total known abilities (9)
- `maxPreparedAbilities`: Max prepared at once
- `colorReductions`: Global cost reductions per suit

**Integration:** Used for capacity cost calculations
**Recommendation:** Store in `player.characterSheet.abilityControls`

---

### 15. Equipment (`equipment`)

7 armor slots:

```json
{
  "casque": { "nom": "", "raretePrix": "", "deflexion": "", "volonte": "", "enchantement": "", "description": "" },
  "plastron": { "nom": "", "raretePrix": "", "deflexion": "", "armure": "", "enchantement": "", "description": "" },
  "gantelets": { "nom": "", "raretePrix": "", "deflexion": "", "initiative": "", "enchantement": "", "description": "" },
  "bottes": { "nom": "", "raretePrix": "", "deflexion": "", "vitesse": "", "enchantement": "", "description": "" },
  "anneau": { "nom": "", "raretePrix": "", "enchantement": "", "description": "" },
  "amulette": { "nom": "", "raretePrix": "", "enchantement": "", "description": "" },
  "cape": { "nom": "", "raretePrix": "", "enchantement": "", "description": "" }
}
```

**Slots:**
1. casque (Helmet)
2. plastron (Chest armor)
3. gantelets (Gauntlets)
4. bottes (Boots)
5. anneau (Ring)
6. amulette (Amulet)
7. cape (Cape)

**Integration:** Equipment affects derived stats
**Recommendation:** Store in `player.characterSheet.equipment`

---

### 16. Empty Arrays

```json
{
  "actions": [],
  "reactions": [],
  "tokens": [],
  "weaponMasteries": [],
  "elementalMasteries": [],
  "inventoryItems": [],
  "feats": []
}
```

**Purpose:** Extensible arrays for future features
- `actions/reactions`: Combat actions
- `tokens`: Special tokens (not the stat tokens)
- `weaponMasteries/elementalMasteries`: Mastery progress
- `inventoryItems`: Structured inventory
- `feats`: Character feats/perks

**Integration:** Not currently used
**Recommendation:** Store as-is for future expansion

---

## Data Model Recommendations

### Player State Extension

```javascript
player: {
  // Existing fields
  name: "Afreaux Shaufeois",
  hand: [...],
  crystallized: [...],
  tokens: { force: 0, agilite: 3, esprit: 5, social: 3 },
  maxTokens: { force: 3, agilite: 3, esprit: 3, social: 3 },
  race: "haut-elfe",
  fatigue: 0,
  
  // New character sheet fields
  characterSheet: {
    identity: { ... },
    portrait: "/assets/...",
    stats: { force: 6, agilite: 14, esprit: 18, social: 14 },
    progression: { xpDepenses: 0, xpDisponibles: 0 },
    derived: { pvMax: 45, pvActuels: 90, ... },
    defense: { ... },
    skills: { ... },
    weapons: [...],
    inventory: { ... },
    totem: { ... },
    narrative: { ... },
    capacities: [...],
    abilityControls: { ... },
    equipment: { ... },
    actions: [],
    reactions: [],
    weaponMasteries: [],
    elementalMasteries: [],
    inventoryItems: [],
    feats: []
  },
  
  // Elemental state (for totem)
  elementalState: null, // "fire" | "ice" | "water" | "lightning" | null
  elementalStacks: 0
}
```

---

## Integration Points

### 1. Token Sync

**Bidirectional sync between:**
- `player.tokens` (game state)
- `player.characterSheet.resources.tokens` (character sheet)

**Implementation:**
```javascript
// When tokens change in game
player.tokens.force = 2;
player.characterSheet.resources.tokens.force = 2;

// When tokens change in character sheet
player.characterSheet.resources.tokens.force = 1;
player.tokens.force = 1;
```

### 2. Fatigue Sync

**Bidirectional sync between:**
- `player.fatigue` (game state, 0-4)
- `player.characterSheet.derived.fatigue` (character sheet)

### 3. Race Mapping

**Character sheet → Game:**
- "Haut Elfe" → "haut-elfe"
- "Tieffelin" → "tieffelin"
- "Aasimar" → "aasimar"
- "Halfling" → "halfling"
- "Sporelin" → "sporelin"

### 4. Capacity Usage

**New action type: `USE_CAPACITY`**

```javascript
{
  type: 'USE_CAPACITY',
  playerId: 'player-1',
  capacityId: 'leyline',
  cardId: 'n-H-5-abc123' // Card to discard
}
```

**Validation:**
1. Check capacity exists and is prepared
2. Check card is in player's hand
3. Check card value >= capacity cost.total
4. Check card suit matches capacity cost.color (if specified)
5. Discard card
6. Apply capacity effect

### 5. Totem Usage

**New action type: `USE_TOTEM`**

```javascript
{
  type: 'USE_TOTEM',
  playerId: 'player-1',
  cardId: 'n-D-7-xyz789' // Card to discard
}
```

**Effect:**
1. Discard card
2. Set `player.elementalState` based on card suit
3. Reset `player.elementalStacks` to 0

---

## UI Considerations

### 1. Character Sheet Panel

**Location:** Sidebar panel (like PlayerHand)
**Toggle button:** "📜 Fiche de personnage"

**Sections to display:**
- Identity (name, race, level, portrait)
- Core stats (force, agilite, esprit, social)
- Derived stats (PV, initiative, mouvement)
- Resources (tokens, or)
- Skills (with trained indicator)
- Capacities (with card cost display)
- Equipment (7 slots)
- Narrative (background, personality)

### 2. Capacity Cards

**Display format:**
```
┌─────────────────┐
│ Leyline         │
│ ♥ 5+            │  ← Card cost (suit + value)
│ Bonus action    │
│                 │
│ Invoquez une... │
│                 │
│ [Utiliser]      │
└─────────────────┘
```

**Interaction:**
- Click "Utiliser" → opens card picker
- Show only valid cards (correct suit and value)
- Discard selected card and activate capacity

### 3. Totem Display

**Display format:**
```
┌─────────────────┐
│ Totem du        │
│ paradoxe        │
│ élémentaire     │
│                 │
│ État: Feu (2)   │  ← Current elemental state + stacks
│                 │
│ [Activer]       │
└─────────────────┘
```

### 4. Stat Display

**Core stats:**
```
Force: 6    Agilité: 14
Esprit: 18  Social: 14
```

**Derived stats:**
```
PV: 90/45  Initiative: +4
Mouvement: 12m  Perception: 14
```

### 5. Skill List

**Display format:**
```
✓ Arcanes +4
  Acrobaties +2
✓ Intimidation +2
  Perception +4
```
(✓ = trained)

---

## Implementation Roadmap

### Phase 1: Data Storage (Week 1)

1. **Extend player state schema**
   - Add `characterSheet` object to player state
   - Add `elementalState` and `elementalStacks` fields
   - Update hydration/dehydration functions

2. **Create character sheet API**
   - `GET /api/character/:characterId` - Fetch character sheet
   - `POST /api/character/:characterId` - Update character sheet
   - Store in Supabase `character_sheets` table

3. **Sync mechanisms**
   - Bidirectional sync for `tokens` and `fatigue`
   - Race mapping function
   - Validation for character sheet updates

### Phase 2: UI Components (Week 2)

1. **CharacterSheetPanel.svelte**
   - Sidebar panel with toggle button
   - Display all character sheet sections
   - Edit mode for character sheet updates

2. **CapacityCard.svelte**
   - Display capacity with card cost
   - "Utiliser" button with card picker
   - Validation for valid cards

3. **TotemDisplay.svelte**
   - Display current elemental state
   - "Activer" button with card picker
   - Show elemental stacks

4. **SkillList.svelte**
   - Display all 16 skills
   - Show trained status and bonuses

### Phase 3: Game Actions (Week 3)

1. **USE_CAPACITY action**
   - Validate card cost
   - Discard card
   - Apply capacity effect
   - Log action

2. **USE_TOTEM action**
   - Discard card
   - Set elemental state
   - Reset stacks
   - Log action

3. **UPDATE_CHARACTER_SHEET action**
   - GM can update character sheets
   - Validate changes
   - Sync with game state

### Phase 4: Integration (Week 4)

1. **Character sheet import**
   - JSON import from external source
   - Validate schema
   - Map to player state

2. **Character sheet export**
   - Export to JSON
   - Include all game state changes

3. **Testing**
   - Unit tests for new actions
   - Integration tests for sync mechanisms
   - UI tests for character sheet panel

---

## Technical Challenges

### 1. Data Size

**Problem:** Character sheets are large (10+ KB per character)
**Solution:** 
- Store character sheets separately in `character_sheets` table
- Only load when character sheet panel is opened
- Use lazy loading

### 2. Sync Conflicts

**Problem:** Tokens and fatigue can change from both game and character sheet
**Solution:**
- Use optimistic updates
- Server-side validation
- Conflict resolution strategy (last write wins)

### 3. Capacity Validation

**Problem:** Complex validation rules for capacity usage
**Solution:**
- Server-side validation in `applyAction`
- Client-side validation for UX
- Clear error messages

### 4. Elemental State Tracking

**Problem:** Elemental state affects multiple game mechanics
**Solution:**
- Track in player state
- Apply effects in capacity calculations
- Display clearly in UI

### 5. Performance

**Problem:** Large character sheets could slow down state sync
**Solution:**
- Lazy load character sheets
- Only sync when needed
- Compress character sheet data

---

## Migration Strategy

### Existing Players

1. **Add character sheet fields with defaults**
   ```javascript
   player.characterSheet = {
     identity: { nom: player.name, race: player.race },
     stats: { force: 10, agilite: 10, esprit: 10, social: 10 },
     // ... other defaults
   }
   ```

2. **Sync existing tokens**
   ```javascript
   player.characterSheet.resources.tokens = player.tokens;
   ```

3. **Provide character sheet editor**
   - Allow players to fill in details
   - Import from external source

### New Players

1. **Character sheet creation flow**
   - Create character sheet first
   - Map to player state
   - Sync tokens and race

---

## Conclusion

The character sheet system provides a rich RPG layer on top of the card game mechanics. The key integration points are:

1. **Tokens** - Bidirectional sync between game and character sheet
2. **Capacities** - Card-based ability system
3. **Totem** - Elemental state from card discarding
4. **Fatigue** - Shared between game and character sheet
5. **Race** - Maps to existing race system

The implementation should be phased to minimize risk and allow for testing at each stage. The character sheet panel will provide a familiar RPG interface while maintaining the card game mechanics at the core.

**Next Steps:**
1. Review this analysis with the team
2. Prioritize features (tokens sync, capacities, totem)
3. Create detailed technical specifications
4. Begin Phase 1 implementation
