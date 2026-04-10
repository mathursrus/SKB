---
author: sid.mathur@gmail.com
date: 2026-04-09
synthesized:
---

# Postmortem: Google Maps Integration of Queue Page - Issue #30

**Date**: 2026-04-09
**Duration**: ~45 minutes
**Objective**: Create feature specification for enabling diners to access the SKB queue from Google Maps
**Outcome**: Success — spec approved after 1 round of feedback

## Executive Summary

Created a comprehensive feature specification for Issue #30. The spec was submitted, received one round of feedback about the mock being too implementation-focused (showed HTML head tags instead of the Google Maps user experience), was revised to show the full user journey, and approved.

## Architectural Impact

**Has Architectural Impact**: No

This is a specification phase only — no code changes made. The spec proposes minor additions to the Location data model (`publicUrl`, `googlePlaceId` fields) and server-side meta tag injection in `queue-template.ts`, but these will be implemented in a subsequent technical design and implementation phase.

## Timeline of Events

### Phase 1: Context Gathering
- ✅ **Loaded issue**: Simple one-liner — "Users should be able to access the SKB queue from a google map search for the restaurant"
- ✅ **Explored codebase**: Understood queue page, URL structure, Location model, server-side rendering
- ✅ **Extracted requirements**: 7 requirements with acceptance criteria

### Phase 2: Spec Drafting
- ✅ **Created spec document**: Full template with user stories, requirements, alternatives, validation plan
- ❌ **Created UI mock**: Focused on HTML `<head>` tags instead of user-visible experience — this was the wrong abstraction level for a stakeholder-facing mock

### Phase 3: Competitor Analysis
- ✅ **Researched 6 competitors**: Yelp Guest Manager, Waitly, NextMe, Waitwhile, Reserve with Google, Waitlist Me
- ✅ **Identified key differentiator**: Full join fields (party size) from Maps link vs competitors' limited RwG forms

### Phase 4: Completeness Review
- ✅ **Mock rendered in browser**: Passed layout, typography, accessibility checks
- ❌ **Missed perspective gap**: Validated technical correctness of mock but didn't catch that it failed to communicate the user experience to a non-technical reviewer

### Phase 5: Submission
- ✅ **Evidence document, commit, PR, labels**: All completed cleanly

### Phase 6: Address Feedback
- ✅ **Redesigned mock**: 3-step user journey (Google Maps listing → tap → queue page) inside phone frames
- ✅ **Approved**: Reviewer said "looks great"

## Root Cause Analysis

### 1. **Primary Cause**
**Problem**: The initial mock showed the implementation perspective (HTML head tags, meta tags) rather than the user perspective (what a diner sees in Google Maps).
**Impact**: Required a revision round. The reviewer couldn't understand what the feature would look like.

### 2. **Contributing Factors**
**Problem**: The completeness review validated the mock technically (renders correctly, accessible, etc.) but didn't evaluate whether it communicated the user experience to a stakeholder.
**Impact**: The review phase caught form but not substance.

## What Went Wrong

1. **Mock perspective mismatch**: Built a developer-facing mock (annotated head tags) instead of a user-facing mock (Google Maps → queue page journey). Spec mocks should always show what the *user* sees, not what the *code* does.
2. **Completeness review blind spot**: The review checked rendering, accessibility, and requirement coverage but didn't ask "would a non-technical person understand what this feature looks like?"

## What Went Right

1. **Competitive research was thorough**: 6 competitors analyzed with web research, identified a genuine differentiator (full join fields from Maps vs limited RwG forms).
2. **Fast feedback turnaround**: Redesigned the mock quickly after feedback, and the new version was approved immediately.
3. **Lightweight approach**: Correctly identified that a URL-in-Google-Business-Profile approach is simpler and cheaper than Reserve with Google partnership, matching the project's scale.

## Lessons Learned

1. **Mocks must show the user journey, not the implementation**: When a feature involves an external platform (Google Maps), the mock should show what the user sees on that platform, not just what changes in our code.
2. **Stakeholder empathy in review**: During completeness review, ask "would someone who hasn't read the code understand this mock?" before submitting.

## Agent Rule Updates Made to avoid recurrence

1. No rule file updates made — these learnings are captured here for synthesis by `end-of-day-debrief`.

## Enforcement Updates Made to avoid recurrence

1. No enforcement updates needed — the feedback loop worked correctly (caught in review, fixed quickly).
