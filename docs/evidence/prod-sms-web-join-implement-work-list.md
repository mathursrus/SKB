# Prod SMS Web Join - Implement Work List

## Scope Summary

Fix production web waitlist confirmation SMS so the status link uses a stable canonical base URL instead of inheriting the inbound request host. Confirm whether web and IVR use different outbound Twilio numbers and preserve the shared sender behavior.

- Scope is limited to confirmation-SMS URL generation and its regression coverage.
- Web join and IVR join should continue to share the same outbound sender configuration.
- Validation must prove the sender number is unchanged and the generated link prefers configured public URLs over request headers.

Issue type: `bug`

## Discovered Patterns

- Outbound SMS for both web and IVR flows goes through `src/services/sms.ts`, which reads `TWILIO_PHONE_NUMBER`.
- Queue confirmation SMS content is assembled in route handlers and passed into `joinConfirmationMessage(...)`.
- The codebase already models canonical public bases on `Location.publicUrl` and `SKB_PUBLIC_BASE_URL`.
- URL helpers live under `src/core/utils/`, with compact unit coverage under `tests/unit/`.

## Validation Requirements

- `uiValidationRequired: false`
- `mobileValidationRequired: false`
- `typecheckRequired: true`
- `unitTestRequired: true`
- `integrationValidationRequired: true`
- `browserBaseline: none`
- `targetJourney: web join confirmation and IVR join confirmation both generate canonical queue links without changing the outbound sender number`
- `evidenceArtifact: docs/evidence/prod-sms-web-join-validation.md`

## Implementation Checklist

- [ ] `src/services/queueStatusUrl.ts` - Centralize canonical queue status URL resolution with `Location.publicUrl`, `SKB_PUBLIC_BASE_URL`, and request-host fallback ordering.
- [ ] `src/routes/queue.ts` - Switch web join confirmation SMS to the shared canonical builder.
- [ ] `src/routes/voice.ts` - Switch IVR join confirmation SMS to the shared canonical builder.
- [ ] `tests/unit/queueStatusUrl.test.ts` - Cover canonical URL precedence and request-host fallback behavior.
- [ ] `docs/evidence/prod-sms-web-join-validation.md` - Record prod verification, including sender-number confirmation and Twilio delivery outcome after deploy.

## Quality Requirements

- Keep the fix narrow and do not change Twilio sender selection behavior.
- Prefer existing location/public URL patterns before introducing new configuration.
- Preserve queue deep-link shape: `/r/:loc/queue.html?code=...`.

## Test Strategy Slice

- Unit: prove canonical URL selection order and final queue link shape.
- Manual prod validation: create a web join with SMS consent, inspect resulting Twilio message sender/body/status, and confirm the link uses the expected canonical host.
