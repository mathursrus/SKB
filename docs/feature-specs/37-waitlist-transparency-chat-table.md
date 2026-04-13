# Feature Specification — Issue #37

**Title:** Waitlist transparency, host-side chat/call actions, and table-number capture on seat
**Status:** Draft
**Owner:** sid.mathur@gmail.com
**Related mocks:** `docs/feature-specs/mocks/37-customer-waitlist.html`, `docs/feature-specs/mocks/37-host-party-actions.html`, `docs/feature-specs/mocks/37-host-seat-dialog.html`

---

## 1. Why (Problem & Motivation)

Today SKB's host stand (`SKB · Host Stand`) shows a single table of the live waitlist to staff (`#, Name, Size, Phone, Promised, Waiting`), but the customer-facing experience does not let a guest see where they stand relative to others. Guests who walk away don't know whether they're "next" or "five parties out," which drives anxious phone calls to the host and no-shows when guests over-estimate the wait and leave the area.

On the host side, the per-party row already exposes *custom SMS* and *custom call* actions, but operators have told us they want two additional fast paths:

1. **One-tap chat** — start an in-app, two-way text thread with the guest (no custom message compose step).
2. **One-tap call** — dial the guest's phone directly from the row (no dialer paste).

Finally, when a party is seated today the host taps *Seat*, the party moves from **Waiting → Seated**, and turn-time tracking starts — but the physical **table number** is never captured. Without it, (a) servers can't tie POS tickets to the waitlist entry for downstream `Avg Order / Avg Serve / Avg Checkout` rollups, and (b) the host stand can't answer "where is the Patel party sitting?" when a second guest asks.

### Goals
- **G1** Customers can see the full live waitlist on their phone the way Waitly presents it: their position, their promised time, how long they have been waiting, and — for every party — name (first name + last initial), size, promised time, and elapsed wait.
- **G2** Hosts gain two new per-party row actions — **Chat** and **Call** — in addition to the existing *custom SMS* and *custom call* buttons.
- **G3** When a host seats a party, they must enter (or select) a **table number**. The table number is stored with the waitlist entry and shown in the Seated tab.

### Non-Goals
- Reservations (pre-booked tables) are out of scope.
- Two-way chat *transport* selection (SMS vs. push vs. chat provider) is out of scope; chat uses the existing SMS gateway as its backing channel in v1.
- Real-time table occupancy map / floor plan view is out of scope for this issue.
- Customer accounts / authentication. Customer view is reached via an unauthenticated link from the check-in confirmation.

---

## 2. Who (User Profiles)

| Persona | Primary concern | Change lands where |
|---|---|---|
| **Guest waiting at the bar / down the street** | "How much longer? Did they forget me?" | New customer waitlist view |
| **Host on the stand** | "Seat the right party next; page the right guest fast" | Host Stand: per-party row + Seat dialog |
| **Operator / GM** | "Tie wait times to POS tickets; reduce no-shows" | Downstream analytics (table_number joins to POS) |

---

## 3. What (Scope & Requirements)

Requirements use SHALL-style language with `Rn` traceability tags.

### 3.1 Customer waitlist view

- **R1** The customer SHALL reach the view via a unique, unauthenticated link sent at check-in time (e.g. `/w/<token>`). The token identifies the party but the view is readable by anyone with the link.
- **R2** The view SHALL render a **header card** for the viewer's own party containing:
  - Party name (as captured at check-in, e.g. *Patel, 4*)
  - **Position in line** — `You are #3 of 7`
  - **Promised time** (absolute clock time, e.g. `6:42 PM`) and **ETA window** (`~12 min`)
  - **Elapsed wait** — updates live, format `mm:ss` under 1h, `Hh Mm` otherwise
  - Visual indicator that transitions between states: `Waiting`, `Next up`, `Table ready`
