## Summary
- Issue: ad hoc SMS waitlist URL fix
- Validation date: 2026-04-18
- Reviewer: Codex
- Server under test: `http://localhost:15410`

## URLs Checked
| URL | Expected | Actual | Result |
| --- | --- | --- | --- |
| `/r/skb/queue?code=SKB-24W` | Old broken link should fail | Express returned the `Error` page / 404 | Confirmed broken |
| `/r/skb/queue.html?code=SKB-24W` | Diner queue page should open and resolve the joined party | `SKB — Place in Line` loaded and rendered the active status card for `SKB-24W` | PASS |

## Target Journey
1. Start the local server on port `15410`.
2. Create a real queue entry via `POST /r/skb/api/queue/join`.
3. Open the old extensionless link and confirm it does not resolve.
4. Open the fixed `.html` deep link and confirm the diner sees their queue status immediately.

## Automated E2E
- Command: `npx tsx e2e/sms-deeplink.e2e.test.ts`
- Result: PASS
- Behavior covered:
  - joins through the public API
  - opens the `.html` deep link in a real Chromium browser via `playwright-core`
  - waits for `queue-ready`
  - asserts the confirmation/status card is visible
  - asserts the join card is hidden
  - asserts the joined code is rendered and the public queue marks the viewer as `(you)`

Screenshot artifact from automated run: `docs/evidence/e2e-sms-deeplink.png`

## Observed View
- Hero/header rendered correctly for Shri Krishna Bhavan.
- Join card was not shown.
- Status card was shown with:
  - code `SKB-24W`
  - heading `You're next`
  - promised time and waiting timer
  - public queue row marking the viewer as `(you)`

Screenshot artifact: `docs/evidence/queue-status-deeplink.png`

## Console / Network Notes
- `GET /favicon.ico` returned 404. Non-blocking and unrelated to this fix.
- Repeated `429` responses on `GET /r/skb/api/queue/chat/SKB-24W`. This is a pre-existing queue-page chat polling issue and unrelated to the SMS link change.

## Decision
- The SMS deep link needs `.html`.
- After the fix, the generated queue URL shape is correct and the page resolves to the exact diner status view expected for an active waitlist entry.
