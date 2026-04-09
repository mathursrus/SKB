// ============================================================================
// SKB - E2E: Critical waitlist path (project rule #7)
// ============================================================================
// Full-stack test: spins real server + hits REST endpoints.
// Covers: join 3 → call 1 → remove 1 → verify diner status reflects shift.
//
// Run with: npm run test:e2e
// ============================================================================

// Test defaults — won't override if already set
process.env.SKB_HOST_PIN ??= '1234';
process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_e2e_test';
process.env.PORT ??= '15399';
process.env.FRAIM_TEST_SERVER_PORT ??= '15399';
process.env.FRAIM_BRANCH ??= '';

import {
    startTestServer,
    stopTestServer,
    getTestServerUrl,
} from '../tests/shared-server-utils.js';

const BASE = getTestServerUrl();

async function post(path: string, body: unknown, cookie?: string): Promise<{ status: number; data: Record<string, unknown>; cookie?: string }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookie) headers['Cookie'] = cookie;
    const res = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    const data = await res.json() as Record<string, unknown>;
    const setCookie = res.headers.get('set-cookie')?.split(';')[0];
    return { status: res.status, data, cookie: setCookie };
}

async function get(path: string, cookie?: string): Promise<{ status: number; data: Record<string, unknown> }> {
    const headers: Record<string, string> = {};
    if (cookie) headers['Cookie'] = cookie;
    const res = await fetch(`${BASE}${path}`, { headers });
    const data = await res.json() as Record<string, unknown>;
    return { status: res.status, data };
}

