# Issue #2 — Quality Check Feedback

## Quality Issues

### 1. Unused constant `EXPECTED_URL` in tests/qr.test.ts
- **Severity**: P2 (minor)
- **Type**: QUALITY CHECK FAILURE — dead code
- **Details**: `EXPECTED_URL` was declared but never referenced in any test assertion.
- **Status**: ADDRESSED — removed the unused constant.

## Quality Summary
- No hardcoded credentials or secrets found.
- No `any` types used.
- No TODO/FIXME placeholders.
- All files under 50 lines (scripts/generate-qr.ts: 29 lines, tests/qr.test.ts: 65 lines).
- Constants extracted appropriately (TARGET_URL, QR_SVG_PATH).
- Follows existing codebase patterns (test structure, path resolution via fileURLToPath).
- No duplicate logic — generation script is single-use, tests are unique.
- Architecture standards compliant: no runtime dependencies added, static asset served via existing Express middleware.
