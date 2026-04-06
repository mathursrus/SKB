// ============================================================================
// SKB - JSON-LD and meta tag generation for Google structured data (Issue #8)
// ============================================================================
//
// Generates a Restaurant JSON-LD block and meta tag content from live queue
// state so Google Search / Maps can surface wait-time information.
// ============================================================================

import type { QueueStateDTO } from '../types/queue.js';

/** SKB restaurant details -- hardcoded for v1. */
const RESTAURANT = {
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
 * Build a schema.org Restaurant JSON-LD object with live wait-time data.
 *
 * The returned object can be serialized with `JSON.stringify` and injected
 * into a `<script type="application/ld+json">` block.
 */
export function buildJsonLd(state: QueueStateDTO): Record<string, unknown> {
    const waitDescription = buildWaitDescription(state);

    return {
        '@context': 'https://schema.org',
        '@type': 'Restaurant',
        name: RESTAURANT.name,
        servesCuisine: RESTAURANT.servesCuisine,
        telephone: RESTAURANT.telephone,
        url: RESTAURANT.url,
        address: {
            '@type': 'PostalAddress',
            streetAddress: RESTAURANT.streetAddress,
            addressLocality: RESTAURANT.addressLocality,
            addressRegion: RESTAURANT.addressRegion,
            postalCode: RESTAURANT.postalCode,
            addressCountry: RESTAURANT.addressCountry,
        },
        makesOffer: {
            '@type': 'Offer',
            description: waitDescription,
        },
        potentialAction: {
            '@type': 'JoinAction',
            target: `${RESTAURANT.url}${RESTAURANT.queuePath}`,
            name: 'Join the waitlist',
        },
    };
}

/**
 * Human-readable wait description used in both JSON-LD and meta tags.
 */
function buildWaitDescription(state: QueueStateDTO): string {
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
export function buildMetaDescription(state: QueueStateDTO): string {
    if (state.partiesWaiting === 0) {
        return 'Shri Krishna Bhavan, Bellevue -- No wait right now. Join the line online, no app needed.';
    }
    const parties = state.partiesWaiting;
    const partyWord = parties === 1 ? 'party' : 'parties';
    return `Shri Krishna Bhavan, Bellevue -- Current wait: ~${state.etaForNewPartyMinutes} min, ${parties} ${partyWord} ahead. Join the line online, no app needed.`;
}

/**
 * Build the content for `<meta property="og:description">`.
 * Matches meta description for consistency.
 */
export function buildOgDescription(state: QueueStateDTO): string {
    return buildMetaDescription(state);
}

/**
 * Build the content for `<meta property="og:title">`.
 */
export function buildOgTitle(): string {
    return 'Shri Krishna Bhavan -- Live Wait Time';
}
