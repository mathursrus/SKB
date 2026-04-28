# Feature: Mobile App Bugs

Issue: #102  
Owner: Codex

## Customer

Hosts working the stand, diners receiving waitlist texts, and owners managing staff access from the Settings surface.

## Customer Problem being solved

Issue #102 describes six related trust breaks in the current messaging and staff-management flows:

1. Host "Notify" can surface a raw `chat.disabled` error even though notify is an SMS action, not a web-chat action.
2. Host-facing failures are expressed as route/error-code leakage instead of operator-friendly guidance.
3. When chat is disabled, the host compose flow feels optimistic and then silently rolls back, which makes the action look broken rather than intentionally unavailable.
4. The "On the way" state is sticky enough that the host/mobile experience can imply diner acknowledgement without a fresh acknowledgement for the current notify cycle.
5. SMS replies are stored separately from the host-visible conversation affordance in practice, so the operator mental model is "messages are lost" even though inbound SMS handling exists.
6. Staff revoke in Settings lacks an obvious, trusted success/failure outcome for the operator, so "nothing happened" is a plausible reading of the current behavior.

The through-line is that "chat", "SMS", and "conversation history" are currently coupled too tightly in the UI and route semantics. This RFC separates transport capability from conversation visibility, tightens mutation contracts, and makes acknowledgement/revoke state explicit.

## User Experience that will solve the problem

- Host opens the Waiting row and sees distinct actions:
  - `Notify` means "send the table-ready SMS".
  - `Messages` means "open the unified conversation thread for this party".
  - `Call` means "open the phone dialer".
- If SMS delivery for `Notify` is unavailable, the host sees a short human message like `Couldn't text this guest. They haven't opted into SMS.` instead of a raw API code.
- If the host opens `Messages` for a party whose location supports SMS but not web chat, the drawer still opens and shows the SMS thread. The compose affordance is labeled by transport, not by the old `chat.disabled` flag.
- If the location supports neither outbound SMS nor web chat for that party, the drawer stays open in read-only mode with a persistent explanation instead of clearing the draft and collapsing state.
- The `On the way` badge appears only after the diner explicitly acknowledges the latest notify cycle. A stale acknowledgement from an earlier call does not satisfy a later notify.
- When a diner replies by SMS, that reply appears in the host `Messages` drawer and unread badge for the matching party.
- In Settings -> Staff, revoke/cancel shows a visible pending state, then either removes the row with a success toast or shows a specific error (`Only the owner can remove staff`, `That invite was already revoked`, etc.).

## Requirement traceability

| Requirement | Source | Design section |
|---|---|---|
| R1. Notify must not depend on the chat capability gate. | Issue #102 item 1 | `Technical Details -> Capability model`, `API surface changes` |
| R2. Operator-facing failures must be user-friendly. | Issue #102 item 2 | `Technical Details -> Mutation response contract`, `UI changes` |
| R3. Disabled chat must fail visibly without disappearing drafts/messages. | Issue #102 item 3 | `Technical Details -> UI changes`, `Failure modes & timeouts` |
| R4. `On the way` must reflect explicit acknowledgement of the latest notify cycle only. | Issue #102 item 4 | `Technical Details -> Data model / schema changes`, `API surface changes` |
| R5. SMS replies must surface in the host conversation view. | Issue #102 item 5 | `Technical Details -> Capability model`, `Data model / schema changes`, `UI changes` |
| R6. Staff revoke must produce a visible, trusted result. | Issue #102 item 6 | `Technical Details -> API surface changes`, `UI changes` |

## Technical Details

### Architecture overview

This issue stays inside the existing vanilla-JS + Express + MongoDB architecture:

- Presentation:
  - `public/host.js` and `public/host.html` for notify/messages/call affordances
  - `public/queue.js` for diner acknowledgement state
  - `public/admin.js` for Settings -> Staff revoke flow
- API:
  - `src/routes/host.ts` for notify, conversation thread, and staff revoke
  - `src/routes/queue.ts` for diner acknowledgement
  - `src/routes/sms.ts` for inbound SMS webhook ingestion
- Services:
  - `src/services/queue.ts` for queue entry state and host list DTOs
  - `src/services/chat.ts` for stored thread reads/writes
  - `src/services/sms.ts` for outbound SMS delivery
- Data:
  - `queue_entries` for live waitlist state
  - `queue_messages` for unified thread history

