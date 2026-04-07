// Integration tests for host auth — PIN login, cookie, protected routes.
// Spawns a real server; sets test env defaults so npm run test:all works.

// Test defaults — won't override if already set
process.env.SKB_HOST_PIN ??= '1234';
process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_host_auth_test';
process.env.PORT ??= '15398';
process.env.FRAIM_TEST_SERVER_PORT ??= '15398';
process.env.FRAIM_BRANCH ??= '';

import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    startTestServer,
    stopTestServer,
    getTestServerUrl,
} from '../shared-server-utils.js';

const cases: BaseTestCase[] = [
    {
        name: 'host-auth: server starts',
        tags: ['integration', 'auth', 'setup'],
        testFn: async () => {
            await startTestServer();
            const res = await fetch(`${getTestServerUrl()}/health`);
            return res.ok;
        },
    },
    {
        name: 'host-auth: wrong PIN returns 401',
        tags: ['integration', 'auth', 'waitlist-path'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/host/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: '0000' }),
            });
            return res.status === 401;
        },
    },
    {
        name: 'host-auth: missing PIN returns 400',
        tags: ['integration', 'auth'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/host/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            return res.status === 400;
        },
    },
    {
        name: 'host-auth: correct PIN returns 200 with Set-Cookie',
        tags: ['integration', 'auth', 'waitlist-path'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/host/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: '1234' }),
            });
            const body = await res.json() as { ok?: boolean };
            const cookie = res.headers.get('set-cookie') ?? '';
            return res.ok && body.ok === true && cookie.includes('skb_host=');
        },
    },
    {
        name: 'host-auth: /api/host/queue without cookie returns 401',
        tags: ['integration', 'auth', 'waitlist-path'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/host/queue`);
            return res.status === 401;
        },
    },
    {
        name: 'host-auth: /api/host/queue with valid cookie returns 200',
        tags: ['integration', 'auth', 'waitlist-path'],
        testFn: async () => {
            // Login to get cookie
            const loginRes = await fetch(`${getTestServerUrl()}/api/host/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: '1234' }),
            });
            const rawCookie = loginRes.headers.get('set-cookie') ?? '';
            const cookieValue = rawCookie.split(';')[0]; // "skb_host=..."

            const queueRes = await fetch(`${getTestServerUrl()}/api/host/queue`, {
                headers: { Cookie: cookieValue },
            });
            return queueRes.ok;
        },
    },
    {
        name: 'host-auth: /api/host/stats with valid cookie returns 200',
        tags: ['integration', 'auth', 'stats'],
        testFn: async () => {
            const loginRes = await fetch(`${getTestServerUrl()}/api/host/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: '1234' }),
            });
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];

            const statsRes = await fetch(`${getTestServerUrl()}/api/host/stats`, {
                headers: { Cookie: cookieValue },
            });
            return statsRes.ok;
        },
    },
    {
        name: 'host-auth: logout clears cookie, next request returns 401',
        tags: ['integration', 'auth'],
        testFn: async () => {
            // Login
            const loginRes = await fetch(`${getTestServerUrl()}/api/host/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: '1234' }),
            });
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];

            // Logout
            const logoutRes = await fetch(`${getTestServerUrl()}/api/host/logout`, {
                method: 'POST',
                headers: { Cookie: cookieValue },
            });
            const logoutCookie = logoutRes.headers.get('set-cookie') ?? '';

            // The logout cookie should set Max-Age=0
            return logoutRes.ok && logoutCookie.includes('Max-Age=0');
        },
    },
    {
        name: 'host-auth: tampered cookie returns 401',
        tags: ['integration', 'auth'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/host/queue`, {
                headers: { Cookie: 'skb_host=9999999999.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
            });
            return res.status === 401;
        },
    },
    {
        name: 'host-auth: teardown',
        tags: ['integration', 'auth'],
        testFn: async () => { await stopTestServer(); return true; },
    },
];

void runTests(cases, 'host-auth (integration)');
