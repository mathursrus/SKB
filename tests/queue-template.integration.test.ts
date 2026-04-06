// Integration tests for server-side queue.html template rendering (Issue #8)
// Requires Mongo reachable at MONGODB_URI (default mongodb://localhost:27017).

import { test } from 'node:test';
import assert from 'node:assert';

// Force a dedicated integration-test DB name.
process.env.MONGODB_DB_NAME = 'skb_integration_test';
process.env.FRAIM_BRANCH = '';

import { closeDb, getDb, queueEntries, settings } from '../src/core/db/mongo.js';
import { joinQueue } from '../src/services/queue.js';
import { renderQueuePage } from '../src/services/queue-template.js';

async function resetDb(): Promise<void> {
    const db = await getDb();
    await queueEntries(db).deleteMany({});
    await settings(db).deleteMany({});
}

test('renderQueuePage: HTML contains JSON-LD script block with Restaurant type', async () => {
    await resetDb();
    const t0 = new Date('2026-04-05T20:00:00Z');
    await joinQueue({ name: 'A', partySize: 2 }, t0);
    await joinQueue({ name: 'B', partySize: 3 }, new Date(t0.getTime() + 1000));

    const html = await renderQueuePage(t0);

    assert.ok(
        html.includes('<script type="application/ld+json">'),
        'HTML must contain JSON-LD script tag',
    );
    assert.ok(html.includes('"@type":"Restaurant"') || html.includes('"@type": "Restaurant"'),
        'JSON-LD must contain Restaurant type',
    );
});

test('renderQueuePage: HTML contains meta description with wait time for N parties', async () => {
    await resetDb();
    const t0 = new Date('2026-04-05T20:00:00Z');
    await joinQueue({ name: 'A', partySize: 2 }, t0);
    await joinQueue({ name: 'B', partySize: 3 }, new Date(t0.getTime() + 1000));
    await joinQueue({ name: 'C', partySize: 2 }, new Date(t0.getTime() + 2000));

    const html = await renderQueuePage(t0);

    // 3 parties waiting, eta = (3+1)*8 = 32
    assert.ok(
        html.includes('<meta name="description"'),
        'HTML must contain meta description tag',
    );
    assert.ok(
        html.includes('~32 min'),
        'Meta description must include approximate wait time',
    );
    assert.ok(
        html.includes('3 part'),
        'Meta description must include party count',
    );
});

test('renderQueuePage: HTML contains og:description and og:title', async () => {
    await resetDb();
    const t0 = new Date('2026-04-05T20:00:00Z');
    await joinQueue({ name: 'A', partySize: 2 }, t0);

    const html = await renderQueuePage(t0);

    assert.ok(
        html.includes('og:description'),
        'HTML must contain og:description',
    );
    assert.ok(
        html.includes('og:title'),
        'HTML must contain og:title',
    );
    assert.ok(
        html.includes('Shri Krishna Bhavan'),
        'og:title must include restaurant name',
    );
});

test('renderQueuePage: zero parties shows "No wait" in JSON-LD and meta', async () => {
    await resetDb();
    const t0 = new Date('2026-04-05T20:00:00Z');

    const html = await renderQueuePage(t0);

    // Should contain "No wait" or "no wait" somewhere
    const lower = html.toLowerCase();
    assert.ok(
        lower.includes('no wait'),
        'Empty queue must show "No wait" in structured data or meta',
    );
});

test('renderQueuePage: preserves existing queue.html structure', async () => {
    await resetDb();
    const t0 = new Date('2026-04-05T20:00:00Z');

    const html = await renderQueuePage(t0);

    // Key elements from queue.html must still be present
    assert.ok(html.includes('id="join-form"'), 'join-form must be present');
    assert.ok(html.includes('id="status-card"'), 'status-card must be present');
    assert.ok(html.includes('id="conf-card"'), 'conf-card must be present');
    assert.ok(html.includes('<script src="/queue.js">'), 'queue.js script must be present');
    assert.ok(html.includes('class="diner"'), 'diner body class must be present');
});

test('renderQueuePage: JSON-LD contains no PII (no party names, codes, or phone digits)', async () => {
    await resetDb();
    const t0 = new Date('2026-04-05T20:00:00Z');
    await joinQueue({ name: 'SecretName', partySize: 2, phoneLast4: '9876' }, t0);

    const html = await renderQueuePage(t0);

    // Extract JSON-LD block
    const ldStart = html.indexOf('<script type="application/ld+json">');
    const ldEnd = html.indexOf('</script>', ldStart);
    const ldBlock = html.substring(ldStart, ldEnd);

    assert.ok(!ldBlock.includes('SecretName'), 'JSON-LD must not contain party names');
    assert.ok(!ldBlock.includes('9876'), 'JSON-LD must not contain phone digits');
    assert.ok(!ldBlock.includes('SKB-'), 'JSON-LD must not contain party codes');
});

// Cleanup
test('queue-template teardown', async () => {
    await resetDb();
    await closeDb();
});
