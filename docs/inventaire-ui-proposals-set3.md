# INVENTAIRE tab — UI proposals (set 3)

> **Attribution tag: `qwen 3.8 max`** — tag applied at the user's request; content was generated
> in this planner session. Proposals only — nothing implemented.
> Companions: `docs/inventaire-ui-proposals.md` (set 1, GLM-5.3-Flash: A / B / C) and
> `docs/inventaire-ui-proposals-set2.md` (set 2, deepseek v4.1 flash: D / E / F).
> Same data model and color language as the other sets.

---

## Proposal G — Paper-doll silhouette

The 7 equipment slots are positioned like a body silhouette (casque top, cape behind, plastron
centre, gantelets left/right, anneau + amulette as accessory slots, bottes bottom). Everything
worn is understood spatially; nothing to read. Below it, ARMES and SAC as roomy rows.

```
┌──────────────────────────────────────┐
│            ▌ÉQUIPEMENT               │
│                 ┌────┐               │
│                 │ ⛑  │  casque       │
│                 └────┘               │
│      ┌────┐   ┌──────┐   ┌────┐      │
│      │ 💍 │   │  🛡  │   │ ◈  │      │  anneau / plastron / amulette
│      └────┘   └──────┘   └────┘      │
│    ┌────┐      │ 🧥 │     ┌────┐     │  gantelets · cape · (cape en fond)
│    │ 🧤 │      └──────┘   │ 🧤 │     │
│    └────┘                 └────┘     │
│            ┌────┐  ┌────┐            │
│            │ 🥾 │  │ 🥾 │  bottes    │
│            └────┘  └────┘            │
│   slot plein = carte #111827 + nom   │
│   slot vide  = contour pointillé     │
│   clic = détail (comme aujourd'hui)  │
│                                      │
│ ▌ARMES                               │
│ ┌──────────────────────────────────┐ │
│ │ ★ Épée longue         1d8   +3   │ │
│ │   finesse · polyvalente          │ │
│ └──────────────────────────────────┘ │
│ ▌SAC                                 │
│ ┌──────────────────────────────────┐ │
│ │ 🧪 Potion de soin            x2  │ │
│ │ 📜 Parchemin de feu          x1  │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

**Key moves:** CSS grid with named areas (`grid-template-areas`) to place slots; occupied slots
render name + main bonus inside the tile; empty slots are dashed.
**Pros:** instant "what am I wearing" comprehension, very distinctive, matches the portrait
aesthetic of the sheet header. **Cons:** the silhouette eats vertical space (~180 px) which fights
the 20 % header budget; on a narrow panel the tiles get tiny; labels must shrink to icons.
**Effort:** medium (grid areas + slot tile component).

## Proposal H — Summary bar + generous rows

Breathability-first: one sticky summary bar with the totals equipment contributes
(déflexion, armure, vitesse, volonté), then every item as a tall, airy full-width row with an
icon well, two-line name/notes, and a right-aligned value. Nothing is truncated; whitespace does
the work.

```
┌──────────────────────────────────────┐
│ ╔══════════════════════════════════╗ │
│ ║ DEFLEX 4  ARMURE 3  VIT +3  VOL +1║ │ ← totals from equipment,
│ ╚══════════════════════════════════╝ │   sticky under the tab bar
│                                      │
│ ▌PORTÉ                               │
│ ┌──────────────────────────────────┐ │
│ │ ┌────┐                           │ │
│ │ │ ⛑  │  Casque                   │ │ ← 7px slot label
│ │ └────┘  Heaume d'acier           │ │ ← name, 13px bold
│ │         Volonté +1               │ │ ← effect line
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ ┌────┐                           │ │
│ │ │ 🛡  │  Plastron                 │ │
│ │ └────┘  Cuirasse                 │ │
│ │         Déflexion +2             │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ▌ARMES                               │
│ ┌──────────────────────────────────┐ │
│ │ ┌────┐  ÉQUIPÉE                  │ │
│ │ │ 🗡 │  Épée longue        1d8   │ │
│ │ └────┘  Bonus +3 · finesse       │ │
│ │         polyvalente, 3 m         │ │ ← properties wrap freely
│ └──────────────────────────────────┘ │
│                                      │
│ ▌SAC                                 │
│ ┌──────────────────────────────────┐ │
│ │ 🧪  Potion de soin            x2 │ │
│ │ 📜  Parchemin de feu          x1 │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

