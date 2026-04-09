// Integration tests for queue-template (server-side JSON-LD injection).
// Requires Mongo for live queue state rendering.

import { runTests, type BaseTestCase } from '../test-utils.js';

process.env.MONGODB_DB_NAME = 'skb_template_integration_test';
process.env.FRAIM_BRANCH = '';

import { closeDb, getDb, queueEntries, settings } from '../../src/core/db/mongo.js';
import { joinQueue } from '../../src/services/queue.js';
import { renderQueuePage } from '../../src/services/queue-template.js';

async function resetDb(): Promise<void> {
    const db = await getDb();
    await queueEntries(db).deleteMany({});
    await settings(db).deleteMany({});
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
            await joinQueue('test', { name: 'A', partySize: 2, phone: '2065551234' }, now);
            await joinQueue('test', { name: 'B', partySize: 2, phone: '2065551235' }, new Date(now.getTime() + 1));
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
            await joinQueue('test', { name: 'SecretPerson', partySize: 2, phone: '2065559876' }, new Date());
            const html = await renderQueuePage('test');
            return !html.includes('SecretPerson') && !html.includes('9876');
        },
    },
    {
        name: 'teardown',
        tags: ['integration', 'jsonld'],
        testFn: async () => { await resetDb(); await closeDb(); return true; },
    },
];

void runTests(cases, 'queue-template (integration)');