No new subsystem is needed. The fix is primarily a contract cleanup across those existing layers.

### Capability model

The current code treats "conversation exists" as equivalent to `getGuestFeatures(location).chat === true`. That is too narrow for issue #102 because SMS transport and thread visibility are separate concerns.

Introduce a server-side conversation capability resolver:

```ts
interface ConversationCapabilities {
  canViewThread: boolean;
  canSendSms: boolean;
  canUseWebChat: boolean;
  canCompose: boolean;
  mode: 'sms_only' | 'web_only' | 'sms_and_web' | 'read_only';
  disabledReason?: 'sms_opt_out' | 'no_phone' | 'feature_disabled';
}
```

Rules:

- `canViewThread` is true whenever the party has an existing thread or the location supports at least one conversation transport.
- `canSendSms` depends on `features.sms`, presence of a phone number, and `smsConsent === true`.
- `canUseWebChat` depends on `features.chat`.
- `canCompose` is true when either `canSendSms` or `canUseWebChat` is true.
- `Notify` checks only the SMS capability path. It never calls, catches, or surfaces `chat.disabled`.
- The host thread drawer uses `ConversationCapabilities` to decide mode text and compose availability. It does not disappear on a capability mismatch.

This preserves the existing storage model while aligning the UI with the operator mental model: one conversation, multiple transports.

### Mutation response contract

Host/admin mutations currently return a mix of raw HTTP codes, bare `{ error }` payloads, and silent refresh-only behavior. Standardize the user-facing mutation contract for this issue's routes:

```ts
interface ActionResultDTO {
  ok: boolean;
  code?: string;
  userMessage?: string;
}
```

Route-specific extensions:

- `POST /host/queue/:id/call`
  - `{ ok: true, smsStatus, userMessage, calledAt }`
- `POST /host/queue/:id/chat`
  - `{ ok: true, message, capabilities }`
  - or `{ ok: false, code, userMessage, capabilities }`
- `POST /staff/revoke`
  - `{ ok: true, removed: { kind: 'membership' | 'invite', id } }`

Representative error codes:

- `notify.sms_opt_out`
- `notify.no_phone`
- `conversation.read_only`
- `conversation.feature_disabled`
- `staff.owner_required`
- `staff.target_not_found`

`public/host.js` and `public/admin.js` will map `userMessage` directly into inline banners/toasts instead of synthesizing operator copy from route names or HTTP status alone.

### Data model / schema changes

#### `queue_entries`

Keep `onMyWayAt`, but add one new field to tie acknowledgement to the active notify cycle:

```ts
interface QueueEntry {
  // existing fields...
  onMyWayAt?: Date;
  lastOnMyWayCallAt?: Date; // equals the most recent call timestamp that the diner acknowledged
}
```

Semantics:

- `callParty()` appends a new `CallRecord` as today.
- `acknowledgeOnMyWay(code)` sets:
  - `onMyWayAt = now`
  - `lastOnMyWayCallAt = latestCall.at`
- Host/diner DTOs derive `hasAcknowledgedLatestCall` as:

```ts
const latestCallAt = entry.calls?.at(-1)?.at;
const acknowledgedLatestCall =
  !!latestCallAt
  && !!entry.lastOnMyWayCallAt
  && entry.lastOnMyWayCallAt.getTime() === latestCallAt.getTime();
```

The `On the way` badge and disabled acknowledgement button render from `acknowledgedLatestCall`, not from `onMyWayAt` alone. This fixes the stale-label class of bugs without erasing acknowledgement audit history.

#### `queue_messages`

Retain the collection, but extend the message shape so the unified thread can express transport cleanly:

```ts
interface ChatMessage {
  // existing fields...
  channel?: 'sms' | 'web';
  authoredBy?: 'host' | 'guest';
  failureCode?: 'sms_opt_out' | 'feature_disabled' | 'delivery_failed';
}
```

Population rules:

- Host notify/chat via SMS: `channel='sms'`, `authoredBy='host'`
- Diner SMS inbound webhook: `channel='sms'`, `authoredBy='guest'`
- Diner web message (`appendInboundFromCode`): `channel='web'`, `authoredBy='guest'`
- Future host web-only compose (if enabled): `channel='web'`, `authoredBy='host'`

This is additive, backward-compatible, and lets the host drawer explain what happened instead of implying every thread message is the same type of chat event.

No new collection is required.

### API surface changes

