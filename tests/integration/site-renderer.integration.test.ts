// ============================================================================
// Integration tests — website template + content round-trip (issue #56)
// ============================================================================
// Boots a real server against a dedicated test DB. Exercises the full chain:
//   - POST /r/:loc/api/host/website-config  (save template + content)
//   - GET  /r/:loc/api/host/website-config  (load)
//   - GET  /r/:loc/api/public-config        (template + content exposed publicly)
//   - GET  /r/:loc/                         (server renders correct template)
//   - GET  /r/:loc/about                    (template is consistent across pages)
// ============================================================================

process.env.SKB_HOST_PIN ??= '1234';
process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_site_renderer_test';
process.env.PORT ??= '15399';
process.env.FRAIM_TEST_SERVER_PORT ??= '15399';
process.env.FRAIM_BRANCH ??= '';

import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    startTestServer,
    stopTestServer,
    getTestServerUrl,
} from '../shared-server-utils.js';
import { getDb, locations } from '../../src/core/db/mongo.js';
import { ensureLocation } from '../../src/services/locations.js';

async function loginCookie(loc: string): Promise<string> {
    const res = await fetch(`${getTestServerUrl()}/r/${loc}/api/host/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '1234' }),
    });
    if (!res.ok) throw new Error(`login failed for ${loc}: ${res.status}`);
    return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

const cases: BaseTestCase[] = [
    {
        name: 'site-renderer: server starts',
        tags: ['integration', 'site-renderer', 'setup'],
        testFn: async () => {
            await startTestServer();
            // Bootstrap two tenants with the same PIN so login works for both.
            await ensureLocation('skb', 'Shri Krishna Bhavan', '1234');
            await ensureLocation('ramen', 'Ramen Yokocho', '1234');
            // Wipe any lingering template/content state from prior runs.
            const db = await getDb();
            await locations(db).updateMany(
                { _id: { $in: ['skb', 'ramen'] } },
                { $unset: { websiteTemplate: '', content: '' } },
            );
            return true;
        },
    },

    // ─── R1: Default (no template set) renders saffron, preserving SKB ────
    {
        name: 'R1: /r/skb/ serves the saffron template by default',
        tags: ['integration', 'site-renderer', 'acceptance'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/r/skb/`, { redirect: 'manual' });
            if (!res.ok) return false;
            const html = await res.text();
            // Saffron = warm palette + existing SKB brand block. "Join the Waitlist"
            // CTA is shared across templates, but the banner "Last orders daily"
            // is the saffron banner from public/home.html.
            return html.includes('Last orders daily at 2:10 PM')
                && html.includes('Shri Krishna Bhavan')
                && !html.includes('Kitchen open until 10:00 PM'); // slate banner
        },
    },

    // ─── Website-config endpoint: unauthenticated reject ──────────────────
    {
        name: 'website-config: GET without cookie returns 401',
        tags: ['integration', 'site-renderer', 'auth'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/r/skb/api/host/website-config`);
            return res.status === 401;
        },
    },
    {
        name: 'website-config: POST without cookie returns 401',
        tags: ['integration', 'site-renderer', 'auth'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/r/skb/api/host/website-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ websiteTemplate: 'slate' }),
            });
            return res.status === 401;
        },
    },

    // ─── GET /website-config returns defaults for a fresh location ────────
    {
        name: 'website-config: GET returns saffron as default when unset',
        tags: ['integration', 'site-renderer'],
        testFn: async () => {
            const cookie = await loginCookie('skb');
            const res = await fetch(`${getTestServerUrl()}/r/skb/api/host/website-config`, {
                headers: { Cookie: cookie },
            });
            if (!res.ok) return false;
            const body = await res.json() as { websiteTemplate?: string; content?: unknown };
            return body.websiteTemplate === 'saffron' && (body.content === null || body.content === undefined);
        },
    },

    // ─── Validation rejects unknown templates ─────────────────────────────
    {
        name: 'website-config: POST rejects unknown template key with 400',
        tags: ['integration', 'site-renderer', 'validation'],
        testFn: async () => {
            const cookie = await loginCookie('skb');
            const res = await fetch(`${getTestServerUrl()}/r/skb/api/host/website-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ websiteTemplate: 'noodle' }),
            });
            return res.status === 400;
        },
    },

    // ─── R2: Switching ramen to slate serves slate HTML ───────────────────
    {
        name: 'R2: setting websiteTemplate="slate" on ramen serves the slate template',
        tags: ['integration', 'site-renderer', 'acceptance'],
        testFn: async () => {
            const cookie = await loginCookie('ramen');
            const save = await fetch(`${getTestServerUrl()}/r/ramen/api/host/website-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({
                    websiteTemplate: 'slate',
                    content: {
                        heroHeadline: 'Slow-simmered tonkotsu, ready tonight.',
                        heroSubhead: 'No app, no reservation — just join from your phone.',
                        about: 'Ramen Yokocho opened in 2023 on Capitol Hill.',
                        instagramHandle: '@ramenyokocho',
                    },
                }),
            });
            if (!save.ok) return false;

            const res = await fetch(`${getTestServerUrl()}/r/ramen/`);
            if (!res.ok) return false;
            const html = await res.text();
            return html.includes('Slow-simmered tonkotsu')
                && html.includes('Kitchen open until 10:00 PM') // slate banner
                && !html.includes('Last orders daily at 2:10 PM'); // not saffron
        },
    },

    // ─── R4: content.heroHeadline overrides template default ──────────────
    {
        name: 'R4: content.heroHeadline overrides template default',
        tags: ['integration', 'site-renderer', 'acceptance'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/r/ramen/`);
            const html = await res.text();
            return html.includes('Slow-simmered tonkotsu, ready tonight.');
        },
    },

    // ─── R3+R5: Switching back to saffron preserves content (no data loss) ─
    {
        name: 'R3/R5: switching template back preserves content; absent fields fall back',
        tags: ['integration', 'site-renderer', 'acceptance'],
        testFn: async () => {
            const cookie = await loginCookie('ramen');
            // Switch to saffron, keep content untouched.
            const swap = await fetch(`${getTestServerUrl()}/r/ramen/api/host/website-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ websiteTemplate: 'saffron' }),
            });
            if (!swap.ok) return false;
            const res = await fetch(`${getTestServerUrl()}/r/ramen/api/host/website-config`, {
                headers: { Cookie: cookie },
            });
            const body = await res.json() as { websiteTemplate: string; content?: { heroHeadline?: string } };
            return body.websiteTemplate === 'saffron'
                && body.content?.heroHeadline === 'Slow-simmered tonkotsu, ready tonight.';
        },
    },

    // ─── Public config exposes template + content without auth ────────────
    {
        name: 'public-config: exposes websiteTemplate + content (read-only, no PIN, no auth leakage)',
        tags: ['integration', 'site-renderer', 'public-config'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/r/ramen/api/public-config`);
            if (!res.ok) return false;
            const body = await res.json() as {
                websiteTemplate?: string;
                content?: { heroHeadline?: string };
                pin?: string;
            };
            return body.websiteTemplate === 'saffron'
                && body.content?.heroHeadline === 'Slow-simmered tonkotsu, ready tonight.'
                && body.pin === undefined; // never leak the PIN
        },
    },

    // ─── Template consistency across pages ─────────────────────────────────
    {
        name: 'template consistency: /r/:loc/about uses the same template as /r/:loc/',
        tags: ['integration', 'site-renderer'],
        testFn: async () => {
            const cookie = await loginCookie('ramen');
            // Lock back to slate for this test.
            await fetch(`${getTestServerUrl()}/r/ramen/api/host/website-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ websiteTemplate: 'slate' }),
            });
            const about = await fetch(`${getTestServerUrl()}/r/ramen/about`);
            if (!about.ok) return false;
            const html = await about.text();
            // Slate 'About' page must carry the slate banner + the brand name.
            return html.includes('Kitchen open until 10:00 PM')
                && html.includes('Ramen Yokocho');
        },
    },

    // ─── XSS defense: HTML-unsafe content must be escaped ─────────────────
    {
        name: 'security: content is HTML-escaped when rendered (defense against stored XSS)',
        tags: ['integration', 'site-renderer', 'security'],
        testFn: async () => {
            const cookie = await loginCookie('ramen');
            const save = await fetch(`${getTestServerUrl()}/r/ramen/api/host/website-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({
                    websiteTemplate: 'slate',
                    content: { heroHeadline: '<script>alert(1)</script>' },
                }),
            });
            if (!save.ok) return false;
            const res = await fetch(`${getTestServerUrl()}/r/ramen/`);
            const html = await res.text();
            return html.includes('&lt;script&gt;alert(1)&lt;/script&gt;')
                && !html.includes('<script>alert(1)</script>');
        },
    },

    // ─── Teardown ──────────────────────────────────────────────────────────
    {
        name: 'site-renderer: teardown',
        tags: ['integration', 'site-renderer'],
        testFn: async () => { await stopTestServer(); return true; },
    },
];

void runTests(cases, 'site-renderer (integration)');