- **R3** The view SHALL render a **full waitlist list** beneath the header, one row per party ahead of and behind the viewer, including the viewer's own party highlighted:
  - `#` (1-indexed position)
  - **Name** — first name + last initial only (e.g. *Priya P.*) for privacy
  - **Size** (party size)
  - **Promised** (absolute clock time)
  - **Waiting** (elapsed since check-in, live-ticking)
- **R4** The list SHALL sort by position (queue order), with the viewer's own row visually highlighted (left border accent + subtle background fill) but not moved out of its sort position.
- **R5** The list SHALL update at least every 15 seconds without a full page reload (poll or SSE — implementation choice).
- **R6** When the viewer's party is marked `Notified` / `Table ready`, the header card SHALL flip to a `Your table is ready` state with a primary CTA `I'm on my way` that POSTs back to the host stand as an acknowledgement.
- **R7** When the viewer's party is seated, cancelled, or no-showed, the view SHALL render a terminal state (`Seated at table 12`, `Cancelled`, `We couldn't reach you`) and stop polling.
- **R8** The view SHALL be mobile-first (≤375px baseline), accessible at WCAG AA contrast, and usable without JavaScript for the header card (list can require JS).

**Acceptance (R1–R8) — Given/When/Then:**

- *Given* a guest who just checked in with party size 4 and is 3rd in line, *when* they open the link, *then* the header card reads `You are #3 of 7`, promised `6:42 PM`, waiting `00:00` ticking upward, and the list below shows 7 rows with their row highlighted.
- *Given* a guest whose party has been marked `Notified` by the host, *when* the poll fires, *then* the header card flips to `Your table is ready` with a `I'm on my way` button within 15s.
- *Given* a guest whose party has been seated, *when* they refresh, *then* the view shows `Seated at table 12 — enjoy your meal` and no list.

**Edge cases:**
- Token missing / expired → `This wait link is no longer active.`
- Party size changed after check-in → reflected on next poll.
- Guest at position 1 → header reads `You're next` instead of `You are #1 of N`.
- Empty waitlist except viewer → list still renders the viewer's row.

### 3.2 Host-side Chat and Call row actions

- **R9** Each row in the Waiting tab of the Host Stand SHALL expose the following action buttons, in this left-to-right order:
  1. **Seat** (existing)
  2. **Notify** (existing)
  3. **Chat** *(new)* — opens a slide-over panel with a two-way thread for this party
  4. **Call** *(new)* — triggers a `tel:` dial to the party's phone via the device's dialer
  5. **Custom SMS** (existing) — opens the ad-hoc compose modal
  6. **Custom Call** (existing) — opens the ad-hoc call modal
  7. **No-show / Remove** (existing)
- **R10** The **Chat** action SHALL:
  - Open a right-hand slide-over (`width: 420px` desktop, fullscreen mobile) pinned to the selected party.
  - Show the full SMS thread history with this phone number, newest at the bottom.
  - Expose a message composer with three tap-to-send quick replies (`Your table is almost ready`, `Need 5 more minutes?`, `We lost you — are you still here?`) plus a free-text field.
  - Send via the existing SMS gateway. Inbound replies SHALL land in the same thread in real time (reusing the poll/SSE channel from §3.1).
  - Unread inbound message count SHALL render as a red dot badge on the **Chat** button in the row.
- **R11** The **Call** action SHALL trigger a device-native dial using `tel:+E164` for the party's phone and log a `call_initiated` event against the party. It SHALL NOT open the Custom Call modal.
- **R12** The existing **Custom SMS** and **Custom Call** actions SHALL be preserved, unchanged, so staff who need to compose bespoke messages still can.
- **R13** When the phone number for a party is missing or invalid, **Chat** and **Call** SHALL render disabled with a tooltip `No phone number on file`.

**Acceptance (R9–R13):**
- *Given* a party with phone `+15551234567`, *when* the host taps **Call**, *then* the device dialer opens with that number pre-dialed and a `call_initiated` event is logged.
- *Given* the same party has two unread inbound SMS, *when* the host opens the Waiting tab, *then* the **Chat** button shows a red dot with `2`.
- *Given* a walk-in checked in without a phone, *when* the row renders, *then* **Chat** and **Call** are visually disabled.

