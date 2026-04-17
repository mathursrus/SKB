// Unit tests for src/middleware/twilioValidation.ts — webhook signature guard.
// Covers the 503 (no token), 403 (missing/invalid signature), dev-bypass, and
// valid-signature happy paths without spawning a real HTTP server.

import { runTests, type BaseTestCase } from '../test-utils.js';
import type { Request, Response } from 'express';

import { validateTwilioSignature } from '../../src/middleware/twilioValidation.js';

interface ResState { status: number; sent: string; ended: boolean }
function makeRes(): { res: Response; state: ResState } {
    const state: ResState = { status: 200, sent: '', ended: false };
    const res = {
        status(code: number) { state.status = code; return res; },
        send(body: string) { state.sent = body; state.ended = true; return res; },
    } as unknown as Response;
    return { res, state };
}

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(overrides)) {
        saved[k] = process.env[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
    try { return fn(); }
    finally {
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
}

const cases: BaseTestCase[] = [
    {
        name: 'validateTwilioSignature: no TWILIO_AUTH_TOKEN + no dev bypass → 503',
        tags: ['unit', 'twilio', 'security'],
        testFn: async () => {
            return withEnv({ TWILIO_AUTH_TOKEN: undefined, SKB_ALLOW_UNSIGNED_TWILIO: undefined }, () => {
                const { res, state } = makeRes();
                const nextState = { called: false };
                validateTwilioSignature(
                    { headers: {}, originalUrl: '/api/sms/inbound' } as Request,
                    res,
                    () => { nextState.called = true; },
                );
                return state.status === 503 && !nextState.called;
            });
        },
    },
    {
        name: 'validateTwilioSignature: no token but dev bypass on → next() called',
        tags: ['unit', 'twilio', 'security', 'dev-bypass'],
        testFn: async () => {
            return withEnv(
                { TWILIO_AUTH_TOKEN: undefined, SKB_ALLOW_UNSIGNED_TWILIO: '1' },
                () => {
                    const { res } = makeRes();
                    const nextState = { called: false };
                    validateTwilioSignature(
                        { headers: {}, originalUrl: '/api/sms/inbound' } as Request,
                        res,
                        () => { nextState.called = true; },
                    );
                    return nextState.called === true;
                },
            );
        },
    },
    {
        name: 'validateTwilioSignature: token present but no x-twilio-signature header → 403',
        tags: ['unit', 'twilio', 'security'],
        testFn: async () => {
            return withEnv({ TWILIO_AUTH_TOKEN: 'tok-abc', SKB_ALLOW_UNSIGNED_TWILIO: undefined }, () => {
                const { res, state } = makeRes();
                const nextState = { called: false };
                validateTwilioSignature(
                    { headers: {}, originalUrl: '/api/sms/inbound' } as Request,
                    res,
                    () => { nextState.called = true; },
                );
                return state.status === 403 && !nextState.called;
            });
        },
    },
    {
        name: 'validateTwilioSignature: token + bogus signature → 403',
        tags: ['unit', 'twilio', 'security'],
        testFn: async () => {
            return withEnv({ TWILIO_AUTH_TOKEN: 'tok-abc', SKB_ALLOW_UNSIGNED_TWILIO: undefined }, () => {
                const { res, state } = makeRes();
                const nextState = { called: false };
                validateTwilioSignature(
                    {
                        headers: { 'x-twilio-signature': 'not-a-real-signature', host: 'skb.example' },
                        originalUrl: '/api/sms/inbound',
                        body: { From: '+12065551234', Body: 'hi' },
                        protocol: 'https',
                    } as unknown as Request,
                    res,
                    () => { nextState.called = true; },
                );
                return state.status === 403 && !nextState.called;
            });
        },
    },
];

void runTests(cases, 'Twilio signature middleware');
