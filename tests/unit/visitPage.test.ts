// Unit tests for the pure decideVisit() routing logic.
import { runTests } from '../test-utils.js';
import { decideVisit } from '../../src/services/visit-page.js';
import type { Location } from '../../src/types/queue.js';

function loc(overrides: Partial<Location> = {}): Location {
    return {
        _id: 'skb',
        name: 'Shri Krishna Bhavan',
        pin: '0000',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        ...overrides,
    };
}

const cases = [
    {
        name: 'closed mode renders the closed HTML page',
        tags: ['unit', 'visit'],
        testFn: async () => {
            const d = decideVisit('skb', loc({ visitMode: 'closed', closedMessage: 'Family emergency, back tomorrow' }), 5);
            return d.kind === 'render' && (d.html ?? '').includes('Family emergency');
        },
    },
    {
        name: 'closed mode without explicit message uses default copy',
        tags: ['unit', 'visit'],
        testFn: async () => {
            const d = decideVisit('skb', loc({ visitMode: 'closed' }), 0);
            // Apostrophes get HTML-escaped to &#39; so we look for the
            // distinctive "closed right now" substring instead.
            return d.kind === 'render' && (d.html ?? '').includes('closed right now');
        },
    },
    {
        name: 'menu mode with menuUrl redirects to it',
        tags: ['unit', 'visit'],
        testFn: async () => {
            const d = decideVisit('skb', loc({ visitMode: 'menu', menuUrl: 'https://example.com/menu' }), 0);
            return d.kind === 'redirect' && d.url === 'https://example.com/menu';
        },
    },
    {
        name: 'menu mode without menuUrl renders a stub',
        tags: ['unit', 'visit'],
        testFn: async () => {
            const d = decideVisit('skb', loc({ visitMode: 'menu' }), 0);
            return d.kind === 'render' && (d.html ?? '').includes('Menu coming soon');
        },
    },
    {
        name: 'queue mode redirects to /r/:loc/queue.html',
        tags: ['unit', 'visit'],
        testFn: async () => {
            const d = decideVisit('skb', loc({ visitMode: 'queue' }), 0);
            return d.kind === 'redirect' && d.url === '/r/skb/queue.html';
        },
    },
    {
        name: 'auto mode with parties waiting → queue',
        tags: ['unit', 'visit'],
        testFn: async () => {
            const d = decideVisit('skb', loc({ visitMode: 'auto', menuUrl: 'https://example.com/menu' }), 3);
            return d.kind === 'redirect' && d.url === '/r/skb/queue.html';
        },
    },
    {
        name: 'auto mode with empty queue + menuUrl → menu',
        tags: ['unit', 'visit'],
        testFn: async () => {
            const d = decideVisit('skb', loc({ visitMode: 'auto', menuUrl: 'https://example.com/menu' }), 0);
            return d.kind === 'redirect' && d.url === 'https://example.com/menu';
        },
    },
    {
        name: 'auto mode with empty queue + no menuUrl → queue',
        tags: ['unit', 'visit'],
        testFn: async () => {
            const d = decideVisit('skb', loc({ visitMode: 'auto' }), 0);
            return d.kind === 'redirect' && d.url === '/r/skb/queue.html';
        },
    },
    {
        name: 'undefined visitMode defaults to auto behavior',
        tags: ['unit', 'visit'],
        testFn: async () => {
            const d = decideVisit('skb', loc({}), 2);
            return d.kind === 'redirect' && d.url === '/r/skb/queue.html';
        },
    },
    {
        name: 'null location defaults to queue redirect',
        tags: ['unit', 'visit'],
        testFn: async () => {
            const d = decideVisit('skb', null, 0);
            return d.kind === 'redirect' && d.url === '/r/skb/queue.html';
        },
    },
    {
        name: 'closed message is HTML-escaped to prevent XSS in the page',
        tags: ['unit', 'visit', 'security'],
        testFn: async () => {
            const d = decideVisit('skb', loc({
                visitMode: 'closed',
                closedMessage: '<script>alert(1)</script><img src=x onerror=alert(2)>',
            }), 0);
            const html = d.html ?? '';
            // raw tags must be escaped, and no live <script> or <img> elements should land
            return d.kind === 'render'
                && html.includes('&lt;script&gt;')
                && html.includes('&lt;img')
                && !html.includes('<script>alert(1)</script>')
                && !html.includes('<img src=x');
        },
    },
    {
        name: 'restaurant name is HTML-escaped in the closed page',
        tags: ['unit', 'visit', 'security'],
        testFn: async () => {
            const d = decideVisit('skb', loc({
                name: '<script>alert(1)</script>',
                visitMode: 'closed',
                closedMessage: 'Closed',
            }), 0);
            const html = d.html ?? '';
            return d.kind === 'render'
                && html.includes('&lt;script&gt;')
                && !html.includes('<script>alert(1)</script>');
        },
    },
];

void runTests(cases, 'visit-page (decideVisit)');
