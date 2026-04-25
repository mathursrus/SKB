# RFC - Caller Statistics

Issue: #83  
Owner: Codex

**Status:** Ready for review  
**Spec:** [`docs/feature-specs/83-caller-statistics.md`](../feature-specs/83-caller-statistics.md)  
**Spike findings:** [`docs/evidence/83-technical-spike-findings.md`](../evidence/83-technical-spike-findings.md) and [`spike/83-caller-statistics-session-spike.ts`](../../spike/83-caller-statistics-session-spike.ts)

## Customer

Restaurant admins and owners using the Admin workspace to understand whether the IVR phone channel is converting inbound demand into waitlist joins, where callers abandon the flow, and which IVR options callers actually use.

## Customer Problem being solved

The current system can:

- answer inbound calls
- route callers through a structured IVR
- transfer callers to the front desk or catering
- add callers to the waitlist

But it cannot answer the operational questions the owner actually has after service:

- How many callers reached the phone system?
- How many callers chose each IVR option?
- How many callers tried to join but dropped during name, size, or phone confirmation?
- How many calls resolved through self-service information versus human transfer?

Existing queue analytics do not solve this because they only measure parties who already became queue entries. For issue `#83`, we need measurement for callers who never joined.

## User Experience that will solve the problem

### Admin workflow

1. Owner or admin signs into `/r/:loc/admin.html`.
2. In the Dashboard panel, below the current `Service Debrief` and `Lead Times` cards, the page shows a new `Caller Statistics` card group.
3. The default view is `Today`, with quick filters for `7 days` and `30 days`.
4. The first card shows a top-level funnel:
   - inbound calls
   - join intent
   - reached phone confirmation
   - successful waitlist joins
5. The second card shows stage outcomes:
   - dropped before choice
   - dropped during name
   - dropped during size
   - dropped during phone confirmation
   - front desk transfer
   - catering transfer
   - menu only
   - hours only
6. The third card shows first-menu-choice counts for `0`, `1`, `2`, `3`, `4`, and `5` when present.
7. The fourth card shows recent caller outcomes with privacy-minimized rows:
   - time
   - outcome
   - selected path
   - queue code when present
   - masked caller phone suffix only when needed

### Developer workflow

1. `src/routes/voice.ts` records event-scoped session updates through a dedicated service rather than writing directly to Mongo in every handler.
2. `src/routes/host.ts` exposes a new Admin analytics endpoint for caller statistics.
3. `public/admin.js` fetches the caller analytics payload and renders the funnel and stage cards into the existing Admin dashboard pattern.
4. No background worker is introduced for v1. Stale incomplete caller sessions are lazily finalized during analytics reads and optionally during subsequent IVR writes.

## Technical Details

### Architecture choice

Use one MongoDB document per inbound call, keyed by Twilio `CallSid`, and update it with narrow event-level persistence helpers as the call traverses the existing multi-endpoint IVR flow.

This is the simplest viable architecture because it:

- matches the route-per-stage structure already in `src/routes/voice.ts`
- supports both aggregate funnel analytics and recent-call rows
- avoids introducing a second datastore
- avoids background workers or event infrastructure
- remains non-blocking to the live IVR path

### Existing code boundaries

- Presentation / UI:
  - `public/admin.html`
  - `public/admin.js`
  - existing Admin dashboard card patterns
- IVR / API entry points:
  - `src/routes/voice.ts`
  - `src/routes/host.ts`
  - `src/mcp-server.ts`
- Persistence:
  - `src/core/db/mongo.ts`
- Existing analytics patterns:
  - `src/services/stats.ts`
  - `src/services/analytics.ts`
- Validation seam:
  - `tests/integration/voice.integration.test.ts`

### Proposed files

#### New files

- `src/services/voiceCallSessions.ts`
  - event-scoped persistence helpers for caller-session documents
- `src/services/callerStats.ts`
  - read-side aggregation for funnel, option counts, and recent sessions
- `tests/integration/caller-stats.integration.test.ts`
  - focused integration coverage for aggregate analytics and timeout finalization

#### Modified files

- `src/types/queue.ts`
  - add caller-statistics DTO types used by Admin responses
