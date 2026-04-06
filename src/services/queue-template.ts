// ============================================================================
// SKB - Server-side template rendering for queue.html (Issue #8)
// ============================================================================
//
// Reads the static queue.html template and injects JSON-LD structured data
// and meta tags with live wait-time information from getQueueState().
//
// Fallback: if getQueueState() throws (e.g., DB down), the page is served
// with a generic meta description and no JSON-LD. Page load is never blocked.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getQueueState } from './queue.js';
import { buildJsonLd, buildMetaDescription, buildOgDescription, buildOgTitle } from './jsonld.js';
import type { QueueStateDTO } from '../types/queue.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.resolve(__dirname, '..', '..', 'public', 'queue.html');

let templateCache: string | null = null;

function loadTemplate(): string {
    if (templateCache) return templateCache;
    templateCache = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
    return templateCache;
}

/**
 * Build the HTML string to inject into <head> before the closing </head> tag.
 */
function buildHeadInjection(state: QueueStateDTO): string {
    const jsonLd = JSON.stringify(buildJsonLd(state));
    const metaDesc = escapeAttr(buildMetaDescription(state));
    const ogDesc = escapeAttr(buildOgDescription(state));
    const ogTitle = escapeAttr(buildOgTitle());

    return [
        `<script type="application/ld+json">${jsonLd}</script>`,
        `<meta name="description" content="${metaDesc}" />`,
        `<meta property="og:title" content="${ogTitle}" />`,
        `<meta property="og:description" content="${ogDesc}" />`,
    ].join('\n');
}

/**
 * Build a fallback injection when queue state is unavailable.
 */
function buildFallbackHeadInjection(): string {
    const metaDesc = escapeAttr('Shri Krishna Bhavan, Bellevue -- Check the live wait time and join the line online.');
    const ogTitle = escapeAttr(buildOgTitle());

    return [
        `<meta name="description" content="${metaDesc}" />`,
        `<meta property="og:title" content="${ogTitle}" />`,
        `<meta property="og:description" content="${metaDesc}" />`,
    ].join('\n');
}

/** Escape a string for use inside an HTML attribute value. */
function escapeAttr(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Render queue.html with injected JSON-LD and meta tags.
 *
 * If `getQueueState()` fails, serves the page with fallback meta tags
 * and no JSON-LD block. Never throws.
 */
export async function renderQueuePage(now?: Date): Promise<string> {
    const template = loadTemplate();
    let injection: string;

    try {
        const state = await getQueueState(now);
        injection = buildHeadInjection(state);
    } catch {
        injection = buildFallbackHeadInjection();
    }

    // Inject before </head>
    return template.replace('</head>', `${injection}\n</head>`);
}

/**
 * Clear the template cache (useful for testing).
 */
export function clearTemplateCache(): void {
    templateCache = null;
}
