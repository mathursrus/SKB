# Feature: Rip and Replace Restaurant Website + IVR Self-Service

Issue: #45
Owner: Claude (AI Employee)

## Customer

**Shri Krishna Bhavan** (the restaurant), represented by the owner. Also the **diners** who visit the restaurant's website or call the restaurant's phone number to learn about the menu, hours, and location before deciding to visit or join the waitlist.

## Customer's Desired Outcome

1. **Eliminate the ~$200/month website hosting bill** by serving the restaurant's public website from the existing SKB Node/Express application already in production — zero incremental hosting cost.
2. **Preserve every diner-facing thing the current site does** (home page, full menu with prices, about, contact with address/phone/email/hours) with a cleaner, mobile-first design that matches the SKB brand and fixes the "Kriskhna" → "Krishna" typo.
3. **Convert phone calls into self-service** for the two information needs that drive the most manual phone lookups today: *"what's on the menu?"* and *"where are you / when are you open / where do I park?"* — so the host can focus on seating guests instead of repeating the same answers all day.

## Customer Problem Being Solved

### Problem A: Website hosting cost
The current `skbbellevue.com` is built on a shop-style CMS template (WooCommerce/Shopify-style chrome — Account, Wishlist, Search, Add-to-Cart buttons on menu items) even though the restaurant does not sell online. The restaurant is paying ~$200/month for hosting a site that contains ~5 pages of mostly-static content. That's ~$2,400/year in recurring cost for infrastructure that could be a few files on the existing SKB server.

### Problem B: Phone staff overhead
Today the existing SKB IVR only offers two options: "press 1 to join the waitlist, press 2 to hear the wait again." Every other inbound question — *"what's on the menu today?" "are you open for dinner?" "where's your parking?"* — falls through to the front desk. During peak hours the host is trying to seat a full restaurant; answering these calls manually is pure overhead and a bad caller experience (long hold, distracted greeting). The site content already answers all three questions, but there is no voice equivalent.

### Problem C: Surface drift
The live site contains small branding/UX issues that have accumulated: the restaurant name is misspelled ("Kriskhna"), a cart/wishlist appears on every page despite the restaurant not selling online, and the menu uses an e-commerce grid designed for products rather than a scannable by-category menu. A rip-and-replace is a chance to fix all of these in one go.

## User Experience That Will Solve the Problem

### Website — replacement page inventory

| # | Page | Path | Content |
|---|---|---|---|
| 1 | Home | `/` | Hero ("South Indian cuisine in Bellevue"), 3 dish callouts (Dosa / Idly & Vada / Thali), "Join the Waitlist" CTA linking to the existing `/r/skb/visit` page, hours summary, address map block |
| 2 | Menu | `/menu` | Full menu grouped by category, with item name and price. Categories preserved from the current site: Weekend Breakfast, Appetizers, Soups, Dosas, Uthappam, House Special & Combos, Special Rice, Thali, Breads, Condiments, Beverages, Desserts, Kids Corner. 79 items total (see `mocks/45-menu-data.json` for the scraped source of truth.) |
| 3 | About | `/about` | Restaurant story and cuisine overview. Copy rewritten from the current site, typo fixed, tone warmed up. |
| 4 | Hours & Location | `/hours` | Weekly hours table, address, Google Maps embed, parking instructions, accessibility notes |
| 5 | Contact | `/contact` | Email, phone, contact form (submits to the existing email — no new backend), social links |
| 6 | Privacy | `/privacy` | **(Already exists, unchanged)** — keep the existing `public/privacy.html`. |

**Explicit non-goals (removed from the current site):**
- Account / login
- Wishlist
- Cart / Add-to-Cart
- Search
- Product-style "Quick View" modals
- Newsletter signup form (the current one is non-functional — the site collects addresses but there is no list they go to)

### Website — technical shape

