---
author: sid.mathur@gmail.com
date: 2026-04-04
synthesized:
---

# Postmortem: QR Code for Waitlist at Restaurant Door - Issue #2

**Date**: 2026-04-04
**Duration**: ~30 minutes
**Objective**: Generate a static QR code SVG for the restaurant entrance linking to the digital waitlist
**Outcome**: Success

## Executive Summary

Implemented a static QR code SVG asset (`public/qr.svg`) encoding the production waitlist URL with error correction level H. The implementation was straightforward with no backend changes required. PR #21 submitted with full test coverage (6 new tests, 48 total passing) and complete traceability to all 9 spec requirements.

## Architectural Impact

**Has Architectural Impact**: No

No new routes, services, or patterns were introduced. The feature leverages the existing Express static middleware to serve the SVG file.

## Timeline of Events

### Phase 1: Scoping
- Loaded issue #2, feature spec, and project rules
- Identified this as a static asset feature with no backend changes
- Created standing work list at `docs/evidence/2-implement-work-list.md`

### Phase 2: Tests
- Wrote 6 unit tests covering SVG existence, format, namespace, color, size, and tracking compliance
- Tests initially failed (expected, since SVG did not yet exist)

### Phase 3: Code
- Installed `qrcode` + `@types/qrcode` as dev dependencies
- Created `scripts/generate-qr.ts` for reproducible SVG generation
- Generated `public/qr.svg` (2923 bytes, 45x45 module grid, error correction H)
- Updated printable card mock to embed real QR code
- All tests passed on first run after generation

### Phase 4: Validate
- Verified QR decode via re-generation comparison (byte-for-byte match)
- Confirmed Express static middleware serves `public/` directory
- TypeScript typecheck clean

### Phase 5: Regression
- Full suite: 48/48 tests pass across 7 test files, zero regressions

### Phase 6: Quality
- Found 1 minor issue (unused constant), fixed immediately
- No hardcoded credentials, no `any` types, no TODO/FIXME

### Phase 7: Completeness
- Traceability matrix: 9/9 requirements Met
- All feedback addressed (1/1)

### Phase 8: Submission
- Committed, pushed to `issue-2-qr-code-impl`, created PR #21

## Root Cause Analysis

No failures or issues to analyze. Implementation was clean and straightforward.

## What Went Wrong

1. **Minor: Worktree path resolution**: The test file initially used `import.meta.dirname` which resolved incorrectly in the worktree context, producing a path missing the worktree directory segment. Required switching to `fileURLToPath(import.meta.url)` pattern consistent with the rest of the codebase.

## What Went Right

1. **Test-first approach**: Writing tests before generating the SVG caught the path resolution issue early and confirmed all assertions worked when the asset was created.
2. **Reproducible generation**: Using a script (`scripts/generate-qr.ts`) rather than a manual QR tool means the SVG can be regenerated if the URL changes.
3. **Minimal scope**: No unnecessary backend routes or runtime dependencies were added. The `qrcode` package is dev-only.
4. **Spec quality**: The feature spec (`docs/feature-specs/2-qr-code-door.md`) was thorough and made implementation decisions clear, reducing ambiguity.

## Lessons Learned

1. **Use `fileURLToPath` consistently**: In worktree environments on Windows, `import.meta.dirname` can resolve to unexpected paths. The `fileURLToPath(import.meta.url)` + `path.dirname()` pattern is more reliable and consistent with the existing codebase convention.
2. **Static assets are great candidates for test-first**: Even though there is no business logic, tests on static assets (existence, format, content properties) catch generation issues immediately.
3. **Bringing files from other branches**: Using `git show <branch>:<path>` is an effective way to pull spec/mock files from feature branches into the working branch.

## Agent Rule Updates Made to avoid recurrence

None needed. The worktree path issue is environment-specific and the fix aligns with existing codebase patterns.

## Enforcement Updates Made to avoid recurrence

None needed. The implementation followed all project rules and FRAIM constraints without deviation.
