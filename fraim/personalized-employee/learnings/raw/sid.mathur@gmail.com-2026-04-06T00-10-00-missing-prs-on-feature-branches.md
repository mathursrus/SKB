---
author: sid.mathur@gmail.com
date: 2026-04-06
context: feature-specification for issues 2, 4, 6, 8
---

# Coaching Moment: missing-prs-on-feature-branches

## What happened

When launching 4 parallel sub-agents to write feature specs for issues #2, #4, #6, and #8, the orchestrating agent explicitly instructed each sub-agent "Do NOT create a PR." The intent was to create PRs in the main thread afterward, but the agent never did — it moved on to other jobs instead. The user flagged that all 4 branches had been pushed to origin with no PRs created, making the spec work invisible on GitHub with no review surface.

## What was learned

Feature branches without PRs are invisible work — the PR is the deliverable, not the branch push. Sub-agent prompts for spec or implementation work must always include PR creation unless the user explicitly defers it.

## What the agent should have done

Either (a) included `gh pr create` in each sub-agent's prompt so PRs were created atomically with the branch push, or (b) immediately after all 4 agents returned, created the 4 PRs in the main thread before reporting "all specs done." The agent should have verified PRs existed as part of its completion summary checklist: branches pushed ✓, PRs created ✓, PRs linked to issues ✓.
