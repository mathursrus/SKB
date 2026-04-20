import { buildQueueStatusUrl } from '../core/utils/url.js';

export interface QueueStatusUrlInput {
    locationId: string;
    code: string;
    requestProto?: string | null;
    requestHost?: string | null;
    locationPublicUrl?: string | null;
    appPublicBaseUrl?: string | null;
}

function clean(value: string | null | undefined): string {
    return String(value ?? '').trim();
}

export function resolveQueueStatusBaseUrl(input: QueueStatusUrlInput): string {
    const locationPublicUrl = clean(input.locationPublicUrl);
    if (locationPublicUrl) {
        return locationPublicUrl;
    }

    const appPublicBaseUrl = clean(input.appPublicBaseUrl);
    if (appPublicBaseUrl) {
        return appPublicBaseUrl;
    }

    const proto = clean(input.requestProto) || 'https';
    const requestHost = clean(input.requestHost);
    return requestHost ? `${proto}://${requestHost}` : '';
}

export function buildQueueStatusUrlForSms(input: QueueStatusUrlInput): string {
    return buildQueueStatusUrl(resolveQueueStatusBaseUrl(input), input.locationId, input.code);
}
