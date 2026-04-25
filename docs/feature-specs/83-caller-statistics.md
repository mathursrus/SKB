# Feature: Caller Statistics

Issue: #83  
Owner: Codex

## Customer

Restaurant admins and owners who use the Admin workspace to understand how many inbound phone calls the IVR is handling, which paths callers choose, and where callers drop before becoming waitlist guests.

## Customer's Desired Outcome

An admin can open the Admin workspace and immediately answer:

- How many callers reached the phone system today or over the last 7 to 30 days.
- How many callers pressed each IVR option.
- How many callers attempted to join the waitlist.
- How many callers successfully joined, transferred to a human, or dropped before completion.
- Which specific stage of the IVR has the highest abandonment so the restaurant can improve prompts, staffing, or routing.

## Customer Problem being solved

Today SKB's voice system can answer calls, route callers through several IVR branches, and add callers to the waitlist, but the admin has no durable dashboard for top-of-funnel phone performance. The current system can tell what happened for callers who completed a join because those parties become queue entries, and it can emit server logs for IVR events, but it cannot answer the load-bearing product questions:

- How many callers never joined.
- Which menu choices are used most often.
- Whether callers are dropping at name capture, party size, or phone confirmation.
- Whether the phone channel is actually converting inbound demand into waitlist entries.

That leaves the admin blind on an important restaurant workflow: many diners call first, and phone demand matters even when the caller never reaches the waitlist.

## User Experience that will solve the problem

### Intent statement

The Admin workspace should gain a phone-analytics section that turns raw IVR activity into a simple caller funnel: inbound calls -> menu choice -> join intent -> waitlist joins / transfers / drop-off. This should be an additive analytics layer on top of the existing Admin page, not a new product area and not an IVR redesign.

### Admin workflow

1. The admin opens `/r/:loc/admin.html`.
2. In the analytics area, the admin sees a new "Caller Funnel" card group beside the existing service-debrief and lead-time views.
3. The default range is `Today`, with quick switches for `7 days` and `30 days`.
4. The top funnel shows the main conversion path:
   - inbound calls answered
   - callers who chose `Join waitlist`
   - callers who completed required information
   - callers who successfully joined
5. Below the main funnel, a stage ribbon shows where calls ended:
   - dropped before choice
   - dropped during name
   - dropped during size
   - dropped during phone confirmation
   - transferred to front desk
   - transferred to catering
   - menu only
   - hours/location only
6. A side panel shows the selected stage's details:
   - count
   - share of inbound calls
   - whether the outcome is a conversion, transfer, or abandonment
   - recommended operator interpretation text such as "high drop-off at phone confirmation may indicate caller-ID mistrust or unclear prompts"
7. A secondary breakdown shows which IVR options callers chose most often:
   - press 1 join waitlist
   - press 2 repeat wait time
   - press 3 menu
   - press 4 hours/location
   - press 0 front desk
   - press 5 catering when configured
8. A recent-calls table shows durable but privacy-minimized records:
   - time
   - outcome
   - selected path
   - join code when applicable
   - caller phone masked to last 4 only when display is necessary

### User stories

- As an admin, I want to see whether inbound phone demand is converting into waitlist joins so I can judge whether the IVR is helping or hurting operations.
- As an admin, I want to see where callers abandon the flow so I know which prompt or step needs improvement.
- As an admin, I want to see which IVR options callers use most so I can decide whether the menu tree still matches real caller intent.
- As an admin, I want caller analytics even for callers who never join the waitlist so the phone channel is measured as a full funnel, not only by completed conversions.

### Functional requirements

Requirements use SHALL language with one behavior per line and `R#` traceability tags.

