# SKB Bug Bash Report — Issue #50 follow-up

- **Date**: 2026-04-15 (revalidation 2026-04-15 late PM)
- **Reviewer**: Claude (sid.mathur@gmail.com session)
- **Scope**: Web (diner queue, host stand, admin) at prod `https://skb-waitlist.azurewebsites.net`. iOS covered by unit tests + device deferred.
- **Browser**: Chromium via Playwright
- **Viewports tested**: 375×812, 768×1024, 1280×800

## Update (revalidation round)

All 5 items below have been **fixed, deployed, and re-verified in prod**:

| # | Item | Fix commit | Revalidation evidence |
| --- | --- | --- | --- |
| 1 | Host mobile table overflow | `81ca37d` | `docs/evidence/ui-polish/50/host-mobile-375-fixed.png` — scrollWidth=375 = viewport; no horizontal page scroll |
| 2 | Diner chat 429 storm | `64e9deb` | 3 chat 429s in 30s (was 27+ in 90s pre-fix); exponential backoff verified |
| 3 | Host login missing theme toggle | `30da020` | `host-login-mobile-with-toggle.png` + `host-login-mobile-dark-toggle.png` — toggle present and functional pre-auth |
| 4 | Name not server-sanitized | `044976a` | POST `/api/queue/join` with `<script>` returns 400 `name contains unsupported characters` |
| 5 | `#111` tech debt on saffron | `be7c76f` | All 7 sites migrated to `var(--accent-fg)`; no visual change |

Revalidation also exercised new edge cases not in the original pass:
- **Emoji name** (`🍛 Curry Family`) → 200, accepted.
- **120-char name** → 400 `name must be 1..60 chars`.
- **Whitespace-only name** → 400 (trimmed to empty, treated as missing).
- **HTML metacharacters** → 400 `name contains unsupported characters` (item 4 fix).
- **Rapid repeated joins** → 429 `too many requests` (rate limiter working).

**Outcome: PASS.** Zero P0/P1 remaining. No new regressions surfaced.

The historical findings below are retained for traceability.

---


## Summary

| Severity | Count | Notes |
| --- | --- | --- |
| Critical | 0 | — |
| High (P1) | 2 | Mobile host-table overflow; diner chat 429 polling pacing |
| Medium (P2) | 2 | Login-card has no theme toggle; name field not server-sanitized (client escape holds) |
| Low (P3) | 1 | 3 saffron-on-saffron hardcoded `#111` text colors are brittle (tech debt) |

All issues below are **pre-existing** or **out of scope for Issue #50** (dark mode + iOS fix). None are regressions from the UI polish pass.

---

## Bug #1 — Host Waiting table overflows at phone + iPad-portrait widths
**Severity**: P1 (High)
**Category**: UI/UX — Responsive
**Surface**: `/r/skb/host.html` Waiting tab (and likely Seated/Complete)

### Reproduction
1. Open prod host page on a 375×812 or 768×1024 viewport.
2. Log in with PIN 1234.
3. Look at the Waiting tab with ≥1 party in queue.

### Expected
All row actions (Seat, Notify, Chat, Call, custom-SMS, custom-Call, No-show) visible without horizontal scrolling. Hosts typically use iPads or phones at the stand.

### Actual
- At 375×812 (phone): action buttons clipped off the right; horizontal scrollbar at bottom.
- At 768×1024 (iPad portrait): Seat + Notify + Chat visible, but Call / envelope / phone-icon / No-show are all clipped; scrollbar at bottom.

### Evidence
- `docs/evidence/ui-polish/50/host-login-mobile-light.png` — 375px phone view
- `docs/evidence/ui-polish/50/host-waiting-ipad.png` — 768px iPad portrait

### Suggested fix
Two options:
1. Collapse secondary actions (envelope, phone-icon, No-show) behind a kebab/overflow menu for < 900px viewports.
2. Stack action buttons vertically in a narrow actions column, or wrap to 2 rows per party at narrow widths.

---

## Bug #2 — Diner chat polling hits 429 repeatedly when a thread exists
**Severity**: P1 (High)
**Category**: Performance / Rate limiting
**Surface**: `/r/skb/api/queue/chat/:code`

