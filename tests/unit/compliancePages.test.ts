// ============================================================================
// Unit tests for compliance pages (public/privacy.html, public/terms.html)
// ============================================================================
// These pages are load-bearing for A2P 10DLC campaign registration with
// The Campaign Registry (TCR). Carriers verify the linked privacy/terms URLs
// contain specific elements — if any of these go missing during an edit,
// the campaign can be rejected retroactively and SMS delivery breaks.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests, type BaseTestCase } from '../test-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', '..', 'public');

function loadPage(name: string): string {
    return fs.readFileSync(path.join(PUBLIC_DIR, name), 'utf-8');
}

const privacy = loadPage('privacy.html');
const terms = loadPage('terms.html');

const cases: BaseTestCase[] = [
    // --- privacy.html structural checks ---
    {
        name: 'privacy.html exists and is non-empty',
        tags: ['unit', 'compliance', 'privacy'],
        testFn: async () => privacy.length > 1000,
    },
    {
        name: 'privacy.html declares the brand: Wellness At Work LLC',
        tags: ['unit', 'compliance', 'privacy'],
        testFn: async () => privacy.includes('Wellness At Work LLC'),
    },
    {
        name: 'privacy.html has an effective date',
        tags: ['unit', 'compliance', 'privacy'],
        testFn: async () => /Effective date/i.test(privacy),
    },
    {
        name: 'privacy.html describes data collected (phone number)',
        tags: ['unit', 'compliance', 'privacy'],
        testFn: async () => /phone number/i.test(privacy),
    },
    {
        name: 'privacy.html describes data collected (name)',
        tags: ['unit', 'compliance', 'privacy'],
        testFn: async () => /name/i.test(privacy),
    },
    {
        name: 'privacy.html states data is not sold or shared for marketing',
        tags: ['unit', 'compliance', 'privacy'],
        testFn: async () => /not\s+sell/i.test(privacy) || /not\s+share/i.test(privacy),
    },
    {
        name: 'privacy.html mentions STOP opt-out keyword',
        tags: ['unit', 'compliance', 'privacy'],
        testFn: async () => privacy.includes('STOP'),
    },
    {
        name: 'privacy.html mentions HELP keyword',
        tags: ['unit', 'compliance', 'privacy'],
        testFn: async () => privacy.includes('HELP'),
    },
    {
        name: 'privacy.html includes contact email',
        tags: ['unit', 'compliance', 'privacy'],
        testFn: async () => /sid@wellnessatwork\.me/i.test(privacy),
    },
    {
        name: 'privacy.html mentions Twilio as data processor',
        tags: ['unit', 'compliance', 'privacy'],
        testFn: async () => /Twilio/i.test(privacy),
    },
    {
        name: 'privacy.html has business address (Sammamish, WA)',
        tags: ['unit', 'compliance', 'privacy'],
        testFn: async () => /Sammamish/i.test(privacy) && /WA/i.test(privacy),
    },
    {
        name: 'privacy.html links to terms page',
        tags: ['unit', 'compliance', 'privacy'],
        testFn: async () => /terms\.html/i.test(privacy),
    },

    // --- terms.html structural checks ---
    {
        name: 'terms.html exists and is non-empty',
        tags: ['unit', 'compliance', 'terms'],
        testFn: async () => terms.length > 1000,
    },
    {
        name: 'terms.html declares the brand: Wellness At Work LLC',
        tags: ['unit', 'compliance', 'terms'],
        testFn: async () => terms.includes('Wellness At Work LLC'),
    },
    {
        name: 'terms.html has an effective date',
        tags: ['unit', 'compliance', 'terms'],
        testFn: async () => /Effective date/i.test(terms),
    },
    {
        name: 'terms.html has a Program name field',
        tags: ['unit', 'compliance', 'terms'],
        testFn: async () => /Program name/i.test(terms),
    },
    {
        name: 'terms.html identifies the Program as SKB Waitlist',
        tags: ['unit', 'compliance', 'terms'],
        testFn: async () => /SKB Waitlist/i.test(terms),
    },
    {
        name: 'terms.html discloses message frequency',
        tags: ['unit', 'compliance', 'terms'],
        testFn: async () => /message frequency/i.test(terms) || /messages per visit/i.test(terms),
    },
    {
        name: 'terms.html has "Message and data rates may apply" disclaimer',
        tags: ['unit', 'compliance', 'terms'],
        testFn: async () => /message and data rates may apply/i.test(terms),
    },
    {
        name: 'terms.html mentions STOP opt-out',
        tags: ['unit', 'compliance', 'terms'],
        testFn: async () => terms.includes('STOP'),
    },
    {
        name: 'terms.html STOP is in bold/strong tag (TCR requirement)',
        tags: ['unit', 'compliance', 'terms'],
        testFn: async () => /<strong[^>]*>STOP<\/strong>/i.test(terms) || /<b[^>]*>STOP<\/b>/i.test(terms),
    },
    {
        name: 'terms.html mentions HELP',
        tags: ['unit', 'compliance', 'terms'],
        testFn: async () => terms.includes('HELP'),
    },
    {
        name: 'terms.html HELP is in bold/strong tag',
        tags: ['unit', 'compliance', 'terms'],
        testFn: async () => /<strong[^>]*>HELP<\/strong>/i.test(terms) || /<b[^>]*>HELP<\/b>/i.test(terms),
    },
    {
        name: 'terms.html includes support contact email',
        tags: ['unit', 'compliance', 'terms'],
        testFn: async () => /sid@wellnessatwork\.me/i.test(terms),
    },
    {
        name: 'terms.html describes how to opt in',
        tags: ['unit', 'compliance', 'terms'],
        testFn: async () => /How to opt in/i.test(terms) || /opt in/i.test(terms),
    },
    {
        name: 'terms.html describes how to opt out',
        tags: ['unit', 'compliance', 'terms'],
        testFn: async () => /How to opt out/i.test(terms) || /opt out/i.test(terms),
    },
    {
        name: 'terms.html mentions supported carriers',
        tags: ['unit', 'compliance', 'terms'],
        testFn: async () =>
            /AT&amp;T|AT&T/i.test(terms) && /T-Mobile/i.test(terms) && /Verizon/i.test(terms),
    },
    {
        name: 'terms.html links to privacy policy',
        tags: ['unit', 'compliance', 'terms'],
        testFn: async () => /privacy\.html/i.test(terms),
    },
    {
        name: 'terms.html has business address (Sammamish, WA)',
        tags: ['unit', 'compliance', 'terms'],
        testFn: async () => /Sammamish/i.test(terms) && /WA/i.test(terms),
    },

    // --- cross-page consistency ---
    {
        name: 'privacy and terms share the same effective date format',
        tags: ['unit', 'compliance', 'cross-page'],
        testFn: async () => {
            const pMatch = privacy.match(/Effective date:<\/strong>\s*([^<]+)/i);
            const tMatch = terms.match(/Effective date:<\/strong>\s*([^<]+)/i);
            return !!pMatch && !!tMatch && pMatch[1].trim() === tMatch[1].trim();
        },
    },
    {
        name: 'both pages have valid HTML doctype',
        tags: ['unit', 'compliance', 'cross-page'],
        testFn: async () => /<!doctype html>/i.test(privacy) && /<!doctype html>/i.test(terms),
    },
    {
        name: 'both pages have viewport meta for mobile rendering',
        tags: ['unit', 'compliance', 'cross-page'],
        testFn: async () =>
            /<meta name="viewport"/.test(privacy) && /<meta name="viewport"/.test(terms),
    },
];

void runTests(cases, 'Compliance pages (privacy.html, terms.html)');
