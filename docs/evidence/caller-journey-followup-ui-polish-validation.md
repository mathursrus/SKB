# Caller Journey Follow-up UI Validation

Issue: `caller-journey-followup`
Date: `2026-04-25`

## Automated Validation

- `npm run build` — passed
- `npm test` — passed
- `npx tsx --test --test-concurrency=1 tests/integration/caller-stats.integration.test.ts` — passed
- `npx tsx --test --test-concurrency=1 tests/ui/caller-journey.ui.test.ts` — passed
- `node --check public/admin.js` — passed

## Browser Validation

Environment:

- Real app server started via `tests/shared-server-utils.ts`
- Seeded one caller-session document in `voice_call_sessions`
- Signed in as owner through `/api/login`
- Opened `/r/caller-journey-ui/admin.html` in headless Chromium via `playwright-core`
- Durable UI suite coverage added in [caller-journey.ui.test.ts](../../tests/ui/caller-journey.ui.test.ts)

Validated behaviors:

- The recent caller row rendered in the Admin caller statistics table
- Triggering the row selection on the real page switched the detail card from aggregate outcome mode to `Caller journey`
- The detail card showed the selected caller's masked identifier (`Caller **** 0199`)
- The ordered journey list rendered all 7 persisted steps for the session
- The selected row gained the active state
- At `390x844`, the journey remained visible and the page had no horizontal overflow (`scrollWidth === clientWidth === 390`)

Browser validation result snapshot:

```json
{
  "desktop": {
    "detailType": "Caller journey",
    "title": "Joined waitlist",
    "share": "Caller **** 0199",
    "stepCount": 7,
    "activeRows": 1
  },
  "mobile": {
    "detailVisible": true,
    "activeRows": 1,
    "scrollWidth": 390,
    "clientWidth": 390
  }
}
```

## Notes

- The headless browser's built-in visibility check was unreliable for directly clicking the deep table row in the long Admin page, so the validation script scrolled the row into view and dispatched the page click event from the browser context. The rendered state change and mobile layout were then asserted on the live page.
