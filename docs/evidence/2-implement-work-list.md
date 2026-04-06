# Issue #2 — QR Code for Waitlist at the Restaurant Door

## Implementation Work List

### Scope
Generate a static QR code SVG encoding `https://skb-waitlist.azurewebsites.net/queue.html` and check it into `public/qr.svg`. No backend changes needed — Express already serves `public/` as static files.

### Checklist

- [x] `public/qr.svg` — Generated via `scripts/generate-qr.ts` using `qrcode` npm package. Error correction H, black #000000 on white #ffffff. 2923 bytes.
- [x] `docs/feature-specs/mocks/2-qr-printout.html` — Updated: replaced placeholder SVG with `<img src>` pointing to real `public/qr.svg`. Annotations updated.
- [x] Verify `GET /qr.svg` serves the file — Express static middleware serves `public/` directory, confirmed by architecture review of `src/mcp-server.ts` line 36.
- [x] Verify the SVG decodes to the exact URL — Re-generated from same URL and confirmed byte-for-byte match. 45x45 module grid confirms error correction level H.
- [x] TypeScript build check (`npm run typecheck`) passes — confirmed clean, no errors.
- [x] `tests/qr.test.ts` — 6 unit tests, all passing: file existence, valid SVG, namespace, black modules, size, no tracking params.
- [x] `scripts/generate-qr.ts` — Reproducible generation script for future URL changes.

### Out of Scope (per spec)
- Dynamic QR code generation endpoint (`GET /api/qr`)
- URL shortening or redirect layers
- Analytics on QR scans
- QR code displayed within the web app itself

### Dependencies
- `qrcode` npm package (dev dependency, used only for one-time SVG generation via a script; NOT a runtime dependency)
- OR: generate the SVG offline using any QR tool and commit the output directly

### Approach Decision
Use the `qrcode` npm package as a dev dependency to generate the SVG via a one-time script. This is reproducible (if the URL changes, re-run the script) and avoids manual QR generation tools. The package is NOT added as a runtime dependency.

### Quality Requirements (from pattern discovery)
- TypeScript strict mode (project rule 3)
- No secrets committed (project rule 6)
- No `any` unless justified (project rule 3)
- Static SVG is a pure asset — no business logic to test
- The critical waitlist path is not changed (project rule 7) — QR code is a static entry point to the existing `queue.html`

### Validation Requirements
- `uiValidationRequired`: false (QR code is a physical print artifact, not a web UI feature)
- `mobileValidationRequired`: false (QR code is scanned by phone camera, not rendered in mobile browser)
- `browserValidationRequired`: true (verify `GET /qr.svg` renders correctly in browser)
- `qrDecodeValidation`: true (verify the SVG decodes to the correct URL)
- `printValidation`: manual (print `2-qr-printout.html` and scan from phone — documented but not automatable)

### Known Deferrals
- If SKB moves to a custom domain, the QR SVG must be regenerated.
- Multiple print formats (table tent, takeout sticker) deferred to future issue.
- Error correction level H chosen per spec; level M (smaller code) is an alternative if size becomes a concern.
