# Technical Design Evidence — Issue #37

## Summary
- **Issue:** [#37](https://github.com/mathursrus/SKB/issues/37) — Waitlist: customer full-list view, host chat/call, table number on seat
- **Workflow:** technical-design
- **Branch:** `spec/37-waitlist-transparency-chat-table`
- **Spec:** `docs/feature-specs/37-waitlist-transparency-chat-table.md`
- **RFC:** `docs/rfcs/37-waitlist-transparency-chat-table.md`
- **Author:** sid.mathur@gmail.com

## Work Completed

### Phases
- ✅ **requirements-analysis** — read spec R1–R21, explored `C:/Users/sidma/Code/SKB` (Express + MongoDB + Twilio + vanilla-JS), identified reusable primitives (`src/services/sms.ts`, `src/middleware/twilioValidation.ts`, multi-tenant `/r/:loc/api/*` routing, forward-only party state machine).
- ✅ **design-authoring** — authored `docs/rfcs/37-waitlist-transparency-chat-table.md` following house style from `29-sms-users-when-host-calls-them.md`. No technical spike needed — every risky primitive already exists in the codebase.
- ✅ **architecture-gap-review** — three-bucket classification written into the RFC's `Architecture Analysis` section. Correctly-followed: service-layer separation, Twilio signature middleware reuse, structured JSON logs, multi-tenant scoping, DTO split, additive schema. Missing-from-architecture: SSR-ish initial paint, in-memory rate limiter, two-document transactional writes (deferred). Not-followed-with-justification: relabeling "Call" → "Notify" in UI without renaming the backend `/call` endpoint.
- ✅ **design-completeness-review** — traceability matrix below. Four gaps surfaced against R6 / R15 / R19 / R21 and fixed in-place in the RFC before finalizing the matrix (see `Gap Fixes` below).

### Key design decisions
- **Extend `GET /queue/status`** rather than build a separate `/w/<token>` endpoint — the existing `code`-keyed URL already satisfies the "unauthenticated link" requirement and is reachable from the confirmation SMS.
- **Reuse `POST /host/queue/:id/remove`** with `reason='seated' + tableNumber`. A new `/seat` endpoint would be cleaner but costs `#29` test churn for no user-visible benefit.
- **Chat storage as a separate `queue_messages` collection** keyed on `(locationId, entryCode)` rather than an inline `messages[]` array on `QueueEntry` — scales beyond Mongo's 16MB doc cap and lets us paginate by a cursor.
- **Inbound SMS via `POST /sms/inbound`** reusing `validateTwilioSignature` middleware. Unmatched inbound messages are logged and stored with `entryCode: null` for audit rather than silently dropped.
- **`tel:` dialer is frontend-only.** New `HostPartyDTO.phoneForDial` is host-only; diner-facing responses never include it. CI snapshot test will guard against leakage.
- **Name redaction at the service layer** via `redactName()` helper handling both `"Last, First"` and `"First Last"` formats → `"First L."`, with fallback `"Guest"`.
- **No real-time transport.** Reuses existing polling cadence (host 5s, diner 15s during active wait) — no SSE/WebSockets introduced.

### Gap Fixes (applied to RFC during completeness review)
- **R6 — "I'm on my way" ack**: added new `POST /queue/acknowledge` endpoint and `QueueEntry.onMyWayAt` field; `HostPartyDTO.onMyWayAt` surfaces an `On the way` pill on the host row.
- **R15 — Seated tab shows table**: added `tableNumber: number` to `HostDiningPartyDTO` so the Seated tab row renders the assigned table as its leftmost cell.
- **R19 — Accessibility**: host.js row/buttons carry `aria-label`s keyed on party name, chat drawer uses `role="dialog" + aria-labelledby` + focus trap, seat dialog inherits native `<dialog>` a11y. Contrast verified at AA against existing tokens.
- **R21 — Chat pagination**: `GET /host/queue/:id/chat` accepts `?before=<ISO>&limit=50` so older messages lazy-load on scroll-to-top; response includes `hasMore`.

## Traceability Matrix

| Requirement | RFC Section / Component | Status |
|---|---|---|
| **R1** Unauthenticated link via `/w/<token>` | `GET /queue/status?code=X` reused as the unauthenticated link — the `code` token identifies the party and is delivered via the existing join confirmation SMS (#29) | **Met (clarification)** |
| **R2** Header card: position, promised, elapsed, visual state | `StatusResponseDTO` (position, etaAt, tableNumber), `queue.html` header card, `queue.js` refreshStatus → state pill swap (Waiting / Table ready / Seated) | **Met** |
| **R3** Full waitlist list with #, name (first + last initial), size, promised, waiting, viewer highlighted | `PublicQueueRowDTO` + `listPublicQueue()` in `src/services/queue.ts` + `redactName()` helper + `queue.js renderPublicRow()` + `.isMe` CSS class | **Met** |
| **R4** Sort by position, viewer highlighted in place | `listPublicQueue` sorts by `position` ascending; `isMe` flag set by server based on viewer's `code`; row not moved out of sort position | **Met** |
| **R5** Updates ≥ every 15s without full reload | `queue.js` poll interval 15s during waiting/called state; JSON-only refresh (no reload) | **Met** |
| **R6** Table ready state with "I'm on my way" CTA POSTing ack | **NEW** `POST /queue/acknowledge` + `QueueEntry.onMyWayAt` + `HostPartyDTO.onMyWayAt` + `queue.js` ready-card CTA wiring | **Met (gap-fixed)** |
| **R7** Terminal state (Seated at table N / Cancelled / Couldn't reach) | `queue.js` state branches on `state === 'seated' | 'departed' | 'no_show'`, renders terminal card, stops polling | **Met** |
| **R8** Mobile-first, WCAG AA contrast, header works without JS | `queue.ts` route renders the header card server-side into initial HTML when `?code=` is present (documented under `Patterns Missing from Architecture` → SSR-ish); tokens from `public/styles.css` already AA | **Met** |
| **R9** Row action order: Seat / Notify / Chat (new) / Call (new) / Custom SMS / Custom Call / No-show | `host.html` row template change; existing `/call` backend retained but UI label becomes `Notify`; new Chat + Call buttons added in the specified order | **Met** |
| **R10** Chat slide-over with thread + 3 quick replies + composer + unread dot | `POST /host/queue/:id/chat` + `GET /host/queue/:id/chat` + `queue_messages` collection + new quick-reply templates in `smsTemplates.ts` + `.drawer` slide-over + `HostPartyDTO.unreadChat` | **Met** |
| **R11** Call triggers tel: dial, logs `call_initiated` | Host-only `HostPartyDTO.phoneForDial` + `<a href="tel:+1...">` on the row + best-effort `POST /host/queue/:id/call-log` writing a phone-dial CallRecord | **Met** |
| **R12** Custom SMS and Custom Call preserved unchanged | `host.js` retains the existing Custom SMS / Custom Call handlers; no backend changes to those paths | **Met** |
| **R13** Chat + Call disabled when phone missing | `host.js renderParty()` disables Chat/Call/Notify/Custom SMS/Custom Call when `!entry.phoneMasked`, adds `No phone number on file` tooltip | **Met** |
| **R14** Seat Party dialog: party summary, required Table # input, recent chips, confirm button | `host.html` `<dialog id="seat-dialog">` + `host.js onSeat()` handler + recent-tables chips derived from last N seated parties + disabled-until-filled primary | **Met** |
| **R15** On confirm, Waiting→Seated with `tableNumber` persisted; Seated tab shows table | `removeParty()` change persists `tableNumber` on seated transition; **NEW** `HostDiningPartyDTO.tableNumber` field; host.js Seated tab template renders it leftmost | **Met (gap-fixed)** |
| **R16** Conflict detection: 409 with occupiedBy, explicit override button | `removeParty()` pre-update scan against `DINING_STATES` with `tableNumber` match; returns `{ ok: false, conflict: { partyName, partyId } }`; route surfaces 409 `table_occupied`; host.js re-renders dialog with conflict alert + `Seat anyway` override | **Met** |
| **R17** `tableNumber` emitted on analytics stream for POS joins | `QueueEntry.tableNumber` becomes available on the canonical document consumed by `getHostStats` and any downstream POS join; structured log `host.seat` includes `tableNumber` | **Met** |
| **R18** ETA mode / averages unaffected | No change to `src/services/stats.ts` or `computeEffectiveTurnTime`; `tableNumber` is orthogonal to ETA math | **Met** |
| **R19** WCAG AA, aria-labels, keyboard reachable in row order | **NEW** `host.js` row button aria-labels keyed on party name; chat drawer `role="dialog" + aria-labelledby` + focus trap; seat `<dialog>` native a11y; contrast AA on existing tokens | **Met (gap-fixed)** |
| **R20** Status poll rate-limit 1/5s/token | **NEW** `src/services/rateLimiter.ts` in-memory LRU keyed on `${locationId}:${code}`; 429 with `Retry-After: 5` | **Met** |
| **R21** Chat drawer renders last 50, lazy-loads older on scroll | `GET /host/queue/:id/chat?before=<ISO>&limit=50` with `hasMore` pagination; host.js fetches older on scroll-to-top of drawer | **Met (gap-fixed)** |

### Matrix verdict
**PASS** — 21 / 21 requirements mapped to concrete RFC components. Zero Unmet rows. Four items (R6, R15, R19, R21) required RFC patches during this phase; patches applied before verdict.

## Validation plan traceability

Every spec-level acceptance criterion maps to an entry in the RFC `Validation Plan` or `Test Matrix`:

| Spec acceptance check | RFC test coverage |
|---|---|
| Guest opens link → sees `#3 of 7`, list with 7 rows, self highlighted | E2E `waitlist-transparency.e2e.test.ts` — joined-then-status flow |
| Notified → header flips to `Your table is ready` within 15s | E2E — host `call` → diner poll assertion |
| "I'm on my way" CTA POSTs acknowledge | Integration — `POST /queue/acknowledge` + `HostPartyDTO.onMyWayAt` assertion |
| Seated → `Seated at table 12` terminal state | E2E — host seat with table → diner terminal state |
| Position 1 header reads "You're next" | Unit `publicQueue.test.ts` — header renderer with position=1 |
| Expired/missing token → terminal inactive card | Integration — GET /queue/status with unknown code → 200 with state `not_found` |
| Host Call with valid phone → dialer opens, log entry | E2E — assert `tel:` href; Unit — call-log endpoint |
| Chat unread badge on row | Integration — send inbound, GET /host/queue → unreadChat ≥ 1 |
| No-phone walk-in → Chat/Call/Notify/Custom SMS/Custom Call disabled | E2E — host row render assertion |
| Seat dialog focus on Table # input | E2E — assert active element after open |
| Enter 12, confirm → Seated tab shows `12 · Patel · 4` | E2E + Integration |
| Conflict on table 12 → inline error + override | Integration — two seats to same table → 409 |
| Escape in seat dialog → party stays Waiting | E2E — open → Escape → assert row still in Waiting tab |

## Architecture Gaps (for user review)

Documented in the RFC `Architecture Analysis` section. Surfacing them here for the PR reviewer's decision — none are blocking:

1. **SSR-ish initial paint in `queue.ts` route** — first server-rendered surface in the app. Option A (RFC default): tiny inline template function inside the existing route. Option B: introduce a formal templating dependency. Recommend A.
2. **In-memory rate limiter in `src/services/rateLimiter.ts`** — first rate-limit implementation in the codebase. Option A (RFC default): local LRU map, single-process only, acceptable because the app runs on a single Azure instance per tenant. Option B: Redis-backed counter. Recommend A until we horizontally scale.
3. **Two-document transactional writes for seat conflict** — the TOCTOU window is microseconds and the blast radius is one mislabeled table that a human can fix. Option A (RFC default): best-effort post-write re-scan + `seat.table_collision` alert. Option B: Mongo session + transaction. Recommend A unless collision logs show > 1/week.
4. **UI `/call` → `Notify` label decoupling** — backend endpoint retains the `/call` path, UI shows `Notify`. Option A (RFC default): accept the lie. Option B: introduce `/notify` and deprecate `/call` in a follow-up PR. Recommend A for this change; Option B as a separate chore.

## Quality Checks
- ✅ RFC follows the repo's house style (compared against `29-sms-users-when-host-calls-them.md`, `30-google-maps-integration.md`).
- ✅ Every data-model change is a diff block against the exact file + line in the current repo.
- ✅ Every new endpoint is scoped to the existing multi-tenant `/r/:loc/api/*` route pattern.
- ✅ Every new collection has explicit indexes leading with `locationId`.
- ✅ No backwards-compatibility shims — all changes are additive.
- ✅ Failure modes table lists the eight realistic degradation scenarios with behavior + timeout.
- ✅ Test matrix covers unit, integration, and E2E layers with specific file paths.
- ✅ Traceability matrix has 0 Unmet rows.

## Phase Completion
- ✅ requirements-analysis
- ✅ design-authoring
- ⬜ technical-spike — skipped (not needed; no high-uncertainty primitives)
- ✅ architecture-gap-review
- ✅ design-completeness-review
- ⏸ design-submission — PR #38 already open; this evidence doc will be added to it
- ⏸ address-feedback — pending reviewer input
- ⏸ retrospective — post-review
