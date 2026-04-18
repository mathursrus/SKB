// ============================================================================
// Unit tests for the 7-tab admin workspace (issue #51, Phase B).
//
// These tests treat public/admin.html as the source of truth for the admin
// UI contract. They assert — via regex on the raw HTML — that:
//   · all 7 tab buttons are declared with the correct data-tab keys;
//   · each tab has a matching <main class="admin-panel" id="admin-panel-X">;
//   · each panel contains the cards the spec assigns to it;
//   · the signature-dish editor has 3 rows, each with file inputs that accept
//     image/* and an <img> preview slot;
//   · the "Regenerate PIN" button exists on the Settings panel.
//
// The admin page does not (yet) have a Node-runnable render path; we parse
// the static HTML file directly. This catches the vast majority of drift
// bugs and stays runnable without JSDOM.
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
const ADMIN_JS = fs.readFileSync(
    path.resolve(__dirname, '../../public/admin.js'),
    'utf8',
);

const TAB_KEYS = ['dashboard', 'site', 'website', 'menu', 'staff', 'ai', 'settings'] as const;

function hasTabButton(key: string): boolean {
    return new RegExp(`<button[^>]*data-tab="${key}"`, 'i').test(ADMIN_HTML);
}
function hasPanel(key: string): boolean {
    return new RegExp(`id="admin-panel-${key}"`, 'i').test(ADMIN_HTML);
}
function panelBody(key: string): string {
    const re = new RegExp(
        `<main[^>]*id="admin-panel-${key}"[^>]*>([\\s\\S]*?)</main>`,
        'i',
    );
    const m = ADMIN_HTML.match(re);
    return m ? m[1] : '';
}

