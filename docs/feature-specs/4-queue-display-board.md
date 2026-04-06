# Feature: Queue Display Board for Restaurant TV

Issue: [#4](https://github.com/mathursrus/SKB/issues/4)
Owner: Claude (agent)

## Customer

Two customers:

1. **Waiting diner** -- standing outside or sitting nearby Shri Krishna Bhavan, anxious about whether their turn is coming, repeatedly checking their phone or asking the host.
2. **Host operator** -- fielding constant "is it my turn?" interruptions from diners, which slows down seating throughput and adds stress during peak hours.

## Customer's Desired Outcome

- **Diner**: "I can glance at the TV and see exactly where I am in line without checking my phone or bothering the host."
- **Operator**: "Fewer interruptions from diners asking about their place in line, so I can focus on seating parties and managing the queue."

## Customer Problem being solved

SKB's existing Place-in-Line system (issue #1) lets diners check their status on their phone. But in practice:
- Diners who joined the queue still walk up to the host to ask "is it my turn?" because refreshing a phone page feels uncertain.
- Diners sitting outside or in the parking lot cannot easily see when their code is called.
- The host is interrupted repeatedly, slowing down seating throughput -- the exact bottleneck SKB needs to eliminate.

A visible, always-on TV board gives everyone a shared, passive source of truth. Diners see their code and status at a glance. The host stops fielding status questions.

## User Experience that will solve the problem

### Board display (wall-mounted TV, no interaction)

1. Restaurant mounts a TV near the entrance or waiting area, pointed at the browser page `/board`.
2. The page loads automatically and shows the SKB branding header with the restaurant name.
3. Below the header, a summary bar shows the total number of parties currently waiting.
4. The main content area displays a grid/list of all active queue entries:
   - **Position number** (sequential: 1, 2, 3, ...)
   - **Party code** (e.g. `SKB-7Q3`) -- the opaque identifier diners received when joining
   - **Status**: `Waiting` or `Called`
5. Rows where status is `Called` are visually highlighted with the gold accent color to draw attention.
6. The page auto-refreshes every 5 seconds by polling `GET /api/queue/board`. No manual interaction is needed.
7. When the queue is empty, the board shows a friendly message: "No parties waiting -- walk right in!"
8. If a network error occurs during refresh, the board retains the last-known data silently (no error dialogs on a TV).

### New API endpoint

- `GET /api/queue/board` -- public, no authentication required.
- Returns an array of objects: `{ position, code, state }` for all active (waiting + called) parties on the current service day, ordered by join time.
- No PII is exposed: no names, no phone digits, no party size, no timestamps.

### UI mocks

- [`docs/feature-specs/mocks/4-board.html`](./mocks/4-board.html) -- TV board display (landscape, high contrast, large text)

### Design Standards Applied

Used the **generic UI baseline** with the existing SKB brand palette:
- Black (`#000`) background for the header, white/light background for the board body
- Gold accent (`#e3bf3d`) for the Called status highlight
- Fira Sans typography, scaled up significantly for TV readability at 3-5 meter viewing distance
- Landscape-optimized layout with a multi-column grid for larger queues
- Minimum 36px for party codes, 24px for status labels
- No interactive elements (read-only display)

## Functional Requirements (traceable)

| ID | Requirement |
|---|---|
| R1 | System SHALL expose a public endpoint `GET /api/queue/board` that returns an array of active queue entries containing only `position` (number), `code` (string), and `state` (string: "waiting" or "called"). |
| R2 | The `/api/queue/board` endpoint SHALL NOT include party names, phone digits, party size, join time, ETA, or any other PII in its response. |
| R3 | The endpoint SHALL filter results to the current service day and active states (`waiting`, `called`) only, ordered by `joinedAt` ascending. |
| R4 | System SHALL serve a read-only page at `/board` that renders the queue board, optimized for wall-mounted TV display. |
| R5 | The board page SHALL auto-refresh by polling `GET /api/queue/board` every 5 seconds without any user interaction. |
| R6 | Each entry on the board SHALL display: a sequential position number, the party's opaque code, and current status (Waiting / Called). |
| R7 | When a party's state is `called`, the board SHALL visually distinguish that row with the gold accent highlight to draw attention. |
| R8 | The board SHALL display a friendly empty-state message when no parties are in the queue. |
| R9 | The board page SHALL require no authentication, login, or user interaction beyond initial page load. |
| R10 | The board page SHALL be readable on a 1080p TV at a viewing distance of 3-5 meters, with minimum text size of 36px for codes and 24px for status labels. |
| R11 | The auto-refresh SHALL NOT cause visible flicker or layout shift when data has not changed. |
| R12 | On network failure during auto-refresh, the board SHALL retain the last-known data without displaying errors. |

### Acceptance Criteria (Given/When/Then)

- **AC-R1**: *Given* 3 parties in queue (2 waiting, 1 called), *when* `GET /api/queue/board` is called, *then* response contains exactly 3 entries each with only `position`, `code`, and `state` fields.
- **AC-R2**: *Given* parties with names and phone data in the queue, *when* `/api/queue/board` responds, *then* no `name`, `phoneLast4`, `partySize`, `joinedAt`, or `etaAt` fields are present in the response.
- **AC-R3**: *Given* parties from today and a stale entry from yesterday, *when* `/api/queue/board` is called, *then* only today's active parties are returned.
- **AC-R5**: *Given* the board page is open, *when* 5 seconds elapse, *then* the page fetches fresh data and updates the display without a full page reload.
- **AC-R7**: *Given* party `SKB-7Q3` changes from waiting to called, *when* the board refreshes, *then* that row is visually highlighted with the gold accent background.
- **AC-R8**: *Given* an empty queue, *when* the board page loads, *then* a friendly message "No parties waiting -- walk right in!" is displayed.
- **AC-R11**: *Given* the queue has not changed between two refresh cycles, *when* the board auto-refreshes, *then* no visible flicker or layout shift occurs.
- **AC-R12**: *Given* the server is temporarily unreachable, *when* the board attempts to refresh, *then* the last-known data remains displayed and no error is shown.

### Edge Cases

- **Empty queue**: Board shows the friendly empty-state message, not a blank screen.
- **Large queue (20+ parties)**: Board uses a multi-column grid layout and/or auto-scrolling to keep all entries visible on a single TV screen.
- **Network failure during auto-refresh**: Board retains last-known data silently; resumes updating when connectivity returns.
- **Service day rollover**: Board clears automatically as stale entries from the previous day are filtered out by the `serviceDay` query.
- **Rapid state changes**: Multiple parties called in quick succession -- board reflects all changes on the next 5-second poll.

## Compliance Requirements (if applicable)

No formal regulations are configured in `fraim/config.json`. Privacy best-practices inferred from project context:

- The board endpoint exposes **only opaque, short-lived party codes and state** -- no names, phone digits, or any PII. This is privacy-safe by design.
- Codes are meaningless outside the current service day and cannot be used to identify individuals.
- No authentication is required because the data is intentionally public and non-sensitive.
- No third-party analytics or tracking on the board page.
- Consistent with the privacy approach established in the Place-in-Line spec (issue #1).

## Validation Plan

- **Manual (browser)**: Open `/board` in a browser window set to 1920x1080 resolution. Join several parties via `/queue`. Verify codes appear on the board. Have the host call and seat parties via `/host`. Confirm the board updates within 5 seconds, called parties are highlighted, and removed parties disappear.
- **Empty state**: Clear all parties and verify the empty-state message displays correctly.
- **TV simulation**: Open `/board` on an actual TV or large monitor. Verify text is readable from 3-5 meters away.
- **API (integration test)**: Call `GET /api/queue/board` with known queue state. Assert response contains only `position`, `code`, `state` fields. Assert no PII fields are present. Assert ordering matches `joinedAt` ascending. Assert service-day filtering excludes stale entries.
- **Network resilience**: Open the board, then stop the server. Confirm the board retains last-known data. Restart server and confirm the board resumes updating.
- **Critical waitlist path test** (per project rule 7): Since this feature reads from the waitlist but does not modify it, existing waitlist tests remain valid. New tests should cover the board endpoint's filtering and projection logic.
- **Compliance validation**: Assert that `/api/queue/board` response schema contains no PII fields. Verify no analytics scripts are loaded on the board page.

## Alternatives

| Alternative | Why discard? |
|---|---|
| Diners check their phone only (status quo with issue #1) | Works, but diners still interrupt the host out of anxiety; no passive, shared visibility. |
| WebSocket / Server-Sent Events for real-time push | Adds complexity (connection management, reconnection logic) for marginal gain -- 5-second polling is simple and sufficient for a queue that changes every few minutes. |
| Show full party names on the TV board | Privacy concern -- names are PII. Opaque codes are sufficient for diners to identify themselves. |
| Show ETA / wait time on the TV board | Adds clutter and anxiety (comparing ETAs). The board's purpose is simple status: where am I, and have I been called? Diners can check their phone for detailed ETA. |
| Digital signage SaaS (e.g. ScreenCloud, OptiSigns) | Overkill for a single data feed; adds vendor dependency and monthly cost for what is a simple auto-refreshing web page. |

## Competitive Analysis

### Configured Competitors Analysis

No competitors configured in `fraim/config.json`. Section deferred pending `business-plan-creation` or manual entry.

### Additional Competitors Analysis

| Competitor | Current Solution | Strengths | Weaknesses | Customer Feedback | Market Position |
|---|---|---|---|---|---|
| Yelp Waitlist (Guest Manager) | Host iPad app with kiosk mode for guest self-check-in; real-time waitlist status pushed to guest iPhone lock screens. No dedicated TV board mode. | Deep Yelp ecosystem integration; brand reach; SMS + push notifications; kiosk self-check-in | Requires Yelp subscription (pricing not public); no standalone TV display feature; shows guest names (privacy concern); diners need Yelp app for push updates | "Convenient, but I hate being forced into another app" ([Capterra, 2026](https://www.capterra.com/p/130358/Yelp-Reservations/)) | Dominant in casual dining waitlist |
| WaitQ | Digital waitlist with QR code join, public display screen, and SMS notifications. Display runs on any device (TV, tablet, phone). | Purpose-built for walk-ins; public display screen included; QR join; no hardware required; multi-location ($17/mo for 5 locations) | Newer entrant, smaller install base; SMS notifications require $45/mo plan; limited integrations vs. full-stack POS solutions | "Does one job and does it well" ([waitq.app, 2026](https://waitq.app/)) | Emerging challenger focused on walk-in restaurants |
| Waitly | Web-based waitlist with SMS notifications and online reservations. | Simple, affordable, fast setup | No dedicated TV board feature -- host must manually announce or guests check phones only | "Wish there was a screen for customers to watch" | Mid-market indie restaurants |
| NextMe | Virtual waiting room with self-check-in (QR, tablet, kiosk, website). Branded virtual waiting room page where guests track position. | Self-check-in from QR signage; branded virtual waiting room; SMS notifications | Virtual waiting room is phone-based, not TV-optimized; premium plan needed for advanced features; SMS-centric | "TV board is basic but helpful" ([nextmeapp.com, 2026](https://nextmeapp.com/)) | Small US restaurants |
| TablesReady | Waitlist with fully customizable public queue page that can be streamed to any device including TVs. Real-time updates with privacy protection. Pricing: free tier to $79/mo. | Public display page streamable to TV; privacy-aware; traffic analytics; free tier available | Public page is a generic responsive web view, not specifically TV-optimized (small text at distance); requires SaaS subscription for full features | "Good for phones, not great on a big screen" ([tablesready.com, 2026](https://www.tablesready.com/)) | Growing mid-market; strong in healthcare + restaurants |
| Paper + verbal announcements (real baseline) | Host shouts names or walks outside to find parties | Zero cost; zero onboarding | Diners miss announcements; host wastes time walking outside; causes rejections when parties are lost | "I was sitting outside and never heard my name" | Vast majority of small independents |

### Competitive Positioning Strategy

#### Our Differentiation
- **Key Advantage 1**: Purpose-built TV display -- dark theme, large text (36px+ codes), high contrast, landscape-optimized with 2-column grid. Not a responsive phone page stretched onto a TV like TablesReady's public page.
- **Key Advantage 2**: Privacy-first -- only opaque, short-lived codes shown. No names, no phone digits. WaitQ and TablesReady offer privacy options, but SKB's board is privacy-safe by architecture (the endpoint physically cannot return PII).
- **Key Advantage 3**: Zero cost, zero vendor lock-in -- a single HTML page served from SKB's own infrastructure. WaitQ starts at $17/mo, TablesReady up to $79/mo. SKB pays nothing.
- **Key Advantage 4**: Integrated with SKB's existing Place-in-Line system -- the board reads the same queue data that diners and hosts already use. No separate system to configure.

#### Competitive Response Strategy
- **If WaitQ improves their TV display**: Emphasize SKB's TV-first design (dark theme, large fonts, pulse animation) vs. WaitQ's generic device display. SKB's board is optimized for 3-5m viewing distance.
- **If TablesReady adds TV-optimized view**: Differentiate on zero cost and data ownership. TablesReady's free tier has limitations; SKB's board is unlimited.
- **If Yelp adds a standalone TV board**: Emphasize data ownership, no Yelp subscription, and privacy-safe architecture (codes only, not names).

#### Market Positioning
- **Target Segment**: Single-location independent restaurants with visible waiting areas and a spare TV or monitor.
- **Value Proposition**: "Show your queue on TV -- zero setup, zero cost, zero privacy risk."
- **Pricing Strategy**: Free for SKB (owned infrastructure). If productized later: included in the base waitlist feature at no extra charge.

### Research Sources
- [WaitQ - Digital Waitlist Management System](https://waitq.app/) (waitq.app, April 2026)
- [WaitQ Pricing](https://waitq.app/pricing) (waitq.app, April 2026)
- [TablesReady - Queue Management Software](https://www.tablesready.com/queue-management-software/) (tablesready.com, April 2026)
- [TablesReady Pricing](https://www.tablesready.com/pricing/) (tablesready.com, April 2026)
- [NextMe Waitlist App](https://nextmeapp.com/) (nextmeapp.com, April 2026)
- [Yelp Guest Manager on Capterra](https://www.capterra.com/p/130358/Yelp-Reservations/) (capterra.com, April 2026)
- [Yelp Guest Manager Features](https://business.yelp.com/restaurants/products/guest-manager-product-news/) (business.yelp.com, April 2026)
- [Best Restaurant Waitlist Apps 2026](https://restaurant.eatapp.co/blog/best-restaurant-waitlist-management-systems) (eatapp.co, April 2026)
- Research methodology: competitor website and feature review, SaaS review aggregators (Capterra, GetApp, G2), reasoning from restaurant operator pain points
- Note: customers who received real-time queue updates perceived their wait as 35% shorter than those with no updates, even when actual wait times were identical ([WaitQ blog, 2026](https://waitq.app/blog/best-practices-restaurant-waitlist-management))

## Open Questions

1. Should the board also show estimated wait time per party, or strictly just code + state as proposed in the issue? (Proposed: code + state only, to keep the board simple and avoid ETA anxiety.)
2. Should "called" rows animate or flash briefly on state change to catch attention on a wall TV? (Proposed: yes, a subtle pulse animation on transition.)
3. What is the maximum number of parties to display before auto-scrolling kicks in? (Proposed: ~12-15 entries visible at once in a 2-column grid on 1080p, then auto-scroll for overflow.)
4. Should the board show a header with total parties waiting count? (Proposed: yes, a compact summary bar.)
5. Should the host have a way to toggle the board on/off, or is it always available? (Proposed: always available -- it is a read-only view of public data.)
