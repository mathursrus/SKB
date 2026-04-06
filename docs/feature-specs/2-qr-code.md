# Feature: QR Code for Restaurant Door

Issue: [#2](https://github.com/mathursrus/SKB/issues/2)
Owner: Claude (agent)

## Customer

**Restaurant operator (host/owner)** — needs a way to make the digital waitlist discoverable to walk-in diners without relying on verbal instructions from staff.

## Customer's Desired Outcome

- "Diners discover and join the waitlist on their own, without me having to explain it to every party."
- "I print one sheet, tape it to the door, and it just works."

## Customer Problem being solved

The Place-in-Line feature (Issue #1) gives diners a great self-service waitlist, but only if they know it exists. Today the host must verbally tell each arriving party about the URL. During peak hours the host is too busy, so most diners never learn about the digital waitlist and stand around with no visibility into their wait time. A printed QR code at the restaurant entrance solves discoverability with zero ongoing effort from staff.

## User Experience that will solve the problem

### Print flow (one-time setup, operator)

1. Operator opens `https://skb-waitlist.azurewebsites.net/qr.html` on any device.
2. The page displays:
   - SKB-branded header (matching the diner page: black background, gold accent, Fira Sans).
   - A large, high-contrast QR code encoding the URL `https://skb-waitlist.azurewebsites.net/queue.html`.
   - The text **"Shri Krishna Bhavan"** above the QR code.
   - The text **"Scan to join the waitlist"** below the QR code.
   - A subtle footer: **"No app needed - No account - Just scan & join"**.
3. Operator uses the browser's native Print dialog (Ctrl+P / Cmd+P) to print the page.
4. Operator tapes the printout to the restaurant's front door or host stand.

### Diner flow

1. Diner arrives at the door, sees the printed QR code.
2. Diner scans the QR code with their phone camera.
3. Phone opens `/queue.html` in the browser — the existing Place-in-Line diner experience.

## Functional Requirements (traceable)

| ID | Requirement |
|---|---|
| R1 | The system SHALL serve a static page at `/qr.html` containing a QR code that links to the production diner page (`https://skb-waitlist.azurewebsites.net/queue.html`). |
| R2 | The QR code SHALL be rendered as an inline SVG element for crisp printing at any size. |
| R3 | The page SHALL use SKB brand styling: Fira Sans font family, black (`#000`) header area, gold (`#e3bf3d`) accent, matching the existing diner page design language. |
| R4 | The page SHALL include the restaurant name "Shri Krishna Bhavan" and instructional text "Scan to join the waitlist". |
| R5 | The page SHALL include a `@media print` stylesheet that removes background colors, hides browser chrome, and ensures the QR code and text print in high contrast (black on white) without wasting ink. |
| R6 | The QR code SHALL be sized at a minimum of 200x200 CSS pixels on screen and scale appropriately for print (targeting ~3 inches / ~7.5 cm square at 300 DPI). |
| R7 | The page SHALL NOT require JavaScript to display the QR code (static SVG, not dynamically generated). |
| R8 | The page SHALL be mobile-friendly (responsive viewport meta tag) so the operator can preview it on a phone before printing from a desktop. |

## Acceptance Criteria (Given/When/Then)

- **AC-R1**: *Given* the app is running, *when* a user navigates to `/qr.html`, *then* the page loads successfully (HTTP 200) and contains a visible QR code.
- **AC-R1 (scan)**: *Given* the QR code is displayed on screen or printed, *when* a diner scans it with a phone camera, *then* the phone opens `https://skb-waitlist.azurewebsites.net/queue.html`.
- **AC-R2**: *Given* the page source, *when* inspected, *then* the QR code is an inline `<svg>` element (not a raster image).
- **AC-R3**: *Given* the page is loaded in a browser, *when* compared to `/queue.html`, *then* the header uses the same black background, gold `SKB` mark, and Fira Sans typography.
- **AC-R5 (print)**: *Given* the user triggers Print Preview, *when* the print stylesheet applies, *then* background colors are removed, the QR code remains fully visible in black on white, and no unnecessary page elements (scrollbars, shadows) appear.
- **AC-R7**: *Given* JavaScript is disabled in the browser, *when* the user navigates to `/qr.html`, *then* the QR code and all text are fully visible.

## Edge Cases

- **QR code too small when printed**: The SVG scales with the page; at standard letter/A4 size, the 200px minimum maps to approximately 3 inches. If the operator prints at a reduced scale, the QR may become hard to scan. Mitigation: center the QR code prominently and add a print-media rule that sets it to a fixed physical size (`width: 3in`).
- **Production URL changes**: The QR code is a static SVG encoding a hardcoded URL. If the production domain changes, the SVG must be regenerated and the file updated. This is acceptable for v1; a dynamic endpoint could address this later.
- **Dark mode / high-contrast OS settings**: The print stylesheet forces black-on-white regardless of OS theme, ensuring consistent output.
- **Multiple locations**: This spec assumes a single SKB location (Bellevue). If a second location is added, a separate QR page or a parameterized URL (`/queue.html?location=bellevue`) would be needed. Out of scope for v1.

## Validation Plan

- **Manual (browser)**: Open `/qr.html` in Chrome and Firefox; confirm the page renders with correct branding, QR code is visible, and text reads correctly.
- **QR scan test**: Display `/qr.html` on a laptop screen; scan with an iPhone and an Android phone; confirm both open `/queue.html` on the production domain.
- **Print test**: Use Print Preview in Chrome; confirm the output is clean black-on-white with no background fills, the QR code is sharp, and the page fits on a single sheet.
- **No-JS test**: Disable JavaScript in browser DevTools; reload `/qr.html`; confirm the QR code and all content render correctly.
- **Accessibility**: Verify the QR code SVG has an appropriate `aria-label` or `<title>` element for screen readers.

## Alternatives Considered

| Alternative | Why not chosen for v1? |
|---|---|
| Dynamic `GET /api/qr?url=...` endpoint using `qrcode` npm package | Adds a runtime dependency and a new route for something that changes essentially never. A static SVG checked into `public/` is simpler, has zero runtime cost, and is trivially cacheable. Can be added later if needed (e.g., for per-location QR codes). |
| Static SVG file at `/qr.svg` (no wrapper page) | A raw SVG has no branding, no instructional text, and prints poorly without a containing page. The operator would need to create their own flyer. A full HTML page with print styles is marginally more work but dramatically more useful. |
| Third-party QR code generator (e.g., qr-code-generator.com) | Creates an external dependency; operator must re-generate if URL changes; no SKB branding; no version control. |
| NFC tag instead of / in addition to QR | Higher hardware cost; not all phones support NFC tap-to-URL; QR is universally supported. NFC could be a future enhancement. |
| Embedding the QR code directly on `queue.html` | The diner page is for joining the queue, not for printing. Mixing print-optimized layout into the interactive page adds unnecessary complexity. A dedicated `/qr.html` keeps concerns separated. |

## Implementation Notes

- The QR code SVG can be generated once using any offline tool (e.g., `qrcode` CLI, Python `qrcode` library, or an online generator) and committed as part of the inline HTML.
- The page should reuse `/styles.css` for shared brand tokens (CSS custom properties) and add a small `<style>` block for print-specific and QR-page-specific rules.
- No new npm dependencies are required.
- No backend changes are required — the file is served by the existing `express.static(publicDir)` middleware.

## Open Questions

- Should the QR page include the restaurant's street address for additional context on the printout?
- Should we add a small "Powered by SKB Waitlist" or similar footer, or keep it minimal?