#### `POST /r/:loc/api/host/queue/:id/call`

Keep the route and intent, but remove any chat-coupled error handling from the route contract.

Behavior:

- Validates only notify prerequisites: queue entry exists, phone exists, SMS feature on, guest opted in.
- Returns:

```ts
{ ok: true, smsStatus: 'sent' | 'failed' | 'not_configured', userMessage: string, calledAt: string }
```

Examples:

- Success: `Text sent to the guest.`
- Opt-out: `Couldn't text this guest because they didn't opt into SMS updates.`
- No phone: `Couldn't text this guest because no phone number is on file.`

The route must never emit `chat.disabled`.

#### `GET /r/:loc/api/host/queue/:id/chat`

Keep the route for backward compatibility, but redefine its semantics as "conversation thread" rather than "chat-only thread".

Response adds capability metadata:

```ts
{
  entryId: string,
  messages: ChatMessageDTO[],
  unread: number,
  hasMore: boolean,
  capabilities: ConversationCapabilities
}
```

The route is readable whenever there is an existing thread or any conversation transport is enabled for the location. That makes inbound SMS visible even if web chat is disabled.

#### `POST /r/:loc/api/host/queue/:id/chat`

This becomes a conversation-send endpoint with transport-aware validation:

- If SMS is available for the party, send over SMS and persist the outbound message.
- If SMS is unavailable but web chat is enabled, persist a web-channel message.
- If neither transport is available, return:

```ts
{
  ok: false,
  code: 'conversation.read_only',
  userMessage: 'This party can receive messages only by phone or in person right now.',
  capabilities
}
```

The server never requires `features.chat === true` just to persist/read SMS-backed conversation history.

#### `PATCH /r/:loc/api/host/queue/:id/chat/read`

No semantic change, but the unread badge now applies to the unified conversation surface, not only chat-enabled locations.

#### `POST /r/:loc/api/queue/acknowledge`

Return the latest-call binding so clients can render deterministically:

```ts
{
  ok: true,
  onMyWayAt: string,
  acknowledgedCallAt: string
}
```

Reject acknowledgement when there is no active `called` record to acknowledge:

- `404 not_waiting`
- `409 no_active_notify_cycle`

That avoids creating a meaningless `onMyWay` state outside the notify flow.

#### `POST /r/:loc/api/staff/revoke`

Keep owner-only enforcement, but return a more explicit result:

```ts
{
  ok: true,
  removed: { kind: 'membership' | 'invite', id: string }
}
```

Error cases map to user-facing messages:

- `400 cannot revoke self` -> `You can't remove your own owner access from this screen.`
- `403 owner_required` -> `Only the owner can remove staff members.`
- `404 membership not found` -> `That staff member was already removed.`

### UI changes

#### `public/host.html` / `public/host.js`

- Rename the row action label from `Chat` to `Messages` when the party can use SMS-only mode. Keep the iconography minimal; the mode banner inside the drawer explains the transport.
- Add a host-level toast/banner region for row actions so `Notify`, `Messages`, and `Custom SMS` can surface `userMessage`.
- `onNotify(id)` must parse the response body on non-OK responses and show the human message instead of silently waiting for refresh.
- The drawer must preserve draft text on failed send. Failed sends do not clear the thread or make the just-typed content disappear.
- Show a mode banner in the drawer:
  - `SMS conversation`
  - `Web conversation`
  - `SMS + web conversation`
  - `Read-only history`
- When SMS is unavailable but thread viewing is allowed, keep the drawer open, disable submit, and render the reason inline.
- Unread badge logic remains on the row button, but the button is rendered whenever `canViewThread` is true, not only when `features.chat` is true.

#### `public/queue.js`

- Replace `if (s.onMyWayAt)` checks with `if (s.acknowledgedLatestCall)` (or equivalent derived DTO field).
- The acknowledgement button resets only when a new notify cycle starts, not because of a stale historic timestamp.
- If the page is loaded in `called` state without an active notify cycle binding, the button remains enabled until the diner explicitly acknowledges.

#### `public/admin.js`

- Revoke/cancel buttons enter a pending state immediately on click.
- Success path removes the row without requiring a full silent refresh, then optionally re-syncs from the server.
- Non-owner viewers never get an apparently actionable revoke button; they see disabled UI with an explanatory tooltip/message instead.
- Errors surface inline near the staff table in addition to `alert()` fallback.

### Design standards constraints

