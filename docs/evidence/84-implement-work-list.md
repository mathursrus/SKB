# Issue 84 - Implement Work List

## Scope Summary

Issue #84 is a **feature**. The request is: "Host should have an idea of customer sentiment, which should be an automatic calculation based on wait times as well as host entered sentiment."

There is no existing sentiment model, sentiment override field, or host sentiment control in the current codebase. The smallest issue-scoped implementation is:

- add a **host-only sentiment signal** for active waitlist parties
- compute a default sentiment automatically from live wait conditions
- allow the host to apply a simple manual override when the automatic signal is wrong
- surface the result as an emoji + label in the host waiting list without changing diner-facing flows

No linked feature spec or RFC for issue #84 was found in `docs/feature-specs/` or `docs/rfcs/`, so implementation will follow existing queue/host patterns plus the issue body.

## Codebase Patterns

### Architecture / Ownership

- `src/services/queue.ts`
  - canonical source for active waitlist reads and host queue DTO composition
  - the right place for derived host-facing queue metadata
- `src/routes/host.ts`
  - host-authenticated API surface for waiting-list actions
  - existing pattern: thin route validation + service-layer behavior
- `public/host.js`
  - renders waiting rows and owns host row actions
- `public/styles.css`
  - shared host-table styling, row badges, and narrow-viewport treatment
- `src/types/queue.ts`
  - queue document shape + host DTO contracts

### Environment / Config

- No new environment variables are needed.
- Existing automatic queue context already includes:
  - `waitingMinutes`
  - `etaAt`
  - `state`
  - call history via `calls`
  - location-level average turn time via `getAvgTurnTime(...)`

### Constants / Validation Patterns

- Active waiting states are centralized in `src/services/queue.ts` as `ACTIVE_STATES`.
- Host-only DTO expansion belongs in `HostPartyDTO`.
- Route mutations follow the existing `POST /host/queue/:id/*` pattern with explicit request-shape validation in `src/routes/host.ts`.

### Test Patterns

- queue service integration coverage lives in `tests/integration/queue.integration.test.ts`
- authenticated host-route coverage lives in `tests/integration/host-auth.integration.test.ts`
- host UI contract coverage is split between JS/DOM-oriented UI tests and unit tests for served markup patterns

## Standing Checklist

- [x] `src/types/queue.ts` - sentiment-specific typing was isolated into `src/types/hostSentiment.ts`; host queue enrichment remained runtime-local in `src/services/queue.ts` to avoid unrelated encoding churn in `src/types/queue.ts`.
- [x] `src/services/queue.ts` - automatic sentiment derivation and manual override precedence implemented; `listHostQueue(...)` now returns host sentiment metadata on waiting rows.
- [x] `src/routes/host.ts` - host-authenticated `POST /host/queue/:id/sentiment` added with strict `happy|neutral|upset|null` validation.
- [x] `public/host.js` - waiting rows now render sentiment badges and a host override selector.
- [x] `public/styles.css` - compact sentiment badge/control styling added, including dark-mode support.
- [x] `tests/integration/queue.integration.test.ts` - covers automatic sentiment derivation and manual override precedence.
- [x] `tests/integration/host-auth.integration.test.ts` - covers authenticated set/clear override behavior and invalid payload rejection.
- [x] `tests/ui/host-sentiment.ui.test.ts` - adds UI-contract coverage for the waiting-row sentiment affordance.

## Completion Notes

- Full regression gate now passes: `npm run test:all` on 2026-04-25.
- During regression, an unrelated existing signup integration test exposed an order-dependent fixture race. The test was made deterministic by isolating collision scenarios into independent fixture data in `tests/integration/signup.integration.test.ts`.

## Validation Requirements

- `uiValidationRequired: true`
- `mobileValidationRequired: true`
- Browser validation baseline:
  - host waiting tab on desktop width
  - host waiting tab on phone-width portrait viewport
- Required manual journeys:
  - newly joined / normal-wait party shows the automatic default sentiment
  - long-wait party escalates to a worse automatic sentiment
  - host override replaces the automatic sentiment
  - host can clear the override and the row returns to automatic behavior
- Evidence artifact required:
  - `docs/evidence/84-ui-polish-validation.md`

## Open Questions / Guardrails

- Keep the feature host-only. Do not add diner-facing sentiment UI, notifications, or analytics in this issue.
- Use a small fixed sentiment vocabulary so the host can scan quickly. Avoid a freeform notes system.
- Automatic sentiment should be derived from existing queue data only; do not add speculative ML/LLM behavior.
- Manual override must take precedence over automatic sentiment until explicitly cleared.
- Keep the critical waitlist path green per project rule 7.
