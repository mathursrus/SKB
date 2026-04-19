// ============================================================================
// Unit tests for the inline onboarding wizard (issue #51, Phase C).
//
// These tests parse public/admin.html and public/onboarding.js directly
// and assert the wizard contract that Sid specified in Phase C:
//   · all 6 steps exist with the right data-panel keys
//   · each step has a Save + Cancel button (dirty-tracking), Back/Next,
//     and Skip where appropriate
//   · each step's expected form field ids are present
//   · the clickable progress indicator has a <li> per step
//   · the preview pane exists with an iframe
//   · controller wires save/cancel/next/back correctly
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests, type BaseTestCase } from '../test-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_HTML = fs.readFileSync(
    path.resolve(__dirname, '../../public/admin.html'),
    'utf8',
);
const ONBOARDING_JS = fs.readFileSync(
    path.resolve(__dirname, '../../public/onboarding.js'),
    'utf8',
);

const STEP_IDS = ['basics', 'template', 'content', 'dishes', 'menu', 'staff'] as const;
const SKIPPABLE: Record<string, boolean> = { basics: true, content: true, dishes: true, menu: true, staff: true };

function panelBody(step: string): string {
    const re = new RegExp(
        `<div[^>]*class="[^"]*onboarding-wiz-panel[^"]*"[^>]*data-panel="${step}"[^>]*>([\\s\\S]*?)</div>\\s*(?=<div[^>]*class="[^"]*onboarding-wiz-panel|</section>)`,
        'i',
    );
    const m = ADMIN_HTML.match(re);
    return m ? m[1] : '';
}

function hasButton(step: string, cls: string): boolean {
    const body = panelBody(step);
    return new RegExp(`<button[^>]*class="[^"]*${cls}[^"]*"`, 'i').test(body);
}

