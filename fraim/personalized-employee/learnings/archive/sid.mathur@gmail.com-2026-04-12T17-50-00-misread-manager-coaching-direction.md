---
author: sid.mathur@gmail.com
date: 2026-04-12
context: end-of-day-debrief job
---

# Coaching Moment: misread-manager-coaching-direction

## What happened

During the `end-of-day-debrief` job on 2026-04-12, the agent wrote the `sid.mathur@gmail.com-manager-coaching.md` L1 file with content framed as "durable record of this user's explicit coaching signals and intervention patterns as a manager" — i.e., recording what the user (manager) has coached the agent about, from the agent's perspective. Entries included things like "when the user invokes follow-your-mentor, acknowledge specifically and recover" and "when the user signals 'be bold', take opinionated positions". The user corrected this with: "manager coaching is supposed to be coaching for me the user" — clarifying that `manager-coaching.md` is where the AGENT writes observational coaching notes FOR the USER to help them improve as a manager/founder/builder, not where the agent records guidance it received from the user.

## What was learned

The three L1 files have distinct audiences and directions: `preferences.md` records user tastes for the agent's own reference (agent → agent memory about user); `mistake-patterns.md` records agent errors for the agent's own avoidance (agent → agent memory about agent); `manager-coaching.md` records the agent's observational coaching FOR the user based on patterns it sees in how the user operates (agent → user). Confusing manager-coaching with "the user's coaching of the agent" inverts the whole purpose of the file and makes it redundant with mistake-patterns.

## What the agent should have done

Read the semantic of "manager-coaching" more carefully — "coaching" in agent-to-user SaaS products typically means advice going TO the coaching target, not FROM them. When the phase-2 analyze instructions said "User chose job Y at stage Z, intervention patterns → manager-coaching", the correct interpretation is "observations about how the user intervenes in their own process that the AGENT would offer back to the user as coaching", not "record of the user's intervention instructions to the agent." Before writing, the agent should have asked: "is this file's content for the agent to read about the user, or for the user to read about themselves?" The answer is the latter, and the content should be framed in second person ("You consistently...", "Your pattern of...") rather than third person ("User does X...").
