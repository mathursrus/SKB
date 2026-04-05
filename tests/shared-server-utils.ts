// ============================================================================
// SKB - Shared Server Utils for E2E tests
// ============================================================================
// Adapted from the FRAIM scaffold reference. Uses native fetch (Node >= 18).
// ============================================================================

import { ChildProcess, spawn } from 'node:child_process';
import * as net from 'node:net';

import { getPort } from '../src/core/utils/git-utils.js';

export function getTestServerUrl(): string {
    return (
        process.env.FRAIM_TEST_SERVER_URL ||
        `http://localhost:${getTestServerPort()}`
    );
}

export function getTestServerPort(): number {
    if (process.env.FRAIM_TEST_SERVER_PORT) {
        return parseInt(process.env.FRAIM_TEST_SERVER_PORT, 10);
    }
    return getPort();
}

/** Returns true if another process already holds the port. */
export function isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(true));
        server.once('listening', () => {
            server.close();
            resolve(false);
        });
        server.listen(port);
    });
}

let serverProcess: ChildProcess | null = null;

export async function startTestServer(): Promise<void> {
    const port = getTestServerPort();

    if (await isPortInUse(port)) {
        console.log(`[E2E] Server already running on port ${port}; reusing.`);
        return;
    }

    serverProcess = spawn('npx', ['tsx', 'src/mcp-server.ts'], {
        env: { ...process.env, PORT: String(port) },
        stdio: 'pipe',
        shell: process.platform === 'win32',
    });

    serverProcess.stdout?.on('data', (d) => process.stdout.write(`[server] ${d}`));
    serverProcess.stderr?.on('data', (d) => process.stderr.write(`[server] ${d}`));

    await waitForServer(15000);
    console.log(`[E2E] Server started on port ${port}`);
}

export async function stopTestServer(): Promise<void> {
    if (serverProcess) {
        serverProcess.kill('SIGTERM');
        serverProcess = null;
        console.log('[E2E] Server stopped');
    }
}

/** Poll /health until it responds 200 or timeout expires. */
export async function waitForServer(timeoutMs: number = 10000): Promise<void> {
    const startTime = Date.now();
    const healthUrl = `${getTestServerUrl()}/health`;
    console.log(`[E2E] Waiting for server at ${healthUrl}...`);

    while (Date.now() - startTime < timeoutMs) {
        try {
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), 2000);
            const res = await fetch(healthUrl, { signal: controller.signal });
            clearTimeout(t);
            if (res.ok) return;
        } catch {
            // not ready yet
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(`Server not ready after ${timeoutMs}ms`);
}

/**
 * Send a JSON-RPC 2.0 request to the MCP server and return its `result`.
 * Throws on JSON-RPC error responses.
 */
export async function sendMCPRequest(
    method: string,
    params: Record<string, unknown> = {},
): Promise<unknown> {
    const url = `${getTestServerUrl()}/mcp`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() }),
        signal: controller.signal,
    });
    clearTimeout(t);

    const data = (await res.json()) as {
        result?: unknown;
        error?: { message: string };
    };

    if (data.error) {
        throw new Error(`MCP error: ${data.error.message}`);
    }
    return data.result;
}
