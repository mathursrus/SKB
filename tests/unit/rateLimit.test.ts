// Unit tests for src/middleware/rateLimit.ts
import { runTests } from '../test-utils.js';
import { rateLimit } from '../../src/middleware/rateLimit.js';
import type { Request, Response } from 'express';

interface T { name: string; description?: string; tags?: string[]; testFn?: () => Promise<boolean>; }

function fakeReq(ip: string): Request {
    return { ip } as unknown as Request;
}

interface FakeRes {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
    status(n: number): FakeRes;
    json(b: unknown): FakeRes;
    setHeader(k: string, v: string): void;
}

function fakeRes(): FakeRes {
    const r: FakeRes = {
        statusCode: 200,
        body: null,
        headers: {},
        status(n) { r.statusCode = n; return r; },
        json(b) { r.body = b; return r; },
        setHeader(k, v) { r.headers[k] = v; },
    };
    return r;
}

const cases: T[] = [
    {
        name: 'allows requests up to max within window',
        tags: ['unit', 'ratelimit'],
        testFn: async () => {
            const mw = rateLimit({ windowMs: 60_000, max: 3 });
            let passes = 0;
            for (let i = 0; i < 3; i++) {
                const res = fakeRes() as unknown as Response;
                mw(fakeReq('1.1.1.1'), res, () => { passes++; });
            }
            return passes === 3;
        },
    },
    {
        name: 'blocks with 429 once max is exceeded',
        tags: ['unit', 'ratelimit'],
        testFn: async () => {
            const mw = rateLimit({ windowMs: 60_000, max: 2 });
            for (let i = 0; i < 2; i++) {
                mw(fakeReq('2.2.2.2'), fakeRes() as unknown as Response, () => {});
            }
            const res = fakeRes();
            let called = false;
            mw(fakeReq('2.2.2.2'), res as unknown as Response, () => { called = true; });
            return !called && res.statusCode === 429 && !!res.headers['Retry-After'];
        },
    },
    {
        name: 'buckets are per-IP',
        tags: ['unit', 'ratelimit'],
        testFn: async () => {
            const mw = rateLimit({ windowMs: 60_000, max: 1 });
            let a = 0, b = 0;
            mw(fakeReq('3.3.3.3'), fakeRes() as unknown as Response, () => { a++; });
            mw(fakeReq('4.4.4.4'), fakeRes() as unknown as Response, () => { b++; });
            // Both IPs get their first request through, even at max=1.
            return a === 1 && b === 1;
        },
    },
    {
        name: 'second hit from same IP at max=1 is blocked',
        tags: ['unit', 'ratelimit'],
        testFn: async () => {
            const mw = rateLimit({ windowMs: 60_000, max: 1 });
            mw(fakeReq('5.5.5.5'), fakeRes() as unknown as Response, () => {});
            const res = fakeRes();
            mw(fakeReq('5.5.5.5'), res as unknown as Response, () => {});
            return res.statusCode === 429;
        },
    },
    {
        name: 'bucket resets after window expires',
        tags: ['unit', 'ratelimit'],
        testFn: async () => {
            const mw = rateLimit({ windowMs: 10, max: 1 }); // 10ms window
            mw(fakeReq('6.6.6.6'), fakeRes() as unknown as Response, () => {});
            await new Promise(r => setTimeout(r, 25));
            let passed = false;
            mw(fakeReq('6.6.6.6'), fakeRes() as unknown as Response, () => { passed = true; });
            return passed;
        },
    },
    {
        name: 'uses custom keyFn when provided',
        tags: ['unit', 'ratelimit'],
        testFn: async () => {
            const mw = rateLimit({
                windowMs: 60_000,
                max: 1,
                keyFn: () => 'fixed-key',
            });
            let a = 0;
            mw(fakeReq('7.7.7.7'), fakeRes() as unknown as Response, () => { a++; });
            const res = fakeRes();
            mw(fakeReq('8.8.8.8'), res as unknown as Response, () => { a++; });
            // Both IPs share the 'fixed-key' bucket, so the second is blocked.
            return a === 1 && res.statusCode === 429;
        },
    },
];

void runTests(cases, 'rateLimit middleware');
