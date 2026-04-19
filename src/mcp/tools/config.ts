// ============================================================================
// SKB MCP tools — config/admin surface
// ============================================================================
//
// These tools mirror the admin.html workspace so an AI agent can drive the
// same flows an owner/admin drives in the browser:
//   · Menu builder (get/set the structured menu)
//   · Visit config (Door QR routing)
//   · Site config (address / hours / public host — the restaurant profile)
//   · Voice config (IVR / front-desk phone)
//   · Website config (template + content — image upload stays UI-only)
//   · Device PIN (get / set, 4–6 digits)
//   · Google Business Profile (status / sync / disconnect; connect requires
//     the browser OAuth round-trip and is deliberately not exposed)
//
// MCP auth is PIN-based (bearer = host PIN), so all of these tools run with
// the same privilege as a PIN-unlocked admin tablet. The schemas track the
// HTTP route validators in src/routes/host.ts and src/services/locations.ts.
// ============================================================================

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { McpAuthContext } from '../auth.js';
import {
    getLocation,
    updateLocationVisitConfig,
    updateLocationVoiceConfig,
    updateLocationSiteConfig,
    updateLocationWebsiteConfig,
    updateLocationMenu,
    DEFAULT_WEBSITE_TEMPLATE,
} from '../../services/locations.js';
import { getDb, locations as locationsColl } from '../../core/db/mongo.js';
import {
    getTokenFor,
    deleteTokenFor,
    toPublicGoogleToken,
    areCredentialsConfigured,
    pushToGbp,
} from '../../services/googleBusiness.js';
import type { LocationMenu, WebsiteTemplateKey, LocationContent } from '../../types/queue.js';