**Key moves:** sticky totals bar (values already computed by `equipmentStats`/`computeDerived`);
every row = icon well + label/name/effect stack; `py-3` instead of `py-2.5` and `space-y-2`
between rows; weapon properties in their own wrapping line.
**Pros:** the most readable of all nine proposals, zero new interaction patterns, reuses existing
helpers, no truncation anywhere. **Cons:** tallest per item — long inventories scroll more;
visual repetition if many items lack icons. **Effort:** low.

## Proposal I — Segmented PORTÉ / SAC view

A pill switch at the top of the tab splits the content into two mental models: **PORTÉ**
(equipment slots + equipped weapons — what affects your numbers) and **SAC** (consumables,
divers, spare weapons — what you carry). Only one list renders at a time, so each gets the full
width and full breathing room.

```
┌──────────────────────────────────────┐
│  ( PORTÉ )  (  SAC  )   ← pill switch│
│ ──────────────────────────────────── │
│ PORTÉ:                               │
│ ┌──────────────────────────────────┐ │
│ │ ⛑ Heaume d'acier        vol +1  │ │
│ │ 🛡 Cuirasse            defl +2  │ │
│ │ 🥾 Bottes de vitesse    vit +3  │ │
│ │ 🧤 —vide—                       │ │
│ │ 💍 —vide—                       │ │
│ └──────────────────────────────────┘ │
│ ARMES ÉQUIPÉES                       │
│ ┌──────────────────────────────────┐ │
│ │ ★ Épée longue     1d8   +3      │ │
│ │   finesse · polyvalente          │ │
│ └──────────────────────────────────┘ │
│                                      │
│ SAC:                                 │
│ CONSOMMABLE (3)                      │
│ ┌──────────────────────────────────┐ │
│ │ Potion de soin               x2  │ │
│ │ Parchemin de feu             x1  │ │
│ └──────────────────────────────────┘ │
│ ARMES DE RECHANGE (1)                │
│ ┌──────────────────────────────────┐ │
│ │ ☆ Arc court       1d6   +2       │ │
│ └──────────────────────────────────┘ │
│ DIVERS (5)                           │
│ ┌──────────────────────────────────┐ │
│ │ Corde · Tente · Silex…           │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

**Key moves:** one `inventoryView` state (`'porte' | 'sac'`), partitioning by slot occupancy /
`equipped` / item type; each view gets full width and generous rows.
**Pros:** halves what's on screen at once — maximum breathability without losing detail; the
split matches how players actually think ("what's on me" vs "what's in my bag").
**Cons:** one extra click to see the other half; needs a clear partition rule for edge cases
(e.g. an unequipped shield lives in SAC but is armour); the switch must not fight the tab bar
visually. **Effort:** low-medium.

---

## Set 3 comparison

| Criterion | G — Paper doll | H — Summary + rows | I — PORTÉ / SAC |
|---|---|---|---|
| Readability | ★★☆ | ★★★ | ★★★ |
| Breathability | ★★☆ | ★★★ | ★★★ |
| Info density | ★★☆ | ★★☆ | ★★★ |
| Fits narrow panel | ★☆☆ | ★★★ | ★★★ |
| Consistency with sheet | ★★☆ | ★★★ | ★★★ |
| Effort | Medium | **Low** | Low-medium |

Set-3 pick: **H** — cheapest to build, no new interaction model, and it is the only proposal that
removes truncation entirely. **I** is the natural follow-up if inventories grow past ~15 items.

## All nine at a glance

| # | Proposal | Tag | One-liner |
|---|---|---|---|
| A | Sectioned panels | GLM-5.3-Flash | colored section headers + weapon stat grid |
| B | Slot rail @2xl | GLM-5.3-Flash | worn-gear rail left, lists right |
| C | Data-sheet tables | GLM-5.3-Flash | aligned columns, collapsible groups |
| D | Item-tile grid | deepseek v4.1 flash | game-like backpack tiles |
| E | Accordions + summaries | deepseek v4.1 flash | per-category totals, collapsed by default |
| F | Master/detail | deepseek v4.1 flash | list + inline detail pane |
| G | Paper doll | qwen 3.8 max | slots positioned as a silhouette |
| H | Summary bar + rows | qwen 3.8 max | sticky totals, tall airy rows, nothing cut |
| I | PORTÉ / SAC switch | qwen 3.8 max | two segmented views, full width each |
