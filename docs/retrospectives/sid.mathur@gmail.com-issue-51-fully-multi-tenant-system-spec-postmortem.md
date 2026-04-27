---
author: sid.mathur@gmail.com
date: 2026-04-17
synthesized: 2026-04-27
---

# Postmortem: Fully multi-tenant system — feature-specification — Issue #51

**Date**: 2026-04-17
**Duration**: ~2 hours end-to-end (context gathering through submission)
**Objective**: Produce a comprehensive feature spec + high-fidelity mocks for turning SKB into a self-serve multi-tenant restaurant platform
**Outcome**: Success — spec committed as c5821f0, Sid acked, implementation sub-tasks dispatched

## Executive Summary

Drafted a 490-line feature spec covering owner signup, staff roles with role-scoped auth, per-tenant session scoping, two website templates, and backward compatibility for the SKB Bellevue deployment. Spec was accepted on first review; only adjustment was deferring the product name to a dedicated naming sub-task after discovering "Mise" is crowded in the restaurant/hospitality space (direct collision with app.trymise.com and phonetic collision with getmeez.com).

## Architectural Impact

**Has Architectural Impact**: Yes (proposed, not yet implemented)

**Sections Updated**: The spec itself introduces architectural changes; no architecture doc exists in the repo yet (a gap flagged during context-gathering).

**Changes Made (proposed)**:
- New collections: `users`, `memberships`, `invites`
- Cookie payload extended from bare expiry to `{userId, locationId, role, exp}`; new `skb_session` cookie alongside legacy `skb_host` with deprecation window
- New `requireRole(role...)` middleware replacing `requireHost`
- Website template system: `Location.websiteTemplate` + `Location.content` structured editable fields
- 9 new endpoints (signup, login, invites, staff management, template config)

**Rationale**: Enables issue #51's core ask — self-serve multi-tenant signup, staff roles, per-restaurant AuthZ — while preserving the existing SKB Bellevue production deployment (backward-compat for cookie format and legacy `/api/*` routes).

**Updated in PR**: No (spec-only submission; implementation PRs will follow from sub-issues)

## Timeline of Events

### Phase 1: context-gathering
- ✅ Read issue #51 body and comments via GitHub MCP
- ✅ Parallel sub-agent survey of backend architecture, auth, frontend surfaces, domain model, integrations
- ✅ Parallel sub-agent survey of prior feature specs (1, 24, 29, 30, 31, 37, 45, 46) and mocks directory visual conventions
- ✅ Direct reads of `src/mcp-server.ts`, `src/types/queue.ts`, `src/services/locations.ts`, `src/middleware/hostAuth.ts`, `src/routes/host.ts`
- ✅ Read personalized learnings (preferences, coaching, mistake patterns)
- ✅ Surfaced critical auth gap: cookie HMAC is location-agnostic — PIN checked per-location but cookie works cross-tenant

### Phase 2: spec-drafting
- ✅ Fetched FRAIM feature-spec template
- ✅ Drafted 490-line spec organized around the 7 asks in the issue body
- ✅ Proposed bold default: "Mise" as product name
- ✅ Created 5 self-contained HTML+CSS mocks using admin-split palette from #46

### Phase 3: competitor-analysis
- ✅ Delegated 14-competitor research to sub-agent with explicit "cite or say 'not public'" constraint to avoid the prior fabricated-numbers failure mode
- ✅ Integrated matrix + 4 differentiation pillars + response strategy into §14

### Phase 4: spec-completeness-review
- ✅ Traced every issue-body requirement to a spec section and validation scenario
- ✅ Verified all 5 mocks rendered (static inspection, not live browser)
- ✅ Confirmed compliance section covers tenant isolation, auth credentials, TCPA, PII, explicit non-obligations

### Phase 5: spec-submission
- ✅ Paused before commit per Sid's durable preference
- ✅ Sid asked about the name — ran name-availability check, surfaced 6 incumbents
- ✅ Sid directed: add competitors to config, defer naming, proceed to implementation
- ✅ Sub-agent stripped "Mise" brand from spec + 5 mocks (left in §5 and §13 as the documented rejection explanation)
- ✅ Committed c5821f0 and pushed to origin/feature/51-fully-multi-tenant-system

