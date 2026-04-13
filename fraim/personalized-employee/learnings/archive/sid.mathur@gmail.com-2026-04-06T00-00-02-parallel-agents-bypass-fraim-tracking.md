---
author: sid.mathur@gmail.com
date: 2026-04-06
context: feature-specification for issues 2, 4, 6, 8
---

# Coaching Moment: parallel-agents-bypass-fraim-tracking

## What happened

When the user asked to spec issues #2, #4, #6, and #8 in parallel, the agent launched four sub-agents in isolated worktrees. Each sub-agent wrote a high-quality spec and pushed a feature branch, but none called `seekMentoring` or followed the FRAIM `issue-preparation` → `feature-specification` phased workflow. The sub-agents had no FRAIM session context (sessionId, job tracking), so FRAIM has no record of these specs being created.

## What was learned

Parallelism via sub-agents sacrifices FRAIM phase tracking unless the orchestrating agent calls `seekMentoring` in the main thread to record the work after sub-agents complete.

## What the agent should have done

After all four sub-agents returned, the orchestrating agent should have called `seekMentoring` once per issue in the main thread (e.g., `jobName: "feature-specification", issueNumber: "2", currentPhase: "spec-submission", status: "complete"`) to register the completed specs with FRAIM's tracking system. This preserves parallelism while maintaining the audit trail.
