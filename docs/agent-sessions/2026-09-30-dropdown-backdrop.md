# Session — 2026-09-30 — Template dropdown backdrop

## Goal
The template dropdown's click-away catcher blacked out the ÉDITION page;
make it a dim backdrop instead.

## Change (main direct, commit `3391c6a`)
- `src/lib/TemplateDropdown.svelte`: the full-viewport click-away `<button>`
  (which rendered opaque) replaced with a translucent dim backdrop —
  `fixed inset-0 z-20 bg-black/30` div that closes the menu on click. The
  menu itself stays at z-30 above it.

## Verification
- `npm run test:unit`: 206/206 pass; `npm run build`: green.
