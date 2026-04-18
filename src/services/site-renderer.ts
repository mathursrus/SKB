// ============================================================================
// SKB — Website template renderer (issue #56)
// ============================================================================
// Resolves which template (saffron / slate) to serve for a given location,
// loads the page HTML from disk, and performs simple {{placeholder}}
// substitution from the location's structured content.
//
// Design notes:
//  - Pure `renderTemplate()` keeps placeholder substitution testable without
//    touching disk or DB.
//  - `renderSitePage()` is the I/O wrapper used by the Express route handler.
//  - Backward compat: if a location has no `websiteTemplate` set and the
//    saffron template directory doesn't yet exist on disk, fall back to the
//    legacy files under `public/` (home.html, about.html, etc.) so
//    skbbellevue.com keeps working during rollout.
// ============================================================================

import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_WEBSITE_TEMPLATE, VALID_WEBSITE_TEMPLATES } from './locations.js';
import type { Location, LocationContent, WebsiteTemplateKey } from '../types/queue.js';

/**
 * The canonical page keys that every template must provide. Maps to a file
 * name under `public/templates/<template>/`.
 *
 * Kept separate from the server's URL→file map so the template files can
 * evolve (e.g., adding a `reservations` page) without changing URL routing.
 */
export const TEMPLATE_PAGE_FILES = {
    home: 'home.html',
    menu: 'menu.html',
    about: 'about.html',
    hours: 'hours-location.html',
    contact: 'contact.html',
} as const;

export type TemplatePageKey = keyof typeof TEMPLATE_PAGE_FILES;

/**
 * The full set of placeholder tokens the renderer supports. Templates may
 * reference any subset. Unknown placeholders pass through untouched so
 * template authors can temporarily leave tokens in place while iterating.
 */
export const PLACEHOLDER_KEYS = [
    'brandName',
    'heroHeadline',
    'heroSubhead',
    'about',
    'contactEmail',
    'instagramHandle',
    'reservationsNote',
] as const;

export type PlaceholderKey = (typeof PLACEHOLDER_KEYS)[number];

// HTML escape — single pass, handles the five characters that matter for
// attribute + text contexts. Matches the shape of `esc()` in
// `public/site-config.js` so the two stays visually compatible.
const HTML_ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#x27;',
};

function escHtml(value: string): string {
    return value.replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c] ?? c);
}

/**
 * Pick the template key to render for this location, defaulting to saffron
 * when unset or unknown (so the existing SKB site is byte-preserved — R1).
 */
export function resolveTemplateKey(location: Pick<Location, 'websiteTemplate'>): WebsiteTemplateKey {
    const stored = location.websiteTemplate;
    if (stored && (VALID_WEBSITE_TEMPLATES as readonly string[]).includes(String(stored))) {
        return stored;
    }
    return DEFAULT_WEBSITE_TEMPLATE;
}

/**
 * Build the placeholder→value map for a location. Values are NOT yet
 * HTML-escaped — escaping happens in `renderTemplate`.
 */
function buildPlaceholderValues(location: Pick<Location, 'name' | 'content'>): Record<PlaceholderKey, string> {
    const content: LocationContent = location.content ?? {};
    return {
        brandName: location.name ?? '',
        heroHeadline: content.heroHeadline ?? '',
        heroSubhead: content.heroSubhead ?? '',
        about: content.about ?? '',
        contactEmail: content.contactEmail ?? '',
        instagramHandle: content.instagramHandle ?? '',
        reservationsNote: content.reservationsNote ?? '',
    };
}

/**
 * Replace `{{placeholderName}}` tokens in `html` with the corresponding
 * values from the location. All substituted values are HTML-escaped to
 * defend against stored-XSS via the admin editor. Unknown placeholders are
 * passed through unchanged so authors can stage new content without breaking
 * the render.
 *
 * Exported for unit testing.
 */
export function renderTemplate(
    html: string,
    location: Pick<Location, 'name' | 'content'>,
): string {
    const values = buildPlaceholderValues(location);
    return html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
        if (!(PLACEHOLDER_KEYS as readonly string[]).includes(key)) return match;
        return escHtml(values[key as PlaceholderKey]);
    });
}

