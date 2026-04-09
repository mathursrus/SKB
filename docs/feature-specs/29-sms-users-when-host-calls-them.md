# Feature: SMS Users When Host Calls Them

Issue: #29
Owner: Claude (AI Employee)

## Customer

**Diners** joining the SKB restaurant waitlist who want to be notified when their table is ready, and **hosts** (restaurant staff) who want fewer no-shows and a smoother calling process.

## Customer's Desired Outcome

Diners receive an SMS notification on their phone the moment a host calls their party, so they don't need to constantly watch their screen or hover near the restaurant entrance. The message tells them how many times they've been called, adding urgency for repeat calls.

## Customer Problem Being Solved

Today, when a host clicks "Call" on the dashboard, there is **no external notification**. The diner only sees they've been called if they manually refresh their status page. This leads to:

1. **Missed calls** — diners step away and don't know they were called.
2. **No-shows** — uncalled parties clog the queue, wasting tables.
3. **Host frustration** — hosts must physically shout names or walk through the venue.
4. **Repeat calls** — hosts call the same party multiple times with no way to escalate urgency.

## User Experience That Will Solve the Problem

### Diner Flow (Join Waitlist)

1. Diner navigates to the SKB "Place in Line" page.
2. Diner fills in **Name**, **Party size**, and **Phone number** (full number, optional).
3. A helper text below the phone field reads: *"We'll text you when your table is ready."*
4. Diner taps **"Join the line"**.
5. System validates the phone number (10-digit US format or empty).
6. Diner sees confirmation card with position, code, and ETA.

### Diner Flow (Receive SMS)

1. Host clicks "Call" on the host dashboard.
2. System updates party state to `called`, pushes timestamp to `calls[]`.
3. If the party has a phone number on file, system sends an SMS.
4. **First call message**: `"SKB: Your table is ready! Please head to the front. Show code {CODE} to the host."`
5. **Repeat call message**: `"SKB: You've been called {N} times for your table. Please come to the front now. Code: {CODE}"`
6. Diner receives SMS on their phone.
7. On the status page, the existing "called" callout continues to display as before.

### Host Flow

1. Host views the waiting queue on the dashboard.
2. Phone numbers are displayed masked: `******1234`.
3. Host clicks "Call" — party is called and SMS is sent automatically.
4. If SMS fails, the call still succeeds. A small indicator (e.g., a warning icon) shows next to the party if SMS delivery failed.
5. Host can see the call count in the existing call history.

### UI Mocks

- [Diner Join Form — Updated Phone Field](mocks/29-diner-join.html)
- [SMS Message Preview](mocks/29-sms-preview.html)

### Design Standards

