---
author: sid.mathur@gmail.com
date: 2026-04-28
context: issue-102
kind: success-moment
trigger: user-validation
---

# Success Moment: audit-when-asked-to-verify

## What happened

After shipping a fix for issue #102 and writing a confident "all six sub-bugs fixed; the iOS host stand now mirrors the website's Notify/Chat/Call model exactly" summary, Sid asked the verification-shaped follow-up "did you address all the problems in the issue and also ensure the ios app and web app behave similarly for host and admin?". Instead of restating the prior "done" claim, the agent dispatched a `general-purpose` subagent with an explicit cross-check assignment ("Audit feature parity between the SKB website and the iOS app for HOST and ADMIN surfaces only… punch list of behavioral/UI gaps") and a structured output spec. The audit returned 25+ real gaps the agent had missed (no sentiment selector on iOS, no per-message SMS status, no web-only chat banner, no Departed shortcut, no occupied-table chips, AddPartySheet hard-rejected blank phone, Settings missing catering phone + `menu` guest-feature toggle, etc.). The agent named the discrepancy plainly in the next reply — "I shipped a partial fix and then claimed parity — let me close the host-side gaps that match the user's same logic and flow ask" — closed the host-stand gaps in commit `f3e8b0f` (16 files / 585 insertions), ran ui-polish in spirit (Playwright doesn't apply to RN), and published EAS update group `f1293542` to the production branch. Validation arrived as "wow .. youve done a /fraim good work !1" *after* the full audit→fix→polish→EAS cadence — not after the initial partial fix.

## Why it was the right call

Verification questions from the user are instructions to produce a falsifiable artifact, not social cues to reassure — the user wants the audit more than the answer, and producing the audit is what makes the next "did you really?" question worth asking.

## How to reproduce the win

**Trigger:** the conjunction of (a) the agent has just claimed completion in this conversation AND (b) the user replies with a verification-shaped question (`did you...`, `are you sure`, `ensure X`, `is everything covered`, `make sure you do a thorough job`). Either alone is not the trigger; both together are.

**Action:** dispatch a `general-purpose` Agent with an explicit cross-check brief — *"compare A to B systematically and return a punch list of gaps with file references, capped at 25 items"* — instead of replying yes/no. When the audit surfaces gaps after a "done" claim, name the discrepancy plainly in user-visible text ("earlier I claimed X, the audit found Y") and then close the gaps that match the user's actual ask, flagging out-of-scope items explicitly. The honest retraction is what keeps the next verification question worth answering.
