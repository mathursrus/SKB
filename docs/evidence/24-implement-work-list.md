# Implementation Work List: Issue #24 -- Full Dining Party Lifecycle

Issue: [#24](https://github.com/mathursrus/SKB/issues/24)
Spec: [docs/feature-specs/24-dining-party-lifecycle.md](../feature-specs/24-dining-party-lifecycle.md)
Branch: `impl/24-dining-party-lifecycle`

## Issue Type: Feature

## Discovered Codebase Patterns

### Environment Patterns
- `MONGODB_URI` env var for DB connection (default: `mongodb://localhost:27017`)
- `HOST_PIN` env var for host authentication
- Database name derived from git branch via `determineDatabaseName()`

### Constants & Configuration
- `DEFAULT_AVG_TURN_TIME_MINUTES = 8` in `src/services/settings.ts`
- `ACTIVE_STATES` array in `src/services/queue.ts` defines states counted toward queue position
- `TZ = 'America/Los_Angeles'` in `src/core/utils/time.ts`
- Max party size: 10, code format: `SKB-XXX`

### Architectural Patterns
- **Layers**: Routes (Express handlers) -> Services (business logic) -> Core (DB, utils)
- **Types**: All DTOs and domain types in `src/types/queue.ts`
- **DB**: MongoDB singleton in `src/core/db/mongo.ts`, collection accessors as functions
- **Frontend**: Vanilla JS + HTML, no framework; `public/` directory served statically
- **Testing**: Unit tests in `tests/unit/`, integration tests in `tests/integration/`, e2e in `e2e/`
- **Auth**: Cookie-based PIN auth via `requireHost` middleware
- **Logging**: JSON structured logs to stdout

### Utility Functions
- `serviceDay(date)` -- YYYY-MM-DD in PT
- `minutesBetween(a, b)` -- rounded-down non-negative minutes
- `addMinutes(d, n)` -- date arithmetic
- `computeEtaMinutes(position, avgTurn)` -- ETA calculation
- `positionInList(list, code)` -- 1-based position lookup

## Implementation Checklist

### Phase 1: Types & Domain Model (R1, R2, R3)
- [ ] `src/types/queue.ts` -- Extend `PartyState` to add `'ordered' | 'served' | 'checkout' | 'departed'`
- [ ] `src/types/queue.ts` -- Extend `RemovalReason` to add `'departed'`
- [ ] `src/types/queue.ts` -- Add lifecycle timestamp fields to `QueueEntry`: `seatedAt?`, `orderedAt?`, `servedAt?`, `checkoutAt?`, `departedAt?`
- [ ] `src/types/queue.ts` -- Add `HostDiningPartyDTO` interface (for Seated tab)
- [ ] `src/types/queue.ts` -- Add `HostDiningDTO` interface (list of dining parties)
- [ ] `src/types/queue.ts` -- Add `HostCompletedDTO` interface (for Complete tab)
- [ ] `src/types/queue.ts` -- Add `AdvanceRequestDTO` interface `{ state: string }`
- [ ] `src/types/queue.ts` -- Update `HostStatsDTO` with lifecycle metrics (avgOrderTime, avgServeTime, avgCheckoutTime, avgTableOccupancy)

### Phase 2: Service Layer (R4, R5, R11, R12, R13)
- [ ] `src/services/queue.ts` -- Update `ACTIVE_STATES` to remain `['waiting', 'called']` (no change needed)
- [ ] `src/services/queue.ts` -- Define `DINING_STATES: ['seated', 'ordered', 'served', 'checkout']`
- [ ] `src/services/queue.ts` -- Define `COMPLETED_STATES: ['departed', 'no_show']`
- [ ] `src/services/queue.ts` -- Define `STATE_ORDER` map for valid forward transitions
- [ ] `src/services/queue.ts` -- Refactor `removeFromQueue`: when reason=`seated`, set `state: 'seated'`, `seatedAt`, do NOT set `removedAt`/`removedReason` (R12)
- [ ] `src/services/queue.ts` -- Add `advanceParty(id, targetState, now)` function (R4, R5): validate forward-only transition, set target state + timestamp, if `departed` also set `removedAt`/`removedReason` (R13)
- [ ] `src/services/queue.ts` -- Add `listDiningParties(now)` function: query parties in `DINING_STATES` for today, compute time-in-state and total-table-time
- [ ] `src/services/queue.ts` -- Add `listCompletedParties(now)` function: query parties in `COMPLETED_STATES` for today
- [ ] `src/services/queue.ts` -- Add `getPartyTimeline(id)` function: return all timestamps for a party (R10a)

### Phase 3: Stats Updates (R9)
- [ ] `src/services/stats.ts` -- Update `computeAvgWait` to handle new terminal state (`departed` with `removedReason`)
- [ ] `src/services/stats.ts` -- Add lifecycle phase timing computations: `computeAvgPhaseTime(entries, fromField, toField)`
- [ ] `src/services/stats.ts` -- Update `buildStats` to include lifecycle metrics
- [ ] `src/services/stats.ts` -- Update `getHostStats` to project lifecycle timestamp fields
- [ ] `src/types/queue.ts` -- Ensure `HostStatsDTO` includes: `avgOrderTimeMinutes`, `avgServeTimeMinutes`, `avgCheckoutTimeMinutes`, `avgTableOccupancyMinutes`

### Phase 4: Routes (R4)
- [ ] `src/routes/host.ts` -- Add `POST /host/queue/:id/advance` route (R4): validate state param, call `advanceParty`
- [ ] `src/routes/host.ts` -- Add `GET /host/dining` route: call `listDiningParties`
- [ ] `src/routes/host.ts` -- Add `GET /host/completed` route: call `listCompletedParties`
- [ ] `src/routes/host.ts` -- Add `GET /host/queue/:id/timeline` route: call `getPartyTimeline`

### Phase 5: Host UI -- 3-Tab Layout (R6, R7, R8, R10, R10a)
- [ ] `public/host.html` -- Add tab bar (Waiting / Seated / Complete) with badge counts
- [ ] `public/host.html` -- Add dining counter to top bar ("N dining")
- [ ] `public/host.html` -- Add Seated tab content: dining parties table
- [ ] `public/host.html` -- Add Complete tab content: completed parties table
- [ ] `public/host.js` -- Add tab switching logic
- [ ] `public/host.js` -- Add `refreshDining()` function: fetch `/api/host/dining`, render Seated tab
- [ ] `public/host.js` -- Add `refreshCompleted()` function: fetch `/api/host/completed`, render Complete tab
- [ ] `public/host.js` -- Add advance button handlers (Ordered, Served, Checkout, Departed)
- [ ] `public/host.js` -- Add click-to-expand timeline detail (R10a)
- [ ] `public/host.js` -- Update polling to refresh all tabs
- [ ] `public/styles.css` -- Add tab styles, state badge colors, timeline styles

### Phase 6: Analytics Page (R10b) -- DEFER to follow-up
- [ ] `public/analytics.html` -- Create analytics page (PIN-gated)
- [ ] `public/analytics.js` -- Histogram rendering, date range filter, party-size filter
- [ ] `src/routes/host.ts` -- Add analytics data endpoints
- NOTE: Analytics is a significant standalone feature. Recommend implementing as a follow-up PR to keep this PR focused on the core lifecycle.

### Phase 7: Tests
- [ ] `tests/unit/queue.test.ts` -- Add tests for `advanceParty` (valid transitions, skip states, invalid backward transition)
- [ ] `tests/unit/queue.test.ts` -- Add tests for refactored `removeFromQueue` (seated no longer sets removedAt)
- [ ] `tests/unit/stats.test.ts` -- Add tests for lifecycle phase timing computations
- [ ] `tests/integration/queue.integration.test.ts` -- Add integration tests for full lifecycle flow (join > call > seat > order > serve > checkout > depart)
- [ ] `tests/integration/queue.integration.test.ts` -- Add integration test for state skip (seat > depart)
- [ ] `tests/integration/queue.integration.test.ts` -- Add integration test for invalid state advance (400)
- [ ] `tests/integration/queue.integration.test.ts` -- Add integration test for stats with lifecycle metrics

### Phase 8: DB Index Updates
- [ ] `src/core/db/mongo.ts` -- Add index on `{ serviceDay: 1, state: 1 }` for dining/completed queries (evaluate if existing index suffices)

## File Modification Count: ~15 files
This is within the 15-file threshold. No phase splitting required.

## Known Deferrals / Open Questions
1. **Analytics page (R10b)**: Recommend deferring to a follow-up issue to keep this PR at a manageable scope. The core lifecycle tracking and host UI tabs are the critical path.
2. **ETA auto-tuning (R14)**: Explicitly deferred per spec. ETA remains `position * avgTurnTimeMinutes`.
3. **Table assignment**: Not in scope per spec assumptions.
4. **Undo/rollback**: Forward-only transitions per spec. No undo in v1.
5. **Departed visibility timeout**: Open question from spec -- implement as immediate removal for v1; can add configurable delay later.
6. **Long-state warning**: Open question from spec -- defer to follow-up.

## Validation Requirements

- **uiValidationRequired**: true -- Host UI gains 3-tab layout, dining section, action buttons, timeline detail
- **mobileValidationRequired**: false -- Host UI uses tablet-landscape viewport (`width=1024`); diner page is unchanged (R10c)
- **browserValidationRequired**: true -- Test in Chrome desktop at 1024px+ width
- **testSuiteRequired**: true -- Unit + integration tests must pass; critical waitlist path must stay green (project rule 7)
- **manualApiValidation**: true -- Full lifecycle API flow via curl/browser

### UI Validation Journeys
1. Host seats a party from waitlist -> party moves from Waiting tab to Seated tab
2. Host advances party through ordered > served > checkout > departed -> correct buttons appear at each state, badges update
3. Host clicks party row in Seated tab -> timeline detail expands with timestamps
4. Host views Complete tab -> departed parties show with total time metrics
5. Stats card shows new lifecycle metrics (avg order time, avg table occupancy)
6. Existing waitlist flow (join > call > seat, join > no-show) still works identically

### Evidence Artifact
- `docs/evidence/24-ui-polish-validation.md` -- to be created during validate phase
