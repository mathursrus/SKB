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
import { fileIssue } from './issues.js';
import { queueRouter } from './routes/queue.js';
import { hostRouter } from './routes/host.js';
import { healthRouter } from './routes/health.js';
import { voiceRouter } from './routes/voice.js';
import { smsRouter, smsStatusRouter } from './routes/sms.js';
import { renderQueuePage } from './services/queue-template.js';
import { resolveVisit } from './services/visit-page.js';
import { listLocations, ensureLocation } from './services/locations.js';

const SERVER_NAME = 'skb-mcp';
const SERVER_VERSION = '0.2.0';
const PROTOCOL_VERSION = '2024-11-05';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));  // Twilio sends form-encoded webhooks

// Global health
app.use(healthRouter(SERVER_NAME));

// Landing page — list locations
app.get('/', async (_req: Request, res: Response) => {
    try {
        const locs = await listLocations();
        const links = locs.map(l => `<li><a href="/r/${l._id}/queue.html">${l.name}</a> — <a href="/r/${l._id}/host.html">Host</a> · <a href="/r/${l._id}/analytics.html">Analytics</a></li>`).join('\n');
        res.type('html').send(`<!doctype html><html><head><title>SKB — Locations</title><link href="https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;600;700&display=swap" rel="stylesheet"><style>body{font-family:'Fira Sans',sans-serif;max-width:600px;margin:40px auto;padding:0 20px}h1{font-size:24px}li{margin:8px 0;font-size:16px}a{color:#b45309}</style></head><body><h1>SKB Waitlist</h1><ul>${links || '<li>No locations configured.</li>'}</ul></body></html>`);
    } catch {
        res.status(503).send('Service unavailable');
    }
});

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
// MCP Tool registry
// ----------------------------------------------------------------------------
type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

interface ToolDef {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    handler: ToolHandler;
}

const tools: ToolDef[] = [
    {
        name: 'file_issue',
        description: 'File a GitHub issue against mathursrus/SKB.',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string' },
                body: { type: 'string' },
                labels: { type: 'array', items: { type: 'string' } },
                dryRun: { type: 'boolean' },
            },
            required: ['title', 'body'],
        },
        handler: async (args) => {
            const result = await fileIssue({
                title: String(args.title ?? ''),
                body: String(args.body ?? ''),
                labels: Array.isArray(args.labels) ? (args.labels as string[]) : undefined,
                dryRun: Boolean(args.dryRun),
                clientAgent: 'mcp-client',
            });
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        },
    },
];

// ----------------------------------------------------------------------------
// JSON-RPC 2.0 /mcp endpoint
// ----------------------------------------------------------------------------
app.post('/mcp', async (req: Request, res: Response) => {
    const { method, params, id } = req.body as {
        method?: string;
        params?: Record<string, unknown>;
        id?: number | string;
    };

    const rpcError = (code: number, message: string, status = 200) => {
        res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id });
    };

    try {
        let result: unknown;

        switch (method) {
            case 'initialize':
                result = {
                    protocolVersion: PROTOCOL_VERSION,
                    capabilities: { tools: {} },
                    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
                };
                break;

            case 'tools/list':
                result = {
                    tools: tools.map((t) => ({
                        name: t.name,
                        description: t.description,
                        inputSchema: t.inputSchema,
                    })),
                };
                break;

            case 'tools/call': {
                const toolName = String(params?.name ?? '');
                const tool = tools.find((t) => t.name === toolName);
                if (!tool) {
                    return rpcError(-32601, `Unknown tool: ${toolName}`);
                }
                const args = (params?.arguments as Record<string, unknown>) ?? {};
                result = await tool.handler(args);
                break;
            }

            default:
                return rpcError(-32601, `Method not found: ${method}`, 400);
        }

        res.json({ jsonrpc: '2.0', result, id });
    } catch (err) {
        console.error('[MCP Server] error:', err);
        rpcError(-32603, 'Internal server error', 500);
    }
});

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
