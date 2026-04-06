# Feature: End-of-Day Operations Dashboard

Issue: [#6](https://github.com/mathursrus/SKB/issues/6)
Owner: Claude (agent)

## Customer

**Host operator** -- the person at the front desk managing throughput at Shri Krishna Bhavan. They manage the waitlist all day but currently have no way to see how the day went: how many parties were served, how many no-showed, what the actual wait times were, or when the rush hit hardest.

## Customer's Desired Outcome

- **Operator**: "At a glance I can see today's numbers -- how many we served, how many we lost, whether my turn-time setting is accurate, and when my peak was -- so I can staff better and tune the queue."

## Customer Problem being solved

The host adjusts `avg_turn_time_minutes` based on gut feeling. Without concrete data:
- They have no idea how many parties they actually served vs. lost to no-shows.
- They cannot tell whether their configured turn-time matches reality, leading to over- or under-promising ETAs.
- They cannot identify peak hours to plan staffing or prep.
- End-of-shift handoff has no numbers to share -- everything is anecdotal.

This feature gives the host a real-time stats dashboard built entirely from data that already exists in `queue_entries`.

## User Experience that will solve the problem

### Stats card on the existing host page

The dashboard appears as a collapsible stats card at the top of the host queue view (`/host`), between the top bar and the queue table. This avoids a separate page and keeps the host in their primary workflow.

1. After logging in with the device PIN, the host sees the queue table as today.
2. Above the table, a new **Today's Stats** card is visible, collapsed by default.
3. The host taps/clicks the card header to expand it and sees:
   - **Parties Served** -- count of entries removed as `seated` today.
   - **No-Shows** -- count of entries removed as `no_show` today.
   - **Avg Actual Wait** -- mean of `(removedAt - joinedAt)` in minutes for seated parties.
   - **Peak Hour** -- the clock hour (in PT) with the most `joinedAt` entries (e.g., "12 PM").
   - **Turn Time: Set vs. Actual** -- the configured `avgTurnTimeMinutes` side-by-side with the computed average from today's seated data, so the host can see if their setting is accurate.
4. The stats refresh alongside the queue poll (every 5 seconds) so numbers stay current throughout the day.
5. If no parties have been processed yet, the card shows "No data yet" with zeroed counters.

### UI mocks
- [`docs/feature-specs/mocks/6-host-stats.html`](./mocks/6-host-stats.html) -- host-stand stats card on the queue view

### Design Standards Applied
Used the **generic UI baseline** (no project-specific design system configured in `fraim/config.json`). The stats card uses the existing SKB host palette: stone background (`#f5f5f4`), white cards with `1px solid #eaeaea` border, `border-radius: 12px`, Fira Sans typography, gold accent (`#e3bf3d`) for highlights, and minimum 44px tap targets. The card is responsive and usable on a phone in portrait orientation per project rule 5.

## Functional Requirements (traceable)

| ID | Requirement |
|---|---|
| R1 | System SHALL expose a `GET /api/host/stats` endpoint gated by the existing host PIN authentication (requireHost middleware). |
| R2 | The stats response SHALL include `partiesSeated`: count of queue entries with `removedReason = 'seated'` for today's `serviceDay`. |
| R3 | The stats response SHALL include `noShows`: count of queue entries with `removedReason = 'no_show'` for today's `serviceDay`. |
| R4 | The stats response SHALL include `avgActualWaitMinutes`: arithmetic mean of `(removedAt - joinedAt)` in minutes for entries with `removedReason = 'seated'` for today's `serviceDay`. |
| R5 | The stats response SHALL include `peakHour`: the clock hour (0-23, PT) with the highest count of `joinedAt` timestamps for today's `serviceDay`, or `null` if no entries exist. |
| R6 | The stats response SHALL include `configuredTurnTime`: the current `avgTurnTimeMinutes` setting, and `actualTurnTime`: the computed average from today's seated data (or `null` if no seated entries). |
| R7 | The host UI SHALL display a collapsible stats card above the queue table showing all metrics from R2-R6. |
| R8 | The stats card SHALL refresh on the same 5-second polling interval as the queue table. |
| R9 | When no parties have been processed today, all counts SHALL be `0`, averages SHALL be `null`, and `peakHour` SHALL be `null`. |
| R10 | When multiple hours tie for most joins, the system SHALL return the earliest hour. |

### Acceptance criteria (Given/When/Then)

- **AC-R1**: *Given* the host is not authenticated, *when* they request `GET /api/host/stats`, *then* the server responds with `401 Unauthorized`.
- **AC-R2/R3**: *Given* 5 parties joined today, 3 removed as `seated`, 1 as `no_show`, 1 still waiting, *when* the host views stats, *then* `partiesSeated = 3` and `noShows = 1`.
- **AC-R4**: *Given* 3 seated parties with actual waits of 10m, 14m, and 12m, *when* the host views stats, *then* `avgActualWaitMinutes = 12`.
- **AC-R5**: *Given* 2 parties joined at 11:xx AM, 3 at 12:xx PM, 1 at 1:xx PM, *when* the host views stats, *then* `peakHour = 12`.
- **AC-R6**: *Given* the configured turn time is 8 minutes and today's 3 seated parties averaged 12 minutes actual wait, *when* the host views stats, *then* `configuredTurnTime = 8` and `actualTurnTime = 12`.
- **AC-R9**: *Given* no parties have been processed today, *when* the host views stats, *then* all counts are 0 and averages are `null`.
- **AC-R10**: *Given* hour 11 and hour 14 both have 3 joins (the max), *when* the host views stats, *then* `peakHour = 11`.

### Edge cases
- No parties processed yet today -- all counts `0`, averages `null`, peak hour `null`. UI shows "No data yet."
- Parties still in `waiting` or `called` state -- they do not count toward seated, no-show, or avg wait calculations.
- Only no-shows, zero seated -- `partiesSeated = 0`, `avgActualWaitMinutes = null`, `actualTurnTime = null`. No-show count is accurate.
- A party removed as `seated` but with `removedAt` missing (should not happen, but defensively) -- skip from average calculation.
- Only one seated party -- avg wait equals that single party's wait time.
- Stats requested just after midnight but before new service day data -- returns zeros for the new service day.

## API Response Shape

```typescript
interface HostStatsDTO {
    partiesSeated: number;
    noShows: number;
    avgActualWaitMinutes: number | null;
    peakHour: number | null;          // 0-23, PT
    peakHourLabel: string | null;     // e.g., "12 PM"
    configuredTurnTime: number;       // current avgTurnTimeMinutes setting
    actualTurnTime: number | null;    // computed from today's seated data
    totalJoined: number;              // total entries for today (all states)
    stillWaiting: number;             // entries still in waiting/called state
}
```

## Compliance Requirements (if applicable)

No formal compliance regulations are configured in `fraim/config.json`. Privacy considerations inferred from project context:
- The stats endpoint returns only **aggregate counts and averages** -- no PII (names, phone digits, or individual entry data) is exposed.
- The endpoint is PIN-gated via the existing `requireHost` middleware, preventing unauthorized access.
- No new PII is collected or stored by this feature.

If SKB later configures compliance regulations (e.g., SOC2), this endpoint's aggregation-only nature should satisfy audit requirements for operational dashboards.

## Validation Plan

- **Manual (browser)**: Log in to `/host`, expand the stats card, verify counts match the queue entries visible in the table. Seat a party, refresh, confirm `partiesSeated` increments and avg wait updates.
- **API (curl/test)**: Hit `GET /api/host/stats` with valid auth cookie; assert JSON shape matches `HostStatsDTO`. Hit without auth; assert `401`.
- **Edge case (empty day)**: Clear all entries or test on a fresh service day; confirm all zeros and nulls render as "No data yet."
- **Critical waitlist path test** (per project rule 7): This feature reads waitlist data but does not modify it. However, integration tests should verify that seating/no-show removal correctly updates the stats aggregation.
- **Compliance validation**: Assert that the stats response contains no PII fields (no `name`, `phoneLast4`, or `code` values). Assert PIN gate returns 401 for unauthenticated requests.

## Alternatives

| Alternative | Why discard? |
|---|---|
| Separate `/host/stats.html` page | Adds navigation friction; host must leave the queue view to check stats. A collapsible card keeps them in context. |
| Third-party analytics (Google Analytics, Mixpanel) | Violates the no-third-party-analytics principle from spec #1; adds vendor dependency for simple counts that MongoDB can compute. |
| CSV export of raw queue data | Useful later, but does not solve the "at a glance" problem. The host needs instant visual feedback, not a spreadsheet. |
| Historical multi-day dashboard | Valuable extension, but scope-creeps a Small-effort issue. Today-only stats deliver immediate value; history can be a follow-up issue. |
| Stats computed client-side from queue data | Requires fetching all removed entries to the browser; increases payload size and couples UI logic to DB schema. Server-side aggregation is cleaner. |

## Competitive Analysis

### Configured Competitors Analysis
No competitors configured in `fraim/config.json`. Section deferred pending `business-plan-creation` or manual entry.

### Additional Competitors Analysis

| Competitor | Current Solution | Strengths | Weaknesses | Customer Feedback | Market Position |
|---|---|---|---|---|---|
| Yelp Guest Manager | Full analytics dashboard: covers by source, waitlist statistics, floor statistics, waitlist analysis, guest ratings, traffic attribution by day/hour. Multi-location reporting. AI-powered guest survey summaries. | Comprehensive; multi-day trends; traffic attribution by source/time/day; multi-location comparison; AI survey analysis | Locked behind SaaS subscription (~$300+/mo); data stays in Yelp's platform; overkill for single-location; requires Yelp ecosystem buy-in | "Analytics are great but I'm paying $300/mo for features I don't use" (G2 reviews) | Dominant in casual dining |
| Waitly | Basic end-of-day summary: served count, avg wait, no-show count | Simple; included in free tier | No peak-hour analysis; no turn-time comparison; no real-time mid-day view | "Good enough but I wish I could see when my rush is" | Mid-market indie restaurants |
| NextMe | Daily, weekly, and monthly reports on wait times and served counts | Reports available at multiple time scales | Thin customer-facing UX; no turn-time accuracy signal; SMS TCPA overhead | "I use a spreadsheet for everything else" | Small US restaurants |
| Paper list (status quo) | Host counts manually at end of shift, if at all | Zero cost | Inaccurate; time-consuming; no averages or peak data | "I know we were busy but I can't tell you exactly how busy" | Vast majority of small independents |

### Competitive Positioning Strategy

#### Our Differentiation
- **Key Advantage 1**: Real-time stats during service, not just end-of-day -- the host can adjust turn-time mid-shift based on actual data.
- **Key Advantage 2**: Turn-time comparison (configured vs. actual) is a unique signal that no competitor surfaces this simply -- it directly answers "is my ETA setting accurate?"
- **Key Advantage 3**: Zero additional cost or vendor dependency -- built on existing MongoDB data with no third-party analytics.

#### Competitive Response Strategy
- **If Yelp adds free-tier analytics**: Emphasize data ownership and real-time mid-service visibility; Yelp analytics are retrospective and vendor-locked.
- **If Waitly adds peak-hour analysis**: Differentiate on the turn-time accuracy signal and the integrated in-context card (no page switch).

#### Market Positioning
- **Target Segment**: Single-location independent restaurants already using the SKB waitlist.
- **Value Proposition**: "See your day's numbers at a glance, right where you manage the line -- no extra tool, no extra cost."
- **Pricing Strategy**: Included free as part of the SKB waitlist system.

### Research Sources
- Yelp Guest Manager product page and dashboard documentation ([business.yelp.com](https://business.yelp.com/restaurants/products/guest-manager-product-news/), [biz.yelp.com support](https://biz.yelp.com/support-center/article/What-are-the-different-options-located-under-the-Dashboard-tab-in-Yelp-Guest-Manager)), 2026-04-04
- Yelp Guest Manager reviews on G2 ([g2.com](https://www.g2.com/products/yelp-guest-manager/reviews)) and GetApp ([getapp.com](https://www.getapp.com/customer-management-software/a/yelp-guest-manager/)), 2026-04-04
- Waitly product page (waitly.com), 2026-04-04
- NextMe product page (nextmeapp.com), 2026-04-04
- Industry overview: restaurant waitlist analytics best practices ([waitq.app](https://waitq.app/blog/best-practices-restaurant-waitlist-management), [xenia.team](https://www.xenia.team/articles/restaurant-analytics-software)), 2026-04-04
- Research methodology: web search for competitor analytics features, vendor site review, user review analysis on G2/GetApp

## Open Questions

1. Should the stats card be expanded by default or collapsed? (Proposed: collapsed, so it does not distract from the primary queue-management task.)
2. Should historical stats (previous days) be accessible? (Proposed: defer to a follow-up issue to keep this Small-effort.)
3. Should the `actualTurnTime` be computed as avg wait for seated parties, or avg time between successive seatings? (Proposed: avg wait per seated party, as it directly compares to the configured turn-time promise.)
