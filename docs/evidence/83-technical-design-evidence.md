# Feature: Caller Statistics
Issue: #83  
Feature Spec: [`docs/feature-specs/83-caller-statistics.md`](../feature-specs/83-caller-statistics.md)  
PR: `https://github.com/mathursrus/SKB/pull/87`

## Summary
- Issue number and title: `#83` Caller Statistics
- Workflow type: Technical design
- Brief description of work completed: Authored the caller-statistics RFC, completed a Mongo-backed technical spike, captured spike findings, and produced a traceability-backed design review package for human review.

## Work Completed
- Key files changed:
  - `docs/rfcs/83-caller-statistics.md`
  - `docs/evidence/83-technical-spike-findings.md`
  - `spike/83-caller-statistics-session-spike.ts`
  - `docs/evidence/83-technical-design-evidence.md`
- Approach taken:
  - Validated the highest-risk assumption first with a Mongo-backed spike keyed by Twilio `CallSid`.
  - Used the spike result to choose a single-document-per-call design, event-scoped persistence helpers, and lazy timeout finalization on read.
  - Completed a design-vs-spec traceability review and patched the RFC where the review exposed missing design detail (`transferReason`, stage-detail panel, mobile layout note).
- Testing completed:
  - Spike execution via `npx --yes tsx spike/83-caller-statistics-session-spike.ts`
  - Design completeness review against the feature spec and issue body

## Feedback History
Feedback file: [`docs/evidence/83-technical-design-feedback.md`](83-technical-design-feedback.md)

## Completeness Evidence
- Issue tagged with label `phase:design`: Yes
- Issue tagged with label `status:needs-review`: Yes
- All files committed/synced to branch: Yes

| PR Comment | How Addressed |
| --- | --- |
| No technical-design review comments yet. | Initial technical-design package prepared with RFC, spike artifact, spike findings, and this evidence file. |

### Traceability Matrix
| Requirement/User Story | RFC Section/Data Model | Status (Met/Unmet) | Validation Plan Alignment (How will this be verified?) |
| --- | --- | --- | --- |
| US1: Admin can judge whether inbound phone demand converts into waitlist joins. | `User Experience that will solve the problem`, `API surface`, `UI changes` | Met | UI validation for Admin `Today` view plus integration validation for joined funnel counts |
| US2: Admin can see where callers abandon the flow. | `Finalization strategy`, `API surface`, `Validation Plan`, `Risks & Mitigations` | Met | Integration and database validation for name, size, and phone-confirmation drop-offs |
| US3: Admin can see which IVR options callers use most. | `Data model / schema changes`, `API surface`, `Aggregation strategy`, `UI changes` | Met | Integration validation plus UI range-switch validation for first-menu-choice breakdown |
| US4: Caller analytics include callers who never joined the waitlist. | `Architecture choice`, `Data model / schema changes`, `Finalization strategy` | Met | Integration validation that non-join calls still produce caller-session rows and aggregates |
| R1 durable record per inbound IVR call | `Data model / schema changes`, `Persistence service contract` (`recordIncoming`) | Met | Inbound webhook integration validation asserting session creation on `/voice/incoming` |
| R2 record keyed by `CallSid` | `Architecture choice`, `Indexes`, `Data model / schema changes` (`callSid`, unique index) | Met | Spike validation and voice integration tests asserting one document stitched across endpoints |
| R3 store location/day/timestamps/outcome/ordered events | `Data model / schema changes` (`VoiceCallSession`, `steps[]`) | Met | Integration and database validation for funnel derivation from stored session documents |
| R4 capture first menu choice for `0/1/2/3/4/5` | `Data model / schema changes` (`firstMenuChoice`), `Aggregation strategy` | Met | Integration validation covering representative branches and option-count aggregation |
| R5 capture join intent | `Data model / schema changes` (`joinIntent`), `Persistence service contract` (`recordJoinIntent`) | Met | Integration validation for press-1 path before join completion |
| R6 capture normal vs fallback name capture vs failure before progress | `Data model / schema changes` (`nameCaptureMode`, `finalOutcome`), `Finalization strategy` | Met | Integration validation for speech fallback and timeout finalization to `dropped_during_name` |
| R7 capture size success, large-party transfer, and size-stage drop-off | `Data model / schema changes` (`partySize`, `transferReason`), `Persistence service contract` (`recordSizeCaptured`, `recordTransfer`), `API surface` notes | Met | Integration validation for normal size capture, large-party transfer, and timeout to `dropped_during_size` |
| R8 capture caller-ID vs manual phone source | `Data model / schema changes` (`phoneSource`), `Persistence service contract` (`recordPhoneSource`) | Met | Voice integration validation for manual-phone branch and successful join flow |
| R9 capture successful join and queue code | `Data model / schema changes` (`queueCode`, `finalOutcome`), `Persistence service contract` (`recordJoined`) | Met | Integration validation asserting `joined_waitlist` plus linked queue code |
| R10 capture non-join terminal outcomes | `Data model / schema changes` (`VoiceCallFinalOutcome`), `Finalization strategy` | Met | Integration validation across menu-only, hours-only, transfers, join error, and staged drop-offs |
| R11 expose caller stats in Admin, not Host workspace UI | `User Experience that will solve the problem`, `UI changes`, `Existing code boundaries` | Met | Browser validation confirms new section in `admin.html`; no Host UI changes are proposed |
| R12 default to `Today` and support `7` and `30` days | `API surface` (`range=1|7|30`), `Aggregation strategy`, `UI changes` | Met | Browser validation for range switching and API validation for bounded day windows |
| R13 show top-level funnel from inbound calls to successful joins | `API surface` (`funnel` DTO), `UI changes` (`Caller Funnel`) | Met | UI validation for funnel rendering and integration validation for aggregate counts |
| R14 show abandonment/transfer breakdown by IVR stage | `Finalization strategy`, `API surface` (`outcomes`), `UI changes` (`Caller Outcomes`) | Met | Integration validation for stage-specific outcomes and UI validation for stage chips/detail panel |
| R15 show first menu choice breakdown | `API surface` (`firstMenuChoices`), `UI changes` | Met | Integration validation plus Admin UI range reload checks |
| R16 provide empty state with no caller-session data | `API surface` (`historicalCoverage`), `UI changes`, `Failure modes & timeouts` | Met | Browser validation for empty-state rendering on a no-data range |
| R17 degrade gracefully for legacy pre-persistence calls | `API surface` (`historicalCoverage`), `Risks & Mitigations` (historical data), `Failure modes & timeouts` | Met | Browser validation for rollout-boundary note and API validation for legacy-gap metadata |
| R18 reuse MongoDB rather than a new analytics store | `Architecture choice`, `Existing code boundaries`, `Data model / schema changes` | Met | Code review of implementation boundaries plus integration validation against Mongo-backed reads/writes |
| R19 API returns privacy-minimized data only | `API surface` (`recentSessions`, masked `callerLast4` only), `Failure modes & timeouts`, `Telemetry & analytics` | Met | API validation that dashboard responses never include raw full phone numbers |
| R20 no call recording, transcript storage, or LLM summarization | `Architecture choice`, `Failure modes & timeouts`, `Observability` | Met | Compliance validation and implementation review to ensure only structured IVR events are persisted |
| R21 Admin UI remains usable on mobile width | `UI changes` (single-column stacking, wrapping chips), `Validation Plan` | Met | Browser/mobile-width validation for readable stacked cards and controls |
| R22 existing waitlist join path and analytics remain intact | `Developer workflow`, `Risks & Mitigations`, `Validation Plan` | Met | Regression validation for normal web joins, existing Admin analytics, and live IVR join flow |

