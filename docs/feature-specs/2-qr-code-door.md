# Feature: QR Code for Waitlist at the Restaurant Door

Issue: [#2](https://github.com/mathursrus/SKB/issues/2)
Owner: Claude (agent)

## Customer

**Walk-in diner** — arrives at Shri Krishna Bhavan and is standing at the entrance, possibly during a busy period. They do not know a digital waitlist exists and currently rely on the host to tell them about it (if they are told at all).

## Customer's Desired Outcome

"I can see the QR code on the door, scan it with my phone, and immediately join the waitlist without waiting to speak to the host first."

## Customer Problem being solved

The digital waitlist (issue #1) only works if diners know it exists. Today, discoverability depends entirely on the host verbally telling each arriving party about the queue page. During peak times the host is overwhelmed, and many diners either:
- Stand around not knowing they can self-serve, increasing perceived wait time.
- Leave without ever learning they could have joined the line digitally.

A prominent QR code at the entrance makes the waitlist self-discoverable, removing the host as a bottleneck for queue awareness.

## User Experience that will solve the problem

### Diner flow

1. Diner walks up to the restaurant entrance.
2. Diner sees a branded card/poster with a QR code and the text **"Scan to join the waitlist"**.
3. Diner points their phone camera at the QR code.
4. Phone opens `https://skb-waitlist.azurewebsites.net/queue.html` in the default browser.
5. Diner sees the existing Place-in-Line page and can join the queue immediately.

### Host flow (no change)

No host interaction is required. The host's workflow is unchanged; they continue to manage the queue via `/host`. The QR code simply increases the rate at which diners self-onboard.

### Print / deployment flow (one-time setup)

1. Developer generates the QR code SVG and checks it into `public/qr.svg`.
2. Restaurant owner downloads or prints the branded card from `docs/feature-specs/mocks/2-qr-printout.html`.
3. Card is laminated and mounted at the entrance door, and optionally placed as table tents or on takeout bags.

### UI mocks

- [`docs/feature-specs/mocks/2-qr-printout.html`](./mocks/2-qr-printout.html) — branded printable card with QR code, call-to-action text, and restaurant branding. Open in browser and use Ctrl+P to preview print layout.

### Design Standards Applied

Used the **generic UI baseline** (no project-specific design system configured in `fraim/config.json`). The printable card uses SKB brand colors: black (`#111`) foreground, white (`#fff`) background, gold accent (`#e3bf3d`) border. Typography is Fira Sans, matching the existing `queue.html` and `styles.css`. The QR code itself uses standard black-on-white modules for maximum scan reliability.

## Functional Requirements (traceable)

| ID  | Class         | Requirement |
|-----|---------------|-------------|
| R1  | Functional    | The repository SHALL contain a static SVG file at `public/qr.svg` that encodes the URL `https://skb-waitlist.azurewebsites.net/queue.html` as a scannable QR code. |
| R2  | Functional    | The QR code SHALL be servable via `GET /qr.svg` through Express static file serving (already configured for the `public/` directory). |
| R3  | Functional    | The printable card asset SHALL include the restaurant name "Shri Krishna Bhavan", the "SKB" brand mark, and the call-to-action text "Scan to join the waitlist". |
| R4  | Data          | The QR code SHALL encode the exact production URL with no tracking parameters, redirects, or URL shorteners. |
| R5  | Non-functional| The QR code SHALL use error correction level H (high, ~30% recovery) to tolerate partial obscuring from door glass, wear, or poster damage. |
| R6  | Non-functional| The QR code SHALL be print-ready at a minimum physical size of 2x2 inches at 300 DPI, ensuring reliable scanning from at least 12 inches away. |
| R7  | Non-functional| The QR code modules SHALL be black (`#000`) on white (`#fff`) background for maximum contrast and scan reliability across all phone cameras. |

### Acceptance criteria (Given/When/Then)

- **AC-R1**: *Given* the file `public/qr.svg` exists, *when* it is decoded by a QR reader, *then* the decoded text is exactly `https://skb-waitlist.azurewebsites.net/queue.html`.
- **AC-R2**: *Given* the Express server is running, *when* a browser requests `GET /qr.svg`, *then* the response is a valid SVG image with content-type `image/svg+xml`.
- **AC-R5**: *Given* the QR code is printed and 30% of the bottom-right corner is covered, *when* scanned by a modern smartphone, *then* it still resolves to the correct URL.
- **AC-R6**: *Given* the QR code is printed at 2x2 inches, *when* a smartphone is held 12 inches away, *then* the camera app recognizes and decodes the QR code within 2 seconds.

### Edge cases

- **URL change**: If the production URL changes (e.g., custom domain), the SVG must be regenerated and redeployed. Document this in README.
- **Low-light scanning**: Black-on-white QR codes are the standard for low-light; no special handling needed beyond ensuring the card surface is not glossy/reflective.
- **Already-in-queue diner re-scans**: No issue; `queue.html` handles this gracefully by showing the join form or their existing status.
- **Non-smartphone users**: The card includes the restaurant name and "waitlist" context, so a non-smartphone user at least knows a waitlist exists and can ask the host.

## Compliance Requirements (if applicable)

No formal regulations are configured in `fraim/config.json`. Compliance considerations inferred from project context:

- The QR code encodes only a public URL; no PII is embedded in the code itself.
- No analytics or tracking parameters are appended to the URL.
- The `queue.html` page already handles PII minimization (name + optional phone-last-4 only, per issue #1 spec).
- No additional compliance controls are required for this feature.

## Validation Plan

- **QR decode verification**: Use an online QR decoder (e.g., zxing.org/w/decode) or phone camera to confirm the SVG decodes to the exact production URL.
- **Browser serving**: Start the Express server locally and request `GET /qr.svg`; verify the SVG renders in the browser.
- **Print test**: Print `docs/feature-specs/mocks/2-qr-printout.html` via browser; scan the printed QR code from a phone at ~12 inches.
- **Partial-cover test**: Cover ~30% of the printed QR code and verify it still scans (validates H-level error correction).
- **End-to-end**: Scan QR code -> land on queue.html -> join the waitlist -> verify entry appears on host.html. This exercises the critical waitlist path (project rule 7) but does not require new automated tests since the QR code is a static asset.
- **Compliance validation**: Decode the QR payload and assert no tracking parameters or PII are present.

## Alternatives

| Alternative | Why discard? |
|---|---|
| Dynamic `GET /api/qr` endpoint using the `qrcode` npm package | Adds a runtime dependency and a new route for a code that changes extremely rarely. Static SVG is simpler, zero-dependency, and cacheable forever. Revisit if per-table or per-event QR codes are needed later. |
| URL shortener (bit.ly, etc.) in the QR code | Adds a third-party dependency and a redirect hop. If the shortener goes down, the QR code is dead. Direct URL is more reliable. |
| NFC tag at the door instead of QR | Higher hardware cost; not all phones have NFC enabled by default; QR is universally supported. NFC could be a future supplement, not a replacement. |
| Printed URL text instead of QR code | Requires diners to manually type a long URL. QR code is one tap. |
| Rely on host to verbally tell every diner | Status quo. Fails during peak hours when the host is busy. Does not scale. |

## Competitive Analysis

### Configured Competitors Analysis
No competitors configured in `fraim/config.json`.

### Additional Competitors Analysis

| Competitor | Current Solution | Strengths | Weaknesses | Customer Feedback | Market Position |
|---|---|---|---|---|---|
| Yelp Waitlist | Diners join via Yelp app; some restaurants have a Yelp QR code sticker | Built-in Yelp brand recognition; app ecosystem | Requires Yelp app install; restaurant loses data ownership; QR goes to Yelp, not restaurant's own page | "I don't want to download another app just to wait" | Dominant in casual dining |
| ScanQueue | QR code at the door; guest scans, joins queue, gets WhatsApp/SMS notification. Free tier with 10 customers/day. Paid: $99-249/mo. | Free plan with QR + dashboard; WhatsApp-first notifications; AI voice receptionist on paid plans; brandable | Free tier limited to 10 customers/day (insufficient for SKB peak); paid plans expensive for single location; third-party dependency | "Easy to set up but free plan runs out fast on busy nights" | Growing mid-market; QR-first positioning |
| WaitQ | Self check-in via QR code at door; SMS/WhatsApp notifications; public TV display; branded waiting room. $17/mo. | Very affordable ($17/mo); fast 5-min setup; public TV display for waiting area; walk-in focused design | Still a SaaS dependency; restaurant doesn't own the code or data; limited customization on lower tiers | "Clean and fast, built for walk-ins" | Niche walk-in focused; newer entrant |
| TablesReady | QR code, text-to-join, or website embed. Guest sees place in line on branded page. Free tier or $39-49/mo. | Multiple check-in methods (QR, text, web); Reserve with Google integration; 2,500 texts included | Higher cost for full features; more complex than needed for a single restaurant; still third-party hosted | "Solid but overkill for a small place" | Established mid-market; broader than waitlist-only |
| Waitly | Shareable link; no standard QR-at-door solution | Simple web link; no app install | No branded print asset; restaurant must generate own QR code | "Simple but no help getting customers to discover it" | Mid-market |
| NextMe | SMS-based; optional QR code add-on in paid tier | QR code generation included | Paid feature; QR links to NextMe-branded page, not restaurant's own | "Works but looks generic" | Small restaurants |
| Paper list (baseline) | No QR code; host takes names verbally | Zero tech overhead | Zero self-discovery; host bottleneck | "I left because nobody told me about a waitlist" | Vast majority of small independents |

### Competitive Positioning Strategy

#### Our Differentiation
- **Zero friction**: QR code goes directly to SKB's own branded page, not a third-party app or login screen. Unlike ScanQueue, WaitQ, or TablesReady, diners land on a page SKB fully owns and controls.
- **Zero cost**: Static SVG checked into repo; no SaaS fee. Competitors charge $17-249/month for QR-to-waitlist functionality that SKB gets for free.
- **Brand ownership**: The printed card uses SKB branding, reinforcing the restaurant's identity rather than a vendor's. Industry data shows restaurants using digital waitlists see 25% fewer walkaway guests.
- **No vendor lock-in**: The QR code encodes a direct URL to SKB's own infrastructure. If the restaurant changes hosting, only the SVG needs regeneration. No vendor contract to exit.

#### Market Positioning
- **Target Segment**: Single-location restaurants with walk-in waitlists and no existing digital discovery mechanism.
- **Value Proposition**: "Let diners find and join your waitlist the moment they arrive, without the host lifting a finger."
- **Pricing advantage**: Every competitor charges a monthly fee ($17-249/mo). SKB's approach costs nothing beyond the one-time effort of generating an SVG and printing a card.

### Research Sources
- [ScanQueue - QR Code Queue System](https://scanqueue.com/solutions/restaurants), accessed 2026-04-04
- [WaitQ - Digital Waitlist Management](https://waitq.app/), accessed 2026-04-04
- [TablesReady - Restaurant Waitlist App](https://www.tablesready.com/), accessed 2026-04-04
- [NextMe Waitlist App](https://nextmeapp.com/), accessed 2026-04-04
- Competitor websites (yelpforbusiness.com, waitly.com), accessed 2026-04-04
- [Best Restaurant Waitlist Apps in 2026 - EatApp](https://restaurant.eatapp.co/blog/best-restaurant-waitlist-management-systems), accessed 2026-04-04
- QR code best practices: ISO/IEC 18004 (QR code standard), error correction level guidance

## Implementation Guidance

### Recommended approach: Static SVG

1. Generate the QR code SVG offline using a tool like `qrcode` (npm), `qrencode` (CLI), or any QR generator that supports SVG output with error correction level H.
2. Save the output as `public/qr.svg`.
3. The existing Express static middleware already serves everything in `public/`, so no route changes are needed.
4. Create the branded printable card (the mock at `docs/feature-specs/mocks/2-qr-printout.html` serves as the template).

### What is NOT in scope

- Dynamic QR code generation endpoint (`GET /api/qr`) — deferred unless per-table or per-event codes are needed.
- QR code displayed within the web app itself (it is a physical-world artifact).
- URL shortening or redirect layers.
- Analytics on QR scans (can be added later via UTM parameters if desired, but not in v1).

## Open Questions

1. **Error correction level**: Should we use level H (~30% recovery, larger QR code) or level M (~15% recovery, smaller code)? Spec recommends H for door-mounted durability, but M produces a more compact image if size is a concern.
2. **Multiple sizes**: Should we generate multiple print-ready formats (door poster, table tent, takeout sticker) or just the single door card?
3. **Custom domain**: If SKB plans to move to a custom domain (e.g., `waitlist.skbrestaurant.com`), the QR code will need regeneration. Should we wait for the domain decision before generating the final QR code?
