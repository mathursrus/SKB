# Issue #8 - Wait-time Widget for Google Maps/Search: Implementation Work List

## Issue Type: feature

## Summary
Add server-side JSON-LD structured data and meta tags to `queue.html` so Google can surface live wait-time info in Search/Maps results. The existing static file serving must be replaced with server-side template rendering that injects `getQueueState()` data into the HTML head.

## Implementation Checklist

### Server-side Template Rendering
- [x] `src/mcp-server.ts` - Route handler for `/queue.html` and `/queue` registered before `express.static`. Calls `renderQueuePage()` which injects JSON-LD and meta tags.
- [x] Route handled in `mcp-server.ts` directly (not in `src/routes/queue.ts`) since it is a page route, not an API route. Follows the pattern of serving pages at the top level.

### JSON-LD Structured Data
- [x] `src/services/jsonld.ts` - `buildJsonLd()` builds Restaurant entity with name, address, url, servesCuisine, and makesOffer.
- [x] When `partiesWaiting === 0`, description reads "No wait -- walk right in".
- [x] When `partiesWaiting > 0`, description includes approximate wait minutes and party count.
- [x] Includes `potentialAction` with `@type: "JoinAction"` pointing to queue page URL.
- [x] No PII in structured data -- only aggregate metrics (verified by test).

### Meta Tags
- [x] `<meta name="description">` injected with live wait-time info.
- [x] `<meta property="og:description">` injected with live wait-time info.
- [x] `<meta property="og:title">` injected with restaurant name.

### Error Handling / Fallback
- [x] `src/services/queue-template.ts` - `renderQueuePage()` catches DB errors and serves fallback meta tags with no JSON-LD. Page load never blocked.

### Tests
- [x] Unit test: JSON-LD builder function produces correct output for N parties waiting (jsonld.test.ts).
- [x] Unit test: JSON-LD builder produces "No wait" message for 0 parties (jsonld.test.ts).
- [x] Unit test: Meta tag builder produces correct content (jsonld.test.ts).
- [x] Integration test: `renderQueuePage()` returns HTML with valid JSON-LD block (queue-template.integration.test.ts).
- [x] Integration test: `renderQueuePage()` returns HTML with correct meta tags (queue-template.integration.test.ts).
- [x] Integration test: Zero-queue renders "No wait" (queue-template.integration.test.ts).
- [x] Verify `queue.js` client-side behavior unchanged -- queue.html structure preserved (queue-template.integration.test.ts).

### Regression
- [x] All existing unit tests pass (codes, hostAuth, rateLimit, serviceDay, queue).
- [x] All existing integration tests pass (queue.integration.test.ts).
- [x] TypeScript compiles cleanly with zero errors.

## Discovered Patterns
- **Express routing**: Routes defined in `src/routes/*.ts` as factory functions returning `Router`, mounted in `mcp-server.ts` under `/api`.
- **Static serving**: `express.static(publicDir)` serves everything in `public/`. `queue.html` is currently served this way.
- **Queue state**: `getQueueState()` in `src/services/queue.ts` returns `{ partiesWaiting, etaForNewPartyMinutes, avgTurnTimeMinutes }`.
- **Environment variables**: `MONGODB_URI`, `PORT`, `WEBSITES_PORT`, `SKB_HOST_PIN`, `SKB_COOKIE_SECRET`.
- **Test framework**: Node built-in `node:test` + custom `runTests()` harness with tag filtering. Integration tests use real MongoDB.
- **TypeScript strict mode**: `noImplicitAny`, `strictNullChecks` enabled.
- **No template engine**: Currently no template engine installed. Spec suggests simple string replacement is acceptable for v1.

## Validation Requirements
- `uiValidationRequired`: false (no visible UI changes; JSON-LD and meta tags are invisible metadata)
- `mobileValidationRequired`: false (no UI changes)
- Browser validation: Verify page source contains JSON-LD and meta tags via view-source or curl
- Functional validation: `queue.js` interactive behavior unchanged after templating change

## Deferrals / Open Questions
- Restaurant details (telephone, full address, servesCuisine) will be hardcoded as constants for v1. These can move to env vars or config in a future iteration.
- Google Actions Center Waitlist API integration is deferred to v2.
- Google Business Profile attribute update is deferred to v2.
- Template engine choice: using simple string replacement for v1 per spec recommendation.
