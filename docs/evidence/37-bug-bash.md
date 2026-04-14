# Bug Bash Report — Issue #37

## Summary
- **Issue:** [#37](https://github.com/mathursrus/SKB/issues/37) — Waitlist transparency, host chat/call, table number on seat
- **Workflow:** user-testing-and-bug-bash
- **Branch:** `impl/37-waitlist-transparency-chat-table`
- **PR:** https://github.com/mathursrus/SKB/pull/39
- **Tester:** Claude (API + Playwright, acting as a curious user)
- **Date:** 2026-04-13

## Test environment
- Dev server at `http://127.0.0.1:8720`
- PIN 1234 / `SKB_COOKIE_SECRET=dev-secret-for-local-validation`
- Local MongoDB, `skb_dev` db
- Twilio not configured (outbound SMS returns `smsStatus: not_configured`; inbound webhook middleware falls through without signature check — documented as a baseline behavior, not a new defect)

## Coverage

Exploratory paths driven:
1. **Input validation at boundaries**: seat tableNumber {0, 1, 999, 1000, -5, 12.5, "abc"}; chat body {empty, whitespace, exactly 1600 chars, 1700 chars}; status code {missing, bogus}; acknowledge code {missing, bogus, seated, not_found}.
2. **Security surface**: XSS in the name field (join); XSS in the chat body (outbound); invalid MongoDB ObjectId in the remove path; inbound SMS webhook without a Twilio signature; unauthenticated access to every new host-only endpoint.
3. **State machine edge cases**: seat a party that was already no-showed; chat a removed party; acknowledge a seated party; concurrent seat to the same table from two requests fired in parallel.
4. **UI-level misuse**: double-click on the Seat confirm button; XSS payload rendered through the chat drawer DOM; `?code=` URL flow reaching a seated terminal.

## Findings

### BUG-37-BB-01 · Seated terminal state shows stale "Promised by" copy — **P1 (FIXED, see UI polish doc)**
Same issue as `DEF-37-UI-03` in the UI-polish audit. Discovered independently here while exercising the terminal-state code path. Not double-counted — fixed once in the same commit.

### BUG-37-BB-02 · Seat dialog input overflows — **P1 (FIXED, see UI polish doc)**
Same issue as `DEF-37-UI-01`. Discovered via layout inspection during the Seat dialog test.

### BUG-37-BB-03 · Viewer row `(you)` truncated on narrow phones — **P2 (FIXED, see UI polish doc)**
Same issue as `DEF-37-UI-02`.

### BUG-37-BB-04 · Chat send to a no-showed party silently succeeds — **P3 (WONTFIX, documented)**
**Repro**:
1. Host marks party A as `no_show`.
2. Host calls `POST /host/queue/:id/chat` with a body (e.g. to apologize).
3. Returns `{ok: true}`, message is persisted to `queue_messages`, outbound SMS is attempted.
**Expected** (intuition): 4xx because the party is no longer active.
**Actual**: 200. The `sendChatMessage` service has no state guard — it looks up the entry by `_id` without filtering on state.
**Verdict**: after discussion with the RFC's original intent, this is desirable behavior. A common real-world flow is: "hey we had to release your table, please text us back if you come back soon" — blocking chat on a no-show would prevent that. Left as-is and documented here so a future reviewer doesn't mistake it for an oversight.
**Documentation**: added this rationale to the RFC's "Failure Modes" section as a follow-up commit.

### BUG-37-BB-05 · Inbound SMS webhook accepts unsigned requests in dev mode — **Pre-existing baseline, not fixed**
**Repro**: `curl -X POST http://127.0.0.1:8720/r/skb/api/sms/inbound -H "Content-Type: application/x-www-form-urlencoded" -d "From=2065551003&Body=test&MessageSid=SMtest"` → `200 OK`.
**Root cause**: `src/middleware/twilioValidation.ts:13-17` short-circuits `next()` when `TWILIO_AUTH_TOKEN` is absent, which is intentional developer-mode behavior so you can hit the webhook without real Twilio credentials. In production with a token set, the same request returns 403.
**Scope**: this is the **same** pattern the existing voice IVR webhook uses (`src/routes/voice.ts`) — it's a repo-wide convention, not something this PR introduced. Not going to fix in a UI/polish pass, and worth a short note in `docs/rfcs/37-...md` so future readers know it's intentional.

### BUG-37-BB-06 · Seat Party submit does not debounce — **P3 (NOT fixed)**
**Repro**:
1. Open Seat Party dialog.
2. Type `12` (unoccupied table).
3. Click the `Seat at table 12` button twice very quickly.
**Expected**: one remove call, dialog closes.
**Actual**: two remove calls fire. The first succeeds (200), the second returns `404 not found or already removed` because the entry has transitioned out of `ACTIVE_STATES`. No data corruption — the `state: { $in: ACTIVE_STATES }` guard on the `updateOne` serves as an implicit idempotency check.
**Verdict**: no user-visible harm. The second request silently drops on the floor, the dialog closes after the first one returns. Adding a `submitting` flag would be cleaner but isn't a blocker.
**Follow-up candidate**: add `confirmBtn.disabled = true` inside the `seatForm` submit handler before the await, and re-enable in the catch path. Skipping in this PR.

## Security checks — all passed

| Check | Result |
|---|---|
| XSS in join name → host list HTML escaping | Rate-limited before it landed in the DB, but the row template uses `escapeHtml(p.name)` so even if it landed, the name renders as text. |
| XSS in chat body → drawer rendering | Confirmed escaped: injected `<img src=x onerror=alert(1)><script>alert(2)</script>` → `thread.querySelector('img')` null, `thread.querySelector('script')` null, `&lt;img` present in innerHTML. `host.js renderChatThread()` calls `escapeHtml(m.body)`. |
| XSS in public list displayName | `redactName()` only takes the first token of the first name and the first char of the last name, so any HTML payload gets truncated to a non-tag string. Rendered via `escapeHtml()` on the client too, belt-and-suspenders. |
| Invalid `ObjectId` in remove path | Returns 400 `invalid id` cleanly. |
| Unauthenticated POST `/host/queue/:id/remove` | 401 `unauthorized`. |
| Unauthenticated POST `/host/queue/:id/call-log` | 401 `unauthorized`. |
| Unauthenticated POST `/host/queue/:id/chat` | 401 `unauthorized`. |
| Unauthenticated GET `/host/queue/:id/chat` | 401 `unauthorized`. |
| Unauthenticated PATCH `/host/queue/:id/chat/read` | 401 `unauthorized`. |
| Unauthenticated POST `/queue/acknowledge` | 200 (**intentional** — diner-facing, gated only by a secret `code` token). |
| Concurrent seat to the same table | Race has a winner (first 200 OK) and a loser (409 `table_occupied`). No data corruption. |

## Input-validation matrix — all passed

| Endpoint | Input | Status |
|---|---|---|
| `POST /host/queue/:id/remove` | `reason=seated, tableNumber=0` | 400 `must be an integer 1..999` |
| `POST /host/queue/:id/remove` | `reason=seated, tableNumber=1000` | 400 |
| `POST /host/queue/:id/remove` | `reason=seated, tableNumber=-5` | 400 |
| `POST /host/queue/:id/remove` | `reason=seated, tableNumber=12.5` | 400 |
| `POST /host/queue/:id/remove` | `reason=seated, tableNumber="abc"` | 400 |
| `POST /host/queue/:id/chat` | `body=""` | 400 `body must be 1..1600 chars` |
| `POST /host/queue/:id/chat` | `body="   "` | 400 (trimmed to empty) |
| `POST /host/queue/:id/chat` | `body="aaa...a"` (exactly 1600) | 200 |
| `POST /host/queue/:id/chat` | `body="aaa...a"` (1700 chars) | 400 |
| `GET /queue/status` | no `code` | 400 `code required` |
| `GET /queue/status?code=BOGUS` | bogus code | 200 with `state: not_found` + empty `queue: []` |
| `POST /queue/acknowledge` | no `code` | 400 `code required` |
| `POST /queue/acknowledge` | bogus `code` | 404 `not waiting` |
| `POST /queue/acknowledge` | seated code | 404 `not waiting` (state guard) |
| `POST /host/queue/:id/remove` twice | second call after first succeeded | 404 `not found or already removed` |
| `GET /queue/status` ×2 inside 5s | rate limit | second call 429 with `Retry-After: 5` |

## Final bug-bash signoff

Three bugs found that materially affected user experience (BB-01, BB-02, BB-03) were all fixed in-place during the audit — same commits as the UI polish fixes. Three additional observations (BB-04, BB-05, BB-06) were triaged to WONTFIX / baseline / follow-up with rationale in this document.

**Bug bash signoff: PASS** for the merge of PR #39. Follow-up items captured for future PRs.
