# Debug a live room

Opening the plugin URL on its own shows nothing: every frame waits for `OBR.onReady` and stays on "Chargement…" outside a room. These are the three ways to look inside a real room.

## 1. Remote snapshot — the 🔍 Diag button (easiest)

* **GM dashboard → 🔍 Diag** button (top right, next to the dice selector).
* It broadcasts a `cardenveil-diag` request; **every Cardenveil screen in the room** (main panel, hand fan, compact sheet, background page) writes its own `diag_snapshot` row into `app_logs`.
* Read the results (Supabase dashboard → SQL, or the API):

```sql
select created_at, source, detail
from app_logs
where event = 'diag_snapshot'
order by created_at desc
limit 20;
```

A snapshot contains `viewport`, `dpr`, `visibility`, `bodyScrollHeight`, the rectangles of the bands marked `data-diag` (`root`, `bar`, `fan`), their CSS classes, and the bounds of every interactive element with `clippedBelow` = the number of pixels cut off at the bottom of the screen. Since the 2.7.0 rework the popover sizes itself: `hand_popover_metrics` (message `LxH`) shows the size requested per state (folded / fan / modal).

⚠️ `appLog` deduplicates: the same row can only be written once every 30s per screen. Wait \~30s between two clicks.

## 2. Inspect the DOM by hand (DevTools)

* F12 in the Owlbear tab → **Elements** panel → frame selector at the top (Chrome: the "top" dropdown) → pick `cardenveil.netlify.app/hand.html…`, `sheet.html…` or `background.html`.
* In the frame's console:

```js
document.querySelector('[data-diag="fan"]').getBoundingClientRect();
[...document.querySelectorAll('button')].map(el => el.getBoundingClientRect().bottom);
```

## 3. Preview outside OBR (layout only)

* `hand.html?cards=15` renders a mock fan (7 cards by default, `cards=0..40`) **without any OBR context**. `cards=0` renders an empty hand.
* `state=` picks one of **11 displayed states**: `fanned` (default), `folded`, `token`, `hobgoblin`, `illithid`, `tiefling`, `suit`, `target`, `accept`, `halfling`, `incoming`. `token` opens the token panel; `hobgoblin` and `illithid` do the same but set that race first, because both have a token action in that panel.
* Example: `hand.html?cards=15&state=folded`.
* Add `diag=1` to print the snapshot in the console (and attempt the `app_logs` write).
* This is also how to reproduce the "GM hand with 15 cards" case without a room.

## 4. What to send when a problem persists

A click on 🔍 Diag is enough: the room and player ids are already in the rows, so `app_logs` can be read directly. No screenshot and no room link needed — an Owlbear link is a SPA behind a login, unreadable by an external tool, which is exactly why the snapshot exists.
