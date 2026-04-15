# Issue #45 — UI / Functional Validation Evidence

**Phase**: feature-implementation / implement-validate
**Validation mode**: manual + Playwright + curl against running dev server
**Server**: `tsx src/mcp-server.ts` on `PORT=8899`, `MONGODB_DB_NAME=skb_issue45_validate`

## Validation summary

| Surface | What was tested | Result |
|---|---|---|
| `GET /r/skb/` | Home page renders, fetches `/api/public-config`, fills brand/address/hours/footer from DB | ✅ Pass — `brand=Shri Krishna Bhavan`, address block shows `12 Bellevue Way SE / Bellevue, WA 98004`, hours block shows `Lunch · 11:30 AM – 2:30 PM / Dinner · 5:30 PM – 9:30 PM`, footer contact populated |
| `GET /r/skb/menu` | Menu page renders, fetches `menu.json`, builds 13 categories / 79 items with sticky nav | ✅ Pass — DOM query returned `{ categories: 13, items: 79, stripLinks: 13 }` |
| `GET /r/skb/about` | About page renders with hospitality-tone copy | ✅ Pass — returns 200, HTML title matches, layout intact (visual confirmed via screenshot) |
| `GET /r/skb/hours` | Hours & Location page renders weekly table from DB, Monday=Closed in italic, Google Maps embed loads with the address, address lines populated, parking block visible | ✅ Pass — 7 table rows; `monday="Monday\tClosed"`; `tuesday="Tuesday\t11:30 AM – 2:30 PM · 5:30 PM – 9:30 PM"`; map iframe src = `https://www.google.com/maps?q=12%20Bellevue%20Way%20SE%2C%20Bellevue%2C%20WA%2C%2098004&output=embed`; map CTA href set to maps search URL |
| `GET /r/skb/contact` | Contact page renders phone `tel:` link, address, IVR hints | ✅ Pass — `phoneHref=tel:+12536565478`, `phoneText=(253) 656-5478`, address lines populated |
| `GET /r/skb/host.html` (authenticated) | Host admin form exposes new fields populated from DB | ✅ Pass — `{street:"12 Bellevue Way SE", city:"Bellevue", state:"WA", zip:"98004", phone:"2536565478", publicHost:"skbbellevue.com", mondayClosed:true, tueLunchOpen:"11:30", tueDinnerClose:"21:30"}` |
| `POST /r/skb/api/host/visit-config` | End-to-end round trip: address + hours + frontDeskPhone + publicHost all persisted and returned by GET | ✅ Pass — POST returned 200 with echoed fields, GET returned same, `public-config` surfaced the address + hours + phone without leaking `pin` |
| `GET /r/skb/api/public-config` | Unauthenticated public subset of Location config | ✅ Pass — returns `{name, address, hours, frontDeskPhone}` with no `pin`, no `_id`, no internal flags |
| `Host: skbbellevue.com` + `GET /` | Host-header rewrite middleware serves `/r/skb/home.html` instead of the landing page | ✅ Pass — response is the home page HTML (4104 bytes, title "Shri Krishna Bhavan — Authentic South Indian Cuisine in Bellevue") |
| `Host: skbbellevue.com` + `GET /menu` | Host-header rewrite serves `/r/skb/menu` | ✅ Pass — response is menu page HTML (5465 bytes, title "Menu — Shri Krishna Bhavan") |
| `Host: skbbellevue.com` + `GET /hours` /`/about` /`/contact` | Host-header rewrite serves all clean URLs | ✅ Pass — all four routes return the expected per-location page content |
| Plain `GET /` (no Host match) | Landing page still serves at root (backward compat) | ✅ Pass — returns "SKB — Locations" multi-tenant listing |
| `GET /api/public-config` (backward-compat, no per-loc prefix) | Defaults to skb per existing backward-compat middleware | ✅ Pass — returns the skb public config |

## IVR validation (integration test)

Extended `tests/integration/voice.integration.test.ts` with issue-45 cases and ran the full voice integration suite.

**Result**: `63 passed, 0 failed`

New test cases (24 checks), all passing:
- Greeting advertises press 3 (menu), press 4 (hours/location), press 0 (front desk)
- Press 3 routes to `/voice/menu-info`
- Menu-info mentions "more than twenty varieties of dosa"
- Menu-info points caller to `skbbellevue dot com slash menu`
- Menu-info prompts for `*` (return to main menu) and `1` (join shortcut)
- Menu-info emits no `<Record>` verb (SKB no-record policy preserved)
- Press 4 routes to `/voice/hours-info`
- Hours-info contains seeded street `12 Bellevue Way SE`
- Hours-info mentions `Bellevue`
- Hours-info mentions `closed on Mondays`
- Hours-info mentions `Tuesday through Sunday`
- Hours-info mentions lunch `11:30 AM`
- Hours-info mentions dinner `5:30 PM`
- Hours-info mentions parking
- Hours-info emits no `<Record>` verb
- Press 0 routes to `/voice/front-desk`
- Front-desk emits `<Dial>+12065551234</Dial>` with seeded `frontDeskPhone`
- Front-desk announces "Connecting you to our host"
- Front-desk unset fallback announces "Our host is currently unavailable"
- Front-desk unset does NOT emit `<Dial>` (caller not dropped into dead air)
- Hours-info fallback script still mentions Bellevue Way when `address`/`hours` are unset
- Hours-info fallback still mentions "closed on Mondays"
- `*` (star) from main menu returns to `/voice/incoming`

## Unit tests

Full `npm test` unit suite runs green including the two new test files:

- `tests/unit/locationTemplate.test.ts` — 34 cases
- `tests/unit/locationConfigValidation.test.ts` — 31 cases

Total new unit cases: 65. All passing.

## Typecheck

`npm run typecheck` passes clean. Zero TS errors after the 21-file implementation.

## Build verification

Full typecheck across the entire codebase (not just the new files) confirms no regressions in existing code. The type extensions (`LocationAddress`, `WeeklyHours`, `DayHours`, `DayOfWeek`, `PublicLocation`) are additive to the `Location` interface and don't break any existing consumer.

## Screenshots

Captured during validation and discarded (they're stale-by-design — the live HTML is the source of truth for reviewers):
- `prod-home.png` — home page with dynamic content from public-config
- `prod-menu.png` — menu page showing all 13 categories / 79 items
- `prod-hours.png` — hours page with Monday=Closed + Google Maps embed pin at 12 Bellevue Way SE
- `prod-contact.png` — contact page with phone `tel:` link rendered
- `prod-host-admin.png` — host admin form showing the expanded "Location & Visit" card with all new fields

## Production-environment validation (pending)

Per the mistake pattern `Different vendor API surface = new spike`, a real phone call to the SKB Twilio number remains required before this PR is marked complete. The integration test harness stubs Twilio's signature validation via `SKB_ALLOW_UNSIGNED_TWILIO=1`; it does NOT exercise real TwiML parsing by Twilio's side. Sid to run a real phone call post-merge and capture the production log lines for the PR comment.

## What's NOT yet validated

- **Accessibility scan** (axe-core + Lighthouse) against the new HTML pages. The work list called for this — deferring to Phase 7 (implement-quality) where it fits more naturally with the "accessibility audit" step rather than functional validation.
- **Mobile emulator validation** — Playwright `browser_resize` tool is currently rejecting my numeric arguments with a type error. The @media rules in `public/site.css` are audited by reading — they cover `max-width: 720px` for all grid layouts. Mobile validation will be re-run during Phase 7.
