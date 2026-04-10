# Prod Validation

Black-box tests that run against a live deployment to verify the HTTP surface is correctly configured after a deploy. These are intentionally small, fast, non-destructive checks — not full integration tests.

## What these tests are NOT

- **Not unit tests** — those live in `tests/unit/`.
- **Not local integration tests** — those live in `tests/integration/` and hit a local MongoDB.
- **Not functional end-to-end tests** — they don't initiate real phone calls, join queues, send SMS, or mutate data.

## What these tests ARE

- HTTP probes against the live deployment to confirm routes are registered, middleware is active, and critical dependencies are reachable.
- Safe to run against production on every deploy (no side effects).
- Fast (target: full suite under 10 seconds).

## Running

```bash
# Run against prod (default: https://skb-waitlist.azurewebsites.net)
npx tsx prod-validation/twilio.prod.test.ts

# Run against a different environment
PROD_BASE_URL=https://staging.example.com npx tsx prod-validation/twilio.prod.test.ts

# Test a specific location
PROD_LOC=skb-demo npx tsx prod-validation/twilio.prod.test.ts
```

Or use the npm script:

```bash
npm run test:prod
```

## Current suites

| File | Purpose |
|------|---------|
| `twilio.prod.test.ts` | Twilio voice IVR webhook surface: routes registered, signature validation active, all 9 voice endpoints exist, queue state dependency reachable |
| `google-maps.prod.test.ts` | Issue #30 Google Maps integration: JSON-LD Restaurant schema, Open Graph tags (type, url, title, description), canonical URL, meta description, title tag — verified against live prod queue page |
| `compliance-pages.prod.test.ts` | SMS compliance pages (`privacy.html`, `terms.html`) load and contain every TCR-required element: brand name, STOP/HELP keywords (bolded on terms), message frequency, data rates disclaimer, support email, supported carriers, cross-page links |
| `twilio-status.prod.test.ts` | Monitoring probe (not a hard gate) that reports the current state of the two parallel SMS approval paths — Toll-Free Verification on the 844 and A2P 10DLC campaign on the 425 — plus recent outbound SMS delivery health. Requires `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` env vars; skips cleanly if not set |

## What each test confirms

### Twilio voice suite (`twilio.prod.test.ts`)

| Test | Confirms |
|------|---------|
| `prod is reachable and healthy` | `/health` returns 200 — the app is up |
| `prod MongoDB is reachable` | `/health/db` returns 200 — Cosmos DB connectivity works |
| `voice /incoming endpoint is registered` | Returns 403 (not 404) — `TWILIO_VOICE_ENABLED=true` is set in app config |
| `voice endpoints reject requests without x-twilio-signature` | Returns 403 — signature validation middleware is enforcing |
| `voice endpoints reject requests with an invalid signature` | Returns 403 — validation actually checks the signature |
| `voice /*` endpoint exists (per-route) | Each of the 9 voice routes returns 403 — router fully registered |
| `queue page renders` | Voice IVR depends on queue state; this confirms the dependency |

### Google Maps suite (`google-maps.prod.test.ts`)

| Test | Confirms |
|------|---------|
| `queue page loads` | `/r/:loc/queue.html` returns 200 |
| `JSON-LD schema.org Restaurant` | Structured data block present with correct @context and @type |
| `JSON-LD potentialAction + PostalAddress` | Google can render the "Join the waitlist" rich action and address |
| `JSON-LD has no PII` | No queue codes or individual party data leaked into public page |
| `og:title / og:description / og:type / og:url` | All four Open Graph tags present for social previews |
| `og:url points at the correct prod location` | Confirms `Location.publicUrl` in MongoDB is set and being used |
| `canonical link present and matches og:url` | Google indexes the correct canonical URL |
| `meta description and title tag` | Standard SEO metadata |

### Compliance pages suite (`compliance-pages.prod.test.ts`)

Both `privacy.html` and `terms.html` are load-bearing for the A2P 10DLC campaign registration. If TCR re-scans these URLs and finds missing or changed content, the campaign can be rejected retroactively and SMS delivery breaks. This suite verifies every required element is still present on the deployed version.

### Twilio status suite (`twilio-status.prod.test.ts`)

Reports (not asserts) the current state of every pending SMS approval path. Run this when you want to know "is SMS working yet". It prints TFV status, 10DLC campaign status, and the last 10 outbound messages with their delivery status.

## Adding a new suite

1. Create `<name>.prod.test.ts` in this folder.
2. Import helpers from `./prod-test-utils.js`.
3. Define test cases as `BaseTestCase[]` with `tags: ['prod', '<area>']`.
4. Call `runTests(cases, '<name> prod surface')`.
5. Document it in this README's "Current suites" table.

## Guardrails

Production tests **must** be:
- **Idempotent** — safe to run multiple times in a row
- **Non-destructive** — no joins, no database writes, no SMS/voice initiation
- **Side-effect free** — nothing that costs money (real SMS) or creates user-visible artifacts
- **Fast** — under 1 second per test; under 10 seconds total

If you need a real end-to-end test with side effects (e.g. actually making a phone call), put it in `e2e/` and gate it behind a manual trigger.
