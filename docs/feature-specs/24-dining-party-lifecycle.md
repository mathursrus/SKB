# Feature: Full Dining Party Lifecycle

Issue: [#24](https://github.com/mathursrus/SKB/issues/24)
Owner: Claude (agent)

## Customer

The **host operator** -- the person at the front desk who currently loses visibility into a party once they are seated. They need to track dining progress to manage table turnover, improve ETA accuracy, and identify operational bottlenecks through historical data analysis.

## Customer's Desired Outcome

- **Operator**: "After I seat a party, I can still see where they are in their meal -- ordering, eating, paying -- so I know when the table will free up and I can give accurate wait times to the next group. And I can look at historical patterns to improve operations."

## Customer Problem being solved

SKB's current system treats "seated" as a terminal state. Once a party sits down, the host stand goes dark on that party. This creates three real problems:

1. **Inaccurate ETAs**: The configured `avgTurnTimeMinutes` is a guess. Without knowing how long tables are actually occupied (order time + service time + checkout time), the host cannot calibrate wait estimates against reality.
2. **Invisible bottlenecks**: If parties wait 15 minutes after sitting before ordering, or the kitchen takes 30 minutes to deliver, or checkout drags on -- the host has no data to identify and fix the bottleneck.
3. **No capacity signal**: The host cannot see how many tables are close to turning over, so they cannot plan the next seating wave.

This feature extends the party state model past "seated" to track the full dining lifecycle, giving the host end-to-end visibility and enabling data-driven ETA tuning.

## User Experience that will solve the problem

### Extended state model

The party progresses through these states:

```
waiting --> called --> seated --> ordered --> served --> checkout --> departed
                  \-> no_show
```

- **waiting / called / no_show**: Unchanged from today.
- **seated**: Becomes a transitional state (was terminal). Host still clicks "Seated" to move a party from the waitlist; the party now appears in a new "Dining" section.
- **ordered**: Host marks when the party has placed their food order.
- **served**: Host marks when food has been delivered to the table.
- **checkout**: Host marks when the bill has been requested or payment is in progress.
- **departed**: Host marks when the table is cleared and available. This is the new terminal state.

Each transition records a server-side timestamp. States can be skipped (e.g., mark "Departed" directly from "Seated" if the party leaves immediately).

### Host flow — 3-tab layout (host-stand device)

The host page (`/host.html`) gains a tabbed interface with 3 tabs:

**Tab 1: Waiting** (default, matches today's view)
- Ordered list of parties in `waiting` or `called` state with Call/Recall, Seated, No-show buttons.
- Same as the current queue table.

**Tab 2: Seated** (new)
- Table of all currently-dining parties (states: `seated`, `ordered`, `served`, `checkout`).
- Columns: Name, Size, State (color-coded badge), Time in Current State, Total at Table.
- Each row shows the **next logical action** as the primary button:
  - Seated: **Ordered** button (+ Departed shortcut)
  - Ordered: **Served** button (+ Departed shortcut)
  - Served: **Checkout** button (+ Departed shortcut)
  - Checkout: **Departed** button only
- **Click on any row** → expands to show a **timeline detail view**: vertical timeline of all state transitions with timestamps (Joined 5:30 PM → Called 5:38 PM → Seated 5:40 PM → Ordered 5:52 PM → ...). Host can see exactly where time was spent.

**Tab 3: Complete** (new)
- Table of departed + no-show parties for today.
- Columns: Name, Size, Final State, Total Time (join to depart), Wait Time, Table Time.
- **Click on any row** → same timeline detail view showing the full journey.
- Summary row at top: total served, total no-shows, avg wait, avg table occupancy.

**Tab badge counts**: Each tab label shows a count: "Waiting (3)", "Seated (5)", "Complete (12)".

**Top bar**: unchanged + "N dining" counter alongside "N waiting".

### Diner flow — NO CHANGES

The diner status page (`/queue.html`) is **not modified**. Lifecycle tracking is host-only. The diner continues to see position, promised time, and the "called" callout as today. Once seated, the diner page shows "seated" as it does now.

### Analytics page (new)

New host page `/host/analytics.html` (PIN-gated) showing historical distributions:

1. **Wait-time distribution** — histogram of join-to-seated times for all parties, bucketed by 5-min intervals
2. **Table-occupancy distribution** — histogram of seated-to-departed times
3. **Per-phase breakdown** — avg + distribution for each phase (seated→ordered, ordered→served, served→checkout, checkout→departed)
4. **By party size** — all the above metrics sliced by party-size buckets (1-2, 3-4, 5+)
5. **Date range filter** — default "today", with ability to select past 7 / 30 days or custom range
6. **Powered by existing data** — all queries run against `queue_entries` collection using the lifecycle timestamps

### UI mocks

- [`docs/feature-specs/mocks/24-host-dining.html`](./mocks/24-host-dining.html) -- host-stand with 3-tab layout (Waiting/Seated/Complete), click-to-expand timeline detail
- [`docs/feature-specs/mocks/24-analytics.html`](./mocks/24-analytics.html) -- historical analytics page with distributions by phase and party size

### Design Standards Applied

Used the **generic UI baseline** (no project-specific design system configured in `fraim/config.json`). Mocks follow the same visual language as the existing host and diner UIs: same color palette (`--accent: #b45309`, warm stone tones), same font stack (system fonts), same border radius (8-10px for cards and buttons), same minimum tap target (44px). Dining state badges use distinct background colors for at-a-glance differentiation. Mobile-first layout for diner; tablet-landscape table layout for host.

## Functional Requirements (traceable)

| ID | Requirement |
|---|---|
| R1 | System SHALL extend `PartyState` to include `ordered`, `served`, `checkout`, and `departed` states. |
| R2 | Each state transition SHALL record a server-side timestamp in the `QueueEntry` document (`seatedAt`, `orderedAt`, `servedAt`, `checkoutAt`, `departedAt`). |
| R3 | The `seated` state SHALL become transitional; `departed` SHALL be the new terminal state for successfully-dining parties. |
| R4 | Host SHALL advance a party through post-seated states via API calls: `POST /api/host/queue/:id/advance` with body `{ state: "ordered" | "served" | "checkout" | "departed" }`. |
| R5 | System SHALL allow skipping states (e.g., advancing directly from `seated` to `departed`), recording only the timestamps for states actually visited. |
| R6 | Host UI SHALL display a "Dining" section below the waitlist showing all parties in states `seated`, `ordered`, `served`, or `checkout`. |
| R7 | Each dining row SHALL show the party name, size, current state as a color-coded badge, time elapsed in current state, total time at table, and contextual action buttons. |
| R8 | Host UI top bar SHALL display a "N dining" counter alongside the existing "N waiting" counter. |
| R9 | Stats dashboard SHALL compute and display: avg time from seated-to-ordered (Avg Order Time), avg time from ordered-to-served (Avg Serve Time), avg time from checkout-to-departed (Avg Checkout), and avg time from seated-to-departed (Avg Table Occupancy). |
| R10 | Host UI SHALL organize parties into 3 tabs: Waiting (waiting/called), Seated (seated/ordered/served/checkout), Complete (departed/no_show). Each tab label SHALL show a count badge. |
| R10a | Clicking a party row in the Seated or Complete tab SHALL expand a timeline detail view showing all state transitions with timestamps. |
| R10b | A new analytics page (`/host/analytics.html`, PIN-gated) SHALL show historical distributions: wait-time, table-occupancy, per-phase breakdown, all sliceable by party-size bucket (1-2, 3-4, 5+) and date range. |
| R10c | The diner status page SHALL NOT change. Lifecycle tracking is host-only. |
| R11 | The existing waitlist removal flow (Seated / No-show buttons) SHALL continue to work unchanged. Clicking "Seated" transitions the party to `seated` state, sets `seatedAt`, and moves it to the Dining section. |
| R12 | The `removeFromQueue` function SHALL be refactored: "seated" removal sets `state: 'seated'` and `seatedAt` (no longer sets `removedAt` or `removedReason`); "no_show" continues to set `removedAt` and `removedReason`. |
| R13 | `departed` parties SHALL set `removedAt` and `removedReason: 'departed'` for backward compatibility with stats queries. |
| R14 | Existing ETA computation logic (`position * avgTurnTimeMinutes`) SHALL remain unchanged in v1. Auto-tuning based on actual table occupancy is deferred. |

### Acceptance criteria (Given/When/Then)

- **AC-R1/R2**: *Given* a party in `seated` state, *when* the host calls `POST /api/host/queue/:id/advance` with `{ state: "ordered" }`, *then* the party state becomes `ordered` and `orderedAt` is set to the current server time.
- **AC-R5**: *Given* a party in `seated` state, *when* the host calls advance with `{ state: "departed" }`, *then* the party state becomes `departed`, `departedAt` is set, and `orderedAt`/`servedAt`/`checkoutAt` remain null.
- **AC-R6/R7**: *Given* two parties dining (one `seated`, one `served`), *when* the host loads the queue page, *then* the Dining section shows both parties with correct state badges and elapsed times.
- **AC-R9**: *Given* 5 parties that have completed the full lifecycle today, *when* the host views stats, *then* Avg Order Time equals the mean of (orderedAt - seatedAt) across all 5, and Avg Table Occupancy equals the mean of (departedAt - seatedAt).
- **AC-R10**: *Given* the host is on the Seated tab with 2 dining parties, *when* they click a party row, *then* a timeline detail expands showing timestamps for each visited state (e.g., "Joined 5:30 PM → Called 5:38 PM → Seated 5:40 PM → Ordered 5:52 PM").
- **AC-R10b**: *Given* 20 departed parties over the past week, *when* the host opens `/host/analytics.html` with range "7 days", *then* they see a wait-time histogram, a table-occupancy histogram, and per-phase avg/distribution, all filterable by party-size bucket.
- **AC-R11**: *Given* a party in `called` state in the waitlist, *when* the host clicks "Seated", *then* the party disappears from the waitlist table and appears in the Dining section with state `seated`.
- **AC-R12**: *Given* a party in `called` state, *when* the host clicks "No-show", *then* the party is removed with `removedAt` and `removedReason: 'no_show'` (unchanged behavior).

### Edge cases

- **State skip**: Host marks a party as `departed` directly from `seated` (e.g., party changed their mind). Only `seatedAt` and `departedAt` are set; intermediate timestamps remain null.
- **Invalid state advance**: Attempting to advance to a state that is not forward in the lifecycle (e.g., `served` back to `ordered`) returns a 400 error.
- **No-show after seated**: Not supported. Once seated, the party can only advance forward or depart. If a party leaves without eating, use "Departed."
- **End-of-day with dining parties**: Parties still in post-seated states at end-of-day remain in the database as-is. They will not appear in the next day's waitlist or dining view (filtered by `serviceDay`).
- **Multiple state advances in rapid succession**: Each advance is an independent `$set` operation; no race condition because each checks the current state is valid for the requested transition.
- **Backward compatibility**: Existing queries that filter for `state: 'seated'` to count "served parties" in stats must be updated to also count `ordered`, `served`, `checkout`, and `departed` states.

## Compliance Requirements (if applicable)

No formal regulations are configured in `fraim/config.json`. General privacy and operational considerations:

- **No new PII collected**: The lifecycle extension only adds server-side timestamps to existing party records. No additional personal information is gathered.
- **Same data retention**: Lifecycle timestamps follow the same retention policy as existing queue data (auto-archive at end-of-day; no retention beyond 30 days).
- **Host-stand PIN gate**: All new dining management endpoints are behind the existing `requireHost` middleware. No public access to dining state data.
- **Diner visibility**: The diner status page shows only friendly labels ("Seated", "Food served") and timestamps. No internal operational metrics are exposed to diners.

## Validation Plan

- **Manual (browser)**: Join a party via `/queue`, seat them via `/host`, then advance through ordered > served > checkout > departed. Verify the Dining section updates correctly at each step. Check the diner status page shows the timeline. Verify stats update after departures.
- **API (e2e test)**: `POST /api/queue/join` > `POST /api/host/queue/:id/remove` (reason: seated) > `POST /api/host/queue/:id/advance` (state: ordered) > ... > (state: departed). Assert each response returns `{ ok: true }`, state and timestamps are correct in the DB, and stats endpoint returns computed lifecycle metrics.
- **Critical waitlist path test** (per project rule 7): Existing waitlist tests must still pass. New tests covering: seat > advance full lifecycle > verify stats; seat > skip to departed > verify stats; advance with invalid state > 400 error.
- **Compliance validation**: Verify no new PII fields in DB records. Verify all new endpoints require host auth (401 without valid session).
- **Mobile validation**: Open host dining view on a phone-width viewport and verify all buttons remain tappable (44px+) and the dining table is scrollable/readable.

## Alternatives

| Alternative | Why discard? |
|---|---|
| Track only seated-to-departed (two states, not four) | Loses the ability to identify which phase of dining is the bottleneck. The whole point is granularity. |
| Timer-based auto-advance (auto-detect order from POS integration) | Requires POS integration that does not exist. Manual host input is simpler and ships now. POS integration can be layered later. |
| Separate "table management" system | Over-engineered for a single-location restaurant with no table assignment model. Extend the existing queue entry instead. |
| Diner self-reports state (e.g., "I ordered") | Unreliable. The host is the source of truth for operational state. |
| Only add timestamps, no UI changes | Data without visibility is useless. The host needs to see and act on dining state in real time. |

## Competitive Analysis

### Configured Competitors Analysis
No competitors configured in `fraim/config.json`. Section deferred pending `business-plan-creation` or manual entry.

### Additional Competitors Analysis

| Competitor | Current Solution | Strengths | Weaknesses | Customer Feedback | Market Position |
|---|---|---|---|---|---|
| Yelp Guest Manager | Waitlist + table management with Floor Statistics tab tracking table turn times and seating efficiency. POS integrations auto-update table statuses. 92% wait-time quote accuracy. | Strong brand; SMS notifications; real-time floor stats; auto table status via POS integration | No granular course-level lifecycle tracking; turn times are aggregate, not per-phase; monthly fee ($249+/mo) | "Good waitlist but limited visibility into what happens after seating" | Dominant in casual dining waitlist |
| Toast Table Management | Full table lifecycle via integrated POS + KDS. Color-coded course firing on table view. Kitchen Display System separates tickets by course with elapsed-time color coding and countdowns. Interactive floor plans with drag-and-drop. | Deep POS integration; automated course tracking via KDS; real-time analytics; color-coded table status | Requires Toast POS hardware ($0/mo starter but hardware cost $627+); complex onboarding; vendor lock-in | "Great once set up, but onboarding took weeks" (Software Advice) | Growing fast in full-service restaurants |
| SevenRooms | Full dining journey tracking: reserved > seated > eating > dessert > check > clearing > available. AI-powered table management connected to CRM. POS integration for 360-degree guest view. Real-time spend tracking per table. | Most granular lifecycle of any competitor; CRM integration; enterprise-grade; guest journey analytics | Enterprise pricing (custom quotes, not transparent); designed for restaurant groups and hotels; overkill for single-location | "Powerful but expensive and complex for a single restaurant" | Enterprise hospitality (hotels, restaurant groups) |
| Eat App | AI-optimized table management with real-time digital floor plan. Automated table status updates. Analytics on reservations, walk-ins, no-shows. Waitlist management included in free tier. | Free tier available ($0/mo for waitlist + table management); real-time floor plan; AI optimization; 14-day trial | Full features start at $129/mo; limited course-level tracking; designed for reservation-heavy restaurants | "Simple and it works" (G2 reviews) | Mid-market, growing in independent restaurants |
| OpenTable for Restaurants | Reservation + table management; tracks covers and turn times at aggregate level. Strong diner network effect. | Massive diner network; reservation data; brand recognition | No walk-in lifecycle tracking; per-cover fees; focuses on reservations not walk-ins; no course-level tracking | "Works for reservations but walk-ins are a blind spot" | Dominant in reservation-based dining |

### Competitive Positioning Strategy

#### Our Differentiation
- **Key Advantage 1**: Zero-cost, zero-integration lifecycle tracking. No POS hardware required -- the host simply taps a button as each phase completes. Closest competitor (Eat App) charges $129/mo for comparable features; SevenRooms requires enterprise pricing.
- **Key Advantage 2**: Same simple interface the host already knows. The dining section is a natural extension of the existing waitlist, not a separate system requiring onboarding. Toast's course tracking requires KDS hardware and POS integration.
- **Key Advantage 3**: Walk-in-first design. Competitors (OpenTable, SevenRooms) optimize for reservations. SKB is built ground-up for walk-in-heavy restaurants where table turnover visibility matters most.
- **Key Advantage 4**: Historical distribution analytics by party size. Competitors show aggregate averages; SKB shows full distributions so the host can see variance, not just means.

#### Competitive Response Strategy
- **If Toast adds a free tier with table management**: Emphasize zero-hardware, zero-vendor-lock-in. SKB runs on any device with a browser, no proprietary hardware needed.
- **If Yelp adds course-level tracking**: Emphasize data ownership and no monthly fee. SKB owns the data and the customer relationship.
- **If SevenRooms targets single-location restaurants**: Emphasize simplicity and zero cost. SevenRooms' CRM and multi-location features are overhead for a single restaurant.
- **If Eat App adds granular lifecycle tracking to free tier**: Emphasize walk-in-first design and diner-facing timeline as differentiators.

#### Market Positioning
- **Target Segment**: Single-location restaurants with high walk-in volume and 30+ min waits where table turnover is the primary bottleneck.
- **Value Proposition**: "See where every table is in the dining journey. No POS integration, no monthly fee -- just tap and track."
- **Pricing Strategy**: Free for SKB (owned infra). If productized: included in base waitlist product at no extra cost.

### Research Sources
- [Yelp Guest Manager - GetApp](https://www.getapp.com/customer-management-software/a/yelp-guest-manager/) - Features, pricing, reviews (2026)
- [Yelp Guest Manager Product News](https://business.yelp.com/restaurants/products/guest-manager-product-news/) - Latest 2026 features
- [Toast POS Review - The Retail Exec](https://theretailexec.com/tools/toast-review/) - In-depth review (2026)
- [Toast POS - Toolradar](https://toolradar.com/tools/toast-pos) - Pricing and features (2026)
- [SevenRooms Table Management](https://sevenrooms.com/platform/table-management/) - Dining journey tracking features
- [SevenRooms - G2 Reviews](https://www.g2.com/products/sevenrooms/reviews) - Pricing and reviews (2026)
- [Eat App Table Management](https://restaurant.eatapp.co/table-management) - Features and pricing
- [Eat App Pricing](https://restaurant.eatapp.co/pricing) - Current pricing tiers (2026)
- [Restaurant Table Management Software Guide 2026](https://restaurantstables.com/blog/restaurant-table-management-software-guide.html) - Industry overview
- Research date: 2026-04-04
- Research methodology: Web search of competitor product pages, review aggregators (G2, GetApp, Capterra, Software Advice), and industry guides; focused on table lifecycle tracking and course-level dining state management capabilities

## v1 Assumptions

1. **Manual state advance**: The host manually taps buttons to advance dining state. No POS or sensor integration.
2. **No table assignment**: Parties are not mapped to physical table numbers. Table assignment is a separate future feature.
3. **No undo**: State transitions are forward-only in v1. If the host advances by mistake, they can skip to "Departed" and re-seat if needed.
4. **ETA unchanged**: ETA computation remains `position * avgTurnTimeMinutes`. Auto-tuning with actual table occupancy data is a follow-up.
5. **State skip allowed**: The host can advance to any forward state, skipping intermediates. This handles edge cases (party leaves early, comp'd meals, etc.).

## Open Questions

- Should departed parties remain visible in the Dining section for a configurable period (e.g., 5 minutes) to allow the host to confirm the table is cleared, or disappear immediately?
- Should the system warn the host when a party has been in a single state for an unusually long time (e.g., "Ordered 25m ago -- kitchen delay?")?
- Should ETA auto-tuning based on actual `avgTableOccupancy` replace the manual `avgTurnTimeMinutes` setting, or supplement it? (Deferred to follow-up issue.)
- Analytics: should the page support CSV export for external analysis?
