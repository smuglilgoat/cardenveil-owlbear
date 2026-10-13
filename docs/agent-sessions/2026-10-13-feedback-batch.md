# Plan — 2026-10-13 — Feedback batch (10 items)

Status: **plan only, nothing implemented.** Read-only audit + live docs research were done.

Goal: stop the reload-requiring failures, add Supabase-backed logging, then the UI,
item-addition, GM and race items from the user's list.

Decisions taken with the user (2026-10-13):

| Question | Answer |
|---|---|
| In-sheet item popup | « + Ajouter » in the **INVENTAIRE view** (SAC header) → centred modal, capacities-popup style |
| Hide/Show button | **HandPopover fold button** moves under the token buttons |
| Click-through | Impossible in OBR → **shrink the hand popover footprint** + upstream request |
| Khajeet Griffe | **Auto-granted** + catalogue entry; GM race dropdown also writes the sheet race |

---

## 0. Audit findings (evidence, not guesses)

### 0.1 Crash — three concrete defects in our code

| # | Finding | Where |
|---|---|---|
| A1 | `scheduleReconnect()` increments `reconnectAttempt`, then the timer calls `startRealtime()` which **calls `stopRealtime()` first**, resetting `reconnectAttempt = 0`. Result: backoff never grows (always 1 s), `MAX_RECONNECT_ATTEMPTS` (30) is unreachable, and `wasReconnect = reconnectAttempt > 0` is **always false** → the post-reconnect `fetchState()` catch-up is dead code. | `src/lib/api.js:24-66, 218, 267-285, 302-317` |
| A2 | No abort/timeout on any network call: `fetchState()` (`/api/state`), `supabase.functions.invoke('action')`, Netlify POST. `CardGame.onMount` awaits `fetchState` before `ready = true`; `dispatch()` awaits it too when `lastServerState` is null. A cold/slow/hung function = permanent spinner or dead buttons, only fixed by reload. | `src/lib/api.js:26-38, 318-325`; `src/lib/CardGame.svelte:76-97` |
| A3 | Realtime has no silent-death detection. Supabase documents that backgrounded tabs/iframes get their heartbeat throttled, the socket drops **without any status event**, and the client stops receiving state silently (official guide: *Handling Silent Disconnections in Backgrounded Applications*). Our `onConnectionCallback` only fires on `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`, so a silent drop leaves stale state with no toast and no self-heal. Installed realtime-js is **2.108.1** and supports both documented mitigations (`realtime.worker: true`, `heartbeatCallback`); neither is enabled (`src/lib/supabaseClient.js` is 6 lines). | `src/lib/supabaseClient.js`, `src/lib/api.js:245-300` |

`fetchState`/`invoke` are also the only places where a failure is not surfaced to the user
(`console.error` only), which is why the failures look like "crashes".

Other audited-but-fine: all realtime subscriptions have teardown (`SheetPopover` interval +
listeners cleared, `GMDashboard` per-player unsubs cleared), the sheet realtime filter is the
fixed comma form, `pendingActions` bookkeeping is sound.

### 0.2 Data point for the 3D dice popup

`src/background.js` opens a **520×440 popup on every client for every roll**; each popup loads
three.js + rapier (4.9 MB / 1.8 MB gzip, WASM compile, WebGL context). A staged attack is up to
4 throws (initial + explosions + summary) → up to 4 popup loads per attack **per client**. This is
a plausible secondary crash source (GPU/memory pressure on weak machines) but is **not** proven —
Phase 1 instruments it (`dice_popup_open` log) before we touch the hot path.

### 0.3 Click-through (UI 2) — not possible

`@owlbear-rodeo/sdk@3.1.0` (also the **latest on npm**, published 2024-12) `Popover` options are:
`id, url, width, height, anchorElementId, anchorPosition, anchorOrigin, transformOrigin,
anchorReference, hidePaper, disableClickAway, marginThreshold`. No pointer-events / click-through
option. An iframe only passes clicks through when `pointer-events: none` is set on the **iframe
element by the embedding page** — the extension cannot reach OBR's DOM. `hidePaper: true` (already
used) hides the paper visually only. Fallback chosen: make the dead zone small.

### 0.4 Race plumbing (items 8–9)