Mocks use the **generic UI baseline**, inheriting the existing SKB design language:
- Font: Fira Sans
- Colors: Black (#000) + White (#fff) base, Gold accent (#e3bf3d)
- Card-based layout consistent with existing `queue.html`

## Requirements

| Tag | Requirement | Acceptance Criteria |
|-----|------------|---------------------|
| R1 | The system SHALL collect an optional full US phone number (10 digits) during waitlist join, replacing the current last-4-digits field. | Given a diner on the join page, When they enter a 10-digit phone number, Then the system stores the full number. When they leave it blank, the join still succeeds. |
| R2 | The system SHALL validate the phone number as exactly 10 digits (US format) when provided. | Given a diner entering "abc" or "123", When they submit, Then a validation error is shown: "Please enter a valid 10-digit phone number." |
| R3 | The system SHALL send an SMS to the diner's phone number each time the host clicks "Call". | Given a diner with a phone number in `waiting` or `called` state, When the host clicks Call, Then an SMS is delivered to that number within 10 seconds. |
| R4 | The SMS message SHALL include the call count for this slot. | Given a diner called for the 2nd time, When the SMS is sent, Then the message body contains the count (e.g., "called 2 times"). |
| R5 | The system SHALL NOT attempt SMS if no phone number is on file. | Given a diner without a phone number, When the host calls them, Then no SMS is sent and the call proceeds normally with no error. |
| R6 | The host dashboard SHALL mask phone numbers as `******NNNN`. | Given a host viewing the queue, When a diner has a phone number, Then it is displayed as `******1234`. |
| R7 | SMS delivery failures SHALL NOT block or delay the call state update. | Given a Twilio API failure, When the host calls a party, Then the party state updates to `called` immediately and the SMS failure is logged. |
| R8 | The diner join form SHALL display helper text: "We'll text you when your table is ready." | Given the join form, When viewing the phone field, Then helper text is visible below the input. |

### Edge Cases

- **Invalid phone number**: Reject non-digit or wrong-length input with inline validation error.
- **Empty phone field**: Allow join without phone; skip SMS on call.
- **SMS provider outage**: Log error, proceed with call. Host sees a warning indicator.
- **Rapid repeat calls**: Each call triggers an SMS. No debounce — the call count in the message provides context.
- **Party already seated/removed**: SMS is only sent for parties in active states (`waiting`, `called`).

## Compliance Requirements

> No formal compliance frameworks (SOC2, HIPAA, etc.) are configured for this project. The following requirements are **inferred from industry standards** for SMS communication in the US.

### TCPA (Telephone Consumer Protection Act)
- **Consent**: The diner voluntarily provides their phone number with clear disclosure ("We'll text you when your table is ready"), constituting prior express consent for transactional messages.
- **No marketing**: SMS content is strictly transactional (table-ready notification), not promotional.
- **Opt-out**: Not required for single-session transactional messages, but the system should not store phone numbers beyond the service day.

### Data Privacy (PII Handling)
- **Storage**: Full phone numbers are stored in MongoDB for the duration of the service day only. They are part of the existing `queue_entries` collection which is scoped to `serviceDay`.
- **Display**: Phone numbers are masked on the host dashboard (`******1234`).
- **Access**: Phone numbers are only accessible via authenticated host endpoints (PIN-gated).
- **No sharing**: Phone numbers are never exposed in public API responses (diner status, board, etc.).

### Compliance Validation
- Verify SMS content contains no promotional language.
- Verify phone numbers are not returned in public-facing API responses (`/api/queue/status`, `/api/queue/board`).
- Verify host endpoints require PIN authentication before accessing phone data.

## Validation Plan

### Functional Validation (Browser)
1. Open diner page, join with full phone number → verify confirmation card appears.
2. Join without phone number → verify join succeeds without error.
3. Enter invalid phone (3 digits, letters) → verify validation error shown.
4. Host calls party with phone → verify SMS received on phone.
5. Host calls same party again → verify SMS received with count "2 times".
6. Host calls party without phone → verify no error, call proceeds.

### API Validation
1. `POST /r/:loc/api/queue/join` with `phone: "2065551234"` → verify 200 response, phone stored.
2. `POST /r/:loc/api/queue/join` with `phone: ""` → verify 200 response, no phone stored.
3. `POST /r/:loc/api/queue/join` with `phone: "abc"` → verify 400 validation error.
4. `POST /r/:loc/api/host/queue/:id/call` → verify call succeeds and SMS triggered.
5. `GET /r/:loc/api/queue/status?code=XXX` → verify phone NOT in response.
6. `GET /r/:loc/api/host/queue` → verify phone is masked in response.

### Compliance Validation
1. Verify SMS body is transactional only — no promotional content.
2. Verify `GET /api/queue/status` and `GET /api/queue/board` do not expose phone numbers.
3. Verify host endpoints return masked phone numbers.

## Alternatives

| Alternative | Why Discard? |
|------------|-------------|
| **Push notifications via web browser** | Requires the diner to keep the browser tab open and grant notification permission. Many mobile browsers block or drop notifications. SMS is universally reliable. |
| **WhatsApp Business API** | Higher integration complexity, requires WhatsApp business account approval, not all US diners use WhatsApp. SMS has near-universal reach in the US. |
| **Email notifications** | Too slow for a real-time "your table is ready" use case. Diners may not check email in a restaurant context. |
| **Keep last-4-digits + in-app only** | Current approach — proven to cause missed calls and no-shows. Doesn't solve the core problem. |
| **Pager system (hardware)** | Physical pagers are expensive, require maintenance, and limit the diner's range. SMS allows diners to walk freely. |

## Competitive Analysis

### Configured Competitors Analysis

*No competitors configured in `fraim/config.json`. Analysis based on market research.*

### Additional Competitors Analysis

| Competitor | Current Solution | Strengths | Weaknesses | Customer Feedback | Market Position |
|------------|------------------|-----------|------------|-------------------|-----------------|
| **Yelp Guest Manager** | SMS + "Almost Ready" text notification; two-way messaging; kiosk self-check-in with automated texts | Mature two-way SMS (guests can reply), customizable notifications, "Almost Ready" pre-notification, strong brand recognition | Expensive ($249+/mo), locks restaurants into Yelp ecosystem, requires iPad | "SMS works great but the platform fee is brutal" | Market leader, enterprise-focused |
| **Waitly** | Personalized SMS with two-way texting; QR code self-check-in; real-time sync across devices | Two-way texting, personalized messages, no app download for guests, multi-location support | Less established brand, limited analytics compared to Yelp | "Easy to set up, guests love the texts" | Growing SMB player |
| **NextMe** | Custom SMS notifications with virtual waiting room link; two-way SMS (cancel/confirm); mobile marketing page | Customizable SMS content, virtual waiting room with branded promotions, reduces walk-outs by 35% (claimed), QR code check-in | Mobile marketing page feels spammy, no call-count tracking in SMS | "Simple and works for small spots" | SMB-focused |
| **TablesReady** | Up to 8 customizable SMS notifications per guest journey; 2-way chat; geofencing alerts; automated next-in-line nudges | Most granular SMS workflow (8 touchpoints), geofencing, automated "almost ready" nudges, guests can text back | 2,500 texts/mo cap on base plan, international SMS at 1/10th quantity | "Feature-rich SMS but pricing gets complex" | Niche, feature-rich |
| **Waitlist Me** | SMS + phone call notifications; public waitlist page; customizable messages | Free tier available (25 parties/mo), replaces physical pagers, simple setup | Free tier very limited, Pro $20/device/mo, no two-way SMS on lower tiers | "Great free option but outgrow it fast" | Budget entry point |

### Competitive Positioning Strategy

#### Our Differentiation
- **No app, no account, no ecosystem lock-in**: Diners join via web — no download, no sign-up, no Yelp dependency. SMS is the only external touchpoint.
- **Call count in SMS**: None of the researched competitors include call attempt count in their SMS. Our SMS escalates urgency by telling the diner "you've been called N times", reducing no-shows on repeat calls.
- **Privacy-first**: Phone numbers are session-scoped (service day only), not stored long-term for marketing. No mobile marketing pages or promotional piggyback (unlike NextMe).
- **Zero platform fee**: No per-device or per-location subscription for SMS. Only the raw Twilio per-message cost.
- **Simplicity**: One SMS at call time. No complex 8-notification workflows or geofencing — just the right message at the right moment.

#### Competitive Response Strategy
- **If asked "why not Yelp?"**: We cost a fraction, don't require an iPad, and don't lock you into the Yelp review ecosystem.
- **If asked "why not TablesReady?"**: We keep it simple — one notification when called, with escalating urgency. No text cap, no geofencing complexity.
- **If asked "why not free Waitlist Me?"**: Our free tier has no 25-party limit. SMS is the only paid add-on (at cost).

#### Market Positioning
- **Target Segment**: Single-location and small-chain restaurants that want simple, affordable waitlist management without ecosystem lock-in.
- **Value Proposition**: "SMS notifications without the enterprise price tag, complexity, or ecosystem lock-in."
- **Pricing Strategy**: SMS costs passed through at cost (Twilio per-message pricing ~$0.0079/SMS) with no platform markup or per-device fees.

### Research Sources
- [Yelp Guest Manager features](https://biz.yelp.com/support-center/article/What-are-additional-features-on-the-iPad-for-Yelp-Guest-Manager) (accessed 2026-04-08)
- [Waitly features](https://www.waitly.com/) (accessed 2026-04-08)
- [NextMe waitlist management](https://nextmeapp.com/waitlist-management/) (accessed 2026-04-08)
- [TablesReady guest messaging features](https://www.tablesready.com/features/guest-messaging-waitlist-features) (accessed 2026-04-08)
- [Waitlist Me features](https://www.waitlist.me/features) (accessed 2026-04-08)
- Methodology: Product page review, feature comparison, publicly available customer reviews
