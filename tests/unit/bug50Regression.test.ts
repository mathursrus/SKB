// ============================================================================
// Unit regression tests for issue #50 bug fixes that live in client-side
// HTML/CSS/JS where we don't have a DOM runtime in the unit test suite.
// Each test guards against a specific fix being reverted by a future edit.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests, type BaseTestCase } from '../test-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', '..', 'public');

function loadFile(name: string): string {
    return fs.readFileSync(path.join(PUBLIC_DIR, name), 'utf-8');
}

const stylesCss = loadFile('styles.css');
const adminHtml = loadFile('admin.html');
const adminJs = loadFile('admin.js');
const queueHtml = loadFile('queue.html');
const queueJs = loadFile('queue.js');
const hostHtml = loadFile('host.html');
const themeJs = loadFile('theme.js');

const cases: BaseTestCase[] = [
    // ---------- Bug 2/4/6: scoped label rule ----------
    {
        name: 'bug50 #2/4/6: styles.css has scoped `.card label` rule with margin: 14px 0 6px',
        tags: ['unit', 'bug50', 'css'],
        testFn: async () => {
            // Matches across any whitespace/comment so we don't break on formatting
            return /\.card\s+label\s*\{[^}]*margin:\s*14px\s+0\s+6px/.test(stylesCss);
        },
    },
    {
        name: 'bug50 #2/4/6: styles.css has NO unscoped global `label {` with 14px top margin',
        tags: ['unit', 'bug50', 'css', 'regression'],
        testFn: async () => {
            // The bug was a bare `label { ... margin: 14px 0 6px }` block cascading
            // into every label on the page. Make sure that block isn't back.
            // Match ^label { (possibly with leading whitespace, but no other selector)
            const badBlock = /(^|\n)\s*label\s*\{[^}]*margin:\s*14px/;
            return !badBlock.test(stylesCss);
        },
    },
    {
        name: 'bug50 #2/4/6: styles.css has `.card label:first-child` reset (not bare)',
        tags: ['unit', 'bug50', 'css'],
        testFn: async () => {
            return /\.card\s+label:first-child\s*\{\s*margin-top:\s*0/.test(stylesCss);
        },
    },

    // ---------- Bug 3: renotify conspicuous UI ----------
    {
        name: 'bug50 #3: queue.js tracks lastSeenCallCount for re-notify detection',
        tags: ['unit', 'bug50', 'renotify'],
        testFn: async () => /\blastSeenCallCount\b/.test(queueJs),
    },
    {
        name: 'bug50 #3: queue.js re-fires pulse on every call count increase',
        tags: ['unit', 'bug50', 'renotify'],
        testFn: async () =>
            /currentCallCount\s*>\s*lastSeenCallCount/.test(queueJs)
            && /state-flip/.test(queueJs),
    },
    {
        name: 'bug50 #3: queue.html has the #renotify-banner element',
        tags: ['unit', 'bug50', 'renotify'],
        testFn: async () => /id=["']renotify-banner["']/.test(queueHtml),
    },
    {
        name: 'bug50 #3: styles.css has .renotify-banner rule with bright attention colour',
        tags: ['unit', 'bug50', 'renotify', 'css'],
        testFn: async () =>
            /\.renotify-banner\s*\{[^}]*#dc2626/.test(stylesCss)
            && /@keyframes\s+renotify-pulse/.test(stylesCss),
    },

    // ---------- Bug 5: analytics load error ----------
    {
        name: 'bug50 #5: admin.js no longer references admin-range-label (dead element)',
        tags: ['unit', 'bug50', 'analytics'],
        testFn: async () => !adminJs.includes('admin-range-label') && !adminJs.includes('rangeLabel'),
    },
    {
        name: 'bug50 #5: admin.js loadAnalytics catch logs the real error message',
        tags: ['unit', 'bug50', 'analytics'],
        testFn: async () =>
            /console\.error\([^)]*analytics/.test(adminJs)
            && /catch\s*\(\s*err\s*\)/.test(adminJs),
    },
    {
        name: 'bug50 #5: admin.js loadAnalytics renders single histogram from data.histograms[0]',
        tags: ['unit', 'bug50', 'analytics'],
        testFn: async () =>
            /data\.histograms\?\.\[0\]/.test(adminJs)
            || /data\.histograms\[0\]/.test(adminJs),
    },

    // ---------- Bug 7: door QR display + clearer title ----------
    {
        name: 'bug50 #7: admin.html has the door QR image with src pointing at visit-qr.svg',
        tags: ['unit', 'bug50', 'qr'],
        testFn: async () =>
            /id=["']admin-qr-image["']/.test(adminHtml)
            && /api\/host\/visit-qr\.svg/.test(adminHtml),
    },
    {
        name: 'bug50 #7: admin.html card title reads "Door QR — where it sends scanners" (not "Visit Page / QR")',
        tags: ['unit', 'bug50', 'qr', 'copy'],
        testFn: async () =>
            adminHtml.includes('Door QR — where it sends scanners')
            && !adminHtml.includes('>Visit Page / QR<'),
    },
    {
        name: 'bug50 #7: admin.html has a Download SVG link pointing at the QR endpoint',
        tags: ['unit', 'bug50', 'qr'],
        testFn: async () =>
            /id=["']admin-qr-download["']/.test(adminHtml)
            && /download=["']skb-visit-qr\.svg["']/.test(adminHtml),
    },
    {
        name: 'bug50 #7: admin.js refreshes the QR src with a cache-busting param after auth',
        tags: ['unit', 'bug50', 'qr'],
        testFn: async () =>
            /admin-qr-image[^]*visit-qr\.svg\?t=/.test(adminJs)
            || /qrImg\.src\s*=\s*['"`]api\/host\/visit-qr\.svg\?t=/.test(adminJs),
    },

    // ---------- Bug 5 follow-up: Stage-Based Analytics histograms need CSS ----------
    // The admin.js renderHistogram() emits .hist-card / .vbar-* markup. If the
    // corresponding CSS is missing from styles.css, the histograms render as
    // full-width unstyled divs ("looks like crap"). Guard against that regressing.
    {
        name: 'bug50 analytics: styles.css has .admin-histograms container',
        tags: ['unit', 'bug50', 'analytics', 'css'],
        testFn: async () => /\.admin-histograms\s*\{/.test(stylesCss),
    },
    {
        name: 'bug50 analytics: styles.css has .hist-card + .hist-empty rules',
        tags: ['unit', 'bug50', 'analytics', 'css'],
        testFn: async () =>
            /\.hist-card\s*\{/.test(stylesCss)
            && /\.hist-empty\s*\{/.test(stylesCss),
    },
    {
        name: 'bug50 analytics: styles.css has vbar chart styling (track + fill + bars)',
        tags: ['unit', 'bug50', 'analytics', 'css'],
        testFn: async () =>
            /\.vbar-chart\s*\{/.test(stylesCss)
            && /\.vbar-bars\s*\{[^}]*align-items:\s*flex-end/.test(stylesCss)
            && /\.vbar-track\s*\{[^}]*position:\s*relative/.test(stylesCss)
            && /\.vbar-fill\s*\{/.test(stylesCss),
    },
    {
        name: 'bug50 analytics: styles.css has vbar axis labels (x, y, value)',
        tags: ['unit', 'bug50', 'analytics', 'css'],
        testFn: async () =>
            /\.vbar-x-label\s*\{/.test(stylesCss)
            && /\.vbar-y-label\s*\{/.test(stylesCss)
            && /\.vbar-value\s*\{/.test(stylesCss)
            && /\.vbar-label\s*\{/.test(stylesCss),
    },

    // ---------- Bug 1: diner chat wiring ----------
    {
        name: 'bug50 #1: queue.html has the chat card with thread + input + send button',
        tags: ['unit', 'bug50', 'chat'],
        testFn: async () =>
            /id=["']chat-card["']/.test(queueHtml)
            && /id=["']chat-thread["']/.test(queueHtml)
            && /id=["']chat-form["']/.test(queueHtml)
            && /id=["']chat-input["']/.test(queueHtml),
    },
    {
        name: 'bug50 #1: queue.js has sendChat + loadChat polling the /queue/chat/:code endpoint',
        tags: ['unit', 'bug50', 'chat'],
        testFn: async () =>
            /async\s+function\s+sendChat/.test(queueJs)
            && /async\s+function\s+loadChat/.test(queueJs)
            && /api\/queue\/chat\/['"`]?\s*\+\s*encodeURIComponent/.test(queueJs),
    },
    {
        name: 'bug50 #1: queue.js chat input is cleared after a successful send',
        tags: ['unit', 'bug50', 'chat'],
        testFn: async () => /if\s*\(\s*ok\s+&&\s+input\s*\)\s*input\.value\s*=\s*['"`]/.test(queueJs),
    },
    {
        name: 'bug50 #1: styles.css has .chat-card with bubble from-host + from-me styling',
        tags: ['unit', 'bug50', 'chat', 'css'],
        testFn: async () =>
            /\.chat-card/.test(stylesCss)
            && /\.chat-row\.from-host/.test(stylesCss)
            && /\.chat-row\.from-me/.test(stylesCss),
    },

    // ---------- Complete tab column rename: "To Check" / "To Depart" ----------
    // Users read the labels as state names; "To Check" isn't a state. Column
    // labels describe the duration window instead ("Dining" = served→checkout,
    // "Paying" = checkout→departed).
    {
        name: 'post-bug50: host.html Complete tab uses "Dining" and "Paying" (not "To Check"/"To Depart")',
        tags: ['unit', 'polish', 'host', 'html'],
        testFn: async () =>
            hostHtml.includes('>Dining<')
            && hostHtml.includes('>Paying<')
            && !hostHtml.includes('>To Check<')
            && !hostHtml.includes('>To Depart<'),
    },

    // ---------- Dark/Light mode wiring ----------
    {
        name: 'theme: theme.js exists and toggles `theme-dark` class on <html>',
        tags: ['unit', 'polish', 'theme'],
        testFn: async () =>
            /classList\.toggle\(['"]theme-dark['"]/.test(themeJs)
            && /skbToggleTheme/.test(themeJs)
            && /prefers-color-scheme/.test(themeJs),
    },
    {
        name: 'theme: styles.css has .theme-dark token overrides',
        tags: ['unit', 'polish', 'theme', 'css'],
        testFn: async () =>
            /\.theme-dark\s*\{[^}]*color-scheme:\s*dark/.test(stylesCss)
            && /\.theme-dark\s*\{[^}]*--bg:/.test(stylesCss)
            && /\.theme-dark\s*\{[^}]*--fg:/.test(stylesCss),
    },
    {
        name: 'theme: all three pages load theme.js from <head> and expose #theme-toggle',
        tags: ['unit', 'polish', 'theme'],
        testFn: async () =>
            queueHtml.includes('theme.js')
            && hostHtml.includes('theme.js')
            && adminHtml.includes('theme.js')
            && /id=["']theme-toggle["']/.test(queueHtml)
            && /id=["']theme-toggle["']/.test(hostHtml)
            && /id=["']theme-toggle["']/.test(adminHtml),
    },
    {
        name: 'theme: theme.js loads in <head> before <body> to avoid FOUC',
        tags: ['unit', 'polish', 'theme'],
        testFn: async () => {
            // Require the theme.js <script> to appear before the closing </head>
            // in each HTML — if it slips below <body>, the first paint flashes
            // the wrong theme before JS can toggle the class.
            const inHead = (html: string) => {
                const headClose = html.indexOf('</head>');
                const scriptIdx = html.indexOf('theme.js');
                return scriptIdx > -1 && headClose > -1 && scriptIdx < headClose;
            };
            return inHead(queueHtml) && inHead(hostHtml) && inHead(adminHtml);
        },
    },

    // ---------- Bug-bash fixes (issue #50 follow-up) ----------
    {
        name: 'bugbash: queue.js chat poll uses setTimeout backoff (not setInterval) + doubles delay on 429',
        tags: ['unit', 'bugbash', 'chat'],
        testFn: async () =>
            // No setInterval polling the chat endpoint (was the source of 429 storm)
            !/setInterval\([^)]*loadChat/.test(queueJs)
            // Exponential backoff sighted
            && /chatPollDelayMs\s*\*\s*2/.test(queueJs)
            // Cap on backoff
            && /CHAT_POLL_MAX_MS/.test(queueJs)
            // Reset on success
            && /chatPollDelayMs\s*=\s*CHAT_POLL_BASE_MS/.test(queueJs),
    },
    {
        name: 'bugbash: styles.css hides .more-btn on <900px viewports to fit mobile host table',
        tags: ['unit', 'bugbash', 'host', 'css'],
        testFn: async () =>
            /@media\s*\(\s*max-width:\s*900px\s*\)[^}]*\.host\s+td\.actions\s+button\.more-btn\s*\{\s*display:\s*none/s
                .test(stylesCss),
    },
    {
        name: 'bugbash: td.actions uses min-width (not fixed width) to avoid forcing page overflow',
        tags: ['unit', 'bugbash', 'host', 'css'],
        testFn: async () =>
            /td\.actions\s*\{[^}]*min-width/.test(stylesCss)
            && !/td\.actions\s*\{[^}]*\bwidth:\s*460px/.test(stylesCss),
    },
    {
        name: 'bugbash: host login-view has a theme toggle (data-theme-toggle) so pre-auth diners can flip',
        tags: ['unit', 'bugbash', 'theme', 'host'],
        testFn: async () => {
            // Require a toggle button inside the login-view and that theme.js
            // wires up all class='theme-toggle-btn' elements (not just id).
            const loginView = hostHtml.match(/<div[^>]*id=["']login-view["'][^>]*>[\s\S]*?<\/div>\s*<div[^>]*id=["']queue-view["']/);
            const loginSlice = loginView ? loginView[0] : '';
            const hasLoginToggle = /data-theme-toggle/.test(loginSlice) || /class=["'][^"']*theme-toggle-btn/.test(loginSlice);
            const themeWiresAll = /querySelectorAll\([^)]*theme-toggle/.test(themeJs);
            return hasLoginToggle && themeWiresAll;
        },
    },
];

void runTests(cases, 'Bug #50 Regression');
