# Feature: Place in Line

Issue: [#1](https://github.com/mathursrus/SKB/issues/1)
Owner: Claude (agent)

## Customer

Two customers:

1. **Walk-in diner** — arrives at Shri Krishna Bhavan, may be standing outside or sitting on a curb, and wants to know "how long until I can eat?" before committing to wait.
2. **Host operator** — the person at the front desk managing throughput, under real-time pressure, who currently manages the list on paper or in their head.

## Customer's Desired Outcome

- **Diner**: "I can see the wait, decide quickly, and trust that my place is held without me standing there."
- **Operator**: "I can see my list at a glance, remove parties as I seat or write off no-shows, and the wait times update automatically so nobody gets angry."

## Customer Problem being solved

SKB serves great food but loses customers at the door:
- Diners don't know the wait, so they either stand around annoyed or leave.
- Parties who waited a long time get rejected because the host lost track or turn-time ran over.
- The host has no reliable running tally of promised ETAs to honor.

This feature gives both sides a shared, accurate view of "place in line."

## User Experience that will solve the problem

### Diner flow (mobile, no login)

1. Diner scans a QR code at the door → opens `/queue` on their phone.
2. The page shows: **current line length**, **estimated wait for a new party**, and a **Join the line** button.
3. Diner taps **Join the line**, enters **name**, **party size** (1–10), and **optional phone (last 4 digits only)**.
4. System returns a **Your place: #N** confirmation card with: position number, promised ETA (wall-clock time), a 6-character pickup code (e.g. `SKB-7Q3`), and a "refresh for update" hint.
5. Diner can reopen the URL or bookmark the confirmation card to poll for updates. If removed, the card shows **"The host has called your party — please come to the front."**

### Operator flow (host-stand device, PIN-protected)

1. Operator opens `/host` on the host-stand tablet → enters the device PIN (set in env, rotated on request).
2. Sees an ordered list: `#`, party name, size, phone-last-4, promised ETA, **time waiting**, and a **Remove** button per row.
3. Top of the screen: **Avg turn time (minutes)** input (default `8`) — used to compute ETA = `position × avg_turn_time`.
4. Tapping **Remove** asks "Seated or No-show?" → logs the reason and recalculates ETAs for everyone below them.
5. A subtle counter at the top shows "**N parties waiting, oldest: 23m**" for at-a-glance awareness.

### UI mocks
- [`docs/feature-specs/mocks/1-diner.html`](./mocks/1-diner.html) — diner join + place-in-line card
- [`docs/feature-specs/mocks/1-host.html`](./mocks/1-host.html) — host-stand queue view

### Design Standards Applied
Used the **generic UI baseline** (no project-specific design system configured in `fraim/config.json` yet). Mocks are mobile-first, high-contrast, single-column for diner; tablet-landscape table layout for host. System fonts only, rounded buttons (~12px), large tap targets (≥44px).

## Functional Requirements (traceable)

| ID | Requirement |
|---|---|
| R1 | Diner SHALL view current queue length and estimated wait for a new party without authenticating. |
| R2 | Diner SHALL join the queue by providing name, party size (1–10), and optional phone-last-4. |
| R3 | System SHALL return a confirmation with position number, promised ETA, and pickup code. |
| R4 | Diner's queue entry SHALL persist until the operator removes it or the end-of-day reset occurs. |
| R5 | Operator SHALL view the ordered queue with per-party ETA and time-waiting. |
| R6 | Operator SHALL be able to remove a party with a reason (seated / no-show). |
| R7 | On removal, system SHALL recalculate ETAs for remaining parties. |
| R8 | Diner's place-in-line view SHALL reflect the updated position and ETA on refresh. |
| R9 | Operator SHALL configure `avg_turn_time_minutes` (default 8). |
| R10 | Host-stand access SHALL require a device PIN. |

### Acceptance criteria (Given/When/Then)

- **AC-R2/R3**: *Given* an empty queue, *when* a diner joins with name "Asha", size 3, *then* they receive position `#1` and ETA equal to current time + `avg_turn_time_minutes`.
- **AC-R6/R7**: *Given* three parties in line and `avg_turn_time=8`, *when* operator removes the party at position 1 as "seated", *then* party at position 2 becomes `#1` with ETA now+8m, and party at 3 becomes `#2` with ETA now+16m.
- **AC-R8**: *Given* a diner at position 2, *when* they refresh after the front party is seated, *then* they see `#1` and their ETA has moved earlier by `avg_turn_time_minutes`.
- **AC-R10**: *Given* the PIN is not set or wrong, *when* operator opens `/host`, *then* the queue list is not shown and a PIN prompt is displayed.

### Edge cases
- Invalid party size (0, 11+) → form error, no entry created.
- Same name + phone-last-4 already in queue → allow (could be a legitimate re-queue); host can dedupe via Remove.
- End-of-day reset (operator-triggered) → all entries archived, queue cleared.
- Clock skew between diner phone and host device → ETAs computed server-side only.

## Compliance Requirements (if applicable)

No formal regulations are configured in `fraim/config.json`. General privacy best-practices inferred from project context:
- Store only **name**, **party size**, and **phone-last-4** (never full phone numbers) to minimize PII.
- Auto-archive queue entries at end-of-day; do not retain diner data beyond 30 days.
- Host-stand device must be PIN-protected to prevent casual bystanders from viewing the list.
- No third-party analytics on the diner page.

If SKB later chooses to enable SMS notifications, this spec must be revisited for TCPA (US SMS consent) compliance.

## Validation Plan

- **Manual (browser)**: Open `/queue` on a phone, join queue; open `/host` on a tablet; remove the party; refresh `/queue` — verify updated position and ETA.
- **API (e2e test via MCP)**: Hit `POST /api/queue/join`, `GET /api/queue/state`, `POST /api/queue/remove`; assert position + ETA math matches AC-R6/R7.
- **Critical waitlist path test** (per project rule 7): Automated test covering join → ETA → remove → updated ETA must exist before merge.
- **Compliance validation**: Smoke-assert no full phone numbers or payment data appear in DB records; assert PIN gate on `/host`.

## Alternatives

| Alternative | Why discard? |
|---|---|
| Paper list at the host stand (status quo) | No diner visibility; loses track under pressure; causes rejections. |
| Third-party waitlist SaaS (Yelp Waitlist, Waitly) | Monthly cost; vendor lock-in; diners need app installs; SKB wants ownership of the customer experience. |
| SMS-driven waitlist from day one | Adds TCPA/consent scope and SMS gateway cost; punts on v1 goal of "reduce rejections." Pull-based refresh is sufficient for a single-location restaurant. |
| Diner-managed reschedule / cancel themselves | Complexity (needs identity); low value — the host removes no-shows anyway. |

## Competitive Analysis

### Configured Competitors Analysis
No competitors configured in `fraim/config.json`. Section deferred pending `business-plan-creation` or manual entry.

### Additional Competitors Analysis

| Competitor | Current Solution | Strengths | Weaknesses | Customer Feedback | Market Position |
|---|---|---|---|---|---|
| Yelp Waitlist (Yelp Guest Manager) | Diners join via Yelp app or on-site kiosk; host tablet view | Brand reach; SMS ready; table-management integrations | Requires Yelp account; SaaS fee; restaurant loses customer data ownership | "Convenient, but I hate being forced into another app" | Dominant in casual dining waitlist |
| Waitly | Web-based waitlist; SMS notifications | Cheap; no diner app install; clean host UI | Limited branding; basic ETA model | "Simple and it works" | Mid-market indie restaurants |
| NextMe | SMS-first waitlist; basic analytics | Fast setup; SMS core | Thin customer-facing UX; SMS TCPA overhead | "Good for tiny places" | Small US restaurants |
| Paper + mental list (real baseline) | Host writes names on a notepad | Zero cost; zero onboarding | Diner has zero visibility; host drops parties; rejections | "I left after 20 min because nobody told me anything" | Vast majority of small independents |

### Competitive Positioning Strategy

#### Our Differentiation
- **Key Advantage 1**: Zero-install for diners — QR code to web page, no app, no account.
- **Key Advantage 2**: Owned customer experience — SKB branding, no Yelp funnel siphoning diners to competitors nearby.
- **Key Advantage 3**: Honest, visible ETA — diner sees the math (`position × avg turn time`), building trust vs. opaque SaaS estimates.

#### Competitive Response Strategy
- **If Yelp Waitlist expands free tier**: Emphasize data ownership and single-location focus; integrate SKB loyalty in future phases.
- **If Waitly adds SMS**: Add SMS as a paid upgrade path; keep free tier always usable via pull-refresh.

#### Market Positioning
- **Target Segment**: Single-location independent restaurants with 30+ min waits.
- **Value Proposition**: "Cut rejections, keep your diners informed — no app, no SaaS fee."
- **Pricing Strategy**: Free for SKB (owned infra). If productized later: one-time setup fee.

### Research Sources
- Vendor websites (yelpforbusiness.com, waitly.com, nextmeapp.com), 2026-04-04
- Desk research; no formal customer interviews yet
- Research methodology: competitor site review + reasoning from restaurant operator pain points stated in issue #1

## v1 Assumptions (needs your confirmation)

1. **ETA formula**: `position × avg_turn_time_minutes` (operator-configurable, default 8). Simpler than table-count modeling.
2. **Operator auth**: single device PIN (env-configured), no per-host accounts.
3. **Notifications**: pull-based — diner refreshes. SMS deferred to a later feature.
4. **Party size**: 1–10.
5. **PII**: name + optional phone-last-4 only; no full phone numbers stored.

## Open Questions

- Should the diner see a live name-based cue ("When your code SKB-7Q3 shows 'Ready', come in") instead of a polled position? (Proposed: yes, same data, just UX wording.)
- End-of-day reset: operator-triggered button, or automatic at configured closing time?
- Should removed "seated" vs "no-show" counts be visible to the host for the day? (Useful for operator tuning of `avg_turn_time`.)
