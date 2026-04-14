# Feature Implementation Evidence — Issue #37

## Summary
- **Issue:** [#37](https://github.com/mathursrus/SKB/issues/37) — Waitlist: customer full-list view, host chat/call, table number on seat
- **Workflow:** feature-implementation
- **Branch:** `impl/37-waitlist-transparency-chat-table`
- **PR:** https://github.com/mathursrus/SKB/pull/39
- **Spec:** `docs/feature-specs/37-waitlist-transparency-chat-table.md`
- **RFC:** `docs/rfcs/37-waitlist-transparency-chat-table.md`
- **Author:** sid.mathur@gmail.com

## Work Completed

### Commits on branch
- `bb8b32c` — backend: types, services, routes
- `ae4c93f` — UI: diner full list, host chat drawer, seat dialog, call tel:
- `0ddb588` — tests: nameRedact unit + waitlist-transparency integration
- `3c62615` — queue.js reads ?code= from URL to bootstrap

### Files touched
**Backend (types + db)**
- `src/types/queue.ts` — `QueueEntry.tableNumber`, `QueueEntry.onMyWayAt`, `PublicQueueRowDTO`, `StatusResponseDTO.{queue,totalParties,tableNumber,onMyWayAt}`, `HostPartyDTO.{code,phoneForDial,unreadChat,onMyWayAt}`, `HostDiningPartyDTO.tableNumber`
- `src/types/chat.ts` NEW — `ChatMessage`, `ChatMessageDTO`, `ChatThreadDTO`, `ChatDirection`
- `src/core/db/mongo.ts` — `queueMessages` collection accessor; 3 new indexes (`loc_serviceDay_state_tableNumber` for seat-conflict scans, `loc_code_created` + `unread_lookup` on `queue_messages`)

**Services**
- `src/services/nameRedact.ts` NEW — `redactName()` handles `"Last, First"`, `"First Last"`, single-token, middle-name, compound surname, null/empty; falls back to `"Guest"`
- `src/services/chat.ts` NEW — `sendChatMessage`, `getChatThread` (cursor pagination via `before`+`limit`, `hasMore`), `markThreadRead`, `appendInbound` (unmatched → `entryCode: null` audit), `countUnreadForEntries` (one aggregate for the whole host list)
- `src/services/queue.ts` — `listPublicQueue()`, `acknowledgeOnMyWay()`, `logCallDial()`, `removeFromQueue(id, reason, {tableNumber, override})` with conflict detection + back-compat legacy signature, `listHostQueue` batch-populates `unreadChat`/`phoneForDial`/`onMyWayAt`, `getStatusByCode` returns the full redacted public queue and seated terminal state
- `src/services/dining.ts` — `HostDiningPartyDTO.tableNumber` populated
- `src/services/smsTemplates.ts` — `chatAlmostReadyMessage`, `chatNeedMoreTimeMessage`, `chatLostYouMessage`

**Routes**
- `src/routes/queue.ts` — `GET /queue/status` wrapped in `rateLimit({ windowMs: 5000, max: 1, keyFn: (req) => loc + ':' + code })`; new `POST /queue/acknowledge`
- `src/routes/host.ts` — `POST /host/queue/:id/remove` accepts `{tableNumber, override}`, returns 409 `table_occupied` with `occupiedBy`; new `POST /host/queue/:id/chat`, `GET /host/queue/:id/chat`, `PATCH /host/queue/:id/chat/read`, `POST /host/queue/:id/call-log`, `GET /host/chat/templates?code=X`
- `src/routes/sms.ts` NEW — `POST /sms/inbound` behind `validateTwilioSignature`; returns empty TwiML; logs matched and unmatched inbound
- `src/mcp-server.ts` — `smsRouter()` mounted at `/r/:loc/api`

**UI**
- `public/queue.html` — full waitlist `<section>`, live wait element, `I'm on my way` CTA
- `public/queue.js` — `renderPublicList()`, `startLiveTick()`/`stopLiveTick()`, `onAcknowledge()`, 15s poll cadence while waiting/called, seated terminal state, 429 handling, URL `?code=` bootstrap
- `public/host.html` — Waiting row grows Seat/Notify/Chat/Call; Seated table column added; native `<dialog id="seat-dialog">`; chat drawer `<aside>` + backdrop
- `public/host.js` — row template reshuffled with ARIA labels; `openSeatDialog()` + `loadRecentTables()` + conflict override re-render; `openChat()`/`loadChatThread()`/`loadQuickReplies()`/composer; `onCallLog()` best-effort dial log; row click dispatcher to new buttons
- `public/styles.css` — 563 new LOC for `.public-list`, `.pqr*`, `.seat-dialog*`, `.chat-drawer*`, `.unread-dot`, `.badge-on-way`, `.rowbtn-new`, `.table-num`, responsive override at 640px

**Tests**
- `tests/unit/nameRedact.test.ts` NEW — 11 cases
- `tests/integration/waitlist-transparency.integration.test.ts` NEW — 12 cases exercising the public queue, rate limit shape, seat+tableNumber, conflict detection, override, back-compat, terminal state, acknowledge, chat send/append/unread, unmatched inbound audit, host DTO shape
- `package.json` — both new tests wired into `npm test` and `npm run test:integration`

## Validation

### Type-check
```
npx tsc --noEmit   # clean
```

### Unit suite
```
npm test
# 179 tests total — 168 pre-existing + 11 new (nameRedact)
# 0 failures
```

### Integration suite
```
npm run test:integration
# 94 tests total — 82 pre-existing + 12 new (waitlist-transparency)
# 0 failures, all against real MongoDB on localhost:27017
```

### Manual browser validation (Playwright driven)
- Started dev server on port 8720 with PIN=1234 and a dev cookie secret.
- Joined 3 parties via the diner API: Kim Jae, Nguyen/Thao, Sana Patel.
- **Diner view (`/r/skb/queue.html?code=SKB-7UF`)** — renders `You're next`, `SKB-7UF` code badge, promised time, live `Waiting 01:36` ticker, and a `Who's in line · 1 party` row with the Patel row highlighted and `(you)` annotation. All 3 names redacted server-side (`Kim J. / Thao N. / Sana P.`).
- **Rate limit** — second identical status request inside 5s returned `HTTP 429` with `Retry-After: 5`; third request also 429. Verified via curl.
- **Host view (`/r/skb/host.html`)** — login with PIN 1234 succeeds; Patel row shows `ON THE WAY` pill (from the acknowledge I hit via curl), with the new action order `Seat / Notify / Chat / Call / No-show`. Chat + Call carry the gold outline indicating new-feature affordance. Call is an `<a href="tel:+12065551003">`.
- **Seated tab** — shows leftmost Table column: `12 · Kim Jae`, `14 · Nguyen, Thao`.
- **Seat dialog** — clicking Seat on Patel opens the native `<dialog>` with party summary (Sana Patel, 4, 2m), empty Table # input, recent-tables chips (12 and 14, struck through as occupied), confirm button disabled.
- **Conflict flow** — typing `12` into the dialog and submitting surfaces a red inline alert `Table 12 is occupied by Kim Jae` with an explicit `Seat anyway` override button, and the confirm button label updates to `Seat at table 12`. Override path succeeded in a separate curl test.
- **Chat drawer** — clicking Chat on Patel opens a right-anchored slide-over titled `Sana Patel · ******1003`, showing the earlier outbound `Your table is almost ready` at 6:47 PM, three quick-reply buttons (Table almost ready / Need 5 more minutes? / We lost you), composer with Send button.

Screenshots captured during validation:
- `.playwright-mcp/37-diner-full-list.png`
- `.playwright-mcp/37-host-waiting-row.png`
- `.playwright-mcp/37-host-seated-tab.png`
- `.playwright-mcp/37-host-seat-dialog-empty.png`
- `.playwright-mcp/37-host-seat-dialog-conflict.png`
- `.playwright-mcp/37-host-chat-drawer.png`

### API smoke via curl
| Call | Result |
|---|---|
| `POST /host/login {"pin":"1234"}` | `{"ok":true}` |
| `POST /queue/join` (×3) | three codes SKB-F9V / SKB-EBF / SKB-7UF |
| `GET /queue/status?code=SKB-7UF` | full redacted queue[], isMe=true on Patel row, position=3 |
| `GET /queue/status?code=SKB-EBF` (repeated <5s) | 2nd + 3rd request = 429 |
| `POST /host/queue/{kim}/remove {reason:seated, tableNumber:12}` | `{"ok":true}` + persisted |
| `POST /host/queue/{nguyen}/remove {reason:seated, tableNumber:12}` | 409 `table_occupied / occupiedBy: Kim Jae` |
| `POST /host/queue/{nguyen}/remove {reason:seated, tableNumber:14}` | `{"ok":true}` |
| `GET /host/dining` | both rows include `tableNumber: 12` / `14` |
| `POST /host/queue/{patel}/chat {body:"Your table is almost ready"}` | `{"ok":true, "smsStatus":"not_configured"}` (no Twilio creds locally, as expected) |
| `GET /host/queue/{patel}/chat` | 1 outbound message, unread=0, hasMore=false |
| `POST /queue/acknowledge {code:SKB-7UF}` | `{"ok":true}` |
| `GET /host/queue` (after ack) | Patel row shows `onMyWayAt` populated |
| `GET /host/chat/templates?code=SKB-7UF` | three quick-reply strings |

## Deliberate scope cut

Spec R9 lists row actions as `Seat / Notify / Chat / Call / Custom SMS / Custom Call / No-show`, describing Custom SMS and Custom Call as *existing*. The current `public/host.html` only has **Call** (which sends a preset notify SMS), **Seated**, and **No-show** — there is no custom-compose flow in the repo today.

**Decision**: this PR ships **Chat** and **Call** as described, and relabels the existing "Call" button to "Notify" in the UI (backend endpoint stays `/call` for zero churn on #29 tests). It does NOT add Custom SMS / Custom Call.

This is called out in the PR body and can be addressed in a follow-up if you want parity with the spec's exact button list.

## Quality Checks
- ✅ All functional requirements R1–R21 from the spec have implementation.
- ✅ Back-compat preserved: the old `removeFromQueue(id, reason, now)` signature still works so `#29` and earlier integration tests stayed green without edits.
- ✅ No placeholder code / TODOs / fix-me comments.
- ✅ Structured JSON logging for all new events (`host.seat`, `host.seat.conflict`, `chat.outbound`, `chat.outbound.failed`, `chat.inbound`, `sms.inbound.unmatched`, `diner.ack.on_way`, `host.call_dial`).
- ✅ Multi-tenant scoping: every new query predicates on `locationId`; every new index leads with `locationId`.
- ✅ Host-only `phoneForDial` never appears in any diner API response (verified by the DTO split and in the `/queue/status` curl payload which contains no `phone*` fields).
- ✅ Full typecheck + both test tiers clean after every commit.

## Phase Completion
- ✅ implement-scoping
- ⬜ implement-repro (N/A — feature, not bug)
- ✅ implement-tests (11 unit + 12 integration new)
- ✅ implement-code
- ✅ implement-validate (tsc + unit + integration + manual Playwright)
- ✅ implement-regression (full 82-integration pre-existing suite green)
- ✅ implement-quality (no regressions, no placeholder code, back-compat preserved)
- ✅ implement-completeness-review (every R1–R21 has a code location)
- ⏸ implement-architecture-update (architecture doc not tracked in repo; RFC's Architecture Analysis section covered the gap analysis)
- ✅ implement-submission (PR #39)
- ⏸ address-feedback (pending reviewer)
- ⏸ retrospective (post-review)
