# INVENTAIRE tab — UI proposals (set 2)

> **Attribution tag: `deepseek v4.1 flash`** — tag applied at the user's request; content was
> generated in this planner session. Proposals only — nothing implemented.
> Companion doc: `docs/inventaire-ui-proposals.md` (set 1, tagged GLM-5.3-Flash: A / B / C).
> Data model assumed: 7 equipment slots (amulette ◈, casque ⛑, cape 🧥, gantelets 🧤,
> plastron 🛡, anneau 💍, bottes 🥾), `inventoryItems` grouped by `type` with `degats` or
> `x<quantité>`, `weapons` with `de`, `equipped`, free-text properties. Colors: `itemTypeColor`
> (Arme red / Armure blue / Consommable green / Équipement amber / Divers gray).

---

## Proposal D — Item-tile grid ("sac à dos")

Inventory as a grid of square-ish tiles (quantity badge top-right, type color as a thin top
border), equipment collapsed into a single horizontal "worn" strip above it. Weapons are tiles
too, marked with a red corner ribbon. Reads like a game inventory; scans fast, and empty space
is visually obvious.

```
┌──────────────────────────────────────┐
│ ▌PORTÉ                    5/7 slots  │
│ ◈ ⛑ 🧥 🧤 🛡 💍 🥾   ← worn strip   │
│ Amulette Casque Cape Gant. Plastr…   │  ← 7 mini-chips, name under icon
│ (chip cliquable → détail du slot)    │
│                                      │
│ ▌SAC                        12 objets│
│ ┌────────┐┌────────┐┌────────┐       │
│ │▔▔▔▔▔▔▔▔││▔▔▔▔▔▔▔▔││▔▔▔▔▔▔▔▔│       │  ← top border = type color
│ │ 🧪     ││ 📜     ││ 🗡     │       │
│ │ Potion ││Parchem.││Épée ★  │       │  ← icon/emoji + name (2 lines)
│ │   x2   ││        ││  1d8   │       │  ← value centered, bold
│ └────────┘└────────┘└────────┘       │
│ ┌────────┐┌────────┐┌────────┐       │
│ │▔▔▔▔▔▔▔▔││▔▔▔▔▔▔▔▔││▔▔▔▔▔▔▔▔│       │
│ │ 🛡     ││ 🎒     ││ ⛺     │       │
│ │Bouclier││ Corde  ││ Tente  │       │
│ │ defl+2 ││  x1    ││  x1    │       │
│ └────────┘└────────┘└────────┘       │
│  ★ = équipée (ruban rouge en coin)   │
└──────────────────────────────────────┘
```

**Key moves:** worn/equipment reduced to one row of 7 chips (the detail lives in the chip's
popover/expand); everything else becomes uniform tiles; quantity/damage as the tile's big value.
**Pros:** most "game-like", extremely scannable, empty slots obvious. **Cons:** tile grid wastes
vertical space for long names/notes; notes need truncation or a detail view; biggest departure
from the current card look. **Effort:** high.

## Proposal E — Hierarchical accordions with summary bars

One collapsible section per category, each with a sticky summary bar showing counts and the
category's contribution (e.g. ARMURE: deflexion total). Only the open section's items render at
full detail. Best when inventories get long.

```
┌──────────────────────────────────────┐
│ ▾ ÉQUIPEMENT      5/7 · defl 4 arm 3 │ ← summary right-aligned
│ ┌──────────────────────────────────┐ │
│ │ ⛑ Casque — Heaume d'acier   vol+1│ │ ← full-width slot rows
│ │ 🛡 Plastron — Cuirasse     defl+2│ │   (no grid; 1 line each,
│ │ 🥾 Bottes — Bottes de vît. vit+3│ │    click = inline detail)
│ │ 💍 Anneau — (vide)            ▸  │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ▾ ARMES                 2 · 2 équipées│
│ ┌──────────────────────────────────┐ │
│ │ ★ Épée longue   1d8  +3  finesse │ │ ← one row per weapon,
│ │   polyvalente · 3 m · équilibrée │ │   props wrap to line 2
│ │ ☆ Arc court     1d6  +2  distance│ │
│ └──────────────────────────────────┘ │
│                                      │
│ ▸ CONSOMMABLE (3)                    │ ← collapsed: header only
│ ▸ DIVERS (5)                         │
└──────────────────────────────────────┘
```

**Key moves:** `▾/▸` accordion per category with a computed summary; equipment as rows not cards;
weapon properties wrap instead of truncating; collapsed sections cost one line each.
**Pros:** scales to big inventories, gives per-category totals at a glance, minimal scrolling.
**Cons:** extra click to reach collapsed content; summary computation adds a couple of helpers.
**Effort:** medium.

## Proposal F — Master/detail inside the tab

Left (or top) = a compact list of everything (equipment slots, weapons, items grouped by type);
right (or below on narrow panels) = a detail pane showing the selected entry's full data
(description rich-HTML, all fields, equipped state). Mirrors the capacity "+" expand modal but
inline, so nothing pops over the tabletop.

```
┌──────────────────────────────────────┐
│ ▌LISTE            ▌DÉTAIL            │
│ ┌───────────┐ ┌────────────────────┐ │
│ │ÉQUIPEMENT │ │ ⛑ Heaume d'acier   │ │
│ │ ⛑ Casque ◀│ │ ─────────────────  │ │
│ │ 🛡 Plastron│ │ VOLONTÉ   +1       │ │
│ │ 🥾 Bottes │ │ DÉFLEXION —        │ │
│ │ARMES      │ │                    │ │
│ │ ★Épée long.│ │ Description        │ │
│ │ ☆Arc court│ │ Forge naine, gravé │ │
│ │SAC        │ │ de runes… (HTML    │ │
│ │ Potion x2 │ │ rendu, gras/listes)│ │
│ │ Parchem.  │ │                    │ │
│ │ Corde     │ │ [Équipée]  [Notes] │ │
│ └───────────┘ └────────────────────┘ │
│  narrow panel: liste au-dessus,      │
│  détail en dessous (stack)           │
└──────────────────────────────────────┘
```

**Key moves:** single selection state (`selectedItem`), detail pane reuses the existing
expand-in-place field rendering; nothing is truncated anywhere because the pane has room.
**Pros:** best readability for long descriptions and many fields; zero popups; keyboard-friendly.
**Cons:** two-pane layout is cramped below ~420 px (needs the stacked fallback); one more piece
of state; the "scan everything at once" glance is weaker. **Effort:** medium-high.

---

## Set 2 comparison

| Criterion | D — Tiles | E — Accordions | F — Master/detail |
|---|---|---|---|
| Readability | ★★☆ | ★★★ | ★★★ |
| Breathability | ★★☆ | ★★★ | ★★★ |
| Info density | ★★☆ | ★★★ | ★★☆ |
| Fits narrow panel | ★★☆ | ★★★ | ★★☆ |
| Consistency with sheet | ★☆☆ | ★★★ | ★★☆ |
| Effort | High | Medium | Medium-high |

Set-2 pick: **E** — it keeps the card language, scales with inventory size, and adds the
per-category totals the current tab lacks.
