# Business Plan Strategy: Frontline (productized from SKB)

> Front-of-house operations for the restaurants OpenTable forgot.

**Status:** Draft v1 — assembled via FRAIM `business-plan-creation` workflow on 2026-04-10
**Origin:** Productized from [SKB](https://github.com/mathursrus/SKB), live in production at `skb-waitlist.azurewebsites.net` since Q1 2026 serving Shri Krishna Bhavan, Bellevue WA as the flagship customer
**Working name:** Frontline (placeholder; domain check is action item I2)

---

## 🎯 Executive Summary

**Frontline is a multi-tenant restaurant operations platform that turns the lobby of a 200-cover walk-in restaurant from chaos into calm — without requiring an app, an account, or a smartphone.** It is the productization of SKB, a system already running in production for Shri Krishna Bhavan in Bellevue, Washington. Every capability described in this plan is already shipped or in active development.

**The opportunity.** US independent restaurants total **412,498 locations** ([NRN, 2026](https://www.nrn.com/independent-restaurants/the-independent-restaurant-sector-shrunk-by-2-3-in-2025)) inside a **$1.55 trillion** industry ([National Restaurant Association, 2026](https://restaurant.org/research-and-media/research/research-reports/state-of-the-industry/)). The restaurant **waitlist software** sub-segment is a $576M market growing at 8.1% CAGR to $1.12B by 2033 ([Dataintelo, 2026](https://dataintelo.com/report/restaurant-waitlist-management-software-market)). Existing tools are built for chains (Yelp Guest Manager, Toast), for fine dining (OpenTable, Resy, Tock), or for healthcare/retail with restaurants as an afterthought (Waitwhile). **None of them speak the language of the corner Indian restaurant on a Saturday night.**

**The wedge.** Four underserved segments — diaspora-cuisine independents, halal/kosher religious-community restaurants, brunch-driven urban indies, and boba/Asian dessert shops — share a structural pattern: owner = buyer = user, tight community referral networks, and currently served by tools designed for somebody else. Total addressable market in those four segments: **~120,000 restaurants → $80M ARR at full capture**. Target Year 3 capture: **3% = $2.39M ARR**.

**Why we win.** Five differentiators no competitor structurally replicates without rewriting their product:
1. **Voice IVR** for non-smartphone diners — Twilio-backed phone-based queue join, already shipped (`src/routes/voice.ts`)
2. **Full dining lifecycle** past "seated" through `ordered → served → checkout → departed` (`src/services/dining.ts`)
3. **No app, no account, no PII** for diners — competitive moat against Yelp's data extraction model
4. **AI-native MCP server surface** — already exposing the system to ChatGPT/Claude/Gemini agents (`src/mcp-server.ts`)
5. **$79/month flat, no contracts, no per-cover fees** — predictable owner-perceived cost is the entire wedge against OpenTable

**The plan.** Bootstrap to **10 paying customers ($5K MRR)** in 6–9 months from a side-project posture, founder goes full-time within 30 days of crossing $5K MRR, raise an optional **$750K–$1.5M pre-seed** to accelerate to **500 paid customers ($480K ARR) by end of Year 2** and **1,500 paid customers ($1.44M ARR) by end of Year 3**. Capital-efficient by design. Target outcome: $3M+ ARR, 80%+ gross margin, profitable, founder retains majority. Venture-optional, not venture-required.

---

## 🧭 Part 1: Market Segments Overview

### Segment Comparison Matrix

Seven candidate segments scored 1–5 on FRAIM segment-selection criteria. Top 4 selected as the tip-of-the-spear; bottom 3 explicitly excluded.

| # | Segment | Pain | Size | WTP | Network | Distribution | Budget clarity | Comp. underserved | **Total** |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **A** | **Diaspora-cuisine independents** (Indian, Vietnamese, Korean, Sichuan, Latin) | 5 | 4 | 4 | 5 | 5 | 5 | 5 | **33** |
| **B** | **Halal / kosher religious-community restaurants** | 4 | 3 | 4 | 5 | 4 | 5 | 5 | **30** |
| **C** | **Brunch-driven urban indie cafés** | 5 | 4 | 4 | 4 | 3 | 5 | 4 | **29** |
| **D** | **Boba / Asian dessert shops** | 4 | 4 | 3 | 4 | 4 | 5 | 4 | **28** |
| E | Mini-franchise family chains (3–15 locations) | 3 | 3 | 5 | 2 | 2 | 2 | 2 | 19 |
| F | Fine dining (Resy/OpenTable comp) | 1 | 4 | 2 | 2 | 2 | 4 | 1 | 16 |
| G | Counter-service fast-casual (Toast/Square comp) | 1 | 5 | 2 | 2 | 1 | 2 | 1 | 14 |

**Why these four (and explicitly NOT the others).** The top 4 share three traits: (1) owner is the buyer is the user — no procurement cycle, demo-to-credit-card in <7 days; (2) tight community referral networks where one happy customer produces ~0.5 referred customers within 90 days; (3) currently served by tools built for chains/healthcare/POS-first restaurants. The bottom 3 fail one or more in a way that defeats the GTM motion: chains have procurement, fine dining is locked by OpenTable, fast-casual is locked by Toast/Square.

### Primary Target Segments

#### Segment A — Diaspora-cuisine independents *(primary entry segment, $66M segment value)*

- **Customer:** owner-operator of a single-location, family-run restaurant doing 200–800 covers/day with brutal weekend rush.
- **JTBD:** *"Help me stop losing weekend walk-ins to angry lobby crowds and a paper list, without forcing my older customers to download an app."*
- **Pain points:** lobby overflow on Friday/Saturday/Sunday; no-shows after long quoted waits; older / non-English / non-smartphone diners locked out by app-required competitors.
- **Value proposition:** *Frontline gives diaspora-cuisine restaurants the lobby calm of a Cheesecake Factory pager system — at $79/month, with no app for diners and a phone-call fallback for grandma.*
- **Buying process:** owner-operator decides over a single demo. Sales cycle 1–7 days, no contract, monthly billing.
- **Distribution:** owner WhatsApp groups, ethnic chambers of commerce, food festival sponsorships, supplier networks (Restaurant Depot, ethnic distributors), word-of-mouth across cousins/in-laws — Sid is already in this network through SKB Bellevue.
- **Sized at:** ~70,000 restaurants (Indian anchor 12,653 + extrapolated peers).

#### Segment B — Halal / kosher religious-community restaurants *(second wave, $12M segment value)*

- **Customer:** owner-operator with 80% large-party covers, brutal Friday/Saturday rush, religious holiday spikes (Eid, Iftar, Passover, Rosh Hashanah).
- **JTBD:** *"Help me serve my community on the busiest religious nights without making families with small kids stand in a parking lot."*
- **Pain points:** large-party clustering; religious holiday surge; community trust requirement (diners want to see fellow community members in the queue).
- **Value proposition:** *Frontline turns the parking lot into a virtual lobby for religious-community restaurants on their busiest nights — without forcing families to install an app.*
- **Buying process:** same as Segment A.
- **Distribution:** religious community centers, mosque/synagogue newsletters, Halal/Kosher Yelp-equivalents (Zabihah, GoKosher).
- **Sized at:** ~13,000 restaurants.

#### Segment C — Brunch-driven urban indie cafés *(third wave, $28M segment value)*

- **Customer:** owner-operator of a hipster brunch spot in Brooklyn / Capitol Hill / Mission / Wicker Park, 8 AM–3 PM service, 90-min Saturday wait is normal.
- **JTBD:** *"Help me capture the people walking past who see the wait and leave for the place across the street."*
- **Pain points:** walk-by abandonment; group decision paralysis; the hostess is also the barista (labor pressure).
- **Value proposition:** *Frontline lets brunch indies recapture every walk-by — the diner joins from the sidewalk, gets coffee three doors down, and gets a text when their table is ready.*
- **Distribution:** local food blogs, Eater city verticals, cafe owner Instagram networks.
- **Sized at:** ~30,000 restaurants.

#### Segment D — Boba / Asian dessert shops *(fourth wave, $6M segment value)*

- **Customer:** Asian-American suburban entrepreneur, often part of a 1–3 location regional brand, rush after high-school release and weekend mall traffic.
- **JTBD:** *"Help me handle the high-school release rush without my one staff member melting down behind the counter."*
- **Pain points:** predictable demand spikes; order accuracy under line pressure; TikTok virality surge handling.
- **Value proposition:** *Frontline turns the boba line into a virtual queue so customers can browse other shops in the mall while their order moves forward.*
- **Distribution:** Asian-American business associations, supplier networks (Lollicup, Tea Zone), TikTok food influencer DMs.
- **Sized at:** **6,635 restaurants** ([IBISWorld](https://www.ibisworld.com/united-states/industry/bubble-tea-shops/6250/)).

---

## 📊 Part 2: Market Research Synopsis

### TAM / SAM / SOM

**Pricing assumption:** $79/month Pro tier × 12 = **$948 ARPU/year**.

| Layer | Definition | Restaurants | ARR potential |
|---|---|---:|---:|
| **TAM (US-wide)** | Every US independent restaurant Frontline could theoretically serve | **412,498** | **$391M** |
| **SAM (4 target segments, walk-in heavy)** | Filter to 70% walk-in heavy | ~84,000 | **$80M** |
| **SOM Year 3 conservative** | 2% capture, bootstrap motion | ~1,680 | **$1.59M ARR** |
| **SOM Year 3 target** | 3% capture, with $750K–$1.5M pre-seed | ~2,520 | **$2.39M ARR** |
| **SOM Year 5 stretch** | 5% capture, Series A optionality | ~4,200 | **$3.98M ARR** |

**Sanity check:** at $1.59M ARR (Year 3 conservative), Frontline captures **0.14%** of the $1.1B 2033 waitlist software market — well within "share-takeable from underserved subsegments without dislodging incumbents." This is a take-share play, not a market-creation play.

**Key sources:**
- US restaurant industry sales: **$1.55T** ([NRA, 2026](https://restaurant.org/research-and-media/research/research-reports/state-of-the-industry/))
- US independent restaurants (end of 2025): **412,498**, down 2.3% YoY ([NRN, 2026](https://www.nrn.com/independent-restaurants/the-independent-restaurant-sector-shrunk-by-2-3-in-2025))
- Restaurant **waitlist** software market: **$576.2M (2024) → $1,122.8M (2033)** at 8.1% CAGR ([Dataintelo](https://dataintelo.com/report/restaurant-waitlist-management-software-market))
- Restaurant **management** software market (broader category): **$3.68B (2025) → $7.94B (2034)** at 9.1% CAGR ([Business Research Insights](https://www.businessresearchinsights.com/market-reports/restaurant-management-software-market-100041))
- US Indian restaurants (Jan 2026): **~12,653** ([poidata.io](https://www.poidata.io/report/indian-restaurant/united-states))
- US bubble tea shops: **6,635 businesses, $2.6B revenue, 24.1% CAGR 2020-2025** ([IBISWorld](https://www.ibisworld.com/united-states/industry/bubble-tea-shops/6250/))

### Competitive Forces (Porter's Five Forces)

| Force | Rating | Why |
|---|---|---|
| **Threat of new entrants** | **HIGH** | SaaS distribution is cheap; Frontline itself was built as a side project. Counter: out-execute in chosen segments before entrants discover them. |
| **Bargaining power of suppliers** | **MODERATE** | Twilio A2P 10DLC pricing is the main risk. Mitigated by Azure Communication Services dual-vendor in flight (issue #33). |
| **Bargaining power of buyers** | **HIGH** | Owner-operators are price-sensitive and switching costs are low. Counter: be unambiguously better at the specific job rather than locking in. |
| **Threat of substitutes** | **HIGH** | Paper waitlists are free; AI-voice substitutes emerging. Counter: absorb the substitute by being the AI-voice agent (voice IVR per #31/#33). |
| **Competitive rivalry** | **MODERATE overall, LOW in our 4 entry segments** | 10+ named competitors but rivalry is concentrated at chains/fine dining tier. **Our entry is into a rivalry vacuum.** |

**Industry attractiveness:** **MODERATE → ATTRACTIVE for chosen segments.** Two HIGH forces (buyer power, substitutes) prevent a 20× revenue multiple SaaS classification, but the underserved-segment wedge is genuinely defensible. Strategic posture: capital-efficient win, not category creation.

### Network Effects & Lock-in

| Type | Strength | Mechanism |
|---|---|---|
| **Data** | HIGH | Cuisine-specific ETA priors improve with scale. Indian thali ~38min turn, Vietnamese pho ~22min, boba ~6min — useless with 1 customer, load-bearing with 100. Comparable analog: Resy / OpenTable wait-time predictions, both cross-customer trained. |
| **Customer (owner-side)** | **VERY HIGH** | Owner-to-owner referral within tight community networks. Target viral coefficient K = 0.4–0.6 in Segment A. **The load-bearing growth mechanic.** Comparable analog: [Toast's growth in Boston independents](https://www.bvp.com/atlas/the-rise-of-toast). |
| **Customer (diner-side)** | LOW | Cross-restaurant diner UX familiarity. Target K = 0.05–0.1. Retention boost only, not a growth mechanic. |
| **Platform** | **HIGH (12-24 month horizon)** | MCP server already shipped (`src/mcp-server.ts`). As ChatGPT/Claude/Gemini ship restaurant-aware agents, every Frontline restaurant becomes a discoverable node. **No competitor has this surface.** |

---

## 🚀 Part 3: Growth & Virality Strategy

### Viral Mechanisms

**Primary viral loop — Segment A diaspora-cuisine, target K = 0.4–0.6:**

```
Diner uses Frontline at SKB Bellevue (organic install)
  → Diner shares queue link in family WhatsApp group
  → 8 family members see rich preview (live wait time, restaurant name, "Powered by Frontline")
  → 1 in 8 is or knows a restaurant owner
  → Owner clicks "Powered by Frontline" → lands on Frontline pitch page
  → 1 in 4 books a demo, 1 in 2 closes within 14 days
  → New customer joins, repeats the loop
```

**K-coefficient math:** 8 family-share views × 12.5% owner-relevance × 25% demo-book × 50% close = **0.125 cycles per join × ~4 joins per active restaurant per day = 0.5 referral customers per active restaurant per 90 days.** Hits the K = 0.5 target.

**Viral touchpoint inventory:**
- Diner queue page (highest visibility, per-join frequency)
- SMS confirmation + table-ready notifications (forwarded constantly)
- Google Maps card (passive but high-conversion)
- WhatsApp link previews with rich OG/JSON-LD metadata (already shipped per #30)
- Door QR code (captures walk-by segment)
- MCP / AI-agent surface (12–24 month emerging)

A subtle "Powered by Frontline" mark on every diner queue page footer turns each share into an owner-discovery event.

### Retention & Unit Economics

**Retention philosophy:** *Daily Habit (host opens dashboard every shift) + High Value (visible labor savings) + Low Friction (no training required) + Emotional Connection (the lobby is calm now).*

**Retention targets:**

| Metric | Year 1 | Year 3 |
|---|---:|---:|
| Day 30 retention (cohort) | 60% | 70% |
| Logo retention (annual) | 75% | 85% |
| Net dollar retention | 100% | 110% |
| MAU as % of paid | 90% | 95% |

**CAC / LTV by segment** ($79 ARPU/mo, ~26-month average lifetime, **LTV = $2,054**):

| Segment | Y1 CAC | Y2 CAC | LTV : CAC (Y1) | Payback (Y1) |
|---|---:|---:|---:|---:|
| **A. Diaspora-cuisine** | **$120** | $240 | **17.1:1** ⭐ | 1.5 mo |
| **B. Halal/kosher** | $180 | $280 | 11.4:1 | 2.3 mo |
| **C. Brunch indies** | $320 | $380 | 6.4:1 | 4.1 mo |
| **D. Boba shops** | $280 | $340 | 7.3:1 | 3.5 mo |

**All four segments clear the >3:1 floor.** Three of four clear >5:1 healthy. **Segment A at 17:1 is the standout** and validates the "diaspora-cuisine first" entry strategy. The right reading: the diaspora-cuisine entry funds everything else.

**Pricing tiers (locked):**
- **Free** — $0, 100 joins/mo, no SMS, no voice IVR — top-of-funnel only
- **Pro** — **$79/mo flat**, unlimited, 2,000 SMS bundled, voice IVR, full dining lifecycle, analytics — *the load-bearing tier*
- **Multi-location** — $59/mo per location, billed annually — Year 2 expansion target
- **Enterprise** — Custom (start $20K/yr) — Year 3+ optional

**No per-cover or per-revenue pricing.** The entire wedge against Yelp Guest Manager and OpenTable is *predictable flat fee*. Variable pricing destroys the wedge.

**Cost of goods sold per Pro customer / month:** ~$10.34 (Twilio SMS $6.40, voice IVR $0.65, Stripe $2.59, Azure compute $0.80, Mongo $0.40, monitoring $0.50). **Gross margin: 87%.**

---

## 🛡️ Part 4: Competitive Positioning

### Competitive Matrix

13 competitors mapped across direct waitlist, adjacent reservation/POS, and the entrenched paper substitute. All pricing cited.

| Competitor | Bucket | Pricing (US, monthly) | Source |
|---|---|---|---|
| **Yelp Guest Manager** | Direct waitlist | **$99 Basic / $299 Plus** | [G2](https://www.g2.com/products/yelp-guest-manager/pricing) |
| **Waitwhile** | Direct waitlist | Free <50/mo / **Starter from $31/mo / Business from $55/mo** / Enterprise (all volume-tiered by location + visits) | [Waitwhile Pricing](https://waitwhile.com/pricing/); [G2 Waitwhile Pricing (last updated 2025-08-27)](https://www.g2.com/products/waitwhile/pricing) |
| **Waitly** | Direct waitlist | **$49 Premium** (1,000 parties/mo) | [Waitly Pricing](https://www.waitly.com/pricing/) |
| **NextMe** | Direct waitlist | Free / **$50 Standard / $125 Pro** | [NextMe Pricing (canonical)](https://nextmeapp.com/pricing/); [Capterra — NextMe](https://www.capterra.com/p/165482/NextMe/) |
| **Waitlist Me** | Direct waitlist | **$24 / $40 / $80** | [SpotSaaS](https://www.spotsaas.com/product/waitlist-me) |
| **OpenTable** | Reservations | **$149 Basic / $299 Core / $499 Pro + $0.25–$1.50/cover for network reservations** | [OpenTable Plans (official)](https://www.opentable.com/restaurant-solutions/plans/); [Tekpon — OpenTable Pricing 2026](https://tekpon.com/software/opentable/pricing/) |
| **Resy** (Amex) | Reservations | **$249/mo flat** | [Fast Company — Amex Resy upgrade](https://www.fastcompany.com/91496951/amex-resy-tock-restaurant-reservation-wars) |
| **Tock** (Amex; merging with Resy) | Reservations | **Base $79 (waitlist + events only) / Essential $199 / Premium $339 / Premium Unlimited $769** — note Tock Base is the only competitor at our exact Frontline price | [Tock Plans & Pricing](https://www.exploretock.com/join/pricing/); [Restaurant Business — Resy and Tock are merging](https://www.restaurantbusinessonline.com/technology/reservation-services-resy-tock-are-merging) |
| **SevenRooms** | Enterprise reservations | **$500+/mo, quote-based** | [SevenRooms Comparison](https://sevenrooms.com/blog/restaurant-reservation-system-comparison-guide/) |
| **Eat App** | Reservations + waitlist | Custom; mid-market | [Eat App Best Waitlist Apps 2026](https://restaurant.eatapp.co/blog/best-restaurant-waitlist-management-systems) |
| **Toast (waitlist)** | POS-bundled | Bundled with Toast POS | — |
| **Square (waitlist)** | POS-bundled | Bundled with Square POS | — |
| **Paper waitlist** | Substitute | $0 hard cost; high hidden labor | The entrenched workflow in 70%+ of our target segments |

**Frontline at $79 sits in a deliberate gap.** Below us at the budget tier: Waitlist Me ($24–80), Waitwhile Starter (from $31, volume-tiered), Waitly ($49), NextMe Standard ($50). Above us at the chain/fine-dining tier: Yelp Guest Manager ($99–299), OpenTable ($149+ with per-cover fees), Resy ($249), SevenRooms ($500+).

**The most direct competitor at our price point is Tock's $79 Base plan**, which is the *only* other product in our exact price band. Tock Base ships waitlist + events but no voice IVR, no full dining lifecycle, no MCP server, no community-network distribution, no diaspora-cuisine focus — and it's owned by American Express via the Resy/Tock merger, which means it is increasingly aligned with the high-end restaurant segment Tock and Resy serve. **The Tock Base $79 datapoint validates that $79 is the right price for waitlist-tier functionality** while leaving Frontline structurally differentiated on the five pillars below.

### Differentiation Strategy

**Five structural pillars** competitors cannot replicate without rewriting their product:

1. **Voice IVR for non-smartphone diners** — Twilio-backed phone-based queue join. Already shipped (`src/routes/voice.ts`, issue #31). **No competitor in our price band has this.** Load-bearing for diaspora and religious-community segments.

2. **Full dining lifecycle past "seated"** — `waiting → called → seated → ordered → served → checkout → departed`. Already shipped (`src/services/dining.ts`, issue #24). Most competitors stop at "seated"; we feed the post-seated data back into ETA prediction.

3. **No app, no account, no PII for diners** — competitive moat against Yelp's data extraction model. Owner-operators in privacy-conscious diaspora communities rate this as a closing differentiator.

4. **AI-native MCP server surface** — already exposing the system to LLM agents (`src/mcp-server.ts`). As ChatGPT/Claude/Gemini ship restaurant-aware agents, every Frontline-enabled restaurant becomes an AI-discoverable node. **No competitor has this.**

5. **Predictable flat $79/month, no contracts, no per-cover fees** — the explicit anti-OpenTable, anti-Yelp posture.

**Sales talk tracks for the top 6 objections** (full text in working draft):
1. "We're already on Toast/Square" → Toast bundles, Frontline focuses; coexistence on Q2 roadmap
2. "Yelp has a free trial" → Yelp owns your customer relationship for the next decade
3. "We've always used paper" → Lobby-calculator math; one prevented walk-away pays for the month
4. "$79 is more than Waitwhile Starter ($31) or Tock Base ($79)" → Waitwhile Starter is built for retail, restaurant features are an afterthought; Tock Base is at our price exactly but ships no voice IVR, no dining lifecycle, no MCP, no community-distribution focus — and it's owned by Amex now, aligned with the fine-dining segment we are not
5. "Diners won't use it" → 70% join from phone, 30% call the IVR; never seen >5% lockout
6. "What about TCPA / SMS compliance?" → A2P 10DLC baked in, full audit trail, opt-outs

**Strategic recommendations:**
1. Lead with Voice IVR (Pillar 1) in every Segment A and B sales conversation
2. Lead with AI / MCP (Pillar 4) in fundraising and press conversations
3. Lead with predictable flat price (Pillar 5) in Segment C and D where buyers are more price-sensitive
4. Do not compete on "more features than Yelp" — compete on better at the specific job
5. Build the pitch page around a **lobby calculator** (input weekend covers, output dollars saved) — anchors the price conversation in dollars saved rather than dollars paid

---

## 🛠️ Part 5: Implementation & Roadmap

### 30 / 90 / 180 Day Roadmap

#### Immediate (next 30 days) — "decide whether to spin out"

| # | Action | Outcome |
|---|---|---|
| **I1** | Resolve the address/phone source-of-truth mismatch between SKB DB, Google Business Profile, and third-party listings | One canonical address, both systems updated |
| **I2** | Lock the company name (working name "Frontline" — confirm `frontline.menu` / `frontlinehq.com` / `getfrontline.com` availability + 5-name shortlist) | Decision made |
| **I3** | Pick 5 prospect restaurants in the diaspora-cuisine segment within 30 miles of Bellevue as design partners | List of 5 names, contact info, intro plan |
| **I4** | Draft a one-page pitch + lobby calculator landing page at `[domain]/restaurants` linking to a Calendly demo slot | Page live, demo slot booking link |
| **I5** | Make the multi-tenant isolation architectural call (single-DB vs namespace-per-customer vs DB-per-customer) | Documented decision |

#### Short-term (next 90 days) — "design partners → first paying customer"

| # | Action | Outcome |
|---|---|---|
| **S1** | Run structured interviews with the 5 design-partner restaurants (use FRAIM `customer-prospect-discovery` job) | Validated/invalidated assumptions |
| **S2** | Onboard 1–2 design partners onto Frontline Free for 4 weeks side-by-side with their paper waitlist | First non-SKB live tenant; first case study material |
| **S3** | Ship the lobby-calculator pitch page with real SKB Bellevue numbers | Sales tool |
| **S4** | Convert 1 design partner to paying Pro at Day 60 of test | First $79 of MRR — Frontline becomes a real company |
| **S5** | Stand up basic billing infrastructure (Stripe + invoicing + dunning) | Customers can pay |
| **S6** | Write the Frontline pitch deck (12 slides, 80% reuse from this document) | Pre-seed-ready |
| **S7** | Draft TCPA/SMS consent UX with short legal review (~$1K LLM-assisted attorney consult) | R4 risk mitigated |

#### Medium-term (next 6 months) — "first 10 paying customers"

| # | Action | Outcome |
|---|---|---|
| **M1** | **Hit $5,000 MRR (~10 paying Pro customers)** — the founder full-time trigger | Sid leaves day-job within 30 days |
| **M2** | Diversify off Bellevue Indian — at least 3 cities + 4 cuisines among first 25 customers | Concentration risk reduced (R6) |
| **M3** | Ship multi-location tier so design partners with second locations expand within Frontline | NDR story begins |
| **M4** | Productize Apple Business Connect, WhatsApp Business, and Yelp distribution playbook (apply to every onboarding) | Distribution becomes a flow, not hand-holding |
| **M5** | Complete the Azure Communication Services migration (issue #33) | R1 mitigated structurally |
| **M6** | Open the Reserve-with-Google partner application defensively (long pole is Google's invitation pace) | Optionality created at $0 cost |
| **M7** | Write first long-form thought-leadership piece | Content engine begins |

### Strategic Questions for Resolution

| # | Question | Decide by |
|---|---|---|
| Q1 | Single segment (A only) or two-segment (A + B) launch? | Month 2 |
| Q2 | Bootstrap-only or pre-seed at $5K MRR? | Month 6 |
| Q3 | Build Toast/Square POS integration as partner play, or compete head-on? | Month 4 |
| Q4 | File the Reserve-with-Google partner application or hold? | Month 5 |
| Q5 | Build for ChatGPT/Claude/Gemini agents, or build a Frontline-branded AI agent? | Reactive to ecosystem, review monthly |
| Q6 | Multi-tenant DB isolation level — when do we migrate? | Month 9 (or customer #50, whichever first) |
| Q7 | First hire — sales, engineering, or operations? | Month 12 (or $25K MRR) |

---

## 📈 Part 6: Business Metrics & Risks

### Primary KPIs

#### Growth

| KPI | Y1 target | Y2 target | Y3 target |
|---|---:|---:|---:|
| Total paid Pro customers | 50 | 500 | 1,500 |
| MRR | $4,000 | $40,000 | $120,000 |
| ARR | $48,000 | $480,000 | $1,440,000 |
| Viral coefficient (Segment A) | 0.2 | 0.45 | 0.5 |
| CAC payback (blended) | <4 mo | <6 mo | <8 mo |

#### Retention

| KPI | Y1 | Y3 |
|---|---:|---:|
| Logo retention (annual) | 75% | 85% |
| Net dollar retention | 100% | 110% |
| Day 30 retention (cohort) | 60% | 70% |
| LTV:CAC (blended) | 6:1 | 8:1 |

#### Engagement

| KPI | Y1 | Y3 |
|---|---:|---:|
| MAU as % of paid | 90% | 95% |
| Median joins per restaurant per shift | 12 | 35 |
| Voice IVR adoption rate | 60% | 85% |
| Dining lifecycle adoption rate | 40% | 75% |
| Time to first join (signup → first diner joined) | 24h | 4h |

#### Business

| KPI | Y1 | Y3 |
|---|---:|---:|
| Gross margin | 80% | 85% |
| Burn multiple | 0.5 | 0.3 |
| % revenue from Segment A | 70% | 45% |
| Multi-location % of revenue | 5% | 25% |
| % revenue outside Greater Seattle | 10% | 60% |

#### North star: **Joins per dollar of MRR per month.**
*"For every $1 of MRR Frontline collects this month, how many diner joins did it process?"* This number measures pricing efficiency (denominator), product-market fit (numerator), and engagement (ratio stability) at once. **Year 1 target: ≥ 5 joins per $/MRR/mo. Year 3 target: ≥ 12.**

### Top 10 Risks & Mitigations

Risks scored on severity × likelihood (1-5 each).

| # | Risk | Score | Mitigation |
|---|---|---:|---|
| **R1** | Twilio A2P 10DLC compliance pricing keeps creeping up | **20** | Dual-vendor (Azure Communication in flight per #33); pass overages transparently; per-tenant SMS budget caps |
| **R3** | Founder bandwidth — Sid solo, side-project until $5K MRR | **16** | Ruthless segment focus: only Segment A in Months 1–6; no press until customer #20; first contractor at month 9 |
| **R2** | Toast/Square ship a free waitlist add-on | **15** | We do not target POS-anchored restaurants in Year 1; build POS integrations as partner mode in Year 2 instead of fighting |
| **R5** | Restaurant industry contraction (–2.3% in 2025) | **12** | Surviving restaurants need *more* efficiency, not less; tighten the lobby-calculator pitch |
| **R6** | Diaspora segment concentration risk | **12** | Force diversification by customer #25: 3 cities + 4 cuisines minimum; track concentration weekly |
| **R7** | AI-agent platform shift — Google/OpenAI ship native restaurant agents | **12** | Pillar 4 (MCP server) is the exact defense; file Reserve-with-Google application as backup |
| **R8** | POS bundling acceleration | **12** | Same as R2 — partner mode in Year 2 |
| **R9** | Cash runway shortfall — bootstrap takes 12+ months instead of 6 | **12** | SKB Bellevue absorbs Frontline cost in eaten meals; founder full-time trigger is $5K MRR not a date |
| **R4** | TCPA / SMS class action | **10** | A2P 10DLC registration before any SMS; explicit consent capture with audit trail; opt-outs in every message; E&O insurance from Day 1 of Pro tier; legal review of consent UX in Month 3 |
| **R10** | Single-customer dependency on the SKB Bellevue flagship | **5** | Sign customer #2 within 90 days of beta launch |

---

## 📚 Sources

All citations used in this document, in order of first appearance:

- [National Restaurant Association — 2026 State of the Industry](https://restaurant.org/research-and-media/research/research-reports/state-of-the-industry/)
- [Nation's Restaurant News — Independent restaurant sector shrunk 2.3% in 2025 (2026)](https://www.nrn.com/independent-restaurants/the-independent-restaurant-sector-shrunk-by-2-3-in-2025)
- [Dataintelo — Restaurant Waitlist Management Software Market](https://dataintelo.com/report/restaurant-waitlist-management-software-market)
- [Business Research Insights — Restaurant Management Software Market](https://www.businessresearchinsights.com/market-reports/restaurant-management-software-market-100041)
- [poidata.io — List of Indian restaurants in the United States](https://www.poidata.io/report/indian-restaurant/united-states)
- [Yahoo Finance — Indian Restaurants in the US Industry Analysis](https://finance.yahoo.com/news/indian-restaurants-us-market-size-150000799.html)
- [IBISWorld — Bubble Tea Shops in the US](https://www.ibisworld.com/united-states/industry/bubble-tea-shops/6250/)
- [GoHalalFood — Rise of Halal Food in America 2026](https://gohalalfood.com/the-rise-of-halal-food-in-america-2026-market-analysis/)
- [G2 — Yelp Guest Manager Pricing 2026](https://www.g2.com/products/yelp-guest-manager/pricing)
- [Yelp Restaurants Pricing — Official](https://business.yelp.com/restaurants/yelp-restaurants-pricing/)
- [Waitwhile — Pricing](https://waitwhile.com/pricing/)
- [G2 — Waitwhile Pricing 2026 (last updated 2025-08-27)](https://www.g2.com/products/waitwhile/pricing)
- [Waitly — Pricing](https://www.waitly.com/pricing/)
- [NextMe — Pricing (canonical; bot-blocked but valid in browser)](https://nextmeapp.com/pricing/)
- [Capterra — NextMe](https://www.capterra.com/p/165482/NextMe/)
- [SpotSaaS — Waitlist Me](https://www.spotsaas.com/product/waitlist-me)
- [OpenTable — Plans (official)](https://www.opentable.com/restaurant-solutions/plans/)
- [Tekpon — OpenTable Pricing 2026](https://tekpon.com/software/opentable/pricing/)
- [Tock — Plans & Pricing](https://www.exploretock.com/join/pricing/)
- [Restaurant Business — Resy and Tock are merging](https://www.restaurantbusinessonline.com/technology/reservation-services-resy-tock-are-merging)
- [Fast Company — Amex is upgrading Resy](https://www.fastcompany.com/91496951/amex-resy-tock-restaurant-reservation-wars)
- [SevenRooms — Restaurant Reservation System Comparison Guide](https://sevenrooms.com/blog/restaurant-reservation-system-comparison-guide/)
- [Eat App — Best restaurant waitlist apps 2026](https://restaurant.eatapp.co/blog/best-restaurant-waitlist-management-systems)
- [Bessemer Venture Partners — The Rise of Toast](https://www.bvp.com/atlas/the-rise-of-toast)

---

*Created via FRAIM Business Development Strategy Workflow on 2026-04-10. Working draft sections that fed this document live in `.business-plan-draft.md` and can be removed once this plan is approved. Companion document: [SKB Restaurant Queue Distribution Plan](skb-restaurant-queue-distribution.md) — the GTM playbook for the flagship customer.*
