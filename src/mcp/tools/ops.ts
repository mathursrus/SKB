// ============================================================================
// SKB MCP tools — operator meta (file issues, health)
// ============================================================================

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { fileIssue } from '../../issues.js';

function ok(data: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
function err(message: string) {
    return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

export function registerOpsTools(server: McpServer): void {
    server.tool(
        'file_issue',
        "File a GitHub issue against mathursrus/SKB. Use dryRun=true to preview the payload without creating an issue.",
        z.object({
            title: z.string().min(1).max(200),
            body: z.string().min(1),
            labels: z.array(z.string()).optional(),
            dryRun: z.boolean().optional(),
        }).shape,
        async ({ title, body, labels, dryRun }) => {
            try {
                const result = await fileIssue({
                    title,
                    body,
                    labels,
                    dryRun: dryRun === true,
                    clientAgent: 'mcp-client',
                });
                return ok(result);
            } catch (e) {
                return err((e as Error).message);
            }
        },
    );
}