- `RACES` in `src/lib/deck.js` is the single source of truth; `RACE_IDS` gates `SET_RACE` **in the
  reducer**, so a new race id must be deployed to the Supabase Edge Function too, otherwise the
  server reverts the race via realtime (same failure class as the stale `SYNC_TOKENS` deploy).
- Race flows **sheet → game state** (`CharacterSheet.svelte:323-328`, `GMDashboard.svelte:483`).
  The GM per-player dropdown (`GMDashboard.svelte:1121`) writes **game state only**, so a race set
  there never reaches the sheet that the attack engine reads → the Goblin passive and the Khajeet
  claws would not apply. That dropdown must also patch the target sheet.
- `attackRoll.js` already carries the deferred note: *"Gobelin crit cap (3): deferred per doc §16"*.
  `docs/Reglejetdattaque.md` §16 + the summary table state the **cap = 3** but **not** the
  *seuil de critique = dé − 1* rule: the doc must be updated with the user's rule.
- Crit is currently hard-coded as "kept die === max face" in three places: `attackPreview`/`runAttack`
  (`attackRoll.js`), the dice chips (`lib/diceRoll.js:39 visibleRollChip`) and the popup display.

---

## Phase 1 — Stability: crash fixes + logging

### 1.1 Supabase client hardening — root-cause fix (A3)
`src/lib/supabaseClient.js`:
```js
createClient(url, key, {
  realtime: {
    worker: true,                    // documented anti-throttling fix (blob worker, no CORS issue)
    heartbeatCallback: (status) => { /* 'sent' | 'ok' | 'error' | 'timeout' | 'disconnected' */
      // log + reconnect + notify api.js
    }
  }
})
```
- `worker: true` uses realtime-js' inlined blob script — verified in the installed package, so no
  cross-origin worker problem.
- On `timeout`/`disconnected`: log, call `supabase.realtime.connect()` (the documented pattern), and
  notify subscribers through a new `onRealtimeHealth(cb)` export.
- `api.js` subscribes to that and forwards to the existing `onConnectionCallback` (toast) **and**
  resubscribes the channel + runs the catch-up fetch.

### 1.2 Fix the reconnect bookkeeping (A1)
`src/lib/api.js`:
- Split `stopRealtime()` into `teardown()` (channel + timers) and a counter-resetting wrapper, so
  `startRealtime()` stops resetting `reconnectAttempt`. Restore real backoff
  (1→2→4→8→30 s) and a reachable `MAX_RECONNECT_ATTEMPTS`.
- Make the reconnect catch-up actually run (`wasReconnect`) and reset `currentVersion` before it.
- Log every transition (`realtime_status`) instead of `console.log`.

### 1.3 No unbounded waits (A2)
`src/lib/api.js`:
- `fetchState()`: `AbortSignal.timeout(8000)` + typed error, one retry.
- `dispatch()`: timeout on `supabase.functions.invoke` (`{ signal }`) and on the Netlify POST;
  on total failure keep the existing "remove pending + recovery fetch" path.
- `src/lib/CardGame.svelte`: `ready = true` must not depend on a fetch resolving; on failure show a
  « État non chargé — réessayer » block with a retry button instead of the endless spinner.

### 1.4 Liveness self-heal (cheap, event-driven)
`CardGame.svelte` + `api.js`: on `visibilitychange` (visible) / `online`, if `isSubscribed` but no
server message or heartbeat-ok for > 60 s, force resubscribe + catch-up fetch. No polling loop.
`SheetPopover` already reconciles on focus/visibility — unchanged.

### 1.5 Logging system → Supabase
- `supabase/migrations/20261013_create_app_logs.sql`: `app_logs` (id, created_at, level, source,
  event, message, detail jsonb, room_id, player_id, player_name, app_version, viewport), index on
  `created_at desc`, permissive RLS policy (same pattern as the other tables), and an
  after-insert trigger pruning rows older than 30 days (bounded storage, no cron needed).
- `src/lib/appLog.js`: `installGlobalHandlers(source)` (`window.onerror`, `unhandledrejection`),
  `logEvent(level, event, detail)`, fire-and-forget insert (never throws, never blocks), rate limit
  (identical event+message at most 1/30 s, hard cap per page load), console mirror.
  Never logs secrets/tokens; room/player ids only.
