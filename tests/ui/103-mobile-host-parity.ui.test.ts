// ============================================================================
// UI test - Issue #103 R12 / Validation Plan §2a: action-set parity
// ============================================================================
//
// The mobile redesign of /host MUST preserve full feature parity with the
// desktop table. This test asserts that:
//   1. host.js still emits every data-action selector from the v1 desktop
//      Waiting renderer (host.js:144-156): sentiment, seat, notify, chat,
//      call, custom-sms, custom-call, plus the no-show "remove" button.
//   2. host.js still emits every transition cell + state badge + advance
//      button + departed shortcut for the Seated renderer (host.js:209-217).
//   3. styles.css contains the @media (max-width: 720px) card-mode block
//      that turns the existing tr/td DOM into a card stack on phone-width
//      WITHOUT requiring host.js to render a parallel mobile DOM. This is
//      the key parity guarantee — same DOM, same data-action set, both
//      layouts share a single render path.
//
// The actual viewport-render behavior (does the card visually fit on a
// 375 px phone with all 8 actions tappable) is enforced separately by
// 103-diner-mobile-fold.ui.test.ts (Playwright) and by manual validation
// at 375 / 768 / 1280 documented in 103-implement-evidence.md.
// ============================================================================

process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_103_host_parity_ui_test';
process.env.PORT ??= '13403';
process.env.FRAIM_TEST_SERVER_PORT ??= process.env.PORT;
process.env.FRAIM_BRANCH ??= '';
process.env.SKB_HOST_PIN ??= '1234';

import { runTests, type BaseTestCase } from '../test-utils.js';
import { startTestServer, stopTestServer, getTestServerUrl } from '../shared-server-utils.js';

const BASE = () => getTestServerUrl();

// host.js Waiting-row action surface. Every selector here MUST appear in
// the served host.js or the mobile redesign has regressed feature parity
// vs. the desktop table (R12). Custom-SMS and Custom-Call were retired:
// compose merged into the Chat drawer; the Call anchor needs no separate
// confirm dialog. Only the three host comm channels — Notify, Chat, Call
// — and Sentiment/Seat/No-show remain.
const WAITING_ACTIONS = [
    'data-action="sentiment"',
    'data-action="seat"',
    'data-action="notify"',
    'data-action="chat"',
    'data-action="call"',
    'data-reason="no_show"',
];

// host.js:209-217 enumerates the Seated-row action surface plus the
// transition-duration cells and state badge. We assert against substrings
// that appear in the host.js SOURCE (not the rendered HTML), so e.g. the
// transit-cell class is built by string concatenation and we check for
// the bare class name rather than the full `class="transit-cell"` form.
const SEATED_FEATURES = [
    'class="advance-btn"',     // state-advance ladder primary action
    'class="depart-btn"',      // departed shortcut
    'state-badge state-',      // state badge wrapper (concatenated)
    'transit-cell',            // transit-duration cells (Waited/To Order/...)
    'class="table-num"',       // table number cell (Seated tab)
    'class="timeline-detail"', // tap-to-expand timeline
];

// styles.css MUST contain a @media (max-width: 720px) block that swaps the
// host page tables into card-mode. The block defines table/thead/tr/td
// display swaps and column-label pseudo-elements. Without this block the
// page renders as a shrunk-down 1024-px table on phones (the very bug
// issue #103 was filed to fix).
const CARD_MODE_CSS_RULES = [
    '@media (max-width: 720px)',
    'body.host',
    '.mobile-action-bar',           // sticky bottom bar element
];

