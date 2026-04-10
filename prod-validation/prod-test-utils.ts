// ============================================================================
// SKB - Production Validation Test Utilities
// ============================================================================
// Shared helpers for prod-validation tests. These tests run against a LIVE
// production (or staging) deployment, not a local server or mocked services.
//
// Configuration:
//   PROD_BASE_URL  — base URL to test against (default: https://skb-waitlist.azurewebsites.net)
//
// Guardrails:
//   - Tests must be idempotent and non-destructive (no joins, no mutations)
//   - Tests must be fast (< 10s total) and safe to run on every deploy
//   - Tests must not incur external costs (no real SMS/voice calls)
// ============================================================================

import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';

export { runTests, type BaseTestCase } from '../tests/test-utils.js';

/**
 * Base URL for the target environment.
 * Override with PROD_BASE_URL env var to test staging or a different deployment.
 */
export const BASE_URL = process.env.PROD_BASE_URL || 'https://skb-waitlist.azurewebsites.net';

export interface HttpResponse {
    status: number;
    headers: Record<string, string>;
    body: string;
}

/** Minimal HTTP client — no extra dependencies. */
export async function httpGet(path: string, extraHeaders: Record<string, string> = {}): Promise<HttpResponse> {
    return doRequest('GET', path, undefined, extraHeaders);
}

export async function httpPost(path: string, body: string | Record<string, string>, extraHeaders: Record<string, string> = {}): Promise<HttpResponse> {
    const bodyStr = typeof body === 'string'
        ? body
        : Object.entries(body).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    return doRequest('POST', path, bodyStr, {
        'content-type': 'application/x-www-form-urlencoded',
        ...extraHeaders,
    });
}

function doRequest(method: string, path: string, body: string | undefined, headers: Record<string, string>): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
        const url = new URL(path.startsWith('http') ? path : `${BASE_URL}${path}`);
        const isHttps = url.protocol === 'https:';
        const lib = isHttps ? httpsRequest : httpRequest;

        const req = lib({
            method,
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            headers: {
                ...headers,
                ...(body ? { 'content-length': String(Buffer.byteLength(body)) } : {}),
            },
            timeout: 15000,
        }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const responseHeaders: Record<string, string> = {};
                for (const [k, v] of Object.entries(res.headers)) {
                    responseHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v ?? '');
                }
                resolve({
                    status: res.statusCode ?? 0,
                    headers: responseHeaders,
                    body: Buffer.concat(chunks).toString('utf-8'),
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy(new Error(`Request to ${url.toString()} timed out after 15s`));
        });

        if (body) req.write(body);
        req.end();
    });
}
