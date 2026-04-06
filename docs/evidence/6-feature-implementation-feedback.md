# Quality Feedback: Issue #6 - End-of-Day Operations Dashboard

## Quality Check Findings

### QC-1: Duplicate timezone string (ADDRESSED)
- **Severity**: P2
- **Tag**: QUALITY CHECK FAILURE
- **Detail**: `stats.ts` hardcoded `'America/Los_Angeles'` instead of reusing the `TZ` constant from `src/core/utils/time.ts`.
- **Fix**: Exported `TZ` from `time.ts` and imported it in `stats.ts`.
- **Status**: ADDRESSED

### QC-2: ACTIVE_STATES conceptual duplication (ADDRESSED)
- **Severity**: P2
- **Tag**: QUALITY CHECK FAILURE
- **Detail**: `stats.ts` originally defined its own `ACTIVE_STATES` constant duplicating the one in `queue.ts`. The constant in `queue.ts` is not exported (internal to that module).
- **Fix**: Removed the duplicate constant from `stats.ts`. The `buildStats` function uses an inline check `e.state === 'waiting' || e.state === 'called'` which is clear and avoids cross-module coupling for an internal constant.
- **Status**: ADDRESSED

## Checks Passed

- No hardcoded secrets, URLs, or API keys
- No console.log debug statements in new code
- No TODO/FIXME/placeholder comments
- All functions under 50 lines
- All files under 500 lines (stats.ts: ~120 lines)
- No circular dependencies
- Proper use of environment variables (inherits from existing patterns)
- Architecture follows service/route/type separation pattern
- Pure helpers separated from DB-dependent code for testability
- CSS uses existing CSS custom properties (--border, --surface-alt, --muted, etc.)
- Stats endpoint returns aggregate data only -- no PII exposed
