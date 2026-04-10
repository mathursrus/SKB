# Feature: Google Maps Integration of Queue Page

Issue: [#30](https://github.com/mathursrus/SKB/issues/30)
Owner: Claude (agent)

## Customer

Walk-in diners discovering the restaurant via Google Maps who want to check the wait time or join the queue before arriving.

## Customer Problem being solved

Diners who find the restaurant on Google Maps have no way to access the queue page. The existing JSON-LD and OG tag infrastructure (from Issue #8) is hardcoded to a single restaurant, missing key tags (`og:type`, `og:url`, canonical URL), and doesn't use location-specific data from the multi-tenant model.

## User Experience that will solve the problem

1. Restaurant owner adds queue URL to their Google Business Profile (one-time, manual)
2. Diner searches Google Maps → finds restaurant → taps "Join Waitlist" link
3. Browser opens `/r/:loc/queue.html` → diner sees live wait time and joins the queue
4. Google/social platforms see rich OG tags, canonical URL, and JSON-LD when crawling the page

No visible UI changes to the queue page. All changes are in the HTML `<head>` section (meta tags, structured data) and the data model.

## Technical Details

### Overview of Changes

The existing `jsonld.ts` and `queue-template.ts` infrastructure does 80% of the work. This feature extends it to be multi-tenant and adds the missing tags for Google Maps discoverability.

### Files Modified

| File | Change | Rationale |
|------|--------|-----------|
| `src/types/queue.ts` | Add `publicUrl?` and `googlePlaceId?` to `Location` interface | R5: Store location-specific URL and Maps reference |
| `src/services/jsonld.ts` | Accept `Location` param instead of hardcoded `RESTAURANT` const; add `buildCanonicalUrl()` and `buildOgType()`; resolve public URL via `resolvePublicUrl()` | R1, R3, R4: Multi-tenant JSON-LD and new tag builders |
| `src/services/queue-template.ts` | Fetch `Location` data and pass to builders; inject `og:type`, `og:url`, `<link rel="canonical">` | R1, R4, R6: Complete head injection |
| `src/services/locations.ts` | No changes needed — `getLocation()` already returns full `Location` doc | — |
| `.env.example` | Add `PUBLIC_URL` env var | Local override for dev/test |
| `tests/unit/jsonld.test.ts` | Update tests for new `Location`-aware signatures; add tests for canonical URL, og:type, env var override | Test coverage |
| `tests/integration/queue-template.integration.test.ts` | Add tests for canonical URL, og:type, og:url in rendered HTML | Test coverage |
| `README.md` | New file: project README with Google Maps waitlist integration setup instructions | R7: Documentation for restaurant owners |

### Data Model Changes

```typescript
// src/types/queue.ts — Location interface
export interface Location {
    _id: string;              // slug, e.g., "skb"
    name: string;             // display name
    pin: string;              // host-stand PIN
    createdAt: Date;
    publicUrl?: string;       // NEW: public HTTPS URL, e.g., "https://skb.example.com"
    googlePlaceId?: string;   // NEW: Google Maps Place ID, e.g., "ChIJ..."
}
```

No MongoDB migration needed — fields are optional and existing documents remain valid.

### Public URL Resolution Strategy

The public URL (used in canonical links, og:url, and JSON-LD action targets) is resolved with the following priority:

1. **`Location.publicUrl`** (per-location DB field) — highest priority, allows per-tenant override
2. **`PUBLIC_URL` env var** — site-wide default, set in `.env` or deployment config
3. **Hardcoded fallback** — the existing `https://www.krishnabhavan.com` for backward compat

```typescript
// New helper in jsonld.ts
function resolvePublicUrl(location: Location | null): string | null {
    // 1. Per-location override (DB)
    if (location?.publicUrl) return location.publicUrl;
    // 2. Environment variable (deployment/test override)
    if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
    // 3. Hardcoded default for "skb" location
    return RESTAURANT.url;
}
```

**Local dev/test**: Set `PUBLIC_URL=http://localhost:3000` in `.env` to get valid canonical URLs in development without needing to set `publicUrl` on every location document.

**Production**: Set `PUBLIC_URL` to the production domain (e.g., `https://skb.azurewebsites.net`) in the deployment environment. Individual locations can override with `Location.publicUrl` if they have custom domains.

### `jsonld.ts` Changes

**Current**: Hardcoded `RESTAURANT` const with name, address, phone, URL for Shri Krishna Bhavan.

**New**: Accept a `Location` parameter. Resolve public URL via `resolvePublicUrl()` with env var fallback for dev/test.

```typescript
// New signature (breaking change to internal function, not public API)
export function buildJsonLd(state: QueueStateDTO, location: Location | null): Record<string, unknown>;
export function buildMetaDescription(state: QueueStateDTO, location: Location | null): string;
export function buildOgDescription(state: QueueStateDTO, location: Location | null): string;
export function buildOgTitle(location: Location | null): string;

// New functions
export function buildCanonicalUrl(location: Location | null): string | null;
export function buildOgType(): string;  // returns 'website'
```

**Fallback strategy**: The hardcoded `RESTAURANT` const remains as the default for the "skb" location (backward compat). `resolvePublicUrl()` checks `Location.publicUrl` → `process.env.PUBLIC_URL` → hardcoded default. For other locations, `location.name` is used in meta tags. If no URL can be resolved, canonical/og:url tags are omitted (graceful degradation).

### `queue-template.ts` Changes

**Current**: `renderQueuePage(locationId)` calls `getQueueState()` and passes it to `buildHeadInjection()`.

**New**: Also calls `getLocation(locationId)` and passes the `Location` object to the builders.

```typescript
// Updated flow
export async function renderQueuePage(locationId: string, now?: Date): Promise<string> {
    const template = loadTemplate();
    let injection: string;

    try {
        const [state, location] = await Promise.all([
            getQueueState(locationId, now),
            getLocation(locationId),
        ]);
        injection = buildHeadInjection(state, location);
    } catch {
        injection = buildFallbackHeadInjection();
    }

    return template.replace('</head>', `${injection}\n</head>`);
}
```

**Updated `buildHeadInjection`** adds:
- `<meta property="og:type" content="website" />`
- `<meta property="og:url" content="{canonicalUrl}" />` (if `publicUrl` set)
- `<link rel="canonical" href="{canonicalUrl}" />` (if `publicUrl` set)

### Failure Modes

| Scenario | Behavior | Impact |
|----------|----------|--------|
| `getLocation()` returns null | Use fallback injection (same as DB-down path) | Meta tags degrade to generic; page still renders |
| `publicUrl` not set on location | Omit canonical and og:url tags; use relative URLs | Page works; Google may not resolve absolute URL |
| `getLocation()` throws | Caught by existing try/catch; fallback injection | Same as current behavior |
| Google crawls page while DB is down | Fallback meta tags served (generic description) | Google sees stale/generic data; no outage for diners |

### No API Surface Changes

No new REST endpoints. No changes to existing `/api/queue/*` or `/api/host/*` routes. The `publicUrl` and `googlePlaceId` fields are set directly in MongoDB (or via future admin UI). For now, the owner can set them via the MongoDB shell or a seed script.

### No Telemetry Changes

No new analytics events. Existing page-load tracking applies unchanged.

## Confidence Level

**95/100** — The infrastructure already exists. This is an extension of existing, well-tested code. The only uncertainty is whether Google will correctly parse the JSON-LD and surface the action link, but that's a Google Business Profile configuration concern, not a code concern.

## Validation Plan

| User Scenario | Expected Outcome | Validation Method |
|---------------|------------------|-------------------|
| Queue page rendered for location with `publicUrl` set | HTML includes `og:type`, `og:url`, canonical link, JSON-LD with correct URL | Integration test: assert tags present in rendered HTML |
| Queue page rendered for location without `publicUrl` | HTML includes og:title, og:description, JSON-LD but omits og:url and canonical | Integration test: assert graceful degradation |
| Queue page rendered when DB is down | HTML includes fallback meta tags, no JSON-LD | Existing integration test (already passes) |
| Google Rich Results Test against queue page URL | No errors; Restaurant entity with JoinAction detected | Manual: paste URL into Google Rich Results Test |
| Social share preview of queue page URL | Preview shows restaurant name and wait description | Manual: paste URL into Facebook Sharing Debugger |
| Diner taps "Join Waitlist" from Google Maps listing | Lands on `/r/:loc/queue.html`, sees wait time, can join | Manual: configure Google Business Profile, test on mobile |

## Test Matrix

### Unit Tests (`tests/unit/jsonld.test.ts`)

Existing tests updated + new tests added:

| Test | What It Validates |
|------|-------------------|
| `buildJsonLd: uses location.name when provided` | Multi-tenant name in JSON-LD |
| `buildJsonLd: uses publicUrl in potentialAction target when set` | Absolute URL in JoinAction |
| `buildJsonLd: falls back to hardcoded URL when publicUrl not set` | Backward compatibility |
| `buildCanonicalUrl: returns full URL when publicUrl set` | Canonical URL builder |
| `buildCanonicalUrl: returns null when publicUrl not set` | Graceful omission |
| `buildOgTitle: includes location.name` | Multi-tenant OG title |
| `buildOgType: returns 'website'` | Correct og:type value |
| `buildMetaDescription: includes location.name` | Multi-tenant meta desc |

All existing tests updated to pass `Location` parameter.

### Integration Tests (`tests/integration/queue-template.integration.test.ts`)

| Test | What It Validates |
|------|-------------------|
| `renderQueuePage: includes og:type meta tag` | New tag injection |
| `renderQueuePage: includes canonical link when publicUrl set` | Canonical URL in rendered HTML |
| `renderQueuePage: omits canonical link when publicUrl not set` | Graceful degradation |
| `renderQueuePage: includes og:url when publicUrl set` | og:url in rendered HTML |

### E2E Tests

None needed — no new external integrations. Google Business Profile configuration is a manual step outside the application.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Google doesn't surface "Join Waitlist" from structured data alone | Medium | Low | The structured data improves discoverability, but the primary mechanism is the manual Google Business Profile link. JSON-LD is a bonus, not the sole path. |
| Hardcoded `RESTAURANT` const creates drift if more locations added | Low | Low | Refactor moves restaurant metadata to `Location` documents. The hardcoded const becomes the fallback only for the "skb" location. |
| Breaking change to `jsonld.ts` function signatures | Certain | Low | Internal functions only — no external API. All callers (`queue-template.ts`) updated in same PR. Tests updated to match. |

## Observability

No new logs, metrics, or alerts. Existing request logging covers queue page renders. If canonical URLs or OG tags need debugging, view-source on the rendered page is sufficient.

## Architecture Analysis

### Patterns Correctly Followed

| Pattern | Evidence |
|---------|----------|
| **Multi-tenant service signatures** | RFC adds `getLocation(locationId)` alongside existing `getQueueState(locationId)` — same `locationId`-first parameter convention used throughout `src/services/` |
| **Template injection via `</head>` replacement** | RFC extends `buildHeadInjection()` with new tags, same injection mechanism as Issue #8 |
| **Single try/catch with static fallback** | RFC preserves the existing error handling: all async fetches inside one `try`, fallback injection on any failure |
| **Optional fields for backward compat** | `publicUrl?` and `googlePlaceId?` are optional on `Location`, matching how `phoneLast4?` is optional on `QueueEntry` — no migration needed |
| **Types in `src/types/queue.ts`** | RFC extends the `Location` interface in the single canonical types file |
| **Unit test structure** | New tests follow `{ name, tags, testFn }` pattern with `runTests()` harness |
| **Integration test isolation** | New integration tests follow `process.env.MONGODB_DB_NAME` + `resetDb()` pattern |

### Patterns Missing from Architecture

| Pattern | Description | Suggested Resolution |
|---------|-------------|---------------------|
| **No formal architecture document** | Project has no `docs/architecture.md`. Architectural patterns are implicit in the code. | Not blocking for this RFC. Consider creating one as a separate initiative. |

### Patterns Incorrectly Followed

None identified. The RFC follows all existing codebase conventions correctly.

## Design Standards

Generic UI baseline. No visible UI changes — all modifications are in the HTML `<head>` section. The queue page body remains unchanged.
