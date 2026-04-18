// ============================================================================
// Unit tests for site-renderer (issue #56)
// ============================================================================
// The renderer resolves template files from disk and performs {{placeholder}}
// substitution. These tests hit the pure helpers to avoid disk I/O and DB.
// ============================================================================

import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    renderTemplate,
    resolveTemplateKey,
    PLACEHOLDER_KEYS,
} from '../../src/services/site-renderer.js';
import type { Location } from '../../src/types/queue.js';

const baseLocation: Location = {
    _id: 'ramen',
    name: 'Ramen Yokocho',
    pin: '1234',
    createdAt: new Date('2026-04-01T00:00:00Z'),
};

const cases: BaseTestCase[] = [
    // ─── Template key resolution ─────────────────────────────────────────
    {
        name: 'resolveTemplateKey returns saffron when unset (preserves SKB look)',
        tags: ['unit', 'site-renderer'],
        testFn: async () => resolveTemplateKey(baseLocation) === 'saffron',
    },
    {
        name: 'resolveTemplateKey returns slate when explicitly set',
        tags: ['unit', 'site-renderer'],
        testFn: async () => {
            const loc = { ...baseLocation, websiteTemplate: 'slate' as const };
            return resolveTemplateKey(loc) === 'slate';
        },
    },
    {
        name: 'resolveTemplateKey falls back to saffron when unknown key stored',
        tags: ['unit', 'site-renderer'],
        testFn: async () => {
            const loc = { ...baseLocation, websiteTemplate: 'vaporwave' as unknown as 'saffron' };
            return resolveTemplateKey(loc) === 'saffron';
        },
    },

    // ─── Placeholder substitution ────────────────────────────────────────
    {
        name: 'substitutes known placeholders and leaves others untouched',
        tags: ['unit', 'site-renderer'],
        testFn: async () => {
            const tpl = '<h1>{{brandName}}</h1><p>{{heroHeadline}}</p><p>{{unknownPlaceholder}}</p>';
            const loc: Location = { ...baseLocation, content: { heroHeadline: 'Hot broth tonight.' } };
            const out = renderTemplate(tpl, loc);
            return out.includes('<h1>Ramen Yokocho</h1>')
                && out.includes('<p>Hot broth tonight.</p>')
                && out.includes('{{unknownPlaceholder}}'); // unknown placeholders survive (author intent preserved)
        },
    },
    {
        name: 'missing content fields fall back to empty string (template supplies its own default)',
        tags: ['unit', 'site-renderer'],
        testFn: async () => {
            const tpl = '<p>[{{heroHeadline}}]</p>';
            const out = renderTemplate(tpl, baseLocation);
            return out === '<p>[]</p>';
        },
    },
    {
        name: 'HTML-unsafe characters in content are escaped',
        tags: ['unit', 'site-renderer'],
        testFn: async () => {
            const tpl = '<h1>{{brandName}}</h1><p>{{heroHeadline}}</p>';
            const loc: Location = {
                ...baseLocation,
                name: 'A & B "Café"',
                content: { heroHeadline: '<script>alert(1)</script>' },
            };
            const out = renderTemplate(tpl, loc);
            return out.includes('A &amp; B &quot;Café&quot;')
                && out.includes('&lt;script&gt;alert(1)&lt;/script&gt;')
                && !out.includes('<script>alert(1)</script>');
        },
    },
    {
        name: 'placeholder substitution is idempotent on already-rendered output',
        tags: ['unit', 'site-renderer'],
        testFn: async () => {
            const tpl = '<h1>{{brandName}}</h1>';
            const once = renderTemplate(tpl, baseLocation);
            const twice = renderTemplate(once, baseLocation);
            return once === twice;
        },
    },
    {
        name: 'PLACEHOLDER_KEYS documents the full supported set',
        tags: ['unit', 'site-renderer'],
        testFn: async () => {
            const expected: string[] = [
                'brandName',
                'heroHeadline',
                'heroSubhead',
                'about',
                'contactEmail',
                'instagramHandle',
                'reservationsNote',
            ];
            return expected.every(k => (PLACEHOLDER_KEYS as readonly string[]).includes(k));
        },
    },
    {
        name: 'instagramHandle placeholder preserves literal @ symbol',
        tags: ['unit', 'site-renderer'],
        testFn: async () => {
            const tpl = '<a>{{instagramHandle}}</a>';
            const loc: Location = { ...baseLocation, content: { instagramHandle: '@ramenyokocho' } };
            return renderTemplate(tpl, loc) === '<a>@ramenyokocho</a>';
        },
    },
];

void runTests(cases, 'Site renderer');
