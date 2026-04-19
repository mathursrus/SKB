// ============================================================================
// SKB - Server-side template rendering for queue.html
// ============================================================================
//
// Reads the static queue.html template and injects JSON-LD structured data
// and meta tags with live wait-time information from getQueueState() and
// location data from getLocation().
//
// Fallback: if getQueueState() or getLocation() throws (e.g., DB down),
// the page is served with generic meta tags and no JSON-LD. Never blocked.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getQueueState } from './queue.js';
import { getLocation } from './locations.js';
import { buildJsonLd, buildMetaDescription, buildOgDescription, buildOgTitle, buildOgType, buildCanonicalUrl } from './jsonld.js';
import type { Location, QueueStateDTO } from '../types/queue.js';

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
function buildHeadInjection(state: QueueStateDTO, location: Location | null): string {
    const jsonLd = JSON.stringify(buildJsonLd(state, location));
    const metaDesc = escapeAttr(buildMetaDescription(state, location));
    const ogDesc = escapeAttr(buildOgDescription(state, location));
    const ogTitle = escapeAttr(buildOgTitle(location));
    const ogType = escapeAttr(buildOgType());
    const canonicalUrl = buildCanonicalUrl(location);

    const tags: string[] = [
        `<script type="application/ld+json">${jsonLd}</script>`,
        `<meta name="description" content="${metaDesc}" />`,
        `<meta property="og:title" content="${ogTitle}" />`,
        `<meta property="og:description" content="${ogDesc}" />`,
        `<meta property="og:type" content="${ogType}" />`,
    ];

    if (canonicalUrl) {
        tags.push(`<meta property="og:url" content="${escapeAttr(canonicalUrl)}" />`);
        tags.push(`<link rel="canonical" href="${escapeAttr(canonicalUrl)}" />`);
    }

    return tags.join('\n');
}

/**
 * Build a fallback injection when queue state is unavailable.
 */
function buildFallbackHeadInjection(): string {
    const metaDesc = escapeAttr('Shri Krishna Bhavan, Bellevue -- Check the live wait time and join the line online.');
    const ogTitle = escapeAttr(buildOgTitle());
    const ogType = escapeAttr(buildOgType());

    return [
        `<meta name="description" content="${metaDesc}" />`,
        `<meta property="og:title" content="${ogTitle}" />`,
        `<meta property="og:description" content="${metaDesc}" />`,
        `<meta property="og:type" content="${ogType}" />`,
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

/** Substitute the diner-brand placeholders using the location's name / city.
 * Falls back to safe generic copy when a location is missing (e.g., DB down).
 *
 * The queue page is the diner entry point for every tenant — leaking another
 * restaurant's name here would show up as a P0 multi-tenant bug, so we
 * aggressively HTML-escape and default everything.
 */
function substituteBranding(html: string, location: Location | null): string {
    const name = (location?.name ?? '').trim();
    const brandName = name || 'Waitlist';
    const brandMark = (() => {
        // A short 2-3 letter mark for the top-left chip. Prefer initials
        // from the restaurant name words; fall back to the first 3 letters
        // of the slug; finally a generic glyph.
        const words = brandName.split(/\s+/).filter(Boolean);
        if (words.length >= 2) {
            return (words[0][0] + words[1][0] + (words[2]?.[0] ?? '')).toUpperCase().slice(0, 3);
        }
        if (words.length === 1 && words[0].length >= 2) {
            return words[0].slice(0, 3).toUpperCase();
        }
        return (location?._id ?? '').slice(0, 3).toUpperCase() || '•';
    })();
    const city = (location?.address?.city ?? '').trim();
    const cityLine = city ? `${city} · ` : '';
    return html
        .replace(/\{\{brandName\}\}/g, escapeHtml(brandName))
        .replace(/\{\{brandMark\}\}/g, escapeHtml(brandMark))
        .replace(/\{\{cityLine\}\}/g, escapeHtml(cityLine));
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Render queue.html with injected JSON-LD and meta tags plus per-tenant
 * branding (name, city, monogram) substituted into the page body.
 *
 * Fetches both queue state and location data in parallel. If either fails,
 * serves the page with fallback meta tags and no JSON-LD. Never throws.
 */
export async function renderQueuePage(locationId: string, now?: Date): Promise<string> {
    const template = loadTemplate();
    let injection: string;
    let location: Location | null = null;

    try {
        const [state, loc] = await Promise.all([
            getQueueState(locationId, now),
            getLocation(locationId),
        ]);
        location = loc;
        injection = buildHeadInjection(state, location);
    } catch {
        injection = buildFallbackHeadInjection();
    }

    const withHead = template.replace('</head>', `${injection}\n</head>`);
    return substituteBranding(withHead, location);
}

/**
 * Clear the template cache (useful for testing).
 */
export function clearTemplateCache(): void {
    templateCache = null;
}