const cases: BaseTestCase[] = [
    {
        name: 'setup: server',
        tags: ['ui', 'issue-103', 'setup'],
        testFn: async () => { await startTestServer(); return true; },
    },
    {
        name: 'host.html restores width=device-width viewport (R4)',
        tags: ['ui', 'issue-103', 'viewport'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/host.html`);
            const html = await r.text();
            // Must not contain the broken width=1024 lock; must contain device-width.
            return html.includes('content="width=device-width,initial-scale=1"')
                && !html.includes('content="width=1024');
        },
    },
    {
        name: 'host.html includes the mobile sticky action bar (R7)',
        tags: ['ui', 'issue-103', 'mobile-action-bar'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/host.html`);
            const html = await r.text();
            // The mobile action bar must contain duplicates of + Add party
            // and the ETA mode/turn-time controls. We assert by id-suffix
            // convention so a future refactor can rename freely without
            // breaking this assertion as long as the convention holds.
            return html.includes('class="mobile-action-bar"')
                && html.includes('id="add-party-btn-mobile"')
                && html.includes('id="eta-mode-mobile"')
                && html.includes('id="turn-mobile"');
        },
    },
    {
        name: 'host.js preserves all Waiting row actions on mobile (R12 / §2a)',
        tags: ['ui', 'issue-103', 'parity', 'waiting'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/host.js`);
            const js = await r.text();
            const missing = WAITING_ACTIONS.filter(sel => !js.includes(sel));
            if (missing.length > 0) {
                throw new Error(`host.js missing Waiting actions: ${missing.join(', ')}`);
            }
            return true;
        },
    },
    {
        name: 'host.js preserves Seated state-ladder + metric cells (R12 / §2a)',
        tags: ['ui', 'issue-103', 'parity', 'seated'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/host.js`);
            const js = await r.text();
            const missing = SEATED_FEATURES.filter(sel => !js.includes(sel));
            if (missing.length > 0) {
                throw new Error(`host.js missing Seated features: ${missing.join(', ')}`);
            }
            return true;
        },
    },
    {
        name: 'host.js attaches data-label to each waiting/dining td for card-mode labels (R5)',
        tags: ['ui', 'issue-103', 'card-labels'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/host.js`);
            const js = await r.text();
            // Card-mode CSS prepends column labels via td::before { content:
            // attr(data-label) }. The renderer must therefore set data-label
            // on each td. The fixed-string labels appear directly in the
            // source as data-label="..."; the transit-cell labels are
            // function-call args to transitCell(value, label) so we check
            // for the argument strings instead.
            return js.includes('data-label="Name"')
                && js.includes('data-label="Size"')
                && js.includes('data-label="Phone"')
                && js.includes('data-label="Promised"')
                && js.includes('data-label="Waiting"')
                && js.includes("'Waited'")
                && js.includes("'To Order'")
                && js.includes("'To Serve'");
        },
    },
    {
        name: 'styles.css defines card-mode @media block at <=720px (R5, R8, R9)',
        tags: ['ui', 'issue-103', 'css', 'card-mode'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/styles.css`);
            const css = await r.text();
            const missing = CARD_MODE_CSS_RULES.filter(rule => !css.includes(rule));
            if (missing.length > 0) {
                throw new Error(`styles.css missing card-mode rules: ${missing.join(', ')}`);
            }
            // The card-mode swap requires display:block on table/thead/tbody/tr.
            // We assert the body.host scoping and at least one display:block
            // table-element rule below the 720 px breakpoint marker.
            const idx = css.indexOf('@media (max-width: 720px)');
            const after720 = css.slice(idx);
            return after720.includes('body.host')
                && after720.includes('display: block');
        },
    },
    {
        name: 'styles.css enforces >=44px tap targets on host mobile (R6)',
        tags: ['ui', 'issue-103', 'css', 'tap-targets'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/styles.css`);
            const css = await r.text();
            // The host-mobile media block must declare min-height: 44px on
            // interactive controls. We assert the literal substring so a
            // future regression that drops to 36 px (sub-WCAG) fails.
            const idx = css.indexOf('@media (max-width: 720px)');
            const after720 = css.slice(idx);
            return after720.includes('min-height: 44px');
        },
    },
    {
        name: 'styles.css adds diner mobile compaction at <=480px (R1)',
        tags: ['ui', 'issue-103', 'css', 'diner'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/styles.css`);
            const css = await r.text();
            // The diner mobile block compacts the header + status card so the
            // join form lands above the 667 px fold. Assert the breakpoint and
            // a marker rule (the new .status-strip companion class OR the
            // compacted .diner header padding).
            const idx = css.indexOf('@media (max-width: 480px)');
            if (idx < 0) {
                throw new Error('styles.css is missing the @media (max-width: 480px) diner block');
            }
            const after480 = css.slice(idx);
            return after480.includes('.diner header')
                || after480.includes('.status');
        },
    },
    {
        name: 'styles.css adds form-2up grid for size+phone at 321-480px (R3)',
        tags: ['ui', 'issue-103', 'css', 'form-2up'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/styles.css`);
            const css = await r.text();
            // form-2up wraps the size + phone label/input pairs. Single-column
            // fallback at <=320 px MUST be present so older Android budget
            // phones don't ship a cramped 2-up.
            return css.includes('.form-2up')
                && css.includes('@media (max-width: 320px)');
        },
    },
    {
        name: 'queue.html wraps size+phone in .form-2up (R3)',
        tags: ['ui', 'issue-103', 'queue-html'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/queue.html`);
            const html = await r.text();
            return html.includes('class="form-2up"')
                // The wrapper must contain BOTH the size and phone inputs so
                // CSS can grid them. Assert by their existing IDs (queue.js
                // depends on these IDs — preserved by the redesign).
                && html.includes('id="size"')
                && html.includes('id="phone"');
        },
    },
    {
        name: 'teardown',
        tags: ['ui', 'issue-103', 'teardown'],
        testFn: async () => { await stopTestServer(); return true; },
    },
];

runTests(cases, 'issue #103 mobile usability — host parity + diner compaction');
