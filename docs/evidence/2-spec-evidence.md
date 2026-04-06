# Feature Specification: QR Code for Waitlist at the Restaurant Door
Issue: [#2](https://github.com/mathursrus/SKB/issues/2)
PR: (linked upon creation)

## Summary
- **Issue**: #2 - QR code for queue.html at the restaurant door
- **Workflow type**: Feature Specification
- **Description**: Created a comprehensive product specification for a QR code that allows walk-in diners to self-discover and join the SKB digital waitlist by scanning a code at the restaurant entrance.

## Work Completed

### Key files created
| File | Purpose |
|---|---|
| `docs/feature-specs/2-qr-code-door.md` | Full feature specification with requirements, acceptance criteria, competitive analysis, and validation plan |
| `docs/feature-specs/mocks/2-qr-printout.html` | Interactive HTML/CSS mock of the branded printable QR code card |
| `docs/evidence/2-spec-evidence.md` | This evidence document |

### Approach
1. Read GitHub issue #2 and existing codebase (`queue.html`, `queue.ts`, `styles.css`, `package.json`).
2. Extracted 7 traceable requirements (R1-R7) with SHALL-style language.
3. Wrote 4 Given/When/Then acceptance criteria and 4 edge cases.
4. Created an interactive HTML/CSS mock of the branded printable card with simulated QR code pattern.
5. Researched 7 competitors via web search (Yelp Waitlist, ScanQueue, WaitQ, TablesReady, Waitly, NextMe, paper baseline).
6. Documented competitive positioning and differentiation strategy.
7. Validated mock rendering in browser via Playwright.

### Specification sections
- Customer and problem statement
- User experience flow (diner, host, print/deployment)
- UI mock (HTML/CSS, brand-aligned)
- Design Standards Applied (generic UI baseline)
- 7 functional requirements with traceability IDs
- 4 acceptance criteria (Given/When/Then)
- 4 edge cases
- Compliance requirements (none applicable, documented why)
- Validation plan (6 verification methods)
- 5 alternatives considered
- 7 competitors analyzed with differentiation strategy
- Implementation guidance (static SVG recommended)
- 3 open questions for owner review

## Completeness Evidence
- Issue tagged with label `phase:spec`: Pending
- Issue tagged with label `status:needs-review`: Pending
- All specification documents committed/synced to branch: Yes

| Customer Research Area | Sources of Information |
|---|---|
| Diner pain point (waitlist discoverability) | GitHub issue #2, issue #1 spec |
| Existing codebase constraints | `public/queue.html`, `src/routes/queue.ts`, `package.json` |
| Brand identity and design standards | `public/styles.css` (SKB brand colors, typography) |
| Competitive landscape | Web search: ScanQueue, WaitQ, TablesReady, Yelp, Waitly, NextMe (2026-04-04) |
| QR code technical standards | ISO/IEC 18004, error correction level best practices |

| PR Comment | How Addressed |
|---|---|
| (No prior feedback) | N/A |

## Validation
- Mock (`2-qr-printout.html`) opened in browser via Playwright and screenshot captured.
- Layout renders correctly: centered card with gold border, SKB branding, simulated QR code, CTA text.
- Print media query hides annotations section.
- All issue requirements mapped to traceable spec requirements.

## Quality Checks
- All deliverables complete (spec, mock, evidence)
- Documentation uses clear SHALL-style requirements with no vague terms
- Mock is interactive HTML/CSS (not markdown code blocks)
- Work ready for review

## Continuous Learning

| Learning | Agent Rule Updates |
|---|---|
| Static SVG is the simplest approach for rarely-changing QR codes; dynamic endpoints add unnecessary runtime complexity | None (project-specific decision, not a durable rule) |
| Competitor research via web search adds significant value to differentiation section | None (already part of FRAIM workflow) |
