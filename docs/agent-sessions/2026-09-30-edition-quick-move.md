# Session — 2026-09-30 — ÉDITION quick-move buttons

## Goal
In the ÉDITION view of INVENTAIRE, add two quick-move buttons at the top to
jump to the Inventaire and Armes sections.

## Change (main direct, commit `dcc439a`)
- `src/lib/CharacterSheet.svelte`:
  - a button row (⚔️ Armes / 🎒 Inventaire) at the very top of the
    ÉDITION INVENTAIRE tab, above the ÉQUIPEMENT paper-doll section;
  - `scrollToEditSection(id)` smooth-scrolls the modal body to the section
    anchors — `id="edit-armes"` on the ARMES section wrapper and
    `id="edit-inventaire"` on the INVENTAIRE section wrapper;
  - `scrollIntoView({ behavior: 'smooth', block: 'start' })` scrolls the
    modal's own overflow container.

## Verification
- `npm run test:unit`: 206/206 pass; `npm run build`: green.