This repository does not have a configured project-specific design system in `fraim/config.json`, so the generic UI baseline applies.

Constraints for this RFC:

- Reuse existing visual tokens and interaction patterns from `public/styles.css`.
- Prefer copy changes, mode banners, inline alerts, and button-state clarity over introducing new visual components.
- Preserve mobile-first behavior for the host and queue surfaces.
- Validation must cover 375 / 768 / 1280 widths and both light/dark themes per project rule #19.

### Failure modes & timeouts

| Failure | Behavior | Timeout / retry |
|---|---|---|
| Host notify hits non-opted-in guest | `POST /call` returns `ok:false` with `notify.sms_opt_out` and human copy; no raw `chat.disabled` leak | No retry |
| Host opens messages on read-only party | Drawer stays open in read-only mode with disabled composer and explanation | No retry |
| Host sends message and transport fails | Draft remains in composer; thread shows no phantom success; inline error banner explains failure | Existing request timeout |
| Diner acknowledges without active notify cycle | Server returns `409 no_active_notify_cycle`; UI leaves button enabled and refreshes status | No retry |
| SMS inbound matches no active party | Existing unmatched logging remains; no host UI regression | N/A |
| Staff target already removed | `POST /staff/revoke` returns typed 404 message; row re-sync removes stale client state | One immediate re-sync |
| Non-owner attempts revoke | Explicit owner-only message, not silent failure | No retry |

### Telemetry & analytics

Add or standardize the following structured events:

```json
{ "msg": "notify.sent", "loc": "...", "code": "...", "smsStatus": "sent" }
{ "msg": "notify.rejected", "loc": "...", "code": "...", "reason": "sms_opt_out" }
{ "msg": "conversation.compose_rejected", "loc": "...", "code": "...", "reason": "read_only" }
{ "msg": "conversation.inbound_sms_linked", "loc": "...", "code": "...", "channel": "sms" }
{ "msg": "queue.acknowledge.bound_to_call", "loc": "...", "code": "...", "callAt": "..." }
{ "msg": "staff.revoke.completed", "loc": "...", "membershipId": "..." }
{ "msg": "staff.revoke.rejected", "loc": "...", "reason": "owner_required" }
```

These events make it possible to distinguish transport failures from feature gating and to confirm whether issue #102 item 4 was caused by stale acknowledgement binding in production.

## Confidence Level

85/100.

High confidence because the fix stays inside existing files, collections, and route shapes. The only additive persistence change is a small queue-entry binding field plus optional message metadata.

Remaining uncertainty is moderate but not spike-worthy:

- The exact observed `On the way` bug likely depends on runtime behavior not fully captured in the issue, but binding acknowledgement to the latest call cycle addresses the entire class of stale-label failures.
- The current product language uses `chat`; the UI rename to `Messages` is low-risk but still a user-facing wording change.

## Validation Plan

| User Scenario | Expected outcome | Validation method |
|---|---|---|
| Host presses `Notify` for SMS-opted-in guest | SMS sends and host sees `Text sent to the guest.` | Integration + UI validation |
| Host presses `Notify` for non-opted-in guest | Host sees friendly opt-out message, never `chat.disabled` | Integration + UI validation |
| Host opens `Messages` on SMS-only location | Drawer opens, thread visible, mode banner says SMS conversation | UI validation |
| Host sends message when drawer is read-only | Draft stays visible, inline error explains why send is unavailable | UI validation |
| Diner receives notify but has not acknowledged | No `On the way` badge on host or diner surfaces | Integration validation |
| Diner acknowledges latest notify cycle | `On the way` badge appears and stays tied to that notify cycle | Integration + UI validation |
| Host re-notifies after prior acknowledgement | Badge clears until the diner acknowledges the new notify cycle | Integration validation |
| Diner replies by SMS | Reply appears in host thread and unread badge increments | Integration validation |
| Owner revokes staff member | Row disappears and success state is shown | Integration + UI validation |
| Non-owner attempts revoke | Disabled or explicit permission message, not silent no-op | Integration + UI validation |

## Test Matrix

- Unit:
  - Add coverage for conversation capability resolution in `src/services/chat.ts`.
  - Add tests for acknowledgement binding logic in `src/services/queue.ts`.
  - Add tests for mutation error-to-user-message mapping if extracted to helpers.
