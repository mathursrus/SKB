// ============================================================================
// SKB - MCP Server + REST API + static UI
// ============================================================================
// - /health, /health/db            (health routes)
// - /api/queue/*                   (diner-facing)
// - /api/host/*                    (host-stand, PIN-gated)
// - /mcp                           (JSON-RPC 2.0 MCP endpoint, tools)
// - static /*                      (public/ served as-is)
// ============================================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express, { type Request, type Response } from 'express';

import { getPort } from './core/utils/git-utils.js';
import { fileIssue } from './issues.js';
import { queueRouter } from './routes/queue.js';
import { hostRouter } from './routes/host.js';
import { healthRouter } from './routes/health.js';
import { renderQueuePage } from './services/queue-template.js';

const SERVER_NAME = 'skb-mcp';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Health + REST
app.use(healthRouter(SERVER_NAME));
app.use('/api', queueRouter());
app.use('/api', hostRouter());

// Server-side rendered queue page (JSON-LD + meta tags injected from live queue state)
app.get(['/queue.html', '/queue'], async (_req: Request, res: Response) => {
    try {
        const html = await renderQueuePage();
        res.type('html').send(html);
    } catch (err) {
        console.error('[MCP Server] queue template error:', err);
        res.status(500).send('Internal server error');
    }
});

// Static assets (queue.js, styles.css, host.html, host.js, etc.)
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
// Start
// ----------------------------------------------------------------------------
const port = getPort();
app.listen(port, () => {
    console.log(`[MCP Server] ${SERVER_NAME}@${SERVER_VERSION} running on port ${port}`);
    console.log(`[MCP Server] Health: http://localhost:${port}/health`);
    console.log(`[MCP Server] Diner:  http://localhost:${port}/queue.html`);
    console.log(`[MCP Server] Host:   http://localhost:${port}/host.html`);
});
