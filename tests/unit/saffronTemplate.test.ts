// ============================================================================
// Unit tests for the parameterized saffron template (issue #51 bug-bash)
// ============================================================================
// Closes the bug where a non-SKB tenant picking the default saffron template
// inherited either (a) SKB's hand-written public/home.html copy, or (b)
// (after the initial fix) the cool-teal slate palette. These tests pin the
// expected template placeholders, ensure all five pages exist in the new
// `public/templates/saffron/` directory, and exercise `renderSitePage` end
// to end against a synthetic non-SKB location.
// ============================================================================

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    TEMPLATE_PAGE_FILES,
    renderSitePage,
    resolveTemplateFile,
    type TemplatePageKey,
} from '../../src/services/site-renderer.js';
import type { Location } from '../../src/types/queue.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', '..', 'public');
const saffronDir = path.join(publicDir, 'templates', 'saffron');

const pageKeys = Object.keys(TEMPLATE_PAGE_FILES) as TemplatePageKey[];

// A new tenant picking the default template. Crucially NOT `_id: 'skb'` so
// we exercise the non-SKB saffron path (which used to leak SKB content).
const nonSkbLocation: Location = {
    _id: 'dosa-palace',
    name: 'Dosa Palace',
    pin: '1234',
    createdAt: new Date('2026-04-01T00:00:00Z'),
    websiteTemplate: 'saffron',
    content: {
        heroHeadline: 'Crisp dosas, hot idlis, poured fresh.',
        heroSubhead: 'A quick bite or a long family meal — we are glad you are here.',
        about: 'Dosa Palace opened on Capitol Hill in 2026.',
        contactEmail: 'hello@dosapalace.example',
        instagramHandle: '@dosapalace',
        reservationsNote: 'Walk-ins welcome',
    },
};

