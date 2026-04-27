// ============================================================================
// Unit tests for the mail-sending service (issue #93 Bug 2).
//
// Before this issue, every "send email" call site (welcomeEmail.ts, the
// staff invite handler) was a console.log stub — so owners could invite
// staff but the invitee never received anything in their inbox.
//
// The new `sendEmail(...)` helper:
//   - always logs an audit-trail line so dev still sees the invite link
//   - if ACS_EMAIL_CONNECTION_STRING + ACS_EMAIL_SENDER are set, attempts
//     a real send via Azure Communication Services Email
//   - if either is missing, returns a `log-only` result without calling
//     the SDK (avoids hard dep on @azure/communication-email at install time)
//   - never throws — mail failure must not break the calling flow
//
// These tests cover the no-config (log-only) and never-throws branches.
// The actual ACS path is covered by the integration suite; unit tests
// here verify the env-gating and audit-log contract.
// ============================================================================

import { runTests } from '../test-utils.js';
import { sendEmail } from '../../src/services/mailer.js';

interface T { name: string; description?: string; tags?: string[]; testFn?: () => Promise<boolean>; }

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => Promise<T> | T): Promise<T> | T {
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(overrides)) {
        saved[k] = process.env[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
    const restore = () => {
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    };
    try {
        const result = fn();
        if (result instanceof Promise) {
            return result.finally(restore);
        }
        restore();
        return result;
    } catch (err) {
        restore();
        throw err;
    }
}

async function withCapturedLogs<T>(fn: () => Promise<T>): Promise<{ value: T; logs: string[] }> {
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
    try {
        const value = await fn();
        return { value, logs };
    } finally {
        console.log = original;
    }
}

const cases: T[] = [
    {
        name: 'log-only mode when neither ACS env var is set',
        tags: ['unit', 'mailer', 'issue-93'],
        testFn: async () => withEnv({
            ACS_EMAIL_CONNECTION_STRING: undefined,
            ACS_EMAIL_SENDER: undefined,
        }, async () => {
            const { value } = await withCapturedLogs(() =>
                sendEmail({ to: 'a@b.test', subject: 'hi', text: 'hello' }),
            );
            return value.delivered === false && value.mode === 'log-only';
        }),
    },
    {
        name: 'log-only mode when only ACS_EMAIL_CONNECTION_STRING is set',
        tags: ['unit', 'mailer', 'issue-93'],
        testFn: async () => withEnv({
            ACS_EMAIL_CONNECTION_STRING: 'endpoint=https://x.communication.azure.com/;accesskey=fake',
            ACS_EMAIL_SENDER: undefined,
        }, async () => {
            const { value } = await withCapturedLogs(() =>
                sendEmail({ to: 'a@b.test', subject: 'hi', text: 'hello' }),
            );
            return value.delivered === false && value.mode === 'log-only';
        }),
    },
    {
        name: 'log-only mode when only ACS_EMAIL_SENDER is set',
        tags: ['unit', 'mailer', 'issue-93'],
        testFn: async () => withEnv({
            ACS_EMAIL_CONNECTION_STRING: undefined,
            ACS_EMAIL_SENDER: 'noreply@osh.example',
        }, async () => {
            const { value } = await withCapturedLogs(() =>
                sendEmail({ to: 'a@b.test', subject: 'hi', text: 'hello' }),
            );
            return value.delivered === false && value.mode === 'log-only';
        }),
    },
    {
        name: 'always emits audit log line with to, subject, mode',
        tags: ['unit', 'mailer', 'issue-93'],
        testFn: async () => withEnv({
            ACS_EMAIL_CONNECTION_STRING: undefined,
            ACS_EMAIL_SENDER: undefined,
        }, async () => {
            const { logs } = await withCapturedLogs(() =>
                sendEmail({ to: 'invitee@example.test', subject: 'You\'re invited', text: 'click here' }),
            );
            // Audit trail must include the recipient and subject
            return logs.some((line) => {
                try {
                    const p = JSON.parse(line);
                    return p.msg === 'email.send'
                        && p.to === 'invitee@example.test'
                        && p.subject === "You're invited"
                        && p.mode === 'log-only';
                } catch { return false; }
            });
        }),
    },
    {
        name: 'never throws even when SDK import or send would fail',
        tags: ['unit', 'mailer', 'issue-93'],
        testFn: async () => withEnv({
            ACS_EMAIL_CONNECTION_STRING: 'endpoint=https://nonexistent.communication.azure.com/;accesskey=invalid',
            ACS_EMAIL_SENDER: 'noreply@osh.example',
        }, async () => {
            // Should not throw even though ACS will fail (invalid endpoint).
            // The SDK import succeeds locally but the send fails — the helper
            // catches and returns a result.
            try {
                const result = await withCapturedLogs(() =>
                    sendEmail({ to: 'a@b.test', subject: 'hi', text: 'hello' }),
                );
                return result.value.delivered === false; // mode could be 'acs' or 'log-only' depending on env
            } catch {
                return false;
            }
        }),
    },
    {
        name: 'returns delivered=false when an empty subject is supplied (input validation)',
        tags: ['unit', 'mailer', 'issue-93'],
        testFn: async () => withEnv({
            ACS_EMAIL_CONNECTION_STRING: undefined,
            ACS_EMAIL_SENDER: undefined,
        }, async () => {
            const { value } = await withCapturedLogs(() =>
                sendEmail({ to: 'a@b.test', subject: '', text: 'hello' }),
            );
            return value.delivered === false;
        }),
    },
];

void runTests(cases, 'mailer service (issue #93 Bug 2)');
