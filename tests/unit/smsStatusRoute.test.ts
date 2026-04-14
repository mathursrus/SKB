// ============================================================================
// Unit tests for the Twilio delivery statusCallback route
// ============================================================================
// Exercises POST /api/sms/status via an in-process Express app mounting
// smsStatusRouter(). Verifies:
//   - signature bypass via SKB_ALLOW_UNSIGNED_TWILIO=1 (dev escape hatch)
//   - missing signature → 403 when bypass not set
//   - failed / undelivered / ErrorCode → sms.delivery_failed at level=error
//   - delivered                        → sms.delivery_ok at level=info
//   - intermediate states              → sms.delivery_progress at level=info
//   - phone is masked in the log line (no PII leak)
//   - response is always 204 (never 5xx) to prevent Twilio retry loops

import express from 'express';
import { runTests } from '../test-utils.js';
import { smsStatusRouter } from '../../src/routes/sms.js';

interface CapturedLog { level: string; msg: string; [k: string]: unknown }

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use('/api', smsStatusRouter());
    return app;
}

// Intercept console.log for one call, parsing the JSON line it emits.
function withCapturedLogs<T>(fn: () => Promise<T>): Promise<{ result: T; logs: CapturedLog[] }> {
    const logs: CapturedLog[] = [];
    const orig = console.log;
    console.log = (line: unknown) => {
        if (typeof line === 'string') {
            try { logs.push(JSON.parse(line) as CapturedLog); } catch { /* non-JSON, ignore */ }
        }
    };
    return fn().then(
        (result) => { console.log = orig; return { result, logs }; },
        (err) => { console.log = orig; throw err; },
    );
}

async function postForm(app: express.Express, path: string, form: Record<string, string>, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
    // Minimal in-process HTTP POST using node http against an ephemeral listen.
    const server = app.listen(0);
    const addr = server.address();
    if (!addr || typeof addr === 'string') { server.close(); throw new Error('no port'); }
    const port = addr.port;
    try {
        const body = new URLSearchParams(form).toString();
        const { request } = await import('node:http');
        return await new Promise<{ status: number; body: string }>((resolve, reject) => {
            const req = request({
                hostname: '127.0.0.1', port, path, method: 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'content-length': Buffer.byteLength(body).toString(),
                    ...headers,
                },
            }, (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf-8') }));
            });
            req.on('error', reject);
            req.write(body);
            req.end();
        });
    } finally {
        server.close();
    }
}

// Save and restore env we mutate
const saved = {
    SKB_ALLOW_UNSIGNED_TWILIO: process.env.SKB_ALLOW_UNSIGNED_TWILIO,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
};
function allowUnsigned() {
    process.env.SKB_ALLOW_UNSIGNED_TWILIO = '1';
    delete process.env.TWILIO_AUTH_TOKEN;
}
function restoreEnv() {
    if (saved.SKB_ALLOW_UNSIGNED_TWILIO !== undefined) process.env.SKB_ALLOW_UNSIGNED_TWILIO = saved.SKB_ALLOW_UNSIGNED_TWILIO;
    else delete process.env.SKB_ALLOW_UNSIGNED_TWILIO;
    if (saved.TWILIO_AUTH_TOKEN !== undefined) process.env.TWILIO_AUTH_TOKEN = saved.TWILIO_AUTH_TOKEN;
    else delete process.env.TWILIO_AUTH_TOKEN;
}

