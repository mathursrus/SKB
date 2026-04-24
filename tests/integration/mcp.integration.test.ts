// Integration tests for the MCP server — PIN Bearer auth + tool listing +
// tool call via streamable HTTP transport. Each request to /mcp is an
// isolated JSON-RPC call; the SDK handles the transport framing.

process.env.SKB_HOST_PIN ??= '1234';
process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_mcp_test';
process.env.PORT ??= '15407';
process.env.FRAIM_TEST_SERVER_PORT ??= '15407';
process.env.FRAIM_BRANCH ??= '';

import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    startTestServer,
    stopTestServer,
    getTestServerUrl,
} from '../shared-server-utils.js';

const MCP_HEADERS_JSON = {
    'Content-Type': 'application/json',
    // Streamable HTTP spec: client must advertise it accepts both
    // application/json (single-shot response) and text/event-stream.
    Accept: 'application/json, text/event-stream',
};

async function rpc(body: unknown, extraHeaders: Record<string, string> = {}) {
    return fetch(`${getTestServerUrl()}/mcp`, {
        method: 'POST',
        headers: { ...MCP_HEADERS_JSON, ...extraHeaders },
        body: JSON.stringify(body),
    });
}

const initParams = {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'mcp-integration-test', version: '1.0.0' },
};

const cases: BaseTestCase[] = [
    {
        name: 'mcp: server starts',
        tags: ['integration', 'mcp', 'setup'],
        testFn: async () => {
            await startTestServer();
            const res = await fetch(`${getTestServerUrl()}/health`);
            return res.ok;
        },
    },
    {
        name: 'mcp: missing Bearer → 401 with jsonrpc error envelope',
        tags: ['integration', 'mcp', 'auth'],
        testFn: async () => {
            const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: initParams });
            if (res.status !== 401) return false;
            const body = await res.json() as { jsonrpc?: string; error?: { code?: number } };
            return body.jsonrpc === '2.0' && body.error?.code === -32001;
        },
    },
    {
        name: 'mcp: wrong Bearer → 401',
        tags: ['integration', 'mcp', 'auth'],
        testFn: async () => {
            const res = await rpc(
                { jsonrpc: '2.0', id: 1, method: 'initialize', params: initParams },
                { Authorization: 'Bearer 0000' },
            );
            return res.status === 401;
        },
    },
    {
        name: 'mcp: initialize with valid PIN returns serverInfo',
        tags: ['integration', 'mcp', 'auth', 'initialize'],
        testFn: async () => {
            const res = await rpc(
                { jsonrpc: '2.0', id: 1, method: 'initialize', params: initParams },
                { Authorization: 'Bearer 1234' },
            );
            if (!res.ok) return false;
            const body = await res.json() as {
                result?: { serverInfo?: { name?: string }; protocolVersion?: string };
            };
            return body.result?.serverInfo?.name === 'skb-mcp'
                && typeof body.result?.protocolVersion === 'string';
        },
    },
    {
        name: 'mcp: tools/list returns all registered tools',
        tags: ['integration', 'mcp', 'tools'],
        testFn: async () => {
            // Need to initialize first to satisfy SDK protocol
            await rpc(
                { jsonrpc: '2.0', id: 1, method: 'initialize', params: initParams },
                { Authorization: 'Bearer 1234' },
            );
            const res = await rpc(
                { jsonrpc: '2.0', id: 2, method: 'tools/list' },
                { Authorization: 'Bearer 1234' },
            );
            if (!res.ok) return false;
            const body = await res.json() as { result?: { tools?: Array<{ name: string }> } };
            const names = new Set((body.result?.tools ?? []).map(t => t.name));
            const expected = [
                'list_waiting', 'add_party', 'seat_party', 'mark_no_show',
                'notify_party', 'send_chat', 'read_chat', 'mark_chat_read',
                'list_seated', 'advance_party', 'get_party_timeline',
                'list_completed', 'get_stats', 'get_analytics',
                'get_settings', 'set_settings', 'file_issue',
            ];
            return expected.every(n => names.has(n));
        },
    },
    {
        name: 'mcp: tools/call list_waiting returns queue data',
        tags: ['integration', 'mcp', 'tools', 'waitlist-path'],
        testFn: async () => {
            await rpc(
                { jsonrpc: '2.0', id: 1, method: 'initialize', params: initParams },
                { Authorization: 'Bearer 1234' },
            );
            const res = await rpc(
                {
                    jsonrpc: '2.0',
                    id: 2,
                    method: 'tools/call',
                    params: { name: 'list_waiting', arguments: {} },
                },
                { Authorization: 'Bearer 1234' },
            );
            if (!res.ok) return false;
            const body = await res.json() as {
                result?: { content?: Array<{ type: string; text: string }> };
            };
            const first = body.result?.content?.[0];
            if (first?.type !== 'text' || typeof first.text !== 'string') return false;
            // Service returns an array/object (JSON string). Must parse cleanly.
            try { JSON.parse(first.text); return true; } catch { return false; }
        },
    },
    {
        name: 'mcp: tools/call file_issue dryRun returns payload preview',
        tags: ['integration', 'mcp', 'tools', 'ops'],
        testFn: async () => {
            await rpc(
                { jsonrpc: '2.0', id: 1, method: 'initialize', params: initParams },
                { Authorization: 'Bearer 1234' },
            );
            const res = await rpc(
                {
                    jsonrpc: '2.0',
                    id: 2,
                    method: 'tools/call',
                    params: {
                        name: 'file_issue',
                        arguments: {
                            title: 'integration-test dry run',
                            body: 'from mcp integration test',
                            dryRun: true,
                        },
                    },
                },
                { Authorization: 'Bearer 1234' },
            );
            if (!res.ok) return false;
            const body = await res.json() as {
                result?: { content?: Array<{ type: string; text: string }> };
            };
            const text = body.result?.content?.[0]?.text ?? '';
            return text.includes('dry') || text.includes('preview') || text.includes('title');
        },
    },
    {
        name: 'mcp: repeated wrong Bearer PINs lock out with 429 + Retry-After',
        tags: ['integration', 'mcp', 'auth', 'security'],
        testFn: async () => {
            for (let i = 0; i < 5; i++) {
                await rpc(
                    { jsonrpc: '2.0', id: 1, method: 'initialize', params: initParams },
                    { Authorization: 'Bearer 0000' },
                );
            }
            const res = await rpc(
                { jsonrpc: '2.0', id: 1, method: 'initialize', params: initParams },
                { Authorization: 'Bearer 1234' },
            );
            return res.status === 429 && !!res.headers.get('retry-after');
        },
    },
    {
        name: 'mcp: teardown',
        tags: ['integration', 'mcp'],
        testFn: async () => { await stopTestServer(); return true; },
    },
];

void runTests(cases, 'mcp (integration)');
