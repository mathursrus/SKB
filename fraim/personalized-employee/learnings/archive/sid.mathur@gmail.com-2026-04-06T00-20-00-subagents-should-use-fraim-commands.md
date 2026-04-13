---
author: sid.mathur@gmail.com
date: 2026-04-06
context: feature-specification for issues 2, 4, 6, 8
---

# Coaching Moment: subagents-should-use-fraim-commands

## What happened

When parallelizing spec work for issues #2, #4, #6, and #8, the orchestrating agent wrote custom free-form prompts for each sub-agent describing what to do step-by-step. This bypassed the entire FRAIM job system — sub-agents never called `fraim_connect`, `get_fraim_job`, or `seekMentoring`. The result was specs that looked correct but had no FRAIM tracking, missed PR creation (which the FRAIM submission phase would have caught), and lost mentoring guidance from intermediate phases. The user asked: "why not just give them the same /fraim commands that I give me?"

## What was learned

Sub-agents should receive the same FRAIM job invocations the user gives — `/fraim issue-preparation` then `/fraim feature-specification issue N` — so they follow the full phased workflow including submission with PR creation, rather than ad-hoc instructions that inevitably miss steps.

## What the agent should have done

Prompted each sub-agent with exactly: `/fraim feature-specification issue 2` — the same command the user would give. The sub-agent has the same CLAUDE.md, same MCP tools, same FRAIM discovery. It will figure out `fraim_connect`, `get_fraim_job`, `seekMentoring`, and the submission phase (including PR creation) on its own — the same way the orchestrating agent does. Don't treat sub-agents as dumb executors that need hand-holding with custom step-by-step instructions. They are the same agent with the same capabilities. Custom prompts do more work and get worse results.
