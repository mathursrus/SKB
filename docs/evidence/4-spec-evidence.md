# Feature Specification: Queue Display Board for Restaurant TV
Issue: [#4](https://github.com/mathursrus/SKB/issues/4)
PR: [#18](https://github.com/mathursrus/SKB/pull/18)

## Summary
- **Issue**: #4 - Queue display board for restaurant TV
- **Workflow type**: Feature Specification
- **Description**: Created a comprehensive product specification for a read-only, TV-optimized queue display board that shows live queue status (position, party code, state) on a wall-mounted TV. Reduces "is it my turn?" anxiety and host interruptions by giving everyone a shared, visible source of truth.

## Work Completed

### Key files created
| File | Purpose |
|---|---|
| `docs/feature-specs/4-queue-display-board.md` | Full feature specification with 12 requirements, acceptance criteria, competitive analysis, and validation plan |
| `docs/feature-specs/mocks/4-board.html` | Interactive HTML/CSS mock of TV board display (dark theme, 2-column grid, 1080p landscape) |
| `docs/evidence/4-spec-evidence.md` | This evidence document |

### Approach
1. Read GitHub issue #4 and existing codebase (`queue.ts` service, `queue.ts` routes, `host.ts` routes, `types/queue.ts`, `public/queue.html`, `public/styles.css`).
2. Identified `listHostQueue()` as the existing data source and `ACTIVE_STATES` filter as the reusable query pattern.
3. Extracted 12 traceable requirements (R1-R12) with SHALL-style language covering the API endpoint, TV page, auto-refresh, privacy, and readability.
4. Wrote 8 Given/When/Then acceptance criteria and 5 edge cases.
5. Created an interactive HTML/CSS mock of the TV board with dark theme, 2-column grid, gold accent highlights for called parties, and pulse animation.
6. Validated mock rendering at 1920x1080 via Playwright. Fixed a bug where entry #1 was missing the `.called` CSS class.
7. Researched 6 competitors via web search (Yelp Guest Manager, WaitQ, Waitly, NextMe, TablesReady, paper baseline) with 10 cited sources.
8. Documented competitive positioning with 4 key advantages and 3 response strategies.

### Specification sections
- Customer and problem statement (waiting diner + host operator)
- User experience flow (board display + new API endpoint)
- UI mock (HTML/CSS, TV-optimized dark theme, brand-aligned)
- Design Standards Applied (generic UI baseline with SKB palette)
- 12 functional requirements with traceability IDs (R1-R12)
- 8 acceptance criteria (Given/When/Then)
- 5 edge cases (empty queue, large queue, network failure, day rollover, rapid changes)
- Compliance requirements (privacy-safe by architecture, no PII exposed)
- Validation plan (5 verification methods)
- 5 alternatives considered with rationale
- 6 competitors analyzed with differentiation strategy
- 5 open questions for owner review

## Completeness Evidence
- Issue tagged with label `phase:spec`: Yes
- Issue tagged with label `status:needs-review`: Yes
- All specification documents committed/synced to branch: Yes

| Customer Research Area | Sources of Information |
|---|---|
| Diner pain point (status anxiety, host interruptions) | GitHub issue #4, issue #1 spec |
| Existing codebase and data model | `src/services/queue.ts` (listHostQueue, ACTIVE_STATES), `src/types/queue.ts` (QueueEntry, PartyState) |
| Existing API surface | `src/routes/queue.ts` (public endpoints), `src/routes/host.ts` (host-gated endpoints) |
| Brand identity and design standards | `public/styles.css` (SKB brand colors, typography, Fira Sans) |
| Competitive landscape | Web search: Yelp Guest Manager, WaitQ, Waitly, NextMe, TablesReady (April 2026) |
| Queue display best practices | WaitQ blog (35% perceived wait reduction with real-time updates) |

| PR Comment | How Addressed |
|---|---|
| (No prior feedback) | N/A |

## Validation
- Mock (`4-board.html`) opened in browser via Playwright at 1920x1080 viewport and screenshot captured.
- 2-column grid layout renders correctly at TV resolution.
- Header displays SKB branding, party count (6), and live clock.
- Called entries (#1, #2) highlighted with gold border and gold text.
- Waiting entries (#3-6) displayed in muted gray.
- Dark theme provides high contrast for TV readability.
- Code text is large and prominent (36px monospace).
- No horizontal scrolling or clipping at 1920x1080.
- Empty state div present (toggleable via JS).
- All 8 issue requirements mapped to traceable spec requirements (R1-R12).

## Quality Checks
- All deliverables complete (spec, mock, evidence)
- Documentation uses clear SHALL-style requirements with no vague terms
- Mock is interactive HTML/CSS (not markdown code blocks)
- Mock validated in browser at TV resolution (1920x1080)
- Competitive analysis sourced with URLs and dates
- Work ready for review

## Continuous Learning

| Learning | Agent Rule Updates |
|---|---|
| TV-optimized mocks need dark theme and large text (36px+ for codes) to be readable at 3-5m distance; phone-optimized styles do not transfer to TV use cases | None (project-specific decision) |
| WaitQ is a new direct competitor with a built-in display board feature at $17/mo; should be tracked in future competitive analyses | Recommend adding to fraim/config.json competitors when configured |
| Privacy-safe-by-architecture (endpoint physically cannot return PII) is a stronger claim than privacy-by-policy (endpoint could return PII but chooses not to) | None (already implicit in project approach) |
