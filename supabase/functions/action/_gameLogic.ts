// Reducer source of truth: src/lib/deck.js (shared with the Netlify function
// and the client). `_deck.js` is a symlink to ../../../src/lib/deck.js so the
// deploy bundle stays inside supabase/ — Supabase staging does not bundle
// files outside it (relative ../.. imports resolve to a nonexistent path).
export { applyAction, hydrateState, dehydrateState, createInitialGameState, GM_CHAR_ID } from './_deck.js';
// `_actionGuard.js` is a symlink to ../../../src/lib/actionGuard.js (same reason).
export { verifyActor, mintToken, hashToken, rememberTokenHash, isDuplicateAction, rememberActionId } from './_actionGuard.js';