async function fileExists(p: string): Promise<boolean> {
    try {
        await access(p);
        return true;
    } catch {
        return false;
    }
}

/** Resolve the HTML file path to read for a location + page.
 *
 * Resolution order:
 *   1. `public/templates/<activeKey>/<file>`  — the picked template's own file.
 *   2. For saffron + SKB tenant (`_id === 'skb'`) only: the legacy flat
 *      `public/<file>` files. These hand-written pages carry the
 *      "Shri Krishna Bhavan" brand copy and have no `{{placeholder}}`
 *      substitution points, so they must NEVER be served to any other tenant
 *      (spec G5: zero observable change for SKB Bellevue while preventing
 *      new-tenant content leak, issue #51 bug-bash).
 *   3. `public/templates/saffron/<file>` — the parameterized saffron fallback
 *      when a non-saffron template is missing a specific page.
 *   4. `public/templates/slate/<file>` — ultimate fallback so no tenant ever
 *      sees a 404 due to a missing template page.
 *
 * Returns `null` when no file is found.
 *
 * Issue #51 bug-bash history: an earlier version fell through to the legacy
 * `public/home.html` for every saffron tenant, so a brand-new restaurant
 * picking the default template inherited SKB's hand-written home page. The
 * `_id === 'skb'` guard restored G5 but left non-SKB saffron tenants hitting
 * slate's cool teal palette. This revision routes them to the new
 * `public/templates/saffron/` directory, preserving the warm saffron look.
 */
export async function resolveTemplateFile(
    publicDir: string,
    location: Pick<Location, 'websiteTemplate' | '_id'>,
    pageKey: TemplatePageKey,
): Promise<string | null> {
    const file = TEMPLATE_PAGE_FILES[pageKey];
    if (!file) return null;

    const activeKey = resolveTemplateKey(location);
    const locationId = (location as { _id?: string })._id;
    const isSkb = locationId === 'skb';

    // Legacy saffron site lives flat under public/. The legacy file name for
    // the menu page is `menu-page.html`, not `menu.html` — keep the mapping
    // here so the templates dir can standardize on the friendlier name.
    const legacyMap: Record<TemplatePageKey, string> = {
        home: 'home.html',
        menu: 'menu-page.html',
        about: 'about.html',
        hours: 'hours-location.html',
        contact: 'contact.html',
    };

    const candidates: string[] = [];

    if (activeKey === 'saffron') {
        if (isSkb) {
            // Preserve the SKB Bellevue site byte-for-byte (G5): the legacy
            // flat files ARE the saffron template for this one tenant, and
            // they take precedence over templates/saffron/ so skbbellevue.com
            // renders the exact hand-written pages the owner curated.
            candidates.push(path.join(publicDir, legacyMap[pageKey]));
            candidates.push(path.join(publicDir, 'templates', 'saffron', file));
        } else {
            // Non-SKB saffron tenants get the parameterized saffron template
            // — warm palette, tenant-specific copy — and never the legacy
            // hand-written SKB pages.
            candidates.push(path.join(publicDir, 'templates', 'saffron', file));
        }
        // Ultimate fallback so a missing page never 404s.
        candidates.push(path.join(publicDir, 'templates', 'slate', file));
    } else {
        // Non-saffron template (currently only 'slate'): serve its own file,
        // then fall back to the parameterized saffron template if a page is
        // missing. Legacy flat files are consulted only for the SKB tenant.
        candidates.push(path.join(publicDir, 'templates', activeKey, file));
        candidates.push(path.join(publicDir, 'templates', 'saffron', file));
        if (isSkb) {
            candidates.push(path.join(publicDir, legacyMap[pageKey]));
        }
    }

    for (const c of candidates) {
        if (await fileExists(c)) return c;
    }
    return null;
}

/** Render a full page for a given location. Reads the template file and
 * applies placeholder substitution. Returns `null` if no template file
 * could be resolved (caller should 404).
 */
export async function renderSitePage(
    publicDir: string,
    location: Location,
    pageKey: TemplatePageKey,
): Promise<string | null> {
    const filePath = await resolveTemplateFile(publicDir, location, pageKey);
    if (!filePath) return null;
    const html = await readFile(filePath, 'utf8');
    return renderTemplate(html, location);
}
