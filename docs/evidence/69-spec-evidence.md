# Feature Specification: Multi-tenant SMS/voice routing with a single shared OSH toll-free number

Issue: #69
PR: _not yet opened — spec lives on master branch alongside recent guest-capability-toggle work; will open PR on commit_

## Completeness Evidence

- Issue tagged with label `phase:spec`: pending (no label applied yet — will add on submission)
- Issue tagged with label `status:needs-review`: pending
- All specification documents committed/synced to branch: No — held for user confirmation before commit per established cadence

### Deliverables

- `docs/feature-specs/69-shared-sms-number-multitenant.md` — full feature spec (12 sections including Why, Personas, Desired Outcome, UX, 13 SHALL-style requirements with Given/When/Then acceptance, Compliance, Validation Plan, Alternatives, Competitive Analysis, Design Standards, Open Questions)
- `docs/feature-specs/mocks/69-admin-sms-settings.html` — interactive mock of the admin Settings → Messaging panel (editable sender name, live SMS preview, read-only shared-number card, collapsible upgrade options)

### Customer Research

| Customer Research Area | Sources of Information |
|---|---|
| How competitors handle multi-tenant SMS sender numbers | Waitlist Me support docs (`waitlist.me/support/premium-area-code/`), Waitwhile help center (`help.waitwhile.com`), Yelp Twilio case study (`customers.twilio.com/en-us/yelp`), NextMe and TablesReady public pages |
| Carrier policy for ISV / multi-business sending | Twilio Toll-Free Verification docs, Twilio A2P 10DLC ISV guidance, Telnyx "ISVs & 10DLC" help article (`support.telnyx.com/en/articles/5593977-isvs-10dlc`) |
| TCPA and CTIA requirements for US SMS | CTIA Messaging Principles, general TCPA consent/opt-out practice |
| Existing OSH codebase SMS architecture | `src/routes/sms.ts`, `src/services/sms.ts`, `src/services/chat.ts` (inbound matcher, lines 142-171), `src/services/smsTemplates.ts`, `src/types/queue.ts` (Location schema, lines 41-76), `.env.example` |
| Voice/IVR spec history and patterns | `docs/feature-specs/31-phone-system-integration-of-wait-list.md`, `docs/feature-specs/51-fully-multi-tenant-system.md` |

### Load-bearing claim and its support

Per manager-coaching guidance (P-HIGH on pre-commit load-bearing-claim check):

> *"What's the one number or claim in this work that would sink the whole thing if it were wrong?"*

The load-bearing claim is: **"Twilio's Toll-Free Verification flow supports an ISV/SaaS platform texting on behalf of many unrelated small businesses without requiring per-tenant verification."**

Supporting evidence:
- Twilio TFV ISV documentation explicitly describes this use case.
- Telnyx and industry sources confirm toll-free is the recommended ISV path (vs. 10DLC's strict one-brand-per-campaign rule).
- Waitwhile offers shared-sender on non-Enterprise tiers, consistent with this pattern in production.

Hedge (surfaced in spec §12 Open Questions and §8 Validation Plan):
- TFV is still a human-reviewed approval — not 100% automatic; expect possible one revision cycle, which is standard for any carrier review. One search source also hedged generically about toll-free content restrictions, but on re-read those restrictions are about what you can *send* (no spam, no gambling, etc.), not structural restrictions on the ISV-on-behalf pattern itself.
- Sky-falls fallback (not expected): if the ISV submission is repeatedly denied, fall back to per-tenant 10DLC upgrade path (Waitlist Me's model — equivalent to status quo, not worse).

### Major revision during Phase 3

Initial draft (Phase 2) proposed a shared A2P 10DLC long code under one OSH brand. Phase 3 competitor/carrier research revealed this violates carrier policy (one brand per campaign). Pivoted primary mechanism to Toll-Free Verification before spec was submitted. This is the kind of load-bearing error the pre-commit check is designed to catch, and it was caught pre-commit.

### Feedback History

| PR Comment | How Addressed |
|---|---|
| _(none yet — spec not yet submitted for human review)_ | — |

## Continuous Learning

| Learning | Agent Rule Updates |
|---|---|
| "Shared sender for ISV SaaS platforms is a toll-free (TFV) problem, not a 10DLC problem" is a non-obvious compliance fact that bit during Phase 2 and was corrected in Phase 3. Worth recording as a durable project-level learning for future telephony specs. | Candidate for a new entry in `fraim/personalized-employee/learnings/` or a project rule. Will propose during end-of-day debrief rather than write unilaterally here. |
| Phase 3 competitor-analysis research meaningfully reshaped the spec — not just padding. Evidence that the "lead with simplicity but verify carrier/compliance against primary sources" pattern is load-bearing for telephony work. | Reinforces existing preference entry on "prefer simplicity but spike and verify." No new rule needed. |

## Validation

- Spec self-review per Phase 4 (spec-completeness-review): R1–R13 all traced to acceptance criteria; edge cases enumerated; compliance section complete with TFV + 10DLC-upgrade + TCPA + CTIA; design standards documented.
- Mock file syntax-checked by hand; self-contained HTML+CSS+vanilla JS — will render standalone on `file://`.
- No code changes in this spec phase; no test suite runs required.

## Quality Checks

- Deliverables complete: spec + mock + evidence doc.
- Documentation clear and professional; no vague "some changes" language.
- Spec is internally consistent post-revision (verified by grep for stale "10DLC" references; one leftover in §6.1 edge cases was fixed).
- Ready for human review once committed.

## Phase Completion

- Phase 1 context-gathering: complete. Existing SMS code reviewed; related spec #51 and #31 reviewed; user's working preferences and manager-coaching notes loaded.
- Phase 2 spec-drafting: complete. Spec and mock written.
- Phase 3 competitor-analysis: complete. Major revision applied (10DLC → TFV) based on research findings.
- Phase 4 spec-completeness-review: complete. Internal consistency, coverage, and load-bearing claim verified.
- Phase 5 spec-submission: this document; held pending user confirmation before git commit + PR creation per the established "pause at side-effect phases" cadence.
