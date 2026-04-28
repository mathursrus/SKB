# Feature: Mobile usability fixes for diner waitlist join + host stand

Issue: [#103](https://github.com/mathursrus/SKB/issues/103)
Owner: @mathursrus
Status: Draft (FRAIM `feature-specification`)
Date: 2026-04-28

## Customer

Two distinct customer roles are affected, and the operator-feedback report came from the host (B):

- **(A) Walk-in diner.** A hungry diner who has just arrived at SKB (or any OSH-tenant restaurant) and wants to add themselves to the waitlist on their own phone, typically standing inside the entryway in portrait orientation.
- **(B) Restaurant host / front-of-house operator.** Manages the waitlist on a phone or shared device while moving between the host stand, kitchen, and dining floor. **A specific operator stopped using OSH and agreed to retry once these two issues are fixed.**

## Customer's Desired Outcome

- (A) Diner: "I open the QR code page and I'm on the waitlist within 15 seconds, without scrolling around to find the form."
- (B) Host: "I can do my whole shift from my phone — add walk-ins, call parties, seat them, and watch the waiting/seated counts — without pinch-zooming into a tablet layout."

## Customer Problem being solved

### Problem 1 — Diner has to scroll to find the join form (`public/queue.html`)

On a typical 375 × 667 phone viewport the page stack is:

| Section | Approx. height |
|---|---|
| Black header (mark + brand + "Place in Line" sub) | ~120 px |
| "Waitlist / Order" tabs | ~50 px |
| "Parties waiting" status card with ETA | ~165 px |
| **(form starts here)** | ~335 px from top |

The join form itself (3 inputs + SMS-consent block + submit) is ~500–600 px tall, so the **"Join the line"** button lands ~830–930 px from the top — well below the 667 px fold. The diner has to scroll deliberately, which is friction at the highest-conversion moment of the product.

### Problem 2 — Host page is locked to a desktop viewport (`public/host.html`)

`public/host.html` line 5:

```html
<meta name="viewport" content="width=1024,initial-scale=1" />
```

The page is explicitly locked to 1024 px, so phones scale the entire layout down to fit. The 9-control topbar (brand, 3 counts, ETA mode select, turn-time input, "+ Add party", "Open Admin", theme, "Log out") and the up-to-11-column Seated table become illegibly small with sub-44 px tap targets. **This violates project rule #5 (mobile-first UI).**

## User Experience that will solve the problem

### (A) Diner waitlist (`/queue`)

Mock: [`docs/feature-specs/mocks/103-queue-mobile.html`](mocks/103-queue-mobile.html)

1. Diner scans the table-tent QR code; lands on `/queue?code=<restaurant>`.
2. The page renders with a **compact black header** (~80 px, brand mark inline with the name — no separate "Place in Line" sub) and a **slim status strip** (~36 px) showing `12 in line · ~25 min wait`.
3. The **"Join the line" card is the dominant element above the fold** — `Your name` field is the focus target on first paint. Party size + phone share a horizontal row to save vertical space (single-column fallback at ≤ 320 px).
4. SMS consent block is preserved verbatim (TFV 30513 + #69 contract — see *Compliance* below) but visually demoted into a soft-grey supporting block.
5. Diner submits → existing happy-path response (position card replaces the form, with status strip still on top).
6. If the diner returns later (deep link `?code=X`), they see the position card directly — same as today; the boot-flicker handling in `queue.js` (`.queue-boot` → `.queue-ready`) is unchanged.

### (B) Host stand (`/host`)

Mock: [`docs/feature-specs/mocks/103-host-mobile.html`](mocks/103-host-mobile.html)

1. Restore `<meta name="viewport" content="width=device-width,initial-scale=1">`.
2. **At < 720 px (phone):**
   - Topbar collapses brand + 3 icon buttons (theme, admin, logout) into a single 36 px-tall strip; the 3 counts move into their own thin row below.
   - Tabs (Waiting / Seated / Complete) keep full width.
   - Each tab's `<table>` is **replaced by a stacked card list**: one card per party with name, size, phone, waiting time, and 4 action buttons (Call / Seat / Chat / No-show — all ≥ 44 × 44 px). The Seated tab uses a single dominant action ("Mark served" or "Checkout" depending on state) plus secondary actions, so the host doesn't read 11 columns on a phone.
   - **A sticky bottom action bar** keeps the two highest-frequency host actions (`+ Add party` + ETA mode/turn-time) thumb-reachable without scrolling. The Add-party button is gold (`--accent`) so it's findable in a glance.
3. **At ≥ 720 px (tablet/desktop):** the existing table layouts are preserved unchanged. The breakpoint is the single switch between card-stack and table — no separate code path.
4. Existing dialogs (`add-party-dialog`, `seat-dialog`, `custom-sms-dialog`, `custom-call-dialog`, `chat-drawer`) keep their current logic; only the `dialog` width / padding / button-row needs `@media` tightening for ≤ 375 px. (The chat drawer already slides over from the side and is mobile-friendly.)

## Functional requirements

| ID | Requirement | Scope |
|---|---|---|
| **R1** | The diner waitlist join form's submit button SHALL be visible without scrolling on a 375 × 667 viewport in the empty state (no party joined yet). | `public/queue.html` |
| **R2** | The diner waitlist page SHALL preserve the existing SMS-consent block copy verbatim (TFV 30513 wording + the OSH-as-sender disclosure required by issue #69). Visual demotion is allowed; copy changes are not. | `public/queue.html` |
| **R3** | At viewport widths ≤ 320 px, the party-size and phone inputs SHALL fall back to single-column stacking (the 2-up row is for 321–480 px). | `public/styles.css` |
| **R4** | `public/host.html` SHALL set `<meta name="viewport" content="width=device-width,initial-scale=1">`. The hard-coded `width=1024` MUST be removed. | `public/host.html` |
| **R5** | At viewport width < 720 px, the host page's Waiting / Seated / Complete tabs SHALL render each party as a stacked card (not a table row). At ≥ 720 px the existing table layouts are preserved unchanged. | `public/styles.css`, `public/host.js` |
| **R6** | All host-page interactive elements (action buttons, tabs, dialog buttons, chat-drawer composer) SHALL have a tap target ≥ 44 × 44 px on viewports < 720 px (WCAG 2.1 SC 2.5.5 Level AAA, recommended for restaurant-floor use). | `public/styles.css` |
| **R7** | The host page SHALL provide a sticky bottom action bar at viewport width < 720 px containing the "+ Add party" button and the ETA mode + turn-time controls. | `public/host.html`, `public/styles.css` |
| **R8** | At viewport width < 720 px, the host topbar SHALL collapse the existing icon buttons (theme, "Open Admin", logout) into 36 × 36 px icons; full text labels are reserved for ≥ 720 px. | `public/host.html`, `public/styles.css` |
| **R9** | The page SHALL NOT introduce any horizontal scrolling on viewport widths between 320 px and 1280 px on either `/queue` or `/host`. | `public/styles.css` |
| **R10** | The critical waitlist path tests MUST stay green (project rule #7). Implementation PR adds Playwright responsive tests at 375 / 768 / 1280 in light + dark mode (project rule #19). | tests |

### Acceptance criteria (Given / When / Then)

- **AC-R1.** *Given* a diner on a 375 × 667 viewport, *when* they navigate to `/queue?code=skb`, *then* the "Join the line" submit button SHALL be within the initial viewport (no scroll).
- **AC-R4.** *Given* a host on a 375 × 667 phone, *when* they navigate to `/host` and unlock with the PIN, *then* the page SHALL render at full mobile resolution (no pinch-zoom required) with `document.documentElement.clientWidth ≤ 400 px` after auto-fit.
- **AC-R5.** *Given* the host on a 375-px viewport with 5 waiting parties, *when* they view the Waiting tab, *then* each party SHALL render as a card (no `<table>` rows visible to the user).
- **AC-R7.** *Given* the host on a 375-px viewport, *when* the page is at the top of the Waiting tab, *then* "+ Add party" SHALL be visible at the bottom of the viewport without scrolling.
- **AC-R10.** Playwright assertion suite at 375 / 768 / 1280 in light + dark mode reports zero regressions on the critical waitlist path (`tests/waitlist-flow.spec.ts` and equivalents).

### Error states

- Network failure on `Join the line`: existing inline error pattern preserved (`#join-error`); on mobile this banner stays inside the visible card so the user doesn't have to scroll up to see it.
- Host loses connection while sticky action bar is up: the bar dims to 60 % opacity and prepends "Reconnecting…" text in the same row; existing toast/alerts unchanged.
- ≤ 320 px screen (e.g., older Android budget device): single-column form, action bar still pinned, but ETA control collapses to icon-only with a tap-to-expand sheet (out of scope for this issue if data shows < 1 % of traffic; flagged as Open Question).

### Open Questions

- **OQ-1.** Do we want to keep the "Place in Line" subhead on the diner page header, or fully remove it on mobile? Mock removes it. Owner decision needed at PR time. *Default: remove on < 480 px, restore on ≥ 480 px.*
- **OQ-2.** Should the "+ Add party" button on the host action bar use the gold accent (`--accent`) or stay black-primary like the rest of the app? Mock uses gold to draw the host's eye. *Default: gold.*
- **OQ-3.** Below 320 px, do we collapse the ETA control into an icon-only sheet, or just let it overflow horizontally? Negligible traffic, but called out for completeness. *Default: out-of-scope this issue; revisit if telemetry shows >1 %.*

## Design Standards Applied

`fraim/config.json` does not configure a project-specific design system, so the **generic UI baseline** is used. The mocks intentionally mirror the existing `public/styles.css` token set (Black `#000` + White `#fff` + Gold `#e3bf3d`, Fira Sans, 12 px / 14 px / 16 px / 56 px scale, 8 px / 10 px / 12 px border-radius scale). No new tokens introduced. Mocks are self-contained HTML with all styles inline (per Sid's spec-mock preference, 2026-04-15) so the restaurant owner can open them in any browser without a build step.

## Compliance Requirements

`fraim/config.json` does not declare any compliance regulations for this project. The two surfaces touched here have **no PII storage changes, no SMS/TCPA copy changes, and no auth changes** — they are layout-only edits on already-shipped server-rendered pages. The relevant existing constraints that this spec MUST NOT regress:

- **TCPA / TFV 30513 (waitlist SMS opt-in).** SMS consent on `/queue` is opt-in via an unchecked checkbox separate from the join action. Copy and the OSH-as-sender disclosure (issue #69) are preserved verbatim — see R2.
- **Project rule #7.** Critical waitlist path stays green. Tests covering join, ETA, notification, seating, and no-show flows MUST be updated/extended in the implementation PR — see R10.
- **WCAG 2.1 AA accessibility.** Tap target ≥ 44 × 44 px (SC 2.5.5 — recommended for the restaurant-floor host use case) and ≥ 4.5 : 1 contrast (preserved from existing tokens) — see R6. The redesign actually improves a11y vs. today's tablet-shrunk-on-phone state.

No formal compliance review needed beyond the existing project-rule guardrails.

## Validation Plan

1. **Browser validation (375 / 768 / 1280, light + dark, project rule #19).** A new Playwright suite under `tests/responsive/103-mobile-usability.spec.ts` SHALL:
   - load `/queue?code=<seeded-restaurant>` at each viewport, assert the `Join the line` button is in-viewport in the empty state (R1, AC-R1).
   - load `/host`, log in with seeded PIN, assert (a) at 375-px there is no `<table>` rendered in the active tab (R5), (b) `+ Add party` is in the bottom 96 px of the viewport (R7), (c) zero horizontal overflow (R9).
   - re-run all assertions in dark mode.
2. **Critical-path regression.** Existing waitlist-join, ETA, notification, seating, and no-show test files MUST run green (project rule #7).
3. **Manual operator validation.** Once deployed, ship a single message to the operator who provided the feedback, with a fresh tenant link they can poke at on their own phone. Capture screenshots if they push back.
4. **Compliance validation.** Greppable assertion that the SMS-consent block in `queue.html` still contains the literal strings `OSH` (sender disclosure), `STOP` (TCPA opt-out), and the `Privacy Policy` + `SMS Terms` links (R2). Project rule #14 (two-sided contract: admin saves → public renders) does not apply here — no admin-write surface is touched.

## Alternatives

| Alternative | Why discard? |
|---|---|
| Keep the existing diner page; add a "Skip to form" anchor link in the header | Doesn't fix the underlying density problem and adds an extra tap. The form should be the primary content, not a destination linked from the page's own header. |
| Replace the host page with a separate `/host-mobile` route | Forks the codebase. Two surfaces to maintain, two test matrices, two security audits. Responsive-CSS-only fix (R5) is materially simpler. |
| Build a native iOS/Android host app | Right answer eventually, but completely out of proportion to "operator feedback says this is broken on mobile" — months of work vs. a focused CSS pass. Track for later as #12 (multi-location) successor. |
| Keep `viewport=1024` on host but apply transform-scale CSS to fake mobile fit | Loses tap-target accuracy (44 px becomes 16 px), kills accessibility, masks the underlying mobile-first violation. Pure tech debt. |

## Competitive Analysis

### Configured Competitors Analysis (waitlist-relevant subset, from `fraim/config.json`)

| Competitor | Diner-side mobile experience | Host-side mobile experience | Source |
|---|---|---|---|
| Yelp Guest Manager / Yelp Host | Marketed as a remote-waitlist add to Yelp (diner SMS receives a Yelp-hosted waitlist link). Form-first mobile pattern is industry standard here. | Yelp Host is positioned as an **iPad-first** host stand product. | https://business.yelp.com/restaurants/products/yelp-host/ |
| Waitwhile | Web check-in form is mobile-first; SMS notifications. | Marketed for both phone and tablet host use; cards-on-mobile pattern is standard. | https://waitwhile.com |
| Waitlist Me | Mobile waitlist with iOS/Android native host apps. | Native phone-first host app (not just a web tablet UI). | https://www.waitlist.me |
| NextMe | Phone-first guest check-in via web link. | Web + native host apps; phone-friendly. | https://www.nextmeapp.com |
| TablesReady | Phone-first guest check-in via SMS link. | Web app marketed for phone or tablet. | https://www.tablesready.com |
| Waitly | Phone-first guest check-in. | Web app on phone or tablet. | https://waitly.com |

[unverified] mark applies to specific UI affordance claims beyond what's visible on each public marketing page; we did not sign in to each tool to inspect the actual surface. For this spec, the relevant signal is: **every named competitor offers a phone-usable host experience.** OSH currently does not. Today's `viewport=1024` lock makes us the outlier.

### Competitive Positioning Strategy

#### Our Differentiation

- **Key Advantage 1 — Phone-first host stand.** Most competitors position their host product as iPad/tablet-first with mobile as an afterthought. SKB/OSH's actual operator base is small Indian restaurants where the host runs the floor with their own phone. Phone-as-primary is the right shape for that ICP.
- **Key Advantage 2 — Single coherent surface.** No separate "host mobile app" download; the responsive web page works on any phone the host already has.
- **Key Advantage 3 — Diner: zero-app, zero-account.** Already a differentiator; this fix just removes a friction point that was eroding it.

#### Competitive Response Strategy

- **If competitors ship a phone-friendly host UI:** the differentiation collapses to brand voice + diner-side simplicity, both of which are stable advantages.
- **If competitors compete on diner UX:** R1 (form-above-fold) is table stakes; this PR is the price of admission.

#### Market Positioning

- **Target Segment:** small/mid independent restaurants where the host carries their own phone. Operator feedback driving this issue is from exactly that segment.
- **Value Proposition:** "Run the wait from your phone." The host doesn't need a tablet, doesn't need a kiosk, doesn't need an app store install.

### Research Sources

- `fraim/config.json` competitor URLs (each cited above).
- Operator feedback (verbal, captured by @mathursrus, 2026-04-28) summarized in issue #103.
- Date of research: 2026-04-28. Methodology: marketing-page review only; no signed-in inspection of competitor host UIs (would require paid trials and was out of scope for this layout-only spec).

## Requirement traceability (R-tag map)

Per project rule #20, each R-tag from above is addressed in the listed section so the implementation RFC and PR review can verify coverage.

| R-tag | Addressed in section |
|---|---|
| R1 | UX (A), Acceptance criteria AC-R1, Validation Plan §1 |
| R2 | UX (A) step 4, Compliance Requirements §1, Validation Plan §4 |
| R3 | UX (A), Error states §3 (≤ 320 px), Functional requirements table |
| R4 | UX (B) step 1, Acceptance criteria AC-R4 |
| R5 | UX (B) step 2, Acceptance criteria AC-R5, Validation Plan §1 |
| R6 | UX (B) step 2, Compliance Requirements §3 |
| R7 | UX (B) step 2 + sticky-action-bar bullet, Acceptance criteria AC-R7 |
| R8 | UX (B) step 2 |
| R9 | Validation Plan §1 |
| R10 | Compliance Requirements §2, Validation Plan §1+§2 |
