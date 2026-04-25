import { buildLocationPageUrl } from '../core/utils/url.js';

export interface VisitQrUrlInput {
    locationId: string;
    requestProto?: string | null;
    requestHost?: string | null;
    locationPublicUrl?: string | null;
    locationPublicHost?: string | null;
}

function clean(value: string | null | undefined): string {
    return String(value ?? '').trim();
}

export function resolveVisitQrBaseUrl(input: VisitQrUrlInput): string {
    const publicUrl = clean(input.locationPublicUrl);
    if (publicUrl) {
        return publicUrl;
    }

    const publicHost = clean(input.locationPublicHost);
    if (publicHost) {
        return `https://${publicHost}`;
    }

    const proto = clean(input.requestProto) || 'https';
    const requestHost = clean(input.requestHost);
    return requestHost ? `${proto}://${requestHost}` : '';
}

export function buildVisitQrUrl(input: VisitQrUrlInput): string {
    return buildLocationPageUrl(resolveVisitQrBaseUrl(input), input.locationId, 'visit');
}
