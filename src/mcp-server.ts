// ============================================================================
// SKB - MCP Server + REST API + static UI (multi-tenant)
// ============================================================================
// URL structure:
//   /r/:loc/queue.html          — diner page for location :loc
//   /r/:loc/host.html           — host-stand for location :loc
//   /r/:loc/api/queue/*         — diner API
//   /r/:loc/api/host/*          — host API (PIN-gated per location)
//   /health, /health/db         — global health
//   /mcp                        — MCP JSON-RPC
//   /                           — landing page (lists locations)
// ============================================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express, { type Request, type Response } from 'express';

import { getPort } from './core/utils/git-utils.js';
import { handleMcpRequest } from './mcp/server.js';
import { queueRouter } from './routes/queue.js';
import { hostRouter } from './routes/host.js';
import { healthRouter } from './routes/health.js';
import { voiceRouter } from './routes/voice.js';
import { smsRouter, smsStatusRouter } from './routes/sms.js';
import { authRouter } from './routes/auth.js';
import { signupRouter } from './routes/signup.js';
import { onboardingRouter } from './routes/onboarding.js';
import { googleRouter } from './routes/google.js';
import { renderQueuePage } from './services/queue-template.js';
import { resolveVisit } from './services/visit-page.js';
import { listLocations, ensureLocation, getLocation } from './services/locations.js';
import { renderSitePage, type TemplatePageKey } from './services/site-renderer.js';

const SERVER_NAME = 'skb-mcp';
const SERVER_VERSION = '0.2.0';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));  // Twilio sends form-encoded webhooks

// ─── Host-header rewrite for per-location public websites (issue #45) ────
// If a request arrives with a Host header matching a per-location
// `publicHost` field (e.g. Host: skbbellevue.com), rewrite the URL to
// prepend `/r/:loc/` so it hits the normal per-location route. This is
// what lets `skbbellevue.com/menu` serve the new menu page without a
// separate reverse proxy. The middleware is early in the chain so it
// runs before any static-file matching.
//
// Idempotent: requests that already start with /r/, /api, /mcp,
// /health, or the backward-compat /queue routes are left alone.
//
// The location lookup is cached in-memory for 60 seconds so every
// request doesn't hit the DB; this keeps the fast path fast.
const hostRewriteCache = new Map<string, { loc: string | null; expiresAt: number }>();
app.use(async (req: Request, _res: Response, next: () => void) => {
    const hostHeader = String(req.headers.host ?? '').toLowerCase().split(':')[0];
    if (!hostHeader) { next(); return; }
    // Leave already-prefixed and API/system paths alone.
    if (
        req.url.startsWith('/r/')
        || req.url.startsWith('/api')
        || req.url.startsWith('/mcp')
        || req.url.startsWith('/health')
        || req.url.startsWith('/assets/')
        || req.url === '/queue'
        || req.url === '/queue.html'
        || req.url === '/'
    ) {
        // Note: '/' itself is handled below so it can be rewritten on the
        // specific host. Fall through to the cache check.
        if (req.url !== '/') { next(); return; }
    }
    try {
        const now = Date.now();
        let cached = hostRewriteCache.get(hostHeader);
        if (!cached || cached.expiresAt < now) {
            const all = await listLocations();
            const match = all.find(l => (l.publicHost ?? '').toLowerCase() === hostHeader);
            cached = { loc: match ? match._id : null, expiresAt: now + 60_000 };
            hostRewriteCache.set(hostHeader, cached);
        }
        if (cached.loc) {
            const prefix = `/r/${cached.loc}`;
            if (req.url === '/') {
                req.url = `${prefix}/home.html`;
            } else if (!req.url.startsWith(prefix)) {
                req.url = `${prefix}${req.url}`;
            }
        }
    } catch {
        // DB unavailable — fall through without rewriting. Home / menu / etc.
        // will 404 through the static middleware, which is the right
        // degraded-mode behavior.
    }
    next();
});

// Global health
app.use(healthRouter(SERVER_NAME));

// Per-tenant site assets (signature dish photos, hero images) — mounted at a
// tenant-agnostic root so URLs work under host-rewritten domains and under
// the platform domain alike. Files live under public/assets/<slug>/<kind>/…
// and are written by the website-config POST handler.
app.use('/assets', express.static(path.join(publicDir, 'assets'), {
    maxAge: '7d',
    immutable: true,
    fallthrough: false,
}));

// Platform-level auth (issue #53): unified named-user login, logout,
// whoami, password reset. Lives at /api/* (no :loc prefix) because the
// login URL is shared across tenants — the cookie it mints IS
// tenant-scoped (encodes `lid`), the URL is not.
app.use('/api', authRouter());
app.use('/api', signupRouter());

