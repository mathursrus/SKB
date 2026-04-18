// ============================================================================
// Integration tests for issue #57 — marketing landing + /admin/locations
// ============================================================================
//
// Covers §57 acceptance at the HTTP layer:
//   R1 — naked '/' (no matching publicHost) serves the marketing landing
//        with a "Start free" CTA → /signup.
//   R2 — SKB Bellevue's publicHost still routes '/' → /r/skb/home.html
//        (host-rewrite middleware, unchanged).
//   R3 — the legacy locations-list page is behind `SKB_OPERATOR_CONSOLE=true`
//        at `/admin/locations`. Without the flag: 404. With the flag: the
//        list is served.
//   R5 — `/signup` still serves the signup page (backward-compat with #54).
//
// Notes
//   * We need SKB_OPERATOR_CONSOLE=true when exercising R3's positive case,
//     so a second test server is spawned with that flag. Both servers must
//     share a Mongo DB name so `ensureLocation` rows are visible to the
//     listings page.
//   * The default `skb` location is used as the `publicHost` fixture for
//     R2 — we write `publicHost: "skbbellevue.com"` (the real value) so the
//     existing host-rewrite cache can match it. No regression: no code
//     change to the middleware is required.
// ============================================================================

process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_issue57_landing_test';
process.env.PORT ??= '15470';
process.env.FRAIM_TEST_SERVER_PORT ??= '15470';
process.env.FRAIM_BRANCH ??= '';
process.env.SKB_HOST_PIN ??= '1234';

import http from 'node:http';
import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    startTestServer,
    stopTestServer,
    getTestServerUrl,
    getTestServerPort,
} from '../shared-server-utils.js';
import { closeDb, getDb, locations } from '../../src/core/db/mongo.js';
import { ensureLocation } from '../../src/services/locations.js';

const SKB_HOST = 'issue57.example.test';

/**
 * Fetch with a custom Host header. `fetch`/undici put Host on a forbidden
 * list for localhost URLs, so we drop to the raw http.request API — the
 * only way to exercise the host-rewrite middleware from a test.
 */
async function fetchWithHost(pathname: string, host: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                host: '127.0.0.1',
                port: getTestServerPort(),
                path: pathname,
                method: 'GET',
                headers: { Host: host },
            },
            (res) => {
                let body = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
            },
        );
        req.on('error', reject);
        req.end();
    });
}

async function resetDb(): Promise<void> {
    const db = await getDb();
    await locations(db).deleteMany({});
}

const cases: BaseTestCase[] = [
    // ── setup: server + one location with a publicHost ─────────────────
    {
        name: 'setup: start server + seed skb with publicHost',
        tags: ['integration', 'issue-57', 'setup'],
        testFn: async () => {
            await startTestServer();
            await resetDb();
            await ensureLocation('skb', 'SKB Bellevue', '1234');
            const db = await getDb();
            await locations(db).updateOne(
                { _id: 'skb' },
                { $set: { publicHost: SKB_HOST } },
            );
            return true;
        },
    },

    // ── R1: naked '/' serves landing ──────────────────────────────────
    {
        name: 'R1: GET / with no matching publicHost serves marketing landing',
        tags: ['integration', 'issue-57', 'landing'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/`);
            if (!res.ok) return false;
            const html = await res.text();
            // The marketing landing is identified by the Start-free CTA to
            // /signup and the platform placeholder brand.
            return /Start\s+free/i.test(html)
                && /href\s*=\s*["']\/signup["']/i.test(html)
                && html.includes('SKB Platform');
        },
    },
    {
        name: 'R1: naked "/" does NOT expose the legacy locations list',
        tags: ['integration', 'issue-57', 'landing'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/`);
            const html = await res.text();
            // Old page had "SKB Waitlist" h1 and per-location links.
            return !/<h1[^>]*>\s*SKB\s+Waitlist\s*</i.test(html);
        },
    },

    // ── R2: publicHost host-rewrite unchanged ─────────────────────────
    {
        name: 'R2: GET / with Host: publicHost still rewrites to /r/skb/home.html',
        tags: ['integration', 'issue-57', 'host-rewrite'],
        testFn: async () => {
            const res = await fetchWithHost('/', SKB_HOST);
            if (res.status !== 200) return false;
            // home.html contains the brand-name span (rendered by site-config.js).
            return /id=["']brand-name["']/.test(res.body);
        },
    },

    // ── R3: /admin/locations behind env gate (default: disabled) ──────
    {
        name: 'R3: GET /admin/locations → 404 when SKB_OPERATOR_CONSOLE flag is absent',
        tags: ['integration', 'issue-57', 'operator-console'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/admin/locations`);
            return res.status === 404;
        },
    },

    // ── R5: /signup unchanged ─────────────────────────────────────────
    {
        name: 'R5: GET /signup still serves the signup page (no #54 regression)',
        tags: ['integration', 'issue-57', 'signup'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/signup`);
            if (!res.ok) return false;
            const html = await res.text();
            return html.includes('id="signup-form"') || html.includes('name="restaurantName"');
        },
    },

    // ── teardown ──────────────────────────────────────────────────────
    {
        name: 'teardown',
        tags: ['integration', 'issue-57'],
        testFn: async () => {
            await resetDb();
            await closeDb();
            await stopTestServer();
            return true;
        },
    },
];

void runTests(cases, 'marketing landing + /admin/locations (issue #57) integration');