const cases: BaseTestCase[] = [
    // ─── tab bar ──────────────────────────────────────────────────────
    {
        name: 'all 7 tab buttons exist with correct data-tab keys',
        tags: ['unit', 'admin-tabs'],
        testFn: async () => TAB_KEYS.every(hasTabButton),
    },
    {
        name: 'all 7 tab panels exist (admin-panel-<key>)',
        tags: ['unit', 'admin-tabs'],
        testFn: async () => TAB_KEYS.every(hasPanel),
    },
    {
        name: 'staff tab button is gated role-owner-only (hidden by default)',
        tags: ['unit', 'admin-tabs', 'role-gating'],
        testFn: async () => {
            const re = /<button[^>]*data-tab="staff"[^>]*>/i;
            const m = ADMIN_HTML.match(re);
            if (!m) return false;
            return /data-role-owner-only="true"/i.test(m[0])
                && /style="display:none"/i.test(m[0]);
        },
    },

    // ─── Dashboard panel ──────────────────────────────────────────────
    {
        name: 'Dashboard panel holds Service Debrief + Stage-Based Analytics',
        tags: ['unit', 'admin-tabs', 'dashboard'],
        testFn: async () => {
            const body = panelBody('dashboard');
            return body.includes('Service Debrief')
                && body.includes('Stage-Based Analytics')
                && body.includes('admin-stats-grid')
                && body.includes('admin-histograms');
        },
    },

    // ─── Site panel ───────────────────────────────────────────────────
    {
        name: 'Site panel holds address + weekly hours + public host + IVR',
        tags: ['unit', 'admin-tabs', 'site'],
        testFn: async () => {
            const body = panelBody('site');
            return body.includes('admin-site-street')
                && body.includes('admin-site-public-host')
                && body.includes('admin-site-mon-closed')
                && body.includes('admin-site-sun-closed')
                && body.includes('admin-voice-enabled')
                && body.includes('admin-front-desk-phone');
        },
    },

    // ─── Website panel ────────────────────────────────────────────────
    {
        name: 'Website panel holds template picker + content + signature-dish editor',
        tags: ['unit', 'admin-tabs', 'website'],
        testFn: async () => {
            const body = panelBody('website');
            return body.includes('website-template-card')
                && body.includes('admin-website-hero-headline')
                && body.includes('admin-website-about')
                && body.includes('signature-dish-grid')
                && body.includes('admin-website-save');
        },
    },
    {
        name: 'Website panel has exactly 3 signature-dish rows',
        tags: ['unit', 'admin-tabs', 'signature-dish'],
        testFn: async () => {
            const body = panelBody('website');
            const rows = body.match(/class="signature-dish-row"[^>]*data-sig-index=/g) || [];
            return rows.length === 3
                && body.includes('data-sig-index="0"')
                && body.includes('data-sig-index="1"')
                && body.includes('data-sig-index="2"');
        },
    },
    {
        name: 'each signature-dish row has a file input with accept="image/*"',
        tags: ['unit', 'admin-tabs', 'signature-dish'],
        testFn: async () => {
            const body = panelBody('website');
            const fileInputs = body.match(/<input[^>]*class="signature-dish-file"[^>]*accept="image\/\*"/g) || [];
            return fileInputs.length === 3;
        },
    },
    {
        name: 'each signature-dish row has an <img> preview slot',
        tags: ['unit', 'admin-tabs', 'signature-dish'],
        testFn: async () => {
            const body = panelBody('website');
            const previews = body.match(/<img[^>]*class="signature-dish-preview"/g) || [];
            return previews.length === 3;
        },
    },
    {
        name: 'each signature-dish row has a title input and desc textarea',
        tags: ['unit', 'admin-tabs', 'signature-dish'],
        testFn: async () => {
            const body = panelBody('website');
            const titles = body.match(/<input[^>]*class="signature-dish-title"/g) || [];
            const descs = body.match(/<textarea[^>]*class="signature-dish-desc"/g) || [];
            return titles.length === 3 && descs.length === 3;
        },
    },

    // ─── Menu panel ───────────────────────────────────────────────────
    {
        name: 'Menu panel is a placeholder with a menuUrl input + save button',
        tags: ['unit', 'admin-tabs', 'menu'],
        testFn: async () => {
            const body = panelBody('menu');
            return body.includes('coming soon')
                && body.includes('admin-menu-url')
                && body.includes('admin-menu-save');
        },
    },

    // ─── Staff panel ──────────────────────────────────────────────────
    {
        name: 'Staff panel keeps the existing staff table and invite form',
        tags: ['unit', 'admin-tabs', 'staff'],
        testFn: async () => {
            const body = panelBody('staff');
            return body.includes('staff-table')
                && body.includes('invite-form')
                && body.includes('pending-table');
        },
    },

    // ─── AI panel ─────────────────────────────────────────────────────
    {
        name: 'AI panel holds the Ask OSH (MCP) card unchanged',
        tags: ['unit', 'admin-tabs', 'ai'],
        testFn: async () => {
            const body = panelBody('ai');
            return body.includes('admin-mcp-card')
                && body.includes('mcp-endpoint')
                && body.includes('mcp-location-header')
                && body.includes('mcp-bearer');
        },
    },

    // ─── Settings panel ───────────────────────────────────────────────
    {
        name: 'Settings panel holds Door QR card + Device PIN with Regenerate button',
        tags: ['unit', 'admin-tabs', 'settings'],
        testFn: async () => {
            const body = panelBody('settings');
            return body.includes('admin-qr-image')
                && body.includes('admin-visit-mode')
                && body.includes('admin-device-pin-display')
                && body.includes('admin-device-pin-regen')
                && /Regenerate PIN/i.test(body);
        },
    },

    // ─── admin.js tab contract ────────────────────────────────────────
    {
        name: 'admin.js exports a TAB_KEYS list covering all 7 tabs',
        tags: ['unit', 'admin-tabs', 'admin-js'],
        testFn: async () => {
            const re = /const\s+TAB_KEYS\s*=\s*\[([^\]]+)\]/;
            const m = ADMIN_JS.match(re);
            if (!m) return false;
            return TAB_KEYS.every(k => new RegExp(`['"]${k}['"]`).test(m[1]));
        },
    },
    {
        name: 'admin.js persists the active tab under skb:adminTab:<loc>',
        tags: ['unit', 'admin-tabs', 'admin-js'],
        testFn: async () => ADMIN_JS.includes('skb:adminTab:'),
    },
    {
        name: 'admin.js lazy-loads each tab via tabLoaders',
        tags: ['unit', 'admin-tabs', 'admin-js'],
        testFn: async () => /tabLoaders\s*=\s*{/.test(ADMIN_JS) && ADMIN_JS.includes('loadedPanels'),
    },
    {
        name: 'admin.js builds knownFor payload with { mime, data } or URL string',
        tags: ['unit', 'admin-tabs', 'signature-dish', 'admin-js'],
        testFn: async () => {
            return ADMIN_JS.includes('buildKnownForPayload')
                && /FileReader/.test(ADMIN_JS)
                && /readAsDataURL/.test(ADMIN_JS);
        },
    },

    // ─── wordmark preserved ───────────────────────────────────────────
    {
        name: 'topbar retains OSH · OS for Hospitality wordmark (spec §5)',
        tags: ['unit', 'admin-tabs', 'branding'],
        testFn: async () =>
            /brand-mark[^>]*>OSH/i.test(ADMIN_HTML)
            && /brand-expand[^>]*>OS for Hospitality/i.test(ADMIN_HTML),
    },
];

void runTests(cases, 'admin tabs (issue #51 Phase B)');
