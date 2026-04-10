// ============================================================================
// Prod validation: compliance pages (privacy.html, terms.html)
// ============================================================================
// These pages MUST be reachable and contain specific content for the SKB
// A2P 10DLC campaign registration to remain valid. If The Campaign Registry
// ever re-scans these URLs and finds them missing or content-altered, the
// campaign can be rejected and SMS delivery will break. This suite catches
// any regression in the deployed compliance content.
// ============================================================================

import { runTests, httpGet, BASE_URL, type BaseTestCase } from './prod-test-utils.js';

const LOC = process.env.PROD_LOC || 'skb';

const cases: BaseTestCase[] = [
    // --- Privacy page ---
    {
        name: 'privacy.html is reachable (HTTP 200)',
        tags: ['prod', 'compliance', 'privacy'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/privacy.html`);
            return r.status === 200;
        },
    },
    {
        name: 'privacy.html is served as HTML (content-type)',
        tags: ['prod', 'compliance', 'privacy'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/privacy.html`);
            return /text\/html/i.test(r.headers['content-type'] || '');
        },
    },
    {
        name: 'privacy.html contains Wellness At Work LLC',
        tags: ['prod', 'compliance', 'privacy'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/privacy.html`);
            return r.body.includes('Wellness At Work LLC');
        },
    },
    {
        name: 'privacy.html contains STOP and HELP keywords',
        tags: ['prod', 'compliance', 'privacy'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/privacy.html`);
            return r.body.includes('STOP') && r.body.includes('HELP');
        },
    },
    {
        name: 'privacy.html contains support email',
        tags: ['prod', 'compliance', 'privacy'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/privacy.html`);
            return /sid@wellnessatwork\.me/i.test(r.body);
        },
    },
    {
        name: 'privacy.html states data is not sold or shared for marketing',
        tags: ['prod', 'compliance', 'privacy'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/privacy.html`);
            return /not\s+sell/i.test(r.body) || /do not sell/i.test(r.body);
        },
    },

    // --- Terms page ---
    {
        name: 'terms.html is reachable (HTTP 200)',
        tags: ['prod', 'compliance', 'terms'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/terms.html`);
            return r.status === 200;
        },
    },
    {
        name: 'terms.html is served as HTML',
        tags: ['prod', 'compliance', 'terms'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/terms.html`);
            return /text\/html/i.test(r.headers['content-type'] || '');
        },
    },
    {
        name: 'terms.html identifies Program as SKB Waitlist',
        tags: ['prod', 'compliance', 'terms'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/terms.html`);
            return /SKB Waitlist/i.test(r.body);
        },
    },
    {
        name: 'terms.html has "Message and data rates may apply" disclaimer',
        tags: ['prod', 'compliance', 'terms'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/terms.html`);
            return /message and data rates may apply/i.test(r.body);
        },
    },
    {
        name: 'terms.html has STOP in bold/strong tag',
        tags: ['prod', 'compliance', 'terms'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/terms.html`);
            return /<strong[^>]*>STOP<\/strong>/i.test(r.body) || /<b[^>]*>STOP<\/b>/i.test(r.body);
        },
    },
    {
        name: 'terms.html has HELP in bold/strong tag',
        tags: ['prod', 'compliance', 'terms'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/terms.html`);
            return /<strong[^>]*>HELP<\/strong>/i.test(r.body) || /<b[^>]*>HELP<\/b>/i.test(r.body);
        },
    },
    {
        name: 'terms.html mentions message frequency',
        tags: ['prod', 'compliance', 'terms'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/terms.html`);
            return /message frequency/i.test(r.body) || /messages per visit/i.test(r.body);
        },
    },
    {
        name: 'terms.html mentions supported carriers (AT&T, T-Mobile, Verizon)',
        tags: ['prod', 'compliance', 'terms'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/terms.html`);
            return /AT&amp;T|AT&T/i.test(r.body) && /T-Mobile/i.test(r.body) && /Verizon/i.test(r.body);
        },
    },

    // --- Cross-page links ---
    {
        name: 'privacy.html links to terms.html',
        tags: ['prod', 'compliance', 'cross-page'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/privacy.html`);
            return /terms\.html/i.test(r.body);
        },
    },
    {
        name: 'terms.html links to privacy.html',
        tags: ['prod', 'compliance', 'cross-page'],
        testFn: async () => {
            const r = await httpGet(`/r/${LOC}/terms.html`);
            return /privacy\.html/i.test(r.body);
        },
    },
];

console.log(`\nRunning against: ${BASE_URL}\nLocation: ${LOC}\n`);

void runTests(cases, 'Compliance pages prod surface');