| Tag | Requirement | Acceptance Criteria |
| --- | --- | --- |
| R1 | The system SHALL persist one durable analytics record for each inbound IVR call that reaches `POST /r/:loc/api/voice/incoming`. | Given Twilio posts a valid inbound call webhook, when the request is accepted, then a caller-session record exists for that call even if the caller never joins the waitlist. |
| R2 | The caller-session record SHALL be keyed by Twilio `CallSid` when available so multi-step IVR events can be stitched into one session. | Given the same call hits multiple IVR endpoints, when events are recorded, then the system associates them with one session rather than creating duplicate sessions. |
| R3 | The caller-session record SHALL store location, service day, started time, last event time, final outcome, and the ordered list of IVR stage events needed to derive the funnel. | Given an admin later loads analytics, when the server builds funnel counts, then it can distinguish menu choice, join attempt, transfer, successful join, and stage-specific drop-off from stored session data. |
| R4 | The system SHALL capture the caller's first menu choice at minimum for options `0`, `1`, `2`, `3`, `4`, and `5` when configured. | Given a caller presses `3` for menu, when the session is persisted, then the session records `firstMenuChoice=menu`. |
| R5 | The system SHALL capture whether the caller entered the join flow. | Given a caller presses `1`, when the session is updated, then the session records `joinIntent=true` even if the caller later drops. |
| R6 | The system SHALL capture whether name capture succeeded normally, succeeded via fallback, or failed before progress continued. | Given speech recognition fails and the `Caller XXXX` fallback path is used, when analytics are stored, then the session records `nameCaptureMode=fallback`. |
| R7 | The system SHALL capture whether party size capture succeeded, whether the call transferred for large-party handling, and whether the caller dropped at that stage. | Given a caller reaches the size prompt and then hangs up, when the session finalizes, then the outcome is reported as a size-stage drop-off rather than a generic abandonment. |
| R8 | The system SHALL capture whether the join used caller ID or a manually entered phone number. | Given a caller rejects caller ID and types a new number, when the join completes, then the session records `phoneSource=manual`. |
| R9 | The system SHALL capture whether the caller successfully joined the waitlist and link the caller session to the created queue-entry code. | Given `joinQueue()` succeeds, when the response is returned, then the session stores `finalOutcome=joined_waitlist` and `queueCode=<created code>`. |
| R10 | The system SHALL capture non-join terminal outcomes including at minimum `dropped_before_choice`, `dropped_during_name`, `dropped_during_size`, `dropped_during_phone_confirmation`, `front_desk_transfer`, `catering_transfer`, `menu_only`, `hours_only`, and `join_error`. | Given a caller only hears hours/location and hangs up, when the session ends, then the final outcome is `hours_only`. |
| R11 | The Admin workspace SHALL expose a new caller-statistics section on `/r/:loc/admin.html` rather than on the Host workspace. | Given a signed-in admin loads Admin, when the page renders, then the caller funnel appears there and is absent from Host. |
| R12 | The caller-statistics section SHALL default to `Today` and support `7 days` and `30 days` views. | Given the admin changes the range from `Today` to `7 days`, when the data reloads, then all funnel counts and breakdowns reflect the selected range. |
| R13 | The caller-statistics section SHALL display a top-level funnel that starts with all answered inbound IVR calls and ends with successful waitlist joins. | Given 100 inbound calls and 23 successful joins, when the funnel renders, then the first stage shows 100 and the final conversion stage shows 23. |
| R14 | The caller-statistics section SHALL display an abandonment and transfer breakdown by IVR stage. | Given callers drop at different steps, when the stage ribbon renders, then the admin can distinguish name, size, and phone-confirmation abandonment instead of seeing one generic drop-off bucket. |
| R15 | The caller-statistics section SHALL display a breakdown of first menu choice counts for the selected range. | Given the selected range contains calls across several branches, when the option breakdown renders, then each IVR option count is shown separately. |
| R16 | The caller-statistics section SHALL provide an empty state when no caller-session data exists for the selected range. | Given a new location with no voice traffic, when the admin opens caller statistics, then the UI says there is no caller data yet instead of showing a broken chart. |
| R17 | The caller-statistics section SHALL degrade gracefully when some older calls predate caller-session persistence. | Given the selected range includes legacy days with queue joins but no caller-session records, when the dashboard renders, then it shows only persisted caller analytics and explains that historical IVR funnel data begins from the rollout date. |
| R18 | The system SHALL reuse MongoDB as the system of record for caller analytics rather than introducing a new analytics datastore. | Given this feature is implemented, when data is written and read, then it uses the existing repository database stack. |
| R19 | The caller-statistics API SHALL return privacy-minimized analytics data suitable for the Admin UI and SHALL NOT expose raw full caller phone numbers in dashboard responses. | Given the admin loads recent calls, when session records are returned, then phone display is masked and no full phone number is required for analytics viewing. |
| R20 | The feature SHALL NOT require call recording, transcript storage, or LLM summarization. | Given the feature is enabled, when the IVR runs, then analytics are derived from structured IVR events only. |
| R21 | The Admin UI SHALL remain usable on mobile width without horizontal dead ends, even though Admin is tablet and desktop first. | Given the admin opens caller statistics on a phone-width viewport, when the cards stack, then funnel stages, filters, and breakdowns remain readable and tappable. |
| R22 | The feature SHALL leave the existing waitlist join path, queue stats, and lifecycle analytics intact. | Given a web join or normal host flow runs, when the feature is present, then the existing queue and analytics behavior still works as before. |