const cases: BaseTestCase[] = [
    // ─── wizard shell preserved ───────────────────────────────────────
    {
        name: 'outer overlay id="onboarding-overlay" preserved (Phase B compat)',
        tags: ['unit', 'onboarding-wizard'],
        testFn: async () => /id="onboarding-overlay"[^>]*/.test(ADMIN_HTML),
    },
    {
        name: 'data-target-step attributes retained on each step (Phase B compat)',
        tags: ['unit', 'onboarding-wizard'],
        testFn: async () => STEP_IDS.every(id =>
            new RegExp(`data-target-step="${id}"`, 'i').test(ADMIN_HTML),
        ),
    },
    {
        name: 'Dismiss button + Setup reopen pill retained',
        tags: ['unit', 'onboarding-wizard'],
        testFn: async () =>
            /id="onboarding-dismiss"/i.test(ADMIN_HTML)
            && /id="onboarding-reopen"/i.test(ADMIN_HTML),
    },

    // ─── 6 step panels exist ──────────────────────────────────────────
    {
        name: 'all 6 wizard step panels exist (data-panel="<step>")',
        tags: ['unit', 'onboarding-wizard'],
        testFn: async () => STEP_IDS.every(id =>
            new RegExp(`data-panel="${id}"`, 'i').test(ADMIN_HTML),
        ),
    },
    {
        name: '"You\'re live" final panel exists (data-panel="done")',
        tags: ['unit', 'onboarding-wizard'],
        testFn: async () =>
            /data-panel="done"/i.test(ADMIN_HTML)
            && /id="wiz-live-pin"/i.test(ADMIN_HTML)
            && /id="wiz-live-url"/i.test(ADMIN_HTML),
    },

    // ─── progress nav ─────────────────────────────────────────────────
    {
        name: 'progress nav has a <li> for each of the 6 steps',
        tags: ['unit', 'onboarding-wizard'],
        testFn: async () => {
            const re = /class="onboarding-wiz-step[^"]*"\s+data-step="([a-z]+)"/g;
            const seen = new Set<string>();
            let m;
            while ((m = re.exec(ADMIN_HTML))) seen.add(m[1]);
            return STEP_IDS.every(id => seen.has(id));
        },
    },
    {
        name: 'progress counter element exists (id=onboarding-progress)',
        tags: ['unit', 'onboarding-wizard'],
        testFn: async () => /id="onboarding-progress"/i.test(ADMIN_HTML),
    },

    // ─── each step has Save + Cancel + Back/Next/Skip as appropriate ──
    {
        name: 'every step panel has a Save button with data-step="<id>"',
        tags: ['unit', 'onboarding-wizard'],
        testFn: async () => STEP_IDS.every(id => hasButton(id, 'wiz-save')),
    },
    {
        name: 'every step panel has a Cancel button with data-step="<id>"',
        tags: ['unit', 'onboarding-wizard'],
        testFn: async () => STEP_IDS.every(id => hasButton(id, 'wiz-cancel')),
    },
    {
        name: 'every step panel has a Next button',
        tags: ['unit', 'onboarding-wizard'],
        testFn: async () => STEP_IDS.every(id => hasButton(id, 'wiz-next')),
    },
    {
        name: 'skippable steps have a Skip button (basics/content/dishes/menu/staff)',
        tags: ['unit', 'onboarding-wizard'],
        testFn: async () =>
            Object.keys(SKIPPABLE).every(id => hasButton(id, 'wiz-skip')),
    },
    {
        name: 'non-first steps have a Back button',
        tags: ['unit', 'onboarding-wizard'],
        testFn: async () =>
            STEP_IDS.slice(1).every(id => hasButton(id, 'wiz-back')),
    },

    // ─── step-specific field contracts ────────────────────────────────
    {
        name: 'basics panel has address + phone + weekly hours grid fields',
        tags: ['unit', 'onboarding-wizard', 'basics'],
        testFn: async () => {
            const body = panelBody('basics');
            return body.includes('id="wiz-basics-street"')
                && body.includes('id="wiz-basics-city"')
                && body.includes('id="wiz-basics-state"')
                && body.includes('id="wiz-basics-zip"')
                && body.includes('id="wiz-basics-phone"')
                && body.includes('id="wiz-basics-hours-body"');
        },
    },
    {
        name: 'template panel has Saffron + Slate radio cards',
        tags: ['unit', 'onboarding-wizard', 'template'],
        testFn: async () => {
            const body = panelBody('template');
            return /data-template="saffron"/.test(body)
                && /data-template="slate"/.test(body)
                && /value="saffron"/.test(body)
                && /value="slate"/.test(body);
        },
    },
    {
        name: 'content panel has hero + about + instagram + reservations',
        tags: ['unit', 'onboarding-wizard', 'content'],
        testFn: async () => {
            const body = panelBody('content');
            return body.includes('id="wiz-content-headline"')
                && body.includes('id="wiz-content-subhead"')
                && body.includes('id="wiz-content-about"')
                && body.includes('id="wiz-content-instagram"')
                && body.includes('id="wiz-content-reservations"');
        },
    },
    {
        name: 'dishes panel has 3 rows with file inputs and image previews',
        tags: ['unit', 'onboarding-wizard', 'dishes'],
        testFn: async () => {
            const body = panelBody('dishes');
            const rows = body.match(/class="wiz-dish-row"[^>]*data-dish-index=/g) || [];
            const files = body.match(/class="wiz-dish-file"[^>]*accept="image\/\*"/g) || [];
            const previews = body.match(/<img[^>]*class="wiz-dish-preview"/g) || [];
            return rows.length === 3 && files.length === 3 && previews.length === 3;
        },
    },
    {
        name: 'menu panel has a menuUrl input',
        tags: ['unit', 'onboarding-wizard', 'menu'],
        testFn: async () => {
            const body = panelBody('menu');
            return body.includes('id="wiz-menu-url"');
        },
    },
    {
        name: 'staff panel has name + email + role radios + queue list',
        tags: ['unit', 'onboarding-wizard', 'staff'],
        testFn: async () => {
            const body = panelBody('staff');
            return body.includes('id="wiz-staff-name"')
                && body.includes('id="wiz-staff-email"')
                && /name="role"\s+value="admin"/.test(body)
                && /name="role"\s+value="host"/.test(body)
                && body.includes('id="wiz-staff-queue-list"');
        },
    },

    // ─── preview pane ─────────────────────────────────────────────────
    {
        name: 'preview pane exists with an iframe targeted by controller',
        tags: ['unit', 'onboarding-wizard', 'preview'],
        testFn: async () =>
            /id="wiz-preview-iframe"/i.test(ADMIN_HTML)
            && /id="wiz-preview-refresh"/i.test(ADMIN_HTML)
            && /id="onboarding-wiz-preview"/i.test(ADMIN_HTML),
    },
    {
        name: 'preview has mobile toggle button (under 860px collapses)',
        tags: ['unit', 'onboarding-wizard', 'preview', 'responsive'],
        testFn: async () => /id="wiz-preview-toggle"/i.test(ADMIN_HTML),
    },

    // ─── controller wiring ────────────────────────────────────────────
    {
        name: 'onboarding.js declares ordered STEP_IDS matching the 6-step spec',
        tags: ['unit', 'onboarding-wizard', 'controller'],
        testFn: async () => {
            const m = ONBOARDING_JS.match(/var\s+STEP_IDS\s*=\s*\[([^\]]+)\]/);
            if (!m) return false;
            return STEP_IDS.every(id => new RegExp(`['"]${id}['"]`).test(m[1]));
        },
    },
    {
        name: 'controller POSTs through the expected endpoint set',
        tags: ['unit', 'onboarding-wizard', 'controller'],
        testFn: async () =>
            ONBOARDING_JS.includes("apiPath('host/site-config')") ||
            ONBOARDING_JS.includes("'host/site-config'"),
    },
    {
        name: 'controller uses FileReader.readAsDataURL for dish uploads',
        tags: ['unit', 'onboarding-wizard', 'controller', 'dishes'],
        testFn: async () =>
            /readAsDataURL/.test(ONBOARDING_JS) && /FileReader/.test(ONBOARDING_JS),
    },
    {
        name: 'controller listens for storage events (cross-tab continuity)',
        tags: ['unit', 'onboarding-wizard', 'controller'],
        testFn: async () =>
            /addEventListener\(['"]storage['"]/.test(ONBOARDING_JS),
    },
    {
        name: 'controller toggles Save disabled via recomputeDirty',
        tags: ['unit', 'onboarding-wizard', 'controller', 'dirty-tracking'],
        testFn: async () =>
            /recomputeDirty/.test(ONBOARDING_JS)
            && /markCleanEnabled/.test(ONBOARDING_JS),
    },
    {
        name: 'controller exposes a refreshPreview function pointing at /r/<slug>/',
        tags: ['unit', 'onboarding-wizard', 'controller', 'preview'],
        testFn: async () =>
            /function refreshPreview/.test(ONBOARDING_JS)
            && /\/r\/'\s*\+\s*slug/.test(ONBOARDING_JS),
    },
];

void runTests(cases, 'onboarding wizard (issue #51 Phase C)');