### Phase 6: address-feedback
- ✅ Feedback was resolved in-flight before the commit landed (name strip + config update)

### Phase 7: retrospective
- ✅ This document

## Root Cause Analysis

### 1. **Primary miss — name availability not checked before proposing**

**Problem**: I proposed "Mise" as a bold default in §5 without running an availability check against the hospitality/restaurant software namespace. Sid asked "any other products with that name?" and the subsequent check found 6 direct and phonetic collisions including app.trymise.com (direct category overlap) and getmeez.com (phonetic).

**Impact**: Cost one round of spec revision (config update + prose strip across spec + 5 mocks). Low damage because Sid caught it before the commit, but the pattern matches the durable "Sid's post-commit review catches load-bearing errors" coaching note — except this time Sid caught it pre-commit because he asked the right question.

### 2. **Contributing factor — bold-defaults preference ran ahead of due diligence**

**Problem**: The memory entry "propose bold defaults in a table for confirm-or-override" was interpreted as "decide confidently and present." For naming specifically, "confidently present" should have included "after verifying the name is not already a direct competitor." Naming is an externally-verifiable claim, not a taste preference.

**Impact**: A naming claim is load-bearing for marketing and brand; shipping a spec with a brand that collides is worse than shipping one with a deferred name.

## What Went Wrong

1. **Didn't search the product namespace before proposing a name.** Should have WebSearch'd `"mise" restaurant software` before writing §5.
2. **Treated product name as a taste decision rather than a research decision.** Fonts and colors are taste; names are research.

## What Went Right

1. **Parallel sub-agent dispatch for context-gathering and competitor research was efficient** — got two deep surveys running at once without blowing up the main context window.
2. **Explicit "cite or say 'not public'" instruction for the competitor-research agent prevented the prior fabricated-numbers failure mode.** Pricing claims in §14 are either cited or explicitly flagged as unverified.
3. **Critical auth-gap discovery during context-gathering** (cookie HMAC isn't location-scoped) surfaced a real security issue and made it the first sub-issue to ship in §12 — turning spec work into a meaningful engineering finding rather than just a design exercise.
4. **Backward-compatibility design was deliberate, not an afterthought.** Cookie deprecation window, legacy `skb_*` naming preserved, saffron template as default, `/api/*` routes untouched — all so SKB Bellevue observes zero change.
5. **Ran analysis phases autonomously per Sid's durable preference** — Phase 1 confirmed once, Phases 2-4 executed without interim checkpoints, paused only at commit time. Saved several round-trips.

## Lessons Learned

1. **Names are load-bearing facts, not design preferences — verify before proposing.** Add a web-search-the-namespace step to any spec that proposes a product or brand name.
2. **"Bold defaults" means decisive-with-grounding, not decisive-without-research.** The memory entry should be read alongside the `evidence-based-reasoning` mistake pattern for externally-verifiable claims.
3. **Surfacing a latent auth bug during a spec is high-value work.** The cookie-scoping gap existed before this spec; the spec process exposed it. That's the kind of yield a feature-specification phase should produce.

## Agent Rule Updates Made to avoid recurrence

1. **Before proposing any product name, company name, or domain in a spec, run a web search for collision in the product's category.** If collision exists, either pick a different name up front or explicitly defer naming with a rationale. Do not commit a spec with a named product without this check.
2. **Apply the "cite or say unverified" rule to pricing, competitor claims, and load-bearing numbers in every spec.** The competitor-research sub-agent got this instruction and produced clean sourcing; the main draft should default to the same discipline.

## Enforcement Updates Made to avoid recurrence

1. **Coaching moment captured** at `fraim/personalized-employee/learnings/raw/sid.mathur@gmail.com-2026-04-17-name-availability-check-before-proposing.md` for synthesis at end-of-day.
2. **Spec template addition suggested**: add an explicit "Name availability" check to the feature-spec workflow when §5-equivalent sections propose brand / product / domain names. Not filed as a FRAIM contribution yet — flag for the next contribute-to-fraim pass.
