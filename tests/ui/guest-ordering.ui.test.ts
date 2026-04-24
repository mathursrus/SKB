process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_guest_ordering_ui_test';
process.env.PORT ??= '13356';
process.env.FRAIM_TEST_SERVER_PORT ??= process.env.PORT;
process.env.FRAIM_BRANCH ??= '';
process.env.SKB_HOST_PIN ??= '1234';

import { runTests, type BaseTestCase } from '../test-utils.js';
import { startTestServer, stopTestServer, getTestServerUrl } from '../shared-server-utils.js';

const BASE = () => getTestServerUrl();

const cases: BaseTestCase[] = [
    {
        name: 'setup: server',
        tags: ['ui', 'guest-ordering', 'setup'],
        testFn: async () => { await startTestServer(); return true; },
    },
    {
        name: 'queue.html exposes guest ordering DOM hooks',
        tags: ['ui', 'guest-ordering', 'queue-dom'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/queue.html`);
            const html = await r.text();
            return /id="queue-tabs"/.test(html)
                && /id="queue-tab-waitlist"/.test(html)
                && /id="queue-tab-order"/.test(html)
                && /id="queue-panel-order"/.test(html)
                && /id="order-card"/.test(html)
                && /id="order-menu"/.test(html)
                && /id="order-cart-lines"/.test(html)
                && /id="sms-consent-block"/.test(html)
                && !/id="order-save-btn"/.test(html)
                && /id="order-place-btn"/.test(html);
        },
    },
    {
        name: 'queue.js wires guest draft + placement endpoints',
        tags: ['ui', 'guest-ordering', 'queue-js'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/queue.js`);
            const js = await r.text();
            return js.includes('api/queue/order/draft')
                && js.includes('api/queue/order/place')
                && js.includes('api/public-config')
                && js.includes('guestFeatures')
                && js.includes('menuEnabled')
                && js.includes('scheduleOrderDraftSave')
                && js.includes('order-item-card')
                && js.includes('order-section-nav')
                && js.includes('renderOrderCard');
        },
    },
    {
        name: 'host.js loads placed-order detail for an expanded dining row',
        tags: ['ui', 'guest-ordering', 'host-js'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/host.js`);
            const js = await r.text();
            return js.includes("/order'")
                && js.includes('host-order-detail')
                && js.includes('guestFeatures')
                && js.includes('timeline-detail-grid');
        },
    },
    {
        name: 'teardown',
        tags: ['ui', 'guest-ordering', 'teardown'],
        testFn: async () => { await stopTestServer(); return true; },
    },
];

runTests(cases, 'guest ordering UI contract (issue #11)');
