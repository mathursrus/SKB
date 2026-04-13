# Mistake Patterns — sid.mathur@gmail.com

Durable record of recurring agent mistakes that have been observed and must be avoided in future work. Entries below are confirmed and active guidance.

**Last synthesized**: 2026-04-12

---

## Confirmed entries

### [P-HIGH] Parallel sub-agents must use FRAIM job commands, not custom step-by-step prompts

**Score**: 16.0
**Last seen**: 2026-04-06
**Recurrences**: 3
**First synthesized**: 2026-04-12

When delegating work to sub-agents via the Agent tool, the prompt must be the same `/fraim <job-name>` slash-command the user would give — not a custom free-form prompt with step-by-step instructions. Sub-agents have the same `CLAUDE.md`, same MCP tools, and same FRAIM discovery as the orchestrator, so they will correctly call `fraim_connect`, `get_fraim_job`, `seekMentoring`, and reach the submission phase (including PR creation) on their own. Custom prompts produce worse results: they inevitably skip steps (most commonly PR creation and FRAIM session tracking), the work is invisible on GitHub, and there is no FRAIM audit trail. After sub-agents return, the orchestrator must still call `seekMentoring` once per issue in the main thread to register completion in the FRAIM session. Do not use `isolation: "worktree"` for sub-agents producing inspectable artifacts (mocks, specs, evidence) — the auto-cleanup will delete the local copies before the user can review them.

---

### [P-HIGH] seekMentoring at every phase boundary — no phase collapse

**Score**: 12.7
**Last seen**: 2026-04-06
**Recurrences**: 2
**First synthesized**: 2026-04-12

For any FRAIM phased job, `seekMentoring` must be called with `status: "complete"` at every phase transition — even when the agent feels confident the phase is straightforward or has been effectively completed already. Collapsing phases into a single output loses the mentoring guidance for the skipped phases (which may contain skills, quality gates, and guardrails the agent would otherwise miss), breaks the FRAIM audit trail, and produces no record of phase-complete decisions. The phase response regularly contains skills (like quality checklists, validation skills, and completeness reviews) that add real value even when the agent thinks it could skip ahead. Treat phase checkpoints as mandatory, not optional.

---

### [P-HIGH] Evidence-based reasoning required for external-dependent work and load-bearing numbers

**Score**: 12.7
**Last seen**: 2026-04-10
**Recurrences**: 2
**First synthesized**: 2026-04-12

Before changing code that depends on an external system (Twilio, Stripe, OAuth, LLM API, production data) OR before writing a precise load-bearing number in a strategy document (COGS, ARPU, margin, volume, churn), gather LIVE evidence and cite its source. Live evidence means production logs, real telemetry pulls, captured request/response traces, or actual data from the source of record. Passing tests that mock the external system do NOT verify such a fix — state this explicitly rather than implying the tests are sufficient. Precise-looking numbers (e.g., "600 SMS/month") must either show their derivation OR be explicitly labeled as placeholder estimates that block downstream decisions until real data arrives. Two instances of this pattern landed in master within the same day (2026-04-10: a Twilio voice IVR "fix" shipped without production logs, and a business plan COGS claim built on a 10x-underestimated SMS volume) — both were caught by the user within hours because the changes reached reality and failed. This is a systemic discipline gap, not a one-off.

---

### [P-MED] Feature branch push is not the deliverable — the PR is

**Score**: 5.0
**Last seen**: 2026-04-06
**Recurrences**: 1
**First synthesized**: 2026-04-12

Pushing a feature branch to `origin` without creating a PR means the work is invisible on GitHub — there is no review surface, no CI status, no link from the issue. The deliverable is the PR, not the branch. Every submission-phase completion summary must explicitly verify: (1) branch pushed, (2) PR created, (3) PR linked to the issue. When delegating to sub-agents, include PR creation in the sub-agent's mandate unless the user has explicitly deferred it.

---

### [P-MED] Different vendor API surface = new spike, even if the same SDK is familiar

