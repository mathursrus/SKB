# Feature: Google Maps Integration of Queue Page
Issue: [#30](https://github.com/mathursrus/SKB/issues/30)
Feature Spec: [docs/feature-specs/30-google-maps-integration.md](../feature-specs/30-google-maps-integration.md)
PR: *To be linked after PR creation*

## Completeness Evidence
- Issue tagged with label `phase:design`: Yes
- Issue tagged with label `status:needs-review`: Yes
- All files committed/synced to branch: Yes

| PR Comment | How Addressed |
|------------|---------------|
| *No prior feedback* | N/A — initial submission |

### Traceability Matrix

| Requirement/User Story | RFC Section/Data Model | Status | Validation Plan Alignment |
|------------------------|------------------------|--------|--------------------------|
| R1: Queue page SHALL include OG meta tags (og:title, og:description, og:type, og:url) | `queue-template.ts` Changes — `buildHeadInjection` adds og:type and og:url; og:title and og:description already exist | Met | Integration test: assert og:type and og:url present in rendered HTML |
| R2: Queue page SHALL include `<meta name="description">` tag | Already exists in `jsonld.ts` `buildMetaDescription()` — RFC updates to use Location name | Met | Existing integration test already covers this |
| R3: Queue page SHALL include JSON-LD structured data with Restaurant schema and ReserveAction | `jsonld.ts` Changes — `buildJsonLd()` updated to accept Location param; existing JoinAction serves same purpose as ReserveAction | Met | Integration test: assert `application/ld+json` with `Restaurant` type in rendered HTML |
| R4: Queue page SHALL include `<link rel="canonical">` tag | `queue-template.ts` Changes — `buildHeadInjection` adds canonical link when `publicUrl` set | Met | Integration test: assert canonical link present when publicUrl set; absent when not |
| R5: Location interface SHALL be extended with optional `publicUrl` and `googlePlaceId` fields | Data Model Changes — `Location` interface in `src/types/queue.ts` | Met | Unit test: Location objects with new fields accepted by all builders |
| R6: Server-side queue template SHALL inject meta tags and JSON-LD using location data | `queue-template.ts` Changes — `renderQueuePage` fetches Location via `getLocation()` and passes to builders | Met | Integration test: rendered HTML contains location-specific data |
| R7: SKB SHALL provide a setup guide for Google Business Profile configuration | Files Modified table — `docs/guides/google-maps-setup.md` new file | Met | Manual review: guide covers step-by-step GBP setup |
| Graceful degradation when publicUrl not set | Failure Modes table — omit canonical and og:url, use relative URLs | Met | Integration test: assert tags omitted when publicUrl not set |
| Graceful degradation when DB is down | Failure Modes table — fallback injection (existing behavior preserved) | Met | Existing integration test already covers this |
| No PII in meta tags or structured data | Existing `jsonld.ts` pattern — only aggregate metrics in output | Met | Existing unit test: `buildJsonLd: no PII` already validates |

**Traceability Result: PASS** — All requirements are met. No unmet rows.

### Architecture Gaps

| Gap | Impact | Resolution |
|-----|--------|------------|
| No formal architecture document exists | Low — patterns are consistent and implicit in code | Not blocking. Documented for future initiative. |

## Due Diligence Evidence
- Reviewed feature spec in detail: Yes
- Reviewed code base in detail to understand the issue: Yes — discovered existing `jsonld.ts` and `queue-template.ts` infrastructure from Issue #8
- Included detailed design, validation plan, test strategy in doc: Yes

## Prototype & Validation Evidence
- [x] Identified minimal viable implementation — extend existing infrastructure, no new dependencies
- [x] Verified solution approach works — existing `queue-template.ts` injection pattern proven in production
- [x] Documented what works vs. what's overengineered — RFC explicitly notes Reserve with Google partnership is overengineered for this use case
- [ ] Built simple proof-of-concept — not needed; 95% confidence, extending existing working code
- [ ] Manually tested complete user flow — deferred to implementation phase

## Continuous Learning

| Learning | Agent Rule Updates |
|----------|-------------------|
| Always explore existing codebase before designing — Issue #8 already built 80% of the infrastructure | No rule update — captured in retrospective |
| Keep the hardcoded RESTAURANT const as fallback for backward compat rather than removing it entirely | No rule update — project-specific implementation detail |
