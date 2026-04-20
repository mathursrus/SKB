// ============================================================================
// Unit tests for site-renderer (issue #56)
// ============================================================================
// The renderer resolves template files from disk and performs {{placeholder}}
// substitution. These tests hit the pure helpers to avoid disk I/O and DB.
// ============================================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    renderTemplate,
    resolveTemplateKey,
    resolveTemplateFile,
    PLACEHOLDER_KEYS,
} from '../../src/services/site-renderer.js';
import type { Location } from '../../src/types/queue.js';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');

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

    // ─── Template file resolution per tenant (bug-bash fix, issue #51) ────
    // A new tenant using saffron (the default) previously fell back to
    // `public/home.html`, which carries hardcoded "Shri Krishna Bhavan"
    // content with no placeholder substitution. The fallback is now
    // SKB-only; other tenants cascade through saffron's template dir then
    // slate so they always get a placeholder-aware template.
    {
        name: 'resolveTemplateFile: SKB + saffron falls back to legacy public/home.html',
        tags: ['unit', 'site-renderer', 'bug-bash-51'],
        testFn: async () => {
            const loc = { _id: 'skb', websiteTemplate: 'saffron' as const };
            const resolved = await resolveTemplateFile(publicDir, loc, 'home');
            return resolved !== null && resolved.endsWith(path.join('public', 'home.html'));
        },
    },
    {
        name: 'resolveTemplateFile: non-SKB + saffron does NOT fall back to legacy SKB home.html',
        tags: ['unit', 'site-renderer', 'bug-bash-51'],
        testFn: async () => {
            const loc = { _id: 'new-tenant', websiteTemplate: 'saffron' as const };
            const resolved = await resolveTemplateFile(publicDir, loc, 'home');
            // Should land on slate as the placeholder-aware fallback until a
            // real saffron template dir ships. The critical invariant is
            // that it is NOT the legacy public/home.html.
            return resolved !== null && !resolved.endsWith(path.join('public', 'home.html'));
        },
    },
    {
        name: 'resolveTemplateFile: non-SKB + slate resolves templates/slate/home.html',
        tags: ['unit', 'site-renderer', 'bug-bash-51'],
        testFn: async () => {
            const loc = { _id: 'ramen', websiteTemplate: 'slate' as const };
            const resolved = await resolveTemplateFile(publicDir, loc, 'home');
            return resolved !== null && resolved.endsWith(path.join('templates', 'slate', 'home.html'));
        },
    },

    // ─── knownFor block iteration (signature dishes) ─────────────────────
    {
        name: 'knownFor empty → renders 3 default fallback cards (swatch, no img)',
        tags: ['unit', 'site-renderer', 'known-for'],
        testFn: async () => {
            const tpl = '<div>{{#each knownFor}}<p>{{title}}</p>{{/each}}</div>';
            const out = renderTemplate(tpl, baseLocation);
            return out === '<div><p>Signature Dish</p><p>House Specialty</p><p>Crowd Favorite</p></div>';
        },
    },
    {
        name: 'knownFor with 1 item pads to 3 using defaults',
        tags: ['unit', 'site-renderer', 'known-for'],
        testFn: async () => {
            const tpl = '<div>{{#each knownFor}}<p>{{title}}</p>{{/each}}</div>';
            const loc = { ...baseLocation, content: { knownFor: [{ title: 'Tonkotsu', desc: '36-hour', image: '' }] } };
            const out = renderTemplate(tpl, loc);
            return out === '<div><p>Tonkotsu</p><p>House Specialty</p><p>Crowd Favorite</p></div>';
        },
    },
    {
        name: 'knownFor with 4 items clamps to 3',
        tags: ['unit', 'site-renderer', 'known-for'],
        testFn: async () => {
            const tpl = '<div>{{#each knownFor}}<p>{{title}}</p>{{/each}}</div>';
            const loc = { ...baseLocation, content: { knownFor: [
                { title: 'A', desc: '', image: '' },
                { title: 'B', desc: '', image: '' },
                { title: 'C', desc: '', image: '' },
                { title: 'D', desc: '', image: '' },
            ] } };
            return renderTemplate(tpl, loc) === '<div><p>A</p><p>B</p><p>C</p></div>';
        },
    },
    {
        name: 'knownFor: {{#if image}} block renders only when image present',
        tags: ['unit', 'site-renderer', 'known-for'],
        testFn: async () => {
            const tpl = '{{#each knownFor}}[{{#if image}}IMG:{{image}}{{/if}}{{#unless image}}SWATCH{{/unless}}]{{/each}}';
            const loc = { ...baseLocation, content: { knownFor: [
                { title: 'A', desc: '', image: '/assets/a.jpg' },
                { title: 'B', desc: '', image: '' },
                { title: 'C', desc: '', image: '' },
            ] } };
            return renderTemplate(tpl, loc) === '[IMG:/assets/a.jpg][SWATCH][SWATCH]';
        },
    },
    {
        name: 'knownFor: values are HTML-escaped to defend against stored XSS',
        tags: ['unit', 'site-renderer', 'known-for', 'security'],
        testFn: async () => {
            const tpl = '{{#each knownFor}}<p>{{title}}:{{desc}}</p>{{/each}}';
            const loc = { ...baseLocation, content: { knownFor: [
                { title: '<script>', desc: 'A "quote" & <b>', image: '' },
                { title: 'B', desc: '', image: '' },
                { title: 'C', desc: '', image: '' },
            ] } };
            const out = renderTemplate(tpl, loc);
            return out.includes('&lt;script&gt;')
                && out.includes('&quot;quote&quot;')
                && out.includes('&amp;')
                && !out.includes('<script>')
                && !out.includes('<b>');
        },
    },
    {
        name: 'knownFor: scalar tokens inside each block resolve per-item, not location-level',
        tags: ['unit', 'site-renderer', 'known-for'],
        testFn: async () => {
            // {{title}} inside #each should be per-item; outside should NOT resolve
            // (title isn't in PLACEHOLDER_KEYS, so it passes through unchanged).
            const tpl = 'outer:{{title}}|{{#each knownFor}}[{{title}}]{{/each}}';
            const loc = { ...baseLocation, content: { knownFor: [
                { title: 'A', desc: '', image: '' },
                { title: 'B', desc: '', image: '' },
                { title: 'C', desc: '', image: '' },
            ] } };
            return renderTemplate(tpl, loc) === 'outer:{{title}}|[A][B][C]';
        },
    },
    {
        name: 'knownFor + scalar placeholders coexist (heroHeadline still resolves)',
        tags: ['unit', 'site-renderer', 'known-for'],
        testFn: async () => {
            const tpl = '{{heroHeadline}}|{{#each knownFor}}{{title}},{{/each}}';
            const loc = { ...baseLocation, content: {
                heroHeadline: 'Hello',
                knownFor: [
                    { title: 'A', desc: '', image: '' },
                    { title: 'B', desc: '', image: '' },
                    { title: 'C', desc: '', image: '' },
                ],
            } };
            return renderTemplate(tpl, loc) === 'Hello|A,B,C,';
        },
    },
    {
        name: 'menu renderer expands image and ingredient blocks for each item',
        tags: ['unit', 'site-renderer', 'menu'],
        testFn: async () => {
            const tpl = '{{#each menu.sections}}<section>{{#items}}<article>{{#if image}}<img src="{{image}}" />{{/if}}<h4>{{name}}</h4>{{#if hasRequiredIngredients}}{{#requiredIngredients}}<span>{{.}}</span>{{/requiredIngredients}}{{/if}}{{#if hasOptionalIngredients}}{{#optionalIngredients}}<em>{{.}}</em>{{/optionalIngredients}}{{/if}}</article>{{/items}}</section>{{/each}}';
            const loc: Location = {
                ...baseLocation,
                menu: {
                    sections: [{
                        id: 's1',
                        title: 'Apps',
                        items: [{
                            id: 'i1',
                            name: 'Samosa',
                            image: '/assets/skb/menu/samosa.jpg',
                            requiredIngredients: ['Potato'],
                            optionalIngredients: ['Mint chutney'],
                        }],
                    }],
                },
            };
            const out = renderTemplate(tpl, loc);
            return out.includes('img src="/assets/skb/menu/samosa.jpg"')
                && out.includes('<span>Potato</span>')
                && out.includes('<em>Mint chutney</em>');
        },
    },
];

void runTests(cases, 'Site renderer');