- Wired at the choke points: all 5 entries (`main.js`, `hand.js`, `sheetPopover.js`,
  `background.js`, `dice3d.js`), `api.js` (status, heartbeat, fetch timeout, dispatch attempts),
  sheet load/save/import failures (`CharacterSheet`, `GMDashboard`, `SheetPopover`),
  `rollBroadcast`/background popup open-close failures and **`dice_popup_open`** (measures the 0.2
  hypothesis), attack-stage timeouts.
- Scope: technical logs only — the game already keeps its own action log in `game_rooms.logs`.
  Reading = documented SQL queries in the migration header (a GM log viewer is a follow-up, not
  part of this batch).
- `docs/` note: apply the migration in the Supabase project (same as the assets-bucket migration).

### 1.6 Conditional (only if logs confirm 0.2)
Reuse the open dice popup instead of reopening it per throw (BroadcastChannel hand-off to the
existing frame), or stop opening it on every client for staged throws. **Deferred until the logs
show it matters.**

### 1.7 Verification
`npm test` (api tests updated for timeouts/backoff) · manual OBR: kill network 2 min → restore →
state catches up without a page reload; hide the OBR tab 5 min → return → sync resumes; logs land
in `app_logs`.

---

## Phase 2 — UI quick wins

| Item | Change | Files |
|---|---|---|
| 4. Template list opens upward + icons | `bottom-full mb-1` instead of `top-full mt-1`; per-item icon `ITEM_ICONS[nom] ?? FAMILY_ICONS[family]`, group header keeps its emoji | `src/lib/TemplateDropdown.svelte` |
| 5. Hide/Show under token buttons | HandPopover: remove the floating top-right `▾ Replier`; add it in the column **after the token row** (same pill styling). Keep the folded state's « 🃏 Main ▴ » centred. Live-check the popover height/negative offsets, bump `expandedHeight` (PlayerHand `openPopover` height) if the row is clipped. | `src/HandPopover.svelte`, `src/lib/PlayerHand.svelte` |
| 2. Click-through fallback | Size the hand popover to the fan's real bounding box: width `max(fan, n*64+40)` and height ≈ fan + token bars (measure live; today min 400×400) both in `openPopover()` and the resize `$effect`; keep `hidePaper`. Upstream request text + rationale documented in the plan/README notes. | `src/lib/PlayerHand.svelte` |
| 7. 🪄 MOD slider to 0 | `min="0"` (max 20) instead of `min={statMod(capStat)}`; default value stays the selected stat's mod (Esprit by default), and picking a stat keeps seeding the mod. `capCount` already floors at 1. | `src/SheetPopover.svelte:817-828` |

---

## Phase 3 — Item addition without ÉDITION (item 3) + GM item adding (item 10)

1. `src/lib/characterSheet.js`: extract pure helpers `addItemFromTemplate(sheet, templateName)` and
   `addWeaponFromTemplate(sheet, templateName)` (prepend, `''` = blank, same prefill as today,
   weapon icon prefers `ITEM_ICONS[nom] ?? FAMILY_ICONS[family]`). ÉDITION's existing
   `addInventoryItem`/`addWeaponFromTemplate` become thin callers of these.
2. New `src/lib/ItemAddPopup.svelte`: centred overlay in the CAPACITÉ/slot popup style
   (`bg-black/75`, rounded panel, ✕/backdrop/Escape close) listing **« — Vide — » + all catalogue
   groups with icons**, items and weapons in one list; `onPick(templateName)`.
3. `src/lib/CharacterSheet.svelte` INVENTAIRE **view** mode: « ＋ Ajouter » button in the SAC header
   → opens the popup → `saveSheet(addItemFromTemplate(sheet, name))` (immediate Supabase write;
   realtime/broadcast syncs the GM view).
