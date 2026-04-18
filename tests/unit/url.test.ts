import { runTests } from '../test-utils.js';
import { buildLocationPageUrl, buildQueueStatusUrl, trimTrailingSlashes } from '../../src/core/utils/url.js';

const cases = [
    {
        name: 'trimTrailingSlashes removes one or more trailing slashes',
        tags: ['unit', 'url'],
        testFn: async () => trimTrailingSlashes('https://skb.app///') === 'https://skb.app',
    },
    {
        name: 'buildLocationPageUrl builds a per-location static page URL',
        tags: ['unit', 'url'],
        testFn: async () => buildLocationPageUrl('https://skb.app/', 'skb', 'queue.html') === 'https://skb.app/r/skb/queue.html',
    },
    {
        name: 'buildQueueStatusUrl appends the code query to queue.html',
        tags: ['unit', 'url', 'sms', 'waitlist'],
        testFn: async () => buildQueueStatusUrl('https://skb.app', 'skb', 'SKB-7Q3') === 'https://skb.app/r/skb/queue.html?code=SKB-7Q3',
    },
];

void runTests(cases, 'URL Utilities');