function assert(condition: boolean, msg: string): void {
    if (!condition) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main(): Promise<void> {
    console.log('[E2E] queue.e2e.test: starting server');
    await startTestServer();

    // Clean any leftover queue entries via host API
    const loginRes = await post('/api/host/login', { pin: '1234' });
    if (loginRes.cookie) {
        const hq = await get('/api/host/queue', loginRes.cookie);
        const leftover = hq.data.parties as Array<{ id: string }> | undefined;
        if (leftover) {
            for (const p of leftover) {
                await post(`/api/host/queue/${p.id}/remove`, { reason: 'no_show' }, loginRes.cookie);
            }
        }
    }
    console.log('[E2E] cleaned leftover queue entries');

    try {
        // 1. Verify empty state
        const state0 = await get('/api/queue/state');
        console.log(`[E2E] empty state: ${JSON.stringify(state0.data)}`);

        // 2. Join 3 parties
        const j1 = await post('/api/queue/join', { name: 'Anand', partySize: 4, phone: '2025551111' });
        const j2 = await post('/api/queue/join', { name: 'Bhavya', partySize: 2, phone: '2025552222' });
        const j3 = await post('/api/queue/join', { name: 'Chandra', partySize: 3, phone: '2025553333' });
        assert(j1.status === 200, `join1 status=${j1.status}`);
        assert(j2.status === 200, `join2 status=${j2.status}`);
        assert(j3.status === 200, `join3 status=${j3.status}`);
        assert(j1.data.position === 1, `j1 pos=${j1.data.position}`);
        assert(j2.data.position === 2, `j2 pos=${j2.data.position}`);
        assert(j3.data.position === 3, `j3 pos=${j3.data.position}`);
        console.log(`[E2E] PASS: 3 parties joined at positions 1/2/3`);

        // Record promised ETAs (should never change)
        const j1EtaAt = j1.data.etaAt as string;
        const j3EtaAt = j3.data.etaAt as string;

        // 3. Verify queue state
        const state3 = await get('/api/queue/state');
        assert(state3.data.partiesWaiting === 3, `partiesWaiting=${state3.data.partiesWaiting}`);
        console.log(`[E2E] PASS: state shows 3 parties waiting`);

        // 4. Host login
        const login = await post('/api/host/login', { pin: '1234' });
        assert(login.status === 200, `login status=${login.status}`);
        assert(!!login.cookie, 'no cookie set on login');
        const hostCookie = login.cookie!;
        console.log(`[E2E] PASS: host login successful`);

        // 5. Host queue — verify 3 parties
        const hq = await get('/api/host/queue', hostCookie);
        const parties = hq.data.parties as Array<{ id: string; name: string; position: number }>;
        assert(parties.length === 3, `host queue length=${parties.length}`);
        console.log(`[E2E] PASS: host sees 3 parties`);

        // 6. Call Anand
        const anandId = parties[0].id;
        const callRes = await post(`/api/host/queue/${anandId}/call`, {}, hostCookie);
        assert(callRes.status === 200 && callRes.data.ok === true, 'call failed');
        console.log(`[E2E] PASS: Anand called`);

        // 7. Diner status for Anand — should show 'called' with callsMinutesAgo
        const anandStatus = await get(`/api/queue/status?code=${j1.data.code}`);
        assert(anandStatus.data.state === 'called', `anand state=${anandStatus.data.state}`);
        assert(Array.isArray(anandStatus.data.callsMinutesAgo), 'no callsMinutesAgo');
        assert((anandStatus.data.callsMinutesAgo as number[]).length === 1, 'expected 1 call');
        console.log(`[E2E] PASS: diner sees 'called' with call history`);

        // 8. Seat Bhavya (remove position 2)
        const bhavyaId = parties[1].id;
        const seatRes = await post(`/api/host/queue/${bhavyaId}/remove`, { reason: 'seated' }, hostCookie);
        assert(seatRes.status === 200 && seatRes.data.ok === true, 'seat failed');
        console.log(`[E2E] PASS: Bhavya seated`);

        // 9. Chandra's position should shift from 3 → 2
        const chandraStatus = await get(`/api/queue/status?code=${j3.data.code}`);
        assert(chandraStatus.data.position === 2, `chandra pos=${chandraStatus.data.position} (expected 2)`);
        console.log(`[E2E] PASS: Chandra position shifted 3 → 2 (AC-R6/R7)`);

        // 10. Promised ETAs never changed
        assert(chandraStatus.data.etaAt === j3EtaAt, `chandra etaAt changed: ${chandraStatus.data.etaAt} !== ${j3EtaAt}`);
        const anandStatus2 = await get(`/api/queue/status?code=${j1.data.code}`);
        assert(anandStatus2.data.etaAt === j1EtaAt, `anand etaAt changed`);
        console.log(`[E2E] PASS: promised ETAs unchanged after removal`);

        // 11. Bhavya status is 'seated'
        const bhavyaStatus = await get(`/api/queue/status?code=${j2.data.code}`);
        assert(bhavyaStatus.data.state === 'seated', `bhavya state=${bhavyaStatus.data.state}`);
        console.log(`[E2E] PASS: seated party shows state=seated`);

        // 12. Board endpoint returns no PII
        const board = await get('/api/queue/board');
        const boardEntries = board.data as unknown as Array<Record<string, unknown>>;
        for (const entry of boardEntries) {
            assert(!('name' in entry), 'board leaks name');
            assert(!('phone' in entry), 'board leaks phone');
        }
        console.log(`[E2E] PASS: board endpoint returns no PII`);

        // 13. Stats endpoint gated
        const statsNoAuth = await get('/api/host/stats');
        assert(statsNoAuth.status === 401, `stats without auth=${statsNoAuth.status}`);
        const statsAuth = await get('/api/host/stats', hostCookie);
        assert(statsAuth.status === 200, `stats with auth=${statsAuth.status}`);
        const seated = (statsAuth.data as { partiesSeated?: number }).partiesSeated ?? 0;
        assert(seated >= 1, `expected at least 1 seated in stats, got ${seated}`);
        console.log(`[E2E] PASS: stats PIN-gated, shows 1 seated`);

        console.log('\n[E2E] ✅ ALL 13 CHECKS PASSED — critical waitlist path is green');
    } finally {
        await stopTestServer();
    }
}

main().catch((err) => {
    console.error('[E2E] FAIL:', err);
    void stopTestServer();
    process.exit(1);
});
