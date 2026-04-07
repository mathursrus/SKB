---
author: sid.mathur@gmail.com
date: 2026-04-06
context: issue 24, feature-specification
---

# Coaching Moment: spec-ux-assumptions-without-user

## What happened

The sub-agent speccing issue #24 (dining party lifecycle) made 4 UX design decisions without user input: (1) added a diner-facing timeline view when the user only wanted host-side tracking, (2) used a flat single-table layout when the user wanted 3 tabs (waiting/seated/complete) with click-to-drill-down, (3) omitted a per-party timeline detail view, and (4) missed the core analytics page (historical distributions by party size) that was the user's primary motivation for tracking lifecycle data. The user corrected all 4 via PR review comments.

## What was learned

For UX-heavy features, present the information architecture (what screens, what tabs, what's visible to whom) to the user for approval BEFORE drafting detailed requirements — don't assume the UI layout.

## What the agent should have done

Before writing the spec, the agent should have asked: "Here's how I'd organize the host view — 3 tabs? single page? drill-down? Should the diner see any of this?" — a 30-second confirmation that would have avoided all 4 corrections. For features that change the user-facing experience significantly, always confirm the IA (information architecture) skeleton before filling in requirements.