**Score**: 5.0
**Last seen**: 2026-04-09
**Recurrences**: 1
**First synthesized**: 2026-04-12

Familiarity with one of a vendor's APIs does not transfer to another surface from the same vendor. Twilio SMS experience does not transfer to Twilio Voice TwiML (different XML schema, silent-failure modes on invalid nesting/attributes, different error channel). Before claiming "no spike needed" for an unfamiliar surface, inventory: (a) is the request/response shape different from what you've seen? (b) are failure modes observable through normal HTTP status codes, or do errors manifest as silent behavior? (c) can you test through the actual vendor (e.g., via ngrok + curl) before asking the user to trigger it? If any answer is "I'm not sure," spike first.

---

### [P-MED] Voice UX requires caller confirmation loops and a human fallback — do not mirror web form constraints to voice

**Score**: 5.0
**Last seen**: 2026-04-09
**Recurrences**: 1
**First synthesized**: 2026-04-12

When designing a voice/IVR flow: (a) read back any auto-detected data (Caller ID, DTMF-parsed numbers) and offer the caller a chance to verify or use an alternative; the caller cannot see what the system captured. (b) Do not mirror web-form constraints to voice — DTMF with `finishOnKey="#"` supports multi-digit entry naturally, so there is no reason to cap party size at a single digit. (c) Always provide a human fallback for edge cases the IVR cannot handle (e.g., large parties, blocked Caller ID) — transfer to the front desk rather than hanging up. (d) Cross-check every noun in the user-facing prompt against the TwiML: if the prompt says "after the beep," the TwiML must `<Play>` a beep.

---

### [P-MED] Mocks must show the user journey on the external platform, not the implementation details

**Score**: 5.0
**Last seen**: 2026-04-09
**Recurrences**: 1
**First synthesized**: 2026-04-12

For any feature spec that involves an external platform (Google Maps, WhatsApp, Stripe checkout, a POS system), the mock must show what the USER sees on that platform — not what the code emits. Annotated HTML `<head>` tags, JSON-LD, or server-side rendering outputs are developer-facing, not stakeholder-facing. During completeness review, apply the test: "would a non-technical reviewer understand what this feature looks like without reading the code?" If the answer is no, the mock is at the wrong abstraction level.

---

### [P-MED] Verify the audience direction of a structured file before writing to it

**Score**: 5.0
**Last seen**: 2026-04-12
**Recurrences**: 1
**First synthesized**: 2026-04-12

When writing to a structured file that is part of a learning system, template, or documentation schema (FRAIM L1 files, evidence templates, retrospective templates, spec templates), read the file's semantic direction before writing. Specifically ask: (a) who is the AUDIENCE of this file — the agent, the user, or a reviewer? (b) what DIRECTION is the content flowing — is the agent writing memory for itself, or writing advice for someone else? (c) does the FILE HEADER or a template comment tell me the expected framing (first-person notes to self, second-person coaching, third-person reference)? Getting this wrong once will contaminate the file with content pointing in the wrong direction, which the user must then correct. Example failure mode: wrote `sid.mathur@gmail.com-manager-coaching.md` as "agent-memory about user instructions" in first-synthesis 2026-04-12, when the correct framing is "agent-written coaching notes FOR the user to read about themselves." Fix: before writing any structured learning/template file, explicitly state to self what the audience and direction are, and verify against the file header or parent template.

---

### [P-LOW] Read issue requirements literally — don't default to existing code patterns when they contradict the ask

**Score**: 3.0
**Last seen**: 2026-04-08
**Recurrences**: 1
**First synthesized**: 2026-04-12

When an issue says "users should specify X," X is required unless the issue explicitly says otherwise. Do not let existing code patterns (e.g., an optional field elsewhere in the codebase) override the literal reading of the issue. When a requirement contradicts a code pattern, the requirement wins — or, if the contradiction is load-bearing, flag it for the user before proceeding.
