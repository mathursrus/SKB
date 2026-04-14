# UI Polish Validation — Issue #37

## Summary
- **Issue:** [#37](https://github.com/mathursrus/SKB/issues/37) — Waitlist transparency, host chat/call, table number on seat
- **Workflow:** ui-polish-validation
- **Branch:** `impl/37-waitlist-transparency-chat-table`
- **PR:** https://github.com/mathursrus/SKB/pull/39
- **Tester:** Claude (Playwright-driven browser audit)
- **Date:** 2026-04-13

## Quality contract
- **Breakpoints**: 375×812 (mobile), 768×1024 (tablet), 1280×800 (desktop).
  Host stand is marked `<meta viewport="width=1024,initial-scale=1">` on purpose — it's a PIN-gated tablet/desktop surface, so mobile audit applies only to `queue.html`.
- **Design system**: generic UI baseline, keyed to the existing `public/styles.css` tokens (Fira Sans, #e3bf3d gold accent, #15803d ok green, #b91c1c danger red).
- **Accept bar**: no P0/P1 defects. WCAG AA contrast. No overflow / clipping / non-rendering elements. ARIA labels on every new interactive element.

## Environment
- Dev server at `http://127.0.0.1:8720` with `SKB_HOST_PIN=1234`, `SKB_COOKIE_SECRET=dev-secret-for-local-validation`.
- MongoDB on localhost:27017, `skb_dev` database, seeded with 5 waiting parties plus seated / notified / chat-threaded variants:
  - Kim Jae (short name, seated at table 12)
  - Nguyen, Thao Minh (called + acked "On the way")
  - Sana Patel (seated at table 99 for terminal-state test)
  - Williams, Maximilian Alexander (very long name, stress-tests the waitlist list and the seat dialog)
  - Okafor (single-token name)
- Twilio not configured — chat sends persist with `smsStatus: not_configured`, which exercises the failure-status badge path without hitting the real gateway.

## Surfaces audited

### Diner
- `queue.html` join state (existing) — regression check
- `queue.html` waiting state with full list (new R3)
- `queue.html` called state with "I'm on my way" CTA (new R6)
- `queue.html` seated terminal state (new R7)

### Host
- `host.html` waiting tab with 5 row actions (new R9)
- `host.html` Seated tab with leftmost Table column (new R15)
- `host.html` Seat Party dialog (new R14)
- `host.html` chat drawer (new R10)

## Defects discovered and their fix

### DEF-37-UI-01 · Seat Party dialog input overflows horizontally — **P1 (fixed)**
**Surface**: host.html · Seat Party dialog
**Viewport**: 1280×800
**Repro**:
1. Log in as host (PIN 1234).
2. Click **Seat** on any party.
3. Observe: a horizontal scrollbar appears inside the dialog.
**Evidence**: `docs/evidence/ui-polish/37/37-host-1280-seat-dialog-open.png` shows the scrollbar at the bottom of the dialog body.
**Root cause**: the pre-existing global rule `input[type=text], input[type=tel], input[type=number] { width: 100%; padding: 12px 14px; }` at `public/styles.css:110` has specificity `(0,1,1)`. My new `.seat-dialog-input { width: calc(100% - 40px); padding: 16px; }` at `(0,1,0)` lost the cascade, so the input consumed `100% + margin` = `form width + 40px` and forced the form to scroll.
**Diagnosis**: `browser_evaluate` showed `formClientW: 438, formScrollW: 458` (20px overflow) and `input.clientWidth: 438` (not the expected 398).
**Fix**: bumped the selector to `input.seat-dialog-input` so specificity rises to `(0,1,1)` and — being later in the file — wins the cascade. Added explicit `box-sizing: border-box` for belt-and-suspenders.
**Verification**: post-fix `browser_evaluate` showed `formScrollW: 438, inputOffsetW: 398` (no overflow). Screenshot `37-host-1280-seat-dialog-fixed.png` confirms a clean dialog.
**Commit**: bundled with the round-up commit at the end of this doc.

### DEF-37-UI-02 · Viewer row `(you)` marker truncated on mobile — **P2 (fixed)**
**Surface**: queue.html · public waitlist
**Viewport**: 375×812
**Repro**:
1. Navigate to `http://127.0.0.1:8720/r/skb/queue.html?code=SKB-HP6` (Williams, long name).
2. Observe: the viewer row reads `Maximili...` with the `(you)` annotation clipped.
**Evidence**: `37-diner-375-williams.png` — row 4 shows `Maximili...` ellipsed.
**Root cause**: the `.pqr` grid template `40px 1fr 36px 68px 60px` computed the `1fr` name column at 55px on a 375px viewport because the other columns were eating the width, and `.pqr-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }` elided the `(you)` marker along with most of the name.
**Diagnosis**: `browser_evaluate` on `.pqr-me`:
```
cols: "40px 55px 36px 68px 60px"
nameClientW: 55, nameScrollW: 119, nameTextContent: "Maximilian W. (you)"
```
**Fix**: tightened the grid template to `28px minmax(0, 1fr) 26px 58px 52px` with gap 6px (saving ~22px), allowed `.pqr-name` to wrap with `overflow-wrap: anywhere; line-height: 1.25`, and shrunk the promised/waiting columns' font-size to 13px so they stay legible at their new widths.
**Verification**: `37-diner-375-williams-fixed.png` shows the row rendering `Maximilian W.` on line 1 and `(you)` on line 2 inside the highlighted row. `37-diner-768-tablet.png` confirms the same row fits on one line at 768px.

### DEF-37-UI-03 · Seated terminal state reads "Promised by Enjoy your meal" — **P1 (fixed)**
**Surface**: queue.html · seated terminal state
**Viewport**: 1280×800
**Repro**:
1. Seat a party via the host (or use SKB-7UF which is pre-seated at table 99).
2. Open `queue.html?code=SKB-7UF`.
3. Observe: the card shows `Table 99` as the headline, but under it reads `Promised by Enjoy your meal ·` which is nonsense. The "We'll call your name and code when your table is ready" hint is still visible. The Refresh button is still visible even though polling has stopped.
**Evidence**: `37-diner-1280-seated-terminal.png` shows all three defects in one shot.
**Root cause**: my first-pass implementation of the seated terminal branch in `queue.js` re-used the `#conf-eta` element by setting its text to `"Enjoy your meal"`, but the parent `.eta-time` line literally contains the text `"Promised by "` and ` · ` in the DOM as flow content — those aren't IDs I could clear. The `.hint` and `#refresh-btn` elements were never hidden.
**Fix**:
- Added explicit IDs to the reusable elements (`conf-pos-label`, `conf-eta-line`, `conf-hint`) in `queue.html` and a new `#seated-caption` element (hidden by default).
- In the seated branch of `loadStatus`, I now hide `#conf-eta-line`, `#conf-hint`, `#refresh-btn` and `.wait-elapsed`, retarget `#conf-pos-label` to read `your table`, swap `#conf-pos` to `Table N`, and reveal `#seated-caption` with the italic "Enjoy your meal." text.
- Added `.is-seated .pos { color: var(--ok) }` so the table number pops in green.
**Verification**: `37-diner-1280-seated-terminal-v3.png` shows the clean `YOUR TABLE / Table 99 / SKB-7UF / Enjoy your meal.` card — no stale ETA line, no hint, no Refresh button, no list beneath.
**Bonus discovery**: while debugging this I found that `src/services/queue-template.ts` caches the `public/queue.html` template in-memory at boot via `templateCache`, so hot-editing the HTML has no effect without a server restart. Documented in the doc below for future maintainers but not fixed here (changing cache behavior is out of scope for a UI polish PR).

## Checks that passed without findings

| Check | Result |
|---|---|
| Diner join flow (regression) | Unchanged, renders cleanly at 375 / 768 / 1280 |
| Diner waiting state full list at 375 | 5 rows render, gold-border highlight on viewer row, live `waiting` counter ticks per second, `Who's in line · 5 parties` count accurate |
| Diner called state with "I'm on my way" CTA | Gold callout + CTA render; clicking ack flips button to `On the way ✓` with disabled state |
| Diner acknowledge mutation surfaces on host row | Host list shows `On the way` green pill next to the party name within 5s of the ack POST |
| Host waiting row action order + ARIA labels | `Seat / Notify / Chat / Call / No-show` in that order; aria-labels include the party name ("Seat Sana Patel" etc.); Chat and Call have the gold `.rowbtn-new` outline to flag them as new |
| Host row disabled state when phone missing | Not testable in this audit — the join form requires a 10-digit phone, so there are no phoneless parties in the DB |
| Host Seated tab has Table column as leftmost cell | `37-host-seated-tab.png`: `12 · Kim Jae` and `14 · Nguyen, Thao` render |
| Host Seat Party dialog open state | Party summary, Table # input, recent-table chips, disabled confirm button all render (post-fix — see DEF-37-UI-01) |
| Host Seat Party dialog conflict state | `37-host-seat-dialog-conflict.png`: `Table 12 is occupied by Kim Jae` red alert + `Seat anyway` override button |
| Host Seat Party dialog conflict text escaping | `browser_evaluate` confirmed `thread.querySelector('img')` returns null even after injecting `<img src=x onerror=alert(1)><script>alert(2)</script>` via the chat endpoint |
| Host Chat drawer thread rendering | Gold outbound bubbles right-aligned with timestamps, 3 quick-reply buttons at bottom (Table almost ready / Need 5 more minutes? / We lost you), composer with Send button |
| Host Chat drawer backdrop + z-index | `rgba(0,0,0,0.3)` backdrop at z-index 50, drawer at z-index 60, body content correctly behind |
| Console health | Only error across any page load is `favicon.ico 404` (pre-existing). No JS errors, no uncaught promises, no CORS errors |
| Rate-limit response header | `Retry-After: 5` present on status endpoint 429 responses |

## Final UI signoff

Three defects were found (1×P1 dialog overflow, 1×P2 mobile truncation, 1×P1 terminal state copy). All three were fixed in-place during the audit and re-verified with post-fix screenshots. There are no remaining P0/P1 issues.

**UI polish signoff: PASS.**
