// ============================================================================
// SKB - Host-stand routes (PIN-gated) — multi-tenant
// ============================================================================

import { Router, type Request, type Response } from 'express';

import { callParty, joinQueue, listHostQueue, removeFromQueue, logCallDial, setPartyEta, setPartySentimentOverride } from '../services/queue.js';
import { sendChatMessage, getChatThread, markThreadRead } from '../services/chat.js';
import {
    chatAlmostReadyMessage,
    chatNeedMoreTimeMessage,
    chatLostYouMessage,
    joinConfirmationMessage,
} from '../services/smsTemplates.js';
import { sendSms } from '../services/sms.js';
import { buildQueueStatusUrlForSms } from '../services/queueStatusUrl.js';
import { buildVisitQrUrl } from '../services/visitQrUrl.js';
import {
    advanceParty,
    listCompletedParties,
    listDiningParties,
    getPartyTimeline,
} from '../services/dining.js';
import { getAvgTurnTime, getEffectiveTurnTime, setAvgTurnTime, setEtaMode } from '../services/settings.js';
import type { EtaMode } from '../types/queue.js';
import type { HostSentiment } from '../types/hostSentiment.js';
import { getHostStats } from '../services/stats.js';
import { getAnalytics } from '../services/analytics.js';
import { getCallerStats } from '../services/callerStats.js';
import { emitDbError } from '../services/dbError.js';
import { sendEmail, type EmailResult } from '../services/mailer.js';
import {
    getLocation,
    getGuestFeatures,
    updateLocationVisitConfig,
    updateLocationVoiceConfig,
    updateLocationGuestFeatures,
    updateLocationSiteConfig,
    updateLocationWebsiteConfig,
    updateLocationMenu,
    updateLocationMessagingConfig,
    toPublicLocation,
    DEFAULT_WEBSITE_TEMPLATE,
    type WebsiteConfigUpdate,
} from '../services/locations.js';
import { processKnownForImages, processMenuImages } from '../services/siteAssets.js';
import { getHostPartyOrder } from '../services/orders.js';
import { pushToGbpBackground } from '../services/googleBusiness.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDirForAssets = path.resolve(__dirname, '..', '..', 'public');
import type { AnalyticsStage, LocationAddress, WeeklyHours, LocationContent, WebsiteTemplateKey, LocationMenu } from '../types/queue.js';
import {
    requireRole,
    requireNamedRole,
    mintLocationCookie,
    HOST_COOKIE_NAME,
    HOST_COOKIE_MAX_AGE_SECONDS,
} from '../middleware/hostAuth.js';
import {
    createInvite,
    listPendingInvites,
    revokeInvite,
    revokeMembership,
    listStaffAtLocation,
    isInvitableRole,
} from '../services/invites.js';
import { ObjectId } from 'mongodb';
import {
    getDb,
    memberships as membershipsColl,
    locations as locationsColl,
    users as usersColl,
    queueEntries as queueEntriesColl,
    queueMessages as queueMessagesColl,
    partyOrders as partyOrdersColl,
    voiceCallSessions as voiceCallSessionsColl,
    settings as settingsColl,
    googleTokens as googleTokensColl,
    invites as invitesColl,
} from '../core/db/mongo.js';
import { timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import {
    checkAllowed as checkPinAllowed,
    recordFailure as recordPinFailure,
    recordSuccess as recordPinSuccess,
} from '../middleware/pinLockout.js';

function loc(req: Request): string {
    return String(req.params.loc ?? 'skb');
}

function cookieSecret(): string | null {
    return process.env.SKB_COOKIE_SECRET ?? null;
}

// Alias so the host-only routes read as `requireHost(...)` at each
// route-registration site while the underlying middleware enforces
// tenant binding. Issue #52 introduced tenant-binding; issue #53
// widens the accepted role set to include `admin` and `owner` so
// named staff with elevated roles can use the host tablet surface
// (owners and admins routinely work the floor at small restaurants).
//
// The PIN-anonymous skb_host cookie always reads as role='host'; the
// named skb_session cookie carries whichever role the user has at
// this location. All three roles pass this gate.
const requireHost = requireRole('host', 'admin', 'owner');

// Admin-only (issue #55): settings + config endpoints require a named
// session with an owner/admin role. The PIN-anonymous skb_host cookie
// maps to role='host' and does NOT unlock these.
const requireAdmin = requireRole('admin', 'owner');

// Owner-only (issue #55): staff management — only the restaurant
// owner can invite or revoke teammates, per spec §6.3.
const requireOwner = requireRole('owner');

// PIN attempts require a named, tenant-scoped user session first. This keeps
// the short shared PIN from being an unauthenticated online guessing surface.
const requireNamedHostUser = requireNamedRole('host', 'admin', 'owner');
const HOST_PIN_LOCKOUT_SCOPE = 'host-login';

export function hostRouter(): Router {
    const r = Router({ mergeParams: true });

    // Login — uses per-location PIN from locations collection, falls back to env var.
    r.post('/host/login', requireNamedHostUser, async (req: Request, res: Response) => {
        const key = cookieSecret();
        if (!key) { res.status(503).json({ error: 'host auth not configured' }); return; }

        const locationId = loc(req);
        const allow = checkPinAllowed(HOST_PIN_LOCKOUT_SCOPE, locationId, req.ip);
        if (!allow.allowed) {
            res.setHeader('Retry-After', String(allow.retryAfterSeconds ?? 900));
            res.status(429).json({ error: 'too many attempts' });
            return;
        }

        const location = await getLocation(locationId);
        const expectedPin = location?.pin ?? process.env.SKB_HOST_PIN ?? null;
        if (!expectedPin) { res.status(503).json({ error: 'host auth not configured' }); return; }

        const provided = String(req.body?.pin ?? '');
        if (!provided) { res.status(400).json({ error: 'pin required', field: 'pin' }); return; }

        const a = Buffer.from(provided);
        const b = Buffer.from(expectedPin);
        let ok = false;
        if (a.length === b.length) { try { ok = timingSafeEqual(a, b); } catch { ok = false; } }

        if (!ok) {
            const after = recordPinFailure(HOST_PIN_LOCKOUT_SCOPE, locationId, req.ip);
            console.log(JSON.stringify({ t: new Date().toISOString(), level: 'warn', msg: 'host.auth.fail', loc: locationId, ip: req.ip }));
            if (!after.allowed) {
                res.setHeader('Retry-After', String(after.retryAfterSeconds ?? 900));
                res.status(429).json({ error: 'too many attempts' });
                return;
            }
            res.status(401).json({ error: 'invalid pin' });
            return;
        }

        recordPinSuccess(HOST_PIN_LOCKOUT_SCOPE, locationId, req.ip);
        const lid = locationId;
        const cookie = mintLocationCookie(new Date(), key, lid);
        console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info', msg: 'host.auth.ok', loc: lid, ip: req.ip }));
        res.setHeader('Set-Cookie', `${HOST_COOKIE_NAME}=${cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${HOST_COOKIE_MAX_AGE_SECONDS}`);
        res.json({ ok: true });
    });

    r.post('/host/logout', (_req: Request, res: Response) => {
        res.setHeader('Set-Cookie', `${HOST_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
        res.json({ ok: true });
    });

    // All routes below require host auth
    r.get('/host/queue', requireHost, async (req: Request, res: Response) => {
        try { res.json(await listHostQueue(loc(req))); }
        catch (err) { dbError(res, err); }
    });

    // Host-initiated add — for walk-ins who hand the host their info instead
    // of scanning the QR. Uses the same joinQueue service + validation as the
    // diner /queue/join endpoint but without rate-limiting (hosts are
    // authenticated and shouldn't be throttled during a rush).
    r.post('/host/queue/add', requireHost, async (req: Request, res: Response) => {
        const body = (req.body ?? {}) as { name?: unknown; partySize?: unknown; phone?: unknown };
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (name.length < 1 || name.length > 60) {
            res.status(400).json({ error: 'name must be 1..60 chars', field: 'name' });
            return;
        }
        if (/[<>\\]/.test(name)) {
            res.status(400).json({ error: 'name contains unsupported characters', field: 'name' });
            return;
        }
        const size = Number(body.partySize);
        if (!Number.isInteger(size) || size < 1 || size > 10) {
            res.status(400).json({ error: 'partySize must be 1..10', field: 'partySize' });
            return;
        }
        const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
        if (!/^\d{10}$/.test(phone)) {
            res.status(400).json({ error: 'phone must be exactly 10 digits', field: 'phone' });
            return;
        }
        // Host-added parties consented verbally in-person when they
        // handed the host their info. Verbal consent is a valid opt-in
        // type; the host has the social signal to ask whether the party
        // wants SMS updates. Default true; allow the host UI to override
        // via body.smsConsent if they want a no-SMS entry.
        const smsConsent = (req.body as { smsConsent?: unknown }).smsConsent !== false;
        try {
            const result = await joinQueue(loc(req), { name, partySize: size, phone, smsConsent });
            if (smsConsent) {
                const location = await getLocation(loc(req));
                const statusUrl = buildQueueStatusUrlForSms({
                    locationId: loc(req),
                    code: result.code,
                    requestProto: String(req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https'),
                    requestHost: String(req.headers['x-forwarded-host'] ?? req.headers.host ?? ''),
                    locationPublicUrl: location?.publicUrl ?? '',
                    appPublicBaseUrl: process.env.SKB_PUBLIC_BASE_URL ?? '',
                });
                void sendSms(phone, joinConfirmationMessage(result.code, statusUrl), { locationId: loc(req) })
                    .catch(e => console.log(JSON.stringify({
                        t: new Date().toISOString(),
                        level: 'error',
                        msg: 'sms.host_join_confirm_failed',
                        error: e instanceof Error ? e.message : String(e),
                    })));
            }
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'host.queue.add',
                loc: loc(req),
                code: result.code,
                partySize: size,
                position: result.position,
                smsConsent,
            }));
            res.json(result);
        } catch (err) {
            dbError(res, err);
        }
    });

    r.post('/host/queue/:id/remove', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        const reason = String(req.body?.reason ?? '');
        if (reason !== 'seated' && reason !== 'no_show') {
            res.status(400).json({ error: 'reason must be seated|no_show', field: 'reason' });
            return;
        }
        // R14/R15: new clients MUST supply a tableNumber when reason==='seated'.
        // Legacy callers that don't set it still work (service tolerates missing
        // tableNumber) — the route validates new clients specifically by inspecting
        // whether the field was provided at all.
        const rawTable = (req.body as { tableNumber?: unknown })?.tableNumber;
        const tableProvided = rawTable !== undefined && rawTable !== null && rawTable !== '';
        if (reason === 'seated' && tableProvided) {
            const n = Number(rawTable);
            if (!Number.isInteger(n) || n < 1 || n > 999) {
                res.status(400).json({
                    error: 'tableNumber must be an integer 1..999',
                    field: 'tableNumber',
                });
                return;
            }
        }
        const override = Boolean((req.body as { override?: unknown })?.override);
        const opts = reason === 'seated' && tableProvided
            ? { tableNumber: Number(rawTable), override }
            : {};
        try {
            const result = await removeFromQueue(id, reason, opts);
            if (result.conflict) {
                console.log(JSON.stringify({
                    t: new Date().toISOString(),
                    level: 'warn',
                    msg: 'host.seat.conflict',
                    loc: loc(req),
                    id,
                    tableNumber: opts.tableNumber,
                    occupiedBy: result.conflict.partyName,
                }));
                res.status(409).json({
                    error: 'table_occupied',
                    tableNumber: opts.tableNumber,
                    occupiedBy: result.conflict.partyName,
                });
                return;
            }
            if (!result.ok) { res.status(404).json({ error: 'not found or already removed' }); return; }
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'queue.remove',
                loc: loc(req),
                id,
                reason,
                tableNumber: 'tableNumber' in opts ? opts.tableNumber : undefined,
                override,
            }));
            res.json({ ok: true });
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') { res.status(400).json({ error: 'invalid id' }); return; }
            dbError(res, err);
        }
    });

    r.post('/host/queue/:id/call', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        try {
            const result = await callParty(id);
            if (!result.ok) { res.status(404).json({ error: 'not found or not waiting' }); return; }
            res.json({ ok: true, smsStatus: result.smsStatus });
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') { res.status(400).json({ error: 'invalid id' }); return; }
            if (err instanceof Error && err.message === 'chat.disabled') { res.status(403).json({ error: err.message }); return; }
            dbError(res, err);
        }
    });

    r.post('/host/queue/:id/eta', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        const body = (req.body ?? {}) as { etaAt?: unknown };
        if (typeof body.etaAt !== 'string' || body.etaAt.length === 0) {
            res.status(400).json({ error: 'etaAt required (ISO 8601)', field: 'etaAt' });
            return;
        }
        const eta = new Date(body.etaAt);
        if (Number.isNaN(eta.valueOf())) {
            res.status(400).json({ error: 'etaAt must be a valid date', field: 'etaAt' });
            return;
        }
        try {
            const result = await setPartyEta(id, eta);
            if (!result.ok) { res.status(404).json({ error: 'not found or not editable' }); return; }
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'host.queue.eta',
                loc: loc(req),
                id,
                etaAt: eta.toISOString(),
            }));
            res.json({ ok: true, etaAt: eta.toISOString() });
        } catch (err) {
            if (err instanceof Error && (err.message === 'invalid id' || err.message === 'invalid etaAt')) {
                res.status(400).json({ error: err.message });
                return;
            }
            dbError(res, err);
        }
    });

    r.post('/host/queue/:id/sentiment', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        const raw = (req.body as { sentiment?: unknown })?.sentiment;
        let sentiment: HostSentiment | null;
        if (raw === null || raw === '') {
            sentiment = null;
        } else if (raw === 'happy' || raw === 'neutral' || raw === 'upset') {
            sentiment = raw;
        } else {
            res.status(400).json({ error: 'sentiment must be happy|neutral|upset|null', field: 'sentiment' });
            return;
        }
        try {
            const result = await setPartySentimentOverride(id, sentiment);
            if (!result.ok) { res.status(404).json({ error: 'not found or not editable' }); return; }
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'host.queue.sentiment',
                loc: loc(req),
                id,
                sentiment: sentiment ?? 'auto',
            }));
            res.json({ ok: true });
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') { res.status(400).json({ error: 'invalid id' }); return; }
            dbError(res, err);
        }
    });

    // R11: best-effort log when the host taps the tel: dial link. Fire-and-forget
    // from the client; response is advisory so failures are silent.
    r.post('/host/queue/:id/call-log', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        try {
            await logCallDial(id);
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'host.call_dial',
                loc: loc(req),
                id,
            }));
            res.json({ ok: true });
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') { res.status(400).json({ error: 'invalid id' }); return; }
            if (err instanceof Error && err.message === 'chat.disabled') { res.status(403).json({ error: err.message }); return; }
            dbError(res, err);
        }
    });

    // R10: send a chat message (outbound SMS + thread append).
    r.post('/host/queue/:id/chat', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        const raw = (req.body as { body?: unknown })?.body;
        const body = typeof raw === 'string' ? raw.trim() : '';
        if (body.length === 0 || body.length > 1600) {
            res.status(400).json({ error: 'body must be 1..1600 chars', field: 'body' });
            return;
        }
        try {
            const result = await sendChatMessage(id, body);
            if (!result.ok) { res.status(404).json({ error: 'entry not found' }); return; }
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: result.smsStatus === 'failed' ? 'error' : 'info',
                msg: result.smsStatus === 'failed' ? 'chat.outbound.failed' : 'chat.outbound',
                loc: loc(req),
                id,
                len: body.length,
                smsStatus: result.smsStatus,
            }));
            res.json({ ok: true, smsStatus: result.smsStatus, message: result.message });
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') { res.status(400).json({ error: 'invalid id' }); return; }
            if (err instanceof Error && err.message === 'chat.disabled') { res.status(403).json({ error: err.message }); return; }
            dbError(res, err);
        }
    });

    // R10/R21: fetch chat thread (oldest → newest) with cursor pagination.
    r.get('/host/queue/:id/chat', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));
        const beforeRaw = req.query.before;
        const before = typeof beforeRaw === 'string' && beforeRaw.length > 0 ? new Date(beforeRaw) : undefined;
        try {
            const thread = await getChatThread(id, { limit, before });
            if (!thread) { res.status(404).json({ error: 'entry not found' }); return; }
            res.json(thread);
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') { res.status(400).json({ error: 'invalid id' }); return; }
            dbError(res, err);
        }
    });

    // R10: mark all inbound messages for this entry as read.
    r.patch('/host/queue/:id/chat/read', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        try {
            const result = await markThreadRead(id);
            res.json({ ok: true, updated: result.updated });
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') { res.status(400).json({ error: 'invalid id' }); return; }
            dbError(res, err);
        }
    });

    // R10: expose the quick-reply templates to the client so host.js doesn't
    // have to hardcode wording that lives server-side in smsTemplates.ts.
    r.get('/host/chat/templates', requireHost, async (req: Request, res: Response) => {
        const code = String(req.query.code ?? '');
        if (!code) { res.status(400).json({ error: 'code required', field: 'code' }); return; }
        // No features.chat gate here — quick-reply templates are part of the
        // host's compose surface, which always works (SMS goes out when the
        // diner consented; the thread persists for audit either way). The
        // diner-side panel is the surface that features.chat actually gates.
        res.json({
            almostReady: chatAlmostReadyMessage(code),
            needMoreTime: chatNeedMoreTimeMessage(code),
            lostYou: chatLostYouMessage(code),
        });
    });

    r.get('/host/dining', requireHost, async (req: Request, res: Response) => {
        try { res.json(await listDiningParties(loc(req))); }
        catch (err) { dbError(res, err); }
    });

    r.get('/host/completed', requireHost, async (req: Request, res: Response) => {
        try { res.json(await listCompletedParties(loc(req))); }
        catch (err) { dbError(res, err); }
    });

    r.get('/host/queue/:id/timeline', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        try {
            const timeline = await getPartyTimeline(id);
            if (!timeline) { res.status(404).json({ error: 'not found' }); return; }
            res.json(timeline);
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') { res.status(400).json({ error: 'invalid id' }); return; }
            dbError(res, err);
        }
    });

    r.get('/host/queue/:id/order', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        try {
            const order = await getHostPartyOrder(id);
            if (!order) { res.status(404).json({ error: 'not found' }); return; }
            res.json(order);
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') { res.status(400).json({ error: 'invalid id' }); return; }
            dbError(res, err);
        }
    });

    r.post('/host/queue/:id/advance', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        const targetState = String(req.body?.state ?? '');
        const validStates = ['ordered', 'served', 'checkout', 'departed'];
        if (!validStates.includes(targetState)) {
            res.status(400).json({ error: 'state must be ordered|served|checkout|departed', field: 'state' });
            return;
        }
        try {
            const result = await advanceParty(id, targetState);
            if (!result.ok) { res.status(404).json({ error: 'not found' }); return; }
            res.json({ ok: true });
        } catch (err) {
            if (err instanceof Error && err.message.startsWith('cannot advance') || (err instanceof Error && err.message.startsWith('invalid'))) {
                res.status(400).json({ error: err.message });
                return;
            }
            dbError(res, err);
        }
    });

    r.get('/host/analytics', requireHost, async (req: Request, res: Response) => {
        const range = String(req.query.range ?? '7');
        const partySize = String(req.query.partySize ?? 'all');
        const startStage = req.query.startStage === undefined ? undefined : String(req.query.startStage) as AnalyticsStage;
        const endStage = req.query.endStage === undefined ? undefined : String(req.query.endStage) as AnalyticsStage;
        if ((startStage && !endStage) || (!startStage && endStage)) {
            res.status(400).json({ error: 'startStage and endStage must both be provided' });
            return;
        }
        try { res.json(await getAnalytics(loc(req), range, partySize, startStage, endStage)); }
        catch (err) {
            if (err instanceof Error && err.message === 'invalid analytics stage range') {
                res.status(400).json({ error: err.message, field: 'startStage,endStage' });
                return;
            }
            dbError(res, err);
        }
    });

    r.get('/host/stats', requireHost, async (req: Request, res: Response) => {
        try { res.json(await getHostStats(loc(req))); }
        catch (err) { dbError(res, err); }
    });

    r.get('/host/caller-stats', requireAdmin, async (req: Request, res: Response) => {
        const range = String(req.query.range ?? '1');
        if (!['1', '7', '30'].includes(range)) {
            res.status(400).json({ error: 'range must be 1|7|30', field: 'range' });
            return;
        }
        try { res.json(await getCallerStats(loc(req), range)); }
        catch (err) { dbError(res, err); }
    });

    r.get('/host/settings', requireHost, async (req: Request, res: Response) => {
        try {
            const info = await getEffectiveTurnTime(loc(req));
            res.json({
                // Backwards-compat: the old single field at top level always reflects the manual value.
                avgTurnTimeMinutes: info.manualMinutes,
                etaMode: info.mode,
                effectiveMinutes: info.effectiveMinutes,
                dynamicMinutes: info.dynamicMinutes,
                sampleSize: info.sampleSize,
                fellBackToManual: info.fellBackToManual,
            });
        } catch (err) { dbError(res, err); }
    });

    // ----------------------------------------------------------------------
    // Visit-page admin: read + update the per-location config that drives
    // /r/:loc/visit. Stored on the Location document, not Settings, because
    // these are tenant-level routing rules — not per-day operational tuning.
    // ----------------------------------------------------------------------
    r.get('/host/visit-config', requireHost, async (req: Request, res: Response) => {
        try {
            const location = await getLocation(loc(req));
            res.json({
                visitMode: location?.visitMode ?? 'auto',
                menuUrl: location?.menuUrl ?? '',
                closedMessage: location?.closedMessage ?? '',
            });
        } catch (err) { dbError(res, err); }
    });

    // ----------------------------------------------------------------------
    // Structured menu (issue #51 follow-up). GET is public — powers the
    // diner-facing /menu page. POST requires admin/owner.
    // ----------------------------------------------------------------------
    r.get('/menu', async (req: Request, res: Response) => {
        try {
            const location = await getLocation(loc(req));
            if (!location) { res.status(404).json({ error: 'location not found' }); return; }
            res.json({
                menu: location.menu ?? { sections: [] },
                menuUrl: location.menuUrl ?? '',
            });
        } catch (err) { dbError(res, err); }
    });

    r.post('/host/menu', requireAdmin, async (req: Request, res: Response) => {
        const body = (req.body ?? {}) as { menu?: unknown };
        if (body.menu === null) {
            try {
                await updateLocationMenu(loc(req), null);
                res.json({ ok: true, menu: { sections: [] } });
                return;
            } catch (err) { dbError(res, err); return; }
        }
        if (!body.menu || typeof body.menu !== 'object' || !Array.isArray((body.menu as LocationMenu).sections)) {
            res.status(400).json({ error: 'menu.sections must be an array' });
            return;
        }
        try {
            await processMenuImages(publicDirForAssets, loc(req), body.menu as LocationMenu);
            const updated = await updateLocationMenu(loc(req), body.menu as LocationMenu);
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'host.menu.updated',
                loc: loc(req),
                sectionCount: updated.menu?.sections.length ?? 0,
                itemCount: (updated.menu?.sections ?? []).reduce((n, s) => n + s.items.length, 0),
            }));
            res.json({ ok: true, menu: updated.menu ?? { sections: [] } });
        } catch (err) {
            if (err instanceof Error && (
                err.message.startsWith('menu.')
                || err.message.startsWith('section.')
                || err.message.startsWith('item.')
                || err.message.startsWith('image ')
            )) {
                res.status(400).json({ error: err.message });
                return;
            }
            if (err instanceof Error && err.message === 'location not found') {
                res.status(404).json({ error: 'location not found' });
                return;
            }
            dbError(res, err);
        }
    });

    r.post('/host/visit-config', requireAdmin, async (req: Request, res: Response) => {
        const body = (req.body ?? {}) as {
            visitMode?: unknown;
            menuUrl?: unknown;
            closedMessage?: unknown;
        };
        const update: { visitMode?: 'auto' | 'queue' | 'menu' | 'closed'; menuUrl?: string | null; closedMessage?: string | null } = {};
        if (body.visitMode !== undefined) {
            update.visitMode = String(body.visitMode) as 'auto' | 'queue' | 'menu' | 'closed';
        }
        if (body.menuUrl !== undefined) {
            update.menuUrl = body.menuUrl === null ? null : String(body.menuUrl);
        }
        if (body.closedMessage !== undefined) {
            update.closedMessage = body.closedMessage === null ? null : String(body.closedMessage);
        }
        try {
            const updated = await updateLocationVisitConfig(loc(req), update);
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'host.visit_config.updated',
                loc: loc(req),
                visitMode: updated.visitMode ?? 'auto',
                menuUrlSet: !!updated.menuUrl,
                closedMessageSet: !!updated.closedMessage,
            }));
            res.json({
                visitMode: updated.visitMode ?? 'auto',
                menuUrl: updated.menuUrl ?? '',
                closedMessage: updated.closedMessage ?? '',
            });
        } catch (err) {
            if (err instanceof Error && (
                err.message.startsWith('visitMode')
                || err.message.startsWith('menuUrl')
                || err.message.startsWith('closedMessage')
            )) {
                res.status(400).json({ error: err.message });
                return;
            }
            if (err instanceof Error && err.message === 'location not found') {
                res.status(404).json({ error: 'location not found' });
                return;
            }
            dbError(res, err);
        }
    });

    // Door-QR SVG — renders a fresh QR every request so when the owner
    // updates publicHost or the deployment URL, the printed sticker
    // regenerates to match. The QR always encodes the per-location
    // /visit URL (the dynamic routing endpoint from PR #42) so the
    // sticker itself never needs reprinting as visit-mode changes
    // (issue #50 bug 7).
    r.get('/host/visit-qr.svg', requireHost, async (req: Request, res: Response) => {
        try {
            const location = await getLocation(loc(req));
            const url = buildVisitQrUrl({
                locationId: loc(req),
                requestProto: String(req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https'),
                requestHost: String(req.headers['x-forwarded-host'] ?? req.headers.host ?? ''),
                locationPublicUrl: location?.publicUrl ?? '',
                locationPublicHost: location?.publicHost ?? '',
            });
            if (!url) {
                res.status(503).type('text/plain').send('no host configured');
                return;
            }
            const svg = await QRCode.toString(url, {
                type: 'svg',
                errorCorrectionLevel: 'H',
                margin: 2,
                color: { dark: '#000000', light: '#ffffff' },
            });
            res.type('image/svg+xml').setHeader('Cache-Control', 'no-store').send(svg);
        } catch (err) {
            console.log(JSON.stringify({ t: new Date().toISOString(), level: 'error', msg: 'host.visit_qr.error', err: err instanceof Error ? err.message : String(err) }));
            res.status(500).type('text/plain').send('qr generation failed');
        }
    });

    // Voice / IVR admin config (from PR #48) — voiceEnabled,
    // frontDeskPhone, cateringPhone, voiceLargePartyThreshold. The press-0
    // transfer branch added in issue #45 dials `frontDeskPhone`; issue #79
    // adds a dedicated catering transfer number for press 5.
    // Onboarding-wizard "you're live" reveal (issue #51 Phase C). The wizard
    // finishes by showing the owner their host-stand PIN so they can print the
    // door poster. Gated to requireAdmin so staff-role accounts can't lift the
    // PIN from the admin page. Returns 404 when the location exists but no
    // per-location PIN is set (falls back to env SKB_HOST_PIN in that case,
    // which the env-based single-tenant installs don't need to surface).
    r.get('/host/pin', requireAdmin, async (req: Request, res: Response) => {
        try {
            const location = await getLocation(loc(req));
            if (!location) { res.status(404).json({ error: 'location not found' }); return; }
            const pin = location.pin ?? '';
            if (!pin) { res.status(404).json({ error: 'pin not set' }); return; }
            res.json({ pin });
        } catch (err) { dbError(res, err); }
    });

    // Admin-set PIN. 4-6 digits. Invalidates any active skb_host cookies
    // because the cookie HMAC is location-specific — a new PIN doesn't
    // immediately log out tablets, but future unlocks must use the new
    // value. (A full rotate-session-secret flow is a follow-up.)
    r.post('/host/pin', requireAdmin, async (req: Request, res: Response) => {
        const body = (req.body ?? {}) as { pin?: unknown };
        const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
        if (!/^\d{4,6}$/.test(pin)) {
            res.status(400).json({ error: 'PIN must be 4–6 digits', field: 'pin' });
            return;
        }
        try {
            const db = await getDb();
            const r2 = await locationsColl(db).findOneAndUpdate(
                { _id: loc(req) },
                { $set: { pin } },
                { returnDocument: 'after' },
            );
            if (!r2) { res.status(404).json({ error: 'location not found' }); return; }
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'host.pin.updated',
                loc: loc(req),
            }));
            res.json({ ok: true });
        } catch (err) { dbError(res, err); }
    });

    r.get('/host/voice-config', requireHost, async (req: Request, res: Response) => {
        try {
            const location = await getLocation(loc(req));
            res.json({
                voiceEnabled: location?.voiceEnabled ?? (process.env.TWILIO_VOICE_ENABLED === 'true'),
                frontDeskPhone: location?.frontDeskPhone ?? '',
                cateringPhone: location?.cateringPhone ?? '',
                voiceLargePartyThreshold: location?.voiceLargePartyThreshold ?? 10,
            });
        } catch (err) { dbError(res, err); }
    });

    r.post('/host/voice-config', requireAdmin, async (req: Request, res: Response) => {
        const body = (req.body ?? {}) as {
            voiceEnabled?: unknown;
            frontDeskPhone?: unknown;
            cateringPhone?: unknown;
            voiceLargePartyThreshold?: unknown;
        };
        try {
            const updated = await updateLocationVoiceConfig(loc(req), {
                voiceEnabled: body.voiceEnabled === undefined ? undefined : Boolean(body.voiceEnabled),
                frontDeskPhone: body.frontDeskPhone === undefined ? undefined : (body.frontDeskPhone === null ? null : String(body.frontDeskPhone)),
                cateringPhone: body.cateringPhone === undefined ? undefined : (body.cateringPhone === null ? null : String(body.cateringPhone)),
                voiceLargePartyThreshold: body.voiceLargePartyThreshold === undefined ? undefined : Number(body.voiceLargePartyThreshold),
            });
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'host.voice_config.updated',
                loc: loc(req),
                voiceEnabled: updated.voiceEnabled ?? (process.env.TWILIO_VOICE_ENABLED === 'true'),
                frontDeskPhoneSet: !!updated.frontDeskPhone,
                cateringPhoneSet: !!updated.cateringPhone,
                voiceLargePartyThreshold: updated.voiceLargePartyThreshold ?? 10,
            }));
            // Fan-out to Google Business Profile (issue #51 Phase D) when
            // the primary phone changed. Same fire-and-forget pattern as
            // the site/website handlers.
            if (body.frontDeskPhone !== undefined) {
                pushToGbpBackground(loc(req));
            }
            res.json({
                voiceEnabled: updated.voiceEnabled ?? (process.env.TWILIO_VOICE_ENABLED === 'true'),
                frontDeskPhone: updated.frontDeskPhone ?? '',
                cateringPhone: updated.cateringPhone ?? '',
                voiceLargePartyThreshold: updated.voiceLargePartyThreshold ?? 10,
            });
        } catch (err) {
            if (err instanceof Error && (
                err.message.startsWith('frontDeskPhone')
                || err.message.startsWith('cateringPhone')
                || err.message.startsWith('voiceLargePartyThreshold')
            )) {
                res.status(400).json({ error: err.message });
                return;
            }
            if (err instanceof Error && err.message === 'location not found') {
                res.status(404).json({ error: 'location not found' });
                return;
            }
            dbError(res, err);
        }
    });

    // Messaging config (#69): per-tenant display name prefixed onto every
    // outbound SMS on the shared OSH number. Read: host+ (everyone needs
    // to see how their texts identify). Write: owner/admin only.
    r.get('/host/messaging-config', requireHost, async (req: Request, res: Response) => {
        try {
            const location = await getLocation(loc(req));
            res.json({
                smsSenderName: location?.smsSenderName ?? location?.name ?? '',
                sharedNumber: process.env.TWILIO_PHONE_NUMBER ?? '',
                twilioVoiceNumber: location?.twilioVoiceNumber ?? '',
            });
        } catch (err) { dbError(res, err); }
    });

    r.post('/host/messaging-config', requireAdmin, async (req: Request, res: Response) => {
        const body = (req.body ?? {}) as { smsSenderName?: unknown };
        try {
            const update: { smsSenderName?: string | null } = {};
            if (body.smsSenderName !== undefined) {
                update.smsSenderName = body.smsSenderName === null ? null : String(body.smsSenderName);
            }
            const updated = await updateLocationMessagingConfig(loc(req), update);
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'host.messaging_config.updated',
                loc: loc(req),
                smsSenderNameSet: !!updated.smsSenderName,
            }));
            res.json({
                smsSenderName: updated.smsSenderName ?? updated.name ?? '',
                sharedNumber: process.env.TWILIO_PHONE_NUMBER ?? '',
                twilioVoiceNumber: updated.twilioVoiceNumber ?? '',
            });
        } catch (err) {
            if (err instanceof Error && err.message.startsWith('smsSenderName')) {
                res.status(400).json({ error: err.message });
                return;
            }
            if (err instanceof Error && err.message === 'location not found') {
                res.status(404).json({ error: 'location not found' });
                return;
            }
            dbError(res, err);
        }
    });

    r.get('/host/guest-features', requireHost, async (req: Request, res: Response) => {
        try {
            const location = await getLocation(loc(req));
            res.json(getGuestFeatures(location));
        } catch (err) { dbError(res, err); }
    });

    r.post('/host/guest-features', requireAdmin, async (req: Request, res: Response) => {
        const body = (req.body ?? {}) as {
            menu?: unknown;
            sms?: unknown;
            chat?: unknown;
            order?: unknown;
        };
        const update: {
            menu?: boolean;
            sms?: boolean;
            chat?: boolean;
            order?: boolean;
        } = {};
        if (body.menu !== undefined) update.menu = body.menu as boolean;
        if (body.sms !== undefined) update.sms = body.sms as boolean;
        if (body.chat !== undefined) update.chat = body.chat as boolean;
        if (body.order !== undefined) update.order = body.order as boolean;
        try {
            const updated = await updateLocationGuestFeatures(loc(req), update);
            const guestFeatures = getGuestFeatures(updated);
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'host.guest_features.updated',
                loc: loc(req),
                guestFeatures,
            }));
            res.json(guestFeatures);
        } catch (err) {
            if (err instanceof Error && err.message.startsWith('guestFeatures.')) {
                res.status(400).json({ error: err.message });
                return;
            }
            if (err instanceof Error && err.message === 'location not found') {
                res.status(404).json({ error: 'location not found' });
                return;
            }
            dbError(res, err);
        }
    });

    // ----------------------------------------------------------------------
    // Site admin (issue #45): address, weekly hours, public host. Drives
    // the diner-facing website pages and the IVR hours/location branch.
    // Split from visit-config and voice-config because it's a third
    // capability area — the replacement for skbbellevue.com lives here.
    // ----------------------------------------------------------------------
    r.get('/host/site-config', requireHost, async (req: Request, res: Response) => {
        try {
            const location = await getLocation(loc(req));
            res.json({
                // Read-only display field (issue #57): admin topbar reads
                // this to render "OSH · Admin — {restaurant.name}"
                // without adding a second fetch. The name is already the
                // document's _id-display value; updating it is a separate
                // concern (no write path exposed here).
                name: location?.name ?? '',
                address: location?.address ?? null,
                hours: location?.hours ?? null,
                publicUrl: location?.publicUrl ?? '',
                publicHost: location?.publicHost ?? '',
            });
        } catch (err) { dbError(res, err); }
    });

    r.post('/host/site-config', requireAdmin, async (req: Request, res: Response) => {
        const body = (req.body ?? {}) as {
            address?: unknown;
            hours?: unknown;
            publicHost?: unknown;
        };
        const update: {
            address?: LocationAddress | null;
            hours?: WeeklyHours | null;
            publicHost?: string | null;
        } = {};
        if (body.address !== undefined) {
            if (body.address === null) {
                update.address = null;
            } else if (typeof body.address === 'object') {
                const a = body.address as Record<string, unknown>;
                update.address = {
                    street: String(a.street ?? ''),
                    city: String(a.city ?? ''),
                    state: String(a.state ?? ''),
                    zip: String(a.zip ?? ''),
                };
            } else {
                res.status(400).json({ error: 'address must be an object or null' });
                return;
            }
        }
        if (body.hours !== undefined) {
            if (body.hours === null) {
                update.hours = null;
            } else if (typeof body.hours === 'object') {
                update.hours = body.hours as WeeklyHours;
            } else {
                res.status(400).json({ error: 'hours must be an object or null' });
                return;
            }
        }
        if (body.publicHost !== undefined) {
            update.publicHost = body.publicHost === null ? null : String(body.publicHost);
        }
        try {
            const updated = await updateLocationSiteConfig(loc(req), update);
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'host.site_config.updated',
                loc: loc(req),
                addressSet: !!updated.address,
                hoursSet: !!updated.hours,
                publicHostSet: !!updated.publicHost,
            }));
            // Fan-out to Google Business Profile (issue #51 Phase D). Fire-
            // and-forget: sync failures update google_tokens.lastSyncError
            // but don't fail the admin save. The Settings card surfaces the
            // last error so owners can retry or disconnect. Skipped if the
            // tenant isn't Google-connected.
            if (update.hours !== undefined) {
                pushToGbpBackground(loc(req));
            }
            res.json({
                address: updated.address ?? null,
                hours: updated.hours ?? null,
                publicHost: updated.publicHost ?? '',
            });
        } catch (err) {
            if (err instanceof Error && (
                err.message.startsWith('address')
                || err.message.startsWith('hours')
                || err.message.startsWith('publicHost')
            )) {
                res.status(400).json({ error: err.message });
                return;
            }
            if (err instanceof Error && err.message === 'location not found') {
                res.status(404).json({ error: 'location not found' });
                return;
            }
            dbError(res, err);
        }
    });

    // ----------------------------------------------------------------------
    // Website admin (issue #56): template choice + structured content.
    // Separate from site-config (address/hours/publicHost) because the
    // Website tab in admin owns a different capability area — the template
    // renderer and content editor.
    //
    // Canonical endpoint per spec #51 §8.5: `GET/POST /r/:loc/api/config/website`
    // gated to owner/admin (same role-check as other settings POSTs).
    // `/host/website-config` is preserved as a backward-compat alias wired
    // to the same handlers so existing clients keep working (#56 introduced
    // the alias before role-scoped middleware existed).
    // ----------------------------------------------------------------------
    const getWebsiteConfigHandler = async (req: Request, res: Response) => {
        try {
            const location = await getLocation(loc(req));
            res.json({
                websiteTemplate: location?.websiteTemplate ?? DEFAULT_WEBSITE_TEMPLATE,
                content: location?.content ?? null,
            });
        } catch (err) { dbError(res, err); }
    };
    r.get('/config/website', requireAdmin, getWebsiteConfigHandler);
    r.get('/host/website-config', requireHost, getWebsiteConfigHandler);

    const postWebsiteConfigHandler = async (req: Request, res: Response) => {
        const body = (req.body ?? {}) as {
            websiteTemplate?: unknown;
            content?: unknown;
        };
        const update: WebsiteConfigUpdate = {};
        if (body.websiteTemplate !== undefined) {
            if (body.websiteTemplate === null || body.websiteTemplate === '') {
                update.websiteTemplate = null;
            } else if (typeof body.websiteTemplate === 'string') {
                update.websiteTemplate = body.websiteTemplate as WebsiteTemplateKey;
            } else {
                res.status(400).json({ error: 'websiteTemplate must be a string or null' });
                return;
            }
        }
        if (body.content !== undefined) {
            if (body.content === null) {
                update.content = null;
            } else if (typeof body.content === 'object' && !Array.isArray(body.content)) {
                update.content = body.content as LocationContent;
            } else {
                res.status(400).json({ error: 'content must be an object or null' });
                return;
            }
        }
        try {
            // If the client uploaded inline base64 images via content.knownFor[*].image,
            // persist them to disk first and swap the values for URL paths.
            if (update.content && typeof update.content === 'object') {
                await processKnownForImages(publicDirForAssets, loc(req), update.content);
            }
            const updated = await updateLocationWebsiteConfig(loc(req), update);
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'host.website_config.updated',
                loc: loc(req),
                websiteTemplate: updated.websiteTemplate ?? DEFAULT_WEBSITE_TEMPLATE,
                contentSet: !!updated.content,
            }));
            // Fan-out to Google Business Profile (issue #51 Phase D). See
            // the note in /host/site-config above: fire-and-forget, never
            // blocks the admin save. Triggered when `content` changed since
            // `content.about` is the description surface we push to GBP.
            if (update.content !== undefined) {
                pushToGbpBackground(loc(req));
            }
            res.json({
                websiteTemplate: updated.websiteTemplate ?? DEFAULT_WEBSITE_TEMPLATE,
                content: updated.content ?? null,
            });
        } catch (err) {
            if (err instanceof Error && (
                err.message.startsWith('websiteTemplate')
                || err.message.startsWith('heroHeadline')
                || err.message.startsWith('heroSubhead')
                || err.message.startsWith('about')
                || err.message.startsWith('reservationsNote')
                || err.message.startsWith('instagramHandle')
                || err.message.startsWith('contactEmail')
                || err.message.startsWith('knownFor')
            )) {
                res.status(400).json({ error: err.message });
                return;
            }
            if (err instanceof Error && err.message === 'location not found') {
                res.status(404).json({ error: 'location not found' });
                return;
            }
            dbError(res, err);
        }
    };
    r.post('/config/website', requireAdmin, postWebsiteConfigHandler);
    r.post('/host/website-config', requireHost, postWebsiteConfigHandler);

    // Public (unauthenticated) subset of the location config for the new
    // diner-facing website pages (issue #45). Excludes `pin` and internal
    // flags — see `toPublicLocation` in src/services/locations.ts.
    r.get('/public-config', async (req: Request, res: Response) => {
        try {
            const location = await getLocation(loc(req));
            if (!location) {
                res.status(404).json({ error: 'location not found' });
                return;
            }
            res.json(toPublicLocation(location));
        } catch (err) { dbError(res, err); }
    });

    // ----------------------------------------------------------------------
    // Owner self-deletion of their restaurant. A real product feature (an
    // owner can leave the platform) and the cleanup hook for the
    // post-deploy smoke (project rule #8) — smoke signs up a throwaway
    // tenant, exercises probes, then deletes via this same route.
    //
    // Auth: owner only. requireOwner enforces session-source + role and
    // tenant binding (the cookie's `lid` must equal `req.params.loc`).
    //
    // Confirm-name guard: body must include `confirmName` matching the
    // location's name exactly. Prevents accidental deletes from a stale
    // tab / fat-fingered curl. The shape mirrors common destructive-op
    // confirms (GitHub, Stripe, etc.).
    //
    // Cascade: deletes every collection scoped by `locationId`, then the
    // location itself. The owner user is deleted only if they have no
    // other active membership — multi-tenant owners stay around.
    // ----------------------------------------------------------------------
    r.delete('/tenant', requireOwner, async (req: Request, res: Response) => {
        const locationId = loc(req);
        const ownerUid = req.hostAuth?.uid;
        if (!ownerUid) {
            // requireOwner guarantees source='session', so uid must be set.
            // Defensive check keeps TS happy and fails closed.
            res.status(401).json({ error: 'unauthorized' });
            return;
        }
        const ownerOid = (() => { try { return new ObjectId(ownerUid); } catch { return null; } })();
        if (!ownerOid) { res.status(401).json({ error: 'unauthorized' }); return; }

        const body = (req.body ?? {}) as { confirmName?: unknown };
        const confirmName = typeof body.confirmName === 'string' ? body.confirmName : '';
        if (!confirmName) {
            res.status(400).json({ error: 'confirmName required', field: 'confirmName' });
            return;
        }
        try {
            const db = await getDb();
            const location = await getLocation(locationId);
            if (!location) {
                // Idempotent: already gone.
                res.json({ ok: true, locationId, deleted: { location: false } });
                return;
            }
            if (confirmName !== location.name) {
                res.status(400).json({
                    error: 'confirmName does not match restaurant name',
                    field: 'confirmName',
                });
                return;
            }

            // Delete child data first so any orphan checks elsewhere stay
            // consistent. Order matches the dependency graph.
            const result = {
                queueEntries: (await queueEntriesColl(db).deleteMany({ locationId })).deletedCount,
                queueMessages: (await queueMessagesColl(db).deleteMany({ locationId })).deletedCount,
                partyOrders: (await partyOrdersColl(db).deleteMany({ locationId })).deletedCount,
                voiceCallSessions: (await voiceCallSessionsColl(db).deleteMany({ locationId })).deletedCount,
                settings: (await settingsColl(db).deleteMany({ _id: locationId })).deletedCount,
                googleTokens: (await googleTokensColl(db).deleteMany({ locationId })).deletedCount,
                invites: (await invitesColl(db).deleteMany({ locationId })).deletedCount,
                memberships: (await membershipsColl(db).deleteMany({ locationId })).deletedCount,
                user: 0,
                location: 0,
            };
            // Delete the owner user only if no other active memberships remain
            // (multi-tenant owners stay; a single-tenant owner who deleted
            // their only restaurant is fully removed).
            const otherActive = await membershipsColl(db).findOne({
                userId: ownerOid,
                revokedAt: { $exists: false },
            });
            if (!otherActive) {
                result.user = (await usersColl(db).deleteOne({ _id: ownerOid })).deletedCount;
            }
            result.location = (await locationsColl(db).deleteOne({ _id: locationId })).deletedCount;

            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'tenant.deleted',
                locationId,
                ownerUid,
                ownerUserDeleted: result.user > 0,
                deleted: result,
            }));
            res.json({ ok: true, locationId, deleted: result });
        } catch (err) {
            dbError(res, err, '/tenant');
        }
    });

    // ----------------------------------------------------------------------
    // Staff management (issue #55, spec §6.3). All three endpoints are
    // tenant-scoped via `req.params.loc` which requireRole verifies
    // against the cookie's `lid`. The create/revoke endpoints are
    // owner-only; the list endpoint is owner+admin so admins can see
    // "who's on this team" from their side of the workspace.
    // ----------------------------------------------------------------------
    r.get('/staff', requireAdmin, async (req: Request, res: Response) => {
        try {
            const [staff, pending] = await Promise.all([
                listStaffAtLocation(loc(req)),
                listPendingInvites(loc(req)),
            ]);
            res.json({ staff, pending });
        } catch (err) { dbError(res, err, '/staff'); }
    });

    r.post('/staff/invite', requireOwner, async (req: Request, res: Response) => {
        const body = (req.body ?? {}) as { email?: unknown; name?: unknown; role?: unknown };
        const email = typeof body.email === 'string' ? body.email : '';
        const name = typeof body.name === 'string' ? body.name : '';
        const role = typeof body.role === 'string' ? body.role : '';
        if (!isInvitableRole(role)) {
            res.status(400).json({ error: 'role must be owner, admin, or host', field: 'role' });
            return;
        }
        const uid = req.hostAuth?.uid;
        if (!uid) {
            // requireOwner guarantees source='session', so uid must be set.
            // Double-check to keep TS happy and to fail closed.
            res.status(401).json({ error: 'unauthorized' });
            return;
        }
        try {
            const { invite, token } = await createInvite({
                email,
                name,
                role,
                locationId: loc(req),
                invitedByUserId: new ObjectId(uid),
            });
            // The audit-log line keeps the magic link grep-able for ops/dev
            // walkthroughs. Then we attempt a real send via the mailer; if
            // ACS isn't configured the mailer falls back to log-only so the
            // invite link is still recoverable from logs.
            const base = process.env.PLATFORM_PUBLIC_URL ?? '';
            const link = `${base}/accept-invite?t=${encodeURIComponent(token)}`;
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'staff.invite.created',
                loc: loc(req),
                email: invite.email,
                role: invite.role,
                invitedBy: uid,
                token,
                link,
            }));
            const delivery = await sendEmail({
                to: invite.email,
                subject: `You're invited to join ${loc(req)} on OSH`,
                text: buildStaffInviteEmail({
                    inviteeName: invite.name,
                    locationId: loc(req),
                    role: invite.role,
                    link,
                }),
            });
            if (process.env.NODE_ENV === 'production' && !delivery.delivered) {
                await revokeInvite(loc(req), invite.id);
                res.status(503).json({
                    error: 'invite email delivery unavailable',
                    code: 'invite_email_unavailable',
                    delivery,
                    deliveryMessage: buildInviteDeliveryMessage(invite.email, delivery),
                });
                return;
            }
            res.json({
                invite,
                delivery,
                deliveryMessage: buildInviteDeliveryMessage(invite.email, delivery),
            });
        } catch (err) {
            if (err instanceof Error) {
                const msg = err.message;
                if (msg === 'already a member'
                    || msg === 'role must be owner, admin, or host'
                    || msg === 'locationId is required'
                    || msg.startsWith('email')
                    || msg.startsWith('name')) {
                    res.status(400).json({ error: msg });
                    return;
                }
            }
            dbError(res, err);
        }
    });

    r.post('/staff/revoke', requireOwner, async (req: Request, res: Response) => {
        const body = (req.body ?? {}) as { membershipId?: unknown; inviteId?: unknown };
        const membershipId = typeof body.membershipId === 'string' ? body.membershipId : '';
        const inviteId = typeof body.inviteId === 'string' ? body.inviteId : '';
        if (!membershipId && !inviteId) {
            res.status(400).json({ error: 'membershipId or inviteId required' });
            return;
        }
        try {
            if (inviteId) {
                // Cancel a pending invite — no self-revoke concern.
                const ok = await revokeInvite(loc(req), inviteId);
                if (!ok) { res.status(404).json({ error: 'invite not found' }); return; }
                console.log(JSON.stringify({
                    t: new Date().toISOString(),
                    level: 'info',
                    msg: 'staff.invite.revoked',
                    loc: loc(req),
                    inviteId,
                    revokedBy: req.hostAuth?.uid,
                }));
                res.json({ ok: true });
                return;
            }
            // Membership revoke — R5: owner cannot revoke self.
            // We need to look up the membership to compare its userId to
            // the caller's uid. The service throws its own 404 path
            // (returns false), so do a soft-check first via the DB.
            const uid = req.hostAuth?.uid;
            if (uid) {
                const db = await getDb();
                let target;
                try { target = await membershipsColl(db).findOne({ _id: new ObjectId(membershipId) }); }
                catch { target = null; }
                if (target && target.userId.toHexString() === uid) {
                    res.status(400).json({ error: 'cannot revoke self' });
                    return;
                }
            }
            const ok = await revokeMembership(loc(req), membershipId);
            if (!ok) { res.status(404).json({ error: 'membership not found' }); return; }
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'staff.membership.revoked',
                loc: loc(req),
                membershipId,
                revokedBy: req.hostAuth?.uid,
            }));
            res.json({ ok: true });
        } catch (err) { dbError(res, err); }
    });

    // Issue #106: hosts need to adjust the manual turn-time without escalating
    // to admin. The endpoint only writes etaMode + avgTurnTimeMinutes — both
    // are operational tuning, not a security boundary — so opening it to
    // requireHost is safe. Other settings sections (hours, voice, messaging)
    // remain admin-only via their own routes.
    r.post('/host/settings', requireHost, async (req: Request, res: Response) => {
        const body = req.body ?? {};
        const hasTurn = body.avgTurnTimeMinutes !== undefined && body.avgTurnTimeMinutes !== null;
        const hasMode = body.etaMode !== undefined && body.etaMode !== null;

        if (!hasTurn && !hasMode) {
            res.status(400).json({ error: 'provide avgTurnTimeMinutes, etaMode, or both' });
            return;
        }

        try {
            if (hasTurn) {
                await setAvgTurnTime(loc(req), Number(body.avgTurnTimeMinutes));
            }
            if (hasMode) {
                await setEtaMode(loc(req), body.etaMode as EtaMode);
            }
            const info = await getEffectiveTurnTime(loc(req));
            res.json({
                avgTurnTimeMinutes: info.manualMinutes,
                etaMode: info.mode,
                effectiveMinutes: info.effectiveMinutes,
                dynamicMinutes: info.dynamicMinutes,
                sampleSize: info.sampleSize,
                fellBackToManual: info.fellBackToManual,
            });
        } catch (err) {
            if (err instanceof Error && err.message.startsWith('avgTurnTimeMinutes')) {
                res.status(400).json({ error: err.message, field: 'avgTurnTimeMinutes' });
                return;
            }
            if (err instanceof Error && err.message.startsWith('etaMode')) {
                res.status(400).json({ error: err.message, field: 'etaMode' });
                return;
            }
            dbError(res, err);
        }
    });

    return r;
}

