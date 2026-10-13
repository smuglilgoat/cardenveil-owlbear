# Session — 2026-10-13 — Hand popover rework (v2.7.0)

## Goal
Rebuild the hand popover UI from scratch (logic untouched): hug the cards, one
bottom bar, in-card actions, modals for the token/prompt flows — because an OBR
transparent popover cannot be click-through, so its footprint is the only lever.

## What shipped (commit pending)
- `src/lib/HandModal.svelte` (new): overlay shell (backdrop, centred panel,
  title/accent, ✕/backdrop/Escape, `closable=false` for forced decisions).
- `src/HandPopover.svelte`: rewritten markup, all game logic preserved
  (verified by diffing the Derived+Actions and Helpers sections against HEAD —
  only the intentional additions differ: `modal`, `pickHint`, the restored
  `interactionFrozen` effect).
  - Bar: `🃏 Replier/Afficher` + `🎨` left (or the pick-hint chip), `⏳` status,
    `Piocher` (+ `🍄`), 4 compact token chips right.
  - Fan band = **120 px exactly** (card height); fatigue badge inside the card;
    card actions in an in-card strip (3 × 24 px); the active lift and the
    floating button row are gone.
  - 7 modals: token usage, Halfling, tieffelin draw, suit picker, target picker
    (Social/Sporelin), accept-exchange, incoming exchange.
  - `fitPopover()`: height = bar + fan (or max(content, modal panel + 20)),
    width = max(560, fanWidth, 380) clamped to the viewport; `setHeight` +
    `setWidth`, refuses silently → logs `hand_popover_fit_failed`, fold reverts.
  - Standalone preview states: `?cards=N&state=fanned|folded|token|halfling|
    tiefling|suit|target|accept|incoming`.
- `src/lib/PlayerHand.svelte` / `src/lib/GMDashboard.svelte`: size computation,
  the reopen-on-card-count `$effect` and the `hand_popover_metrics` duplicate
  log removed; both open the popover at a provisional 460×172.
- Docs: patch notes 2.7.0, AGENTS.md hand-popover bullet, `debug-live-room.md`
  (new diag bands + preview states).

## Verification
- `npm test` 220/220, `npm run build` green, manifest 2.7.0.
- Logic diff vs HEAD: identical except the intended additions (caught and fixed
  two self-inflicted regressions during review: a dropped
  `$effect(if interactionFrozen) active = null` and a wrong gray-toggle action —
  the reducer only knows `TOGGLE_GRAY`).
- Not verifiable headlessly: pixel result. Next step = live 🔍 Diag (expect
  `~560x156` fanned, `~560x36` folded, `~Wx260` with a modal, `clippedBelow<=0`)
  and/or the standalone previews.
