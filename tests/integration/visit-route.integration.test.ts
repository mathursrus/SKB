// ============================================================================
// Integration tests for the GET /r/:loc/visit dynamic-routing endpoint
// + the host visit-config admin (updateLocationVisitConfig service).
// ============================================================================

import { runTests, type BaseTestCase } from '../test-utils.js';

process.env.MONGODB_DB_NAME = 'skb_visit_integration_test';
process.env.FRAIM_BRANCH = '';

import { closeDb, getDb, queueEntries, locations, settings } from '../../src/core/db/mongo.js';
import { createLocation, getLocation, updateLocationVisitConfig } from '../../src/services/locations.js';
import { joinQueue } from '../../src/services/queue.js';

async function resetDb(): Promise<void> {
    const db = await getDb();
    await queueEntries(db).deleteMany({});
    await locations(db).deleteMany({});
    await settings(db).deleteMany({});
}

const cases: BaseTestCase[] = [
    // ---------- updateLocationVisitConfig validation ----------
    {
        name: 'updateLocationVisitConfig: valid auto mode persists',
        tags: ['integration', 'visit', 'config'],
        testFn: async () => {
            await resetDb();
            await createLocation('test', 'Test', '0000');
            const result = await updateLocationVisitConfig('test', { visitMode: 'auto' });
            return result.visitMode === 'auto';
        },
    },
    {
        name: 'updateLocationVisitConfig: valid menu mode + URL persists',
        tags: ['integration', 'visit', 'config'],
        testFn: async () => {
            await resetDb();
            await createLocation('test', 'Test', '0000');
            const result = await updateLocationVisitConfig('test', {
                visitMode: 'menu',
                menuUrl: 'https://example.com/menu',
            });
            return result.visitMode === 'menu' && result.menuUrl === 'https://example.com/menu';
        },
    },
    {
        name: 'updateLocationVisitConfig: invalid visitMode rejected',
        tags: ['integration', 'visit', 'config'],
        testFn: async () => {
            await resetDb();
            await createLocation('test', 'Test', '0000');
            try {
                await updateLocationVisitConfig('test', { visitMode: 'bogus' as never });
                return false;
            } catch (e) {
                return e instanceof Error && e.message.includes('visitMode');
            }
        },
    },
    {
        name: 'updateLocationVisitConfig: non-http menuUrl rejected',
        tags: ['integration', 'visit', 'config'],
        testFn: async () => {
            await resetDb();
            await createLocation('test', 'Test', '0000');
            try {
                await updateLocationVisitConfig('test', { menuUrl: 'javascript:alert(1)' });
                return false;
            } catch (e) {
                return e instanceof Error && e.message.includes('http');
            }
        },
    },
    {
        name: 'updateLocationVisitConfig: oversize menuUrl rejected',
        tags: ['integration', 'visit', 'config'],
        testFn: async () => {
            await resetDb();
            await createLocation('test', 'Test', '0000');
            const huge = 'https://example.com/' + 'x'.repeat(600);
            try {
                await updateLocationVisitConfig('test', { menuUrl: huge });
                return false;
            } catch (e) {
                return e instanceof Error && e.message.includes('500');
            }
        },
    },
    {
        name: 'updateLocationVisitConfig: oversize closedMessage rejected',
        tags: ['integration', 'visit', 'config'],
        testFn: async () => {
            await resetDb();
            await createLocation('test', 'Test', '0000');
            const huge = 'x'.repeat(300);
            try {
                await updateLocationVisitConfig('test', { closedMessage: huge });
                return false;
            } catch (e) {
                return e instanceof Error && e.message.includes('280');
            }
        },
    },
    {
        name: 'updateLocationVisitConfig: passing null clears optional field',
        tags: ['integration', 'visit', 'config'],
        testFn: async () => {
            await resetDb();
            await createLocation('test', 'Test', '0000');
            await updateLocationVisitConfig('test', { menuUrl: 'https://example.com/menu' });
            const before = await getLocation('test');
            if (before?.menuUrl !== 'https://example.com/menu') return false;
            await updateLocationVisitConfig('test', { menuUrl: null });
            const after = await getLocation('test');
            return after?.menuUrl === undefined;
        },
    },
    {
        name: 'updateLocationVisitConfig: trims menuUrl + closedMessage',
        tags: ['integration', 'visit', 'config'],
        testFn: async () => {
            await resetDb();
            await createLocation('test', 'Test', '0000');
            const result = await updateLocationVisitConfig('test', {
                menuUrl: '  https://example.com/menu  ',
                closedMessage: '  Closed for the night  ',
            });
            return result.menuUrl === 'https://example.com/menu'
                && result.closedMessage === 'Closed for the night';
        },
    },
    {
        name: 'updateLocationVisitConfig: idempotent — empty update returns existing location',
        tags: ['integration', 'visit', 'config'],
        testFn: async () => {
            await resetDb();
            await createLocation('test', 'Test', '0000');
            const result = await updateLocationVisitConfig('test', {});
            return result._id === 'test' && result.visitMode === undefined;
        },
    },
    {
        name: 'updateLocationVisitConfig: location not found throws',
        tags: ['integration', 'visit', 'config'],
        testFn: async () => {
            await resetDb();
            try {
                await updateLocationVisitConfig('does-not-exist', { visitMode: 'auto' });
                return false;
            } catch (e) {
                return e instanceof Error && e.message === 'location not found';
            }
        },
    },
    // ---------- The route logic itself is covered via Express integration in
    //            host-route tests; here we just make sure the inputs the route
    //            consumes (Location.visitMode, .menuUrl, .closedMessage) round-trip.
    {
        name: 'visit config round-trips through getLocation',
        tags: ['integration', 'visit', 'config'],
        testFn: async () => {
            await resetDb();
            await createLocation('test', 'Test', '0000');
            await updateLocationVisitConfig('test', {
                visitMode: 'closed',
                closedMessage: 'Family emergency — back tomorrow',
            });
            const loc = await getLocation('test');
            return loc?.visitMode === 'closed'
                && loc?.closedMessage === 'Family emergency — back tomorrow';
        },
    },
    {
        name: 'updateLocationVisitConfig coexists with joinQueue (no Location field collision)',
        tags: ['integration', 'visit', 'config'],
        testFn: async () => {
            await resetDb();
            await createLocation('test', 'Test', '0000');
            await updateLocationVisitConfig('test', { visitMode: 'menu', menuUrl: 'https://example.com/menu' });
            await joinQueue('test', { name: 'Diner', partySize: 2, phone: '5125550123' });
            const loc = await getLocation('test');
            // After a join, the location should still carry our visit config —
            // confirms there's no inadvertent overwrite from the queue path.
            return loc?.visitMode === 'menu' && loc?.menuUrl === 'https://example.com/menu';
        },
    },
];

// Teardown as the final test case — keeps npm run test:all from hanging.
// See commit 539b8f7 for context on why main()+finally leaves the Node
// process stuck after closeDb() resolves.
cases.push({
    name: 'teardown',
    tags: ['integration', 'visit', 'teardown'],
    testFn: async () => { await closeDb(); return true; },
});

void runTests(cases, 'Visit Route Integration');
