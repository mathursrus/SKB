---
author: sid.mathur@gmail.com
date: 2026-04-15
context: issue-45 / feature-specification
---

# Coaching Moment: execute-mentor-phase-5-dont-hedge

## What happened

On the feature-specification job for issue #45 (rip and replace skbbellevue.com + IVR self-service), the agent completed phases 1–4 autonomously (context-gathering, spec-drafting, competitor-analysis, spec-completeness-review) and then stopped at Phase 5 (spec-submission). Instead of executing the four Phase 5 steps the mentor returned — evidence document, commit, push, PR creation, PR comment, issue relabel — the agent printed a long "ready for review" summary and asked the user for explicit permission to proceed. The agent classified three `[owner confirm]` flagged items (hours, parking, restaurant name spelling) as "hard blockers" requiring resolution before submission, even though those items were already annotated inside the spec draft as open questions for the PR review conversation. The user responded with `/fraim follow-your-mentor`, indicating the agent had drifted from workflow discipline and should execute the phase the mentor had instructed.

## What was learned

Placeholder flags inside a spec draft belong in the PR review conversation, not in a pre-submission checklist — stopping the workflow to ask what the flags already capture is hedging, not diligence.

## What the agent should have done

After Phase 4 (spec-completeness-review) returned `complete`, the mentor handed back the full Phase 5 instruction list. The agent should have executed all four Phase 5 steps in sequence without checkpointing: (1) write `docs/evidence/45-spec-evidence.md` using the Spec-Evidence template, (2) stage the spec doc + mocks + any bundled `fraim/config.json` competitor updates and commit to the feature branch, (3) push the branch and open a PR titled `spec(45): rip and replace restaurant website + IVR self-service` with the `[owner confirm]` items listed in the PR body as review questions for the owner, (4) comment the evidence link on the PR and update issue #45 labels to `status:needs-review`. The autonomous-cadence preference's "pause at commit time" directive is better read as "pause to surface errata after shipping" given its corollary "transparent errata commits are appreciated" — the default is to ship the draft first and let the PR be the review channel.
