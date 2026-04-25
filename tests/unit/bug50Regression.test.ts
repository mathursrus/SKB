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
const hostJs = loadFile('host.js');
const themeJs = loadFile('theme.js');
const queueRoute = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'src', 'routes', 'queue.ts'),
    'utf-8',
);
const hostRoute = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'src', 'routes', 'host.ts'),
    'utf-8',
);

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
        // IA cleanup (2026-04): the inline src= was removed to stop the <img>
        // from painting a 401 broken-image placeholder before PIN/session auth
        // completes. admin.js now sets the src post-auth — that behavior is
        // asserted by the "refreshes the QR src with a cache-busting param"
        // case below.
        name: 'bug50 #7: admin.html declares the door QR <img> slot (src wired by admin.js post-auth)',
        tags: ['unit', 'bug50', 'qr'],
        testFn: async () =>
            /id=["']admin-qr-image["']/.test(adminHtml)
            && /api\/host\/visit-qr\.svg/.test(adminJs),
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
    {
        name: 'bug50 #7: admin.js shows the tenant-scoped /r/:loc/visit QR target',
        tags: ['unit', 'bug50', 'qr'],
        testFn: async () =>
            /siteConfiguredPublicUrl\s*=\s*data\.publicUrl\s*\|\|\s*['"]{2}/.test(adminJs)
            && /scannerUrl\s*=\s*`?\$\{scannerBase\}\/r\/\$\{encodeURIComponent\(loc\)\}\/visit`?/.test(adminJs),
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
    {
        name: 'bugbash: validateJoin rejects names with HTML metacharacters (defense-in-depth)',
        tags: ['unit', 'bugbash', 'security'],
        testFn: async () =>
            queueRoute.includes('/[<>\\\\]/.test(name)')
            && queueRoute.includes('name contains unsupported characters'),
    },

    // ---------- TFV compliance: explicit, optional SMS opt-in ----------
    // Twilio 30513 requires that SMS consent NOT be a prerequisite for
    // the service. These guards keep the checkbox on the join form and
    // the `smsConsent` flag flowing client → server.
    {
        name: 'tfv: queue.html renders an unchecked SMS consent checkbox (not a pre-checked disclaimer)',
        tags: ['unit', 'tfv', 'sms-consent'],
        testFn: async () =>
            /<input[^>]*type=["']checkbox["'][^>]*id=["']sms-consent["']/.test(queueHtml)
            // Must be unchecked by default — no `checked` attribute
            && !/<input[^>]*id=["']sms-consent["'][^>]*\bchecked\b/.test(queueHtml),
    },
    {
        name: 'tfv: queue.html has the "Consent is optional" reassurance so users know they can skip SMS',
        tags: ['unit', 'tfv', 'sms-consent'],
        testFn: async () =>
            queueHtml.includes('Consent is optional')
            && /sms-consent-note/.test(queueHtml),
    },
    {
        name: 'tfv: queue.html includes STOP + HELP keywords + msg&data rates language near the checkbox',
        tags: ['unit', 'tfv', 'sms-consent'],
        testFn: async () =>
            /STOP/.test(queueHtml)
            && /HELP/.test(queueHtml)
            && /data rates/i.test(queueHtml)
            && /Privacy Policy/.test(queueHtml)
            && /SMS Terms/.test(queueHtml),
    },
    {
        name: 'tfv: queue.js sends smsConsent boolean with the join POST body',
        tags: ['unit', 'tfv', 'sms-consent'],
        testFn: async () =>
            /const\s+smsConsent\s*=/.test(queueJs)
            && /sms-consent.*checked/.test(queueJs)
            && /JSON\.stringify\(\s*\{[^}]*smsConsent/.test(queueJs),
    },
    {
        name: 'tfv: opt-in screenshot lives on the public app-service path (not private GitHub raw)',
        tags: ['unit', 'tfv', 'assets'],
        testFn: async () => {
            const imgPath = path.resolve(__dirname, '..', '..', 'public', 'assets', 'sms-optin-form.png');
            try {
                const s = fs.statSync(imgPath);
                return s.isFile() && s.size > 0;
            } catch { return false; }
        },
    },

    // ---------- Host-initiated add-party path (walk-ins) ----------
    {
        name: 'host-add: host.html has "+ Add party" button and add-party-dialog',
        tags: ['unit', 'host', 'add-party'],
        testFn: async () =>
            /id=["']add-party-btn["']/.test(hostHtml)
            && /id=["']add-party-dialog["']/.test(hostHtml)
            && /id=["']add-party-form["']/.test(hostHtml)
            && /id=["']add-party-name["']/.test(hostHtml)
            && /id=["']add-party-size["']/.test(hostHtml)
            && /id=["']add-party-phone["']/.test(hostHtml),
    },
    {
        name: 'host-add: host.js wires the form to POST /host/queue/add',
        tags: ['unit', 'host', 'add-party'],
        testFn: async () => {
            const hostJs = loadFile('host.js');
            return /api\/host\/queue\/add/.test(hostJs)
                && /openAddPartyDialog/.test(hostJs)
                && /closeAddPartyDialog/.test(hostJs);
        },
    },
    {
        name: 'host-add: server route exists under requireHost guard',
        tags: ['unit', 'host', 'add-party', 'security'],
        testFn: async () =>
            /r\.post\(['"]\/host\/queue\/add['"]\s*,\s*requireHost/.test(hostRoute),
    },

    // ---------- iOS parity guards (read from the iOS source tree) ----------
    // Only checks that the code shape the user sees is present; runtime behavior
    // is covered by the iOS jest suite in ios/src.
    {
        name: 'ios: client.ts no longer maintains a manual cookieJar (relies on platform cookie store)',
        tags: ['unit', 'ios', 'cookies'],
        testFn: async () => {
            const iosClient = fs.readFileSync(
                path.resolve(__dirname, '..', '..', 'ios', 'src', 'net', 'client.ts'),
                'utf-8',
            );
            // The new client explicitly uses credentials:'include' and must not
            // set a Cookie header from a JS-maintained string.
            return /credentials:\s*['"]include['"]/.test(iosClient)
                && !/headers\[['"]Cookie['"]\]\s*=\s*cookieJar/.test(iosClient);
        },
    },
    {
        name: 'ios: buildUrl inserts /api into the per-location path (PIN 404 regression)',
        tags: ['unit', 'ios', 'auth'],
        testFn: async () => {
            const iosClient = fs.readFileSync(
                path.resolve(__dirname, '..', '..', 'ios', 'src', 'net', 'client.ts'),
                'utf-8',
            );
            return /buildTenantUrl\(.*\): string \{[\s\S]*return `\$\{base\}\/r\/\$\{encodeURIComponent\(.+?\)\}\/api\$\{suffix\}`;/.test(iosClient)
                && /export function buildUrl\(path: string\): string \{[\s\S]*return buildTenantUrl\(defaultLocationId\(\), path\);/.test(iosClient);
        },
    },
    {
        name: 'ios: has AddPartySheet + CustomSmsDialog + CustomCallDialog components',
        tags: ['unit', 'ios', 'host-parity'],
        testFn: async () => {
            const base = path.resolve(__dirname, '..', '..', 'ios', 'src', 'features', 'waiting');
            return fs.existsSync(path.join(base, 'AddPartySheet.tsx'))
                && fs.existsSync(path.join(base, 'CustomSmsDialog.tsx'))
                && fs.existsSync(path.join(base, 'CustomCallDialog.tsx'));
        },
    },
    {
        name: 'ios: Complete tab screen + list + row exist',
        tags: ['unit', 'ios', 'host-parity'],
        testFn: async () => {
            const app = path.resolve(__dirname, '..', '..', 'ios', 'app', '(host)', 'complete.tsx');
            const listDir = path.resolve(__dirname, '..', '..', 'ios', 'src', 'features', 'completed');
            return fs.existsSync(app)
                && fs.existsSync(path.join(listDir, 'CompletedList.tsx'))
                && fs.existsSync(path.join(listDir, 'CompletedRow.tsx'));
        },
    },
    {
        name: 'ios: settings screen locks turn-time input when etaMode is dynamic',
        tags: ['unit', 'ios', 'settings'],
        testFn: async () => {
            const settings = fs.readFileSync(
                path.resolve(__dirname, '..', '..', 'ios', 'app', '(host)', 'settings.tsx'),
                'utf-8',
            );
            return /editable=\{[^}]*etaMode\s*===\s*['"]manual['"][^}]*\}/.test(settings)
                && /\(\s*!canEdit\s*\|\|\s*etaMode\s*!==\s*['"]manual['"]\s*\)\s*&&\s*styles\.inputDisabled/.test(settings);
        },
    },
    {
        name: 'ios: chat drawer has a visible close button (Ionicons close inside styled circle)',
        tags: ['unit', 'ios', 'chat'],
        testFn: async () => {
            const slideOver = fs.readFileSync(
                path.resolve(__dirname, '..', '..', 'ios', 'src', 'ui', 'SlideOver.tsx'),
                'utf-8',
            );
            return /Ionicons/.test(slideOver)
                && /name=['"]close['"]/.test(slideOver)
                && /SafeAreaView/.test(slideOver)
                && /KeyboardAvoidingView/.test(slideOver);
        },
    },
    {
        name: 'ios: add-party sheet wraps in KeyboardAvoidingView (keyboard-overlap fix)',
        tags: ['unit', 'ios', 'add-party'],
        testFn: async () => {
            const sheet = fs.readFileSync(
                path.resolve(__dirname, '..', '..', 'ios', 'src', 'features', 'waiting', 'AddPartySheet.tsx'),
                'utf-8',
            );
            return /KeyboardAvoidingView/.test(sheet)
                && /ScrollView/.test(sheet)
                && /keyboardShouldPersistTaps=['"]handled['"]/.test(sheet);
        },
    },
    {
        name: 'ios: tab bar has Ionicons on all four tabs',
        tags: ['unit', 'ios', 'icons'],
        testFn: async () => {
            const tabs = fs.readFileSync(
                path.resolve(__dirname, '..', '..', 'ios', 'app', '(host)', '_layout.tsx'),
                'utf-8',
            );
            return /tabBarIcon:\s*\(\{[^}]*\}\)\s*=>\s*<Ionicons/.test(tabs)
                && /name=['"]hourglass-outline['"]/.test(tabs)
                && /name=['"]restaurant-outline['"]/.test(tabs)
                && /name=['"]checkmark-done-outline['"]/.test(tabs);
        },
    },

    // ---------- Round 2 bug-bash fixes ----------
    {
        name: 'bugbash2: host chat drawer polls while open and stops on close',
        tags: ['unit', 'bugbash2', 'host', 'chat'],
        testFn: async () =>
            /scheduleChatDrawerPoll/.test(hostJs)
            && /stopChatDrawerPoll/.test(hostJs)
            // openChat arms the poll, closeChat disarms
            && /scheduleChatDrawerPoll\(id\)/.test(hostJs)
            && /stopChatDrawerPoll\(\)/.test(hostJs),
    },
    {
        name: 'bugbash2: .chat-form button has width:auto so it does NOT inherit primary width:100%',
        tags: ['unit', 'bugbash2', 'diner', 'chat', 'css'],
        testFn: async () =>
            /\.chat-form\s+button\s*\{[^}]*width:\s*auto/.test(stylesCss)
            && /\.chat-form\s+button\s*\{[^}]*margin:\s*0/.test(stylesCss),
    },
    {
        name: 'bugbash2: admin QR is wrapped in a test-link anchor for preview',
        tags: ['unit', 'bugbash2', 'admin'],
        testFn: async () =>
            /id=["']admin-qr-test-link["']/.test(adminHtml)
            && /target=["']_blank["']/.test(adminHtml)
            && /qrTestLink\.href/.test(adminJs),
    },
];

void runTests(cases, 'Bug #50 Regression');