### Derived data model

The simplest viable storage model is one new MongoDB collection for caller sessions, for example `voice_call_sessions`, with one document per inbound call:

- `callSid`
- `locationId`
- `serviceDay`
- `startedAt`
- `lastEventAt`
- `endedAt`
- `firstMenuChoice`
- `joinIntent`
- `nameCaptureMode`
- `partySize`
- `phoneSource`
- `queueCode`
- `finalOutcome`
- `steps[]`
- `callerLast4`

This is intentionally not a full event-stream platform. It is a compact per-call summary record with enough detail to derive the funnel and inspect recent outcomes.

### Error states

- If caller-session persistence fails on an inbound call, the IVR SHOULD continue serving the caller and log the analytics-write failure separately so phone operations do not fail closed.
- If the caller-statistics query fails, Admin SHOULD show a localized error state inside the caller section while leaving the rest of Admin usable.
- If a call never reaches a known terminal step because Twilio stops posting mid-session, the system SHOULD finalize the latest known stage as the drop-off point after a timeout window rather than leaving the session permanently open.
- If the selected date range includes only pre-rollout traffic, the dashboard SHOULD show a rollout-boundary note rather than zeroing the funnel without explanation.

### UI mocks showing the desired experience

- [Caller statistics admin mock](mocks/83-caller-statistics-admin.html)

### Design Standards Applied

- Design standards source: generic UI baseline plus the repo's existing Admin visual language.
- Alignment choices used for the mock:
  - existing Admin card-based information architecture
  - Fira Sans typography to match the current admin surface
  - hospitality-leaning warm neutrals rather than a chart-library default aesthetic
  - stacked mobile layout for the analytics cards

## Compliance Requirements (if applicable)

No formal compliance framework is configured in `fraim/config.json`, so the following requirements are inferred from project context, current IVR/privacy preferences, and standard US transactional-communications expectations.

### Inferred requirements

- The feature SHALL remain analytics-only for diner-initiated inbound calls and SHALL NOT introduce outbound marketing, autodialing, or promotional SMS behavior.
- The feature SHALL NOT record or store call audio.
- The feature SHALL NOT require transcript retention for spoken name capture.
- The feature SHALL minimize PII in analytics records and Admin responses by storing or displaying only masked caller information where analytics do not require the full value.
- The feature SHALL keep Admin access behind the existing authenticated location access model and SHALL expose caller analytics only in the Admin workspace.

### Compliance validation

1. Verify the IVR flow still operates without any recording attributes or audio-file storage.
2. Verify caller-statistics API responses do not return raw full phone numbers for dashboard display.
3. Verify no new outbound messaging behavior is triggered by analytics events.
4. Verify Admin-only gating remains in place for the caller-statistics surface and API.

## Validation Plan

### Browser validation

1. Sign into `/r/:loc/admin.html` as owner or admin.
2. Confirm a new caller-statistics section appears in Admin and not in Host.
3. Verify `Today`, `7 days`, and `30 days` reload the funnel and option breakdown.
4. Verify empty-state copy appears when there are no persisted caller sessions.
5. Verify narrow mobile width stacks cards vertically without horizontal clipping.

### API validation

1. Simulate inbound voice traffic across several branches:
   - join success
   - menu only
   - hours only
   - front-desk transfer
   - caller drop during name
   - caller drop during size
   - caller drop during phone confirmation
2. Verify the stored caller-session records produce the expected aggregate counts.
3. Verify successful joins link session records to queue-entry codes.
4. Verify API responses mask caller phone information.

### Regression validation

1. Verify normal web joins are unchanged.
2. Verify existing Admin service-debrief and lead-time analytics still load.
3. Verify the IVR still completes a normal join flow when analytics persistence is enabled.
4. Verify analytics-write failure does not block the caller from hearing prompts or joining the queue.

### Compliance Validation

1. Verify no call recording or transcript-retention path was introduced.
2. Verify the caller dashboard remains admin-only.
3. Verify recent-call display uses masked phone output only.

## Alternatives

| Alternative | Why discard? |
| --- | --- |
| Derive caller stats only from application logs | Logs are not a durable product surface, are hard to query by admin date range, and do not provide a reliable in-product dashboard. |
| Count only successful voice joins by looking at queue entries | This misses the core issue requirement because the admin needs statistics even for callers who never added themselves to the waitlist. |
| Buy a separate third-party voice analytics product | Adds cost, duplicates data already flowing through the repo's IVR routes, and makes queue-join correlation harder. |
| Record and transcribe calls for richer analytics | Violates the stated privacy direction, increases compliance burden, and is unnecessary for the first funnel view. |
| Build a full event-stream analytics platform first | Overbuilt for the current need. One per-call summary record in Mongo is sufficient for the initial caller funnel. |

