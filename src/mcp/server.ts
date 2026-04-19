// ============================================================================
// SKB MCP server — remote (streamable HTTP) Model Context Protocol surface
// ============================================================================
//
// Exposes the host/admin-tier operations as MCP tools so AI agents can run
// the waitlist / dining / analytics flow programmatically with the same PIN
// auth the web host stand uses.
//
// Transport: streamable HTTP, mounted at /mcp on the existing SKB Express
// app (no separate process). Authorization: Bearer <PIN> on every request.
//
// Sessions are stateless: every request re-validates the PIN. The MCP
// protocol's own session concept is still honored via Mcp-Session-Id
// round-tripping inside StreamableHTTPServerTransport, but auth is
// independent of that.
// ============================================================================

import type { Request, Response } from 'express';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { authenticateMcpRequest, type McpAuthContext } from './auth.js';
import { registerAdminTools } from './tools/admin.js';
import { registerConfigTools } from './tools/config.js';
import { registerOpsTools } from './tools/ops.js';
import { registerSeatedTools } from './tools/seated.js';
import { registerWaitingTools } from './tools/waiting.js';

const SERVER_NAME = 'skb-mcp';
const SERVER_VERSION = '0.1.0';

/**
 * Build a fresh McpServer instance + attach all tools. Each HTTP request
 * builds its own instance so the tool handlers see a per-request auth
 * context (`getCtx` closures over the request-scoped locationId).
 */
function buildMcpServer(ctx: McpAuthContext): McpServer {
    const server = new McpServer(
        { name: SERVER_NAME, version: SERVER_VERSION },
        {
            instructions:
                'OSH restaurant OS MCP. Tools are scoped to one location (default "skb"). ' +
                'list_waiting / list_seated / list_completed read the current state. ' +
                'add_party / seat_party / mark_no_show / notify_party / advance_party mutate it. ' +
                'send_chat / read_chat / mark_chat_read handle the host ↔ diner thread. ' +
                'get_stats / get_analytics drive the Ops Dashboard. get_settings / set_settings tune the ETA mode. ' +
                'Admin config: get_menu / set_menu (structured menu), get/set_visit_config (Door QR), ' +
                'get/set_site_config (address, hours, publicHost — the profile), ' +
                'get/set_voice_config (IVR), get/set_website_config (template + content), ' +
                'get_device_pin / set_device_pin (host PIN). ' +
                'Google Business: get_google_status, google_sync, google_disconnect — the OAuth connect flow requires the browser admin Integrations tab.',
        },
    );
    const getCtx = () => ctx;
    registerWaitingTools(server, getCtx);
    registerSeatedTools(server, getCtx);
    registerAdminTools(server, getCtx);
    registerConfigTools(server, getCtx);
    registerOpsTools(server);
    return server;
}

/**
 * Express handler that fronts the MCP streamable-HTTP transport.
 *
 * Pattern: each incoming POST/GET/DELETE on /mcp spawns a short-lived
 * McpServer + StreamableHTTPServerTransport pair for that one request,
 * binds them, feeds the raw IncomingMessage/ServerResponse into
 * `transport.handleRequest`, and lets the SDK drive the request/response
 * lifecycle. The SDK cleans itself up when the underlying socket closes.
 *
 * This is the "stateless" pattern from the SDK docs — which is the right
 * fit here since we already have PIN auth per request and no long-lived
 * server-side session state to cache.
 */
export async function handleMcpRequest(req: Request, res: Response): Promise<void> {
    const auth = await authenticateMcpRequest(req);
    if (!auth.ok) {
        res.status(auth.status).json({
            jsonrpc: '2.0',
            error: { code: -32001, message: auth.reason },
            id: null,
        });
        return;
    }

    const server = buildMcpServer(auth.ctx);
    // Fully stateless: `sessionIdGenerator: undefined` tells the SDK not to
    // require initialize-before-tool-call on every request. We re-auth per
    // request anyway, so session state would only get in the way.
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
    });

    res.on('close', () => {
        void transport.close();
        void server.close();
    });

    try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (err) {
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: { code: -32603, message: (err as Error).message || 'internal MCP error' },
                id: null,
            });
        }
    }
}