- `src/core/db/mongo.ts`
  - add `voiceCallSessions()` collection accessor
  - add indexes for `callSid`, `(locationId, serviceDay, startedAt)`, and aggregate query paths
- `src/routes/voice.ts`
  - call `voiceCallSessions` service methods at the existing IVR transitions
  - keep analytics writes best-effort so caller experience does not fail closed
- `src/routes/host.ts`
  - add `GET /host/caller-stats`
- `public/admin.html`
  - add one new `Caller Statistics` card group to the dashboard panel
- `public/admin.js`
  - fetch and render caller statistics
- `tests/integration/voice.integration.test.ts`
  - extend current voice coverage to assert session writes for representative paths

### Data model / schema changes

New collection: `voice_call_sessions`

```ts
interface VoiceCallSessionStep {
  at: Date;
  event:
    | 'incoming'
    | 'menu_choice'
    | 'join_intent'
    | 'name_captured'
    | 'size_captured'
    | 'phone_source'
    | 'joined'
    | 'transfer'
    | 'resolved_info'
    | 'auto_finalized';
  detail?: string;
}

type VoiceCallFinalOutcome =
  | 'joined_waitlist'
  | 'dropped_before_choice'
  | 'dropped_during_name'
  | 'dropped_during_size'
  | 'dropped_during_phone_confirmation'
  | 'front_desk_transfer'
  | 'catering_transfer'
  | 'menu_only'
  | 'hours_only'
  | 'join_error';

type VoiceCallCurrentStage =
  | 'incoming'
  | 'menu'
  | 'ask_name'
  | 'ask_size'
  | 'confirm_phone'
  | 'joined'
  | 'resolved';

interface VoiceCallSession {
  callSid: string;
  locationId: string;
  serviceDay: string;
  startedAt: Date;
  lastEventAt: Date;
  endedAt?: Date;
  callerLast4?: string;
  firstMenuChoice?: 'join_waitlist' | 'repeat_wait' | 'menu' | 'hours' | 'front_desk' | 'catering';
  joinIntent?: boolean;
  nameCaptureMode?: 'normal' | 'fallback';
  partySize?: number;
  phoneSource?: 'caller_id' | 'manual';
  queueCode?: string;
  transferReason?: 'front_desk_request' | 'large_party' | 'catering_request';
  currentStage: VoiceCallCurrentStage;
  finalOutcome?: VoiceCallFinalOutcome;
  steps: VoiceCallSessionStep[];
}
```

### Indexes

Add the following indexes in `src/core/db/mongo.ts`:

- `{ callSid: 1 }` unique
- `{ locationId: 1, serviceDay: 1, startedAt: -1 }`
- `{ locationId: 1, serviceDay: 1, finalOutcome: 1, firstMenuChoice: 1 }`
- optional narrow recent-list index:
  - `{ locationId: 1, serviceDay: 1, endedAt: -1 }`

These support:

- idempotent session stitching by `CallSid`
- date-scoped analytics reads
- quick recent-session retrieval
- outcome and first-choice breakdowns

### Persistence service contract

`src/services/voiceCallSessions.ts` should expose narrow helpers rather than one giant update function.

Recommended API:

```ts
recordIncoming(callSid, locationId, at, from?)
recordMenuChoice(callSid, at, choice)
recordJoinIntent(callSid, at)
recordNameCaptured(callSid, at, mode)
recordSizeCaptured(callSid, at, partySize)
recordPhoneSource(callSid, at, source)
recordJoined(callSid, at, queueCode)
recordTransfer(callSid, at, outcome, reason?)
recordResolvedInfo(callSid, at, outcome)
finalizeExpiredSessions(locationId, now)
```

Why this shape:

- the spike showed that naive upserts conflict when the same field is touched through `$setOnInsert` and `$set` / `$push`
- narrow helpers keep each update legal and easy to reason about
- it mirrors the route-level semantics already present in `voice.ts`
- it leaves room to distinguish `front_desk_transfer` caused by an explicit menu choice versus a large-party transfer triggered during size capture

### Finalization strategy

#### Chosen approach

Lazy timeout finalization on read, with optional opportunistic cleanup on write.

Rules:

