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
    toPublicLocation,
} from '../services/locations.js';
import type { AnalyticsStage, LocationAddress, WeeklyHours } from '../types/queue.js';
import {
    requireRole,
    mintLocationCookie,
    HOST_COOKIE_NAME,
    HOST_COOKIE_MAX_AGE_SECONDS,
} from '../middleware/hostAuth.js';
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

    r.post('/host/visit-config', requireHost, async (req: Request, res: Response) => {
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

    r.post('/host/voice-config', requireHost, async (req: Request, res: Response) => {
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
                address: location?.address ?? null,
                hours: location?.hours ?? null,
                publicHost: location?.publicHost ?? '',
            });
        } catch (err) { dbError(res, err); }
    });

    r.post('/host/site-config', requireHost, async (req: Request, res: Response) => {
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

function dbError(res: Response, err: unknown): void {
    console.log(JSON.stringify({ t: new Date().toISOString(), level: 'error', msg: 'db.error', detail: err instanceof Error ? err.message : String(err) }));
    res.status(503).json({ error: 'temporarily unavailable' });
}
