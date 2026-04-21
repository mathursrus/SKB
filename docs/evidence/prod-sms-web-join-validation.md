# Prod SMS Web Join - Validation

## Local Validation

- `npx tsx tests/unit/queueStatusUrl.test.ts`
  - Repro before fix: failed on canonical URL precedence.
  - After fix: 4/4 passing.
- `npx tsc --noEmit`
  - Passed.
- `npm run build`
  - Passed.
- `npx tsx tests/unit/url.test.ts`
  - Passed.

## Deployment

- Commit: `4a96bf7a318934b782003b7e0416e43d3753dc50`
- Branch: `master`
- GitHub Actions run: `24696654468`
- Result: deploy succeeded.

## Prod Configuration Confirmation

- `TWILIO_PHONE_NUMBER=+14254284231`
- `SKB_PUBLIC_BASE_URL=https://skb-waitlist.azurewebsites.net`
- Conclusion: web and IVR already shared the same outbound sender number before the fix; the code change did not alter sender selection.

## Prod Functional Validation

### Live Join Request

- Endpoint exercised: `POST https://skb-waitlist.azurewebsites.net/r/skb/api/queue/join`
- Payload: `{ "name": "Prod SMS Check", "partySize": 2, "phone": "5127753555", "smsConsent": true }`
- Response:
  - `code: SKB-2ZR`
  - `position: 2`
  - `etaMinutes: 16`

### Twilio Message Verification

- Latest outbound message to `+15127753555` after deploy:
  - `from: +14254284231`
  - `status: delivered`
  - `error_code: null`
  - `body: SKB: You're on the list! Track your place in line here: https://skb-waitlist.azurewebsites.net/r/skb/queue.html?code=SKB-2ZR. Code: SKB-2ZR`
- Comparison to prior failure:
  - Previous failed message used `https://osh.wellnessatwork.me/r/skb/queue.html?...`
  - Previous failed status was `undelivered` with Twilio error `30007`

## Cleanup

- Deleted the synthetic validation queue entry `SKB-2ZR` from prod.

## Outcome

- Denied the original theory that web and IVR use different outbound numbers.
- Confirmed the real bug was request-host-driven SMS link generation.
- Deployed a fix that pins confirmation SMS links to configured canonical public URLs first.
- Verified a post-deploy web join produced a delivered SMS from the same sender number, with the canonical Azure URL in the body.