- terminal outcomes are written immediately for:
  - `joined_waitlist`
  - `front_desk_transfer`
  - `catering_transfer`
  - `menu_only`
  - `hours_only`
  - `join_error`
- incomplete sessions older than `SESSION_TIMEOUT_MS` are finalized from `currentStage`

Mapping:

- `incoming` or `menu` -> `dropped_before_choice`
- `ask_name` -> `dropped_during_name`
- `ask_size` -> `dropped_during_size`
- `confirm_phone` -> `dropped_during_phone_confirmation`

#### Why this is the v1 choice

- no scheduler or background worker exists in the current architecture
- Admin reads are already the point where fresh analytics are required
- this keeps implementation local to the repo's current HTTP + Mongo pattern

### API surface (OpenAPI-style summary)

#### New endpoint

`GET /r/:loc/api/host/caller-stats`

Auth:

- `requireAdmin` is recommended, matching the spec's Admin-only positioning
- if the team wants read access for hosts later, that should be a deliberate follow-up

Query params:

- `range=1|7|30` default `1`

Response:

```ts
interface CallerStatsDTO {
  dateRange: { from: string; to: string };
  funnel: {
    inboundCalls: number;
    joinIntent: number;
    reachedPhoneConfirmation: number;
    joinedWaitlist: number;
  };
  outcomes: Array<{
    key: VoiceCallFinalOutcome;
    count: number;
    share: number;
  }>;
  firstMenuChoices: Array<{
    key: 'join_waitlist' | 'repeat_wait' | 'menu' | 'hours' | 'front_desk' | 'catering';
    count: number;
    share: number;
  }>;
  recentSessions: Array<{
    startedAt: string;
    finalOutcome: VoiceCallFinalOutcome;
    firstMenuChoice?: string;
    queueCode?: string;
    callerLast4?: string;
    nameCaptureMode?: 'normal' | 'fallback';
    phoneSource?: 'caller_id' | 'manual';
    transferReason?: 'front_desk_request' | 'large_party' | 'catering_request';
  }>;
  historicalCoverage: {
    startsAt: string | null;
    hasLegacyGap: boolean;
  };
}
```

Notes:

- `share` is relative to inbound calls in the selected range
- `recentSessions` is privacy-minimized and does not expose full phone values
- `historicalCoverage` supports the rollout-boundary empty-state from the spec
- when a front-desk transfer originated from the large-party rule in `voice.ts`, `transferReason=large_party` preserves that distinction without creating a new top-level funnel outcome

### Aggregation strategy

`src/services/callerStats.ts` should:

1. resolve the selected service-day window from `range`
2. call `finalizeExpiredSessions(locationId, now)` before reading
3. fetch matching session docs
4. derive:
   - funnel counts
   - outcome counts
   - first-menu-choice counts
   - recent rows
5. return a UI-ready DTO so `public/admin.js` stays simple

For v1, in-process aggregation over the selected day window is acceptable because:

- ranges are bounded to `1`, `7`, or `30`
- the product is per-location
- this mirrors the simplicity bias used elsewhere in the codebase

If data volume later proves this expensive, the logic can move to a Mongo aggregation pipeline without changing the route contract.

### UI changes

#### `public/admin.html`

Add a new dashboard card group under the existing dashboard panel:

- `Caller Funnel`
- `Caller Outcomes`
- `First Menu Choices`
- `Recent Caller Outcomes`

This should follow the same accordion/card language already used by:

- `Service Debrief`
- `Lead Times`

#### `public/admin.js`

Add:

- `loadCallerStats()`
- render helpers for funnel, stage chips, stage-detail panel content, option rows, and recent rows
- range synchronization with the existing Admin dashboard controls

Recommendation:

- keep caller-stat filters independent from lead-time stage filters
- reuse the existing `admin-range` style or introduce a sibling range control with the same visual pattern
- derive the selected-stage interpretation copy from a small static mapping keyed by `finalOutcome`, so the API stays focused on factual analytics data
- stack cards to one column on phone-width viewports and let outcome chips wrap rather than forcing horizontal scrolling

### Failure modes & timeouts

- Analytics write failure during IVR:
  - log the error
  - continue serving the caller
  - do not fail the TwiML response