// Per-location onboarding endpoints (issue #54). Mounted at /r/:loc/api/
// so requireRole can extract the `loc` param and enforce tenant scoping.
app.use('/r/:loc/api', onboardingRouter());

// Google Business Profile OAuth + sync (issue #51 Phase D). Mounted at the
// same per-location prefix so the tenant-binding check in requireRole
// applies. The OAuth callback inside is intentionally public but validates
// state + a PKCE cookie scoped to /r/:loc/api/google/oauth/.
app.use('/r/:loc/api', googleRouter());

// Friendly URLs for the public auth pages — /login and /reset-password
// without `.html`. Spec §6.4: the marketing domain entry point is
// `app.example.com/login`.
app.get('/login', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, 'login.html'));
});
app.get('/reset-password', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, 'reset-password.html'));
});
app.get('/signup', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, 'signup.html'));
});

// Static JSON catalog of available website templates — spec #51 §8.5.
// Public (no auth): just a hint surface for the admin template picker and
// future clients. Keys map to the site-renderer's TemplateKey union.
const TEMPLATE_CATALOG = [
    { key: 'saffron', name: 'Saffron', fit: 'Warm, casual, neighborhood-spot energy.' },
    { key: 'slate', name: 'Slate', fit: 'Modern, considered, cocktail-forward.' },
];
app.get('/templates', (_req: Request, res: Response) => {
    res.json({ templates: TEMPLATE_CATALOG });
});
// Issue #55: accept-invite landing page — clicked from an emailed link.
app.get('/accept-invite', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, 'accept-invite.html'));
});

// Marketing landing — naked '/' on the platform domain (issue #57).
// The host-rewrite middleware above already handles the custom-domain
// case: if the incoming Host matches a location's `publicHost` (e.g.
// skbbellevue.com), the URL is rewritten to `/r/{loc}/home.html` before
// we ever reach this handler. So when this route fires, we know the
// visitor is on a naked/platform domain — serve the marketing page.
app.get('/', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, 'landing.html'));
});

// Operator console — legacy locations-list page, now gated behind
// SKB_OPERATOR_CONSOLE=true (issue #57, spec §5 non-goals — no in-app
// super-admin view for v1). When the flag is off, the route 404s so it
// doesn't surface in crawls or accidental visits. The operator still
// manages the platform through MongoDB / MCP tools.
if (process.env.SKB_OPERATOR_CONSOLE === 'true') {
    app.get('/admin/locations', async (_req: Request, res: Response) => {
        try {
            const locs = await listLocations();
            const links = locs.map(l => `<li><a href="/r/${l._id}/queue.html">${l.name}</a> — <a href="/r/${l._id}/host.html">Host</a> · <a href="/r/${l._id}/admin.html">Admin</a></li>`).join('\n');
            res.type('html').send(`<!doctype html><html><head><title>OSH — Operator Console</title><link href="https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;600;700&display=swap" rel="stylesheet"><style>body{font-family:'Fira Sans',sans-serif;max-width:600px;margin:40px auto;padding:0 20px}h1{font-size:24px}li{margin:8px 0;font-size:16px}a{color:#b45309}</style></head><body><h1>OSH &mdash; Operator Console</h1><p style="color:#78716c;font-size:14px">All configured restaurants. Operator-only.</p><ul>${links || '<li>No locations configured.</li>'}</ul></body></html>`);
        } catch {
            res.status(503).send('Service unavailable');
        }
    });
    console.log('[MCP Server] Operator console enabled at /admin/locations');
}

// Per-location routes: /r/:loc/...
app.use('/r/:loc/api', queueRouter());
app.use('/r/:loc/api', hostRouter());
app.use('/r/:loc/api', smsRouter()); // inbound SMS webhook (Twilio)
app.use('/api', smsStatusRouter()); // outbound SMS delivery statusCallback (Twilio, tenant-global)
// Voice IVR routes (conditionally enabled)
if (process.env.TWILIO_VOICE_ENABLED === 'true') {
    app.use('/r/:loc/api', voiceRouter());
    console.log('[MCP Server] Voice IVR enabled');
}

// Server-side rendered queue page per location
app.get('/r/:loc/queue.html', async (req: Request, res: Response) => {
    try {
        const html = await renderQueuePage(String(req.params.loc));
        res.type('html').send(html);
    } catch (err) {
        console.error('[MCP Server] queue template error:', err);
        res.status(500).send('Internal server error');
    }
});

