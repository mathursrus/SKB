// ============================================================================
// Unit tests for issue #57 — marketing landing + brand refresh
// ============================================================================
// Covers the static-file layer of §57 acceptance:
//   R1 — public/landing.html exists, has a "Start free" CTA linking to /signup
//   R4 — admin.html + host.html brand-block + titles use the platform
//        placeholder `SKB Platform` (admin is platform-scoped) or the
//        restaurant name slot (host stand is restaurant-scoped).
//
// The HTML-level checks here are deliberately string-based: these files are
// served as static assets with no template engine, so a simple presence
// check is both sufficient and cheap. The server route + host-rewrite
// behavior is covered in tests/integration/marketing-landing.integration.test.ts.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests, type BaseTestCase } from '../test-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', '..', 'public');

function loadPage(name: string): string {
    return fs.readFileSync(path.join(PUBLIC_DIR, name), 'utf-8');
}

const cases: BaseTestCase[] = [
    // ── R1: marketing landing ─────────────────────────────────────────
    {
        name: 'public/landing.html exists and is non-empty',
        tags: ['unit', 'issue-57', 'landing'],
        testFn: async () => {
            const html = loadPage('landing.html');
            return html.length > 500;
        },
    },
    {
        name: 'landing.html has a Start free CTA linking to /signup',
        tags: ['unit', 'issue-57', 'landing'],
        testFn: async () => {
            const html = loadPage('landing.html');
            // Accept either href="/signup" or href="signup" (any attr quoting).
            const ctaCopy = /Start\s+free/i.test(html);
            const signupLink = /href\s*=\s*["']\/signup["']/i.test(html)
                || /href\s*=\s*["']signup(?:\.html)?["']/i.test(html);
            return ctaCopy && signupLink;
        },
    },
    {
        name: 'landing.html uses the SKB Platform placeholder (spec §5)',
        tags: ['unit', 'issue-57', 'landing', 'brand'],
        testFn: async () => {
            const html = loadPage('landing.html');
            return html.includes('SKB Platform');
        },
    },
    {
        name: 'landing.html has a human-fallback mailto link',
        tags: ['unit', 'issue-57', 'landing'],
        testFn: async () => {
            const html = loadPage('landing.html');
            return /mailto:hello@example\.com/i.test(html);
        },
    },

    // ── R4: admin.html brand-block → platform placeholder ─────────────
    {
        name: 'admin.html title uses SKB Platform (platform-scoped surface)',
        tags: ['unit', 'issue-57', 'brand', 'admin'],
        testFn: async () => {
            const html = loadPage('admin.html');
            // <title>SKB Platform — Admin</title> (em-dash ok, hyphen ok)
            return /<title>[^<]*SKB\s+Platform[^<]*Admin[^<]*<\/title>/i.test(html);
        },
    },
    {
        name: 'admin.html topbar brand text is SKB Platform · Admin',
        tags: ['unit', 'issue-57', 'brand', 'admin'],
        testFn: async () => {
            const html = loadPage('admin.html');
            // Accept either middle-dot (U+00B7, &middot;, &#183;) or a
            // plain hyphen as the separator. Entity form is what the HTML
            // actually ships with (HTML escape is load-bearing — the file
            // has no explicit charset meta tag dependency).
            return /class=["']brand["'][^>]*>\s*SKB\s+Platform\s*(?:&middot;|&#183;|[·\-–—])\s*Admin/i.test(html);
        },
    },
    {
        name: 'admin.html login card heading uses SKB Platform',
        tags: ['unit', 'issue-57', 'brand', 'admin'],
        testFn: async () => {
            const html = loadPage('admin.html');
            return /<h2[^>]*>\s*SKB\s+Platform\s*[·\-–—]\s*Admin/i.test(html);
        },
    },
    {
        name: 'admin.html exposes a slot for restaurant name in topbar',
        tags: ['unit', 'issue-57', 'brand', 'admin'],
        testFn: async () => {
            const html = loadPage('admin.html');
            // The brand block gains an id="admin-restaurant-name" span that
            // admin.js fills in from the location payload after login.
            return html.includes('id="admin-restaurant-name"');
        },
    },
    {
        name: 'admin.html no longer has bare "SKB · Admin" text',
        tags: ['unit', 'issue-57', 'brand', 'admin'],
        testFn: async () => {
            const html = loadPage('admin.html');
            // "SKB · Admin" (with no "Platform") must not appear as a visible
            // brand string. The separator can be "·" or "-"; the test
            // matches the form that the spec said to replace.
            // Match 'SKB' NOT followed by ' Platform'.
            return !/\bSKB(?!\s+Platform)\s*[·\-–—]\s*Admin/i.test(html);
        },
    },

    // ── R4: host.html brand-block → restaurant-scoped ─────────────────
    {
        name: 'host.html exposes a slot for restaurant name in topbar',
        tags: ['unit', 'issue-57', 'brand', 'host'],
        testFn: async () => {
            const html = loadPage('host.html');
            return html.includes('id="host-restaurant-name"');
        },
    },
    {
        name: 'host.html topbar brand uses restaurant-name slot, not hardcoded SKB',
        tags: ['unit', 'issue-57', 'brand', 'host'],
        testFn: async () => {
            const html = loadPage('host.html');
            // Topbar brand: "<span id="host-restaurant-name">...</span> · Host Stand"
            // Ensure the hardcoded "SKB · Host Stand" form is gone.
            const hasSlotBrand = /id=["']host-restaurant-name["']/.test(html)
                && /Host\s+Stand/.test(html);
            const noHardcoded = !/>\s*SKB\s*[·\-–—]\s*Host\s+Stand\s*</i.test(html);
            return hasSlotBrand && noHardcoded;
        },
    },
    {
        name: 'host.html login card heading allows restaurant-name slot',
        tags: ['unit', 'issue-57', 'brand', 'host'],
        testFn: async () => {
            const html = loadPage('host.html');
            // The PIN-login card h2 should use the restaurant-name slot too.
            // A second id for the login-view copy keeps the slot-filling
            // logic uniform.
            return /id=["']host-login-restaurant-name["']/.test(html);
        },
    },

    // ── Signup page brand touches ─────────────────────────────────────
    {
        name: 'signup.html brand uses SKB Platform (platform-scoped surface)',
        tags: ['unit', 'issue-57', 'brand', 'signup'],
        testFn: async () => {
            const html = loadPage('signup.html');
            // <div class="brand">SKB Platform</div>
            return /class=["']brand["'][^>]*>\s*SKB\s+Platform\s*</i.test(html);
        },
    },
    {
        name: 'signup.html title uses SKB Platform',
        tags: ['unit', 'issue-57', 'brand', 'signup'],
        testFn: async () => {
            const html = loadPage('signup.html');
            return /<title>[^<]*SKB\s+Platform[^<]*<\/title>/i.test(html);
        },
    },
];

void runTests(cases, 'marketing landing + brand refresh (issue #57) unit');