// Backward-compatible wrapper that delegates to the structured `emitDbError`
// helper so existing callers (~30 sites in this file) keep their two-arg
// signature while the response gains a `code` field and the log line gains
// route attribution. New code can call `emitDbError` directly to specify a
// route or a non-default code.
function dbError(res: Response, err: unknown, route?: string): void {
    emitDbError({ res, err, code: 'db_throw', route });
}

/**
 * Plain-text body for the staff-invite email. Hospitality tone — this is the
 * recipient's first touch with OSH so it should sound warm, not transactional.
 */
function buildStaffInviteEmail(input: {
    inviteeName: string;
    locationId: string;
    role: string;
    link: string;
}): string {
    const greeting = input.inviteeName ? `Hi ${input.inviteeName},` : 'Hi,';
    return [
        greeting,
        '',
        `You've been invited to join ${input.locationId} on OSH (the host-stand and front-desk app) as a ${input.role}.`,
        '',
        `Tap the link below to accept and set up your account:`,
        input.link,
        '',
        `If you weren't expecting this, you can safely ignore the email — the invite expires automatically.`,
        '',
        '— The OSH team',
    ].join('\n');
}

function buildInviteDeliveryMessage(email: string, delivery: EmailResult): string {
    if (delivery.delivered) {
        return `Invite email sent to ${email}.`;
    }
    switch (delivery.reason) {
        case 'missing_connection_string':
        case 'missing_sender':
            return `Invite created for ${email}, but email delivery is not configured in this environment.`;
        case 'acs_client_unavailable':
            return `Invite created for ${email}, but the email service is unavailable in this environment.`;
        default:
            return `Invite created for ${email}, but the email could not be sent (${delivery.reason}).`;
    }
}