/**
 * `/r/:loc/visit` — the stable URL printed on the door QR. Routes the
 * scanner to whatever the restaurant has currently configured (queue,
 * menu, or a "we're closed" page) without ever having to reprint the
 * sticker. See src/services/visit-page.ts for the decision logic.
 *
 * Mounted at the top level (not under /r/:loc/api/) so the printed URL
 * stays short and human-readable.
 */
app.get('/r/:loc/visit', async (req: Request, res: Response) => {
    const locationId = String(req.params.loc);
    try {
        const decision = await resolveVisit(locationId);
        if (decision.kind === 'redirect') {
            res.redirect(302, decision.url ?? `/r/${locationId}/queue.html`);
            return;
        }
        res.type('html').send(decision.html ?? '');
    } catch (err) {
        console.error('[MCP Server] visit route error:', err);
        res.status(503).send('Service temporarily unavailable');
    }
});

// ─── Per-location public website routes (issue #45 + #56) ─────────────
// Friendly URLs for the replacement skbbellevue.com pages. `/r/:loc/` is
// the home page; other pages are /menu, /about, /hours, /contact. Each
// request picks the right template (`saffron` vs `slate`) based on the
// location's `websiteTemplate` field and substitutes structured content
// into the template HTML. See src/services/site-renderer.ts.
const SITE_PAGE_MAP: Record<string, TemplatePageKey> = {
    '': 'home',
    'menu': 'menu',
    'about': 'about',
    'hours': 'hours',
    'contact': 'contact',
};

function servePage(pageKey: TemplatePageKey) {
    return async (req: Request, res: Response) => {
        try {
            const locationId = String(req.params.loc);
            const location = await getLocation(locationId);
            if (!location) {
                res.status(404).type('text/plain').send('Location not found');
                return;
            }
            const html = await renderSitePage(publicDir, location, pageKey);
            if (html === null) {
                res.status(404).type('text/plain').send('Page not found');
                return;
            }
            res.type('html').send(html);
        } catch (err) {
            console.error('[MCP Server] site render error:', err);
            res.status(500).send('Internal server error');
        }
    };
}

for (const [route, pageKey] of Object.entries(SITE_PAGE_MAP)) {
    const url = route ? `/r/:loc/${route}` : '/r/:loc';
    app.get(url, servePage(pageKey));
}

// Static assets — served under /r/:loc/ so JS fetch() calls use relative paths
app.use('/r/:loc', express.static(publicDir));

// Backward-compat: /api/* routes default to location "skb"
app.use('/api', (req: Request, _res: Response, next: () => void) => {
    req.params.loc = 'skb';
    next();
}, queueRouter());
app.use('/api', (req: Request, _res: Response, next: () => void) => {
    req.params.loc = 'skb';
    next();
}, hostRouter());

// Backward-compat: old /queue.html defaults to skb
app.get(['/queue.html', '/queue'], async (_req: Request, res: Response) => {
    try {
        const html = await renderQueuePage('skb');
        res.type('html').send(html);
    } catch (err) {
        res.status(500).send('Internal server error');
    }
});
app.use(express.static(publicDir));

// ----------------------------------------------------------------------------
// MCP endpoint — streamable HTTP transport, PIN-Bearer auth per request.
// All tool registration + dispatch lives in src/mcp/server.ts; this file
// just mounts the handler.
//
// Only POST is supported — this is stateless mode, so there is no session
// for a GET SSE stream to subscribe to and no session for DELETE to tear
// down. The spec calls for 405 here so clients can fall back cleanly
// (Anthropic's own SDK example does exactly this). Without the explicit
// 405, the SDK transport hangs on GET/DELETE and Azure eventually serves
// an HTML error page, which breaks clients with "Unexpected content type".
// ----------------------------------------------------------------------------
app.post('/mcp', handleMcpRequest);
const mcpMethodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).set('Allow', 'POST').json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed. Use POST.' },
        id: null,
    });
};
app.get('/mcp', mcpMethodNotAllowed);
app.delete('/mcp', mcpMethodNotAllowed);

// ----------------------------------------------------------------------------
// Bootstrap default locations + start
// ----------------------------------------------------------------------------
const port = getPort();

async function bootstrap(): Promise<void> {
    // Ensure the default SKB location exists
    await ensureLocation('skb', 'Shri Krishna Bhavan', process.env.SKB_HOST_PIN ?? '1234');
}

bootstrap().then(() => {
    app.listen(port, () => {
        console.log(`[MCP Server] ${SERVER_NAME}@${SERVER_VERSION} running on port ${port}`);
        console.log(`[MCP Server] Landing: http://localhost:${port}/`);
        console.log(`[MCP Server] SKB:     http://localhost:${port}/r/skb/queue.html`);
    });
}).catch((err) => {
    console.error('[MCP Server] bootstrap failed:', err);
    process.exit(1);
});
