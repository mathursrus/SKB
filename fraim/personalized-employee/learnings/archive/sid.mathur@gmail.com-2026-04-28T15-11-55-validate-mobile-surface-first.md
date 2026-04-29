---
author: sid.mathur@gmail.com
date: 2026-04-28
context: issue-102 / analyze-why-you-messed-up
---

# Coaching Moment: validate-mobile-surface-first

## What happened

For issue #102, I proceeded from the approved RFC and standing work list, both of which named only web/server files, and I implemented the bug fixes entirely in `public/*` and `src/*`. The user later pointed out that none of the changes touched the real iOS app in `ios/`, which is present in this repo and contains matching waiting/chat/staff surfaces. I then had to stop and analyze why I had spent hours validating the wrong client surface.

## What was learned

When an issue or user request refers to a mobile app or iOS behavior, inspect the `ios/` surface before coding and do not let an incomplete design artifact override the repository's actual client structure.

## What the agent should have done

Before starting feature implementation, I should have inspected `ios/app` and `ios/src` for the affected flows, compared that against the RFC/work-list file list, and flagged the scope mismatch immediately when the approved design omitted the iOS surface for a "mobile app bugs" issue.
