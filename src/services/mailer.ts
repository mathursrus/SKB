// ============================================================================
// SKB - Email-sending service (issue #93 Bug 2)
// ============================================================================
//
// Before this issue, the staff-invite handler and the welcome-email service
// were `console.log` stubs — owners could send invites but the recipient
// never received an email. This module replaces those stubs with a real
// send via Azure Communication Services Email, with a graceful log-only
// fallback when ACS is not configured.
//
// Configuration: two env vars are required for the ACS path.
//   ACS_EMAIL_CONNECTION_STRING — from the ACS resource in Azure
//                                 (Settings → Keys → Connection string)
//   ACS_EMAIL_SENDER            — verified MailFrom domain address,
//                                 e.g. "DoNotReply@your-domain.com"
//
// If either is missing, `sendEmail` returns mode='log-only' without calling
// the SDK. This keeps local development simple (no Azure setup needed)
// and makes the prod cutover a config change, not a code change.
//
// Per the user's preferences (Azure-credit leveraging, simplicity-first),
// ACS Email matches the existing infra with no new vendor relationship.
// ============================================================================

export interface EmailInput {
    to: string;
    subject: string;
    /** Plain-text body. HTML emails are deferred to a future iteration. */
    text: string;
}

export interface EmailResult {
    delivered: boolean;
    mode: 'log-only' | 'acs';
    /** Diagnostic detail for logs and tests. */
    reason: string;
}

let acsClientCache: { client: unknown } | null = null;

async function getAcsClient(connectionString: string): Promise<unknown | null> {
    if (acsClientCache) return acsClientCache.client;
    try {
        // Dynamic import so the SDK is only loaded when ACS is configured.
        // The dep is intentionally NOT in package.json so install stays small
        // for local dev without ACS — the operator runs
        //   npm install @azure/communication-email
        // when provisioning ACS, then sets ACS_EMAIL_CONNECTION_STRING +
        // ACS_EMAIL_SENDER and the next deploy picks it up. Until then, the
        // catch below logs a warn and we return mode='log-only'.
        // The literal package name is split so TypeScript doesn't try to
        // resolve a missing module at compile time.
        const moduleName = '@azure/' + 'communication-email';
        const mod = (await import(/* @vite-ignore */ moduleName)) as unknown as {
            EmailClient: new (conn: string) => unknown;
        };
        const client = new mod.EmailClient(connectionString);
        acsClientCache = { client };
        return client;
    } catch (err) {
        emitMailerLog({
            level: 'warn',
            msg: 'email.acs_load_failed',
            detail: err instanceof Error ? err.message : String(err),
        });
        acsClientCache = { client: null }; // cache the failure so we don't retry every send
        return null;
    }
}

export async function sendEmail(input: EmailInput): Promise<EmailResult> {
    const conn = process.env.ACS_EMAIL_CONNECTION_STRING;
    const sender = process.env.ACS_EMAIL_SENDER;

    // Always emit an audit-trail log line — even in log-only mode, dev and
    // ops can grep this to recover the magic link or confirm the call site.
    const baseLogFields = {
        to: input.to,
        subject: input.subject,
    };

    if (!conn || !sender) {
        emitMailerLog({
            level: 'info',
            msg: 'email.send',
            mode: 'log-only',
            reason: !conn ? 'missing_connection_string' : 'missing_sender',
            ...baseLogFields,
            text: input.text, // include body in log-only mode so dev can recover it
        });
        return { delivered: false, mode: 'log-only', reason: !conn ? 'missing_connection_string' : 'missing_sender' };
    }

    const client = await getAcsClient(conn) as {
        beginSend?: (msg: unknown) => Promise<{ pollUntilDone: () => Promise<{ status?: string; id?: string }> }>;
    } | null;

    if (!client || typeof client.beginSend !== 'function') {
        emitMailerLog({
            level: 'warn',
            msg: 'email.send',
            mode: 'log-only',
            reason: 'acs_client_unavailable',
            ...baseLogFields,
            text: input.text,
        });
        return { delivered: false, mode: 'log-only', reason: 'acs_client_unavailable' };
    }

    try {
        const poller = await client.beginSend({
            senderAddress: sender,
            content: { subject: input.subject, plainText: input.text },
            recipients: { to: [{ address: input.to }] },
        });
        const result = await poller.pollUntilDone();
        const status = result.status ?? 'unknown';
        const delivered = status === 'Succeeded';
        emitMailerLog({
            level: delivered ? 'info' : 'warn',
            msg: 'email.send',
            mode: 'acs',
            reason: status,
            messageId: result.id,
            ...baseLogFields,
        });
        return { delivered, mode: 'acs', reason: status };
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        emitMailerLog({
            level: 'error',
            msg: 'email.send',
            mode: 'acs',
            reason: 'acs_send_threw',
            detail,
            ...baseLogFields,
        });
        return { delivered: false, mode: 'acs', reason: detail };
    }
}

function emitMailerLog(fields: Record<string, unknown>): void {
    // eslint-disable-next-line no-console -- structured log is the audit trail
    console.log(JSON.stringify({ t: new Date().toISOString(), ...fields }));
}

/** Test-only: clear the cached ACS client so env changes between tests are honored. */
export function __resetAcsCacheForTests(): void {
    acsClientCache = null;
}