- Analytics read failure in Admin:
  - show localized error state inside the caller-stat card group
  - do not break the rest of Admin
- Missing `CallSid`:
  - derive a fallback synthetic key only if Twilio truly omits it
  - current assumption is Twilio provides `CallSid` for these webhooks
- Session timeout:
  - use a conservative timeout such as `2 minutes`
  - keep it local to the caller-session service as a constant

### Telemetry & analytics

Structured logs to add:

- `voice.session.incoming`
- `voice.session.menu_choice`
- `voice.session.join_intent`
- `voice.session.name_captured`
- `voice.session.size_captured`
- `voice.session.phone_source`
- `voice.session.joined`
- `voice.session.transfer`
- `voice.session.resolved_info`
- `voice.session.auto_finalized`
- `host.caller_stats.read`

Log fields:

- `loc`
- `callSid`
- `outcome`
- `stage`
- `queueCode` when present
- masked caller data only

## Confidence Level

88 / 100

Reasoning:

- the largest uncertainty was resolved by the spike
- the design fits existing code boundaries closely
- the remaining work is straightforward service/route/UI integration
- the main residual risk is correctness of stale-session finalization timing in production-like call patterns

## Validation Plan

| User Scenario | Expected outcome | Validation method |
| --- | --- | --- |
| Caller joins successfully through IVR | Session final outcome is `joined_waitlist` and Admin funnel increments joined count | Integration validation |
| Caller presses `3` and hangs up after menu info | Session final outcome is `menu_only` | Integration validation |
| Caller presses `0` for a human | Session final outcome is `front_desk_transfer` | Integration validation |
| Caller drops after join intent but before name capture completes | Session is auto-finalized as `dropped_during_name` after timeout | Integration + database validation |
| Caller reaches size prompt and disappears | Session is auto-finalized as `dropped_during_size` | Integration + database validation |
| Caller reaches phone confirmation and disappears | Session is auto-finalized as `dropped_during_phone_confirmation` | Integration + database validation |
| Admin opens caller stats for `Today` | Funnel, outcomes, option counts, and recent rows render | UI validation |
| Admin selects a range with no caller sessions | Empty state appears without breaking other dashboard cards | UI validation |
| Analytics persistence fails during IVR | Caller still receives TwiML and normal join behavior continues | Focused route/integration validation |

## Test Matrix

### Unit (as many as needed, mocking ok)

- New `voiceCallSessions` helper tests:
  - derive final outcome from `currentStage`
  - build first-menu-choice mapping
  - finalize-expired selection logic
- New `callerStats` aggregation tests:
  - funnel count derivation
  - outcome share calculation
  - privacy-minimized recent-row mapping
- Existing suites potentially modified:
  - targeted new unit file rather than overloading current stats/analytics tests

### Integration (only mock external services)

- Extend `tests/integration/voice.integration.test.ts` to assert session writes for:
  - successful join
  - menu-only resolution
  - front-desk transfer
  - manual-phone branch
- Add `tests/integration/caller-stats.integration.test.ts`:
  - seed session documents
  - run timeout finalization through the read path
  - assert `GET /host/caller-stats` payload
- Continue mocking Twilio by using the existing unsigned-request local test path

### E2E (1 at most, no mocking)

- None required for the design itself
- If implementation reaches real external IVR validation later, one manual or prod-validation call-flow check is enough

## Risks & Mitigations

### Risk 1: timeout finalization misclassifies real-world abandoned calls

Mitigation:

- keep the timeout conservative
- derive outcome strictly from the last known stage
- log auto-finalization events for easy inspection
- keep the mapping explicit and covered by integration tests

### Risk 2: analytics writes degrade live IVR performance

Mitigation:

- use narrow, single-document Mongo updates
- treat analytics writes as best-effort
- never block or fail the caller-facing TwiML response on analytics persistence

### Risk 3: route-level instrumentation becomes duplicated and brittle

Mitigation:

- centralize persistence helpers in `voiceCallSessions.ts`
- call named helpers from route transitions rather than writing inline Mongo updates

### Risk 4: Admin dashboard complexity grows and becomes cluttered

Mitigation:

- keep caller statistics as one card group in the existing dashboard panel
- reuse current Admin visual and state-loading patterns
- avoid introducing another top-level Admin tab for v1

