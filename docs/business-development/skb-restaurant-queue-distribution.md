# SKB Restaurant — Queue Page Distribution Plan

**Audience:** Shri Krishna Bhavan, Bellevue (the restaurant operating the queue)
**Goal:** Get the live queue page (`https://skb-waitlist.azurewebsites.net/r/skb/queue.html`) in front of diners at every point in their decision journey, not just on Google Maps.
**Last updated:** 2026-04-10

---

## TL;DR

Google Maps is wired up (Issue #30 — the GBP Website slot now points at the queue page). That's necessary but **not sufficient**. Google Maps is the *verification* step in the diner journey, not the *discovery* step. To actually move walk-in volume, the queue link needs to be seeded across the channels where Bellevue diners *first hear about* SKB — and on the door for the third of diners who walk past.

The action list below is ordered by **leverage per hour of effort**. Do them top-to-bottom; each item is something the SKB owner can finish in one sitting.

---

## The data (why this ordering)

| Discovery channel | Share of US diners (2026) | Notes for SKB |
|---|---:|---|
| Word of mouth (incl. WhatsApp / community) | ~38–45% | Largest single channel; Indian diaspora in Bellevue/Redmond runs heavily on WhatsApp groups |
| Walking / driving past | ~30% | Captured by door signage, not by digital |
| Facebook | 27% | Older diners, family decision-makers |
| Map apps (Google Maps + Apple Maps) | ~18% | The verification layer for almost everyone |
| Search engines (Google, Yelp) | ~16% | Reviews + hours + wait time |
| Instagram / YouTube | ~15% each | Millennials; food photography |
| TikTok | ~14% (38% for Gen Z) | Short-form food content |

Two things to internalize:

1. **No single channel exceeds ~45%.** This is a multi-touchpoint game; restaurants that win show up consistently across several channels.
2. **85% of diners hit Google somewhere in the journey** before going, even when they discovered the restaurant on TikTok or in a friend's text. Verification is where wait-time anxiety lives — and that's exactly what the queue page solves.

---

## Action 0 — Fix the source-of-truth address mismatch (BLOCKING)

Before distributing the queue link anywhere, resolve which address is correct:

| Source | Address | Phone |
|---|---|---|
| Google Business Profile (both listings) | 12 Bellevue Way SE, Bellevue, WA 98004 | (verify on profile) |
| SKB prod DB / queue page JSON-LD | 15245 Bel-Red Rd, Bellevue, WA 98007 | +1-425-643-0197 |
| TableAgent third-party listing | (not listed) | 253-656-5478 |

**Why blocking:** the moment a diner taps the Maps link and lands on the queue page, they see one address on the Maps card and a different address in any search snippet that pulls from the JSON-LD. That's a trust hit on the first impression.

**Action:** confirm the real address with the owner. Update *both* GBP and the SKB DB document for `_id: "skb"` to match. The DB update is a one-line `db.locations.updateOne` call (see `README.md` for the pattern).

---

## Action 1 — Door QR code (captures the ~30% walking-by segment)

**Why:** A diner standing at the door who sees a 45-minute wait and walks away is a lost customer; one who scans a QR and joins the line keeps the relationship.

**What:**
1. Print a tabletop / sandwich-board sign at the entrance: large QR code + the words **"Long line? Join from your phone — text-back when ready."**
2. QR target: `https://skb-waitlist.azurewebsites.net/r/skb/queue.html`
3. There's already a generator script in the repo: `scripts/generate-qr.ts`. Run `npm run generate-qr` (or equivalent) to produce the asset.

**Effort:** 30 min (generate, print at FedEx or Costco, mount).
**Expected impact:** highest of any single action — directly converts a walk-away into a queue join.

---

## Action 2 — Instagram bio link + pinned story

**Why:** Heaviest channel for Millennial / Gen-X diners and the local Indian-diaspora food influencer crowd. The Instagram bio "link in bio" is one of the highest-trafficked single URLs a small business owns.

**What:**
1. Open the SKB Instagram → Edit Profile → Website field. Replace whatever is there with `https://skb-waitlist.azurewebsites.net/r/skb/queue.html`.
2. Create a **Highlight** called **"Wait Time"** with a single story:
   - Image: a screenshot of the queue page on a phone
   - Caption: *"Check the wait & join the line before you drive over — link in bio"*
3. Add the same line to one upcoming feed post caption.

**Effort:** 15 min.
**Expected impact:** every IG follower who's deciding "should we go to SKB tonight?" now has a one-tap path.

---

## Action 3 — WhatsApp Business profile + community seeding

**Why:** This is the single highest-leverage channel for SKB specifically. The Indian community in Bellevue / Redmond / Sammamish coordinates on WhatsApp groups (housing societies, temple groups, parent networks, IIT/BITS alumni groups). A queue link shared into one of those groups gets forwarded organically — and the OG meta tags wired up in #30 mean it renders with a rich preview card showing the live wait time.

**What:**
1. Set up / update the **WhatsApp Business profile** for SKB. Put the queue URL as the website field.
2. Compose one outbound message the owner can paste into community groups they're already part of (do not spam — just the groups they personally belong to):

   > Hi all — we just made it easier to plan a visit to SKB. You can check the live wait time and join the line from your phone before driving over: https://skb-waitlist.azurewebsites.net/r/skb/queue.html — no app, no signup.

3. Pin the same message in the SKB customer WhatsApp Broadcast list (if one exists; if not, start one — opt-in only).

**Effort:** 30 min.
**Expected impact:** unique to SKB. No other Bellevue Indian restaurant is doing this. Likely the single biggest mover of incremental joins.

---

## Action 4 — Cross-link from skbbellevue.com

**Why:** The GBP "Website" slot now points at the queue page, so `skbbellevue.com` lost its primary funnel from Google Maps. It still gets direct traffic, branded search hits, and inbound links. We need to (a) keep that traffic, and (b) make sure it sees the queue.

**What:**
1. On the `skbbellevue.com` homepage, add a prominent button at the top: **"Join the Waitlist →"** linking to `https://skb-waitlist.azurewebsites.net/r/skb/queue.html`
2. Add the same button to the Menu page footer.
3. (Optional, higher effort) 301-redirect `skbbellevue.com/queue` → the queue URL so the short branded path also works.

**Effort:** 1 hour (depends on who controls the website).
**Expected impact:** recaptures the orphaned `skbbellevue.com` traffic and gives a memorable branded short path.

---

## Action 5 — Yelp business profile link

**Why:** Yelp still carries weight on the Eastside, especially for "where should we go for dinner" planning sessions. Yelp lets a business owner add a custom URL to their profile.

**What:**
1. Claim the SKB Yelp listing if not already claimed (biz.yelp.com).
2. Edit the business info → add `https://skb-waitlist.azurewebsites.net/r/skb/queue.html` as the Website field.
3. Add one update / Yelp Post mentioning the new live wait-time link.

**Effort:** 30 min plus claim verification (which can take a day).
**Expected impact:** moderate; Yelp users skew toward "researching before going" so the wait-time message lands well.

---

## Action 6 — Apple Maps POI

**Why:** A non-trivial slice of iPhone users in Bellevue never open Google Maps. Apple's "Business Connect" (the equivalent of GBP) lets owners add custom links.

**What:**
1. Go to https://businessconnect.apple.com/, claim Shri Krishna Bhavan.
2. Add the queue URL under the equivalent of "Reservations link" / "Order link" / "Action link" — Apple's UI does have a free-text URL field, unlike Google's restaurant category.
3. Verify the address and hours match the canonical source (see Action 0).

**Effort:** 1 hour including claim flow.
**Expected impact:** small but free; covers a discovery channel competitors are mostly ignoring.

---

## Action 7 — Solicit Google reviews actively

**Why:** The verification step on Google Maps weights reviews heavily. 88% of diners say online reviews carry as much weight as personal recommendations. More fresh reviews → higher placement in "restaurants near me" results → more discovery → more queue joins.

**What:**
1. After every meal, the host hands the table check with a card: *"Loved your meal? A 30-second Google review helps us serve more diners like you. → [QR code to Google review form]"*
2. The Google review URL is generated from the GBP listing — `business.google.com → Get more reviews → Share form`.
3. Do not offer incentives (Google policy violation). Just ask.

**Effort:** 1 hour to design and print the cards.
**Expected impact:** compounds over time. Higher review volume = higher Maps ranking = more inbound.

---

## What we're explicitly NOT doing (and why)

| Option | Why discarded |
|---|---|
| **Reserve with Google partner integration** | 12–14 weeks of engineering, gated on Google's invitation pace, and locks SKB into Google's API contract forever. The Website-slot hack captures ~80% of the value in 5 minutes. (See `docs/feature-specs/30-google-maps-integration.md` and the post-mortem.) |
| **Paid Google / Meta ads** | Premature. Distribution levers above are free and targeted. Revisit only after the queue page consistently sees ≥50 joins/week from organic channels and the bottleneck becomes top-of-funnel. |
| **Building an SKB native mobile app** | Direct contradiction of SKB's "no app, no account" positioning. The queue page IS the app. |
| **TikTok content production** | Genuine impact for Gen Z (38% discovery share for that cohort), but production cost is high and Gen Z is not SKB's primary South-Indian-vegetarian-family demographic in Bellevue. Defer until somebody on the team enjoys making the content. |

---

## Tracking — how to know if this is working

The queue page already emits structured logs (`queue.join` events with `loc`, `code`, `partySize`, `position`). To attribute joins to channels, the cheapest mechanism is **per-channel UTM-tagged URLs**:

| Channel | URL to share |
|---|---|
| Google Maps (GBP Website) | `https://skb-waitlist.azurewebsites.net/r/skb/queue.html?src=gmaps` |
| Door QR | `https://skb-waitlist.azurewebsites.net/r/skb/queue.html?src=door` |
| Instagram bio | `https://skb-waitlist.azurewebsites.net/r/skb/queue.html?src=ig` |
| WhatsApp | `https://skb-waitlist.azurewebsites.net/r/skb/queue.html?src=wa` |
| skbbellevue.com | `https://skb-waitlist.azurewebsites.net/r/skb/queue.html?src=web` |
| Yelp | `https://skb-waitlist.azurewebsites.net/r/skb/queue.html?src=yelp` |
| Apple Maps | `https://skb-waitlist.azurewebsites.net/r/skb/queue.html?src=amaps` |

The `src` param is currently ignored by the backend. A small follow-up issue (tracked separately) should add it as an optional field on the join request and log it alongside the join event so weekly attribution becomes a one-line query.

**Weekly review cadence (15 min):**
1. Joins per channel (by `src` tag once instrumented)
2. Total weekly joins vs. previous week
3. Review count delta on GBP
4. Anything that changed in any channel (new IG follower spike, WhatsApp share, etc.)

---

## Open follow-ups (separate issues, do not block distribution)

- Address/phone source-of-truth reconciliation (Action 0 above) — **before** any other action ships.
- `src` query-param attribution support on the join endpoint.
- Auto-refresh on the queue page so a stale tab doesn't show "0 in line" forever (today's bug from the conversation that prompted this doc).
- Consider a server-rendered "live wait time" badge above the fold so diners arriving from a Maps tap see the number immediately, not after JS bootstraps.
