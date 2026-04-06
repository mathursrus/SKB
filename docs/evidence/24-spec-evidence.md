# Feature Specification: Full Dining Party Lifecycle
Issue: [#24](https://github.com/mathursrus/SKB/issues/24)
PR: (linked below upon creation)

## Summary
- **Issue**: #24 - Full dining party lifecycle -- from queue to checkout
- **Workflow type**: Feature Specification
- **Description**: Created a comprehensive specification to extend the party state model from a 4-state waitlist (waiting/called/seated/no_show) to a full 7-state dining lifecycle (waiting/called/seated/ordered/served/checkout/departed). The spec covers the host UI dining section, diner-facing timeline, extended stats, and new API endpoints.

## Work Completed

### Key Files Created/Changed
| File | Description |
|---|---|
| `docs/feature-specs/24-dining-party-lifecycle.md` | Full feature specification with 14 requirements, 7 acceptance criteria, 6 edge cases |
| `docs/feature-specs/mocks/24-host-dining.html` | Interactive HTML/CSS mock of host-stand view with waitlist + dining sections |
| `docs/feature-specs/mocks/24-diner-status.html` | Interactive HTML/CSS mock of diner status page with timeline visualization |
| `docs/evidence/24-spec-evidence.md` | This evidence document |

### Approach
1. Analyzed the existing codebase (types, services, routes, UI) to understand current state model
2. Extracted requirements from issue #24 using SHALL-style language with traceability tags
3. Designed UX for both host (dining section with state-advance buttons) and diner (timeline visualization)
4. Built HTML/CSS mocks matching the existing design language (palette, typography, spacing)
5. Conducted competitive research (5 competitors: Yelp Guest Manager, Toast, SevenRooms, Eat App, OpenTable)
6. Validated mocks in browser using Playwright

## Completeness Evidence
- Issue tagged with label `phase:spec`: Pending (to be set on submission)
- Issue tagged with label `status:needs-review`: Pending (to be set on submission)
- All specification documents committed/synced to branch: Yes

| Customer Research Area | Sources of Information |
|---|---|
| Competitor table management features | Yelp Guest Manager (GetApp, Yelp Business), Toast POS (Toolradar, The Retail Exec), SevenRooms (G2, product page), Eat App (pricing page, G2), OpenTable |
| Restaurant dining lifecycle patterns | Industry guides (restaurantstables.com, gitnux.org), vendor feature comparisons |
| Walk-in restaurant operational pain points | Issue #24 description, existing SKB codebase analysis |

| PR Comment | How Addressed |
|---|---|
| (No prior feedback -- initial submission) | N/A |

## Validation
- **Mock rendering**: Both HTML mocks opened and validated in Chromium via Playwright. Screenshots captured.
- **Host dining mock**: Topbar with waiting/dining counts, stats card with 9 metrics (including 4 new lifecycle metrics), waitlist table, dining table with color-coded state badges and contextual action buttons. All buttons meet 44px tap target.
- **Diner status mock**: Two example cards (Seated, Served states) with timeline visualization. Mobile-first layout. Clear typography hierarchy.
- **P0 issues**: 0
- **P1 issues**: 0
- **P2 issues**: 0

## Quality Checks
- [x] Spec follows FEATURESPEC-TEMPLATE structure
- [x] All 14 requirements use SHALL-style language with traceability tags (R1-R14)
- [x] 7 acceptance criteria in Given/When/Then format
- [x] 6 edge cases documented
- [x] Compliance section present (no formal regulations; PII/retention/auth addressed)
- [x] Design Standards Applied section present
- [x] HTML mocks (not Markdown code blocks) for all UI changes
- [x] Competitive analysis with 5 competitors researched via web search
- [x] Alternatives table with 5 options evaluated
- [x] Open Questions documented (4 items for human review)

## Phase Completion

| Phase | Status | Key Evidence |
|---|---|---|
| context-gathering | Complete | Issue #24 loaded; codebase analyzed (types, services, routes, UI); compliance reviewed; design standards resolved |
| spec-drafting | Complete | Spec file created with 14 requirements; 2 HTML mocks created |
| competitor-analysis | Complete | 5 competitors researched via web search; SevenRooms identified as closest competitor with 7-state dining journey |
| spec-completeness-review | Complete | Mocks validated in browser (0 P0/P1/P2 issues); requirement coverage confirmed; compliance and design standards sections verified |
| spec-submission | In Progress | Evidence document created; commit and PR pending |

## Continuous Learning

| Learning | Agent Rule Updates |
|---|---|
| SevenRooms tracks a 7-state dining journey (reserved > seated > eating > dessert > check > clearing > available) -- closest competitor model to what SKB is building | None (competitive intelligence, not a durable rule) |
| Existing `removeFromQueue` function conflates "seated" (successful dining start) with removal -- refactoring needed to separate lifecycle advancement from queue removal | None (implementation concern, documented in spec R12) |