### Risk 5: historical data appears incomplete after rollout

Mitigation:

- surface `historicalCoverage` in the endpoint
- show rollout-boundary explanatory copy in the UI
- do not imply that pre-rollout IVR traffic was measured

## Spike Findings (if applicable)

### What Was Spiked

- Mongo-backed caller-session persistence keyed by `CallSid`
- stage-event appends across a multi-endpoint IVR flow
- timeout-based auto-finalization for abandoned sessions
- direct aggregation from one session collection

### Findings

- One Mongo document per inbound call is sufficient for the required funnel model.
- Stage-specific timeout finalization works cleanly for:
  - `dropped_during_name`
  - `dropped_during_size`
  - `dropped_during_phone_confirmation`
- One collection supports both aggregate analytics and recent-call rows.
- Mongo update shape matters:
  - a single update cannot safely touch the same field through `$setOnInsert` and `$set` / `$push`
  - production code should use narrow event helpers, not one generic "update everything" call

### Design Impact

- Use a dedicated `voiceCallSessions` service with event-scoped methods.
- Keep finalization lazy in the read path instead of adding a scheduler.
- Keep the route integration additive and best-effort.
- Keep the Admin route contract UI-ready so frontend work stays simple.

## Architecture Analysis

Project note: no project-specific architecture document is currently configured in `fraim/config.json`, so this analysis compares the RFC against the repo's existing codebase patterns and generic architecture standards.

### Patterns Correctly Followed

- **Route -> service -> persistence separation**
  - The RFC keeps HTTP concerns in `src/routes/voice.ts` and `src/routes/host.ts`, business logic in new services, and Mongo details in `src/core/db/mongo.ts`.
- **MongoDB as system of record**
  - The RFC extends the existing Mongo-backed architecture rather than introducing Redis, Postgres, or a dedicated analytics backend.
- **Admin surface extension instead of a parallel UI**
  - The RFC adds caller statistics to the existing Admin dashboard pattern in `public/admin.html` and `public/admin.js`.
- **Best-effort side-effect handling**
  - The current codebase already treats outbound/adjacent operations defensively. The RFC matches that by making caller-session persistence non-blocking to the IVR response path.
- **Bounded per-location analytics**
  - Existing analytics are location-scoped and range-bounded. The RFC follows the same shape.

### Patterns Missing from Architecture

- **Per-call session analytics collection**
  - Pattern: one durable document per Twilio `CallSid` with event-scoped updates.
  - Why needed: queue-entry analytics cannot represent callers who never joined, but the feature requires full funnel visibility.
  - Suggested resolution: add this pattern to the future architecture document as the standard approach for voice-funnel analytics.
- **Lazy timeout finalization on read**
  - Pattern: stale incomplete sessions finalize in the analytics read path instead of through a worker.
  - Why needed: the current runtime has no scheduler/background-worker architecture, and the spike proved this simpler pattern is viable.
  - Suggested resolution: document "read-path finalization for bounded operational analytics" as an allowed pattern when background infrastructure does not exist.
- **Event-scoped persistence helpers for multi-endpoint flows**
  - Pattern: small dedicated service methods such as `recordMenuChoice` and `recordJoined`.
  - Why needed: the spike showed Mongo update-shape constraints make one giant generic update function brittle.
  - Suggested resolution: add this as a preferred pattern for route-driven state machines in the architecture document.

### Patterns Incorrectly Followed

- **None identified that block the design**
  - The RFC stays aligned with the repo's current route, service, Admin UI, and Mongo patterns.
  - The main gap is missing formal architecture documentation, not a design-level violation of an existing documented rule.

## Observability (logs, metrics, alerts)

### Logs

- Add structured logs for:
  - caller-session writes
  - auto-finalization
  - caller-stats reads
  - analytics-write failures

### Metrics

If metrics are later added, the first useful counters are:

- inbound calls per location / day
- successful waitlist joins via IVR
- drop-off counts by stage
- transfer counts by type
- auto-finalized session count

### Alerts

No new alerting is required for v1. If the team later observes IVR volume materially affecting operations, a simple log-based alert on repeated `voice.session.*` persistence failures would be the first alert worth adding.