- Integration:
  - Extend chat/SMS integration coverage so inbound SMS is readable through the host thread route even when `features.chat` is false.
  - Add regression coverage for `POST /host/queue/:id/call` returning friendly typed errors instead of `chat.disabled`.
  - Add regression coverage for `POST /queue/acknowledge` binding to the latest call only.
  - Extend `tests/integration/invites.integration.test.ts` or add a focused staff revoke test covering success, already-removed, and owner-only failure paths.
- E2E:
  - Add one host/diner/browser flow covering notify -> no badge before ack -> ack -> badge visible -> re-notify -> badge reset -> SMS reply visible in host messages.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Renaming `Chat` to `Messages` causes minor operator confusion | Low | Low | Keep route compatibility and add mode text inside the drawer so the new label is self-explanatory |
| Backward compatibility with existing `queue_messages` rows lacking `channel` fields | Low | Low | Treat missing metadata as legacy SMS-backed conversation in the renderer |
| `lastOnMyWayCallAt` and `calls.at(-1)` drift if calls are edited manually | Low | Medium | Treat `calls` as append-only and add regression tests around multiple notify cycles |
| Staff revoke still feels stale if client-only row removal diverges from server | Medium | Low | Remove row optimistically only after success payload, then run authoritative refresh |
| SMS-only thread viewing exposes transports the operator did not expect | Low | Medium | Explicit drawer mode banner plus tests for read-only and SMS-only cases |

## Architecture Analysis

There is still no canonical architecture document under `docs/architecture/`, so the comparison baseline for this phase is the architecture already implied by `README.md`, `src/mcp-server.ts`, and the existing RFCs such as `docs/rfcs/1-place-in-line.md`, `docs/rfcs/37-waitlist-transparency-chat-table.md`, and `docs/rfcs/69-multi-tenant-sms-voice.md`.

### Patterns Correctly Followed

- Route-module + service-layer separation remains intact:
  - `src/routes/*.ts` own HTTP contracts
  - `src/services/*.ts` own queue/conversation/business rules
- Multi-tenant scoping remains location-first via `/r/:loc/...` routes and `locationId`-keyed Mongo queries.
- Static HTML + vanilla JS remain the UI pattern for host, diner, and admin surfaces.
- Additive Mongo schema evolution is preserved; the design adds optional fields instead of requiring a backfill migration.
- Twilio inbound/outbound handling continues to flow through the existing `src/routes/sms.ts` and `src/services/sms.ts` chokepoints rather than introducing a parallel messaging stack.

### Patterns Missing from Architecture

- **Transport-aware conversation capability resolution**
  - Pattern: conversation visibility is distinct from message transport availability.
  - Why needed: issue #102 exists because the current architecture effectively equates `chat feature enabled` with `conversation exists`.
  - Suggested resolution: when a formal architecture document is created, add a messaging subsection that separates thread storage, SMS delivery, and web-chat capability as three different concerns.
- **Typed user-facing mutation contracts**
  - Pattern: host/admin mutation routes return a stable `{ ok, code, userMessage }` envelope for operational UX.
  - Why needed: the codebase currently mixes silent refreshes and raw `{ error }` payloads, which is exactly what made the reported failures untrustworthy.
  - Suggested resolution: document this as the preferred mutation-response pattern for interactive operator surfaces.
- **Notify-cycle-bound acknowledgement state**
  - Pattern: user acknowledgement state is bound to a specific outbound notify cycle, not modeled as a timeless boolean.
  - Why needed: stale acknowledgement state is a workflow-level concern that belongs in the architecture guidance for queue state transitions.
  - Suggested resolution: capture this as part of the queue-entry lifecycle model in the eventual architecture document.

### Patterns Incorrectly Followed

- None that block this design. The only intentional compromise is route naming: the RFC keeps `/chat` endpoints for backward compatibility even though the domain concept becomes a broader `Messages`/conversation surface. That is naming debt, not an architectural correctness issue for this issue-sized fix.

## Observability (logs, metrics, alerts)

- Count `notify.rejected` by reason so opt-out/no-phone/product-config issues are distinguishable.
- Count `conversation.compose_rejected` so we can see whether operators repeatedly hit read-only threads.
- Track `queue.acknowledge.bound_to_call` and compare it to `notify.sent` volume; a large mismatch indicates diner confusion or delivery issues.
- Track `staff.revoke.rejected` separately from `staff.revoke.completed` to identify permission-shape confusion in the Settings UI.
