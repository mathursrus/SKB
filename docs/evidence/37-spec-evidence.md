# Spec Evidence — Issue #37

## Summary
- **Issue:** [#37](https://github.com/mathursrus/SKB/issues/37) — Waitlist: customer full-list view, host chat/call, table number on seat
- **Workflow:** feature-specification
- **Branch:** `spec/37-waitlist-transparency-chat-table`
- **Author:** sid.mathur@gmail.com
- Three additive changes captured: (1) customer-facing live waitlist view in the Waitly style, (2) host per-party Chat + Call row actions alongside existing Custom SMS/Custom Call, (3) Seat action captures a table number.

## Work Completed

### Files created
- `docs/feature-specs/37-waitlist-transparency-chat-table.md` — full spec with Why/What/UX, 21 SHALL-tagged requirements (R1–R21), Given/When/Then acceptance criteria, edge cases, compliance analysis, competitive analysis, design standards note, and rollout/kill criteria.
- `docs/feature-specs/mocks/37-customer-waitlist.html` — mobile customer view: header card (position, promised, live wait), full waitlist with self-row highlighted, `Table ready` flip-state, seated terminal state. Live tick on elapsed wait via inline JS.
- `docs/feature-specs/mocks/37-host-party-actions.html` — host Waiting tab with Seat / Notify / **Chat (new)** / **Call (new)** / Custom SMS / Custom Call / No-show buttons, Chat slide-over with thread + quick replies + composer, unread badge, disabled-state row for parties without a phone.
- `docs/feature-specs/mocks/37-host-seat-dialog.html` — Seat Party modal: party summary, required Table # input, recent-table quick-pick chips (with an `occupied` chip example), conflict error state, state toggler for demo (Empty / Valid / Conflict).
- `docs/evidence/37-spec-evidence.md` — this document.

### Approach
- Read the host-stand state snapshots from the `SKB - Issue 30` workspace (`host-state1-data-available.yml`, `host-state2-dynamic-selected.yml`, `prod-phase2-before-toggle.yml`, `prod-01-login-page.yml`) to ground the spec in the real host-stand structure (`#, Name, Size, Phone, Promised, Waiting` + tabs Waiting/Seated/Complete, Manual/Dynamic ETA, PIN unlock).
- Drafted 21 requirements with `Rn` traceability tags and Given/When/Then acceptance criteria, split across customer view (R1–R8), host Chat/Call (R9–R13), Seat → table # (R14–R18), and cross-cutting NFRs (R19–R21).
- Open questions recorded under `Open Questions` (OQ1–OQ4) — full-list vs ahead-only, last-name privacy, call outcome prompt, canonical vs learned table chips.
- Design standards: generic UI baseline (no project-specific system in `fraim/config.json`). Palette keyed off the existing Host Stand dark theme so the new Chat/Call buttons nest visually with the existing Seat/Notify/Custom SMS/Custom Call buttons.
- Competitive analysis compares Waitly (direct reference), Yelp Waitlist / SeatMe, NextMe, and OpenTable GuestCenter. Full-list customer view matches Waitly. Chat + Call row actions bring parity with Yelp/NextMe. Seat → table # closes a gap vs Yelp Waitlist.
- Compliance: TCPA (SMS consent already captured at check-in, no new opt-in needed), WCAG 2.1 AA, PII minimization on the public list (first name + last initial only). No HIPAA/SOC2/PCI/GDPR triggers.

### Testing / validation
- Started a local HTTP server (`python -m http.server 8731`) serving the mocks directory and opened each mock in Playwright Chromium.
- **37-customer-waitlist.html** — renders the Waiting state by default. Header shows `#3 of 7`, Patel party of 4, promised 6:42 PM, waiting 08:12 ticking. List shows 7 rows, position-sorted, self-row (Patel, S.) highlighted with amber left-border + subtle fill + `(you)` annotation. State toggler switches to `Table ready` (green) and `Seated (terminal)`.
- **37-host-party-actions.html** — renders the Waiting tab with three rows: Kim/Jae (populated phone, Chat shows red `2` unread badge), Nguyen/Thao (populated), Walk-in (no phone — Notify/Chat/Call/Custom SMS/Custom Call disabled with "No phone number on file" tooltip). Chat button opens right-side slide-over with thread, quick replies (`Your table is almost ready`, `Need 5 more minutes?`, `We lost you — still here?`), and composer.
- **37-host-seat-dialog.html** — renders Seat Party modal with Patel party summary, empty numeric input with placeholder, recent-tables chips (`12, 14, 7 (occupied), 22, 5`), primary button disabled until a table is entered. State toggler switches to `Valid` (14 filled, button reads `Seat at table 14`) and `Conflict` (red inline alert `Table 12 is occupied by Kim, Jae` with explicit `Seat anyway` override).
- No P0/P1 issues. One P2: customer mock emits a favicon 404 (non-blocking; add favicon before launch if the mock is reused beyond the spec).
- Local HTTP server stopped after validation.

## Validation

| Check | Result |
|---|---|
| Mocks exist for every UI surface in spec | PASS (3/3) |
| Mocks render in a real browser (not Markdown) | PASS |
| Every requirement has Given/When/Then acceptance criteria | PASS (R1–R21) |
| Edge cases documented | PASS (position 1, expired token, missing phone, occupied table override, escape cancels seat dialog) |
| Compliance section present | PASS (Section 4) |
| Competitive Analysis section present | PASS (Section 5, 4 competitors) |
| Design Standards Applied section present | PASS (Section 5.1) |
| Open questions enumerated | PASS (OQ1–OQ4) |

## Quality Checks

- All deliverables listed above are on disk and were validated in-browser.
- Spec avoids implementation details (DB schemas, library choices, transport selection) except where user-visible.
- No vague requirements — forbidden words (`fast`, `appropriate`, `intuitive`) do not appear unqualified.
- Every requirement is individually testable and tagged `Rn`.
- Non-goals explicitly listed so downstream scope creep is bounded.

## Phase Completion
- ✅ context-gathering
- ✅ spec-drafting (21 requirements + Given/When/Then acceptance + error states + design standards section)
- ✅ competitor-analysis (Waitly, Yelp Waitlist, NextMe, OpenTable)
- ✅ spec-completeness-review (all four checks PASS)
- ✅ spec-submission (branch + PR created, this evidence doc attached)
- ⏸ address-feedback — pending human review
- ⏸ retrospective — post-review
