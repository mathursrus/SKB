process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_host_sentiment_ui_test';
process.env.PORT ??= '13357';
process.env.FRAIM_TEST_SERVER_PORT ??= process.env.PORT;
process.env.FRAIM_BRANCH ??= '';
process.env.SKB_HOST_PIN ??= '1234';

import { runTests, type BaseTestCase } from '../test-utils.js';
import { startTestServer, stopTestServer, getTestServerUrl } from '../shared-server-utils.js';

const BASE = () => getTestServerUrl();

const cases: BaseTestCase[] = [
    {
        name: 'setup: server',
        tags: ['ui', 'host-sentiment', 'setup'],
        testFn: async () => { await startTestServer(); return true; },
    },
    {
        name: 'host.js wires the sentiment override endpoint for both waiting and dining rows',
        tags: ['ui', 'host-sentiment', 'host-js'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/host.js`);
            const js = await r.text();
            return js.includes('/sentiment')
                && js.includes('sentiment-badge')
                && js.includes('sentiment-select')
                && js.includes("diningRows.addEventListener('change'");
        },
    },
    {
        name: 'styles.css defines host sentiment badge and picker styling',
        tags: ['ui', 'host-sentiment', 'css'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/styles.css`);
            const css = await r.text();
            return /\.sentiment-badge\s*\{/.test(css)
                && /\.sentiment-select\s*\{/.test(css);
        },
    },
    {
        name: 'teardown',
        tags: ['ui', 'host-sentiment', 'teardown'],
        testFn: async () => { await stopTestServer(); return true; },
    },
];

runTests(cases, 'host sentiment UI contract (issue #84)');
