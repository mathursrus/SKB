# Feature Implementation Evidence - Issue #81

## Summary

- Issue: `#81` - `Host chat does not go as SMS .. is that expected`
- Workflow: `feature-implementation`
- Branch: `feature/81-host-chat-does-not-go-as-sms-is-that-expected`
- Issue type: bug

## Implementation

- Added `smsCapable` to `HostPartyDTO` so the host queue API explicitly communicates per-party SMS eligibility.
- Populated `smsCapable` from `queue_entries.smsConsent` inside `listHostQueue()`.
- Updated `public/host.js` to:
  - disable `Notify` and `Custom SMS` when the party did not opt into SMS
  - keep `Chat` available but mark it as `web only`
  - show a drawer notice explaining why SMS is unavailable
  - label outbound `smsStatus: not_configured` messages as `web only` / `SMS unavailable` in the chat thread
- Added a chat drawer mode banner in `public/host.html` and supporting styles in `public/styles.css`.

## Targeted Validation

### Build

```text
npm run typecheck
```

Result: pass

### Targeted automated tests

```text
npx tsx --test tests/integration/queue.integration.test.ts
npx tsx --test tests/ui/guest-ordering.ui.test.ts
```

Result:
- `queue.integration.test.ts`: 24/24 pass
- `guest-ordering.ui.test.ts`: 6/6 pass

### API smoke

Validated against a disposable local server on `http://localhost:15499` using real signup, join, owner session, host PIN fetch, and host login flows.

Observed host queue payload:

```json
[{"name":"Opt In Guest","smsCapable":true,"phoneMasked":"******3101"},{"name":"Web Only Guest","smsCapable":false,"phoneMasked":"******3102"}]
```

### Browser validation

Validated on the real host page for a freshly created tenant after:
- owner signup
- two joins (`smsConsent=true` and `smsConsent=false`)
- owner fetch of `/api/host/pin`
- successful host PIN login

Confirmed:
- opted-in row keeps `Notify`, `Chat`, and `Custom SMS` enabled
- non-consenting row disables `Notify` and `Custom SMS`
- non-consenting row keeps `Chat` enabled with `web only` explanatory copy
- opening chat for the non-consenting row shows:
  - drawer notice: `SMS unavailable — this thread is web only because the diner did not opt into SMS updates.`
  - quick replies still available
- narrow-browser check at `390x844` kept the drawer usable and full-width

Artifacts:
- `docs/evidence/ui-polish/81/host-web-only-chat-desktop.png`
- `docs/evidence/ui-polish/81/host-web-only-chat-mobile.png`

## Error Investigation

- Browser console `401` on `/api/host/login`: reproduced during an initial manual attempt using the wrong PIN. Resolved by fetching the real per-location PIN from `/api/host/pin` before host login. Not a product regression from this change.
- Browser console `404` on `/favicon.ico`: pre-existing static asset gap on the local dev server. Unrelated to issue `#81`.

## Regression Validation

### Full suite

```text
npm run test:all
```

Result:
- pass
- unit suite: pass
- integration suite: pass
- UI suite: pass
- E2E suite: pass

### Regression triage performed

- Initial `npm run test:all` surfaced one unrelated failure in `tests/integration/signup.integration.test.ts`.
- Classification: test defect / fixture leak, not a behavior regression from issue `#81`.
- Root cause: `resetSignups()` did not remove the previously-created `signup-54-clash-seattle` location, so repeated runs could alternate between `signup-54-clash-seattle` and `signup-54-clash-2`.
- Fix applied: added `signup-54-clash-seattle` to the integration test fixture cleanup list and aligned the test name/assertion with the documented slug contract.
- Follow-up verification:
  - `npx tsx --test tests/integration/signup.integration.test.ts`: pass
  - `npm run test:all`: pass

## Completeness Review

### Source of Truth

- Feature requirements source: GitHub issue `#81` title plus the scoped implementation plan in `docs/evidence/81-implement-work-list.md`
- Technical design source: the same scoped implementation plan and the existing consent-gated queue/chat behavior discovered during implementation
- Formal RFC / technical design: none for this issue

### Feature Requirement Traceability Matrix

| Requirement / Acceptance Criteria | Implemented File / Function | Proof (Test / Validation) | Status |
|---|---|---|---|
| Host UI must not imply that non-consenting diners will receive SMS. | `public/host.js` waiting-row action gating and explanatory titles | Browser validation in this evidence doc; `tests/ui/guest-ordering.ui.test.ts` | Met |
| Non-consenting diners must keep chat access as a web-only thread instead of losing host communication entirely. | `public/host.js` `openChat()` / drawer notice rendering | Browser validation in this evidence doc; `tests/ui/guest-ordering.ui.test.ts` | Met |
| Host queue data must distinguish SMS-capable vs web-only parties. | `src/types/queue.ts` `HostPartyDTO`; `src/services/queue.ts` `listHostQueue()` | `tests/integration/queue.integration.test.ts` case `listHostQueue: surfaces per-party SMS eligibility for host UX decisions`; API smoke payload evidence | Met |
| Opted-in parties must continue to support Notify / Chat / Custom SMS. | `public/host.js` waiting-row action rendering | Browser validation in this evidence doc with `Opt In Guest`; `tests/ui/guest-ordering.ui.test.ts` | Met |
| Validation package must include targeted automated checks, manual host validation, and regression coverage. | `docs/evidence/81-feature-implementation-evidence.md`; `docs/evidence/81-ui-polish-validation.md` | `npm run typecheck`; `npx tsx --test tests/integration/queue.integration.test.ts`; `npx tsx --test tests/ui/guest-ordering.ui.test.ts`; `npm run test:all` | Met |

