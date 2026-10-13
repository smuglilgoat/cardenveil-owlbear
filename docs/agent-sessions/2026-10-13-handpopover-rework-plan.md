# Hand popover — full rework plan (v2.7.0)

Status: **plan only — waiting for validation.** Nothing implemented yet.
Date: 2026-10-13. Scope: `src/HandPopover.svelte` + its two callers + one new shell component.

## 1. Why this rework (verified constraints)

- OBR **popovers have no pointer-events option** — checked against the official
  docs (`docs.owlbear.rodeo/extensions/apis/popover/`) and the installed SDK
  (`@owlbear-rodeo/sdk@3.1.0`, also the latest on npm): the only options are
  `hidePaper`, `disableClickAway`, `marginThreshold`, anchors. A transparent
  popover therefore always swallows clicks inside its box: **footprint is the
  only lever we have.** (`Modal.disablePointerEvents` exists but disables events
  for the whole modal — useless for clickable cards.)
- `OBR.popover.setHeight/setWidth/getHeight/getWidth` are supported and already
  used by this frame; the popover is bottom-anchored (`POSITION`, BOTTOM/CENTER)
  so **growing it adds space above and nothing moves on the table** (proved by
  the 2.6.1 height fix: 300 → 380 px with the cards staying put).
- Current footprint: **380 px tall** (content 373) and up to **1120 px wide** for
  15 cards. Target: **164 px tall** fanned, **44 px** folded.

## 2. Validated layout (your four answers)

| Question | Decision |
|---|---|
| Initial state | **Fanned out on open** (as today); the bar button folds to the bar |
| Bar layout | **One bar**, controls left, Piocher + tokens right |
| Card actions | **In-card strip** (inside the card bounds, no modal, no floating row) |
| Big hands | **Keep the current fan width** (no cap, up to ~1120 px for 15 cards) |

### Folded (44 px)
```
┌──────────────────────────────────────────────────┐
│ 🃏 Afficher   🎨        Piocher 3/3   F3 A2 E1 S0 │
└──────────────────────────────────────────────────┘
```

### Fanned (164 px = bar 44 + cards 120)
```
┌──────────────────────────────────────────────────┐
│        🂡 🂢 🂣 🂤 🂥 🂦 🂧 🂨 🂩   (120 px exactly)  │
│ 🃏 Replier    🎨        Piocher 3/3   F3 A2 E1 S0 │
└──────────────────────────────────────────────────┘
```

### Active card — action strip inside the card bounds
```
      ┌─────────┐
      │ ♥ 7     │   ← top-left index unchanged
      │   ♥     │
      │[▶️][✦][◑]│   ← strip inside the card (bottom), 3 × ~24 px
      └─────────┘
```
- Removes the `translateY(-28px)` lift and the 56 px floating-button headroom →
  the fan band is **exactly the card height (120 px)**.
- Selection affordance kept: indigo ring + drop-shadow (already there) + strip.
- Fatigue badge moves from `-top-1.5 -right-1.5` (clipped) to inside the card's
  top-right corner.
- Card faces, sizes (80×120), spread (64), colors, grayed/crystallized/pending
  rendering: **unchanged.**

### Bar content
- Left: `🃏 Replier / Afficher` (fold toggle) then `🎨` (4-color ⇄ classic) — side
  by side, as asked.
- Right: `Piocher x/y` (with the `✦×N` spirit badge and the `♠` tieffelin hint),
  the `🍄 Échange` button (sporelin only), then 4 **compact token chips**
  (colored initial + `cur/max`, full label + description in the tooltip — this is
  what the validated mockup shows, it keeps the bar ≈470 px).
- Contextual chip: while a *pick a card from the fan* action is running
  (Agilité / Social / Sporelin / Halfling-free), the left zone shows
  `Agilité — cliquez la carte à défausser  ✕` instead of `🎨` (no extra height,
  the fan stays clickable). Outgoing exchange shows a compact status chip on the
  right (`⏳ Échange → Nom`).

## 3. Modals (in-frame overlay, dark backdrop over cards + bar)

Same pattern as `ItemAddPopup` / the inventory modals: `fixed inset-0 bg-black/75`
backdrop, centred panel `bg-[#1f2937] border rounded-lg`, ✕ / backdrop / Escape to
close. While a modal is open the popover **grows** (bottom-anchored → it appears
above the cards) and **shrinks back** on close.

| # | Modal | Replaces today's block | Content |
|---|---|---|---|
| 1 | Token usage | `choosingToken` panel | Title "Token Agilité — usage :" + `Carte` / `Combat` (tooltips kept) |
| 2 | Halfling | `player.pendingHalfling` panel | The 2 drawn cards + `Choisir` per card |
| 3 | Tieffelin draw | `action === 'tiefling-choose'` | `Piocher normalement` / `♠ Pique` |
| 4 | Suit picker (Agilité) | `action === 'agilite-pick-suit'` | Discarded card + 4 suit buttons |
| 5 | Target picker (Social / Sporelin) | `social-pick-target`, `sporelin-pick-target` | Offered card + player buttons (title/colour differ) |
| 6 | Accept exchange | `action === 'accept-exchange'` | "Choisissez la carte à donner en retour" + mini-cards of the hand |
| 7 | Incoming exchange | `incomingExchanges` panel | "X vous offre ♥7" + `Accepter` / `Refuser` (Accept chains into modal 6) |