## Competitive Analysis

### Configured Competitors Analysis

Decision objective: compare SKB's proposed caller-funnel analytics against current restaurant voice products and current waitlist analytics products, then identify the simplest differentiator that matters for this issue.

| Competitor | Current Solution | Strengths | Weaknesses | Customer Feedback | Market Position |
| --- | --- | --- | --- | --- | --- |
| Yelp Host / Yelp Guest Manager | Yelp Waitlist lets diners see live waits, join remotely, track place in line, and receive a text when ready. Yelp Host adds AI call answering for restaurants and integrates phone handling into Yelp's restaurant stack. | Native connection between Yelp demand, waitlist, reservations, and AI phone answering. Large consumer-discovery footprint. | Ecosystem-centric. Public materials emphasize call handling and bookings, but not an operator-facing IVR drop-off funnel tied to custom waitlist stages. | Yelp's public messaging stresses reducing missed calls and helping teams focus on in-person service rather than exposing detailed phone-abandonment analytics. | Large incumbent platform across restaurant discovery and front-of-house tooling. |
| Slang AI | Purpose-built restaurant voice AI that answers inbound calls, manages reservations, sends text links, records call summaries, and exposes reservation / enterprise insights dashboards. | Deep restaurant-phone specialization, official reservation integrations, explicit analytics, and public pricing. | Optimized for high-touch phone automation and reservation conversion, not a lightweight in-product waitlist funnel. The richer voice stack also brings more complexity and heavier data collection than this issue needs. | Official materials emphasize fewer missed calls, better peak-hour coverage, and measurable phone performance. | Strong restaurant-specific voice specialist. |
| Goodcall | Horizontal AI phone agent that automates customer-service and sales requests across industries, including restaurant use cases. | Fast setup, broad tool connectivity, strong generic phone-automation posture. | Not restaurant-waitlist-specific. Public product material does not describe a waiter/host-style IVR funnel or a direct tie from phone steps to waitlist conversions. | Public positioning focuses on high caller interaction and operational efficiency rather than restaurant-specific funnel visibility. | Generalist AI telephony platform. |
| Waitwhile | Queue-management platform with virtual waitlists, messaging, analytics, report builder, and multi-location reporting. | Strong queue analytics, mature reporting, low published entry price, multi-location support. | Strong on queue analytics but not positioned around restaurant IVR journeys or inbound call drop-off. Phone-channel measurement is not the product center. | Public materials emphasize operational analytics, custom exports, and customer-flow insights. | Broad queue / appointments platform across industries. |
| Popmenu AI Answering | AI phone answering for restaurant FAQs such as hours, location, and menu, with customizable greetings and follow-up links inside a larger restaurant marketing suite. | Strong restaurant fit, good FAQ deflection, bundled website/marketing ecosystem. | Public materials emphasize answering common questions and recovery of missed-call revenue, not a branch-by-branch waitlist-conversion funnel. | Official case study cites reducing the need to pull staff away from tables for basic questions. | Broad restaurant growth-suite vendor with phone automation as one module. |
| TablesReady | Restaurant waitlist, reservations, floor plans, SMS paging, and analytics from a host-stand-first product. | Clear restaurant focus, waitlist-centric workflow, analytics, and strong ease-of-use positioning. | Strong host-stand analytics, but no visible inbound IVR phone-funnel product in current public materials. | Public materials position the product as simple and host-stand friendly for busy restaurants. | Direct SMB waitlist competitor. |
| Waitlist Me | Low-cost waitlist app with estimates, text alerts, analytics, reports, activity logs, and weekly summaries. | Simple, low-cost, report-oriented waitlist tooling. | Public materials show waitlist analytics, not inbound phone conversion analytics. | Public messaging stresses easy management, trend spotting, and operational reports. | Budget waitlist app and reporting competitor. |

### Additional Competitors Analysis

No newly discovered competitor is important enough to add to `fraim/config.json` for this issue. The configured set already covers the meaningful comparison space:

- restaurant-specific voice AI
- generic AI call automation
- waitlist products with analytics but no phone-funnel view

| Competitor | Current Solution | Strengths | Weaknesses | Customer Feedback | Market Position |
| --- | --- | --- | --- | --- | --- |
| None recommended for config update | N/A | N/A | N/A | N/A | The current config already captures the relevant landscape for caller analytics. |

