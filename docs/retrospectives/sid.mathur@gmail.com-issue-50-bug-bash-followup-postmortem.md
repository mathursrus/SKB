---
author: sid.mathur@gmail.com
date: 2026-04-15
synthesized: 2026-04-27
---

# Postmortem: Issue #50 bug-bash follow-up — 5 fixes + FRAIM revalidation

**Date**: 2026-04-15
**Duration**: ~90 minutes from bug-bash surfacing to revalidation PASS
**Objective**: Systematically fix all 5 bugs surfaced during the first FRAIM bug-bash pass (2 P1, 2 P2, 1 P3), then re-run `/fraim ui polish` and `/fraim bug bash` to confirm closure.
**Outcome**: success

## Executive Summary

Fixed all 5 bug-bash findings in 5 sequential commits, each with a regression test. Deployed to prod, re-validated in browser via Playwright, then ran the full FRAIM ui-polish-validation job (12 phases, PASS) and user-testing-and-bug-bash job (6 phases, PASS). Zero P0/P1 remaining. Total 32 unit regression cases green.

## Architectural Impact

**Has Architectural Impact**: No

## Timeline of Events

### Phase: Bug Fixing (sequential, one commit per bug)
- ✅ **81ca37d** — host waiting-table mobile overflow: swapped `td.actions { width: 460px }` for `min-width: 340px`, hid `.more-btn` below 900px, added `overflow-x: auto` on `.tab-content` as safety net
- ✅ **64e9deb** — diner chat 429 storm: replaced `setInterval` with recursive `setTimeout`, added exponential backoff (base 4s → 8s → 16s → 32s → 60s cap), reset on 200
- ✅ **30da020** — host login theme toggle: added `data-theme-toggle` button inside `#login-view`; switched theme.js from `getElementById('theme-toggle')` to `querySelectorAll` so multiple toggles on one page (login + topbar) stay in sync
- ✅ **044976a** — server name sanitization: `validateJoin` now rejects names containing `<`, `>`, or `\` with 400 `name contains unsupported characters`
- ✅ **be7c76f** — `#111` → `var(--accent-fg)` tech debt: 7 call sites migrated; no visual change

### Phase: FRAIM UI-Polish Revalidation (12 phases)
- ✅ Re-captured evidence for mobile host (no overflow), login with toggle (both themes), dark mode all surfaces
- ✅ PASS — zero P0/P1 remaining

### Phase: FRAIM Bug-Bash Revalidation (6 phases)
- ✅ Edge-case probes (emoji, 120-char, whitespace, HTML, rapid duplicates) all behave correctly
- ✅ PASS — no new regressions; all 5 prior items fixed

## Root Cause Analysis

### 1. **Primary Cause — initial UI pass shipped dark-mode overrides without validating interactive surfaces in browser**
**Problem**: The first dark-mode commit `b8fba31` was backed by static regression tests but not by Playwright validation of every major screen. That's why the admin panels (white on dark) and the diner "#N of M" number (invisible) slipped through — they were hardcoded `#fff`/`#111` values my `.theme-dark` token-overrides didn't catch.
**Impact**: 3 follow-up commits (`1bb220b`, `a9805da`, `c7a1e1b`) were needed after the user manually caught the issue in prod. Each was cheap individually but collectively burned ~20 min.

### 2. **Contributing — iOS PIN 404 fix was first attempted with a guess (SameSite cookie) instead of reading the client URL**
**Problem**: Earlier commit `6c4f0dd` changed session cookie from `SameSite=Strict` to `Lax` as a speculative fix for the iOS 404. The real bug was in `ios/src/net/client.ts:buildUrl` omitting `/api` from the path.
**Impact**: A deploy cycle burned on a guess. Captured as coaching note `sid.mathur@gmail.com-2026-04-15T14-00-00-ios-404-was-client-url-not-cookie.md`.

## What Went Wrong

1. **Dark-mode validation gap** — relied on token-cascade assumption without testing the ~50 hardcoded light-mode hex values individually. Caught 3 major panel issues only after user feedback.
2. **iOS diagnostic inversion** — modified server-side cookie config before reading the client's actual request URL. Status codes point at the *layer that rejected*, not necessarily the *layer that caused*.
3. **Bug-bash Phase 4 side-effect pause** — first bug-bash pass stopped mid-phase because filing new GitHub issues is a shared-state side-effect; this was correct per the autonomous-cadence preference, but the user-facing summary didn't make clear I was *pausing* vs *done*.

## What Went Right

1. **Autonomous cadence on phases 2–11** — per the 2026-04-15 feedback `execute-mentor-phase-5-dont-hedge`, I ran analysis phases without checkpoints, only pausing at commit/push boundaries and at new-issue-filing. Sid's feedback after prior 5-phase over-hedging was a net win this round.
2. **One commit per bug** — each of the 5 fixes got its own commit with a scoped subject line, regression test, and push. Git log reads as an audit trail without needing the retrospective.
3. **Browser re-validation as proof, not just tests** — the fix for bug #1 was verified by `document.body.scrollWidth === window.innerWidth`, which no unit test could catch. Pairing unit regressions with Playwright invariants kept both cheap and thorough.
4. **Defense-in-depth for XSS** — the name-sanitization fix added a layer that wasn't strictly needed (client escape holds) but future-proofs against integrations that trust the stored name.

## Lessons Learned

1. **Dark-mode token cascades miss hardcoded hex values.** Any new theme should come with a Playwright sweep at 1280/768/375 in both modes before closing — even 27 unit tests can't substitute for computed-style checks against `--card` etc.
2. **Read the client's outgoing request before touching server config.** A 4xx points at the rejecting layer, not necessarily the causing layer. Grep the client URL builder first.
3. **Pause-at-commit ≠ pause-forever.** The user's "pause at commit time" preference means *surface the diff / evidence for review*, not *stop and wait*. For docs-only commits on low-risk artifacts, push and summarize.
4. **Multiple toggles with the same `id` fail silently.** `getElementById` returns only the first; switch to `querySelectorAll` + class/data-attribute when a page ships more than one instance of a control.

## Agent Rule Updates Made to avoid recurrence

1. **Dark-mode UI must be Playwright-validated, not just token-tested.** When adding a theme overlay, capture screenshots at 375/768/1280 for every changed surface before marking the work complete. Static regex tests guard against token drift but miss hardcoded hex values.
2. **4xx diagnosis order: client URL → server route → config.** For any "login returns 404/401/403" report, first grep the client URL builder; only after that check middleware and auth config. Documented as a coaching-moment learning on 2026-04-15.

## Enforcement Updates Made to avoid recurrence

1. **Regression tests check for ANTI-patterns, not just features.** E.g. the chat-backoff test asserts `!setInterval(loadChat)` — guards against silent reversion to the fixed pattern. Five bugbash tests follow this shape now.
2. **Evidence reports maintained as single source of truth per issue.** `docs/evidence/50-ui-polish-validation.md` and `docs/evidence/50-bug-bash.md` are append-only through revalidation rounds so `git log` + the report together tell the full story.
