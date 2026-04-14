---
author: sid.mathur@gmail.com
date: 2026-04-13
context: issue-37 spec + technical-design workflow
synthesized:
---

# Retrospective — Issue #37: Waitlist transparency, host chat/call, table on seat

## Summary
- Three additive waitlist changes specced, mocked, designed, and approved on PR #38.
- Workflows completed: `feature-specification` → `technical-design`.
- Feedback rounds: 0 (approved on first pass).

## What Went Well
- **Spec + mocks first, then RFC** — the three HTML/CSS mocks captured every UX decision before any architecture work, so the RFC could reference them instead of re-deriving the UX.
- **Codebase discovery before design** — dispatching the Explore agent against the real SKB repo (rather than the `SKB - Issue 30` YAML snapshot directory) surfaced the right file paths, existing `validateTwilioSignature` middleware, and the fact that the diner page already exists. The RFC became an enhancement plan, not a greenfield proposal.
- **Traceability matrix caught four gaps** — running the R1→R21 check surfaced R6 (ack endpoint), R15 (Seated tab field), R19 (a11y), and R21 (chat pagination) that the first-pass RFC had missed. All four were patched in-place before the matrix verdict.
- **Reuse over invention** — the RFC reuses `GET /queue/status?code=X` instead of inventing `/w/<token>`, and reuses `POST /host/queue/:id/remove` instead of inventing `/seat`. Smaller change surface, fewer tests to churn.

## What Went Poorly
- **First-pass RFC missed four requirements silently** — R6, R15, R19, R21 weren't in the first commit. Only the explicit traceability matrix caught them. Suggests the spec-to-RFC translation needs a pass-one checklist keyed off R-tags, not just a vibe-check.
- **Direction on which repo to use wasn't pre-declared** — the working directory was `SKB - Issue 30` (a sibling workspace with YAML snapshots, not a git repo), and the canonical clone at `C:/Users/sidma/Code/SKB` had to be discovered mid-task. A project-level rule ("deliverables land in `C:/Users/sidma/Code/SKB`, workspace dirs are ephemeral") would have skipped the ambiguity.
- **Issue number confusion** — directory name "SKB - Issue 30" suggested issue 30, but #30 was closed and about a different feature. Had to pause and ask before creating a new issue. The directory naming convention is misleading when the workspace outlives the issue it was created for.

## Root Causes
- **Gap in first-pass RFC**: I translated the spec section by section, not requirement by requirement. When R6 and R21 lived inside paragraph prose rather than standalone bullets, they slipped past. The fix is a mechanical R-tag checklist at drafting time.
- **Repo ambiguity**: FRAIM's `fraim_connect` schema expects a repo URL. I passed `local:SKB-Issue-30` because there was no git repo — that's a tell that should have triggered "find the canonical clone" earlier.

## Key Learnings
- When a spec has numbered requirements, the RFC's first draft should have a one-to-one file-local grep check against the requirement IDs before calling the draft done.
- Workspace directories named "`<project> - Issue <n>`" are scratch spaces. The canonical git tree lives elsewhere — check for it before any commit-producing work.
- Twilio inbound webhooks are cheap to add when `validateTwilioSignature` already exists; don't over-spike infrastructure the repo already solved.

## Prevention Measures
- **New habit**: At the end of drafting any RFC against a requirement-numbered spec, run `grep -c "R[0-9]" rfc.md` and confirm every R-tag from the spec appears at least once.
- **New habit**: Before calling `fraim_connect` with a non-git URL, run `git rev-parse --show-toplevel` in the parent Code directory to see if a sibling canonical clone exists.
- **Suggestion for FRAIM**: the `design-completeness-review` phase could emit a warning when the RFC contains fewer R-tag citations than the spec defines — this would have caught the four gaps before the matrix stage.

## Feedback Analysis
- No reviewer feedback to analyze — PR #38 approved on first review. The four-gap catch was self-surfaced via the traceability check, not reviewer-surfaced.

## Artifacts
- Spec: `docs/feature-specs/37-waitlist-transparency-chat-table.md`
- Mocks: `docs/feature-specs/mocks/37-*.html` (3 files)
- RFC: `docs/rfcs/37-waitlist-transparency-chat-table.md`
- Evidence: `docs/evidence/37-spec-evidence.md`, `docs/evidence/37-technical-design-evidence.md`
- PR: https://github.com/mathursrus/SKB/pull/38
- Commits on `spec/37-waitlist-transparency-chat-table`: `beef1a2` (spec), `3702c1e` (RFC first pass), `5169774` (RFC gap fixes + evidence)
