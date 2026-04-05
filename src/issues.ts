// ============================================================================
// SKB - Issue Filing (GitHub)
// ============================================================================
// Single entry point for filing issues to mathursrus/SKB on GitHub.
// Adapted from the FRAIM scaffold reference; uses native fetch (no axios).
// ============================================================================

interface FileIssueParams {
    title: string;
    body: string;
    labels?: string[];
    dryRun?: boolean;
    // Client identity injected by the MCP server from session context.
    clientEmail?: string;
    clientAgent?: string;
    clientContext?: string;
}

export interface IssueResult {
    success: boolean;
    issueNumber?: number;
    issueUrl?: string;
    message?: string;
    dryRun?: boolean;
}

export async function fileIssue(params: FileIssueParams): Promise<IssueResult> {
    const { title, labels, dryRun, clientEmail, clientAgent, clientContext } = params;

    // Prepend client identity so issues are always traceable.
    const identityLines: string[] = [];
    if (clientEmail) identityLines.push(`**Filed by:** ${clientEmail}`);
    if (clientAgent) identityLines.push(`**Agent:** ${clientAgent}`);
    if (clientContext) identityLines.push(`**Context:** ${clientContext}`);
    const identityBlock =
        identityLines.length > 0 ? identityLines.join('\n') + '\n\n' : '';
    const body = identityBlock + params.body;

    if (dryRun) {
        return {
            success: true,
            dryRun: true,
            message: `[DRY RUN] Would create issue: "${title}"`,
        };
    }

    const token = process.env.ISSUE_TRACKER_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) {
        return {
            success: false,
            message:
                'Issue filing requires ISSUE_TRACKER_TOKEN or GITHUB_TOKEN env var.',
        };
    }

    const owner =
        process.env.REPO_OWNER || process.env.GITHUB_OWNER || 'mathursrus';
    const repo = process.env.REPO_NAME || process.env.GITHUB_REPO || 'SKB';

    const url = `https://api.github.com/repos/${owner}/${repo}/issues`;
    const payload: Record<string, unknown> = { title, body };
    if (labels && labels.length > 0) payload.labels = labels;

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'skb-mcp-server',
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            return { success: false, message: `GitHub API error: ${res.status}` };
        }

        const data = (await res.json()) as { number: number; html_url: string };
        return {
            success: true,
            issueNumber: data.number,
            issueUrl: data.html_url,
        };
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : 'Unknown error filing issue',
        };
    }
}
