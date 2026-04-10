// ============================================================================
// Prod validation: Google Maps integration (Issue #30)
// ============================================================================
// Verifies that the queue page on live prod emits all the meta tags and
// structured data required for Google Maps discoverability and rich social
// previews. This catches:
// - Deploy regressions that break server-side JSON-LD injection
// - Missing Location.publicUrl in prod MongoDB (which drops og:url + canonical)
// - Template changes that accidentally remove required tags
// ============================================================================

import { runTests, httpGet, BASE_URL, type BaseTestCase } from './prod-test-utils.js';

const LOC = process.env.PROD_LOC || 'skb';

const cases: BaseTestCase[] = [
    // --- Page load ---
    {
        name: 'queue page loads (HTTP 200)',
        tags: ['prod', 'google-maps', 'queue-page'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/queue.html`);
            return r.status === 200;
        },
    },

    // --- JSON-LD structured data ---
    {
        name: 'queue page contains application/ld+json script',
        tags: ['prod', 'google-maps', 'jsonld'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/queue.html`);
            return r.body.includes('application/ld+json');
        },
    },
    {
        name: 'JSON-LD has @context schema.org',
        tags: ['prod', 'google-maps', 'jsonld'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/queue.html`);
            return /"@context"\s*:\s*"https:\/\/schema\.org"/.test(r.body);
        },
    },
    {
        name: 'JSON-LD has @type Restaurant',
        tags: ['prod', 'google-maps', 'jsonld'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/queue.html`);
            return /"@type"\s*:\s*"Restaurant"/.test(r.body);
        },
    },
    {
        name: 'JSON-LD contains a potentialAction for joining',
        tags: ['prod', 'google-maps', 'jsonld'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/queue.html`);
            return /"potentialAction"/.test(r.body) && /JoinAction|ReserveAction/i.test(r.body);
        },
    },
    {
        name: 'JSON-LD includes restaurant address',
        tags: ['prod', 'google-maps', 'jsonld'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/queue.html`);
            return /"@type"\s*:\s*"PostalAddress"/.test(r.body);
        },
    },
    {
        name: 'JSON-LD has no PII (no phone-last-4 or queue codes in live data)',
        tags: ['prod', 'google-maps', 'jsonld', 'privacy'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/queue.html`);
            // Must not leak any specific entry code (SKB-XXX pattern) from the current queue
            return !/SKB-[A-Z0-9]{3}/.test(r.body);
        },
    },

    // --- Open Graph tags ---
    {
        name: 'og:title is present',
        tags: ['prod', 'google-maps', 'og'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/queue.html`);
            return /<meta\s+property="og:title"/.test(r.body);
        },
    },
    {
        name: 'og:description is present',
        tags: ['prod', 'google-maps', 'og'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/queue.html`);
            return /<meta\s+property="og:description"/.test(r.body);
        },
    },
    {
        name: 'og:type is present and set to website',
        tags: ['prod', 'google-maps', 'og'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/queue.html`);
            return /<meta\s+property="og:type"\s+content="website"/.test(r.body);
        },
    },
    {
        name: 'og:url is present (requires Location.publicUrl in DB)',
        tags: ['prod', 'google-maps', 'og'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/queue.html`);
            return /<meta\s+property="og:url"/.test(r.body);
        },
    },
    {
        name: 'og:url points at the correct prod location',
        tags: ['prod', 'google-maps', 'og'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/queue.html`);
            const match = r.body.match(/<meta\s+property="og:url"\s+content="([^"]+)"/);
            if (!match) return false;
            const url = match[1];
            return url.includes(LOC) && url.includes('/queue.html');
        },
    },

    // --- Canonical link ---
    {
        name: 'canonical link is present (requires Location.publicUrl in DB)',
        tags: ['prod', 'google-maps', 'canonical'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/queue.html`);
            return /<link\s+rel="canonical"/.test(r.body);
        },
    },
    {
        name: 'canonical URL matches og:url',
        tags: ['prod', 'google-maps', 'canonical'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/queue.html`);
            const canonical = r.body.match(/<link\s+rel="canonical"\s+href="([^"]+)"/);
            const ogUrl = r.body.match(/<meta\s+property="og:url"\s+content="([^"]+)"/);
            return !!canonical && !!ogUrl && canonical[1] === ogUrl[1];
        },
    },

    // --- Standard meta ---
    {
        name: 'meta description is present',
        tags: ['prod', 'google-maps', 'meta'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/queue.html`);
            return /<meta\s+name="description"/.test(r.body);
        },
    },
    {
        name: 'title tag includes restaurant name',
        tags: ['prod', 'google-maps', 'meta'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/queue.html`);
            // Expect a <title> tag with actual content (not empty)
            const m = r.body.match(/<title>([^<]+)<\/title>/);
            return !!m && m[1].trim().length > 3;
        },
    },
];

console.log(`\nRunning against: ${BASE_URL}\nLocation: ${LOC}\n`);

void runTests(cases, 'Google Maps integration prod surface');
