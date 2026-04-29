# Validated Patterns — sid.mathur@gmail.com

Durable judgment calls and successful unusual-but-correct decisions worth reproducing.

**Last synthesized**: 2026-04-28 (initial creation: 2 entries from issue-102 + issue-103)

---

## Confirmed entries

### [P-HIGH] When the user asks a verification-shaped question after a completion claim, dispatch a structured audit instead of replying yes/no

**Score**: 8.0
**Last seen**: 2026-04-28
**Recurrences**: 1
**First synthesized**: 2026-04-28

After shipping a fix for issue #102 and writing a confident "all six sub-bugs fixed; the iOS host stand now mirrors the website's Notify/Chat/Call model exactly" summary, Sid asked the verification-shaped follow-up *"did you address all the problems in the issue and also ensure the ios app and web app behave similarly for host and admin?"*. Instead of restating the prior "done" claim, the agent dispatched a `general-purpose` subagent with an explicit cross-check brief — *"compare A to B systematically and return a punch list of gaps with file references, capped at 25 items"* — and the audit returned 25+ real gaps the agent had missed (no sentiment selector on iOS, no per-message SMS status, no web-only chat banner, no Departed shortcut, no occupied-table chips, AddPartySheet hard-rejected blank phone, Settings missing catering phone + `menu` guest-feature toggle). The agent named the discrepancy plainly in the next reply ("I shipped a partial fix and then claimed parity — let me close the host-side gaps that match the user's same logic and flow ask"), closed the host-stand gaps in commit `f3e8b0f` (16 files / 585 insertions), and published EAS update group `f1293542` to production. Sid validated the full cadence with "wow .. youve done a /fraim good work !1" — *after* the audit→fix→polish→EAS sequence, not after the initial partial fix.

**Why it was the right call**: verification questions from the user are instructions to produce a falsifiable artifact, not social cues to reassure — the user wants the audit more than the answer, and producing the audit is what makes the next "did you really?" question worth asking.

**Trigger** (the situation that should fire this judgment): the conjunction of (a) the agent has just claimed completion in this conversation AND (b) the user's next message is verification-shaped (`did you...`, `are you sure`, `ensure X`, `make sure you do a thorough job`, `is everything covered?`). Either alone is not enough; the conjunction is the trigger.

**Action**: dispatch a `general-purpose` Agent with a structured punch-list output spec instead of replying yes/no. When the audit surfaces gaps after a "done" claim, name the discrepancy plainly in user-visible text ("earlier I claimed X, the audit found Y") and then close the gaps that match the user's actual ask, flagging out-of-scope items explicitly. The honest retraction is what keeps the next verification question worth answering.

---

### [P-MED] Re-read the relevant project rule at borderline decision points

**Score**: 5.0
**Last seen**: 2026-04-28
**Recurrences**: 1
**First synthesized**: 2026-04-28

During the issue-103 spec phase, three borderline decisions came up where the agent paused, re-read the relevant project rule, and made the correct call instead of defaulting:
1. **Single issue vs. two issues** — initial reading of project rule #13 ("no bundling") suggested two issues = two PRs. Re-read the rule's actual text: rule #13 is about *unrelated* fixes; the two mobile-fit symptoms shared one root cause (mobile-first not enforced) and one operator-feedback story. Filed one issue, called out the trade-off explicitly in the PR body. Sid approved the framing.
2. **Validation against mock vs. real surface** — almost ran Playwright validation against the static HTML mock for issue #103. Re-read project rule #18 (validation phases must run against the actual surface, not against mocks). Said so explicitly in the evidence doc instead of fabricating a green check.
3. **25-competitor scope filter** — the mentor's Phase-3 prompt loaded all 25 competitors from `fraim/config.json`, but most are kitchen tools, hotel software, and site builders. Re-read the issue scope and filtered to the 6 waitlist-relevant ones with explicit reasoning in the evidence doc.

**Why it was the right call**: rules are not just *known* — they're *applied*. The reliable failure mode for "knowledge-without-application" (already a P-MED mistake-pattern) is letting a familiar-shaped task glide past on default rule-application. The unusual-but-correct judgment was treating the rule as a *gate to pass at decision time*, not a memorized fact recalled at submission time.

**Trigger**: any of these — a borderline scope decision (single vs split), an ambiguous validation target (mock vs real surface), an unfiltered input list (25 competitors when 6 are relevant), or an exception-shaped pattern in code that contradicts the issue text.

**Action**: pause, name the relevant project rule out loud, re-open `fraim/personalized-employee/rules/project_rules.md`, and re-read the rule's literal wording (not the mental summary). Make the decision against the literal wording, document the reasoning in the evidence doc or PR body. The 30 seconds spent re-reading is the cheapest way to prevent a knowledge-without-application failure.
