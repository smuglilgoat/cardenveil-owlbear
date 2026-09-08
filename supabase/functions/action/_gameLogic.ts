// Reducer source of truth: ../../src/lib/deck.js (shared with the Netlify
// function and the client). This shim keeps the ./_gameLogic.ts import path
// stable. ponytail: deployed bundle must include the relative import —
// verify on first `supabase functions deploy`
export { applyAction, hydrateState, dehydrateState, createInitialGameState, GM_CHAR_ID } from '../../src/lib/deck.js';
