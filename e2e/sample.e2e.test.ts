// ============================================================================
// SKB - Sample E2E test
// ============================================================================
// Demonstrates the standard pattern:
//   1. start server
//   2. send MCP initialize request
//   3. verify response shape
//   4. stop server
//
// Run with: npx tsx e2e/sample.e2e.test.ts
// ============================================================================

import {
    startTestServer,
    stopTestServer,
    sendMCPRequest,
} from '../tests/shared-server-utils.js';

async function main(): Promise<void> {
    console.log('[E2E] sample.e2e.test: starting');
    await startTestServer();

    try {
        const result = (await sendMCPRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'skb-e2e', version: '0.1.0' },
        })) as { serverInfo?: { name?: string } } | undefined;

        if (!result || typeof result !== 'object') {
            throw new Error('initialize returned no result object');
        }
        if (!result.serverInfo?.name) {
            throw new Error('initialize result missing serverInfo.name');
        }

        console.log(`[E2E] PASS: server identifies as "${result.serverInfo.name}"`);
    } finally {
        await stopTestServer();
    }
}

main().catch((err) => {
    console.error('[E2E] FAIL:', err);
    void stopTestServer();
    process.exit(1);
});