4. `src/lib/GMDashboard.svelte` sheet modal: add an INVENTAIRE section (weapons + items, read-only
   rows with icons/damage) **plus the same « ＋ Ajouter » popup**, writing to the target player's
   sheet with `saveCharacterSheet` (permissive RLS; the player's open sheet updates over realtime).
   No delete/equip controls there in this batch.
5. Tests: helper unit tests (prefill, blank entry, prepend order, icon fallback).

---

## Phase 4 — Races (items 8 + 9)

1. `src/lib/deck.js` `RACES` += `{ id: 'khajeet', label: 'Khajeet' }`, `{ id: 'gobelin',
   label: 'Gobelin' }`; add `RACE_PASSIVE_TIP` entries in `PlayerHand.svelte` (Khajeet : griffes ;
   Gobelin : critique sur dé − 1, max 3 critiques). `RACE_IDS` derives automatically → **redeploy the
   Supabase Edge Function `action`** (`npx supabase functions deploy action --project-ref …`).
2. Khajeet Griffe:
   - `EQUIPMENT_CATALOG` → `Armes uniques` group entry `{ nom: 'Griffe', de: '1d6', degats:
     'tranchant', proprietes: 'Finesse, Légère, Naturelle' }` (épée-courte d6 profile, so the attack
     engine gets Finesse → Agilité) + `ITEM_ICONS['Griffe'] = '🐾'`.
   - `ensureRacialWeapon(sheet, raceId)` in `characterSheet.js`: for `khajeet`, prepend the Griffe
     (skip if one already exists by name) and equip it in the main hand when both hands are free.
     Called from ÉDITION save, `handleImport`, the GM sheet-modal save, and the GM race dropdown path.
3. Gobelin crit rule:
   - `attackRoll.js`: read `opts.race`; `critThreshold = sides - (race === 'gobelin' ? 1 : 0)` (min 2);
     `MAX_CRITS = 3` for Gobelin. Initial roll **and** explosion chain crit on `kept >= critThreshold`;
     the chain stops after 3 crits; breakdown gains « seuil 5+ » / « Critiques : 3 (max Gobelin) ».
     Hache's double-chain rule keeps working (same threshold, same cap).
   - `SheetPopover.svelte`: pass `race: sheet?.identity?.race` into `attackPreview`/`runAttack`; show
     the crit threshold in the attack panel's summary line.
   - Dice chips: carry `critFrom` with the roll intent (SheetPopover/CharacterSheet → background.js
     param → dice.html/dice3d → `visibleRollChip(value, sides, index, count, critFrom)`) so a
     Gobelin's 5 on a d6 also glows as a crit in the popup.
4. `GMDashboard.svelte` race dropdown: after `SET_RACE`, also patch the target's sheet
   `identity.race` (fetch → merge → save → `ensureRacialWeapon`) so sheet, passives and claws agree.
5. Docs: update `docs/Reglejetdattaque.md` §16 + the summary table with *seuil = dé − 1, cap 3
   critiques par attaque de base*.
6. Tests: Gobelin threshold (5 crits on d6), 3-crit cap (long chain stops), Hache + Gobelin,
   `ensureRacialWeapon` (added/equipped/idempotent), N=non-Gobelin unchanged.

---

## Phase 5 — Verification, release, deploy

- `npm test` (unit) + `npm run build` green; new tests for every non-trivial change.
- Manual OBR matrix: realtime kill/restore (no reload), hidden tab, dice popup visible to all,
  item-add popup (player), GM item-add (target sheet updates live), template dropdown upward+icons,
  hand popover fold position/footprint, 🪄 MOD 0, Khajeet claws, Gobelin crit chain + cap.
- Version 2.5.1 → **2.6.0** (`vite.config.js` manifest, verify `dist/manifest.json`) +
  `docs/patch-notes-2.6.0.md` in house style.
- Deploy: apply `app_logs` migration in Supabase; **redeploy the `action` Edge Function** (new race
  ids); Netlify deploy (manual `netlify deploy --build --prod` if the GitHub auto-deploy is still
  stalled).
- Update `AGENTS.md` (races, logging table, new component) and `.agent/CONTINUITY.md`.

## Risks / notes

- The crash explanation is hypothesis-driven: Phase 1 fixes the two proven defects (A1, A2) and the
  documented Realtime issue (A3), and instruments the popup-churn theory (0.2) instead of guessing.
- OBR popover heights/offsets are hand-tuned (negative `bottom-[-…]` shifts); the fold-button move
  and the footprint shrink need a **live** check, and may require adjusting `openPopover()`'s height.
- Adding races changes the reducer → an Edge Function deploy is mandatory, or `SET_RACE` silently
  reverts (same class as the 2026-09-30 `SYNC_TOKENS` incident).
- `app_logs` is insert-open (project-wide RLS convention): mitigation = client-side dedupe + rate cap
  + 30-day prune trigger.
- Deliberately not done: GM log viewer UI, dice-popup frame reuse (only if logs prove it), action
  audit trail in logs (already covered by `game_rooms.logs`).
