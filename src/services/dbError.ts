// ============================================================================
// SKB - dbError diagnostic helper (issue #93 Bug 1)
// ============================================================================
//
// Originally there was a private `dbError(res, err)` helper inside
// src/routes/host.ts that converted any caught route error into
//   { error: 'temporarily unavailable' } + 503
// and emitted a single `db.error` log line with no route context.
//
// When the iOS Staff section started returning 503 even for owner sessions,
// it was impossible to tell which of three 503 sources had fired:
//   1. hostAuth.ts:309 — secret() empty (env config)
//   2. hostAuth.ts:410 — membership-lookup throw (fail-closed)
//   3. host.ts route handler — db threw inside listX() etc.
// All three returned the same opaque body and the log line lacked the
// route path so attribution was a guessing game.
//
// `emitDbError` adds:
//   - structured `code` field on the response so the iOS client can
//     distinguish failure modes
//   - route path on the log line for attribution
//   - in non-production, the real error message in the response body so
//     debugging on-device doesn't require log access
//
// Production omits `detail` from the response so error internals (Mongo
// connection strings etc.) never leak to the client.
// ============================================================================

import type { Response } from 'express';

export type DbErrorCode =
    | 'db_throw'           // route handler caught a db error
    | 'membership_lookup'  // requireRole's membership recheck threw
    | 'auth_unconfigured'  // SKB_COOKIE_SECRET / HOST_AUTH key missing
    | 'unknown';

export interface EmitDbErrorOptions {
    res: Response;
    err: unknown;
    /** Defaults to 'db_throw'. */
    code?: DbErrorCode;
    /** The route path that triggered the error (e.g. '/staff'). */
    route?: string;
}

export function emitDbError(opts: EmitDbErrorOptions): void {
    const code: DbErrorCode = opts.code ?? 'db_throw';
    const detail = opts.err instanceof Error ? opts.err.message : String(opts.err);

    // Always log so the audit trail exists in production too.
    // eslint-disable-next-line no-console -- structured log is the audit trail
    console.log(JSON.stringify({
        t: new Date().toISOString(),
        level: 'error',
        msg: 'db.error',
        code,
        route: opts.route,
        detail,
    }));

    const includeDetail = process.env.NODE_ENV !== 'production';
    const body: { error: string; code: DbErrorCode; detail?: string } = {
        error: 'temporarily unavailable',
        code,
    };
    if (includeDetail) body.detail = detail;
    opts.res.status(503).json(body);
}
