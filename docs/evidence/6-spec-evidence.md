# Feature Specification: End-of-Day Operations Dashboard
Issue: [#6](https://github.com/mathursrus/SKB/issues/6)
PR: [#19](https://github.com/mathursrus/SKB/pull/19)

## Summary
- **Issue**: #6 - End-of-day operations dashboard
- **Workflow type**: Feature Specification
- **Description**: Created a comprehensive product specification for a real-time stats dashboard on the host stand view, showing parties served, no-shows, average actual wait time, peak hour, and a turn-time accuracy comparison (configured vs. actual).

## Work Completed

### Key files created
| File | Purpose |
|---|---|
| `docs/feature-specs/6-end-of-day-operations-dashboard.md` | Full feature specification with 10 traceable requirements, acceptance criteria, competitive analysis, API shape, and validation plan |
| `docs/feature-specs/mocks/6-host-stats.html` | Interactive HTML/CSS mock of the collapsible stats card on the host stand view, responsive to mobile |
| `docs/evidence/6-spec-evidence.md` | This evidence document |

### Approach
1. Read GitHub issue #6 and existing codebase (`src/services/queue.ts`, `src/types/queue.ts`, `src/routes/host.ts`, `public/host.html`, `public/host.js`, `src/core/db/mongo.ts`, `public/styles.css`).
2. Confirmed all required data exists in `queue_entries` collection (`serviceDay`, `joinedAt`, `removedAt`, `removedReason`, `state` fields).
3. Extracted 10 traceable requirements (R1-R10) with SHALL-style language.
4. Wrote 7 Given/When/Then acceptance criteria and 6 edge cases.
5. Defined the `HostStatsDTO` TypeScript interface for the API response shape.
6. Created an interactive HTML/CSS mock with collapsible stats card, stat tiles, and turn-time comparison section.
7. Validated mock rendering in browser via Playwright at desktop (1280px) and mobile (375px) viewports.
8. Researched 4 competitors via web search (Yelp Guest Manager, Waitly, NextMe, paper baseline) with specific focus on analytics/reporting capabilities.

### Specification sections
- Customer and problem statement
- User experience flow (collapsible stats card on host page)
- UI mock (HTML/CSS, brand-aligned, responsive)
- Design Standards Applied (generic UI baseline with specific tokens)
- 10 functional requirements with traceability IDs
- 7 acceptance criteria (Given/When/Then)
- 6 edge cases
- API response shape (TypeScript interface)
- Compliance requirements (aggregate-only, no PII, PIN-gated)
- Validation plan (5 verification methods)
- 5 alternatives considered
- 4 competitors analyzed with differentiation strategy
- 3 open questions for owner review

## Completeness Evidence
- Issue tagged with label `phase:spec`: Yes
- Issue tagged with label `status:needs-review`: Yes
- All specification documents committed/synced to branch: Yes

| Customer Research Area | Sources of Information |
|---|---|
| Host operator pain point (no visibility into daily performance) | GitHub issue #6 |
| Existing data model and available fields | `src/types/queue.ts` (QueueEntry interface), `src/core/db/mongo.ts` (queue_entries collection) |
| Existing host UI and auth patterns | `public/host.html`, `public/host.js`, `src/routes/host.ts`, `src/middleware/hostAuth.js` |
| Brand identity and design standards | `public/styles.css` (SKB host palette, typography, spacing) |
| Competitive analytics landscape | Web search: Yelp Guest Manager (business.yelp.com, G2, GetApp), Waitly, NextMe, industry overviews (waitq.app, xenia.team), 2026-04-04 |

| PR Comment | How Addressed |
|---|---|
| (No prior feedback) | N/A |

## Validation
- Mock (`6-host-stats.html`) opened in browser via Playwright at 1280x800 (desktop) and 375x812 (mobile).
- Collapsed state: card header visible with toggle arrow, no content clipping.
- Expanded state (desktop): 4-column stat grid, turn-time comparison bar, actionable delta message. No overlap.
- Expanded state (mobile 375px): responsive 2-column grid, all values readable, turn-time section stacks correctly.
- Toggle interaction works correctly via JavaScript onclick handler.
- All issue requirements (7 asks) mapped to 10 traceable spec requirements with acceptance criteria.

## Quality Checks
- All deliverables complete (spec, mock, evidence)
- Documentation uses clear SHALL-style requirements with no vague terms
- Mock is interactive HTML/CSS (not markdown code blocks)
- Mock validated at both desktop and mobile breakpoints
- No PII exposed in proposed API response
- Work ready for review

## Continuous Learning

| Learning | Agent Rule Updates |
|---|---|
| Turn-time comparison (configured vs actual) is a unique differentiator not offered by any researched competitor -- worth highlighting in future feature pitches | None (product insight, not a durable agent rule) |
| Collapsible card pattern keeps stats accessible without disrupting primary queue-management workflow | None (UX pattern decision specific to this feature) |
