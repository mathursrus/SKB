# Feature: Mobile App Bugs
Issue: #102  
Feature Spec: No dedicated `docs/feature-specs/102-*.md`; completeness review used the GitHub issue body as the functional spec source of truth.  
PR: https://github.com/mathursrus/SKB/pull/105

## Summary
- Workflow type: design
- Work completed:
  - Authored the technical design RFC at `docs/rfcs/102-mobile-app-bugs.md`.
  - Added requirement traceability, architecture-gap analysis, validation plan, and test matrix for issue #102.
  - Created this design evidence document and recorded the completeness review outcome.
- Remote status:
  - Branch: `feature/102-mobile-app-bugs`
  - PR: `#105` (`design(102): mobile app bugs technical design`)
- Next steps:
  - Submit the design artifacts for review.
  - Use the RFC as the implementation handoff once review feedback is addressed.
- Blocking issues:
  - No dedicated feature spec exists for issue #102; the issue body was used as the functional source of truth.

## Work Completed
- Key files changed:
  - `docs/rfcs/102-mobile-app-bugs.md`
  - `docs/evidence/102-technical-design-evidence.md`
- Approach taken:
  - Read the GitHub issue and repo-specific project rules.
  - Inspected the existing messaging, queue acknowledgement, inbound SMS, and staff revoke code paths in `src/routes/host.ts`, `src/routes/queue.ts`, `src/routes/sms.ts`, `src/services/chat.ts`, `src/services/queue.ts`, `public/host.js`, `public/queue.js`, and `public/admin.js`.
  - Reused the repo’s existing RFC patterns from prior messaging/waitlist work to keep the design aligned with the current architecture.
- Testing completed:
  - No code implementation or runtime tests were executed in this workflow.
  - Design completeness was validated by traceability review against the issue requirements.

## Completeness Evidence
- Issue tagged with label `phase:design`: Yes
- Issue tagged with label `status:needs-review`: Yes
- All files committed/synced to branch: No

| PR Comment | How Addressed |
|---|---|
| No prior design feedback file or PR comments exist for issue #102. | RFC drafted directly from the issue body, codebase analysis, and prior messaging/staff RFC patterns. |

### Traceability Matrix

| Requirement/User Story (from Original Issue/Spec) | RFC Section/Data Model | Status (Met/Unmet) | Validation Plan Alignment (How will this be verified?) |
|---|---|---|---|
| Host notify must not fail with `chat.disabled`; SMS notify is a separate capability. | `Capability model`; `API surface changes -> POST /r/:loc/api/host/queue/:id/call` | Met | Integration + UI validation for notify on opted-in and non-opted-in guests |
| Host-facing failure messages must be user-friendly. | `Mutation response contract`; `UI changes -> public/host.html / public/host.js`; `UI changes -> public/admin.js` | Met | UI validation that error banners/toasts show `userMessage` instead of raw route codes |
| Disabled chat must not look like a disappearing optimistic send. | `Capability model`; `UI changes -> public/host.html / public/host.js`; `Failure modes & timeouts` | Met | UI validation that draft text persists and drawer stays open in read-only/error states |
| `On the way` must only appear after explicit acknowledgement of the latest notify cycle. | `Data model / schema changes -> queue_entries`; `API surface changes -> POST /r/:loc/api/queue/acknowledge`; `UI changes -> public/queue.js` | Met | Integration validation for notify -> no badge before ack -> ack -> badge visible -> re-notify -> badge reset |
| SMS replies must appear in the host conversation view. | `Capability model`; `Data model / schema changes -> queue_messages`; `API surface changes -> GET/POST/PATCH /r/:loc/api/host/queue/:id/chat`; `UI changes -> public/host.html / public/host.js` | Met | Integration validation for inbound SMS linking to host thread and unread badge |
| Staff revoke in Settings must produce a visible, trusted outcome. | `Mutation response contract`; `API surface changes -> POST /r/:loc/api/staff/revoke`; `UI changes -> public/admin.js` | Met | Integration + UI validation for owner success, non-owner restriction, and already-removed target |
| Architecture gaps must be documented for user review. | `Architecture Analysis` | Met | RFC review of `Patterns Missing from Architecture` and `Patterns Incorrectly Followed` sections |
| Design must include validation plan and test strategy. | `Validation Plan`; `Test Matrix` | Met | Manual completeness review of RFC sections |

Review outcome: **PASS**. No unmet requirement rows were found.

### Architectural Gaps for Review

| Gap | Why it matters | Resolution path |
|---|---|---|
| Transport-aware conversation capability resolution is not documented in the repo architecture baseline. | Issue #102 exists because conversation visibility and SMS/web transport were treated as the same concern. | Keep documented in the RFC `Architecture Analysis` section and promote into a future architecture document. |
| Typed operator mutation contracts are not yet a documented repo-wide pattern. | Raw route errors and silent refreshes created the confusing operator experience reported in issue #102. | Capture the `{ ok, code, userMessage }` pattern in the architecture doc once implementation confirms it. |
| Notify-cycle-bound acknowledgement state is not part of the current queue-state architecture. | Sticky acknowledgement state caused or failed to prevent the stale `On the way` label class of bugs. | Promote the new queue-entry binding pattern into the architecture doc after implementation feedback. |

## Due Diligence Evidence
- Reviewed feature spec in detail (if feature spec present): No dedicated feature spec present
- Reviewed code base in detail to understand and repro the issue: Yes
- Included detailed design, validation plan, test strategy in doc: Yes

## Validation
- Validation method:
  - Requirement-by-requirement traceability review against the issue body.
  - Architecture-gap review against the repo’s established route/service/static-UI patterns.
- Validation results:
  - Traceability review passed with no `Unmet` rows.
  - Architecture gaps were documented in the RFC and are non-blocking for design review.
  - The RFC includes data model, API, UI, risk, observability, and test-planning coverage for all reported issue items.

## Quality Checks
- All deliverables complete: Yes
- Documentation clear and professional: Yes
- Work ready for review: Yes

## Phase Completion
- Requirements-analysis completed:
  - Issue #102 was loaded from GitHub and mapped to the relevant code paths.
- Design-authoring completed:
  - RFC drafted, no prior feedback file existed, and no spike was required.
- Architecture-gap-review completed:
  - RFC updated with patterns correctly followed, missing from architecture, and naming debt notes.
- Design-completeness-review completed:
  - Traceability matrix created and review passed.

## Prototype & Validation Evidence
- [ ] Built simple proof-of-concept that works end-to-end
- [ ] Manually tested complete user flow (browser/curl)
- [ ] Verified solution actually works before designing architecture
- [x] Identified minimal viable implementation
- [x] Documented what works vs. what's overengineered

## Continous Learning

| Learning | Agent Rule Updates (what agent rule file was updated to ensure the learning is durable) |
|---|---|
| Issue #102 reinforces that transport capability and conversation visibility must be modeled separately in host UX and route contracts. | None in this phase; captured as an architecture gap in the RFC for later promotion if implementation confirms the pattern. |
