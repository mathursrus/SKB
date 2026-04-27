// ============================================================================
// Unit tests for the dbError diagnostic helper (issue #93 Bug 1).
//
// The original `dbError(res, err)` returned an opaque
//   { error: 'temporarily unavailable' }
// body and logged a single `db.error` line with no route context, so when
// the iOS Staff section started reporting 503s for the owner it was
// impossible to tell which of the three possible 503 sources was firing
// (auth-config, membership-lookup, or the actual route handler).
//
// The new `emitDbError(...)` helper:
//   - includes a `code` field so the client can distinguish failure modes
//   - logs the route path so audit lines are attributable
//   - in non-production also includes a `detail` string with the real error
//     message so you can see the cause without grepping logs
//
// These tests assert that contract.
// ============================================================================

import { runTests } from '../test-utils.js';
import { emitDbError, type DbErrorCode } from '../../src/services/dbError.js';
import type { Response } from 'express';

interface T { name: string; description?: string; tags?: string[]; testFn?: () => Promise<boolean>; }

interface ResState { status: number; body: unknown }

function makeRes(): { res: Response; state: ResState } {
    const state: ResState = { status: 200, body: undefined };
    const res = {
        status(code: number) { state.status = code; return res; },
        json(body: unknown) { state.body = body; return res; },
    } as unknown as Response;
    return { res, state };
}

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(overrides)) {
        saved[k] = process.env[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
    try { return fn(); }
    finally {
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
}

function withCapturedLogs<T>(fn: () => T): { value: T; logs: string[] } {
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
    try {
        const value = fn();
        return { value, logs };
    } finally {
        console.log = original;
    }
}

const cases: T[] = [
    {
        name: 'returns 503 with structured code field',
        tags: ['unit', 'db-error', 'issue-93'],
        testFn: async () => {
            const { res, state } = makeRes();
            withCapturedLogs(() => emitDbError({ res, err: new Error('boom'), code: 'db_throw', route: '/staff' }));
            const body = state.body as { error: string; code: DbErrorCode };
            return state.status === 503
                && body.error === 'temporarily unavailable'
                && body.code === 'db_throw';
        },
    },
    {
        name: 'defaults code to db_throw when not specified',
        tags: ['unit', 'db-error', 'issue-93'],
        testFn: async () => {
            const { res, state } = makeRes();
            withCapturedLogs(() => emitDbError({ res, err: new Error('x') }));
            return (state.body as { code: DbErrorCode }).code === 'db_throw';
        },
    },
    {
        name: 'preserves caller-specified code (membership_lookup)',
        tags: ['unit', 'db-error', 'issue-93'],
        testFn: async () => {
            const { res, state } = makeRes();
            withCapturedLogs(() => emitDbError({ res, err: new Error('x'), code: 'membership_lookup' }));
            return (state.body as { code: DbErrorCode }).code === 'membership_lookup';
        },
    },
    {
        name: 'preserves caller-specified code (auth_unconfigured)',
        tags: ['unit', 'db-error', 'issue-93'],
        testFn: async () => {
            const { res, state } = makeRes();
            withCapturedLogs(() => emitDbError({ res, err: new Error('x'), code: 'auth_unconfigured' }));
            return (state.body as { code: DbErrorCode }).code === 'auth_unconfigured';
        },
    },
    {
        name: 'log line includes route + code + detail',
        tags: ['unit', 'db-error', 'issue-93'],
        testFn: async () => {
            const { res } = makeRes();
            const { logs } = withCapturedLogs(() =>
                emitDbError({ res, err: new Error('connection reset'), code: 'db_throw', route: '/staff' }),
            );
            const line = logs[0];
            if (!line) return false;
            const parsed = JSON.parse(line);
            return parsed.msg === 'db.error'
                && parsed.code === 'db_throw'
                && parsed.route === '/staff'
                && parsed.detail === 'connection reset';
        },
    },
    {
        name: 'in non-prod, response includes detail so client can see real cause',
        tags: ['unit', 'db-error', 'issue-93'],
        testFn: async () => withEnv({ NODE_ENV: 'development' }, () => {
            const { res, state } = makeRes();
            withCapturedLogs(() => emitDbError({ res, err: new Error('connection reset'), code: 'db_throw' }));
            const body = state.body as { detail?: string };
            return body.detail === 'connection reset';
        }),
    },
    {
        name: 'in production, response omits detail (no leaking error internals)',
        tags: ['unit', 'db-error', 'issue-93'],
        testFn: async () => withEnv({ NODE_ENV: 'production', SKB_EXPOSE_DB_ERROR_DETAIL: undefined }, () => {
            const { res, state } = makeRes();
            withCapturedLogs(() => emitDbError({ res, err: new Error('mongo password leaked: secret123'), code: 'db_throw' }));
            const body = state.body as { detail?: string };
            return body.detail === undefined;
        }),
    },
    {
        name: 'in production with SKB_EXPOSE_DB_ERROR_DETAIL=true, includes detail (operator opt-in)',
        tags: ['unit', 'db-error', 'issue-93'],
        testFn: async () => withEnv({ NODE_ENV: 'production', SKB_EXPOSE_DB_ERROR_DETAIL: 'true' }, () => {
            const { res, state } = makeRes();
            withCapturedLogs(() => emitDbError({ res, err: new Error('connection reset'), code: 'db_throw' }));
            const body = state.body as { detail?: string };
            return body.detail === 'connection reset';
        }),
    },
    {
        name: 'always includes errorName so client can distinguish DB vs code bug even in prod',
        tags: ['unit', 'db-error', 'issue-93'],
        testFn: async () => withEnv({ NODE_ENV: 'production' }, () => {
            // Build a custom error subclass to mimic e.g. MongoNetworkError
            class MongoNetworkError extends Error { override name = 'MongoNetworkError'; }
            const { res, state } = makeRes();
            withCapturedLogs(() => emitDbError({ res, err: new MongoNetworkError('x'), code: 'db_throw' }));
            const body = state.body as { errorName?: string };
            return body.errorName === 'MongoNetworkError';
        }),
    },
    {
        name: 'includes errorCode (numeric) when error has one (e.g. Mongo enum)',
        tags: ['unit', 'db-error', 'issue-93'],
        testFn: async () => withEnv({ NODE_ENV: 'production' }, () => {
            const err = Object.assign(new Error('duplicate key'), { code: 11000 });
            const { res, state } = makeRes();
            withCapturedLogs(() => emitDbError({ res, err, code: 'db_throw' }));
            const body = state.body as { errorCode?: number };
            return body.errorCode === 11000;
        }),
    },
];

void runTests(cases, 'dbError diagnostic helper (issue #93 Bug 1)');
