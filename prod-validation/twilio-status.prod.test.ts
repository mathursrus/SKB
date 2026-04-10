// ============================================================================
// Prod validation: Twilio messaging approval status
// ============================================================================
// Checks the current approval state of the two parallel SMS approval paths
// running right now:
//
//   1. Toll-Free Verification (TFV) for +1 (844) 917-2762
//   2. A2P 10DLC campaign for +1 (425) 428-4231
//
// This is NOT a pass/fail gate in the traditional sense — it's a monitoring
// probe that reports the current state. It passes as long as the API is
// reachable and at least one approval path exists; the details are printed
// so a human can see whether anything has moved.
//
// Also pulls the last 5 outbound SMS messages and flags any with
// non-transient failure codes (30034, 30032, 21608, etc.) so we can see at a
// glance whether SMS has started delivering.
//
// Requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars. Skips cleanly
// if not set.
// ============================================================================

import { runTests, type BaseTestCase } from './prod-test-utils.js';
import { request as httpsRequest } from 'node:https';

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;

function twilioGet<T = unknown>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
        if (!SID || !TOKEN) return reject(new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN env vars not set'));
        const req = httpsRequest(
            {
                hostname: path.startsWith('/v1/') || path.startsWith('/v2/')
                    ? 'messaging.twilio.com'
                    : 'api.twilio.com',
                path,
                method: 'GET',
                auth: `${SID}:${TOKEN}`,
                timeout: 10000,
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T);
                    } catch (e) {
                        reject(e);
                    }
                });
            },
        );
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('Twilio API timeout')));
        req.end();
    });
}

interface TollFreeVerification {
    sid: string;
    status: string;
    business_name: string;
    phone_number?: string;
    date_created: string;
    rejection_reason?: string;
}
interface TollFreeVerificationsList {
    verifications: TollFreeVerification[];
}
interface Usa2pCompliance {
    compliance?: Array<{
        sid: string;
        campaign_status: string;
        us_app_to_person_usecase: string;
    }>;
}
interface Message {
    sid: string;
    from: string;
    to: string;
    status: string;
    error_code: number | null;
    error_message: string | null;
    date_created: string;
}
interface MessagesList {
    messages: Message[];
}

const skipIfNoCreds = !SID || !TOKEN;

const cases: BaseTestCase[] = [
    {
        name: 'twilio credentials are available (skip all if not)',
        tags: ['prod', 'twilio-status', 'prereq'],
        testFn: async () => {
            if (skipIfNoCreds) {
                console.log('  SKIPPED: set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to enable these checks');
                return true;
            }
            return true;
        },
    },
    {
        name: 'Twilio API is reachable',
        tags: ['prod', 'twilio-status'],
        testFn: async () => {
            if (skipIfNoCreds) return true;
            const account = await twilioGet<{ status: string }>(`/2010-04-01/Accounts/${SID}.json`);
            return account.status === 'active';
        },
    },
    {
        name: 'Twilio account type is Full (not Trial)',
        tags: ['prod', 'twilio-status'],
        testFn: async () => {
            if (skipIfNoCreds) return true;
            const account = await twilioGet<{ type: string }>(`/2010-04-01/Accounts/${SID}.json`);
            // PRINT, not assert — some accounts remain Trial and that's not a failure per se
            console.log(`  Account type: ${account.type}`);
            return account.type === 'Full';
        },
    },
    {
        name: 'Toll-Free Verification status (844)',
        tags: ['prod', 'twilio-status', 'tfv'],
        testFn: async () => {
            if (skipIfNoCreds) return true;
            const resp = await twilioGet<TollFreeVerificationsList>('/v1/Tollfree/Verifications');
            const verifs = resp.verifications || [];
            if (verifs.length === 0) {
                console.log('  No TFV submitted for this account');
                return false;
            }
            for (const v of verifs) {
                console.log(`  TFV ${v.sid.substring(0, 10)}… | status=${v.status} | business=${v.business_name} | submitted=${v.date_created}`);
                if (v.rejection_reason) console.log(`    rejection: ${v.rejection_reason}`);
            }
            // Pass as long as at least one TFV exists and isn't in a terminal failed state
            const terminal = verifs.every((v) => ['REJECTED', 'FAILED'].includes(v.status));
            return !terminal;
        },
    },
    {
        name: 'A2P 10DLC campaign status (425)',
        tags: ['prod', 'twilio-status', '10dlc'],
        testFn: async () => {
            if (skipIfNoCreds) return true;
            // Enumerate messaging services and check their A2P compliance
            const svcs = await twilioGet<{ services: Array<{ sid: string; friendly_name: string }> }>(
                '/v1/Services',
            );
            if (!svcs.services || svcs.services.length === 0) {
                console.log('  No Messaging Services on this account');
                return false;
            }
            let found = false;
            for (const svc of svcs.services) {
                try {
                    const comp = await twilioGet<Usa2pCompliance>(`/v1/Services/${svc.sid}/Compliance/Usa2p`);
                    const items = comp.compliance || [];
                    for (const c of items) {
                        found = true;
                        console.log(`  Campaign ${c.sid.substring(0, 10)}… (svc ${svc.sid.substring(0, 8)}…) | status=${c.campaign_status} | use_case=${c.us_app_to_person_usecase}`);
                    }
                } catch {
                    // svc may not have compliance; ignore
                }
            }
            if (!found) {
                console.log('  No 10DLC campaigns found');
                return false;
            }
            return true;
        },
    },
    {
        name: 'recent outbound SMS delivery health',
        tags: ['prod', 'twilio-status', 'delivery'],
        testFn: async () => {
            if (skipIfNoCreds) return true;
            const resp = await twilioGet<MessagesList>(
                `/2010-04-01/Accounts/${SID}/Messages.json?PageSize=10`,
            );
            const msgs = (resp.messages || []).filter((m) => m.from && m.from.startsWith('+1'));
            if (msgs.length === 0) {
                console.log('  No outbound messages in recent history');
                return true;
            }
            let undeliverable = 0;
            let delivered = 0;
            let queuedOrSent = 0;
            for (const m of msgs) {
                const short = m.from + ' → ' + (m.to || '').substring(0, 8) + '… | ' + m.status;
                const err = m.error_code ? ` err=${m.error_code}` : '';
                console.log(`  ${m.date_created} | ${short}${err}`);
                if (m.status === 'delivered' || m.status === 'sent') delivered++;
                else if (m.status === 'queued' || m.status === 'sending' || m.status === 'accepted') queuedOrSent++;
                else if (m.status === 'undelivered' || m.status === 'failed') undeliverable++;
            }
            console.log(`  summary: delivered=${delivered} queued=${queuedOrSent} undeliverable=${undeliverable}`);
            // This is a monitoring check — don't fail the suite on historical undelivereds.
            // It passes as long as the API answered.
            return true;
        },
    },
];

void runTests(cases, 'Twilio messaging approval status (monitoring)');
