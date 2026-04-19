// ============================================================================
// SKB - JSON-LD and meta tag generation for Google structured data
// ============================================================================
//
// Generates a Restaurant JSON-LD block and meta tag content from live queue
// state and location data so Google Search / Maps can surface wait-time
// information and link directly to the queue page.
//
// Location-aware: uses Location.publicUrl for absolute URLs when available,
// falls back to hardcoded defaults for backward compatibility.
// ============================================================================

import { buildLocationPageUrl } from '../core/utils/url.js';
import type { Location, QueueStateDTO } from '../types/queue.js';

/** SKB restaurant defaults -- fallback when Location fields are not set. */
const DEFAULTS = {
    name: 'Shri Krishna Bhavan',
    streetAddress: '15245 Bel-Red Rd',
    addressLocality: 'Bellevue',
    addressRegion: 'WA',
    postalCode: '98007',
    addressCountry: 'US',
    telephone: '+1-425-643-0197',
    url: 'https://www.krishnabhavan.com',
    queuePath: '/queue',
    servesCuisine: 'South Indian',
} as const;

/**
 * Resolve the restaurant name from Location or fallback.
 */
function resolveName(location: Location | null): string {
    return location?.name ?? DEFAULTS.name;
}

/**
 * Resolve the canonical queue page URL from Location.publicUrl.
 * Returns null if no publicUrl is configured.
 */
export function buildCanonicalUrl(location: Location | null): string | null {
    if (location?.publicUrl) {
        return buildLocationPageUrl(location.publicUrl, location._id, 'queue.html');
    }
    return null;
}

/**
 * Build a schema.org Restaurant JSON-LD object with live wait-time data.
 *
 * The returned object can be serialized with `JSON.stringify` and injected
 * into a `<script type="application/ld+json">` block.
 */
export function buildJsonLd(state: QueueStateDTO, location: Location | null = null): Record<string, unknown> {
    const waitDescription = buildWaitDescription(state, location);
    const name = resolveName(location);
    const canonicalUrl = buildCanonicalUrl(location);
    const actionTarget = canonicalUrl ?? `${DEFAULTS.url}${DEFAULTS.queuePath}`;

    return {
        '@context': 'https://schema.org',
        '@type': 'Restaurant',
        name,
        servesCuisine: DEFAULTS.servesCuisine,
        telephone: DEFAULTS.telephone,
        url: canonicalUrl ?? DEFAULTS.url,
        address: {
            '@type': 'PostalAddress',
            streetAddress: DEFAULTS.streetAddress,
            addressLocality: DEFAULTS.addressLocality,
            addressRegion: DEFAULTS.addressRegion,
            postalCode: DEFAULTS.postalCode,
            addressCountry: DEFAULTS.addressCountry,
        },
        makesOffer: {
            '@type': 'Offer',
            description: waitDescription,
        },
        potentialAction: {
            '@type': 'JoinAction',
            target: actionTarget,
            name: 'Join the waitlist',
        },
    };
}

/**
 * Human-readable wait description used in both JSON-LD and meta tags.
 */
function buildWaitDescription(state: QueueStateDTO, location: Location | null = null): string {
    const name = resolveName(location);
    if (state.partiesWaiting === 0) {
        return 'No wait -- walk right in';
    }
    const parties = state.partiesWaiting;
    const partyWord = parties === 1 ? 'party' : 'parties';
    return `Current wait: ~${state.etaForNewPartyMinutes} min (${parties} ${partyWord} ahead)`;
}

/**
 * Build the content for `<meta name="description">`.
 */
export function buildMetaDescription(state: QueueStateDTO, location: Location | null = null): string {
    const name = resolveName(location);
    if (state.partiesWaiting === 0) {
        return `${name}, Bellevue -- No wait right now. Join the line online, no app needed.`;
    }
    const parties = state.partiesWaiting;
    const partyWord = parties === 1 ? 'party' : 'parties';
    return `${name}, Bellevue -- Current wait: ~${state.etaForNewPartyMinutes} min, ${parties} ${partyWord} ahead. Join the line online, no app needed.`;
}

/**
 * Build the content for `<meta property="og:description">`.
 * Matches meta description for consistency.
 */
export function buildOgDescription(state: QueueStateDTO, location: Location | null = null): string {
    return buildMetaDescription(state, location);
}

/**
 * Build the content for `<meta property="og:title">`.
 */
export function buildOgTitle(location: Location | null = null): string {
    const name = resolveName(location);
    return `${name} -- Live Wait Time`;
}

/**
 * Returns the og:type value. Always 'website' for queue pages.
 */
export function buildOgType(): string {
    return 'website';
}
