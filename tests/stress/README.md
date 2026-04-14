# Waitlist stress test

End-to-end concurrency stress for the SKB waitlist — simulated diners joining,
polling, and terminating while a host loop notifies, seats, no-shows, and
advances parties through the dining lifecycle. All of it running against the
real service layer and a real MongoDB.

This is deliberately a **data-integrity** stress test, not a wire-level load
test. It calls the service functions directly (same functions the HTTP routes
call) so it can spin up hundreds of concurrent actors without fighting the
`/queue/join` IP rate limit, and it runs entirely in-process so it can assert
on the final collection state with no HTTP-layer noise.

## Quick start

```bash
npm run stress
```

Defaults: 200 diners, 75 seconds, MongoDB at `localhost:27017` on a dedicated
`skb_stress_test` database. The stress test creates its own Location
(`stress`) and wipes its own data at the start of each run.

## Heavy run

```bash
npm run stress:heavy
# 500 diners, 120s
```

## Knobs (env vars)

| var | default | what it does |
|---|---|---|
| `STRESS_NUM_DINERS` | `200` | Total simulated diners across the run |
| `STRESS_DURATION_MS` | `75000` | Max run duration in ms (diners stop polling + host loop stops after this) |
| `MONGODB_URI` | `mongodb://localhost:27017` | Point at a different mongo |
| `MONGODB_DB_NAME` | `skb_stress_test` | Override the stress db name (useful if you want to aim at a throwaway per-branch db) |

## What gets exercised

Every tick, each simulated actor performs one of the following operations
against the service layer. Counts below are from a representative 200-diner
run (`npm run stress`):

| op | calls | notes |
|---|---|---|
| `joinQueue` | 200 | staggered over the first third of the run |
| `getStatusByCode` | ~500 | each diner polls 600–1800ms until terminal |
| `listHostQueue` | ~250 | one per host tick |
| `callParty` (notify) | ~115 | 35% chance per waiting row |
| `removeFromQueue(seated)` | ~420 | includes ~265 that hit the **table-conflict** path and 409 |
| `removeFromQueue(no_show)` | ~40 | 7% chance per row |
| `listDiningParties` | ~250 | one per host tick |
| `advanceParty` | ~630 | seated → ordered → served → checkout → departed, 40% chance per row per tick |

## Assertions

After the main loop the script runs hard assertions against the final
collection state:

- **A1** no service errors thrown during the run
- **A2** conservation — every successful join lands in exactly one terminal
  bucket (waiting / dining / completed)
- **A3** queue positions in the still-waiting list are `1..N` with no gaps
  or duplicates
- **A4** `HostStats.totalJoined` matches the op counter for successful joins
- **A5** `HostStats.partiesSeated + noShows <= totalJoined`, and
  `partiesSeated` matches the successful-seat op counter within ±2
- **A6** no two currently-dining parties share a `tableNumber` at the end
  of the run
- **A7** every dining / terminal party has the timestamps its state requires
  (`seatedAt`, `removedAt`, `departedAt`, etc.)
- **A8** no diner landed in `state=not_found` mid-run (would indicate a
  lost document); the diner-join count matches the op counter
- **A9** latency p95 per op is inside the budget table at the top of
  `waitlist-stress.ts`

The script exits `0` on pass, `1` on any assertion failure, `2` on a crash.

## What gets reported

```
Ops:
  joins         : 200
  statusChecks  : 509
  notifies      : 115
  seats         : 158
  seatConflicts : 265
  noShows       : 42
  advances      : 632
  listHost      : 252
  listDining    : 252
  errors        : 0

Latency by op (p50 / p95 / p99 / max):
  advance       : n=  632  p50=    2ms  p95=    3ms  p99=    6ms  max=   12ms
  join          : n=  200  p50=    6ms  p95=   15ms  p99=   20ms  max=   24ms
  list_dining   : n=  252  p50=    2ms  p95=    3ms  p99=    8ms  max=   13ms
  list_host     : n=  252  p50=    5ms  p95=   11ms  p99=   22ms  max=   25ms
  no_show       : n=   42  p50=    1ms  p95=    2ms  p99=    9ms  max=    9ms
  notify        : n=  115  p50=    2ms  p95=    3ms  p99=    4ms  max=    4ms
  seat          : n=  423  p50=    2ms  p95=    5ms  p99=   11ms  max=   28ms
  status        : n=  509  p50=    1ms  p95=    7ms  p99=   18ms  max=   26ms

Final collection state:
  still waiting    : 0
  still dining     : 0
  completed        : 200
  stats.totalJoined: 200
  stats.partiesSeated: 158
  stats.noShows    : 42

Assertions:
  ✓ [PASS] A1 no service errors — 0 errors
  ✓ [PASS] A2 conservation (joins = waiting + dining + complete) — joins=200 buckets=200
  ✓ [PASS] A3 queue positions 1..N (no gaps, no dupes)
  ✓ [PASS] A4 stats.totalJoined == joins op count — stats=200 ops=200
  ✓ [PASS] A5 stats.partiesSeated + noShows <= totalJoined
  ✓ [PASS] A5b stats.partiesSeated >= op counter for seats
  ✓ [PASS] A6 no table-number collisions in currently-dining parties
  ✓ [PASS] A7 no dining/terminal party is missing its required timestamps
  ✓ [PASS] A8 no diner landed in state=not_found mid-run
  ✓ [PASS] A8b diner join count matches report.counts.joins
  ✓ [PASS] A9 p95 latency for advance / join / status / seat / notify under budget

 ✓ ALL ASSERTIONS PASSED
```

## What this does NOT cover (deliberately)

- **HTTP layer.** Routes, auth middleware, rate limiters, and request
  parsing are covered by the integration suite (`npm run test:integration`).
  Stressing them from a single host would just hit the per-IP rate limiters
  and produce a misleading signal.
- **SMS delivery.** Twilio isn't called. Outbound SMS status defaults to
  `not_configured` and notify ops record that status without incurring any
  real-world cost.
- **Chat / custom SMS.** Not wired into the stress loop to keep it focused
  on the core state machine; add if you want. The patterns are identical.
- **Cross-location isolation.** The stress test uses one location
  (`stress`). Multi-tenant isolation is covered by
  `tests/integration/multi-tenant.integration.test.ts`.

## When to run this

- Before a release that touches queue / host / dining services.
- After any change to the state machine or transition logic.
- When you see a production anomaly you want to try to reproduce
  locally.
- As an overnight sanity check with `STRESS_NUM_DINERS=2000 STRESS_DURATION_MS=600000`.
