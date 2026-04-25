process.env.MONGODB_DB_NAME ??= 'skb_caller_stats_integration_test';
process.env.SKB_COOKIE_SECRET ??= 'caller-stats-cookie-secret';
process.env.SKB_HOST_PIN ??= '1234';
process.env.FRAIM_BRANCH ??= '';
process.env.PORT ??= '15473';
process.env.FRAIM_TEST_SERVER_PORT ??= '15473';

import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    startTestServer,
    stopTestServer,
    getTestServerUrl,
    getTestServerPort,
    isPortInUse,
} from '../shared-server-utils.js';
import { closeDb, getDb, voiceCallSessions } from '../../src/core/db/mongo.js';
import { serviceDay } from '../../src/core/utils/time.js';
import { getCallerStats } from '../../src/services/callerStats.js';
import { ensureLocation } from '../../src/services/locations.js';
import { createOwnerUser } from '../../src/services/users.js';
import type { VoiceCallCurrentStage, VoiceCallFinalOutcome, VoiceCallSession } from '../../src/types/queue.js';

const LOC = 'caller-stats-83';
const OWNER_EMAIL = 'caller-stats-owner@example.test';
const OWNER_PASS = 'caller-stats-owner-password';
let namedSessionCookie = '';

async function assertFreshServerPort(): Promise<void> {
    const port = getTestServerPort();
    if (await isPortInUse(port)) {
        throw new Error(`caller-stats integration requires isolated port ${port}`);
    }
}

async function resetDb(): Promise<void> {
    const db = await getDb();
    await voiceCallSessions(db).deleteMany({});
}

function seedSession(
    callSid: string,
    startedAt: Date,
    patch: Partial<VoiceCallSession>,
): VoiceCallSession {
    return {
        locationId: LOC,
        callSid,
        serviceDay: serviceDay(startedAt),
        startedAt,
        lastEventAt: startedAt,
        currentStage: 'incoming',
        steps: [{ at: startedAt, event: 'incoming' }],
        ...patch,
    };
}

