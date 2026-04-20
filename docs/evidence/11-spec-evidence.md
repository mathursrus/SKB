# Feature Specification: Rich Guest Menu Ordering
Issue: #11
PR: Not created

## Completeness Evidence

- Issue tagged with label `phase:spec`: No
- Issue tagged with label `status:needs-review`: No
- All specification documents committed/synced to branch: No

| Customer Research Area | Sources of Information |
|---|---|
| Original problem statement | GitHub issue #11 |
| Existing dining lifecycle | `docs/feature-specs/24-dining-party-lifecycle.md`, `public/host.html`, `public/host.js`, `src/services/dining.ts` |
| Existing admin/menu implementation | `public/admin.html`, `public/admin.js`, `src/types/queue.ts`, `src/routes/host.ts`, `src/services/locations.ts`, `public/templates/saffron/menu.html`, `public/templates/slate/menu.html` |
| Project constraints | `fraim/personalized-employee/rules/project_rules.md` |
| Competitive landscape | Current official product pages for Waitwhile, Waitlist Me, TablesReady, BentoBox, and Popmenu reviewed on 2026-04-20 |
| Mock validation | Local browser render review of `docs/feature-specs/mocks/11-admin-rich-menu-builder.html`, `docs/feature-specs/mocks/11-guest-ordering.html`, `docs/feature-specs/mocks/11-host-party-order-detail.html` |

| PR Comment | How Addressed |
|---|---|
| No PR comment yet | User requested local feature-spec creation only; no branch sync, PR creation, or review submission was performed |

## Validation

- Drafted `docs/feature-specs/11-rich-guest-menu-ordering.md` with:
  - user problem and desired outcome
  - user experience flow for admin, guest, and host
  - design standards applied
  - traceable SHALL requirements
  - acceptance criteria
  - explicit error states
  - compliance requirements inferred from project context
  - validation plan
  - alternatives and competitive analysis
- Created three HTML mocks:
  - `docs/feature-specs/mocks/11-admin-rich-menu-builder.html`
  - `docs/feature-specs/mocks/11-guest-ordering.html`
  - `docs/feature-specs/mocks/11-host-party-order-detail.html`
- Opened the mocks in a browser through a temporary local HTTP server and confirmed they rendered without blocking overflow/clipping issues in the checked viewports.
- Recorded one non-blocking UI note during review: the guest mock's bottom action bar is visually dominant on the first mobile fold and should be tuned during implementation.

## Quality Checks

- Deliverables created: Yes
- Spec includes a compliance section: Yes
- Spec includes `Design Standards Applied`: Yes
- Spec documents the intentional v1 deferral of kitchen routing: Yes
- Original issue coverage documented: Partial, with kitchen queue explicitly deferred rather than silently omitted

## Phase Completion

- `context-gathering`: completed
- `spec-drafting`: completed
- `competitor-analysis`: completed
- `spec-completeness-review`: completed
- `spec-submission`: partially completed locally via this evidence document

## Continuous Learning

| Learning | Agent Rule Updates (what agent rule file was updated to ensure the learning is durable) |
|---|---|
| When a legacy issue no longer matches the best present-day scope, the spec should state the intentional reshaping explicitly instead of pretending full parity | None |
| Mock validation is faster and more trustworthy when static HTML is served locally rather than inspected only as source text | None |
