# Issue #83 Implementation Work List

## Scope Summary

Issue type: `feature`

Implementation target:
- Add durable caller-session persistence for IVR calls.
- Expose caller-statistics analytics to the Admin workspace.
- Preserve the existing waitlist join path and current analytics behavior.

Scope status:
- Not a phase-splitting candidate.
- Expected targeted code/test modifications are under 15 primary implementation files.

## Standing Work List

- [x] `src/types/queue.ts` - Add caller-statistics DTOs and caller-session domain types used by backend and Admin responses.
- [x] `src/core/db/mongo.ts` - Add `voiceCallSessions()` collection accessor and bootstrap indexes for caller-session queries.
- [x] `src/services/voiceCallSessions.ts` - Implement event-scoped caller-session persistence and timeout finalization helpers.
- [x] `src/services/callerStats.ts` - Implement location/range-bounded aggregation and privacy-minimized recent-session mapping.
- [x] `src/routes/voice.ts` - Instrument inbound/menu/join/name/size/phone/transfer/info outcomes with best-effort caller-session writes.
- [x] `src/routes/host.ts` - Add authenticated caller-statistics read endpoint for Admin.
- [x] `public/admin.html` - Add caller-statistics dashboard section, empty/error states, and range/detail containers.
- [x] `public/admin.js` - Load/render caller statistics, range switching, empty state, and mobile-safe stage detail behavior.
- [x] `tests/integration/voice.integration.test.ts` - Extend IVR integration coverage to assert session persistence for representative call paths.
- [x] `tests/integration/caller-stats.integration.test.ts` - Add integration coverage for analytics aggregation and timeout finalization.
- [x] `docs/evidence/83-ui-polish-validation.md` - Recorded browser/mobile UI validation results with populated, empty, error, and mobile screenshots.
- [x] `docs/evidence/83-implementation-evidence.md` - Built the implementation evidence package with validation and review results.

## Discovered Patterns To Follow

- MongoDB is the system of record; new analytics data must live in Mongo, not a second datastore.
- Route files keep HTTP concerns thin and delegate logic to services.
- Index bootstrapping is centralized in `src/core/db/mongo.ts`.
- Host/Admin APIs live under `src/routes/host.ts` and use `requireHost` / `requireAdmin` guards.
- Admin UI is server-rendered static HTML/JS in `public/admin.html` and `public/admin.js`, not a separate SPA framework.
- Integration tests use real Express routers plus local Mongo and explicit route-driving via HTTP requests.
- Voice flow already passes some transient state through query params between TwiML steps; caller analytics must tolerate that stage model.

## Quality Requirements

- Analytics persistence must be best-effort and must not fail closed on the live caller IVR path.
- Caller-statistics responses must not expose full raw caller phone numbers.
- Stage abandonment must be implemented as application inference from last observed stage plus timeout, matching the current Twilio + IVR design.
- Existing waitlist join and host analytics behavior must remain green.
- No placeholder comments or partial code paths.
- Implementation note: the existing `voice.ts` large-party branch was unreachable because `>10` was rejected before transfer logic. The implementation fixed that by using the configured large-party threshold and allowing larger keypad entries through the transfer path.

## Validation Requirements

- `buildValidationRequired: true`
- `integrationValidationRequired: true`
- `uiValidationRequired: true`
- `mobileValidationRequired: true`
- `securityReviewRequired: true`

Required validation modes:
- TypeScript compile check via `npm run build` or `npm run typecheck`
- Relevant integration tests via `npm run test:integration -- <target>` equivalent project-supported commands
- Manual browser validation in Admin for:
  - `Today`, `7 days`, `30 days`
  - empty state
  - error state containment
  - recent call rows and stage-detail panel behavior
- Mobile-emulator or narrow-device-profile validation for Admin caller-statistics layout

Evidence artifacts required:
- `docs/evidence/83-ui-polish-validation.md`
- `docs/evidence/83-implementation-evidence.md`

## Known Open Questions / Guardrails

- The current design correction must be preserved: Twilio provides raw call and gather inputs, but abandonment labels are inferred by our app unless additional terminal callbacks are added later.
- Large-party routing should remain represented as `front_desk_transfer` with `transferReason=large_party`, not a new top-level funnel outcome.
- If implementation reveals that current `voice.ts` gather behavior cannot support acceptable abandonment attribution, stop and re-scope rather than silently changing the analytics semantics.
