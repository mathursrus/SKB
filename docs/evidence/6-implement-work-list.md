# Implementation Work List: Issue #6 - End-of-Day Operations Dashboard

Issue: [#6](https://github.com/mathursrus/SKB/issues/6)
Branch: `impl/6-eod-stats`
Type: **feature**

## Discovered Patterns

- **Route pattern**: Routes defined in `src/routes/<domain>.ts`, exported as `<domain>Router()` function returning `Router`
- **Service pattern**: Business logic in `src/services/<domain>.ts`, pure helpers exported alongside async DB functions
- **DB access**: `getDb()` singleton, collection accessors like `queueEntries(db)` in `src/core/db/mongo.ts`
- **Auth**: PIN-gated via `requireHost` middleware from `src/middleware/hostAuth.ts`
- **Time utils**: `serviceDay()`, `minutesBetween()`, `addMinutes()` in `src/core/utils/time.ts`
- **Types**: DTOs and domain types in `src/types/queue.ts`
- **Test pattern**: `BaseTestCase` with tags, `runTests()` from `tests/test-utils.ts`; pure helpers tested with simple boolean assertions
- **UI pattern**: Vanilla JS IIFE in `public/<page>.js`, shared `styles.css`, no framework
- **Error handling**: `dbError()` helper returns 503 with structured JSON log
- **Environment**: `MONGODB_URI`, `SKB_COOKIE_SECRET`, `SKB_HOST_PIN` via `process.env`
- **Constants**: `DEFAULT_AVG_TURN_TIME_MINUTES`, `MIN/MAX_AVG_TURN_TIME` in settings service; `ACTIVE_STATES` in queue service

## Implementation Checklist

### Backend

- [x] `src/types/queue.ts` - Add `HostStatsDTO` interface (R1-R6, R9)
- [x] `src/services/stats.ts` - New service file: `getHostStats(now?: Date): Promise<HostStatsDTO>` (R2-R6, R9, R10)
  - Aggregate `queue_entries` by `serviceDay` for seated count, no-show count
  - Compute avg actual wait from `removedAt - joinedAt` for seated entries
  - Compute peak hour from `joinedAt` grouped by hour (PT), earliest-wins on tie
  - Return configured vs actual turn time
  - Defensive: skip entries with missing `removedAt`
- [x] `src/routes/host.ts` - Add `GET /host/stats` route behind `requireHost` (R1)
  - Import and call `getHostStats()`
  - Return JSON matching `HostStatsDTO`

### Frontend

- [x] `public/host.html` - Add collapsible stats card between topbar and queue table (R7)
- [x] `public/host.js` - Fetch `/api/host/stats` on same 5s poll interval, render stats card (R7, R8)
- [x] `public/styles.css` - Add styles for stats card (collapsed/expanded, responsive, mobile-first) (R7)

### Tests

- [x] `tests/stats.test.ts` - Unit tests for pure stats computation helpers (18 tests, all passing)
  - AC-R2/R3: seated/no-show counts
  - AC-R4: avg actual wait calculation
  - AC-R5: peak hour detection
  - AC-R6: configured vs actual turn time
  - AC-R9: empty day returns zeros/nulls
  - AC-R10: tie-breaking on peak hour (earliest wins)
  - Edge: no seated, only no-shows
  - Edge: missing removedAt skipped

### Quality

- [x] TypeScript compilation passes (`npm run typecheck`)
- [x] Existing test suite passes (`npm test`) - 7/7
- [x] New tests pass - 18/18
- [ ] Manual browser validation of stats card

## Validation Requirements

- **uiValidationRequired**: true (new stats card on host page)
- **mobileValidationRequired**: false (host page viewport is 1024px per meta tag, but card should be responsive per project rule 5)
- **browserValidationRequired**: true (verify stats card renders, collapses/expands, refreshes)
- **Evidence artifact**: `docs/evidence/6-ui-polish-validation.md`

## Deferrals / Open Questions

- Historical multi-day stats: deferred to follow-up issue per spec
- Stats card default state: collapsed per spec recommendation
- `actualTurnTime` computation: avg wait per seated party (not time between seatings) per spec

## File Modification Count: 7 files (under 15 threshold)