### 3.3 Table number on Seat

- **R14** Tapping **Seat** on a waiting party SHALL open a **Seat Party** dialog (not immediately transition the row) with:
  - Party summary (name, size, promised, elapsed wait) as a read-only header
  - **Table #** input — required, numeric, 1–999, with recent tables as quick-pick chips (e.g. `[ 12 ][ 14 ][ 7 ]`)
  - Primary button `Seat at table <N>` (disabled until a table is entered)
  - Secondary button `Cancel`
- **R15** On confirm, the party SHALL transition Waiting → Seated with `table_number` persisted on the record. The Seated tab row SHALL display the table number as its leftmost cell.
- **R16** The dialog SHALL validate that the entered table number is not currently assigned to another *active* (Seated, not Complete) party. If it is, inline error: `Table <N> is occupied by <Party>. Seat anyway?` with an override button.
- **R17** `table_number` SHALL be emitted on the existing waitlist analytics event stream so downstream systems can join to POS.
- **R18** The host's selected ETA mode (Manual/Dynamic) and current averages SHALL be unaffected by this dialog.

**Acceptance (R14–R18):**
- *Given* a waiting party, *when* the host taps **Seat**, *then* the Seat Party dialog opens and focus lands in the Table # input.
- *Given* the host enters `12` and confirms, *when* the party transitions to Seated, *then* the Seated tab shows `12 · Patel · 4 · …`.
- *Given* the host enters `12` but table 12 is already occupied by the Kim party, *then* the dialog shows the conflict error and requires an explicit override to proceed.
- *Given* the host presses Escape in the dialog, *then* the party remains in Waiting.

### 3.4 Non-functional requirements
- **R19** All UI changes SHALL keep WCAG AA contrast. New action buttons SHALL have `aria-label`s and be keyboard-reachable in row order.
- **R20** Customer view polling SHALL be rate-limited server-side to 1 req / 5s / token.
- **R21** The Chat slide-over SHALL render the last 50 messages on open; earlier history is lazy-loaded on scroll-to-top.