async function ensureAdminSession(): Promise<string> {
    if (namedSessionCookie) return namedSessionCookie;
    try {
        await createOwnerUser({
            email: OWNER_EMAIL,
            password: OWNER_PASS,
            name: 'Caller Stats Owner',
            locationId: LOC,
        });
    } catch {
        // Reusing a prior local DB run is fine; login below proves validity.
    }
    const login = await fetch(`${getTestServerUrl()}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASS, locationId: LOC }),
    });
    namedSessionCookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
    return namedSessionCookie;
}

const cases: BaseTestCase[] = [
    {
        name: 'caller-stats: service aggregates funnel and auto-finalizes stale sessions',
        tags: ['integration', 'caller-stats', 'service'],
        testFn: async () => {
            await resetDb();
            await ensureLocation(LOC, 'Caller Stats', '1234');
            const db = await getDb();
            const coll = voiceCallSessions(db);
            const now = new Date('2026-04-25T18:30:00.000Z');
            const joinedAt = new Date('2026-04-25T18:00:00.000Z');
            const droppedAt = new Date('2026-04-25T17:50:00.000Z');
            const menuAt = new Date('2026-04-25T18:10:00.000Z');
            const oldAt = new Date('2026-04-10T18:00:00.000Z');

            await coll.insertMany([
                seedSession('CA-joined', joinedAt, {
                    lastEventAt: new Date('2026-04-25T18:03:00.000Z'),
                    currentStage: 'joined',
                    firstMenuChoice: 'join_waitlist',
                    joinIntent: true,
                    nameCaptureMode: 'normal',
                    partySize: 2,
                    phoneSource: 'caller_id',
                    queueCode: 'SKB-123',
                    finalOutcome: 'joined_waitlist',
                    endedAt: new Date('2026-04-25T18:04:00.000Z'),
                    callerLast4: '0199',
                    steps: [
                        { at: joinedAt, event: 'incoming' },
                        { at: new Date('2026-04-25T18:00:10.000Z'), event: 'menu_choice', detail: 'join_waitlist' },
                        { at: new Date('2026-04-25T18:00:10.000Z'), event: 'join_intent' },
                        { at: new Date('2026-04-25T18:01:00.000Z'), event: 'name_captured', detail: 'normal' },
                        { at: new Date('2026-04-25T18:02:00.000Z'), event: 'size_captured', detail: '2' },
                        { at: new Date('2026-04-25T18:03:00.000Z'), event: 'phone_source', detail: 'caller_id' },
                        { at: new Date('2026-04-25T18:04:00.000Z'), event: 'joined', detail: 'SKB-123' },
                    ],
                }),
                seedSession('CA-drop-phone', droppedAt, {
                    lastEventAt: new Date('2026-04-25T17:52:00.000Z'),
                    currentStage: 'confirm_phone',
                    firstMenuChoice: 'join_waitlist',
                    joinIntent: true,
                    nameCaptureMode: 'fallback',
                    partySize: 4,
                    callerLast4: '7777',
                    steps: [
                        { at: droppedAt, event: 'incoming' },
                        { at: new Date('2026-04-25T17:50:05.000Z'), event: 'menu_choice', detail: 'join_waitlist' },
                        { at: new Date('2026-04-25T17:50:05.000Z'), event: 'join_intent' },
                        { at: new Date('2026-04-25T17:51:00.000Z'), event: 'name_captured', detail: 'fallback' },
                        { at: new Date('2026-04-25T17:52:00.000Z'), event: 'size_captured', detail: '4' },
                    ],
                }),
                seedSession('CA-menu', menuAt, {
                    lastEventAt: new Date('2026-04-25T18:10:05.000Z'),
                    currentStage: 'resolved',
                    firstMenuChoice: 'menu',
                    finalOutcome: 'menu_only',
                    endedAt: new Date('2026-04-25T18:10:05.000Z'),
                    steps: [
                        { at: menuAt, event: 'incoming' },
                        { at: new Date('2026-04-25T18:10:03.000Z'), event: 'menu_choice', detail: 'menu' },
                        { at: new Date('2026-04-25T18:10:05.000Z'), event: 'resolved_info', detail: 'menu_only' },
                    ],
                }),
                seedSession('CA-old', oldAt, {
                    lastEventAt: new Date('2026-04-10T18:01:00.000Z'),
                    currentStage: 'incoming',
                    firstMenuChoice: 'repeat_wait',
                    finalOutcome: 'dropped_before_choice',
                    endedAt: new Date('2026-04-10T18:03:00.000Z'),
                    steps: [
                        { at: oldAt, event: 'incoming' },
                        { at: new Date('2026-04-10T18:01:00.000Z'), event: 'menu_choice', detail: 'repeat_wait' },
                    ],
                }),
            ]);

            const stats = await getCallerStats(LOC, '30', now);
            const droppedPhone = stats.outcomes.find((row) => row.key === 'dropped_during_phone_confirmation');
            const menuOnly = stats.outcomes.find((row) => row.key === 'menu_only');
            const joined = stats.outcomes.find((row) => row.key === 'joined_waitlist');
            const menuChoice = stats.firstMenuChoices.find((row) => row.key === 'menu');
            const repeatChoice = stats.firstMenuChoices.find((row) => row.key === 'repeat_wait');
            const finalized = await coll.findOne({ callSid: 'CA-drop-phone' });

            return stats.funnel.inboundCalls === 4
                && stats.funnel.joinIntent === 2
                && stats.funnel.reachedPhoneConfirmation === 2
                && stats.funnel.joinedWaitlist === 1
                && droppedPhone?.count === 1
                && menuOnly?.count === 1
                && joined?.count === 1
                && menuChoice?.count === 1
                && repeatChoice?.count === 1
                && stats.historicalCoverage.hasLegacyGap === true
                && finalized?.finalOutcome === 'dropped_during_phone_confirmation';
        },
    },
    {
        name: 'caller-stats: endpoint is admin-only and returns privacy-minimized rows',
        tags: ['integration', 'caller-stats', 'route', 'auth'],
        testFn: async () => {
            await resetDb();
            await assertFreshServerPort();
            await ensureLocation(LOC, 'Caller Stats', '1234');
            const db = await getDb();
            await voiceCallSessions(db).insertOne(seedSession('CA-endpoint', new Date(), {
                currentStage: 'joined',
                firstMenuChoice: 'join_waitlist',
                joinIntent: true,
                nameCaptureMode: 'normal',
                partySize: 2,
                phoneSource: 'manual',
                queueCode: 'SKB-321',
                finalOutcome: 'joined_waitlist',
                endedAt: new Date(),
                callerLast4: '4321',
                steps: [{ at: new Date(), event: 'incoming' }],
            }));

            await startTestServer();
            const anonymous = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/caller-stats?range=1`);
            const cookie = await ensureAdminSession();
            const authed = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/caller-stats?range=1`, {
                headers: { Cookie: cookie },
            });
            const body = await authed.json() as {
                recentSessions?: Array<Record<string, unknown>>;
                funnel?: { inboundCalls?: number };
            };
            const recent = body.recentSessions?.[0] ?? {};

            await stopTestServer();

            return anonymous.status === 401
                && authed.ok
                && body.funnel?.inboundCalls === 1
                && recent.callerLast4 === '4321'
                && !('phone' in recent)
                && !('fullPhone' in recent);
        },
    },
    {
        name: 'caller-stats: teardown',
        tags: ['integration', 'caller-stats', 'teardown'],
        testFn: async () => {
            await stopTestServer();
            await resetDb();
            await closeDb();
            return true;
        },
    },
];

void runTests(cases, 'caller stats (integration)');
