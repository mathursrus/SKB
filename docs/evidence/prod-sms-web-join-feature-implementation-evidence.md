# Prod SMS Web Join - Feature Implementation Evidence

## Summary

- Bug type: request-host-driven SMS link generation in waitlist confirmation flows.
- Root cause: web join and IVR join built status links from forwarded request host headers instead of canonical configured public URLs.
- Fix: added `src/services/queueStatusUrl.ts` and routed both join flows through the precedence chain `Location.publicUrl -> SKB_PUBLIC_BASE_URL -> request host fallback`.
- Sender behavior: unchanged. Both web and IVR continue to send through `TWILIO_PHONE_NUMBER`.

## Verification Evidence

- Local regression before fix:
  - `npx tsx tests/unit/queueStatusUrl.test.ts`
  - failed on canonical URL precedence.
- Local regression after fix:
  - `npx tsx tests/unit/queueStatusUrl.test.ts`
  - passed.
- Build verification:
  - `npx tsc --noEmit`
  - `npm run build`
  - both passed.
- Prod verification:
  - deploy run `24696654468` succeeded for commit `4a96bf7a318934b782003b7e0416e43d3753dc50`
  - follow-up docs deploy run `24696852865` succeeded for commit `15375cafa36f415d10d40e5a905e728973f29a7f`
  - live web join produced delivered Twilio SMS with body using `https://skb-waitlist.azurewebsites.net/r/skb/queue.html?...`

### Feature Requirement Traceability Matrix

| Requirement / Acceptance Criteria | Implemented File / Function | Proof | Status |
| --- | --- | --- | --- |
| Web join confirmation SMS must stop inheriting the inbound request host. | `src/services/queueStatusUrl.ts` / `resolveQueueStatusBaseUrl` | `npx tsx tests/unit/queueStatusUrl.test.ts` | Met |
| Web join and IVR join must continue to share the same outbound sender configuration. | `src/services/sms.ts` / `getConfig`, `sendSms` | Prod config check: `TWILIO_PHONE_NUMBER=+14254284231`; live Twilio message from `+14254284231` | Met |
| Canonical URL precedence must prefer `Location.publicUrl`, then `SKB_PUBLIC_BASE_URL`, then request host fallback. | `src/services/queueStatusUrl.ts` / `resolveQueueStatusBaseUrl` | `npx tsx tests/unit/queueStatusUrl.test.ts` | Met |
| Queue deep links must retain `/r/:loc/queue.html?code=...` shape. | `src/services/queueStatusUrl.ts` / `buildQueueStatusUrlForSms` | `npx tsx tests/unit/queueStatusUrl.test.ts`; `npx tsx tests/unit/url.test.ts` | Met |
| A production web join with SMS consent must yield a canonical-host SMS body. | `src/routes/queue.ts` / join confirmation path | Live POST to `https://skb-waitlist.azurewebsites.net/r/skb/api/queue/join`; Twilio delivered body for `SKB-2ZR` | Met |

### Technical Design Traceability Matrix

| Design / Constraint | Implemented File / Function | Proof | Status |
| --- | --- | --- | --- |
| Keep the fix narrow and avoid changing sender-number selection. | `src/routes/queue.ts`, `src/routes/voice.ts`, `src/services/queueStatusUrl.ts` | Diff review; `src/services/sms.ts` unchanged | Met |
| Reuse existing canonical public URL patterns already present in the codebase. | `src/services/queueStatusUrl.ts` with `locationPublicUrl` and `appPublicBaseUrl` inputs | Diff review; prod config verification | Met |
| Keep both web and IVR flows consistent through a shared URL builder. | `src/routes/queue.ts`, `src/routes/voice.ts`, `src/services/queueStatusUrl.ts` | Diff review; `npx tsx tests/unit/queueStatusUrl.test.ts` | Met |
| Validate with automated tests plus manual prod verification. | `tests/unit/queueStatusUrl.test.ts`, `docs/evidence/prod-sms-web-join-validation.md` | `npx tsx tests/unit/queueStatusUrl.test.ts`; `npm test`; live Twilio verification | Met |

### Feedback Verification

- Feedback file reviewed: `docs/evidence/prod-sms-web-join-feature-implementation-feedback.md`
- Total feedback items: 0
- Unaddressed items: 0
- Result: all feedback addressed.

## Security Review

### Executive Summary

- Findings: 0 critical, 0 high, 0 medium, 0 low.
- Disposition: no blocking findings; proceed.

### Review Scope

- `reviewScope = diff`
- Reviewed paths:
  - `src/routes/queue.ts`
  - `src/routes/voice.ts`
  - `src/services/queueStatusUrl.ts`
  - `tests/unit/queueStatusUrl.test.ts`
  - `docs/evidence/prod-sms-web-join-implement-work-list.md`
  - `docs/evidence/prod-sms-web-join-validation.md`

### Threat Surface Summary

- `api`
  - `src/routes/queue.ts`
  - `src/routes/voice.ts`
- `docs-only` does not apply because non-doc code changed.

### Coverage Matrix

| Category | Status | Notes |
| --- | --- | --- |
| OWASP Top 10 Web | N/A | No browser-rendered code changed. |
| OWASP API Top 10 | Pass | Diff only changes canonical URL selection for outbound SMS body composition. |
| Secrets in Code | Pass | No credentials added in code diff. |
| Privacy / PII | Pass | Existing phone/code handling unchanged; no new storage or exposure added. |
| Capability Authoring | N/A | No FRAIM job/skill/rule instructions changed. |

### Findings

- None.

### Prioritized Remediation Queue

- None.

### Verification Evidence

- Diff review of the changed API/service files.
- Manual confirmation that sender selection still comes from `TWILIO_PHONE_NUMBER`.
- GitHub secret scanning connector unavailable because GitHub Advanced Security is not enabled for the repository.

### Applied Fixes and Filed Work Items

- Applied fix in `4a96bf7a318934b782003b7e0416e43d3753dc50`.
- No follow-up security work items filed.

### Accepted / Deferred / Blocked

- Accepted:
  - GitHub Advanced Security secret scan unavailable for this repository; compensated with manual diff review.
- Deferred:
  - None.
- Blocked:
  - None.

### Compliance Control Mapping

- N/A for this issue.

### Run Metadata

- Review date: 2026-04-20 / 2026-04-21 America/Los_Angeles
- Reviewer: Codex
- Head commit at review completion: `15375cafa36f415d10d40e5a905e728973f29a7f`
- Environment notes:
  - Azure App Service production environment
  - Twilio prod account active
  - GitHub Advanced Security not enabled
