---
author: sid.mathur@gmail.com
date: 2026-04-06
context: feature-specification for issues 2, 4, 6, 8
---

# Coaching Moment: keep-worktrees-until-completion

## What happened

Sub-agent worktrees were automatically cleaned up after agents finished, deleting local copies of the spec work. The specs only exist on remote branches now. The user wanted to inspect mocks and local artifacts but they're gone. The auto-cleanup happened because the Agent tool's worktree isolation mode cleans up by default when the agent completes.

## What was learned

Don't use worktree isolation for sub-agents doing FRAIM work that produces local artifacts (mocks, specs, evidence). Keep the work on the main worktree or on persistent local branches so the user can inspect results before work-completion is run.

## What the agent should have done

Either (a) not used `isolation: "worktree"` — let sub-agents work on regular local branches in the main repo, or (b) verified all artifacts were inspectable before allowing cleanup. The user should be able to browse mocks, specs, and evidence locally until they explicitly approve work-completion.
