# Feature Specification: Wait-time Widget for Google Maps / Search
Issue: #8
PR: (to be linked after creation)

## Summary
- **Issue**: #8 - Wait-time widget for Google Maps / Search
- **Workflow type**: Feature Specification
- **Description**: Created a comprehensive feature specification for adding JSON-LD structured data and dynamic meta tags to the existing `queue.html` page, enabling Google Search and Maps to surface SKB's real-time wait times.

## Work Completed

### Key Files Created
| File | Description |
|---|---|
| `docs/feature-specs/8-wait-time-widget.md` | Full feature specification with requirements, acceptance criteria, competitive analysis, and validation plan |
| `docs/feature-specs/mocks/8-queue-with-jsonld.html` | HTML mock of the queue page with injected JSON-LD structured data and meta tags |
| `docs/evidence/8-spec-evidence.md` | This evidence document |

### Approach
1. **Context gathering**: Read issue #8, reviewed existing codebase (`src/services/queue.ts`, `src/routes/queue.ts`, `src/types/queue.ts`, `public/queue.html`, `public/queue.js`), confirmed `getQueueState()` is already public and returns needed data.
2. **Schema.org research**: Investigated schema.org vocabulary -- confirmed no dedicated `waitTime` property exists for `Restaurant`. Designed a workaround using `makesOffer` with textual description and `potentialAction` with `JoinAction`.
3. **Competitive analysis**: Researched 7 competitors (Yelp Guest Manager, Google Reserve/Actions Center, SevenRooms, TablesReady, Waitwhile, NextMe, paper list). Key finding: all competitors require a Google Reserve partnership to surface wait data in Maps; none use structured data on their own pages for organic search visibility.
4. **Spec drafting**: Created spec with 8 traceable requirements (R1-R8), 6 acceptance criteria, 4 edge cases, and 4 open questions.
5. **Mock creation**: Built HTML mock demonstrating the invisible structured data additions to the existing queue page design.
6. **Completeness review**: Validated mock renders correctly at mobile viewport (375x812), verified all issue requirements trace to spec requirements, confirmed compliance and design standards sections present.

## Completeness Evidence
- Issue tagged with label `phase:spec`: To be applied
- Issue tagged with label `status:needs-review`: To be applied
- All specification documents committed/synced to branch: Yes

| Customer Research Area | Sources of Information |
|---|---|
| Schema.org vocabulary for restaurants | [schema.org/Restaurant](https://schema.org/Restaurant), [schema.org/FoodEstablishment](https://schema.org/FoodEstablishment) |
| Google structured data policies | [Google Search Central](https://developers.google.com/search/docs/appearance/structured-data/sd-policies) |
| Google Local Business structured data | [Google Search Central](https://developers.google.com/search/docs/appearance/structured-data/local-business) |
| Google Actions Center Waitlist | [Google Actions Center](https://developers.google.com/actions-center/verticals/reservations/waitlists/overview) |
| Google Business Profile wait times | [Google Support](https://support.google.com/business/answer/6263531) |
| Yelp + Google Reserve integration | [Yelp Blog](https://blog.yelp.com/news/yelp-adds-new-integrations-with-toast-and-reserve-with-google-enables-restaurants-to-simplify-their-front-of-house-operations-and-grow-diner-traffic/) |
| Restaurant waitlist software landscape | [EatApp](https://restaurant.eatapp.co/blog/best-restaurant-waitlist-management-systems), vendor websites |
| Restaurant SEO trends 2026 | [Chowly](https://chowly.com/resources/blogs/restaurant-seo-the-complete-guide-to-getting-found-on-google/) |

| PR Comment | How Addressed |
|---|---|
| (No prior feedback) | N/A |

## Validation
- **Mock rendering**: Opened `8-queue-with-jsonld.html` in browser at 375x812 viewport -- renders correctly with no clipping, overflow, or broken elements
- **JSON-LD presence**: Verified via curl that the HTML contains valid `<script type="application/ld+json">` block with Restaurant entity
- **Meta tags**: Verified `<meta name="description">` and `<meta property="og:description">` contain wait time data
- **Requirement traceability**: All 3 issue requirements (JSON-LD, Google surfacing, GBP attribute) mapped to spec requirements or v2 scope

## Quality Checks
- [x] All deliverables complete (spec, mock, evidence)
- [x] Documentation clear and professional
- [x] Work ready for review
- [x] No PII or secrets in any artifact
- [x] Spec follows existing format established by `1-place-in-line.md`

## Phase Completion

| Phase | Status | Key Evidence |
|---|---|---|
| context-gathering | Complete | Issue read, codebase reviewed, existing API and types analyzed |
| spec-drafting | Complete | Spec and mock created following FRAIM template |
| competitor-analysis | Complete | 7 competitors analyzed, 3 new discovered (SevenRooms, TablesReady, Waitwhile) |
| spec-completeness-review | Complete | Mock validated in browser, requirement coverage confirmed |
| spec-submission | Complete | Evidence document, branch, PR, labels |

## Continuous Learning

| Learning | Agent Rule Updates |
|---|---|
| schema.org has no dedicated waitTime property for Restaurant; makesOffer with Offer description is the best workaround | None -- project-specific knowledge, not a durable rule |
| All major waitlist competitors require Google Reserve partnership for Maps visibility; structured data on own page is an underused approach | None -- competitive insight, not a process rule |
| Server-side rendering is required for reliable Google structured data indexing (client-side JS injection is unreliable) | None -- documented in spec as implementation note |
