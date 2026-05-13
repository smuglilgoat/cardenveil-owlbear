import OBR, { buildImage } from '@owlbear-rodeo/sdk';
import { cardToSvgUrl } from './cardSvg.js';

const NS      = 'com.cardenveil';
const ITEM_NS = `${NS}/handCard`;
const MENU_ID = `${NS}/hand-menu`;

const CARD_W   = 120;  // must match PNG_W in scripts/generate-cards.js
const CARD_H   = 180;  // must match PNG_H
const CARD_DPI = 100;  // at 100 dpi, card is 1.2×1.8 OBR grid units
const SPACING   = 0.85;
const MAX_ROT   = 14;
const ARC_DIP   = 0.15;
const BOTTOM_GAP = 1.2;

let _onAction        = null;
let _menuRegistered  = false;
let _sceneReady      = false;

// ── Context menu (registered once, outside scene-ready guard) ────────────────
async function registerContextMenu() {
  if (_menuRegistered) return;
  _menuRegistered = true;

  try {
    await OBR.contextMenu.create({
      id: MENU_ID,
      icons: [
        {
          icon: '/discard-icon.svg',
          label: 'Défausser',
          filter: { every: [{ key: `metadata/${ITEM_NS}/isHandCard`, value: true }] },
        },
        {
          icon: '/crystallize-icon.svg',
          label: 'Cristalliser',
          filter: {
            every: [
              { key: `metadata/${ITEM_NS}/isHandCard`,   value: true  },
              { key: `metadata/${ITEM_NS}/crystallized`, value: false },
            ],
          },
        },
      ],
      onClick(context, elementId) {
        if (!_onAction) return;
        const item = context.items[0];
        if (!item) return;
        const meta   = item.metadata[ITEM_NS] ?? {};
        const action = elementId.endsWith('/0') ? 'discard' : 'crystallize';
        _onAction(action, meta.cardId, meta.crystallized ?? false);
      },
    });
  } catch (_) {
    // Context menu may already exist across hot-reloads — ignore
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise scene hand integration.
 * Safe to call before a scene is loaded; scene operations are deferred until ready.
 * @param {(action: string, cardId: string, isCrystallized: boolean) => void} onAction
 * @returns {Promise<() => void>} cleanup
 */
export async function initHandScene(onAction) {
  _onAction = onAction;

  await registerContextMenu();

  // Track scene readiness
  _sceneReady = await OBR.scene.isReady();

  const unsubScene = OBR.scene.onReadyChange((ready) => {
    _sceneReady = ready;
    if (!ready) {
      // Scene unloaded — no items to clean, they are gone with the scene
    }
  });

  // Listen for player selection to fire onAction('select', ...)
  const unsubSelect = OBR.player.onChange(async (player) => {
    if (!_sceneReady) return;
    const sel = player.selection ?? [];
    if (sel.length === 0) return;
    try {
      const locals = await OBR.scene.local.getItems(
        (item) => sel.includes(item.id) && !!item.metadata?.[ITEM_NS]?.isHandCard
      );
      if (locals.length > 0) {
        const meta = locals[0].metadata[ITEM_NS];
        _onAction?.('select', meta.cardId, meta.crystallized ?? false);
      }
    } catch (_) {}
  });

  return () => {
    unsubScene();
    unsubSelect();
    _onAction = null;
  };
}

/**
 * Render the player's hand as local scene items in a fan layout.
 * No-ops silently if no scene is loaded.
 */
export async function renderHand(hand, crystallized) {
  if (!_sceneReady) return;
  try {
    await _clearItems();

    const allCards = [
      ...hand.map(c        => ({ card: c, isCrystallized: false })),
      ...crystallized.map(c => ({ card: c, isCrystallized: true  })),
    ];
    if (allCards.length === 0) return;

    const screenW = await OBR.viewport.getWidth();
    const screenH = await OBR.viewport.getHeight();
    const anchor  = await OBR.viewport.inverseTransformPoint({
      x: screenW / 2,
      y: screenH - 60,
    });

    const n     = allCards.length;
    const items = allCards.map(({ card, isCrystallized }, i) => {
      const t   = n > 1 ? (i / (n - 1)) - 0.5 : 0;
      const x   = anchor.x + t * SPACING * (n - 1);
      const y   = anchor.y - BOTTOM_GAP - (1 - 4 * t * t) * ARC_DIP;
      const rot = t * MAX_ROT * 2;

      return buildImage(
        {
          url:    cardToSvgUrl(card, isCrystallized),
          mime:   'image/png',
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
  } catch (e) {
    // Scene became unavailable mid-operation — swallow silently
    if (!e?.error?.message?.includes('No scene')) console.warn('renderHand:', e);
  }
}

/**
 * Remove all hand card items from the local scene.
 * No-ops silently if no scene is loaded.
 */
export async function clearHandItems() {
  if (!_sceneReady) return;
  try { await _clearItems(); } catch (_) {}
}

async function _clearItems() {
  const existing = await OBR.scene.local.getItems(
    (item) => !!item.metadata?.[ITEM_NS]?.isHandCard
  );
  if (existing.length > 0) {
    await OBR.scene.local.deleteItems(existing.map((i) => i.id));
  }
}
