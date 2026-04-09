# Feature Specification: Google Maps Integration of Queue Page
Issue: [#30](https://github.com/mathursrus/SKB/issues/30)
PR: [#35](https://github.com/mathursrus/SKB/pull/35)

## Summary
- **Issue**: #30 — Google Maps integration of queue page
- **Workflow**: Feature Specification
- **Description**: Created comprehensive feature specification for enabling diners to discover and access the SKB queue page from Google Maps restaurant listings. The approach uses Open Graph meta tags, JSON-LD structured data, and canonical URLs on the queue page, combined with manual Google Business Profile configuration by the restaurant owner.

## Work Completed
- **Spec document**: `docs/feature-specs/30-google-maps-integration.md`
  - Customer analysis, problem statement, and desired outcome
  - User experience flow (Google Maps discovery → queue page)
  - Restaurant owner setup instructions (Google Business Profile)
  - 7 requirements (R1-R7) with acceptance criteria
  - Alternatives analysis (5 alternatives evaluated and discarded)
  - Competitive analysis (6 competitors: Yelp Guest Manager, Waitly, NextMe, Waitwhile, Reserve with Google, Waitlist Me)
  - Competitive positioning strategy with differentiation pillars
  - Validation plan (6 verification steps)
  - Compliance section (standard web security, no PII in URLs)
  - Design standards section (generic UI baseline)
- **UI Mock**: `docs/feature-specs/mocks/30-queue-google-maps.html`
  - Interactive HTML/CSS mock showing the queue page with annotated `<head>` section
  - Displays all new meta tags, Open Graph tags, and JSON-LD structured data
  - Page body matches current production queue page design
  - Verified rendering in browser via Playwright

## Completeness Evidence
- Issue tagged with label `phase:design`: Yes (existing label)
- Issue tagged with label `status:needs-review`: To be updated
- All specification documents committed/synced to branch: Yes

| Customer Research Area | Sources of Information |
|------------------------|----------------------|
| Google Maps restaurant discovery flow | Google Business Profile documentation, Reserve with Google Help Center |
| Competitor waitlist-to-Maps integrations | Yelp Blog, Waitly docs, Waitwhile Help Center, NextMe product page, Waitlist Me features page, G2 reviews |
| Structured data for restaurants | Schema.org Restaurant type, Google Rich Results documentation |
| Open Graph protocol | Open Graph Protocol specification |

| PR Comment | How Addressed |
|------------|---------------|
| *No prior feedback* | N/A — initial submission |

## Validation
- Mock rendered and visually verified in browser (Playwright screenshot captured)
- Accessibility snapshot confirmed: all form controls have labels, heading hierarchy correct, no overlap/clipping
- OG tags, JSON-LD, canonical URL all present and correctly formatted in mock HTML
- Spec requirements trace back to the original issue ask

## Quality Checks
- [x] Feature spec document complete with all template sections
- [x] HTML mock created (no markdown mocks)
- [x] Competitive analysis with 6 competitors and sourced research
- [x] Requirements table with acceptance criteria
- [x] Validation plan defined
- [x] Compliance section addressed
- [x] Design standards documented

## Phase Completion

| Phase | Status | Evidence |
|-------|--------|----------|
| context-gathering | Complete | Issue loaded, codebase explored, requirements extracted, compliance reviewed |
| spec-drafting | Complete | Spec document and HTML mock created |
| competitor-analysis | Complete | 6 competitors researched with web sources, spec updated with findings |
| spec-completeness-review | Complete | Mock validated in browser, requirement coverage confirmed, all sections present |
| spec-submission | Complete | Evidence document, commit, PR, and issue labels updated |

## Continuous Learning

| Learning | Agent Rule Updates |
|----------|-------------------|
| SKB uses server-side template rendering (`queue-template.ts`) for the queue page, so meta tags should be injected there rather than in static HTML | No rule update needed — project-specific implementation detail |
| All major waitlist competitors now offer Google Maps integration via Reserve with Google; SKB's direct-link approach is a deliberate differentiation, not a gap | No rule update needed — competitive positioning decision |
