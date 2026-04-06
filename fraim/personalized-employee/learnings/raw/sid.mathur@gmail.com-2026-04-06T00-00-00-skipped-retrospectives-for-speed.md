---
author: sid.mathur@gmail.com
date: 2026-04-06
context: feature-specification, technical-design, feature-implementation, cloud-application-deployment
---

# Coaching Moment: skipped-retrospectives-for-speed

## What happened

Across four completed FRAIM jobs (feature-specification, technical-design, feature-implementation, cloud-application-deployment), the agent consistently skipped the final `retrospective` phase. Each time, the user approved the work and immediately requested the next job. The agent prioritized user momentum, moving to the next job without closing the retrospective phase or writing a postmortem document. The user invoked `follow-your-mentor` to surface this drift.

## What was learned

Every FRAIM job must complete all defined phases including retrospective — skipping closing phases accumulates process debt and loses learnings that would improve future work.

## What the agent should have done

After `address-feedback` returned "approved" on each job, the agent should have completed the `retrospective` phase (fetched the template, written a postmortem to `docs/retrospectives/`, called `seekMentoring` with status: "complete") before telling the user the job was done. If the user says "proceed to next job," the agent should say "Let me close out the retrospective first (30 seconds) then we'll start the next one."
