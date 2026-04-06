# Feature Spec: Wait-time Widget for Google Maps / Search

**GitHub Issue:** [#8](https://github.com/mathursrus/SKB/issues/8)
**Status:** Draft
**Date:** 2026-04-04

---

## Customer & Their Problem

Potential diners searching "Shri Krishna Bhavan" on Google have no way to see the current wait time before driving to the restaurant. They arrive only to find a 30+ minute queue, leading to frustration and walk-aways. Surfacing real-time wait information directly in Google Search results and link previews lets diners make an informed decision before leaving home.

---

## User Experience

1. A diner searches "Shri Krishna Bhavan Bellevue" on Google.
2. Google's Knowledge Panel or rich result displays structured restaurant info including a current wait estimate (e.g., "Current wait: ~24 min").
3. If the diner shares the SKB queue link on iMessage, WhatsApp, Slack, or social media, the Open Graph preview card shows: **"SKB — Current wait: ~24 min"** (or "No wait — walk right in!" when the queue is empty).
4. Clicking through takes the diner to `queue.html`, which already shows the live queue and lets them join.

---

## Functional Requirements

### R1 — JSON-LD Structured Data on `queue.html`

Inject a `<script type="application/ld+json">` block into `queue.html` containing a Schema.org [`Restaurant`](https://schema.org/Restaurant) entity with the following properties:

| Property | Value |
|---|---|
| `@type` | `Restaurant` |
| `name` | `Shri Krishna Bhavan` |
| `address` | `13 Bellevue Way SE, Bellevue, WA 98004` |
| `url` | `https://skb-waitlist.azurewebsites.net/queue.html` |
| `servesCuisine` | `South Indian` |
| `openingHoursSpecification` | Restaurant operating hours (to be confirmed with owner) |
| `amenityFeature` | Custom property conveying current wait time (see R2) |

### R2 — Dynamic Wait-Time Population

After `queue.js` fetches `/api/queue/state`, it must update the JSON-LD script block with the current wait estimate:

- Use the `etaForNewPartyMinutes` value from the API response.
- Format as a human-readable string: `"Current wait: ~{N} min"` or `"No wait — walk right in!"` when `partiesWaiting === 0`.
- The JSON-LD block is inserted into the DOM dynamically by `queue.js`. Since Google's crawler executes JavaScript, this is sufficient for indexing.

### R3 — Open Graph Meta Tags

Add the following `<meta>` tags to `queue.html`:

| Tag | Value |
|---|---|
| `og:title` | `Shri Krishna Bhavan — Place in Line` |
| `og:description` | `Current wait: ~{N} min` (dynamically updated) |
| `og:url` | `https://skb-waitlist.azurewebsites.net/queue.html` |
| `og:type` | `website` |
| `og:site_name` | `SKB` |

**Server-rendered fallback:** Because most link-preview crawlers (iMessage, Slack, WhatsApp) do NOT execute JavaScript, the `<meta>` tags in the static HTML should carry a sensible default: `"Check current wait times at Shri Krishna Bhavan"`. Optionally, a future enhancement can add a lightweight server-side render path (e.g., Express middleware that injects the current wait into the HTML before serving) to make OG previews live.

### R4 — CORS Header on `/api/queue/state`

Add `Access-Control-Allow-Origin: *` to the `GET /api/queue/state` response so third-party sites or widgets can embed the wait time. This data is already public and contains no PII.

### R5 — Privacy

No changes required. The `/api/queue/state` endpoint already returns only anonymous aggregate data (`partiesWaiting`, `etaForNewPartyMinutes`, `avgTurnTimeMinutes`). No party names, phone digits, or codes are exposed.

---

## Acceptance Criteria

### AC1 — JSON-LD Present After Page Load
**Given** the queue page loads successfully
**When** `queue.js` completes its initial `/api/queue/state` fetch
**Then** a `<script type="application/ld+json">` element exists in the DOM containing a valid `Restaurant` schema with `name`, `address`, and a wait-time property reflecting the API response.

### AC2 — Wait Time Reflected in Structured Data
**Given** the API returns `{ partiesWaiting: 5, etaForNewPartyMinutes: 24 }`
**When** the JSON-LD block is populated
**Then** it includes a description or property containing `"~24 min"`.

### AC3 — Empty Queue Messaging
**Given** the API returns `{ partiesWaiting: 0, etaForNewPartyMinutes: 0 }`
**When** the JSON-LD block is populated
**Then** the wait-time property reads `"No wait — walk right in!"`.

### AC4 — OG Tags in Static HTML
**Given** a crawler or link-preview bot requests `queue.html` without executing JS
**When** it parses the `<head>`
**Then** it finds `og:title`, `og:description`, `og:url`, and `og:type` meta tags with sensible default values.

### AC5 — CORS on Queue State
**Given** a cross-origin `GET` request to `/api/queue/state`
**When** the response is returned
**Then** the `Access-Control-Allow-Origin` header is set to `*`.

### AC6 — API Failure Graceful Degradation
**Given** the `/api/queue/state` call fails (e.g., Mongo is down)
**When** `queue.js` handles the error
**Then** no JSON-LD block is injected into the DOM (omit rather than show stale/wrong data).

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| **Queue is empty** | Display "No wait — walk right in!" in both JSON-LD and OG description. |
| **MongoDB is down** | Do not inject JSON-LD. OG meta tags retain their static fallback text. The existing `queue.js` error handling already shows "Wait time temporarily unavailable." in the UI. |
| **Very long wait (>60 min)** | Display the number as-is (e.g., "~75 min"). No cap or special messaging needed. |
| **Page loaded but API slow** | JSON-LD is injected only after a successful API response. Googlebot typically waits up to 5 seconds for JS execution, which is sufficient for this API call. |
| **Multiple rapid refreshes** | If the JSON-LD script tag already exists, replace its content rather than appending a duplicate. |

---

## Validation Plan

1. **Schema Validator:** After implementation, test `queue.html` with [Google's Rich Results Test](https://search.google.com/test/rich-results) to confirm the JSON-LD is parsed correctly.
2. **OG Debugger:** Validate Open Graph tags with the [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) and [Twitter Card Validator](https://cards-dev.twitter.com/validator).
3. **Manual CORS Check:** Use `curl -H "Origin: https://example.com" -v https://skb-waitlist.azurewebsites.net/api/queue/state` and confirm the `Access-Control-Allow-Origin: *` header is present.
4. **Empty Queue Test:** Clear the queue in the staging environment, load `queue.html`, and verify the "No wait" messaging appears in the structured data.
5. **Mongo-Down Test:** Stop the MongoDB connection in a local dev environment, load `queue.html`, and confirm no JSON-LD block is injected.
6. **Google Search Console:** After deployment, monitor the "Enhancements" tab for structured data errors over the following 2 weeks.

---

## Alternatives Considered

| Alternative | Why Not |
|---|---|
| **Google Business Profile API** | Requires a verified GBP account and ongoing API key management. JSON-LD structured data is simpler, has no auth overhead, and works across all search engines (not just Google). Can revisit as a Phase 2 enhancement. |
| **Server-side rendering of OG tags** | Would give accurate wait times in link previews. However, it requires adding a templating engine or middleware to the Express server for a single page. Recommended as a follow-up enhancement; static fallback text is acceptable for v1. |
| **Separate `/api/queue/widget` endpoint** | The existing `/api/queue/state` already returns exactly what is needed. Adding a new endpoint would duplicate logic without benefit. Adding CORS to the existing endpoint is sufficient. |
| **Embedding wait time in Google Maps via Places API** | Requires Google Maps Platform billing and Places API write access, which is not available for most businesses. Structured data is the standard, free approach. |
