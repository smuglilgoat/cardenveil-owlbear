import OBR, { buildImage } from '@owlbear-rodeo/sdk';
import { cardToSvgDataUrl } from './cardSvg.js';

const NS          = 'com.cardenveil';
const ITEM_NS     = `${NS}/handCard`;   // metadata key
const MENU_ID     = `${NS}/hand-menu`;

// Card size in pixels (matches SVG viewBox)
const CARD_W = 60;
const CARD_H = 90;
// DPI controls how large the card appears relative to the grid.
// 100 dpi → 0.6 × 0.9 grid units per card at OBR's default 150px/unit.
const CARD_DPI = 100;

// Fan layout (in OBR grid units)
const SPACING    = 0.85;  // horizontal gap between card centres
const MAX_ROT    = 14;    // max rotation in degrees at edges of hand
const ARC_DIP    = 0.15;  // how much the arc dips toward centre (grid units)
const BOTTOM_GAP = 1.2;   // units above the anchor point to the card centre

// Module-level callback so context menu can reference the latest handler
let _onAction = null;
let _menuRegistered = false;

// ─────────────────────────────────────────────────────────────────────────────
// Context menu registration (called once per plugin session)
// ─────────────────────────────────────────────────────────────────────────────
async function registerContextMenu() {
  if (_menuRegistered) return;
  _menuRegistered = true;

  await OBR.contextMenu.create({
    id: MENU_ID,
    icons: [
      {
        icon: '/discard-icon.svg',
        label: 'Défausser',
        filter: {
          every: [{ key: `metadata/${ITEM_NS}/isHandCard`, value: true }],
        },
      },
      {
        icon: '/crystallize-icon.svg',
        label: 'Cristalliser',
        filter: {
          every: [
            { key: `metadata/${ITEM_NS}/isHandCard`,    value: true  },
            { key: `metadata/${ITEM_NS}/crystallized`,  value: false },
          ],
        },
      },
    ],
    onClick(context, elementId) {
      if (!_onAction) return;
      const item     = context.items[0];
      if (!item) return;
      const meta     = item.metadata[ITEM_NS] ?? {};
      const action   = elementId === `${MENU_ID}/0` ? 'discard' : 'crystallize';
      _onAction(action, meta.cardId, meta.crystallized ?? false);
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialise the scene hand.
 * @param {(action: string, cardId: string, isCrystallized: boolean) => void} onAction
 * @returns {() => void} cleanup function
 */
export async function initHandScene(onAction) {
  _onAction = onAction;
  await registerContextMenu();

  // Listen to player selection – when a hand card is selected, fire onAction('select', ...)
  const unsubSelect = OBR.player.onChange(async (player) => {
    const sel = player.selection ?? [];
    if (sel.length === 0) return;

    const locals = await OBR.scene.local.getItems(
      (item) => sel.includes(item.id) && !!item.metadata?.[ITEM_NS]?.isHandCard
    );
    if (locals.length > 0) {
      const meta = locals[0].metadata[ITEM_NS];
      _onAction?.('select', meta.cardId, meta.crystallized ?? false);
    }
  });

  return () => {
    unsubSelect();
    _onAction = null;
  };
}

/**
 * Render the player's hand as local scene items in a fan layout.
 * Positions are calculated relative to the current viewport bottom-centre.
 */
export async function renderHand(hand, crystallized) {
  await clearHandItems();

  const allCards = [
    ...hand.map(c        => ({ card: c, isCrystallized: false })),
    ...crystallized.map(c => ({ card: c, isCrystallized: true  })),
  ];

  if (allCards.length === 0) return;

  // Anchor: bottom-centre of the current viewport in world coords
  const screenW = await OBR.viewport.getWidth();
  const screenH = await OBR.viewport.getHeight();
  const anchor  = await OBR.viewport.inverseTransformPoint({
    x: screenW / 2,
    y: screenH - 60,
  });

  const n     = allCards.length;
  const items = allCards.map(({ card, isCrystallized }, i) => {
    // t ∈ [-0.5, +0.5]
    const t   = n > 1 ? (i / (n - 1)) - 0.5 : 0;
    const x   = anchor.x + t * SPACING * (n - 1);
    // arc: centre cards rise slightly, edge cards dip
    const y   = anchor.y - BOTTOM_GAP - (1 - 4 * t * t) * ARC_DIP;
    const rot = t * MAX_ROT * 2;

    return buildImage(
      {
        url:    cardToSvgDataUrl(card, isCrystallized),
        mime:   'image/svg+xml',
        width:  CARD_W,
        height: CARD_H,
      },
      {
        dpi:    CARD_DPI,
        offset: { x: CARD_W / 2, y: CARD_H / 2 },
      }
    )
      .id(`${NS}-hand-${card.id}`)
      .name(`${card.value}${card.suit}`)
      .position({ x, y })
      .rotation(rot)
      .layer('NOTE')
      .locked(false)
      .disableHit(false)
      .metadata({ [ITEM_NS]: { isHandCard: true, cardId: card.id, crystallized: isCrystallized } })
      .build();
  });

  await OBR.scene.local.addItems(items);
}

/**
 * Remove all hand card items from the local scene.
 */
export async function clearHandItems() {
  const existing = await OBR.scene.local.getItems(
    (item) => !!item.metadata?.[ITEM_NS]?.isHandCard
  );
  if (existing.length > 0) {
    await OBR.scene.local.deleteItems(existing.map((i) => i.id));
  }
}

/**
 * Reposition existing hand items to the current viewport bottom-centre
 * without regenerating SVGs.
 */
export async function repositionHand(hand, crystallized) {
  // Simply re-render — SVG data URIs are fast to regenerate
  await renderHand(hand, crystallized);
}
