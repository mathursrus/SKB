# Feature Specification: SMS Users When Host Calls Them
Issue: #29
PR: *(to be created)*

## Summary
- **Issue**: #29 — SMS users when host calls them
- **Workflow**: Feature Specification
- **Description**: Created comprehensive feature specification for adding SMS notifications to the SKB waitlist system, enabling diners to receive text messages when the host calls their party.

## Work Completed

### Files Created
| File | Purpose |
|------|---------|
| `docs/feature-specs/29-sms-users-when-host-calls-them.md` | Full feature specification |
| `docs/feature-specs/mocks/29-diner-join.html` | Interactive HTML mock of updated diner join form with full phone number field |
| `docs/feature-specs/mocks/29-sms-preview.html` | SMS message template previews (1st, 2nd, 3rd call scenarios) |
| `docs/evidence/29-spec-evidence.md` | This evidence document |

### Approach
1. **Context Gathering**: Read issue #29, explored the full codebase architecture (queue service, host routes, MongoDB models, frontend forms), identified current phone collection as last-4-digits-only with no SMS infrastructure.
2. **Spec Drafting**: Authored specification with 8 requirements (R1-R8), acceptance criteria, edge cases, user experience flows (diner join, receive SMS, host flow), and interactive HTML/CSS mocks.
3. **Competitor Analysis**: Researched 5 competitors (Yelp Guest Manager, Waitly, NextMe, TablesReady, Waitlist Me) via web search. Identified call-count-in-SMS as a unique differentiator.
4. **Completeness Review**: Validated mocks render correctly in browser, verified all issue requirements have acceptance criteria, confirmed compliance and design standards sections present.

## Completeness Evidence
- Issue tagged with label `phase:spec`: To be updated
- Issue tagged with label `status:needs-review`: To be updated
- All specification documents committed/synced to branch: To be committed

| Customer Research Area | Sources of Information |
|----------------------|----------------------|
| Competitor SMS notification features | Yelp Guest Manager, Waitly, NextMe, TablesReady, Waitlist Me product pages |
| TCPA compliance for transactional SMS | Industry standard requirements for US SMS notifications |
| Current SKB waitlist architecture | Codebase analysis: `src/services/queue.ts`, `src/routes/host.ts`, `src/types/queue.ts`, `public/queue.html` |
| Phone number collection patterns | Existing `phoneLast4` field in `JoinRequestDTO` and `QueueEntry` types |

| PR Comment | How Addressed |
|-----------|---------------|
| *(No prior feedback)* | N/A |

## Validation
- **Mock rendering**: Both HTML mocks opened in browser via Playwright, verified correct rendering
- **Requirement traceability**: All 3 issue requirements (full phone, SMS on call, call count in message) mapped to spec requirements R1-R4
- **Compliance**: TCPA and PII sections included with specific controls
- **Design standards**: Mocks match existing SKB brand (Fira Sans, Black/White/Gold)

## Phase Completion

| Phase | Status | Key Output |
|-------|--------|-----------|
| context-gathering | Complete | Issue analysis, codebase architecture review, 8 requirements extracted |
| spec-drafting | Complete | Full spec document + 2 interactive HTML mocks |
| competitor-analysis | Complete | 5 competitors analyzed, differentiation strategy defined |
| spec-completeness-review | Complete | All checks passed (mocks, requirements, compliance, design) |
| spec-submission | In Progress | Evidence document, commit, PR |

## Continuous Learning

| Learning | Agent Rule Updates |
|----------|-------------------|
| SKB collects only last-4-digits for phone — full number collection is a schema change affecting types, validation, frontend, and API | None — project-specific finding |
| No existing notification infrastructure — SMS is greenfield | None — project-specific finding |
