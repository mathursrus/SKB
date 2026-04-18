// ============================================================================
// SKB - URL utilities
// ============================================================================

export function trimTrailingSlashes(value: string): string {
    return value.replace(/\/+$/, '');
}

export function buildLocationPageUrl(baseUrl: string, locationId: string, page: string): string {
    return `${trimTrailingSlashes(baseUrl)}/r/${encodeURIComponent(locationId)}/${page}`;
}

export function buildQueueStatusUrl(baseUrl: string, locationId: string, code: string): string {
    return `${buildLocationPageUrl(baseUrl, locationId, 'queue.html')}?code=${encodeURIComponent(code)}`;
}
