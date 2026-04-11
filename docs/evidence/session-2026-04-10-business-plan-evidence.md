# Evidence: Business Plan Creation Session

**Session ID:** session-2026-04-10-business-plan
**Workflow:** FRAIM `business-plan-creation` (11-phase job)
**Date:** 2026-04-10
**FRAIM session:** d7829391-4590-484d-b6fb-4a5e6f2c0c4f

## Summary

Productized the SKB restaurant operations platform into "Frontline" — a multi-tenant SaaS positioned for diaspora-cuisine, halal/kosher, brunch-indie, and boba-shop independent restaurants. Bold-default founder posture confirmed by user. Comprehensive business plan written, segment-scored, market-sized with cited sources, competitively positioned against 13 named competitors with cited pricing, and broken into a 30/90/180-day action plan with 7 strategic questions and 10 risk-mitigated scenarios.

This was triggered out of the conversation that began with productizing the Google Maps integration for the SKB Bellevue flagship customer (Issue #30) and naturally expanded into "what if SKB the app became a real company."

## Work Completed

### Files created
- `docs/business-development/business-plan.md` — **the canonical deliverable.** ~600 lines, follows the FRAIM `BUSINESS-PLAN-TEMPLATE.md` exactly: Executive Summary → Market Segments → Market Research → Growth & Virality → Competitive Positioning → Implementation & Roadmap → Business Metrics & Risks → Sources.
- `docs/business-development/skb-restaurant-queue-distribution.md` — companion doc, written in the same session: GTM playbook for the **flagship customer (SKB Bellevue itself)** to seed the queue link across Google Maps, Instagram, WhatsApp, door QR, Yelp, Apple Maps, and review solicitation. 7 prioritized actions + UTM scheme + a blocking-issue address mismatch.
- `docs/business-development/.business-plan-draft.md` — working draft assembled phase-by-phase across the FRAIM workflow. Removable now that the canonical `business-plan.md` is complete.
- `docs/evidence/session-2026-04-10-business-plan-evidence.md` — this file.

### Files modified
- `README.md` — fixed three citations of `skb.azurewebsites.net` to the correct production hostname `skb-waitlist.azurewebsites.net` (lines 51, 54, 83). This was the spark of the session — a doc bug discovered while verifying the queue page was reachable.

### FRAIM phases executed (11 of 11)
1. ✅ `product-context-gathering` — scanned the SKB codebase, surfaced 10 already-shipped capabilities, confirmed 8 bold defaults with the user via a single-table multiple-choice intake (validated as a useful pattern; saved as feedback memory `feedback_bold_defaults_intake.md`)
2. ✅ `market-segment-identification` — brainstormed 7 candidate segments, scored on the FRAIM 7-criterion framework (pain × size × WTP × network × distribution × budget clarity × competitive underservice), selected top 4 (diaspora-cuisine, halal/kosher, brunch indies, boba shops), explicitly excluded 3 (mini-chains, fine dining, fast-casual) with rationale
3. ✅ `market-research-analysis` — TAM $391M / SAM $80M / SOM Y3 $1.59M–$2.39M with 11 cited sources; Porter's Five Forces with each force rated and explained; network effects analysis (data, customer-owner, customer-diner, platform) with viral coefficient targets per segment
4. ✅ `growth-strategy-development` — viral loops per segment (K targets 0.4–0.6 for Segment A); retention strategy with Day-30 / Month-6 / NDR targets; CAC/LTV by segment ($120 CAC → $2,054 LTV → 17:1 LTV:CAC for Segment A in Year 1); pricing tier specification ($79 Pro flat, no per-cover, no contracts)
5. ✅ `competitive-analysis` — 13-competitor matrix with all pricing cited; 5 differentiation pillars (voice IVR, full dining lifecycle, no-PII diner UX, MCP server, predictable flat pricing); 6 sales talk tracks for top objections; strategic recommendations
6. ✅ `additional-business-considerations` — pricing tradeoff analysis (5 alternatives rejected with reasons); COGS-per-customer calculation showing 87% gross margin; 10 risks scored on severity × likelihood with concrete mitigations; KPI targets across Growth / Retention / Engagement / Business categories; **north star: "joins per dollar of MRR per month"**
7. ✅ `implementation-planning` — 30-day immediate actions (5), 90-day short-term (7), 180-day medium-term (7); 7 open strategic questions with decide-by dates; explicit deep-dive activities required before scaling beyond customer #25
8. ✅ `document-assembly` — fetched and followed `BUSINESS-PLAN-TEMPLATE.md`; assembled the canonical doc; ran reference-link validation across 8 critical citations; **found and corrected 3 outdated pricing claims** (Waitwhile, OpenTable, Tock — see Validation section below); **discovered Tock has a $79 Base plan at exactly Frontline's price**, integrated as a key competitive datapoint
9. ⏸️ `business-plan-submission` — **paused for user review.** Evidence document written (this file). Commit / PR / push **NOT** taken — these are shared-state actions awaiting explicit user authorization.
10. ⏸️ `address-feedback` — pending submission and user feedback
11. ⏸️ `retrospective` — pending phase 9/10 completion

## Validation

### Reference link verification (per FRAIM `validate-reference-links` skill)

Ran live verification against 8 critical load-bearing URLs. Three corrections made before finalizing the doc:

| Citation | Status | Action |
|---|---|---|
| NRA 2026 State of Industry ($1.55T) | ✅ OK — content matches | None |
| NRN 412,498 / -2.3% indie restaurant count | ✅ OK — content matches | None |
| Dataintelo waitlist software market ($576M → $1.12B / 8.1% CAGR) | ✅ OK — content matches | None |
| IBISWorld bubble tea (6,635 / $2.6B / 24.1% CAGR) | ✅ OK — content matches | None |
| Waitly $49 Premium | ✅ OK — content matches | None |
| **Waitwhile $49 Starter / $129 Business** | ❌ Pricing was outdated | **Corrected to Free / Starter from $31 / Business from $55 (volume-tiered)** per current G2 (last updated 2025-08-27) |
| **OpenTable $39 / $249 / $449 + per-cover** | ❌ Pricing wrong | **Corrected to $149 Basic / $299 Core / $499 Pro + $0.25–$1.50/cover** per Tekpon 2026 |
| GetSauce article cited for OpenTable/Resy/Tock pricing | ❌ Article didn't contain the cited prices | **Removed citation, replaced with OpenTable Plans (official) and Tekpon as the new sources** |
| Tock pricing | (Researched as part of fix) | **Found Tock has a $79 Base plan — only direct price-band competitor.** Updated competitive matrix with Tock Base callout. Also corrected Tock ownership from "Squarespace" to "Amex (merging with Resy)" per Restaurant Business 2026. |

Three URLs (Tock pricing page, G2 Yelp Guest Manager pricing, NextMe canonical) returned HTTP 403 to the WebFetch tool but are well-known canonical URLs that serve content to real browsers. Per the skill guardrail, those are kept as-is and a secondary citation is added where available (Capterra for NextMe, Tekpon for OpenTable, Waitly direct for Waitly).

### Internal consistency checks
- Pricing tiers cited consistently across competitive matrix, pricing landscape table, and talk tracks
- All segment scores in Phase 2 match the segment summaries in the final doc
- LTV math reconciles ($79/mo × 26-month average lifetime = $2,054)
- COGS math reconciles ($10.34 / $79 = 13% → 87% gross margin)
- TAM/SAM/SOM percentages reconcile (3% of $80M SAM ≈ $2.39M Year 3 SOM)

## Quality Checks

- ✅ Final doc follows FRAIM `BUSINESS-PLAN-TEMPLATE.md` section structure exactly
- ✅ All 6 template parts populated with no placeholder text
- ✅ All major numerical claims have cited sources with markdown hyperlinks
- ✅ All competitor pricing has at least one citation
- ✅ Reference validation run on the 8 most load-bearing citations
- ✅ Internal cross-references reconcile (LTV = ARPU × lifetime; SOM = % × SAM; etc.)
- ✅ Tradeoff analysis present for every locked decision (pricing, segment selection, founder posture)
- ✅ Companion distribution doc cross-linked from the main plan
- ✅ FRAIM `seekMentoring` called at every phase transition with structured findings

## Phase Completion

| Phase | Status | Evidence |
|---|---|---|
| 1. product-context-gathering | ✅ Complete | Repo scan + 8-default user confirmation |
| 2. market-segment-identification | ✅ Complete | 7-candidate scoring matrix; top 4 selected with rationale; 3 explicitly excluded |
| 3. market-research-analysis | ✅ Complete | TAM/SAM/SOM table; Porter's Five Forces table; network effects table; 11 cited sources |
| 4. growth-strategy-development | ✅ Complete | Viral loops by segment; retention targets; CAC/LTV tables; pricing tier spec |
| 5. competitive-analysis | ✅ Complete | 13-competitor matrix; 5 differentiation pillars; 6 talk tracks; strategic recommendations |
| 6. additional-business-considerations | ✅ Complete | Pricing tradeoff (5 alternatives rejected); COGS table; 10 risks scored and mitigated; KPI targets |
| 7. implementation-planning | ✅ Complete | 30/90/180-day action plans; 7 strategic questions with decide-by dates |
| 8. document-assembly | ✅ Complete | Canonical `business-plan.md` written; reference validation run; 3 corrections made; Tock $79 finding integrated |
| 9. business-plan-submission | ⏸️ Paused | Evidence document complete (this file); awaiting user authorization for commit/PR |
| 10. address-feedback | ⏸️ Pending | — |
| 11. retrospective | ⏸️ Pending | — |

## Open Items / Carry-overs

These are not part of the business plan but were surfaced during the session and are tracked elsewhere:

1. **Address/phone source-of-truth mismatch** between SKB DB (15245 Bel-Red Rd / +1-425-643-0197), Google Business Profile (12 Bellevue Way SE), and third-party listings (253-656-5478). This is action **I1** in the business plan's 30-day immediate-action list and is independently called out in `skb-restaurant-queue-distribution.md` as a blocker.
2. **Queue page no-auto-refresh bug** — discovered when the user reported "UI says 0" while the SSR meta and live API both said 2. The static HTML loads `parties waiting → —`, JS fills it once, then never refreshes. Should be a separate issue ticket.
3. **`src` UTM attribution support** on the join endpoint — needed before the per-channel distribution measurement in `skb-restaurant-queue-distribution.md` becomes meaningful.
4. **`edit-profile.yml`** at the repo root — leftover Playwright accessibility snapshot from the GBP investigation earlier in the session. Safe to delete; should not be committed.
5. **FRAIM L0 unprocessed signals** — flagged 13 unprocessed coaching signals at session start with a "synthesis overdue" warning. Recommendation: run `end-of-day-debrief` before next session.

## What's Required from the User

Phase 9 of the FRAIM workflow asks for: commit, push, PR creation, issue label updates. None of those are taken yet. The user needs to decide:

1. **Commit & branch:** the repo is currently in detached HEAD state with `README.md` modified and `docs/business-development/` untracked. Does the user want a new branch (e.g., `business-plan-frontline`) for this work, or commit on top of existing branch state, or hold off entirely?
2. **Should `.business-plan-draft.md` be removed before commit, or kept as a working artifact?**
3. **Should `edit-profile.yml` be deleted?** It's a stale Playwright snapshot.
4. **Is there a GitHub issue this should attach to?** The session was triggered from work on Issue #30 (Google Maps integration) but the business plan is broader than that issue.
5. **Phase 11 retrospective:** the user can either run it now or skip — it's a self-improvement step for the FRAIM agent, not a deliverable for the user.
