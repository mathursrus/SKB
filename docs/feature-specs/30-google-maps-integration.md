# Feature: Google Maps Integration of Queue Page

Issue: [#30](https://github.com/mathursrus/SKB/issues/30)
Owner: Claude (agent)

## Customer

**Walk-in diner discovering the restaurant via Google Maps** — a hungry person searching Google Maps for nearby restaurants, who finds Shri Krishna Bhavan in the results and wants to check the wait time or join the queue before driving over.

## Customer's Desired Outcome

"I found this restaurant on Google Maps. I can see their current wait time and join the line right from the Maps listing — before I even leave home."

## Customer Problem being solved

Today, diners can only join the SKB queue by scanning a QR code at the restaurant door or having the direct URL. This means:
- **Discovery gap**: Potential diners searching on Google Maps have no way to know the wait time until they physically arrive.
- **Lost customers**: Diners who see a restaurant on Maps but can't gauge the wait may choose a competitor instead.
- **Wasted trips**: Diners drive to the restaurant only to find a 45-minute wait and leave.

Google Maps is the dominant discovery channel for restaurants. Bridging the Maps listing to the queue page removes friction and captures diners earlier in their decision funnel.

## User Experience that will solve the problem

### Discovery flow (Google Maps → Queue Page)

1. Diner opens Google Maps (mobile or desktop) and searches for "Shri Krishna Bhavan" or "restaurants near me" in Bellevue.
2. Diner taps the restaurant's Google Business Profile listing.
3. In the listing, diner sees a **"Join Waitlist"** action link (configured via Google Business Profile as a Place Action Link / Order URL).
4. Diner taps the link → opens the SKB queue page at `https://{domain}/r/skb/queue.html` in their mobile browser.
5. From here, the existing diner flow takes over: see wait time, join the line, get confirmation code.

### What the restaurant owner configures (one-time setup)

1. Owner logs into [Google Business Profile](https://business.google.com/) for their restaurant.
2. Owner navigates to the "Edit profile" section and finds the **Website / Menu / Order** links area.
3. Owner adds the queue page URL (`https://{domain}/r/{loc}/queue.html`) as the **"Order ahead"** or **"Reservations"** link.
4. Google Maps now shows this link on the restaurant's listing.

### What SKB provides to support this

1. **Open Graph & meta tags** on the queue page so the link previews well when shared or crawled:
   - `og:title` — "{Restaurant Name} — Join the Waitlist"
   - `og:description` — "Check the current wait time and join the line. No app, no account needed."
   - `og:type` — "website"
   - `og:url` — canonical URL for the queue page
   - `meta description` — same as og:description
2. **Location data model extension** — add optional fields to the `Location` type to store the public-facing URL and Google Maps Place ID for administrative reference:
   - `publicUrl?: string` — the public HTTPS URL for this location's queue page (used to generate meta tags)
   - `googlePlaceId?: string` — Google Maps Place ID (for reference/future use)
3. **Structured data (JSON-LD)** on the queue page using `Restaurant` schema with `potentialAction` of type `ReserveAction` so Google can understand the page's purpose and potentially show richer results.
4. **Canonical URL** via `<link rel="canonical">` on the queue page to ensure Google indexes the correct URL.

### UI Mock

- [Queue page with meta tags and structured data](mocks/30-queue-google-maps.html) — shows the queue page as it would appear when accessed from Google Maps, including the enhanced `<head>` section with Open Graph tags, structured data, and a subtle "Found us on Google Maps?" banner for first-time visitors.

### Edge cases & empty states

- **Restaurant not on Google Maps**: The restaurant owner must have an active Google Business Profile. SKB cannot create this — the spec documents the setup steps the owner must follow.
- **Queue is closed / no active service day**: The queue page already handles this by showing "0 parties waiting" and disabling the join form. No changes needed.
- **Wrong location slug in URL**: Existing 404 handling applies.
- **User arrives without Google Maps context**: The page works identically — the meta tags and structured data are invisible to the user and only affect how the link appears in search/share previews.

## Requirements

| ID | Type | Requirement | Acceptance Criteria |
|----|------|-------------|---------------------|
| R1 | Functional | The queue page SHALL include Open Graph meta tags (`og:title`, `og:description`, `og:type`, `og:url`) populated with the location's name and queue page URL. | Given a crawler or social platform fetches the queue page URL, When it parses the HTML head, Then it finds valid OG tags with the restaurant name and a description mentioning "waitlist". |
| R2 | Functional | The queue page SHALL include a `<meta name="description">` tag describing the waitlist functionality. | Given a search engine crawls the queue page, When it indexes the page, Then the meta description reads "Check the current wait time and join the line. No app, no account needed." or similar. |
| R3 | Functional | The queue page SHALL include JSON-LD structured data using `Restaurant` schema with a `ReserveAction` potential action pointing to the queue URL. | Given Google's structured data testing tool is run against the queue page, When it parses the JSON-LD, Then it validates a `Restaurant` entity with a `ReserveAction`. |
| R4 | Functional | The queue page SHALL include a `<link rel="canonical">` tag with the full public URL of the queue page. | Given the queue page is rendered, When the HTML head is inspected, Then a canonical link points to `{publicUrl}/r/{loc}/queue.html`. |
| R5 | Data | The `Location` interface SHALL be extended with optional `publicUrl` (string) and `googlePlaceId` (string) fields. | Given a location document in MongoDB, When `publicUrl` is set, Then the queue page template uses it for canonical/OG URLs. When not set, meta tags use a relative URL or omit absolute URLs. |
| R6 | Functional | The server-side queue template (`queue-template.ts`) SHALL inject meta tags and JSON-LD into the HTML `<head>` when rendering the queue page, using location data. | Given a request to `/r/:loc/queue.html`, When the server renders the page, Then the HTML includes OG tags, meta description, canonical link, and JSON-LD in the head. |
| R7 | Documentation | SKB SHALL provide a setup guide documenting how a restaurant owner configures their Google Business Profile to link to the queue page. | Given a restaurant owner reads the setup guide, When they follow the steps, Then they can add the queue URL to their Google Business Profile listing. |

## Compliance Requirements

No formal compliance regulations are configured for this project. Standard web security practices apply:
- No PII is exposed in URLs or meta tags.
- The `publicUrl` field stores only the base URL, not user data.
- JSON-LD structured data contains only public restaurant information (name, URL).

## Validation Plan

1. **Meta tag verification**: Open the queue page in a browser, view source, and confirm OG tags, meta description, canonical link, and JSON-LD are present with correct values.
2. **Structured data validation**: Paste the queue page URL into [Google's Rich Results Test](https://search.google.com/test/rich-results) and confirm no errors.
3. **Social share preview**: Paste the queue page URL into the [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) or [Twitter Card Validator](https://cards-dev.twitter.com/validator) and confirm the preview shows the restaurant name and description.
4. **Google Maps manual test**: After the restaurant owner configures their Google Business Profile, search for the restaurant on Google Maps and verify the action link appears and opens the correct queue page.
5. **Mobile test**: Access the queue page from a Google Maps listing on a mobile device and confirm the full diner flow works (see wait time, join, get code).
6. **Fallback test**: Confirm the queue page still works correctly when `publicUrl` is not set on the location (graceful degradation — relative URLs or no absolute meta tags).

## Alternatives

| Alternative | Why discard? |
|------------|-------------|
| **Reserve with Google (RwG) program** | Requires a formal partnership with Google and integration with their booking API. Overkill for a simple waitlist link. The overhead of maintaining a booking provider integration far exceeds the benefit for a single-restaurant operation. |
| **Google Maps embed on SKB landing page** | Solves the reverse problem (showing Maps on SKB) but doesn't solve the actual ask: getting diners FROM Maps TO the queue. |
| **Custom Google Maps widget/overlay** | Requires Google Maps JavaScript API, API key management, and ongoing costs. The issue asks for discovery from Maps, not embedding Maps into SKB. |
| **Progressive Web App (PWA) with geolocation** | Would allow SKB to detect nearby restaurants and auto-suggest queues, but requires location permissions, service worker complexity, and doesn't address the Google Maps discovery channel. |
| **QR code printed on Google Maps listing** | Google Maps doesn't support custom imagery in listings. Not feasible. |

## Competitive Analysis

### Configured Competitors Analysis

| Competitor | Current Solution | Strengths | Weaknesses | Customer Feedback | Market Position |
|------------|------------------|-----------|------------|-------------------|-----------------|
| **Yelp Guest Manager** | Integrated with Reserve with Google — diners see "Join Waitlist" directly on Google Search and Maps. Also surfaces on Yelp, Apple Maps, Facebook, Instagram, TikTok. Toast POS integration syncs host insights. | Multi-platform discovery (Google, Apple Maps, Yelp, social); deep POS integration with Toast; single dashboard for waitlist + reservations | Expensive ($249+/mo); vendor lock-in — Yelp owns the diner relationship and data; complex onboarding | G2 reviews praise ease of use but cite high cost; restaurant owners dislike Yelp's control over customer relationships | Market leader in restaurant waitlist discovery; dominant but losing indie restaurant trust |
| **Waitly** | Reserve with Google integration for Pro subscribers ($30/mo). Diners join waitlist from Google Search/Maps. QR code self check-in. Two-way SMS messaging. | Native Google Maps "Join Waitlist" button via RwG; affordable Pro tier; multi-location support; no app required for diners | Requires Pro subscription; Google Maps join is limited to name/phone/email only (no party size or custom fields); 72hr activation delay | Users praise simplicity; limitations on join fields frustrate restaurants needing party size | Growing mid-market player; strong value proposition for cost-conscious restaurants |
| **NextMe** | Google integration lets diners join the line from Search or Maps before arriving. Virtual waiting room with customizable branding. $50/mo. | Direct Google join; customizable virtual waiting room; analytics; QR + kiosk + online check-in options | Requires app for some features; $50/mo cost; less mature than Yelp/Waitly ecosystems | Highly rated (5.0/5 on review sites) for branding and UX customization | Niche player focused on branding-conscious venues; small but growing |

### Additional Competitors Analysis

| Competitor | Current Solution | Strengths | Weaknesses | Customer Feedback | Market Position |
|------------|------------------|-----------|------------|-------------------|-----------------|
| **Waitwhile** | Direct Google Maps integration — toggle in settings auto-registers business for "Join Waitlist" on Maps. Requires restaurant category on Google. 72hr activation. | One-click Google Maps activation; address auto-matching with Google listing; enterprise-grade analytics | Join from Maps limited to name/phone/email only; SaaS pricing; restaurant must be categorized correctly on Google | G2 reviews highlight healthcare/retail strength; restaurant adoption growing | Mid-market SaaS; strongest in retail/healthcare, expanding into restaurants |
| **Reserve with Google (direct)** | Platform-level "Reserve a table" or "Join waitlist" button on Google Maps. Requires integration via authorized booking partner (Yelp, Waitly, Eat App, etc.). | Native Google UX; highest-trust placement; real-time availability sync | Cannot integrate directly — must go through an authorized partner; primarily reservation-focused; complex API | Diners love the seamless experience; small restaurants find partner onboarding prohibitive | Google's own platform; growing but gated behind partner ecosystem |
| **Waitlist Me** | "Join the Waitlist from Google" feature — adds a join link to Google Business Profile. Customers see estimated wait and join remotely. | Direct Google integration; simple setup; affordable ($20-60/mo) | Less feature-rich than Yelp/Waitwhile; smaller brand recognition | Positive reviews for simplicity; lacks advanced analytics | Budget-friendly option; popular with small single-location restaurants |

### Competitive Positioning Strategy

#### Our Differentiation
- **Zero friction, zero cost**: No app download, no account creation, no vendor lock-in, no monthly SaaS fee — just a URL that works in any mobile browser. Every competitor charges $20-249+/mo.
- **Restaurant-owned data**: The restaurant controls its own queue page and customer relationship. Unlike Yelp, Waitly, or Waitwhile, no platform intermediary owns the diner data or relationship.
- **Full join fields from Maps**: Competitors using Reserve with Google limit the join form to name/phone/email. Our approach links directly to the full queue page where diners enter party size — a critical field for accurate ETA calculation.
- **Simple setup**: Adding a URL to Google Business Profile takes 5 minutes. No API integration, no partnership applications, no 72-hour activation wait.

#### Competitive Response Strategy
- **If competitors highlight native "Join Waitlist" button on Maps**: Our approach trades the in-Maps button for a richer join experience (party size support) and zero vendor dependency. Future enhancement: apply for Reserve with Google partnership if demand warrants.
- **If competitors highlight multi-platform discovery (Yelp, Apple Maps, social)**: Our meta tags and structured data enable discovery across all platforms that crawl URLs — not just Google.

#### Market Positioning
- **Target Segment**: Independent restaurants and small chains that want waitlist visibility on Google Maps without paying for enterprise SaaS or surrendering customer data to platforms.
- **Value Proposition**: "Your waitlist, your customers, discoverable on Google Maps — in 5 minutes, for free."

### Research Sources
- [Yelp adds Toast and Reserve with Google integrations](https://blog.yelp.com/news/yelp-adds-new-integrations-with-toast-and-reserve-with-google-enables-restaurants-to-simplify-their-front-of-house-operations-and-grow-diner-traffic/) — Yelp Official Blog
- [Yelp Guest Manager Reviews 2026](https://www.g2.com/products/yelp-guest-manager/reviews) — G2
- [How to Set Up Reserve with Google](https://www.waitly.com/how-to-set-up-reserve-with-google/) — Waitly
- [How to add your waitlist to Google Maps](https://help.waitwhile.com/en/articles/9952936-how-to-add-your-waitlist-to-google-maps) — Waitwhile Help Center
- [NextMe Waitlist App](https://nextmeapp.com/) — NextMe
- [Reserve with Google overview](https://developers.google.com/actions-center/verticals/reservations/e2e/overview) — Google Developers
- [Join the Waitlist from Google](https://www.waitlist.me/features/join-waitlist-google/) — Waitlist Me
- [Best Restaurant Waitlist Management Software 2026](https://www.milagrocorp.com/blog/best-restaurant-waitlist-management-software/) — Milagro
- Research conducted: 2026-04-09

## Design Standards

Mocks use the **generic UI baseline** (no project-specific design system configured). The existing SKB diner styles (black header, gold accent `#e3bf3d`, Fira Sans typography) are maintained in the mock for consistency with the current queue page.
