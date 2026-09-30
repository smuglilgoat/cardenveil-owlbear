# Session — 2026-09-30 — Token counts from stat mods on import

## Goal
On character-sheet import, refresh the player's token counts to the stat-mod
formula (stat mod + 1): e.g. mods +2 Force / +3 Agi / +4 Esprit / 0 Social →
3/4/5/1 tokens. The GM's REST button must reset tokens to those values too.

## Change (main direct, commit `c1e4c64`)
- `src/lib/deck.js` — new `SYNC_TOKENS` action (35th): allowed for GM or the
  target themselves (same rule as `SET_RACE`); sets `tokens` **and**
  `maxTokens` to the client-sent values, clamped 0–10; logs a sync line.
- `src/lib/characterSheet.js` — `tokensFromStats(stats)`: stat modifier + 1,
  floored at 0 (negative mods → 0 tokens).
- `src/lib/CharacterSheet.svelte` — `handleImport` (json + zip paths)
  dispatches `SYNC_TOKENS` with the imported sheet's stats.
- `REST_ALL` untouched: the reducer already does `tokens = maxTokens`, and
  the cap now holds stat-derived counts for players with imported sheets.
  Players without an imported sheet keep the default 3/3/3/3.
- Action-count docs updated (34 → 35) in AGENTS.md and docs/system-overview.md.

## Verification
- `npm run test:unit`: **206 tests pass** (4 reducer contract tests + the
  mod+1 formula test).
- `npm run build`: green.

## Deliberate scope decisions
- **Not synced on ÉDITION save** — that would refund spent tokens mid-session
  (edit stats → free refill). Only import refreshes; REST restores the cap.
- GM manual `SET_MAX_TOKENS` adjustments get overwritten by the next import.
