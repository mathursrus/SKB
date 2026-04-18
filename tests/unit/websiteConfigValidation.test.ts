// ============================================================================
// Unit tests for validateWebsiteConfigUpdate (issue #56)
// ============================================================================
// Pure validator for the Website tab's payload: { websiteTemplate, content }.
// DB-bound paths live in the integration suite.
// ============================================================================

import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    validateWebsiteConfigUpdate,
    VALID_WEBSITE_TEMPLATES,
    MAX_HERO_HEADLINE_LEN,
    MAX_HERO_SUBHEAD_LEN,
    MAX_ABOUT_LEN,
    MAX_RESERVATIONS_NOTE_LEN,
    MAX_KNOWN_FOR_ITEMS,
    MAX_KNOWN_FOR_TITLE_LEN,
    MAX_KNOWN_FOR_DESC_LEN,
    MAX_INSTAGRAM_HANDLE_LEN,
    MAX_CONTACT_EMAIL_LEN,
} from '../../src/services/locations.js';

function throws(fn: () => void, match?: string): boolean {
    try {
        fn();
        return false;
    } catch (e) {
        if (!match) return true;
        return e instanceof Error && e.message.includes(match);
    }
}

const cases: BaseTestCase[] = [
    // Valid payloads — must NOT throw
    {
        name: 'empty update passes',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => {
            validateWebsiteConfigUpdate({});
            return true;
        },
    },
    {
        name: 'valid saffron template passes',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => {
            validateWebsiteConfigUpdate({ websiteTemplate: 'saffron' });
            return true;
        },
    },
    {
        name: 'valid slate template passes',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => {
            validateWebsiteConfigUpdate({ websiteTemplate: 'slate' });
            return true;
        },
    },
    {
        name: 'null websiteTemplate passes (reset to default)',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => {
            validateWebsiteConfigUpdate({ websiteTemplate: null });
            return true;
        },
    },
    {
        name: 'valid full content object passes',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => {
            validateWebsiteConfigUpdate({
                content: {
                    heroHeadline: 'Slow-simmered tonkotsu, ready tonight.',
                    heroSubhead: 'No app, no reservation — just join from your phone.',
                    about: 'Ramen Yokocho opened in 2023 on Capitol Hill.',
                    contactEmail: 'hello@ramenyokocho.com',
                    instagramHandle: '@ramenyokocho',
                    reservationsNote: 'Walk-ins welcome — no reservations.',
                    knownFor: [
                        { title: 'Tonkotsu Shio', desc: '36-hour pork broth.', image: '/assets/slug/a.webp' },
                        { title: 'Spicy Miso', desc: 'House blend, medium heat.', image: '/assets/slug/b.webp' },
                    ],
                },
            });
            return true;
        },
    },
    {
        name: 'null content passes (clear everything)',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => {
            validateWebsiteConfigUpdate({ content: null });
            return true;
        },
    },
    {
        name: 'empty-string overrides are allowed (user clearing a single field)',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => {
            validateWebsiteConfigUpdate({ content: { heroHeadline: '', about: '' } });
            return true;
        },
    },

    // Invalid payloads — must throw
    {
        name: 'invalid websiteTemplate key rejected',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => throws(
            () => validateWebsiteConfigUpdate({ websiteTemplate: 'noodle' as unknown as 'saffron' }),
            'websiteTemplate',
        ),
    },
    {
        name: 'VALID_WEBSITE_TEMPLATES exposes exactly the two supported keys',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => {
            return VALID_WEBSITE_TEMPLATES.length === 2
                && VALID_WEBSITE_TEMPLATES.includes('saffron')
                && VALID_WEBSITE_TEMPLATES.includes('slate');
        },
    },
    {
        name: 'oversize heroHeadline rejected',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => throws(
            () => validateWebsiteConfigUpdate({ content: { heroHeadline: 'x'.repeat(MAX_HERO_HEADLINE_LEN + 1) } }),
            'heroHeadline',
        ),
    },
    {
        name: 'oversize heroSubhead rejected',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => throws(
            () => validateWebsiteConfigUpdate({ content: { heroSubhead: 'x'.repeat(MAX_HERO_SUBHEAD_LEN + 1) } }),
            'heroSubhead',
        ),
    },
    {
        name: 'oversize about rejected',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => throws(
            () => validateWebsiteConfigUpdate({ content: { about: 'x'.repeat(MAX_ABOUT_LEN + 1) } }),
            'about',
        ),
    },
    {
        name: 'oversize reservationsNote rejected',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => throws(
            () => validateWebsiteConfigUpdate({ content: { reservationsNote: 'x'.repeat(MAX_RESERVATIONS_NOTE_LEN + 1) } }),
            'reservationsNote',
        ),
    },
    {
        name: 'oversize contactEmail rejected',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => throws(
            () => validateWebsiteConfigUpdate({ content: { contactEmail: 'x'.repeat(MAX_CONTACT_EMAIL_LEN + 1) } }),
            'contactEmail',
        ),
    },
    {
        name: 'malformed contactEmail rejected',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => throws(
            () => validateWebsiteConfigUpdate({ content: { contactEmail: 'not-an-email' } }),
            'contactEmail',
        ),
    },
    {
        name: 'oversize instagramHandle rejected',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => throws(
            () => validateWebsiteConfigUpdate({ content: { instagramHandle: '@' + 'x'.repeat(MAX_INSTAGRAM_HANDLE_LEN) } }),
            'instagramHandle',
        ),
    },
    {
        name: 'too many knownFor items rejected',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => throws(
            () => validateWebsiteConfigUpdate({
                content: {
                    knownFor: Array.from({ length: MAX_KNOWN_FOR_ITEMS + 1 }, (_, i) => ({
                        title: `t${i}`, desc: 'd', image: '/i.webp',
                    })),
                },
            }),
            'knownFor',
        ),
    },
    {
        name: 'knownFor item with oversize title rejected',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => throws(
            () => validateWebsiteConfigUpdate({
                content: { knownFor: [{ title: 'x'.repeat(MAX_KNOWN_FOR_TITLE_LEN + 1), desc: 'd', image: '/i.webp' }] },
            }),
            'knownFor',
        ),
    },
    {
        name: 'knownFor item with oversize desc rejected',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => throws(
            () => validateWebsiteConfigUpdate({
                content: { knownFor: [{ title: 't', desc: 'x'.repeat(MAX_KNOWN_FOR_DESC_LEN + 1), image: '/i.webp' }] },
            }),
            'knownFor',
        ),
    },
    {
        name: 'knownFor item must be an object',
        tags: ['unit', 'locations', 'website'],
        testFn: async () => throws(
            () => validateWebsiteConfigUpdate({ content: { knownFor: ['not-an-object' as unknown as { title: string; desc: string; image: string }] } }),
            'knownFor',
        ),
    },
];

void runTests(cases, 'Website config validation');
