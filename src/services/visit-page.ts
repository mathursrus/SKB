// ============================================================================
// SKB - Visit-page routing (the dynamic-QR-without-a-vendor handler)
// ============================================================================
//
// `GET /r/:loc/visit` is the *one* stable URL that gets printed on the door
// QR. At request time it inspects the Location's visit config and decides
// whether to render the queue, redirect to the menu, or show a "we're
// closed" page. The diner never sees this URL — they just get redirected
// to the right destination — so the printed sticker can live forever even
// as the restaurant changes its menu, hours, or rebrands.
//
// This is the in-house equivalent of paying a third-party "dynamic QR"
// vendor $30/month for a redirect service. The value the vendor sells is
// a single mutable destination behind a stable URL — which is exactly
// what this handler is.
// ============================================================================

import { getLocation } from './locations.js';
import { getQueueState } from './queue.js';
import type { Location } from '../types/queue.js';

export interface VisitDecision {
    /** 'render' = serve `html` body inline. 'redirect' = 302 to `url`. */
    kind: 'render' | 'redirect';
    html?: string;
    url?: string;
}

/**
 * Pure decision function — given the current Location config + the live
 * queue state, returns what `/visit` should do. Kept dependency-free so
 * it can be unit-tested without Mongo.
 */
export function decideVisit(
    locationId: string,
    location: Location | null,
    partiesWaiting: number,
): VisitDecision {
    const mode = location?.visitMode ?? 'auto';
    const restaurantName = location?.name ?? 'SKB';

    if (mode === 'closed') {
        const message = location?.closedMessage || "We're closed right now. See you next service!";
        return { kind: 'render', html: renderClosedPage(restaurantName, message) };
    }
    if (mode === 'menu') {
        if (location?.menuUrl) {
            return { kind: 'redirect', url: location.menuUrl };
        }
        return { kind: 'render', html: renderClosedPage(restaurantName, 'Menu coming soon.') };
    }
    if (mode === 'queue') {
        return { kind: 'redirect', url: `/r/${locationId}/queue.html` };
    }
    // mode === 'auto' (or undefined): queue if anyone is waiting, else menu
    // (if configured), else queue.
    if (partiesWaiting > 0) {
        return { kind: 'redirect', url: `/r/${locationId}/queue.html` };
    }
    if (location?.menuUrl) {
        return { kind: 'redirect', url: location.menuUrl };
    }
    return { kind: 'redirect', url: `/r/${locationId}/queue.html` };
}

/**
 * I/O wrapper around `decideVisit` — fetches the Location and queue state
 * from Mongo and returns the same VisitDecision shape.
 */
export async function resolveVisit(locationId: string): Promise<VisitDecision> {
    const [location, state] = await Promise.all([
        getLocation(locationId),
        getQueueState(locationId),
    ]);
    return decideVisit(locationId, location, state.partiesWaiting);
}

function escHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] as string));
}

/** Standalone HTML for the 'closed' state — keeps the page self-contained
 * (no JS needed) so it works even if the diner is on a flaky network. */
export function renderClosedPage(restaurantName: string, message: string): string {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escHtml(restaurantName)} — Closed</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
body{margin:0;font-family:'Fira Sans',sans-serif;background:#000;color:#fff;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;text-align:center}
.mark{display:inline-block;border:3px solid #e3bf3d;color:#e3bf3d;font-weight:700;font-size:32px;letter-spacing:4px;padding:16px 24px;margin-bottom:24px;border-radius:6px}
h1{font-size:24px;margin:0 0 12px;font-weight:600}
p{max-width:480px;font-size:16px;line-height:1.5;color:#ccc;margin:0}
.brand{margin-top:40px;color:#888;font-size:12px;letter-spacing:2px;text-transform:uppercase}
</style>
</head><body>
<div class="mark">SKB</div>
<h1>${escHtml(restaurantName)}</h1>
<p>${escHtml(message)}</p>
<div class="brand">No app needed · No account · Your data stays with SKB</div>
</body></html>`;
}