Pass determination: pass. No `Partial` or `Unmet` feature requirement rows remain.

### Technical Design Traceability Matrix

| Design Commitment / Constraint | Implemented File / Function | Proof (Test / Validation) | Status |
|---|---|---|---|
| Preserve the existing consent-safe behavior: do not send SMS when `smsConsent !== true`. | Existing `callParty()` / `sendChatMessage()` behavior retained; UI fix only changes host affordances | Diff review confirms no route/service behavior change to SMS dispatch logic; browser validation shows web-only treatment for non-consenting diners | Met |
| Surface SMS eligibility through a host-only contract instead of changing diner/public APIs. | `src/types/queue.ts`; `src/services/queue.ts` | `tests/integration/queue.integration.test.ts`; API smoke payload evidence | Met |
| Host UI should consume the new host-only field and keep row actions / drawer state consistent. | `public/host.js`; `public/host.html`; `public/styles.css` | `tests/ui/guest-ordering.ui.test.ts`; browser screenshots under `docs/evidence/ui-polish/81/` | Met |
| Verification must cover compile safety, targeted behavior, full regression, and UX sanity on desktop + narrow mobile width. | Evidence docs and validation commands | `npm run typecheck`; `npx tsx --test tests/integration/queue.integration.test.ts`; `npx tsx --test tests/ui/guest-ordering.ui.test.ts`; `npm run test:all`; `docs/evidence/81-ui-polish-validation.md` | Met |
| Any unrelated suite failures found during regression must be triaged rather than ignored. | `tests/integration/signup.integration.test.ts`; regression notes in this evidence file | Initial failing `npm run test:all`, targeted repro via `npx tsx --test tests/integration/signup.integration.test.ts`, final green `npm run test:all` | Met |

Pass determination: pass. No `Partial` or `Unmet` technical design rows remain.

### Feedback Verification

- Feedback file reviewed: `docs/evidence/81-feature-implementation-feedback.md`
- Total feedback items: `1`
- Addressed feedback items: `1`
- Unaddressed feedback items: `0`
- Result: pass

### Design Standards Alignment

- UI standard used for this issue: generic baseline validation
- Alignment result: pass
- Evidence source: `docs/evidence/81-ui-polish-validation.md`

### Durable Decisions / Deferrals

- Durable decision: issue `#81` was implemented as a host UX / affordance fix, not as a compliance-breaking change to send SMS without explicit diner consent.
- Durable decision: `smsCapable` is host-only metadata and was not introduced on diner/public endpoints.
- Deferrals: none

## Architecture Update Review

- Changed files reviewed for architecture impact:
  - `public/host.html`
  - `public/host.js`
  - `public/styles.css`
  - `src/services/queue.ts`
  - `src/types/queue.ts`
  - `tests/integration/queue.integration.test.ts`
  - `tests/ui/guest-ordering.ui.test.ts`
  - `tests/integration/signup.integration.test.ts`
- Determination: no architecture document update required
- Rationale:
  - No new architectural layer, service boundary, external integration, route family, persistence model, or deployment/runtime dependency was introduced.
  - `smsCapable` is a small host-only DTO extension on an existing queue response and does not change the system architecture.
- Documentation changes made: none

## Feedback History

Contents of `docs/evidence/81-feature-implementation-feedback.md` at submission time:

