// Unit tests for JSON-LD and meta tag generation (Issue #8)
import { runTests } from '../test-utils.js';
import {
    buildJsonLd,
    buildMetaDescription,
    buildOgDescription,
    buildOgTitle,
} from '../../src/services/jsonld.js';
import type { QueueStateDTO } from '../../src/types/queue.js';

interface T {
    name: string;
    description?: string;
    tags?: string[];
    testFn?: () => Promise<boolean>;
}

const cases: T[] = [
    // --- JSON-LD builder ---
    {
        name: 'buildJsonLd: produces valid Restaurant entity with @context and @type',
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
        name: 'buildJsonLd: includes address, url, servesCuisine',
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
        name: 'buildOgTitle: includes restaurant name',
        tags: ['unit', 'jsonld'],
        testFn: async () => {
            return buildOgTitle().includes('Shri Krishna Bhavan');
        },
    },
];

void runTests(cases, 'JSON-LD and meta tag generation (Issue #8)');
