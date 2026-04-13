---
author: sid.mathur@gmail.com
date: 2026-04-08
synthesized: 2026-04-12
---

# Postmortem: SMS Users When Host Calls Them - Issue #29

**Date**: 2026-04-08
**Duration**: ~30 minutes
**Objective**: Create comprehensive feature specification for SMS notifications when host calls a waitlisted diner
**Outcome**: Success — spec approved after 1 round of feedback

## Executive Summary

Feature specification for issue #29 was drafted and submitted for review. Received 5 feedback items in round 1: phone number changed from optional to required, confirmation SMS on join with status link added, repeat call SMS tone softened, and host SMS delivery status indicators (checkmark/X) added. All items addressed and approved.

## Architectural Impact

**Has Architectural Impact**: No

## Timeline of Events

### Phase 1: Context Gathering
- ✅ **Read issue #29**: Extracted 3 core requirements (full phone, SMS on call, call count)
- ✅ **Codebase exploration**: Identified current phone collection (last-4-digits), call flow in `callParty()`, no existing SMS infrastructure
- ✅ **Requirements extraction**: 8 initial requirements (R1-R8) with acceptance criteria

### Phase 2: Spec Drafting
- ✅ **Spec authored**: Full spec with user flows, requirements, edge cases, compliance
- ✅ **HTML mocks created**: Diner join form + SMS preview (3 scenarios)
- ✅ **Design standards applied**: Generic UI baseline, SKB brand consistency

### Phase 3: Competitor Analysis
- ✅ **5 competitors researched**: Yelp Guest Manager, Waitly, NextMe, TablesReady, Waitlist Me
- ✅ **Differentiation identified**: Call count in SMS (unique), no ecosystem lock-in, privacy-first

### Phase 4: Spec Completeness Review
- ✅ **Mocks validated in browser**: Both render correctly via Playwright
- ✅ **Requirement coverage verified**: All issue requirements mapped to acceptance criteria
- ✅ **Compliance and design checks passed**

### Phase 5: Spec Submission
- ✅ **PR #32 created**: Evidence document, labels updated, PR comment added

### Phase 6: Address Feedback
- ✅ **5 items addressed**: Phone required, join SMS, polite tone, host indicators
- ✅ **Requirements grew from R1-R8 to R1-R10**

## Root Cause Analysis

### 1. **Primary Cause: Phone optionality assumption**
**Problem**: Assumed phone would remain optional based on current codebase pattern (phoneLast4 is optional). The issue text said "users should specify their full phone" which implied required.
**Impact**: Required a feedback round to correct — minor but avoidable.

### 2. **Contributing Factors**
**Problem**: Did not consider the confirmation-SMS-on-join use case. The issue only mentioned "get a text when host calls them" but the reviewer expanded scope to include join confirmation.
**Impact**: New requirement R3 added in feedback. This was a legitimate scope expansion by the product owner, not a miss.

## What Went Wrong

1. **Phone optionality**: Defaulted to "optional" based on existing code pattern instead of reading the issue requirement more carefully — "users should specify their full phone" implies it's mandatory.
2. **SMS tone**: The repeat call message ("Please come to the front now") sounded scolding. Should have defaulted to a friendlier, hospitality-appropriate tone.

## What Went Right

1. **Comprehensive competitor analysis**: 5 competitors analyzed with specific feature comparison, identified unique differentiator (call count in SMS).
2. **Interactive mocks**: HTML/CSS mocks rendered correctly and effectively communicated the UX changes.
3. **Compliance coverage**: TCPA and PII requirements included proactively without being asked.
4. **Quick feedback turnaround**: All 5 feedback items addressed in a single iteration.

## Lessons Learned

1. **Read issue requirements literally**: "Users should specify X" means X is required, not optional. Don't let existing code patterns override explicit requirements.
2. **Default to hospitality tone for customer-facing messages**: SMS messages for restaurant diners should be warm and polite, not transactional/urgent. This is a restaurant, not a system alert.
3. **Think about the full SMS lifecycle**: When adding SMS for one event (call), consider what other events in the workflow could benefit from SMS (join confirmation, ETA updates, etc.).

## Agent Rule Updates Made to avoid recurrence

1. None — learnings are general spec-writing practices, not rule-worthy patterns yet.

## Enforcement Updates Made to avoid recurrence

1. None — single-round feedback with quick resolution doesn't warrant enforcement changes.
