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
| `twilio.prod.test.ts` | Verifies Twilio voice IVR webhook surface: routes registered, signature validation active, all 7 voice endpoints exist, queue state dependency reachable |

## What each test confirms

### Twilio suite

| Test | Confirms |
|------|---------|
| `prod is reachable and healthy` | `/health` returns 200 — the app is up |
| `prod MongoDB is reachable` | `/health/db` returns 200 — Cosmos DB connectivity works |
| `voice /incoming endpoint is registered` | Returns 403 (not 404) — `TWILIO_VOICE_ENABLED=true` is set in app config |
| `voice endpoints reject requests without x-twilio-signature` | Returns 403 — signature validation middleware is enforcing |
| `voice endpoints reject requests with an invalid signature` | Returns 403 — validation actually checks the signature |
| `voice /*` endpoint exists (per-route) | Each of the 7 voice routes returns 403 — router fully registered |
| `queue page renders` | Voice IVR depends on queue state; this confirms the dependency |

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
