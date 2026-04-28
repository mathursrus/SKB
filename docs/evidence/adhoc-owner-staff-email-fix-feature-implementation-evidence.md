# Adhoc owner staff email fix - Feature Implementation Evidence

## Security Review

### Executive Summary

- Review scope: diff
- Surfaces reviewed: web, api, mobile, docs
- New blocking findings introduced by this change: 0
- Residual medium finding in touched invite path: 1

### Review Scope

- reviewType: embedded-diff-review
- reviewScope: diff
- surfaceAreaPaths:
  - `src/routes/host.ts`
  - `public/admin.js`
  - `public/onboarding.js`
  - `ios/src/net/endpoints.ts`
  - `ios/src/features/admin/StaffSection.tsx`
  - `package.json`
  - `package-lock.json`
  - `.env.example`
  - `README.md`
  - `tests/integration/invites.integration.test.ts`
  - `tests/ui/staff-invite-delivery.ui.test.ts`

### Threat Surface Summary

- `api`: owner invite endpoint in `src/routes/host.ts`
- `web`: admin and onboarding invite UX in `public/admin.js` and `public/onboarding.js`
- `mobile`: iOS invite response typing and alert copy in `ios/src/net/endpoints.ts` and `ios/src/features/admin/StaffSection.tsx`
- `docs-only`: config and operator documentation in `.env.example` and `README.md`

### Coverage Matrix

| Category | Status | Notes |
| --- | --- | --- |
| OWASP Web | Pass | UI change is display-only and now reports delivery state accurately. |
| OWASP API | Pass | Response contract is additive and does not widen authorization scope. |
| Secrets in code | Fail | Existing raw invite token/link logging remains in touched route and log-only mail body path. |
| Privacy / PII | Fail | Invite email address and token-bearing link still appear in logs when invites are created in log-only mode. |
| Mobile | Pass | iOS change is a typed response + alert copy only. |

### Findings

| ID | Severity | Location | Summary | Disposition |
| --- | --- | --- | --- | --- |
| SEC-EMAIL-001 | Medium | `src/routes/host.ts`, `src/services/mailer.ts` | Staff invite creation still logs raw invite token/link, and log-only mode logs the full email body containing the invite link. | Deferred |

### Prioritized Remediation Queue

1. Remove raw invite tokens from `staff.invite.created` logs and replace them with non-sensitive delivery diagnostics.
2. Stop logging full email bodies in log-only mode for invite flows, or gate that behavior behind a stricter dev-only flag.

### Verification Evidence

- `npm run typecheck`
- `npm test`
- `npx tsx --test tests/integration/invites.integration.test.ts`
- `npx tsx --test tests/integration/staff-invite-production.integration.test.ts`
- `npx tsc -p ios/tsconfig.json --noEmit`
- `npx tsx --test tests/ui/staff-invite-delivery.ui.test.ts`
- Manual development-mode API probe confirmed the route returns `delivery.mode: "log-only"` and a non-misleading `deliveryMessage`.
- Manual production-mode API probe confirmed the route returns HTTP 503 and does not silently create a dead invite when email delivery is unavailable.

### Applied Fixes and Filed Work Items

- Applied in this change:
  - invite API now returns `delivery` plus `deliveryMessage`
  - production owner invites fail closed when email delivery is unavailable
  - admin, onboarding, and iOS surfaces now reflect real delivery state
  - ACS email SDK declared in `package.json`
  - ACS env vars and `PLATFORM_PUBLIC_URL` documented
- No separate issue filed in this pass for the residual token-logging risk.

### Accepted / Deferred / Blocked

- Deferred:
  - `SEC-EMAIL-001` remains outside the scope of this email-delivery accuracy fix.

### Compliance Control Mapping

- N/A for this adhoc fix.

### Run Metadata

- Date: 2026-04-27
- Branch: `feat/owner-tenant-delete`
- Reviewer: Codex
- Environment notes: local validation with ACS env vars intentionally unset to verify log-only fallback behavior