Stays as **fan interaction** (no modal): picking the card itself for
`agilite/social/sporelin-pick-card` — the fan already glows the selectable cards
and the bar shows the hint chip.

## 4. Sizing model (the frame owns its size)

- New `fitPopover()` (replaces `fitPromptHeight`/`promptContentHeight`):
  - **height** = measured height of the rendered bands (bar + fan + modal) via
    `data-diag` refs, clamped to `viewport - 120`;
  - **width** = `max(BAR_MIN_W, fanWidth(n), modal ? MODAL_MIN_W : 0)` with
    `fanWidth(n) = max(320, n * 64 + 160)` (unchanged formula, no cap per your
    decision) and `MODAL_MIN_W ≈ 380`, clamped to `viewport - 24`;
  - runs after each render (`requestAnimationFrame`), skips when the change is
    < 4 px (no resize loop), logs `hand_popover_fit_failed` on refusal.
- `PlayerHand.svelte` / `GMDashboard.svelte` stop computing sizes: they open the
  popover with a provisional `460 × 164` and the frame resizes itself. This also
  deletes PlayerHand's *reopen-on-card-count-change* `$effect` (the frame
  subscribes to realtime and knows the hand itself) — one OBR quirk less.
- `data-diag` markers updated (`bar`, `fan`, `modal`) so 🔍 Diag keeps working.

## 5. Files

| File | Change |
|---|---|
| `src/HandPopover.svelte` | Markup rewritten (bar → fan → modal host), sizing replaced, all game logic **untouched** (every `$derived`/function stays as-is) |
| `src/lib/HandModal.svelte` | **New** — overlay shell (backdrop, panel, title, ✕, Escape/backdrop close, optional width) reused by the 7 modals |
| `src/lib/PlayerHand.svelte` | Drop width/height computation + the resize effect; keep the "🃏 Afficher la main" toggle and its state |
| `src/lib/GMDashboard.svelte` | Same, for the GM hand popover |
| `src/hand.css` | Only if a rule is needed (transparent background stays) |
| `docs/patch-notes-2.7.0.md`, `AGENTS.md`, session doc, `CONTINUITY.md` | Docs |
| Mock preview (`HandPopover` standalone branch) | Extend to `hand.html?cards=15&state=folded\|fanned\|modal:token\|modal:halfling` so every layout state can be reviewed in a plain browser |

## 6. Step order (each step independently verifiable)

```
1. Bar + fold: restructure markup (bar bottom, fan above), drop the pill, wire the toggle
      → verify: hand.html?cards=15 shows bar 44 / fanned 164, fold works, diag heights match
2. Fan band = 120: remove the lift + floating buttons, in-card action strip, badge inside
      → verify: cards unchanged visually, strip clickable (défausser/cristalliser/bloquer),
        no card touches the band edges (diag: fan [bar..bar+120])
3. Self-sizing: fitPopover() + PlayerHand/GMDashboard simplification
      → verify: diag metrics requested = actual for folded/fanned; no resize loop (log quiet)
4. HandModal + modals 1-3 (token, Halfling, tieffelin)
      → verify: each flow end-to-end in a live room (or mock), popover grows/shrinks back
5. Modals 4-7 (suit, target, accept, incoming) + bar chips (pick hint, outgoing status)
      → verify: full token flows (Force/Agilité/Esprit/Social/Combat), sporelin exchange,
        incoming exchange accept/decline
6. Mock states + docs + version 2.7.0
      → verify: npm test (220) + npm run build green, live 2.7.0, 🔍 Diag clippedBelow ≤ 0
```

## 7. Verification checklist (live)

- Footprint: folded **~460×44**, fanned **~W×164** (W = fan width), modal open
  **~W×360** → measured with 🔍 Diag (`rects.bar/fan/modal`, `interactive.clippedBelow`).
- All flows: draw, tieffelin choice, 4 tokens × (Carte + Combat), Halfling choice,
  sporelin exchange, Social proposal, incoming exchange accept/refuse, discard,
  crystallize, gray toggle, card scheme toggle, GM hand (15 cards), 0-card hand.
- No regression on the main panel (PlayerHand) and GM dashboard buttons.
- `npm test` (220) + `npm run build`; patch notes 2.7.0; AGENTS.md hand-popover section rewritten.

## 8. Risks, tradeoffs, and what this does **not** fix

- **The fan width stays** (your choice): a 15-card GM hand is still a 1120 px wide
  popover. The height win is the big one (380 → 164, −57 %). The width cap is a
  one-constant change (`FAN_MAX_W`) if you change your mind after seeing it live.
- **In-card strip**: 3 buttons inside an 80 px card ≈ 24 px targets. If it feels
  cramped, fallback is 2 buttons + `…` opening a card modal (already planned as
  modal #6's shell, so cheap).
- **Modals need the popover to grow**: if OBR refuses `setHeight`, the modal is
  clipped → panels stay compact (≤ 240 px) with a scrollable body, and the
  failure is logged (`hand_popover_fit_failed`) so we see it in `app_logs`.
- **Contextual chip vs 🎨**: during a pick-a-card action the colour toggle is
  hidden (the chip takes its place) for those seconds.
- **Untouched on purpose**: game logic/reducer, `PlayerHand` main-panel UI, card
  visuals, the GM dashboard layout, the `?cards=N` mock, the diag bridge.
- No Edge Function or Supabase migration needed (pure UI) → deploy is a plain
  Netlify release; 🔍 Diag will confirm the new sizes in your room.