### Reproduction
1. Join the queue as a diner. Note the code (e.g., SKB-XXX).
2. Have the host send one message to the party from the host-stand chat drawer.
3. Reload the diner queue page with `?code=SKB-XXX`.
4. Open DevTools → Network, watch `/api/queue/chat/SKB-XXX` requests.

### Expected
Polling interval long enough to stay under rate-limit; 429s trigger exponential backoff.

### Actual
Client polls at a fixed cadence shorter than the rate-limit window. Server replies 429 repeatedly; console shows `Failed to load resource: 429` dozens of times per minute. Chat still works eventually (polls do succeed when the window resets), but the console is flooded and it burns prod bandwidth.

### Evidence
- Console: 27× `Failed to load resource: the server responded with a status of 429 () @ /r/skb/api/queue/chat/SKB-ATF` within ~90s of page load
- File likely responsible: `public/queue.js` `loadChat` polling loop

### Suggested fix
1. On 429 response, double the next poll delay (capped at ~60s) and reset on the next 200.
2. Also consider `Retry-After` header honoring if server sends it.

---

## Bug #3 — Host login screen has no theme toggle
**Severity**: P2 (Medium)
**Category**: UI/UX — Consistency

### Reproduction
1. Navigate to `/r/skb/host.html` in a fresh browser (no cookie).
2. Observe the login card.

### Expected
Theme toggle visible somewhere on the login view (consistent with diner + post-login host + admin).

### Actual
No toggle — login card has only PIN input + Unlock. Theme-toggle appears only after authentication in the post-login topbar. Users on a light-system-theme machine who prefer dark for SKB see light during login, then can flip to dark afterward.

### Suggested fix
Add a small floating theme-toggle button at top-right of the login-view, similar to the diner header pattern.

---

## Bug #4 — Name field on queue/join is not server-sanitized (client escape covers it)
**Severity**: P2 (Medium)
**Category**: Data hygiene / defense in depth

### Reproduction
```bash
curl -X POST https://skb-waitlist.azurewebsites.net/r/skb/api/queue/join \
  -H 'Content-Type: application/json' \
  -d '{"name":"<script>alert(1)</script>","partySize":2,"phone":"2065551234"}'
# → 200 OK, returns SKB-XXX
# Then fetch /api/queue/status?code=SKB-XXX — name returned unchanged
```

### Expected
Server rejects or strips HTML tags on input.

### Actual
Server stores and returns the name verbatim. Client renderers (`queue.js`, `host.js`) correctly call `escapeHtml` before inserting into the DOM, so no XSS fires in any currently-tested surface. But defense-in-depth would reject or sanitize server-side.

### Evidence
- `docs/evidence/ui-polish/50/host-waiting-ipad.png` — row #3 shows `<script>alert(1)</script>` rendered as literal text, not executing.

### Suggested fix
In the join route, strip HTML tags and disallow `<` / `>` from `name` — or validate it matches a safe name regex. Keep client escape as defense-in-depth.

---

## Bug #5 — Saffron-on-saffron hardcoded `#111` text colors
**Severity**: P3 (Low, tech debt)
**Category**: UI/UX maintainability

### Problem
7 CSS rules use `color: #111` directly on a `var(--accent)` or `var(--accent-dark)` background (e.g. `.chat-row.from-me .chat-bubble`, `.callout`, `.badge-called`, `.host tr.row-called td.actions button.notify-btn`, `a#custom-call-confirm.primary:hover`). They work in both light and dark because saffron is always light enough that `#111` has contrast — but the pattern is brittle: any future accent-palette change has to touch all these call sites.

### Suggested fix
Introduce `--accent-fg: #111` in `:root` (and confirm `--accent-fg: #111` in `.theme-dark`). Replace the hard-coded `#111` with `var(--accent-fg)` at all 7 call sites.

---

## Out-of-scope items verified
- **Phone validation**: server correctly rejects letters and short digits with clear error.
- **Party size**: client HTML5 `max=10` + server `partySize must be 1..10` both enforce.
- **PIN validation**: empty → 400 `pin required`; wrong → 401. No rate limit observed on rapid wrong attempts, but that's outside this bug-bash scope.
- **Dark mode contrast**: previously-surfaced P1s (host buttons, admin panels, diner confirmation) are all **fixed and deployed** — see `docs/evidence/50-ui-polish-validation.md`.
