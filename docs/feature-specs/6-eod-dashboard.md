# Feature Spec: End-of-Day Operations Dashboard

**GitHub Issue:** [#6](https://github.com/mathursrus/SKB/issues/6)
**Status:** Draft
**Date:** 2026-04-04

---

## Customer & Their Problem

The host at Shri Krishna Bhavan has no visibility into daily performance metrics. After a busy service, they cannot answer basic questions: How many parties were served? What was the average wait? How many no-shows occurred? Which hour was the busiest? Without this data, the restaurant cannot make informed staffing decisions, tune the avg turn time setting, or identify operational bottlenecks.

---

## User Experience

1. The host logs into `host.html` using their PIN (existing flow).
2. Below the active queue table, a new **"Today's Stats"** card is visible.
3. The card displays key metrics for the current service day (PT timezone), updating every 5 seconds alongside the existing queue poll.
4. If no queue activity has occurred today, the card shows: **"No activity today yet."**
5. The host can optionally view stats for a past day by navigating to `host.html?date=2026-04-03` (or any `YYYY-MM-DD` value). When a historical date is used, the card header changes to show the selected date and a note that data is read-only.

---

## Functional Requirements

### R1: New API endpoint `GET /api/host/stats`

- **Auth:** Gated behind `requireHost` middleware (same PIN-cookie auth as all host routes).
- **Query param:** Optional `?date=YYYY-MM-DD`. Defaults to today's service day (PT).
- **Response shape:**

```json
{
  "date": "2026-04-04",
  "totalJoined": 42,
  "totalSeated": 35,
  "totalNoShows": 4,
  "currentQueueLength": 3,
  "avgPartySize": 3.2,
  "avgWaitMinutes": 12.4,
  "longestWaitMinutes": 28,
  "peakHour": 18,
  "peakHourLabel": "6 PM",
  "totalCallsMade": 51
}
```

- All time calculations use `removedAt - joinedAt` for completed entries (seated parties only for wait-time metrics).
- `peakHour` is the hour (0-23, PT) with the most `joinedAt` timestamps. `peakHourLabel` is a human-readable form. If there is a tie, pick the earliest hour.
- `currentQueueLength` counts entries with `state` in `['waiting', 'called']` for the given date.
- `avgPartySize` is computed across all entries that joined on the given date (regardless of final state), rounded to one decimal.
- `avgWaitMinutes` and `longestWaitMinutes` are computed only from entries where `removedReason === 'seated'` and both `joinedAt` and `removedAt` exist. Rounded to one decimal and whole number respectively.
- `totalCallsMade` is the sum of the lengths of all `calls[]` arrays across all entries for the given date.
- When no entries exist for the date, all numeric fields are `0` and `peakHour` is `null`, `peakHourLabel` is `null`.

### R2: Stats service function

- New function `getDayStats(date: string): Promise<DayStatsDTO>` in `src/services/queue.ts` (or a new `src/services/stats.ts`).
- Queries `queue_entries` filtered by `serviceDay === date`.
- Uses a single MongoDB aggregation pipeline for efficiency (one round trip).
- Returns the DTO shape above.

### R3: Stats DTO type

- New interface `DayStatsDTO` in `src/types/queue.ts` matching the response shape in R1.

### R4: Route registration

- Add `GET /host/stats` to the existing `hostRouter()` in `src/routes/host.ts`, gated by `requireHost`.
- Parse and validate the optional `date` query param (must match `YYYY-MM-DD` regex; reject with 400 otherwise).
- Default to `serviceDay(new Date())` when no param is provided.

### R5: Host UI stats card

- New section in `host.html` below the `<main>` queue table area: a `<div id="stats-card">` rendered as a `.card` element.
- The card uses a simple grid/flex layout to display the metrics in a scannable format.
- The card header reads **"Today's Stats"** (or **"Stats for {date}"** when viewing a historical date).
- Each metric is displayed as a label-value pair:
  - Parties joined / Seated / No-shows / Still in queue
  - Avg wait / Longest wait
  - Avg party size
  - Peak hour
  - Calls made
- Empty state: when `totalJoined === 0`, show a single line: **"No activity today yet."**

### R6: Auto-refresh

- The stats card refreshes on the same 5-second `setInterval` that polls `/api/host/queue`.
- The `refresh()` function in `host.js` is extended to also `fetch('/api/host/stats')` and update the stats card DOM.
- Both fetches (queue + stats) can run in parallel via `Promise.all`.

### R7: Historical date support

- If the URL contains `?date=YYYY-MM-DD`, pass that date to the stats endpoint.
- The queue table continues to show the live queue (today only) regardless of the date param.
- The stats card header indicates the selected historical date.

---

## Acceptance Criteria

### AC1: Stats appear for a normal day

**Given** the host is logged in and 10 parties have joined today (7 seated, 2 no-shows, 1 still waiting)
**When** the host views the host page
**Then** the stats card shows: totalJoined=10, totalSeated=7, totalNoShows=2, currentQueueLength=1, and computed avg wait, longest wait, peak hour, avg party size, and total calls made.

### AC2: Empty day

**Given** the host is logged in and no parties have joined today
**When** the host views the host page
**Then** the stats card shows "No activity today yet."

### AC3: Auth required

**Given** a user is not logged in
**When** they call `GET /api/host/stats`
**Then** they receive a 401 response.

### AC4: Historical date

**Given** the host is logged in and parties were served on 2026-04-01
**When** the host navigates to `host.html?date=2026-04-01`
**Then** the stats card shows metrics for April 1 with the header "Stats for 2026-04-01".

### AC5: Invalid date param

**Given** the host calls `GET /api/host/stats?date=not-a-date`
**When** the server processes the request
**Then** it returns 400 with `{ "error": "invalid date format", "field": "date" }`.

### AC6: Auto-refresh

**Given** the host is on the host page and a party is seated
**When** 5 seconds elapse
**Then** the stats card updates to reflect the new seated count and recalculated averages without a manual page refresh.

### AC7: Wait time calculation accuracy

**Given** a party joined at 5:00 PM and was seated at 5:15 PM
**When** stats are computed
**Then** that party contributes 15 minutes to the avg wait and is considered for longest wait. No-show parties are excluded from wait-time averages.

---

## Edge Cases

| Case | Expected behavior |
|---|---|
| Party still in queue (no `removedAt`) | Counted in `totalJoined` and `currentQueueLength`; excluded from wait-time calculations |
| Party with `removedReason === 'no_show'` | Counted in `totalNoShows` and `totalJoined`; excluded from avg/longest wait |
| No seated parties but some no-shows | `avgWaitMinutes` = 0, `longestWaitMinutes` = 0 (no denominator for avg) |
| All parties join in the same hour | `peakHour` = that hour |
| Tie for peak hour | Pick the earliest hour |
| `calls[]` is undefined/null on some entries | Treat as empty array (length 0) |
| Future date requested via `?date=` | Return zeros (valid request, just no data) |
| Date in wrong format (e.g., `04-04-2026`) | Return 400 error |
| Midnight boundary: party joins at 11:58 PM PT | `serviceDay` field (already set at join time) determines which day it belongs to; no re-computation needed |

---

## Validation Plan

1. **Unit tests** for `getDayStats()` service function:
   - Seed `queue_entries` with known data; assert each metric matches hand-calculated values.
   - Test empty collection returns all zeros.
   - Test that no-show entries are excluded from wait-time averages.
   - Test peak-hour tie-breaking (earliest wins).

2. **Integration tests** for `GET /api/host/stats`:
   - 401 without auth cookie.
   - 200 with valid cookie, default date.
   - 200 with `?date=YYYY-MM-DD` for a historical date.
   - 400 with malformed date param.

3. **Manual UI verification**:
   - Load `host.html`, confirm stats card renders below queue table.
   - Seat a party, wait 5 seconds, confirm stats update.
   - Visit with `?date=` param for a past day, confirm historical data and header label.
   - Visit on a day with zero activity, confirm empty state message.

---

## Alternatives Considered

1. **Separate page (`/host/stats.html`)** instead of an inline card. Rejected because the host should see stats at a glance without navigating away from the active queue. A separate page would add friction for a small amount of content.

2. **MongoDB aggregation pipeline vs. in-memory calculation**. The aggregation pipeline is preferred because it avoids transferring all raw entries to the application server. For a typical day (under 200 entries), either approach would work, but the pipeline scales better and is a single round trip.

3. **WebSocket/SSE for real-time stats** instead of polling. Rejected for now because the existing queue uses 5-second polling and adding a different transport for stats alone would increase complexity without meaningful UX improvement. Can revisit if the app moves to WebSockets for the queue.

4. **Charting library for peak-hour visualization**. Deferred. The initial version uses a simple label (e.g., "6 PM"). A histogram or sparkline could be added in a follow-up once the data pipeline is proven.
