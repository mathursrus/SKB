// ============================================================================
// SKB - Host-stand routes (PIN-gated) — multi-tenant
// ============================================================================

import { Router, type Request, type Response } from 'express';

import { callParty, joinQueue, listHostQueue, removeFromQueue, logCallDial } from '../services/queue.js';
import { sendChatMessage, getChatThread, markThreadRead } from '../services/chat.js';
import {
    chatAlmostReadyMessage,
    chatNeedMoreTimeMessage,
    chatLostYouMessage,
} from '../services/smsTemplates.js';
import {
    advanceParty,
    listCompletedParties,
    listDiningParties,
    getPartyTimeline,
} from '../services/dining.js';
import { getAvgTurnTime, getEffectiveTurnTime, setAvgTurnTime, setEtaMode } from '../services/settings.js';
import type { EtaMode } from '../types/queue.js';
import { getHostStats } from '../services/stats.js';
import { getAnalytics } from '../services/analytics.js';
import {
    getLocation,
    updateLocationVisitConfig,
    updateLocationVoiceConfig,
    updateLocationSiteConfig,
    updateLocationWebsiteConfig,
    updateLocationMenu,
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
import { getDb, memberships as membershipsColl, locations as locationsColl } from '../core/db/mongo.js';
import { timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';

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

export function hostRouter(): Router {
    const r = Router({ mergeParams: true });

    // Login — uses per-location PIN from locations collection, falls back to env var.
    r.post('/host/login', async (req: Request, res: Response) => {
        const key = cookieSecret();
        if (!key) { res.status(503).json({ error: 'host auth not configured' }); return; }

        const location = await getLocation(loc(req));
        const expectedPin = location?.pin ?? process.env.SKB_HOST_PIN ?? null;
        if (!expectedPin) { res.status(503).json({ error: 'host auth not configured' }); return; }

        const provided = String(req.body?.pin ?? '');
        if (!provided) { res.status(400).json({ error: 'pin required', field: 'pin' }); return; }

        const a = Buffer.from(provided);
        const b = Buffer.from(expectedPin);
        let ok = false;
        if (a.length === b.length) { try { ok = timingSafeEqual(a, b); } catch { ok = false; } }

        if (!ok) {
            console.log(JSON.stringify({ t: new Date().toISOString(), level: 'warn', msg: 'host.auth.fail', loc: loc(req), ip: req.ip }));
            res.status(401).json({ error: 'invalid pin' });
            return;
        }

        const lid = loc(req);
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
    // authenticated and shouldn't be throttled during a rush) and without the
    // auto confirmation SMS (the host is physically present — they can hand
    // the party the code on paper, or tap Notify later).
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
            const proto = req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https';
            const fallbackHost = req.headers['x-forwarded-host'] ?? req.headers.host ?? '';
            const host = location?.publicHost || String(fallbackHost);
            if (!host) {
                res.status(503).type('text/plain').send('no host configured');
                return;
            }
            // If publicHost is set, encode the top-level /visit URL so the
            // domain alone is on the sticker. Otherwise fall back to the
            // per-location /r/:loc/visit path on the app service hostname.
            const url = location?.publicHost
                ? `https://${host}/visit`
                : `${proto}://${host}/r/${loc(req)}/visit`;
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
    // frontDeskPhone, voiceLargePartyThreshold. The press-0 transfer branch
    // added in issue #45 dials whatever `frontDeskPhone` the owner has
    // saved here.
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
                voiceLargePartyThreshold: location?.voiceLargePartyThreshold ?? 10,
            });
        } catch (err) { dbError(res, err); }
    });

    r.post('/host/voice-config', requireAdmin, async (req: Request, res: Response) => {
        const body = (req.body ?? {}) as {
            voiceEnabled?: unknown;
            frontDeskPhone?: unknown;
            voiceLargePartyThreshold?: unknown;
        };
        try {
            const updated = await updateLocationVoiceConfig(loc(req), {
                voiceEnabled: body.voiceEnabled === undefined ? undefined : Boolean(body.voiceEnabled),
                frontDeskPhone: body.frontDeskPhone === undefined ? undefined : (body.frontDeskPhone === null ? null : String(body.frontDeskPhone)),
                voiceLargePartyThreshold: body.voiceLargePartyThreshold === undefined ? undefined : Number(body.voiceLargePartyThreshold),
            });
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'host.voice_config.updated',
                loc: loc(req),
                voiceEnabled: updated.voiceEnabled ?? (process.env.TWILIO_VOICE_ENABLED === 'true'),
                frontDeskPhoneSet: !!updated.frontDeskPhone,
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
                voiceLargePartyThreshold: updated.voiceLargePartyThreshold ?? 10,
            });
        } catch (err) {
            if (err instanceof Error && (
                err.message.startsWith('frontDeskPhone') || err.message.startsWith('voiceLargePartyThreshold')
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
        } catch (err) { dbError(res, err); }
    });

    r.post('/staff/invite', requireOwner, async (req: Request, res: Response) => {
        const body = (req.body ?? {}) as { email?: unknown; name?: unknown; role?: unknown };
        const email = typeof body.email === 'string' ? body.email : '';
        const name = typeof body.name === 'string' ? body.name : '';
        const role = typeof body.role === 'string' ? body.role : '';
        if (!isInvitableRole(role)) {
            res.status(400).json({ error: 'role must be admin or host', field: 'role' });
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
            // Dev-mode log: the invite link. A real mailer wires in later.
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
                // Log the token in dev so tests + manual walkthroughs can
                // click through without SMTP. Production should gate this
                // line off (same trade-off as password resets).
                token,
                link,
            }));
            res.json({ invite });
        } catch (err) {
            if (err instanceof Error) {
                const msg = err.message;
                if (msg === 'already a member'
                    || msg === 'role must be admin or host'
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

    r.post('/host/settings', requireAdmin, async (req: Request, res: Response) => {
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

function dbError(res: Response, err: unknown): void {
    console.log(JSON.stringify({ t: new Date().toISOString(), level: 'error', msg: 'db.error', detail: err instanceof Error ? err.message : String(err) }));
    res.status(503).json({ error: 'temporarily unavailable' });
}