const cases = [
    // ---------- Security: middleware is enforcing ----------
    {
        name: 'smsStatus: returns 403 when signature missing and bypass not set',
        tags: ['unit', 'sms', 'security'],
        testFn: async () => {
            delete process.env.SKB_ALLOW_UNSIGNED_TWILIO;
            process.env.TWILIO_AUTH_TOKEN = 'fake_token_for_middleware_wiring';
            try {
                const app = makeApp();
                const r = await postForm(app, '/api/sms/status', {
                    MessageSid: 'SMdeadbeef', MessageStatus: 'delivered',
                });
                return r.status === 403;
            } finally {
                restoreEnv();
            }
        },
    },
    {
        name: 'smsStatus: returns 503 when TWILIO_AUTH_TOKEN unset AND bypass not set',
        tags: ['unit', 'sms', 'security'],
        testFn: async () => {
            delete process.env.SKB_ALLOW_UNSIGNED_TWILIO;
            delete process.env.TWILIO_AUTH_TOKEN;
            try {
                const app = makeApp();
                const r = await postForm(app, '/api/sms/status', {
                    MessageSid: 'SMdeadbeef', MessageStatus: 'delivered',
                });
                return r.status === 503;
            } finally {
                restoreEnv();
            }
        },
    },

    // ---------- Terminal failures → sms.delivery_failed ----------
    {
        name: 'smsStatus: MessageStatus=failed emits sms.delivery_failed at error',
        tags: ['unit', 'sms'],
        testFn: async () => {
            allowUnsigned();
            try {
                const app = makeApp();
                const { result, logs } = await withCapturedLogs(async () =>
                    postForm(app, '/api/sms/status', {
                        MessageSid: 'SMabc123', MessageStatus: 'failed',
                        To: '+15127753555', From: '+14254284231', ErrorCode: '30007',
                    }),
                );
                if (result.status !== 204) return false;
                const ev = logs.find((l) => l.msg === 'sms.delivery_failed');
                return !!ev && ev.level === 'error' && ev.messageSid === 'SMabc123'
                    && ev.errorCode === 30007 && ev.to === '******3555';
            } finally {
                restoreEnv();
            }
        },
    },
    {
        name: 'smsStatus: MessageStatus=undelivered emits sms.delivery_failed at error',
        tags: ['unit', 'sms'],
        testFn: async () => {
            allowUnsigned();
            try {
                const app = makeApp();
                const { result, logs } = await withCapturedLogs(async () =>
                    postForm(app, '/api/sms/status', {
                        MessageSid: 'SMxyz', MessageStatus: 'undelivered',
                        To: '+15127753555', From: '+14254284231', ErrorCode: '30034',
                    }),
                );
                if (result.status !== 204) return false;
                const ev = logs.find((l) => l.msg === 'sms.delivery_failed');
                return !!ev && ev.level === 'error' && ev.errorCode === 30034;
            } finally {
                restoreEnv();
            }
        },
    },
    {
        name: 'smsStatus: ErrorCode alone triggers failed classification even if status is mild',
        tags: ['unit', 'sms'],
        testFn: async () => {
            allowUnsigned();
            try {
                const app = makeApp();
                const { logs } = await withCapturedLogs(async () =>
                    postForm(app, '/api/sms/status', {
                        MessageSid: 'SMerr', MessageStatus: 'sent',
                        To: '+15127753555', ErrorCode: '21610',
                    }),
                );
                const ev = logs.find((l) => l.msg === 'sms.delivery_failed');
                return !!ev && ev.level === 'error' && ev.errorCode === 21610;
            } finally {
                restoreEnv();
            }
        },
    },

    // ---------- Success → sms.delivery_ok ----------
    {
        name: 'smsStatus: MessageStatus=delivered emits sms.delivery_ok at info',
        tags: ['unit', 'sms'],
        testFn: async () => {
            allowUnsigned();
            try {
                const app = makeApp();
                const { result, logs } = await withCapturedLogs(async () =>
                    postForm(app, '/api/sms/status', {
                        MessageSid: 'SMok', MessageStatus: 'delivered',
                        To: '+15127753555', From: '+14254284231',
                    }),
                );
                if (result.status !== 204) return false;
                const ev = logs.find((l) => l.msg === 'sms.delivery_ok');
                return !!ev && ev.level === 'info' && ev.errorCode === null;
            } finally {
                restoreEnv();
            }
        },
    },

    // ---------- Intermediate → sms.delivery_progress ----------
    {
        name: 'smsStatus: MessageStatus=queued emits sms.delivery_progress at info',
        tags: ['unit', 'sms'],
        testFn: async () => {
            allowUnsigned();
            try {
                const app = makeApp();
                const { logs } = await withCapturedLogs(async () =>
                    postForm(app, '/api/sms/status', {
                        MessageSid: 'SMq', MessageStatus: 'queued', To: '+15127753555',
                    }),
                );
                const ev = logs.find((l) => l.msg === 'sms.delivery_progress');
                return !!ev && ev.level === 'info';
            } finally {
                restoreEnv();
            }
        },
    },

    // ---------- PII: phone is masked in log ----------
    {
        name: 'smsStatus: "To" phone never appears unmasked in emitted log line',
        tags: ['unit', 'sms', 'privacy'],
        testFn: async () => {
            allowUnsigned();
            try {
                const app = makeApp();
                const { logs } = await withCapturedLogs(async () =>
                    postForm(app, '/api/sms/status', {
                        MessageSid: 'SMpii', MessageStatus: 'failed',
                        To: '+15127753555', ErrorCode: '30034',
                    }),
                );
                const blob = JSON.stringify(logs);
                return !blob.includes('5127753555') && !blob.includes('15127753555')
                    && blob.includes('******3555');
            } finally {
                restoreEnv();
            }
        },
    },

    // ---------- Retry-avoidance: always 2xx ----------
    {
        name: 'smsStatus: empty body still returns 204 (never 5xx → no Twilio retry)',
        tags: ['unit', 'sms'],
        testFn: async () => {
            allowUnsigned();
            try {
                const app = makeApp();
                const r = await postForm(app, '/api/sms/status', {});
                return r.status === 204;
            } finally {
                restoreEnv();
            }
        },
    },
];

void runTests(cases, 'SMS delivery statusCallback route');