### Competitive Positioning Strategy

#### Our Differentiation

- Key Advantage 1: Add caller-funnel visibility directly inside the same Admin workspace that already owns IVR settings and restaurant operations.
- Key Advantage 2: Tie phone-channel behavior to actual queue outcomes such as queue codes, transfers, and stage-specific abandonment instead of generic call-center metrics.
- Key Advantage 3: Achieve useful phone analytics without call recording, transcript retention, or a separate analytics vendor.
- Key Advantage 4: Stay intentionally lightweight. Competitors trend toward either broad queue reporting or full AI phone platforms; this feature solves the specific operator question with less complexity.

#### Competitive Response Strategy

- If competitors emphasize conversational AI, our response is that structured IVR plus clear funnel analytics solves the operator's immediate measurement problem with less complexity, lower privacy burden, and better issue-fit.
- If competitors emphasize generic phone reporting, our response is that SKB can connect phone behavior to concrete restaurant outcomes such as waitlist joins, branch selection, and transfer volume.
- If competitors emphasize broad queue analytics, our response is that SKB measures the missing top-of-funnel behavior before a diner ever becomes a queue entry.

#### Market Positioning

- Target Segment: restaurants that already rely on inbound phone demand and want to understand whether their IVR is converting demand into visits.
- Value Proposition: a restaurant-specific caller funnel inside the operations console, not a separate call-center analytics product.
- Pricing Strategy: additive admin analytics on top of the existing voice/waitlist surface rather than a separate premium analytics stack. This also positions below high-touch restaurant voice-AI products with publicly posted multi-hundred-dollar per-location plans, while adding missing phone-funnel visibility that lower-cost waitlist analytics products do not expose.

### Research Sources

- Yelp Waitlist support overview, accessed 2026-04-25: `https://yelp-sales.my.site.com/article/What-is-Yelp-Waitlist?l=en_US`
- Yelp press release on Yelp Host / Yelp Receptionist rollout, published 2025-10-21, accessed 2026-04-25: `https://www.yelp-press.com/press-releases/press-release-details/2025/Yelp-Expands-AI-Features-to-Make-Local-Discovery-More-Conversational-Visual-and-Seamless/default.aspx`
- Slang AI homepage, accessed 2026-04-25: `https://www.slang.ai/`
- Slang AI pricing, accessed 2026-04-25: `https://www.slang.ai/pricing`
- Slang AI call-data / insights article, accessed 2026-04-25: `https://www.slang.ai/post/restaurant-call-data-insights`
- Waitwhile homepage, accessed 2026-04-25: `https://waitwhile.com/`
- Waitwhile pricing, accessed 2026-04-25: `https://waitwhile.com/pricing/`
- Waitwhile analytics help article, accessed 2026-04-25: `https://help.waitwhile.com/en/articles/11331976-a-guide-to-waitwhile-s-reporting-and-analytics-tools`
- Goodcall homepage, accessed 2026-04-25: `https://www.goodcall.com/`
- Goodcall restaurants page, accessed 2026-04-25: `https://www.goodcall.com/restaurants`
- Popmenu AI Answering, accessed 2026-04-25: `https://get.popmenu.com/ai-answering`
- Popmenu Alfred's Restaurant case study, accessed 2026-04-25: `https://get.popmenu.com/client-story/alfreds-restaurant`
- TablesReady homepage, accessed 2026-04-25: `https://www.tablesready.com/`
- TablesReady restaurant waitlist software page, accessed 2026-04-25: `https://www.tablesready.com/restaurant-waitlist-software/`
- Waitlist Me homepage, accessed 2026-04-25: `https://waitlist.me/`
- Waitlist Me analytics and reports page, accessed 2026-04-25: `https://www.waitlist.me/analytics-and-reports`
- Waitlist Me pricing page and 2024 pricing update, accessed 2026-04-25:
  - `https://www.waitlist.me/pricing`
  - `https://blog.waitlist.me/pricing-update-from-september/`
- Research method: current-source review focused on official product, pricing, help-center, case-study, and press pages that directly described voice handling, waitlist analytics, or reporting.

## Data Flow

```mermaid
graph TD
    A[Inbound caller] --> B[Twilio Voice webhook]
    B --> C[src/routes/voice.ts]
    C --> D[voice_call_sessions collection]
    C --> E[queue_entries collection via joinQueue]
    D --> F[caller statistics service]
    E --> F
    F --> G[/api/host caller statistics endpoint]
    G --> H[/r/:loc/admin.html caller funnel UI]
```