### Architecture Gaps For User Review
- No formal project architecture document is configured in `fraim/config.json`, so the RFC's `Architecture Analysis` is based on live codebase patterns and generic standards rather than a repo-specific architecture source of truth.
- The design introduces a new `voice_call_sessions` collection and read-path timeout finalization pattern. Both are deliberate additions because the current architecture has no existing background worker or caller-funnel persistence abstraction.
- The design preserves current patterns by keeping HTTP concerns in routes, operational logic in services, and Mongo access centralized in `src/core/db/mongo.ts`.
- The design now explicitly documents that Twilio supplies raw webhook fields for call/session stitching and gather input, but staged abandonment remains application-inferred in the current flow unless additional terminal call-event callbacks are configured later.

### Review Result
Pass. The traceability matrix covers all user stories and all `R1` through `R22` requirements with no `Unmet` rows.

## Validation
- How work was validated:
  - Ran the technical spike against local MongoDB.
  - Verified aggregate funnel output and auto-finalized outcome counts from the spike run.
  - Cross-checked the RFC against the feature spec and original issue with a full traceability matrix.
- Validation results:
  - Spike result: Pass
  - Traceability review: Pass, no unmet requirements
  - Twilio contract review: Pass for raw call/gather inputs, with an explicit limitation that stage abandonment is inferred from last observed stage plus timeout in the current IVR
  - Remaining gap: full browser/curl validation is deferred until implementation because this phase produced design artifacts, not production code

## Quality Checks
- All deliverables complete: Yes
- Documentation clear and professional: Yes
- Work ready for review: Yes

## Phase Completion
- All completed FRAIM phases in this workflow so far:
  - `requirements-analysis`
  - `design-authoring`
  - `technical-spike`
  - `architecture-gap-review`
  - `design-completeness-review`
- Evidence from each phase:
  - Requirements and design: `docs/rfcs/83-caller-statistics.md`
  - Spike artifact: `spike/83-caller-statistics-session-spike.ts`
  - Spike findings: `docs/evidence/83-technical-spike-findings.md`
  - Traceability and submission package: `docs/evidence/83-technical-design-evidence.md`
- Iterations or challenges:
  - The spike exposed a Mongo update-shape constraint around `$setOnInsert` versus `$set` / `$push`, which materially influenced the final service design.
  - The completeness review exposed the need to explicitly capture large-party transfer reason and to document stage-detail/mobile UI behavior in the RFC.
  - User feedback correctly identified that the Twilio payload contract needed explicit validation. The RFC and evidence now distinguish provider-supplied raw fields from outcomes inferred by application logic.

## Due Diligence Evidence
- Reviewed feature spec in detail: Yes
- Reviewed code base in detail to understand and repro the issue: Yes
- Included detailed design, validation plan, test strategy in doc: Yes

## Prototype & Validation Evidence
- [x] Built simple proof-of-concept that works end-to-end
- [ ] Manually tested complete user flow (browser/curl)
- [x] Verified solution actually works before designing architecture
- [x] Identified minimal viable implementation
- [x] Documented what works vs. what's overengineered

Notes:
- Proof-of-concept artifact: `spike/83-caller-statistics-session-spike.ts`
- Spike command validated locally: `npx --yes tsx spike/83-caller-statistics-session-spike.ts`
- Full implementation browser flow is not built yet, so end-to-end manual product validation is intentionally deferred to feature implementation.

## Continous Learning
| Learning | Agent Rule Updates (what agent rule file was updated to ensure the learning is durable) |
| --- | --- |
| The spike reaffirmed that multi-endpoint IVR state should be modeled with event-scoped persistence helpers instead of one generic Mongo upsert. | None in repo; captured in RFC and spike findings for this issue. |
