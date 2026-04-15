# Issue #45 — Implementation Work List

**Spec**: `docs/feature-specs/45-rip-and-replace-restaurant-website.md`
**Branch**: `feature/45-rip-and-replace-restaurant-website`
**Spec PR**: #47 (spec approved via inline review, admin refactor at PR #42 already on master — no pull needed)

## Scope summary

Three user-visible outcomes, all landing in one implementation PR:

1. **Replacement website served by the SKB Express app** — five new diner-facing pages (home, menu, about, hours & location, contact) under `/r/:loc/` and accessible at `skbbellevue.com/…` via host-header rewriting, replacing the current ~$200/mo CMS-hosted site.
2. **Admin-configurable per-location content** — `address` and `hours` become editable via the host admin UI (the refactored Visit Page card from PR #42). `frontDeskPhone` already exists on `Location` as an optional field and becomes a visible field in the admin UI.
3. **Two new IVR branches + front-desk transfer** — press 3 speaks a menu category overview, press 4 speaks hours and location (rendered server-side from `location.address` and `location.hours`), press 0 transfers to `location.frontDeskPhone`. The existing press 1 / press 2 branches are unchanged.

## Validation Requirements

- **uiValidationRequired**: **yes** — five new public-facing HTML pages, admin form additions. Target browsers: Chromium (latest) via Playwright. Target journeys:
  1. Load `/r/skb/` (home), verify hero + CTA + hours footer render
  2. Load `/r/skb/menu`, verify 13 categories / 79 items render, verify sticky category nav scrolls
  3. Load `/r/skb/about`, verify copy + dish strip render
  4. Load `/r/skb/hours`, verify hours table (Monday = Closed), Google Maps embed, parking block
  5. Load `/r/skb/contact`, verify form structure (no submit destination required for this spec — the email link is the submit)
  6. Load `/r/skb/host.html`, expand the Visit Page card, verify new Address + Hours + Front Desk Phone fields are present, editable, and save via POST /host/visit-config
- **mobileValidationRequired**: **yes** — emulator validation at iPhone SE (375×667), iPhone 14 Pro (393×852), iPad Mini (768×1024). No horizontal scroll, all CTAs visible without zoom.
- **Browser baseline validation**: Playwright-driven manual check captures screenshots + DOM assertions. Evidence goes to `docs/evidence/45-ui-polish-validation.md`.
- **IVR validation**: integration test suite (`tests/integration/voice.integration.test.ts`) extended to exercise the new press 3 / press 4 / press 0 branches. Evidence = passing test run captured in evidence doc.
- **Production IVR smoke test**: per the mistake pattern `Different vendor API surface = new spike, even if the same SDK is familiar`, a real phone call to the SKB Twilio number must be made by Sid before the implementation PR is marked done, with production log lines attached to the PR. I'll add a `prod-validation/voice-issue-45.prod.test.ts` script that replays the TwiML flow against the real Twilio signature, but that does not replace the real phone call.
- **Accessibility**: axe-core + Lighthouse scan against each new HTML page. Target: zero critical/serious axe violations, Lighthouse a11y ≥95. Evidence = screenshots of the scan results in `docs/evidence/45-ui-polish-validation.md`.

## Implementation checklist

### A. Types + DB + services layer (admin-configurable fields)

- [ ] **`src/types/queue.ts`** — extend `Location` with:
  - `address?: LocationAddress` where `LocationAddress = { street: string; city: string; state: string; zip: string }` (structured so the IVR hours script and the map embed can both pull clean fragments)
  - `hours?: WeeklyHours` where `WeeklyHours = { [day in 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun']?: DayHours | 'closed' }` and `DayHours = { lunch?: { open: string; close: string }; dinner?: { open: string; close: string } }` (time strings in `HH:mm` 24h format so rendering in en-US is consistent)
  - `frontDeskPhone` already exists (line 11 of `queue.ts`) — nothing to add to the type, just wire into the admin UI.

- [ ] **`src/services/locations.ts`** — extend `updateLocationVisitConfig()` to also accept `address`, `hours`, and `frontDeskPhone` in the update payload. Rename the function to `updateLocationConfig()` (keep a deprecated alias for one release) since it's no longer visit-page-specific. Add validation:
  - `address.street`: 1..120 chars, required if any address field is set
  - `address.city`: 1..80 chars
  - `address.state`: 2 chars, US state code
  - `address.zip`: 5 or 9 chars, digits (+ optional `-` before the +4)
  - `hours`: each day is either `"closed"` or has `lunch` and/or `dinner` with `open` < `close`, both valid `HH:mm`
  - `frontDeskPhone`: 10 digits after normalization (reuse the `normalizeCallerPhone` helper from `voiceTemplates.ts`)
  - Follow the existing "explicit-null-clears" pattern from PR #42
- [ ] **`src/services/location-template.ts`** (new small file) — pure formatters:
  - `formatWeeklyHoursForWeb(hours)` → HTML-escaped table rows
  - `formatWeeklyHoursForSpeech(hours)` → the IVR script fragment ("Tuesday through Sunday…") with closed-day handling
  - `formatAddressForWeb(address)` → multi-line HTML
  - `formatAddressForSpeech(address)` → "12 Bellevue Way SE in Bellevue, Washington" (city-state only, strips zip)
  - `buildGoogleMapsEmbedUrl(address)` → the `maps?q=…&output=embed` URL (URL-encoded)
  These are **pure functions**, testable in isolation, injected into the voice routes and the page renderers. Follows architecture standard §3 (Testability → pure functions).

### B. Admin API + UI

- [ ] **`src/routes/host.ts`** — extend `GET /host/visit-config` to return the new fields, and extend `POST /host/visit-config` to accept them. Preserve existing field names. Error mapping: any error starting with `"address"`, `"hours"`, `"frontDeskPhone"` returns 400 with the error message (mirrors existing `"visitMode"` / `"menuUrl"` pattern). Route name stays `visit-config` — or rename to `location-config` if the deprecation alias is cheap; decide during implementation.
- [ ] **`public/host.html`** — in the existing Visit Page card, add three new fields under the existing grid:
  - Address: 4 sub-fields (street, city, state, zip) laid out in a 2×2 grid at wider breakpoints, stacked on mobile
  - Weekly hours: 7 rows (Mon–Sun), each with a "Closed" checkbox + lunch open/close + dinner open/close time inputs. On closed, hide the time inputs. Default values prefilled from the spec for first-run.
  - Front desk phone: one 10-digit input with pattern `\d{10}`, hint text "For the 'press 0' IVR transfer"
- [ ] **`public/host.js`** — extend `refreshVisitConfig()` to populate the new fields from the API response, and extend the save handler to send them. Preserve existing keys. Use the existing `$(...)` helper pattern.
- [ ] **`public/styles.css`** — reuse existing `.visit-*` selectors; add `.visit-hours-row`, `.visit-hours-closed`, `.visit-address-grid` for the new controls. No new color tokens; reuse the existing palette.
- [ ] **`public/host.html`** — rename the card title from "Visit Page" to "Location & Visit" to reflect the broader scope, but keep the `#visit-*` IDs and class names so the existing save endpoint still wires up.

### C. Static website pages (new public/* files)

- [ ] **`public/menu.json`** — promote `docs/feature-specs/mocks/45-menu-data.json` to its final location. Minimal edit: wrap it in a schema envelope `{ "version": 1, "categories": [...], "items": [...] }` so future changes (category descriptions, prices, seasonal tags) don't break the renderer.
- [ ] **`public/home.html`** — production version of `mocks/45-home.html`. Key changes from the mock:
  - Inline styles → external `public/site.css` (new file, linked from every new page)
  - Hours and address blocks fetch from `/r/:loc/api/host/visit-config` (public subset — see D below) instead of being hard-coded
  - Hero CTA `href` targets `/r/:loc/visit` (the dynamic QR endpoint) instead of the mock's placeholder
- [ ] **`public/menu-page.html`** — production version of `mocks/45-menu.html`. Filename is `menu-page.html` (not `menu.html`) to avoid clashing with `menu.json` — served at URL `/menu` via route mapping.
- [ ] **`public/about.html`** — production version of `mocks/45-about.html`.
- [ ] **`public/hours-location.html`** — production version of `mocks/45-hours-location.html`. Must:
  - Render the hours table client-side from `location.hours` via the public config endpoint
  - Embed Google Maps iframe with `q=` URL-encoded from `location.address`
  - Render the address block from `location.address`
- [ ] **`public/contact.html`** — new simple page (not in the spec as a dedicated mock but listed in the page inventory). Copies the styling of `about.html`, with:
  - Address block (from `location.address`)
  - Phone link `tel:+1{frontDeskPhone}`
  - Email `mailto:skb.bellevue@gmail.com`
  - No form (the spec non-goals lists "no contact form backend"; the email link is the submit)
- [ ] **`public/site.css`** — new file with the `.site-*` namespace, lifted out of the mocks' inline styles. Shared across all five new pages.
- [ ] **`public/img/`** — new directory for WebP-compressed hero images (reuse the current skbbellevue.com images per Sid's Q8 answer). **Deferred to a follow-up commit** if the image compression step is non-trivial; for the first commit, use placeholder `background-color` blocks matching the mocks so the layout lands and shipping isn't blocked on image processing.

### D. Public config endpoint

- [ ] **`src/routes/queue.ts`** (or a new `src/routes/public-config.ts`) — add `GET /public-config` returning a safe subset of the Location document for client-side rendering:
  ```json
  {
    "name": "Shri Krishna Bhavan",
    "address": { ... },
    "hours": { ... },
    "frontDeskPhone": "...",
    "publicUrl": "..."
  }
  ```
  **Excludes** `pin`, `_id`, internal flags. This is the endpoint the new site pages fetch at load time. No auth required — it's public info by design.
- [ ] **`src/services/locations.ts`** — add a `toPublicLocation(location)` projection helper so the queue + public endpoints share the same allowlist. This keeps the security boundary in one place.

### E. Server-side routing (serve the new pages per location + via host header)

- [ ] **`src/mcp-server.ts`** — add per-location routes:
  - `GET /r/:loc/` → serve `public/home.html` (skipping the landing page when a location slug is given — currently `/r/:loc/` is caught by the static middleware only if the file exists)
  - `GET /r/:loc/menu` → serve `public/menu-page.html`
  - `GET /r/:loc/about` → serve `public/about.html`
  - `GET /r/:loc/hours` → serve `public/hours-location.html`
  - `GET /r/:loc/contact` → serve `public/contact.html`
  - `GET /r/:loc/menu.json` → serve `public/menu.json` (Content-Type: application/json; served from static middleware)
- [ ] **Host-header rewrite**: add an early middleware that, if `req.hostname` matches a per-location `publicHost` field (new optional field on `Location`), rewrites `req.url` to prepend `/r/:loc/`. Example: `Host: skbbellevue.com` + `GET /menu` → served as `GET /r/skb/menu`. Must be idempotent (if the URL already starts with `/r/…` it's not rewritten) and must not interfere with `/api`, `/health`, `/mcp`, or already-prefixed `/r/*` URLs.
- [ ] **`src/types/queue.ts`** — add `publicHost?: string` to the Location type. Validated in `updateLocationConfig` (simple non-empty string, lowercase, no scheme, no trailing slash).

### F. IVR extensions

- [ ] **`src/routes/voice.ts`** — update `/voice/incoming` greeting script to include the three new options. Cap audible length at ~25 seconds (measured rather than estimated via the integration test).
- [ ] **`src/routes/voice.ts`** — update `/voice/menu-choice` router to handle digits `3`, `4`, `0`:
  - `3` → `<Redirect>/voice/menu-info</Redirect>`
  - `4` → `<Redirect>/voice/hours-info</Redirect>`
  - `0` → transfer via `<Dial>+1{frontDeskPhone}</Dial>` with the fallback script if unset
  - `*` (star) — map to `/voice/incoming` from the menu/hours branches. Requires a note: `<Gather>` with `numDigits=1` does not natively understand `*` as a navigation key; we use `*` as a valid digit input in the re-used `/voice/menu-choice` router, which recognizes `*` as "main menu".
- [ ] **`src/routes/voice.ts`** — add `POST /voice/menu-info` handler: reads the static category-list script from `src/services/voiceTemplates.ts`, wraps in `<Gather numDigits=1 action="/voice/menu-choice">`.
- [ ] **`src/routes/voice.ts`** — add `POST /voice/hours-info` handler: reads `location.address` and `location.hours` and renders the speech script via `formatAddressForSpeech()` and `formatWeeklyHoursForSpeech()`. Falls back to the static default string if `address`/`hours` are unset.
- [ ] **`src/services/voiceTemplates.ts`** — add `MENU_CATEGORY_SCRIPT` constant (the static "we serve South Indian cuisine…" line). **This is a static string because the spec's Branch-3 section explicitly says "don't read individual items by voice".**

### G. Tests

- [ ] **`tests/unit/locationTemplate.test.ts`** (new) — tests for the five pure formatter functions in `src/services/location-template.ts`:
  - `formatAddressForSpeech` strips zip, includes "in {city}, {state-full}"
  - `formatAddressForWeb` HTML-escapes street/city
  - `formatWeeklyHoursForSpeech` handles closed days ("Tuesday through Sunday — we're closed on Mondays")
  - `formatWeeklyHoursForWeb` renders Monday with "Closed" styling
  - `buildGoogleMapsEmbedUrl` URL-encodes correctly
- [ ] **`tests/unit/locations.test.ts`** (new) — tests for `updateLocationConfig` validation:
  - Valid update round-trips
  - Invalid state code → 400
  - Invalid zip → 400
  - Invalid hour open >= close → 400
  - Invalid frontDeskPhone → 400
  - Explicit null clears the address
  - Partial update (only `hours`) doesn't touch other fields
- [ ] **`tests/integration/voice.integration.test.ts`** — extend the existing debug harness with:
  - Press 1 still works (regression)
  - Press 2 still works (regression)
  - Press 3 routes to `/voice/menu-info`, response contains "South Indian" and "skbbellevue"
  - Press 4 routes to `/voice/hours-info`, response contains the seeded `location.address.street` and references "Tuesday through Sunday" (with a test fixture that has Monday closed)
  - Press 0 routes to `<Dial>` with the seeded `frontDeskPhone`, OR the fallback script if the fixture has no frontDeskPhone
  - Star from menu/hours branches returns to incoming
  - `1` from menu/hours branches short-circuits to the ask-name flow
- [ ] **`tests/integration/visit-route.integration.test.ts`** (existing) — add a case for the new fields being persisted through `POST /host/visit-config`.
- [ ] **`tests/integration/public-config.integration.test.ts`** (new) — verify the new `/public-config` endpoint returns the public subset, does not leak `pin`, and handles missing optional fields without erroring.
- [ ] **`tests/integration/website-routes.integration.test.ts`** (new) — GET each of `/r/skb/`, `/r/skb/menu`, `/r/skb/about`, `/r/skb/hours`, `/r/skb/contact` and verify 200 + expected HTML title. Also test the host-header rewrite: `Host: skbbellevue.com` + `GET /menu` returns the menu page.

### H. Evidence + follow-ups

- [ ] **`docs/evidence/45-ui-polish-validation.md`** — screenshots of each new page at desktop + mobile, axe-core output, Lighthouse score, admin-form screenshot.
- [ ] **`docs/evidence/45-feature-implementation-evidence.md`** — the final evidence doc for Phase 10 submission.
- [ ] **Production validation plan**: a new `prod-validation/voice-issue-45.prod.test.ts` script is nice-to-have but **not** a substitute for Sid making a real phone call to the Twilio number. The implementation PR description will include a call-me check for Sid to run after merge.

## Known deferrals / open questions

- **Food photos (Q8)**: Sid said "use whats on the site for now." I'll compress the current-site images to WebP in a follow-up commit on this branch if they're easy to grab, or fall back to placeholder background blocks (matching the mock style) if image acquisition is non-trivial. The first code commit does not block on images.
- **DNS cutover (Q9)**: Sid owns the runbook; no code change required. The implementation PR description will link to the cutover section of the spec.
- **Holiday/one-off hours**: the `WeeklyHours` type covers regular weekly patterns only. Holiday overrides are out of scope for this issue — would need a separate date-keyed override structure. I'll note this as a follow-up in the retrospective.
- **Conversational AI as a future upgrade**: captured in the spec's competitive analysis as a "revisit if call volume climbs" lever. No code required now.
- **Multi-language IVR**: English only. Spec's non-goals section captures this.

## Pattern discovery summary

From reading `src/routes/host.ts`, `src/services/locations.ts`, `src/routes/voice.ts`, and `src/services/visit-page.ts`, the established SKB patterns I'll follow:

1. **Location-level config lives on the `Location` document**, not on `Settings` (which is per-day-operational tuning). The refactored admin pattern from PR #42 is `updateLocationVisitConfig()` + a dedicated `/host/visit-config` admin endpoint + a Visit Page card in `host.html`. I'll extend the same endpoint rather than creating a parallel one.
2. **Explicit-null-clears** is the pattern for optional string fields on Location — pass `null` to unset, undefined to leave unchanged. Preserve this for the new `address`, `hours`, `frontDeskPhone` fields.
3. **Twilio signature validation** is mandatory on all `/voice/*` routes via `validateTwilioSignature` middleware. Any new route I add inherits it automatically.
4. **Structured logging** via `console.log(JSON.stringify({ t, level, msg, loc, ... }))`. Every new voice handler and admin endpoint must emit at least one success log line (info) and catch-block error logs.
5. **TwiML state via URL query params**, not session storage. New branches follow the same pattern.
6. **Pure formatter functions** isolated from I/O — the existing `voiceTemplates.ts` is the model. My new `location-template.ts` file mirrors it.
7. **Tests split unit vs integration** with integration tests in standalone-debug style (no framework, raw `http.request`). Extend the existing voice integration test harness rather than creating a new one.
8. **`SKB_ALLOW_UNSIGNED_TWILIO=1`** is the integration-test bypass for the Twilio signature middleware.

## Issue type

This issue is a **feature** (not a bug). Phase 2 (`implement-repro`) is skipped per the job's "Bugs only" note. Moving to Phase 3 (`implement-tests`).