- **Static HTML + CSS + JS in `public/`**, served by the existing Express app — same mechanism as the current `public/host.html`, `public/queue.html`, etc.
- **Menu is data-driven**: `public/menu.json` is the source of truth for menu items (seeded from `mocks/45-menu-data.json`). The menu page is a thin static HTML shell that renders `menu.json` client-side on page load. Owner can update the menu by editing a single JSON file via PR — no CMS, no DB schema, no admin UI.
- **Images**: one hero photo per page, plus one optional thumbnail per category (not per item). All compressed WebP, committed to `public/img/`. No CDN, no image host.
- **Styling**: extends the existing `public/styles.css` with a new `.site-*` namespace for the diner-facing pages, warm hospitality palette (cream + saffron + charcoal), mobile-first, WCAG 2.1 AA contrast.
- **Routing**: the Express app already uses `express.static('public')`, so the new pages are auto-served. The only code change on the server is adding `/hours` as an alias for `public/hours.html`, and mounting `/menu.json` as a static asset.
- **Brand name**: everywhere on the new site, use **Shri Krishna Bhavan** (fix the "Kriskhna" typo that exists on the current site).

### Website — domain cutover

The replacement site is served from the same Azure App Service that runs the SKB app today. DNS cutover is a manual step the owner will perform once the spec is approved and the mocks are converted to real HTML:

1. Lower the TTL on `skbbellevue.com` A/CNAME records at the current registrar to 300 seconds (24 hours before cutover).
2. Verify the new pages render at `https://<skb-app-service-hostname>/` and `/menu`, `/about`, `/hours`, `/contact`.
3. Update the A/CNAME for `skbbellevue.com` (and `www.skbbellevue.com`) to point at the SKB app service.
4. Wait for DNS propagation (~5 min at 300s TTL) and verify the old domain now serves the new pages.
5. Cancel the old hosting subscription **only after** 7 days of clean traffic on the new host.
6. Restore TTL to 3600 seconds.

### IVR — new call flow

The IVR entry point changes from a 2-option menu to a 5-option menu. Everything in branches 1 and 2 is unchanged from today's implementation; branches 3, 4, and 0 are new.

**Root greeting (plays on `/voice/incoming`)**:
> *"Hello, and thank you for calling Shri Krishna Bhavan! There are currently 5 parties ahead of you, with an estimated wait of about 40 minutes. To join the waitlist, press 1. To hear the wait time again, press 2. For our menu, press 3. For hours and location, press 4. To speak with someone at the restaurant, press 0."*

The greeting is capped at ~22 seconds of audio to avoid fatiguing callers who only want option 1. Options 3 and 4 are placed **after** the existing options 1 and 2 so the muscle-memory of repeat callers is preserved.

**Branch: press 3 — Menu (new)**
> *"We serve authentic South Indian cuisine. Our menu includes breakfast favorites like idly, vada, and pongal; more than twenty varieties of dosa including the classic masala dosa, spicy Mysore masala dosa, and our house-special paper roast; uthappams; rice dishes and biryanis; thalis; and a full range of beverages and desserts. You can see the full menu with prices at skbbellevue dot com slash menu. Last orders for lunch are at 2:10 PM and last orders for dinner are at 9:10 PM. To return to the main menu, press star. To join the waitlist, press 1."*

This is a **category overview** (not a full item-by-item read) — reading 79 items by voice would take several minutes and is unusable. Callers who want item-level detail are directed to the website. Caller can press `*` to return to the main menu or `1` to short-circuit into the join flow.

**Branch: press 4 — Hours and Location (new)**
> *"Shri Krishna Bhavan is located at 12 Bellevue Way SE in Bellevue, Washington. We're open Tuesday through Sunday — we're closed on Mondays. Lunch service is from 11:30 AM to 2:30 PM, with last orders at 2:10 PM. Dinner service is from 5:30 PM to 9:30 PM, with last orders at 9:10 PM. Complimentary parking is available in the lot at our building. To return to the main menu, press star. To join the waitlist, press 1."*