### 3.5 Open questions
- **OQ1** Should the customer view show the full list *or* only the parties ahead of the viewer? (Spec currently says full list, per the user's direct ask that it match Waitly — but some operators may consider it PII-adjacent.)
- **OQ2** For last-name privacy, is `first name + last initial` acceptable, or should we use first name only?
- **OQ3** Should **Call** log the event only, or also open a post-call outcome prompt (`Answered / No answer / Voicemail`)?
- **OQ4** Does the restaurant have a canonical table-number list we can seed the quick-pick chips from, or do we learn them from recent use?

---

## 4. Compliance Analysis

No project-level compliance regulations are configured in `fraim/config.json`. Inferred applicable regimes for a restaurant waitlist app handling guest PII and SMS in the US:

| Regime | Relevance | Controls in this spec |
|---|---|---|
| **TCPA** (US SMS consent) | Sending SMS to a guest phone | R10 chat reuses the existing SMS gateway — consent is already captured at check-in when the phone is entered for notifications. No new opt-in flow required; new quick-reply templates SHALL be reviewed by operations before release. |
| **CAN-SPAM** | Not applicable (no email) | — |
| **General PII minimization** | Customer view shows other guests' names | R3 limits the public list to `first name + last initial`. Full last name is visible only on the host stand, which is behind a PIN. |
| **WCAG 2.1 AA** | Accessibility baseline | R19 explicit. |
| **PCI-DSS** | Not applicable (no card data in this feature) | — |

There are no HIPAA/SOC2/GDPR-specific controls triggered by this feature at the data level, but if the project later declares GDPR applicability, OQ1/OQ2 must be resolved in the privacy-minimizing direction.

---

## 5. Competitive Analysis

| Product | Customer waitlist transparency | Host comms | Seat → table capture |
|---|---|---|---|
| **Waitly** | Shows the guest a live page with *their* position, promised time, and elapsed wait, and renders every other party ahead of them with first name + last initial. This is the reference pattern the user asked for. | 1-tap SMS preset + custom SMS. No in-app two-way chat in the base tier. | Optional table number on seat. |
| **Yelp Waitlist (SeatMe)** | Guest gets SMS updates + a web page with *their own* position only. Does not list other parties. | 1-tap text + call from row. | Table number required on seat. |
| **NextMe** | Guest page shows position + ETA. Other parties not listed. | 1-tap text templates + call. | Table assignment optional, separate "table picker" step. |
| **OpenTable GuestCenter** | Primarily reservations; walk-in waitlist shows guest-only status. | 2-way messaging available as a paid add-on. | Table assignment via floor plan (heavier UX than we need). |

**Differentiation & risk:**
- By showing the *full* list (R3) we match **Waitly** most directly. This is a differentiator vs. Yelp / NextMe and is exactly what the user asked for, but it is the most PII-exposed choice — hence R3's first-name-last-initial constraint and OQ1.
- Adding in-app **Chat** + **Call** as first-class row actions (R9) brings SKB to parity with what Yelp Waitlist and NextMe bundle for free, without removing the existing custom-compose paths — we strictly add, not replace.
- **Seat → table #** (R14–R17) is table stakes at Yelp Waitlist; SKB currently lacks it, so this closes a gap rather than creating a differentiator.

---

## 5.1 Design Standards Applied

No project-specific design system is configured in `fraim/config.json`. Mocks in `docs/feature-specs/mocks/` were built against the **generic UI baseline**:

- Dark theme keyed off the existing Host Stand (`SKB · Host Stand`) palette observed in the state snapshots — surface `#171a21`, line `#2a2f3a`, accent amber `#ffb347`, ok green `#4ade80`, warn red `#f87171`.
- System font stack, 14–16px body, tabular-nums for all time/position columns so numbers don't jiggle as they tick.
- 16px / 10px radii, 1px hairline borders, low-shadow cards — consistent with the existing host-stand table frame.
- Row action buttons share the existing host-stand button shape/size so **Chat** and **Call** visually nest with the existing **Seat / Notify / Custom SMS / Custom Call** buttons rather than standing apart.
- WCAG AA contrast verified for all text on surface colors; focus rings on the table-# input and composer.

If a project-specific design system is introduced before implementation, re-skin the mocks against it; structure and copy do not need to change.

## 6. UX Mocks

High-fidelity HTML/CSS mocks live alongside this spec:

- `docs/feature-specs/mocks/37-customer-waitlist.html` — customer view with header card, live list, terminal states.
- `docs/feature-specs/mocks/37-host-party-actions.html` — host stand Waiting row with the new Chat + Call buttons beside the existing actions, plus Chat slide-over.
- `docs/feature-specs/mocks/37-host-seat-dialog.html` — Seat Party dialog with table number input, quick-pick chips, conflict error state.

All three mocks are self-contained (no build step) and are the canonical design source for implementation — per the `No Markdown Mocks` principle, do not re-derive UI from this document.

---

## 7. Rollout & Measurement

- **Feature flags:** `customer_waitlist_view_v1`, `host_row_chat_call_v1`, `seat_table_capture_v1` — ship independently, dark-launch per restaurant.
- **Metrics to watch (pre/post):**
  - Avg `Waiting → Seated` time (expect flat)
  - No-show rate on parties that opened the customer link at least once (expect ↓)
  - Ratio of `Chat` taps vs. `Custom SMS` taps (expect Chat to dominate)
  - % of Seated rows with a `table_number` populated (expect → 100% after flag on)
- **Kill criteria:** if customer view polling drives gateway cost > 2× current, switch to SSE before GA; if the full-list design produces a single PII complaint, fall back to "ahead of you only" (OQ1).
