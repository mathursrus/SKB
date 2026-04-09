// Unit tests for JSON-LD and meta tag generation
import { runTests } from '../test-utils.js';
import {
    buildJsonLd,
    buildMetaDescription,
    buildOgDescription,
    buildOgTitle,
    buildOgType,
    buildCanonicalUrl,
} from '../../src/services/jsonld.js';
import type { Location, QueueStateDTO } from '../../src/types/queue.js';

interface T {
    name: string;
    description?: string;
    tags?: string[];
    testFn?: () => Promise<boolean>;
}

/** Helper to build a minimal Location stub. */
function loc(overrides: Partial<Location> = {}): Location {
    return { _id: 'skb', name: 'Shri Krishna Bhavan', pin: '1234', createdAt: new Date(), ...overrides };
}

const cases: T[] = [
    // --- JSON-LD builder (backward compat: no location) ---
    {
        name: 'buildJsonLd: produces valid Restaurant entity with @context and @type (no location)',
        tags: ['unit', 'jsonld'],
        testFn: async () => {
            const state: QueueStateDTO = {
                partiesWaiting: 5,
                etaForNewPartyMinutes: 48,
                avgTurnTimeMinutes: 8,
            };
            const ld = buildJsonLd(state);
            return (
                ld['@context'] === 'https://schema.org' &&
                ld['@type'] === 'Restaurant' &&
                ld.name === 'Shri Krishna Bhavan'
            );
        },
    },
    {
        name: 'buildJsonLd: includes address, url, servesCuisine (no location)',
        tags: ['unit', 'jsonld'],
        testFn: async () => {
            const state: QueueStateDTO = {
                partiesWaiting: 3,
                etaForNewPartyMinutes: 32,
                avgTurnTimeMinutes: 8,
            };
            const ld = buildJsonLd(state);
            return (
                ld.address != null &&
                typeof ld.url === 'string' &&
                ld.servesCuisine === 'South Indian'
            );
        },
    },
    {
        name: 'buildJsonLd: makesOffer description includes wait time and party count when parties > 0',
        tags: ['unit', 'jsonld'],
        testFn: async () => {
            const state: QueueStateDTO = {
                partiesWaiting: 5,
                etaForNewPartyMinutes: 48,
                avgTurnTimeMinutes: 8,
            };
            const ld = buildJsonLd(state);
            const offer = ld.makesOffer as { description: string };
            return (
                offer.description.includes('48') &&
                offer.description.includes('5')
            );
        },
    },
    {
        name: 'buildJsonLd: zero parties produces "No wait" description',
        tags: ['unit', 'jsonld'],
        testFn: async () => {
            const state: QueueStateDTO = {
                partiesWaiting: 0,
                etaForNewPartyMinutes: 8,
                avgTurnTimeMinutes: 8,
            };
            const ld = buildJsonLd(state);
            const offer = ld.makesOffer as { description: string };
            return offer.description.toLowerCase().includes('no wait');
        },
    },
    {
        name: 'buildJsonLd: includes potentialAction with JoinAction type',
        tags: ['unit', 'jsonld'],
        testFn: async () => {
            const state: QueueStateDTO = {
                partiesWaiting: 2,
                etaForNewPartyMinutes: 24,
                avgTurnTimeMinutes: 8,
            };
            const ld = buildJsonLd(state);
            const action = ld.potentialAction as { '@type': string; target: string };
            return (
                action['@type'] === 'JoinAction' &&
                typeof action.target === 'string' &&
                action.target.includes('/queue')
            );
        },
    },
    {
        name: 'buildJsonLd: no PII -- only aggregate metrics in output',
        tags: ['unit', 'jsonld'],
        testFn: async () => {
            const state: QueueStateDTO = {
                partiesWaiting: 3,
                etaForNewPartyMinutes: 32,
                avgTurnTimeMinutes: 8,
            };
            const json = JSON.stringify(buildJsonLd(state));
            // Should not contain any individual party data patterns
            return (
                !json.includes('SKB-') &&
                !json.includes('phoneLast4') &&
                !json.includes('"name":"A"')
            );
        },
    },
    {
        name: 'buildJsonLd: large party count (50+) still renders real number',
        tags: ['unit', 'jsonld'],
        testFn: async () => {
            const state: QueueStateDTO = {
                partiesWaiting: 55,
                etaForNewPartyMinutes: 448,
                avgTurnTimeMinutes: 8,
            };
            const ld = buildJsonLd(state);
            const offer = ld.makesOffer as { description: string };
            return offer.description.includes('55') && offer.description.includes('448');
        },
    },

    // --- JSON-LD builder (with location) ---
    {
        name: 'buildJsonLd: uses location.name when provided',
        tags: ['unit', 'jsonld', 'multi-tenant'],
        testFn: async () => {
            const state: QueueStateDTO = { partiesWaiting: 1, etaForNewPartyMinutes: 10, avgTurnTimeMinutes: 8 };
            const ld = buildJsonLd(state, loc({ name: 'Taco Palace' }));
            return ld.name === 'Taco Palace';
        },
    },
    {
        name: 'buildJsonLd: uses publicUrl in potentialAction target when set',
        tags: ['unit', 'jsonld', 'multi-tenant'],
        testFn: async () => {
            const state: QueueStateDTO = { partiesWaiting: 0, etaForNewPartyMinutes: 8, avgTurnTimeMinutes: 8 };
            const ld = buildJsonLd(state, loc({ _id: 'taco', publicUrl: 'https://taco.example.com' }));
            const action = ld.potentialAction as { target: string };
            return action.target === 'https://taco.example.com/r/taco/queue.html';
        },
    },
    {
        name: 'buildJsonLd: uses publicUrl as restaurant url when set',
        tags: ['unit', 'jsonld', 'multi-tenant'],
        testFn: async () => {
            const state: QueueStateDTO = { partiesWaiting: 0, etaForNewPartyMinutes: 8, avgTurnTimeMinutes: 8 };
            const ld = buildJsonLd(state, loc({ _id: 'taco', publicUrl: 'https://taco.example.com' }));
            return ld.url === 'https://taco.example.com/r/taco/queue.html';
        },
    },
    {
        name: 'buildJsonLd: falls back to default URL when publicUrl not set',
        tags: ['unit', 'jsonld', 'multi-tenant'],
        testFn: async () => {
            const state: QueueStateDTO = { partiesWaiting: 0, etaForNewPartyMinutes: 8, avgTurnTimeMinutes: 8 };
            const ld = buildJsonLd(state, loc());
            return typeof ld.url === 'string' && (ld.url as string).includes('krishnabhavan.com');
        },
    },

    // --- Canonical URL builder ---
    {
        name: 'buildCanonicalUrl: returns full URL when publicUrl set',
        tags: ['unit', 'jsonld', 'canonical'],
        testFn: async () => {
            const url = buildCanonicalUrl(loc({ _id: 'skb', publicUrl: 'https://skb.azurewebsites.net' }));
            return url === 'https://skb.azurewebsites.net/r/skb/queue.html';
        },
    },
    {
        name: 'buildCanonicalUrl: strips trailing slash from publicUrl',
        tags: ['unit', 'jsonld', 'canonical'],
        testFn: async () => {
            const url = buildCanonicalUrl(loc({ _id: 'skb', publicUrl: 'https://skb.azurewebsites.net/' }));
            return url === 'https://skb.azurewebsites.net/r/skb/queue.html';
        },
    },
    {
        name: 'buildCanonicalUrl: returns null when publicUrl not set',
        tags: ['unit', 'jsonld', 'canonical'],
        testFn: async () => {
            return buildCanonicalUrl(loc()) === null;
        },
    },
    {
        name: 'buildCanonicalUrl: returns null when location is null',
        tags: ['unit', 'jsonld', 'canonical'],
        testFn: async () => {
            return buildCanonicalUrl(null) === null;
        },
    },

    // --- Meta tag builders ---
    {
        name: 'buildMetaDescription: includes wait time when parties > 0',
        tags: ['unit', 'jsonld'],
        testFn: async () => {
            const state: QueueStateDTO = {
                partiesWaiting: 3,
                etaForNewPartyMinutes: 32,
                avgTurnTimeMinutes: 8,
            };
            const desc = buildMetaDescription(state);
            return desc.includes('~32 min') && desc.includes('3 part');
        },
    },
    {
        name: 'buildMetaDescription: zero parties shows no wait',
        tags: ['unit', 'jsonld'],
        testFn: async () => {
            const state: QueueStateDTO = {
                partiesWaiting: 0,
                etaForNewPartyMinutes: 8,
                avgTurnTimeMinutes: 8,
            };
            const desc = buildMetaDescription(state);
            return desc.toLowerCase().includes('no wait');
        },
    },
    {
        name: 'buildMetaDescription: uses location.name when provided',
        tags: ['unit', 'jsonld', 'multi-tenant'],
        testFn: async () => {
            const state: QueueStateDTO = { partiesWaiting: 0, etaForNewPartyMinutes: 8, avgTurnTimeMinutes: 8 };
            const desc = buildMetaDescription(state, loc({ name: 'Burger Barn' }));
            return desc.includes('Burger Barn');
        },
    },
    {
        name: 'buildOgDescription: matches meta description content',
        tags: ['unit', 'jsonld'],
        testFn: async () => {
            const state: QueueStateDTO = {
                partiesWaiting: 4,
                etaForNewPartyMinutes: 40,
                avgTurnTimeMinutes: 8,
            };
            return buildOgDescription(state) === buildMetaDescription(state);
        },
    },
    {
        name: 'buildOgTitle: includes restaurant name (no location)',
        tags: ['unit', 'jsonld'],
        testFn: async () => {
            return buildOgTitle().includes('Shri Krishna Bhavan');
        },
    },
    {
        name: 'buildOgTitle: includes location.name when provided',
        tags: ['unit', 'jsonld', 'multi-tenant'],
        testFn: async () => {
            return buildOgTitle(loc({ name: 'Noodle House' })).includes('Noodle House');
        },
    },

    // --- og:type builder ---
    {
        name: 'buildOgType: returns "website"',
        tags: ['unit', 'jsonld'],
        testFn: async () => {
            return buildOgType() === 'website';
        },
    },
];

void runTests(cases, 'JSON-LD and meta tag generation');