Owner-confirmed values (PR #47 review, 2026-04-15): **closed Mondays**, Tue–Sun hours as above, parking description confirmed. The address string in the script is rendered server-side from the admin-configured `location.address` field (see Admin Configuration below) so future address changes don't require a code deploy.

**Branch: press 0 — Front desk transfer (new)**
> *"Connecting you to our host. Please hold."*

This dials the `frontDeskPhone` configured on the `skb` location. Owner-confirmed (PR #47): `frontDeskPhone` must be **admin-configurable** via the host admin UI — not a hard-coded value, not a DB-only value the owner has to edit manually. See Admin Configuration below. If `frontDeskPhone` is unset, fallback to: *"Our host is currently unavailable. To join the waitlist, press 1. Or you can reach us at skbbellevue dot com."*

### Admin Configuration (owner-configurable per location)

Based on PR #47 review feedback (Q5 and Q6), the following fields must be editable by the restaurant owner via the existing host admin UI (`public/host.html` → location settings) — **not** edited in the DB directly or hard-coded into the site:

| Field | Purpose | Used by |
|---|---|---|
| `location.address` | Street, city, state, zip of the restaurant | Home page footer, Hours & Location page, Contact page, IVR hours/location script, Google Maps embed `q=` parameter, JSON-LD `PostalAddress` |
| `location.frontDeskPhone` | Phone the IVR press-0 transfer dials | Voice IVR press-0 transfer, existing large-party transfer in `/voice/got-size` |
| `location.hours` (existing or new) | Weekly hours with support for closed days | Hours & Location page, IVR hours script |

**Closed-day handling**: the hours data structure must support a closed day (Monday in SKB's case) without requiring the spec copy to hard-code "closed on Mondays." The IVR hours script and the website hours table both read from the same source, so a future change (e.g., also closing on Tuesdays) is a one-field admin edit and a one-minute re-render.

> 📌 **Implementation prerequisite** (PR #47 review, Q5): **pull from `master` before starting the feature-implementation job.** The host admin section has been refactored after this feature branch was cut, and the new admin configuration fields must be added to the refactored codebase — not the old one.

**Branch: no input / invalid input**
> *"I didn't catch that. Let me repeat the options."* → replay greeting (bounded to 1 retry, then goodbye).

See `mocks/45-ivr-call-flow.html` for a visual trace of the complete flow including the new branches.

### Design Standards Applied

No project-specific design system file is configured. This spec uses the **generic UI baseline** — the existing `public/styles.css` dark/warm palette established by the host, queue, and board pages. The new diner-facing pages share the same typography, button styles, and color tokens as the existing operator-facing surfaces, but flip to a lighter "hospitality" skin (cream background, charcoal text, saffron accents) to match a restaurant website aesthetic rather than an ops dashboard.

Mocks were built to validate the skin + layout before any production HTML/CSS is written. They intentionally use inline styles so each mock file is self-contained and reviewable by a non-technical owner.

### UI Mocks

All mocks are plain HTML files, openable directly in a browser:

| Mock | File | What it shows |
|---|---|---|
| Home page | [`mocks/45-home.html`](mocks/45-home.html) | New home page layout, hero, dish callouts, hours/address footer, join-waitlist CTA |
| Menu page | [`mocks/45-menu.html`](mocks/45-menu.html) | Full 79-item menu grouped by category, rendered client-side from `45-menu-data.json` |
| About page | [`mocks/45-about.html`](mocks/45-about.html) | Restaurant story with warmed-up copy, no typos |
| Hours & Location | [`mocks/45-hours-location.html`](mocks/45-hours-location.html) | Weekly hours table, map block, parking instructions — **flagged inputs highlighted for owner confirmation** |
| IVR call flow | [`mocks/45-ivr-call-flow.html`](mocks/45-ivr-call-flow.html) | Branch-by-branch trace of the new 5-option phone menu including the new menu, hours, and front-desk options |
| Menu data | [`mocks/45-menu-data.json`](mocks/45-menu-data.json) | Scraped ground-truth menu (79 items across 13 categories) — will be promoted to `public/menu.json` in implementation |

## Compliance Requirements

No formal compliance regulations (SOC2, HIPAA, PCI, GDPR) are configured in `fraim/config.json`. The applicable requirements were **inferred from project context and industry norms for a US restaurant's public website and phone IVR**:

### C1. WCAG 2.1 AA (public-facing website)
- **Why**: US restaurants with a public website are subject to ADA web-accessibility expectations. The current `skbbellevue.com` template does not meet AA (contrast, alt text, keyboard navigation issues on the shop chrome).
- **Requirements**:
  - All text achieves ≥4.5:1 contrast against background (≥3:1 for large text).
  - All images have meaningful `alt` attributes; decorative images use `alt=""`.
  - All interactive elements reachable by keyboard, with visible focus states.
  - Form fields on the contact form have `<label>` associations.
  - The menu page is navigable by screen reader in category order.
- **Maps to**: every mock file under `docs/feature-specs/mocks/45-*.html`, and the eventual `public/*.html` implementations.

### C2. TCPA / CAN-SPAM
- **Why**: already live in the SKB SMS flows (see `src/services/sms.ts`). The new website must not collect phone numbers for marketing without opt-in consent language on the form, and the contact form on the new site must not enroll submitters in any SMS/email list.
- **Requirements**:
  - The contact form captures name, email, optional phone, message — nothing else.
  - No auto-enrollment in any marketing list.
  - Privacy policy link visible in the footer of every page (the existing `public/privacy.html`).
- **Maps to**: `mocks/45-contact-hours.html` (if/when created) and the privacy footer on every mock.

### C3. No call recording — voice IVR policy (owner-stated)
- **Why**: existing SKB policy, recorded in `feedback_voice_no_recording.md` and enforced in `src/routes/voice.ts`. The new IVR branches must preserve this policy.
- **Requirements**:
  - New `/voice/menu-info` and `/voice/hours-info` endpoints must not include `record="record-from-answer"` or any `<Record>` verb.
  - Menu and hours prompts are read from a templated string, not a pre-recorded audio file.
- **Maps to**: the TwiML returned by the new branches in the IVR call-flow mock.

### C4. Hospitality tone (owner-stated preference)
- **Why**: recorded in `feedback_diner_facing_hospitality_tone.md`. Diner-facing copy defaults to warm hospitality voice, not transactional/urgent.
- **Requirements**:
  - All new IVR scripts use polite, warm language ("thank you for calling" / "we're open seven days a week") rather than urgent system-speak ("press 1 now").
  - Website copy avoids "Shop Now" / "Buy Now" patterns inherited from the old template — this is a restaurant, not a store.

## Validation Plan

### V1. Website — pixel & content parity
- Open each mock HTML file in a browser and visually compare against the corresponding screenshot of the current `skbbellevue.com` page (screenshots: `skbbellevue-home.png`, `skbbellevue-menu.png`, `skbbellevue-about.png`, `skbbellevue-contact.png` captured during Phase 1).
- Verify every content element on the current site is represented in the new design, OR is explicitly listed in the "non-goals" section of this spec as intentionally dropped.
- Confirm every menu item from `45-menu-data.json` renders on `45-menu.html`.

### V2. Website — WCAG AA automated scan
- Run `axe-core` (browser extension) on each mock file. Zero critical/serious violations is the target.
- Run Lighthouse accessibility audit on each mock. Score ≥95.
- Manual keyboard walk: Tab through the contact form and verify visible focus + logical order.

### V3. Website — mobile responsiveness
- Open each mock in Chrome DevTools device emulation at iPhone SE (375×667), iPhone 14 Pro (393×852), and iPad Mini (768×1024). No horizontal scroll, all CTAs visible without zoom.

### V4. IVR — call flow dry run
- The call flow mock (`45-ivr-call-flow.html`) is a walking trace of every branch. Review it against `src/routes/voice.ts` to confirm the new branches use the same pattern (TwiML `<Gather>`, `<Redirect>`, query-param state, `validateTwilioSignature`) as the existing code.
- Once implementation lands, the existing `tests/voice.test.ts` harness (if any) plus a manual end-to-end call from a real phone is required — per `feedback_third_party_ui_spikes.md` and `feedback_evidence_based_external_deps.md`, a passing unit test is not sufficient for a Twilio change. Production logs from a real call must be captured and attached to the implementation PR.

### V5. Compliance validation
- **C1 (WCAG)**: axe-core + Lighthouse + manual keyboard walk (see V2).
- **C2 (TCPA)**: verify the new contact form does not POST to any marketing endpoint. Verify privacy footer on every new page.
- **C3 (no call recording)**: grep the new TwiML strings for `Record` and `record=` — must return zero hits.
- **C4 (hospitality tone)**: owner reads aloud the new IVR scripts and the new site copy. Any "urgent system" phrasing is rewritten before merge.

### V6. Hosting cutover validation
- Before DNS cutover: verify both old and new URLs serve correctly (old = `skbbellevue.com`, new = the Azure App Service hostname).
- During cutover: confirm new URL serves within 5 minutes of DNS change.
- 24-hour sanity check: query `dig skbbellevue.com` from multiple regions; confirm the A record resolves to the new host.
- 7-day observation window on the new host before canceling the old subscription (per cutover runbook).

## Alternatives

| Alternative | Why discard? |
|---|---|
| **Stay on current host, fix the content issues in-place** | Does not solve the ~$200/mo cost problem (the primary driver of the issue). Also anchors the site to the existing e-commerce template, making the "drop cart/wishlist/search" cleanup harder. |
| **Migrate to a cheaper managed CMS** (Squarespace, Wix, Google Sites) | Lower cost than the current host but still a recurring bill (~$15–30/mo, ~$180–360/yr). Adds a new vendor, new login, new update flow — none of which exist today. Worse, the restaurant already has a production web app that can serve static pages for free. |
| **Rebuild as a Jamstack site** (Next.js / Astro on Vercel free tier) | Would work for $0/mo but introduces a second deploy pipeline, a second build step, and a second codebase for a 5-page site. Strictly more moving parts than serving 5 static HTML files from the existing Express app. |
| **Build a full CMS with an admin UI** so the owner can edit the menu in a browser | Over-engineered. The owner updates the menu infrequently (historical change rate: <1/month based on the current site). A PR-based `menu.json` edit is simpler, version-controlled, and zero-cost. Revisit if menu edit frequency exceeds ~2/week. |
| **Replace the IVR with a conversational AI agent** (Slang.ai, Goodcall, PopMenu AI) | Strong competitor products exist (see competitive analysis) and would answer "what's on the menu" more flexibly. But they cost $100–400/month per location and introduce a new vendor into the voice path right after we killed the old website's vendor bill. The DTMF-tree approach solves 80% of the caller need at $0 incremental cost. We can revisit conversational AI after the cost cut lands. |
| **Skip the IVR changes entirely, only do the website** | Splits the issue. The issue #45 body explicitly lists the two IVR additions as parts of the same ask. Skipping them leaves the "phone staff overhead" problem unsolved and forces a second spec + second PR for the exact same voice routes. |

## Competitive Analysis

This feature sits at the intersection of two markets: **restaurant website builders** (for the rip-and-replace half) and **AI/automated phone answering for restaurants** (for the IVR half). The waitlist competitors already in `fraim/config.json` (Yelp Host, Waitly, NextMe, TablesReady, Waitlist Me, WaitWhile) are **not directly relevant** to this issue — they sell waitlist software, which SKB already has. Only Slang.ai, Goodcall, and Popmenu AI Answering (also already configured) overlap with the IVR additions, and none of them touch the website-replacement half.

### Configured Competitors — AI Phone Answering

| Competitor | What they do | Monthly cost | Covers menu/hours/location IVR? | Strengths | Weaknesses vs. our approach |
|---|---|---|---|---|---|
| **Slang.ai** | Conversational voice AI for full-service restaurants. Natural-language Q&A on hours, directions, allergies, reservations; VIP call routing; smart alerts for private dining / complaints. | **$399/mo** Core; **$599/mo** Premium; +$199/mo Tripleseat; +$99/mo Spanish — per location. Sources: [synthflow.ai blog](https://synthflow.ai/blog/slang-ai-pricing), [reachify.io guide](https://reachify.io/blog/2026-pricing-guide-ai-phone-services-for-restaurants). | Yes (natural-language) | Fluent NLU — caller can say "what time do you close tonight?" and get an answer. Multi-location support. Analytics. 30-min setup claim. | Recurring cost is ~2× the hosting bill we're killing. Requires sharing call audio with a third-party LLM vendor (conflict with SKB's no-recording policy). Vendor lock-in on IVR prompts. |
| **Goodcall** | AI phone agent for SMBs (salons, restaurants, retail). Forms, logic flows, directory, calendar integration. | **$59/mo** Starter, **$99/mo** Growth, **$199/mo** Scale per location, billed monthly. Based on unique-caller count; 30% off for annual. Source: [goodcall.com/pricing](https://www.goodcall.com/pricing), summarized via [lindy.ai blog](https://www.lindy.ai/blog/goodcall-pricing). | Yes (configurable flows) | Cheapest of the three AI options. 14-day free trial. Flow builder means menu/hours can be added in a UI instead of code. | Priced per unique caller — SKB's ~400 unique phone callers/mo during peak would push it past Growth into Scale ($199/mo). Still introduces a recurring cost for something we can do for $0 incremental. Voice quality reported as less restaurant-polished than Slang. |
| **Popmenu AI Answering** | AI call handling bundled with Popmenu's restaurant website + online ordering suite. Menu inquiries, allergens, hours, location, parking, reservations, ordering, promos. | **$349/mo** add-on on top of Popmenu base $179/mo = **~$528/mo combined** per location. Sources: [restolabs.com/blog/popmenu-pricing](https://www.restolabs.com/blog/popmenu-pricing), [get.popmenu.com/pricing](https://get.popmenu.com/pricing). | **Yes — widest coverage** (explicitly advertises parking + menu by voice) | Only competitor that ties the answering service to the website, so menu updates on the site flow through to the phone automatically. Proven volume (cites Max's Restaurant handling 329K calls). | By far the most expensive. Requires migrating to Popmenu's website CMS — the exact vendor lock-in pattern this issue is trying to escape. The bill alone would eat SKB's monthly revenue margin on multiple busy days. |

### Configured Competitors — Waitlist (not directly applicable)

| Competitor | Why not relevant to Issue 45 |
|---|---|
| Yelp Guest Manager / Yelp Host, Waitly, NextMe, TablesReady, Waitlist Me, WaitWhile | These are **waitlist/reservation** products. SKB already has a waitlist system. None of them sell a restaurant's public-facing website or an IVR menu/hours/location reader. They would compete for the waitlist features already shipped in issues #1, #24, #29, #37 — not this feature. Captured here only so the competitor list review is complete. |

### Additional Competitors Discovered — Website Builders

These are adjacent competitors for the **website-replacement** half of the issue. They are not currently in `fraim/config.json` and are proposed for addition (see "Config Update Proposal" below).

| Competitor | What they do | Monthly cost | Strengths | Weaknesses vs. our approach |
|---|---|---|---|---|
| **BentoBox** | Restaurant-specific website platform with ordering, events, and gift cards. | **$119–$479/mo** per location depending on tier. Source: [menubly.com/blog/best-restaurant-website-builders](https://www.menubly.com/blog/best-restaurant-website-builders/). | Dedicated account manager on higher tiers. Restaurant-specific templates. Handles online ordering. | Recurring cost in the same range as the site we're replacing, or higher. Vendor lock-in on menu editing. Overkill for a restaurant that doesn't sell online. |
| **Popmenu (website only)** | Restaurant CMS with integrated photo-tagging menus and marketing. Base plan. | **$179/mo** per location (AI Answering is a separate $349 add-on). Source: [restolabs.com/blog/popmenu-pricing](https://www.restolabs.com/blog/popmenu-pricing). | Restaurant-specific, good mobile experience, marketing integrations. | Recurring cost comparable to the current hosting bill. Re-creates the vendor-lock problem we're trying to solve. |
| **Squarespace** | Generic website builder, widely used by restaurants. | **$16–$99/mo** per site. Source: [websitebuilderexpert.com/website-builders/squarespace-pricing](https://www.websitebuilderexpert.com/website-builders/squarespace-pricing/). | Cheapest legit option with good design templates. Easy DIY editing. | Still a recurring bill. No native menu component — the owner would have to rebuild the menu page by hand. Generic themes rather than restaurant-specific. |
| **Wix** | Generic builder, restaurant templates available. | **$17–$29/mo** for standard plans; higher for commerce. Source: [sitebuilderreport.com/wix-pricing](https://www.sitebuilderreport.com/wix-pricing). | Similar to Squarespace — cheap and easy. | Same downsides as Squarespace. Restaurant features locked behind higher tiers. |
| **Menubly** | Budget-focused restaurant site + menu tool. | **$9.99/mo**. Source: [menubly.com/blog/best-restaurant-website-builders](https://www.menubly.com/blog/best-restaurant-website-builders/). | Cheapest in the landscape. | Still a recurring bill. Limited design flexibility. |

### Config Update Proposal

**New competitors I'm proposing to add to `fraim/config.json`**, to make future restaurant-website-related research faster:

```json
"bentobox": "https://www.getbento.com",
"squarespace": "https://www.squarespace.com",
"wix": "https://www.wix.com/restaurants",
"menubly": "https://www.menubly.com"
```

Per the FRAIM competitor-analysis phase, these must be added via a permission-seeking prompt. **I am deferring the actual edit to Phase 5 (spec-submission)** so that the `fraim/config.json` change can be bundled into the same PR as the feature spec for a single review surface — unless you override and ask me to leave the config alone.

### Competitive Positioning

#### Our differentiation pillars

1. **$0 incremental cost.** Every competitor — website or AI phone — charges a recurring monthly bill per location. Our approach serves both the new website and the new IVR branches from infrastructure that already exists and has already been paid for. This is the **dominant** reason this issue exists: the entire point is to stop bleeding $200/mo. Every competitor fails this test by design.
2. **Unified stack: website + IVR + waitlist in one codebase.** None of the above competitors own all three surfaces. Slang/Goodcall/Popmenu own IVR or IVR+website but not the waitlist; BentoBox/Wix/Squarespace own the website but not the IVR or waitlist. SKB already owns the waitlist (shipped in issues #1, #24, #29, #37). Bundling everything under one codebase means a single place to deploy, one set of logs, one CI, one DNS, and zero third-party data flows.
3. **Privacy-first IVR.** The three AI phone competitors all record and/or stream call audio to their model vendors. SKB's existing voice IVR explicitly doesn't record and uses streaming STT only — a policy codified in `feedback_voice_no_recording.md`. Adding DTMF branches for menu and hours preserves that policy; switching to Slang.ai or Popmenu would violate it.
4. **Version-controlled content.** The menu is a JSON file in git. Every change has an author, a diff, and a rollback. No "the menu got edited in the CMS and we don't know who did it" class of problem. Competitor admin UIs optimize for non-technical ease but lose auditability.
5. **No vendor lock-in.** If the approach ever fails, pivoting to a competitor is a DNS change + copy-paste of the menu JSON. With BentoBox/Popmenu, the menu data lives in their database and is exported only via their (often limited) tooling.

#### Where we are weaker

Be honest about this. The DTMF IVR branches are **strictly worse than natural-language AI on caller experience** for two kinds of question:

- "Do you have [specific dish]?" — a DTMF tree can't answer item-level lookups. Caller is told to go to the website.
- "What time do you close on Thanksgiving?" — our hours script is a single static string. Holiday overrides would require code changes.

**Mitigation**: the caller can always press `*` to return to the main menu and press `0` to transfer to the front desk for anything the IVR can't answer. The design is "handle the 80% common case at $0 incremental cost; route the 20% edge case to a human" — which aligns with the existing hospitality-first IVR pattern and the user preference recorded in `feedback_diner_hospitality_fallback.md`.

If call volume grows or the front desk transfer rate climbs above (say) 15% of menu/hours callers, revisit conversational AI — probably Goodcall at its lowest tier, since it's the cheapest and doesn't require migrating the website.

#### Competitive response strategy

| If … | Our response |
|---|---|
| **Slang.ai or Popmenu drops their per-location price below $50/mo** | Revisit. At that price point, the caller-experience delta from natural-language NLU would justify the recurring cost. Above ~$50/mo it doesn't, given our waitlist is already the primary conversion path. |
| **A competitor offers a free tier for single-location restaurants** | Revisit — but with skepticism, since free tiers usually monetize via add-ons or data. The current zero-cost approach beats any "free-with-strings" option. |
| **A restaurant-specific static-site generator emerges** | Consider using it only if it plugs into the existing SKB Express app without introducing a second deploy pipeline. |

#### Research sources

All pricing data above was pulled on 2026-04-15 from the cited sources. Pricing in this market moves quickly — verify before making any purchase decision based on this document.

- [Slang AI pricing — synthflow.ai blog](https://synthflow.ai/blog/slang-ai-pricing)
- [AI phone services pricing guide — reachify.io](https://reachify.io/blog/2026-pricing-guide-ai-phone-services-for-restaurants)
- [Goodcall pricing — goodcall.com/pricing](https://www.goodcall.com/pricing)
- [Goodcall plan comparison — lindy.ai](https://www.lindy.ai/blog/goodcall-pricing)
- [Popmenu pricing — restolabs.com](https://www.restolabs.com/blog/popmenu-pricing)
- [Popmenu pricing — get.popmenu.com](https://get.popmenu.com/pricing)
- [Squarespace pricing — websitebuilderexpert.com](https://www.websitebuilderexpert.com/website-builders/squarespace-pricing/)
- [Wix pricing — sitebuilderreport.com](https://www.sitebuilderreport.com/wix-pricing)
- [Restaurant website builder comparison — menubly.com](https://www.menubly.com/blog/best-restaurant-website-builders/)

Research methodology: fetched each competitor's own product page via WebFetch, then cross-referenced with two to four third-party pricing aggregators per vendor. Prices cited only where they appear in at least one cited source; values marked as "not public" otherwise.

## Spec-Review Questions — Resolutions (PR #47, 2026-04-15)

All 10 questions resolved via inline review comments on PR #47. Owner overrides are marked ⚠️. Full feedback trace in `docs/evidence/45-spec-feedback.md`.

| # | Question | Owner answer | Outcome |
|---|---|---|---|
| Q1 | Weekly operating hours | "correct" | Lunch 11:30 AM – 2:30 PM, dinner 5:30 PM – 9:30 PM confirmed |
| Q2 | Open every day? | ⚠️ "closed on mondays" | **Override**: Closed Mondays; Tue–Sun only. IVR + mocks + spec copy updated. |
| Q3 | Parking | "what you have is right" | Complimentary lot + overflow street confirmed |
| Q4 | Name spelling | "you got it right" | "Shri Krishna Bhavan" confirmed; current-site "Kriskhna" is a typo |
| Q5 | `frontDeskPhone` populated? | ⚠️ "configurable in the admin section ... pull from master before starting implementation" | **Override**: Make `frontDeskPhone` admin-configurable via host UI; pull from `master` before implementation because admin has been refactored |
| Q6 | Map embed or static? | ⚠️ "embed would be good .. allow address to be configured by the admin" | **Override**: Use Google Maps embed iframe + make address admin-configurable |
| Q7 | Newsletter signup | "drop it" | Drop confirmed (already in non-goals) |
| Q8 | Food photos | "use whats on the site for now" | Reuse current-site images confirmed |
| Q9 | DNS cutover | "i will do that later" | Owner will run the runbook manually after implementation lands |
| Q10 | About page rewrite | "you got it right" | Warmer hospitality rewrite confirmed |

## Retrospective

*(Populated in Phase 7 after the spec is approved and submitted.)*
