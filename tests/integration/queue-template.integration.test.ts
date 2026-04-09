// Integration tests for queue-template (server-side JSON-LD injection).
// Requires Mongo for live queue state rendering.

import { runTests, type BaseTestCase } from '../test-utils.js';

process.env.MONGODB_DB_NAME = 'skb_template_integration_test';
process.env.FRAIM_BRANCH = '';

import { closeDb, getDb, queueEntries, settings, locations } from '../../src/core/db/mongo.js';
import { joinQueue } from '../../src/services/queue.js';
import { renderQueuePage } from '../../src/services/queue-template.js';
import type { Location } from '../../src/types/queue.js';

async function resetDb(): Promise<void> {
    const db = await getDb();
    await queueEntries(db).deleteMany({});
    await settings(db).deleteMany({});
    await locations(db).deleteMany({});
}

/** Insert a location with optional publicUrl. */
async function insertLocation(id: string, opts: Partial<Location> = {}): Promise<void> {
    const db = await getDb();
    await locations(db).insertOne({
        _id: id,
        name: opts.name ?? 'Test Restaurant',
        pin: opts.pin ?? '0000',
        createdAt: new Date(),
        ...opts,
    } as Location);
}

const cases: BaseTestCase[] = [
    {
        name: 'renderQueuePage: HTML contains JSON-LD script block with Restaurant type',
        tags: ['integration', 'jsonld', 'template'],
        testFn: async () => {
            await resetDb();
            const html = await renderQueuePage('test');
            return html.includes('application/ld+json') && html.includes('"@type":"Restaurant"');
        },
    },
    {
        name: 'renderQueuePage: HTML contains meta description with wait time',
        tags: ['integration', 'jsonld', 'template'],
        testFn: async () => {
            await resetDb();
            const now = new Date('2026-04-05T20:00:00Z');
            await joinQueue('test', { name: 'A', partySize: 2 }, now);
            await joinQueue('test', { name: 'B', partySize: 2 }, new Date(now.getTime() + 1));
            const html = await renderQueuePage('test');
            return html.includes('meta name="description"');
        },
    },
    {
        name: 'renderQueuePage: HTML contains og:description and og:title',
        tags: ['integration', 'jsonld', 'template'],
        testFn: async () => {
            await resetDb();
            const html = await renderQueuePage('test');
            return html.includes('og:description') && html.includes('og:title');
        },
    },
    {
        name: 'renderQueuePage: zero parties shows "No wait" in JSON-LD',
        tags: ['integration', 'jsonld', 'template', 'empty-state'],
        testFn: async () => {
            await resetDb();
            const html = await renderQueuePage('test');
            return html.includes('No wait');
        },
    },
    {
        name: 'renderQueuePage: preserves existing queue.html structure',
        tags: ['integration', 'jsonld', 'template'],
        testFn: async () => {
            await resetDb();
            const html = await renderQueuePage('test');
            return html.includes('SKB') && html.includes('</html>') && html.includes('queue.js');
        },
    },
    {
        name: 'renderQueuePage: JSON-LD contains no PII',
        tags: ['integration', 'jsonld', 'template', 'privacy'],
        testFn: async () => {
            await resetDb();
            await joinQueue('test', { name: 'SecretPerson', partySize: 2, phoneLast4: '9876' }, new Date());
            const html = await renderQueuePage('test');
            return !html.includes('SecretPerson') && !html.includes('9876');
        },
    },

    // --- Google Maps integration (Issue #30) ---
    {
        name: 'renderQueuePage: includes og:type meta tag',
        tags: ['integration', 'jsonld', 'template', 'google-maps'],
        testFn: async () => {
            await resetDb();
            const html = await renderQueuePage('test');
            return html.includes('og:type') && html.includes('website');
        },
    },
    {
        name: 'renderQueuePage: includes canonical link when location has publicUrl',
        tags: ['integration', 'jsonld', 'template', 'google-maps'],
        testFn: async () => {
            await resetDb();
            await insertLocation('gmaps-test', { publicUrl: 'https://test.example.com' });
            const html = await renderQueuePage('gmaps-test');
            return (
                html.includes('rel="canonical"') &&
                html.includes('https://test.example.com/r/gmaps-test/queue.html')
            );
        },
    },
    {
        name: 'renderQueuePage: includes og:url when location has publicUrl',
        tags: ['integration', 'jsonld', 'template', 'google-maps'],
        testFn: async () => {
            await resetDb();
            await insertLocation('gmaps-test', { publicUrl: 'https://test.example.com' });
            const html = await renderQueuePage('gmaps-test');
            return (
                html.includes('og:url') &&
                html.includes('https://test.example.com/r/gmaps-test/queue.html')
            );
        },
    },
    {
        name: 'renderQueuePage: omits canonical link when publicUrl not set',
        tags: ['integration', 'jsonld', 'template', 'google-maps'],
        testFn: async () => {
            await resetDb();
            await insertLocation('no-url-test');
            const html = await renderQueuePage('no-url-test');
            return !html.includes('rel="canonical"');
        },
    },
    {
        name: 'renderQueuePage: omits og:url when publicUrl not set',
        tags: ['integration', 'jsonld', 'template', 'google-maps'],
        testFn: async () => {
            await resetDb();
            await insertLocation('no-url-test');
            const html = await renderQueuePage('no-url-test');
            return !html.includes('og:url');
        },
    },
    {
        name: 'renderQueuePage: JSON-LD uses location name when location exists',
        tags: ['integration', 'jsonld', 'template', 'google-maps'],
        testFn: async () => {
            await resetDb();
            await insertLocation('named-test', { name: 'Taco Palace' });
            const html = await renderQueuePage('named-test');
            return html.includes('Taco Palace');
        },
    },
    {
        name: 'renderQueuePage: JSON-LD potentialAction target uses publicUrl',
        tags: ['integration', 'jsonld', 'template', 'google-maps'],
        testFn: async () => {
            await resetDb();
            await insertLocation('action-test', { publicUrl: 'https://prod.example.com' });
            const html = await renderQueuePage('action-test');
            return html.includes('https://prod.example.com/r/action-test/queue.html');
        },
    },
    {
        name: 'renderQueuePage: still works when location does not exist in DB',
        tags: ['integration', 'jsonld', 'template', 'google-maps'],
        testFn: async () => {
            await resetDb();
            // No location inserted — getLocation returns null
            const html = await renderQueuePage('nonexistent');
            return (
                html.includes('og:title') &&
                html.includes('og:type') &&
                html.includes('Shri Krishna Bhavan') && // falls back to default name
                !html.includes('rel="canonical"') // no canonical without publicUrl
            );
        },
    },
    {
        name: 'teardown',
        tags: ['integration', 'jsonld'],
        testFn: async () => { await resetDb(); await closeDb(); return true; },
    },
];

void runTests(cases, 'queue-template (integration)');