function ok(data: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
function err(message: string) {
    return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

// Shared schemas — match the client-side validators + `src/services/locations.ts` caps.
const menuItemSchema = z.object({
    id: z.string().min(1).max(40),
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    price: z.string().max(40).optional(),
});
const menuSectionSchema = z.object({
    id: z.string().min(1).max(40),
    title: z.string().min(1).max(80),
    items: z.array(menuItemSchema).max(60),
});
const menuSchema = z.object({
    sections: z.array(menuSectionSchema).max(20),
});

const addressSchema = z.object({
    street: z.string().max(120),
    city: z.string().max(80),
    state: z.string().length(2),
    zip: z.string().max(10),
});
const dayHoursSchema = z.object({
    closed: z.boolean().optional(),
    lunchOpen: z.string().optional(),
    lunchClose: z.string().optional(),
    dinnerOpen: z.string().optional(),
    dinnerClose: z.string().optional(),
});
const weeklyHoursSchema = z.object({
    mon: dayHoursSchema.optional(),
    tue: dayHoursSchema.optional(),
    wed: dayHoursSchema.optional(),
    thu: dayHoursSchema.optional(),
    fri: dayHoursSchema.optional(),
    sat: dayHoursSchema.optional(),
    sun: dayHoursSchema.optional(),
});

const websiteContentSchema = z.object({
    heroHeadline: z.string().max(120).optional(),
    heroSubhead: z.string().max(200).optional(),
    about: z.string().max(2000).optional(),
    contactEmail: z.string().email().optional(),
    instagramHandle: z.string().max(32).optional(),
    reservationsNote: z.string().max(200).optional(),
    knownFor: z.array(z.object({
        title: z.string().max(60),
        desc: z.string().max(280),
        // Image upload is UI-only (multipart/base64); MCP accepts
        // pre-existing URL strings. Use the web admin to add images.
        image: z.string().url().optional(),
    })).max(3).optional(),
});

export function registerConfigTools(server: McpServer, getCtx: () => McpAuthContext): void {
    // ─── Menu ──────────────────────────────────────────────────────────
    server.tool(
        'get_menu',
        'Read the structured menu (sections + items with name/description/price). Also returns the legacy `menuUrl` fallback if set.',
        z.object({}).shape,
        async () => {
            const ctx = getCtx();
            const loc = await getLocation(ctx.locationId);
            if (!loc) return err('location not found');
            return ok({
                menu: loc.menu ?? { sections: [] },
                menuUrl: loc.menuUrl ?? '',
            });
        },
    );

    server.tool(
        'set_menu',
        'Replace the entire structured menu. Pass `null` to clear and fall back to the `menuUrl` external link. Section and item ids are client-minted short strings; re-use existing ids to preserve stable ordering.',
        z.object({
            menu: z.union([menuSchema, z.null()]),
        }).shape,
        async ({ menu }) => {
            const ctx = getCtx();
            try {
                const updated = await updateLocationMenu(ctx.locationId, menu as LocationMenu | null);
                return ok({ ok: true, menu: updated.menu ?? { sections: [] } });
            } catch (e) {
                return err((e as Error).message);
            }
        },
    );

    // ─── Visit config (Door QR routing) ────────────────────────────────
    server.tool(
        'get_visit_config',
        'Read the Door QR routing config: visitMode (auto/queue/menu/closed), menuUrl fallback, closedMessage.',
        z.object({}).shape,
        async () => {
            const ctx = getCtx();
            const loc = await getLocation(ctx.locationId);
            if (!loc) return err('location not found');
            return ok({
                visitMode: loc.visitMode ?? 'auto',
                menuUrl: loc.menuUrl ?? '',
                closedMessage: loc.closedMessage ?? '',
            });
        },
    );
    server.tool(
        'set_visit_config',
        'Update Door QR routing. `visitMode` ∈ {auto,queue,menu,closed}. `menuUrl` is used in menu + auto modes. `closedMessage` shows in closed mode. Pass only the fields you want to change.',
        z.object({
            visitMode: z.enum(['auto', 'queue', 'menu', 'closed']).optional(),
            menuUrl: z.string().url().nullable().optional(),
            closedMessage: z.string().max(280).nullable().optional(),
        }).shape,
        async (update) => {
            const ctx = getCtx();
            try {
                const u = await updateLocationVisitConfig(ctx.locationId, update);
                return ok({
                    visitMode: u.visitMode ?? 'auto',
                    menuUrl: u.menuUrl ?? '',
                    closedMessage: u.closedMessage ?? '',
                });
            } catch (e) {
                return err((e as Error).message);
            }
        },
    );

    // ─── Site config (profile: address / hours / public host) ──────────
    server.tool(
        'get_site_config',
        'Read the restaurant profile: address, weekly hours, publicHost (vanity domain). This is what drives the public website, IVR greeting, and Google Business sync.',
        z.object({}).shape,
        async () => {
            const ctx = getCtx();
            const loc = await getLocation(ctx.locationId);
            if (!loc) return err('location not found');
            return ok({
                address: loc.address ?? null,
                hours: loc.hours ?? null,
                publicHost: loc.publicHost ?? null,
            });
        },
    );
    server.tool(
        'set_site_config',
        'Update the restaurant profile. Pass only fields you want to change. Set a field to null to clear it.',
        z.object({
            address: addressSchema.nullable().optional(),
            hours: weeklyHoursSchema.nullable().optional(),
            publicHost: z.string().max(120).nullable().optional(),
        }).shape,
        async (update) => {
            const ctx = getCtx();
            try {
                // updateLocationSiteConfig calls validateSiteConfigUpdate internally
                // — safe to cast through the Zod output.
                const u = await updateLocationSiteConfig(
                    ctx.locationId,
                    update as unknown as Parameters<typeof updateLocationSiteConfig>[1],
                );
                return ok({
                    address: u.address ?? null,
                    hours: u.hours ?? null,
                    publicHost: u.publicHost ?? null,
                });
            } catch (e) {
                return err((e as Error).message);
            }
        },
    );

    // ─── Voice config (IVR) ────────────────────────────────────────────
    server.tool(
        'get_voice_config',
        'Read the IVR / phone-entry config: voiceEnabled, frontDeskPhone, voiceLargePartyThreshold.',
        z.object({}).shape,
        async () => {
            const ctx = getCtx();
            const loc = await getLocation(ctx.locationId);
            if (!loc) return err('location not found');
            return ok({
                voiceEnabled: loc.voiceEnabled ?? false,
                frontDeskPhone: loc.frontDeskPhone ?? '',
                voiceLargePartyThreshold: loc.voiceLargePartyThreshold ?? 10,
            });
        },
    );
    server.tool(
        'set_voice_config',
        'Update the IVR config. `frontDeskPhone` is 10 digits, US-only; large-party threshold gates the "transfer to host" branch.',
        z.object({
            voiceEnabled: z.boolean().optional(),
            frontDeskPhone: z.string().nullable().optional(),
            voiceLargePartyThreshold: z.number().int().min(6).max(20).optional(),
        }).shape,
        async (update) => {
            const ctx = getCtx();
            try {
                const u = await updateLocationVoiceConfig(ctx.locationId, update);
                return ok({
                    voiceEnabled: u.voiceEnabled ?? false,
                    frontDeskPhone: u.frontDeskPhone ?? '',
                    voiceLargePartyThreshold: u.voiceLargePartyThreshold ?? 10,
                });
            } catch (e) {
                return err((e as Error).message);
            }
        },
    );

    // ─── Website config (template + content, no image upload) ──────────
    server.tool(
        'get_website_config',
        'Read the website template key + structured content (hero, about, contact, signature dishes with existing image URLs).',
        z.object({}).shape,
        async () => {
            const ctx = getCtx();
            const loc = await getLocation(ctx.locationId);
            if (!loc) return err('location not found');
            return ok({
                websiteTemplate: loc.websiteTemplate ?? DEFAULT_WEBSITE_TEMPLATE,
                content: loc.content ?? null,
            });
        },
    );
    server.tool(
        'set_website_config',
        'Update the website template + content. Images in `knownFor` must be pre-existing URLs — upload new images via the browser admin.',
        z.object({
            websiteTemplate: z.enum(['saffron', 'slate']).optional(),
            content: websiteContentSchema.nullable().optional(),
        }).shape,
        async (update) => {
            const ctx = getCtx();
            try {
                const u = await updateLocationWebsiteConfig(ctx.locationId, {
                    websiteTemplate: update.websiteTemplate as WebsiteTemplateKey | undefined,
                    content: (update.content ?? null) as LocationContent | null,
                });
                return ok({
                    websiteTemplate: u.websiteTemplate ?? DEFAULT_WEBSITE_TEMPLATE,
                    content: u.content ?? null,
                });
            } catch (e) {
                return err((e as Error).message);
            }
        },
    );

    // ─── Device PIN (read / set) ───────────────────────────────────────
    server.tool(
        'get_device_pin',
        'Read the 4–6 digit host PIN. Used in the admin Device PIN card; treat as a secret.',
        z.object({}).shape,
        async () => {
            const ctx = getCtx();
            const loc = await getLocation(ctx.locationId);
            if (!loc) return err('location not found');
            return ok({ pin: loc.pin ?? '' });
        },
    );
    server.tool(
        'set_device_pin',
        'Set a new host PIN (4–6 digits). Does not auto-logout existing tablet sessions, but future unlocks require the new value.',
        z.object({
            pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4–6 digits'),
        }).shape,
        async ({ pin }) => {
            const ctx = getCtx();
            try {
                const db = await getDb();
                const r = await locationsColl(db).findOneAndUpdate(
                    { _id: ctx.locationId },
                    { $set: { pin } },
                    { returnDocument: 'after' },
                );
                if (!r) return err('location not found');
                return ok({ ok: true });
            } catch (e) {
                return err((e as Error).message);
            }
        },
    );

    // ─── Google Business Profile (status / sync / disconnect) ──────────
    // Connect flow is deliberately NOT exposed — it requires a browser
    // OAuth round-trip. Use the admin UI Integrations tab to connect.
    server.tool(
        'get_google_status',
        'Read the Google Business Profile connection state for this tenant: whether OAuth credentials are configured on the server, whether this tenant is connected, linked location resource name (if any), last sync time/error.',
        z.object({}).shape,
        async () => {
            const ctx = getCtx();
            const credsConfigured = areCredentialsConfigured();
            if (!credsConfigured) return ok({ credsConfigured: false, connected: false });
            const token = await getTokenFor(ctx.locationId);
            if (!token) return ok({ credsConfigured: true, connected: false });
            return ok({ credsConfigured: true, connected: true, ...toPublicGoogleToken(token) });
        },
    );
    server.tool(
        'google_disconnect',
        'Disconnect Google Business Profile for this tenant. Revokes the stored refresh token on Google\'s side and deletes the local row. Hours / phone / description stop syncing until the owner reconnects.',
        z.object({}).shape,
        async () => {
            const ctx = getCtx();
            try {
                await deleteTokenFor(ctx.locationId);
                return ok({ ok: true });
            } catch (e) {
                return err((e as Error).message);
            }
        },
    );
    server.tool(
        'google_sync',
        'Push the current restaurant profile (hours, phone, description) to the linked Google Business Profile location. No-op if not connected or not linked yet.',
        z.object({}).shape,
        async () => {
            const ctx = getCtx();
            try {
                const result = await pushToGbp(ctx.locationId);
                return ok(result);
            } catch (e) {
                return err((e as Error).message);
            }
        },
    );
}