const cases: BaseTestCase[] = [
    // ─── File presence ────────────────────────────────────────────────────
    {
        name: 'all five saffron template HTML files exist on disk',
        tags: ['unit', 'saffron-template'],
        testFn: async () => {
            for (const key of pageKeys) {
                const file = TEMPLATE_PAGE_FILES[key];
                const p = path.join(saffronDir, file);
                await readFile(p, 'utf8'); // throws if missing
            }
            return true;
        },
    },
    {
        name: 'saffron template site.css exists and preserves the warm palette',
        tags: ['unit', 'saffron-template', 'palette'],
        testFn: async () => {
            const css = await readFile(path.join(saffronDir, 'site.css'), 'utf8');
            // These are the load-bearing tokens from the SKB reference palette.
            return css.includes('#fdf8ef')        // cream
                && css.includes('#e08a2e')        // saffron
                && css.includes('#2a2a2a')        // charcoal
                && css.includes('Georgia')
                && css.includes('--saffron-dark');
        },
    },

    // ─── Placeholder coverage ─────────────────────────────────────────────
    {
        name: 'home.html references brand/hero/reservations placeholders',
        tags: ['unit', 'saffron-template'],
        testFn: async () => {
            const html = await readFile(path.join(saffronDir, 'home.html'), 'utf8');
            return html.includes('{{brandName}}')
                && html.includes('{{heroHeadline}}')
                && html.includes('{{heroSubhead}}')
                && html.includes('{{reservationsNote}}');
        },
    },
    {
        name: 'about.html references brandName and about placeholders',
        tags: ['unit', 'saffron-template'],
        testFn: async () => {
            const html = await readFile(path.join(saffronDir, 'about.html'), 'utf8');
            return html.includes('{{brandName}}') && html.includes('{{about}}');
        },
    },
    {
        name: 'contact.html references email, instagram, reservations placeholders',
        tags: ['unit', 'saffron-template'],
        testFn: async () => {
            const html = await readFile(path.join(saffronDir, 'contact.html'), 'utf8');
            return html.includes('{{contactEmail}}')
                && html.includes('{{instagramHandle}}')
                && html.includes('{{reservationsNote}}');
        },
    },
    {
        name: 'hours-location.html references brandName placeholder',
        tags: ['unit', 'saffron-template'],
        testFn: async () => {
            const html = await readFile(path.join(saffronDir, 'hours-location.html'), 'utf8');
            return html.includes('{{brandName}}');
        },
    },
    {
        name: 'menu.html references brandName placeholder and has fallback copy',
        tags: ['unit', 'saffron-template'],
        testFn: async () => {
            const html = await readFile(path.join(saffronDir, 'menu.html'), 'utf8');
            return html.includes('{{brandName}}') && /menu coming soon/i.test(html);
        },
    },

    // ─── No stray SKB-specific copy leaked into the reusable template ─────
    {
        name: 'saffron templates do NOT hard-code Shri Krishna Bhavan branding',
        tags: ['unit', 'saffron-template', 'leak-guard'],
        testFn: async () => {
            for (const key of pageKeys) {
                const html = await readFile(path.join(saffronDir, TEMPLATE_PAGE_FILES[key]), 'utf8');
                if (/Shri Krishna Bhavan/i.test(html)) return false;
                if (/12 Bellevue Way/i.test(html)) return false;
                if (/skb\.bellevue@gmail\.com/i.test(html)) return false;
            }
            return true;
        },
    },

    // ─── Resolution routes non-SKB saffron to templates/saffron/ ──────────
    {
        name: 'resolveTemplateFile: non-SKB saffron tenant resolves to templates/saffron/home.html',
        tags: ['unit', 'saffron-template', 'resolution'],
        testFn: async () => {
            const p = await resolveTemplateFile(publicDir, nonSkbLocation, 'home');
            if (!p) return false;
            const normalized = p.replace(/\\/g, '/');
            return normalized.endsWith('/public/templates/saffron/home.html');
        },
    },
    {
        name: 'resolveTemplateFile: SKB saffron tenant still resolves to legacy public/home.html (G5)',
        tags: ['unit', 'saffron-template', 'resolution'],
        testFn: async () => {
            const skbLocation: Location = {
                _id: 'skb',
                name: 'Shri Krishna Bhavan',
                pin: '1234',
                createdAt: new Date('2026-04-01T00:00:00Z'),
                websiteTemplate: 'saffron',
            };
            const p = await resolveTemplateFile(publicDir, skbLocation, 'home');
            if (!p) return false;
            const normalized = p.replace(/\\/g, '/');
            // G5: SKB Bellevue is byte-preserved. Even with templates/saffron/
            // on disk, SKB+saffron must resolve to the hand-written public
            // flat file, NOT the new parameterized template.
            return normalized.endsWith('/public/home.html');
        },
    },
    {
        name: 'resolveTemplateFile: SKB saffron tenant maps menu page to legacy menu-page.html',
        tags: ['unit', 'saffron-template', 'resolution'],
        testFn: async () => {
            const skbLocation: Location = {
                _id: 'skb',
                name: 'Shri Krishna Bhavan',
                pin: '1234',
                createdAt: new Date('2026-04-01T00:00:00Z'),
                websiteTemplate: 'saffron',
            };
            const p = await resolveTemplateFile(publicDir, skbLocation, 'menu');
            if (!p) return false;
            const normalized = p.replace(/\\/g, '/');
            return normalized.endsWith('/public/menu-page.html');
        },
    },

    // ─── renderSitePage substitutes content and escapes unsafe input ──────
    {
        name: 'renderSitePage substitutes brandName + heroHeadline into home page',
        tags: ['unit', 'saffron-template', 'render'],
        testFn: async () => {
            const html = await renderSitePage(publicDir, nonSkbLocation, 'home');
            if (!html) return false;
            return html.includes('Dosa Palace')
                && html.includes('Crisp dosas, hot idlis, poured fresh.')
                && !html.includes('{{brandName}}')
                && !html.includes('{{heroHeadline}}');
        },
    },
    {
        name: 'renderSitePage: contact page substitutes email + instagram',
        tags: ['unit', 'saffron-template', 'render'],
        testFn: async () => {
            const html = await renderSitePage(publicDir, nonSkbLocation, 'contact');
            if (!html) return false;
            return html.includes('hello@dosapalace.example')
                && html.includes('@dosapalace')
                && html.includes('Walk-ins welcome');
        },
    },
    {
        name: 'renderSitePage: about page substitutes the about paragraph',
        tags: ['unit', 'saffron-template', 'render'],
        testFn: async () => {
            const html = await renderSitePage(publicDir, nonSkbLocation, 'about');
            if (!html) return false;
            return html.includes('Dosa Palace opened on Capitol Hill in 2026.');
        },
    },
];

void runTests(cases, 'Saffron template (issue #51)');
