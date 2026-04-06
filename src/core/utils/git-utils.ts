// ============================================================================
// SKB - Git Utilities with Port Management
// ============================================================================
// Adapted from the FRAIM scaffold reference template.
//
// KEY PATTERNS:
// 1. Port allocation based on git branch issue number (parallel-dev safe)
// 2. Database naming based on branch (isolated data per issue)
// 3. Branch detection with timeout safety
// 4. Graceful fallbacks when git is unavailable (CI, Docker, etc.)
// ============================================================================

import { execSync } from 'node:child_process';

const PROJECT_PREFIX = 'skb';
const DEFAULT_PORT = 15302;
const DEFAULT_BRANCH = 'master';

/**
 * Resolve the server port.
 *
 * Issue-based allocation: 10000 + (issueNumber % 55535) gives each issue branch
 * a unique port in the 10000-65535 safe range, so multiple branches can run
 * concurrently without conflicts.
 *
 * Falls back to env vars (PORT, WEBSITES_PORT, FRAIM_MCP_PORT) then DEFAULT_PORT.
 */
export function getPort(): number {
    // Explicit PORT env takes highest priority (production, CI, test overrides).
    if (Number(process.env.PORT)) return Number(process.env.PORT);

    // Issue-based allocation from branch name for local dev parallelism.
    try {
        const branchName = process.env.FRAIM_BRANCH || getCurrentGitBranch();
        const issueMatch = branchName.match(/issue-(\d+)/i) || branchName.match(/(\d+)-/);

        if (issueMatch) {
            const issueNum = parseInt(issueMatch[1], 10);
            return 10000 + (issueNum % 55535);
        }
    } catch {
        // Silently fall through
    }

    return (
        Number(process.env.WEBSITES_PORT) ||
        Number(process.env.FRAIM_MCP_PORT) ||
        DEFAULT_PORT
    );
}

/**
 * Resolve the MongoDB database name.
 *
 * Each issue branch gets its own database (e.g., skb_issue_42) so parallel
 * development doesn't clobber shared data.
 *
 * Falls back to MONGODB_DB_NAME, then skb_prod / skb_dev based on NODE_ENV.
 */
export function determineDatabaseName(): string {
    try {
        const branchName =
            process.env.FRAIM_BRANCH ||
            process.env.FRAIM_BRANCH_NAME ||
            getCurrentGitBranch();

        const issueMatch = branchName.match(/issue-(\d+)/i) || branchName.match(/(\d+)-/);
        if (issueMatch) {
            return `${PROJECT_PREFIX}_issue_${issueMatch[1]}`;
        }
    } catch {
        // Silently fall through
    }

    return (
        process.env.MONGODB_DB_NAME ||
        (process.env.NODE_ENV === 'production'
            ? `${PROJECT_PREFIX}_prod`
            : `${PROJECT_PREFIX}_dev`)
    );
}

/**
 * Detect the current git branch with a hard timeout.
 * Git commands can hang on broken repos or slow network mounts.
 */
export function getCurrentGitBranch(): string {
    try {
        return execSync('git rev-parse --abbrev-ref HEAD', {
            timeout: 2000,
            stdio: ['ignore', 'pipe', 'ignore'],
        })
            .toString()
            .trim();
    } catch {
        return DEFAULT_BRANCH;
    }
}