```markdown
# Feature Implementation Feedback - Issue #81

## Scope

- Workflow phase: `implement-quality`
- Reviewed diff surfaces:
  - `public/host.html`
  - `public/host.js`
  - `public/styles.css`
  - `src/services/queue.ts`
  - `src/types/queue.ts`
  - `tests/integration/queue.integration.test.ts`
  - `tests/ui/guest-ordering.ui.test.ts`
  - `tests/integration/signup.integration.test.ts`

## Quality Checks Run

- `npm run typecheck`
- `npx tsx --test tests/ui/guest-ordering.ui.test.ts`
- Manual diff review for duplicated strings, hardcoded values, reuse opportunities, and architecture fit
- Baseline UX evidence review via `docs/evidence/81-ui-polish-validation.md`

## Findings

### QUALITY CHECK FAILURE 1

- Status: `ADDRESSED`
- Severity: `P2`
- Category: `duplicate code / missed reuse`
- File: `public/host.js`
- Lines: `25-26`, `100-108`, `546-554`
- Detail:
  - The new SMS-consent explanatory copy was duplicated across waiting-row action titles and the chat drawer notice.
  - That made the UX text easier to drift over time and increased the maintenance cost of a compliance-sensitive message.
- Resolution:
  - Extracted shared constants `SMS_OPT_IN_REASON` and `WEB_ONLY_CHAT_NOTICE`.
  - Updated the waiting-row titles and drawer notice to reuse the shared copy source.
- Verification:
  - `npm run typecheck`: pass
  - `npx tsx --test tests/ui/guest-ordering.ui.test.ts`: pass

## UI Baseline Validation

- Baseline used: generic spacing / hierarchy / overflow / control-affordance checks
- Evidence source: `docs/evidence/81-ui-polish-validation.md`
- Result: pass
- Notes:
  - No overlap, clipping, or unusable controls were observed in the validated host surfaces.
  - Desktop and `390x844` mobile-width checks remained usable after the issue #81 change.

## Final Disposition

- No unaddressed quality issues remain in the issue `#81` implementation diff.
```

## Security Review

### Executive Summary

- Review scope: `diff`
- Threat surfaces detected: `web`
- Findings: 0 Critical / 0 High / 0 Medium / 0 Low
- Disposition summary: 0 `fix`, 0 `file`, 0 `accept`
- Outcome: pass; no blocking findings identified in the implementation diff

### Review Scope

- `reviewType`: embedded-diff-review
- `reviewScope`: diff
- `surfaceAreaPaths`:
  - `public/host.html`
  - `public/host.js`
  - `public/styles.css`
  - `src/services/queue.ts`
  - `src/types/queue.ts`
  - `tests/integration/queue.integration.test.ts`
  - `tests/ui/guest-ordering.ui.test.ts`

### Threat Surface Summary

- `web`
  - `public/host.js`: host waiting-row action gating, drawer notice rendering, status-label rendering
  - `public/host.html`: new drawer notice container
  - `public/styles.css`: new drawer notice and status-note styling
- Supporting non-surface contract changes
  - `src/types/queue.ts`: host DTO adds `smsCapable`
  - `src/services/queue.ts`: host queue response populates `smsCapable`

### Coverage Matrix

| Category | Status | Notes |
|---|---|---|
| OWASP Web Top 10 | Pass | Reviewed diff for DOM injection, unsafe HTML rendering, client-side authorization assumptions, and broken interaction states. |
| Secrets in Code | Pass | No credentials, tokens, or placeholder secrets introduced. |
| Privacy / PII | Pass | Full phone exposure stayed unchanged and host-only; new `smsCapable` flag is only emitted on the authenticated host queue surface. |
| OWASP API Top 10 | N/A | No route/controller diff in this change set. |
| OWASP LLM Top 10 | N/A | No LLM surface in diff. |
| Compliance Control Mapping | N/A | No active regulation-specific mapping requested for this issue. |

### Findings

No findings.

### Prioritized Remediation Queue

No remediation items created from this review.

### Verification Evidence

- Diff inspection across `public/host.*`, `public/styles.css`, `src/services/queue.ts`, and `src/types/queue.ts`
- `npm run typecheck`
- `npx tsx --test tests/integration/queue.integration.test.ts`
- `npx tsx --test tests/ui/guest-ordering.ui.test.ts`
- `npx tsx --test tests/integration/signup.integration.test.ts`
- `npm run test:all`
- Browser validation artifacts:
  - `docs/evidence/ui-polish/81/host-web-only-chat-desktop.png`
  - `docs/evidence/ui-polish/81/host-web-only-chat-mobile.png`

### Applied Fixes and Filed Work Items

- No additional security fixes were required during this review.
- No follow-up security work items were filed.

### Accepted / Deferred / Blocked

- Accepted: none
- Deferred: none
- Blocked: none

### Compliance Control Mapping

N/A for this issue.

### Run Metadata

- Date: `2026-04-24` local repo context / `2026-04-25` runtime UTC
- Commit reviewed: `563f6bd48271dfdcaf1da11a39092c12b730d3d2`
- Reviewer mode: manual diff review
- FRAIM skill lookup note: requested security skill files under `skills/quality/*.md` were unavailable in the mounted FRAIM catalog, so the review was completed manually against the mandated diff scope.
- Environment notes:
  - browser validation used a disposable local server on `http://localhost:15499`
  - git emitted LF→CRLF working-tree warnings only; no content-level risk

## Submission Status

- Branch pushed: `feature/81-host-chat-does-not-go-as-sms-is-that-expected`
- Submission commit: `df4684f`
- Pull request: `#90` - `Issue #81: clarify host chat vs SMS behavior`
- PR comment added with evidence path: yes
- Issue `#81` label status: `status:needs-review`
- Workspace note:
  - `git status` still shows `docs/evidence/e2e-sms-deeplink.png` as modified.
  - That file was unrelated pre-existing work and was intentionally left untouched and unstaged during this issue submission.
