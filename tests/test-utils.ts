// ============================================================================
// SKB - Test Utilities with BaseTestCase and Tag Filtering
// ============================================================================
// Adapted from the FRAIM scaffold reference.
//
// Run with: npx tsx tests/test-utils.ts --tags=unit
//       or: TAGS=unit npx tsx tests/test-utils.ts
//       or: EXCLUDE_TAGS=slow npx tsx tests/test-utils.ts
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert';

export interface BaseTestCase {
    name: string;
    description?: string;
    tags?: string[]; // e.g., ['unit', 'waitlist'], ['integration', 'mcp']
    testFn?: () => Promise<boolean>;
}

/**
 * Normalize line endings so string comparisons don't fail between Windows (CRLF)
 * and POSIX (LF) environments.
 */
export function normalizeLineEndings(content: string): string {
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Run a list of test cases under the Node built-in test runner, with tag filtering.
 *
 * Inclusion precedence: --tags=<csv> CLI arg > TAGS env var.
 * Exclusion: EXCLUDE_TAGS env var.
 */
export async function runTests<T extends BaseTestCase>(
    testCases: T[],
    testTitle: string,
): Promise<void> {
    console.log(`Testing ${testTitle}...\n`);

    let tagsFilter: string[] = [];

    const tagsArg = process.argv.find(
        (arg) => typeof arg === 'string' && arg.startsWith('--tags='),
    );
    if (tagsArg) {
        const tagValue = tagsArg.split('=')[1];
        if (tagValue) {
            tagsFilter = tagValue.split(',');
            console.log(`Filtering by tags (CLI): ${tagsFilter.join(', ')}`);
        }
    }

    if (tagsFilter.length === 0 && process.env.TAGS) {
        tagsFilter = process.env.TAGS.split(',');
        console.log(`Filtering by tags (ENV): ${tagsFilter.join(', ')}`);
    }

    let excludeTags: string[] = [];
    if (process.env.EXCLUDE_TAGS) {
        excludeTags = process.env.EXCLUDE_TAGS.split(',');
        console.log(`Excluding tags: ${excludeTags.join(', ')}`);
    }

    const testsToRun = testCases.filter((tc) => {
        if (tagsFilter.length > 0) {
            if (!tc.tags || !tc.tags.some((t) => tagsFilter.includes(t))) return false;
        }
        if (excludeTags.length > 0) {
            if (tc.tags && tc.tags.some((t) => excludeTags.includes(t))) return false;
        }
        return true;
    });

    if (testsToRun.length === 0) {
        console.log('No tests match the current filter.\n');
        return;
    }

    console.log(`Running ${testsToRun.length} of ${testCases.length} tests\n`);

    for (const tc of testsToRun) {
        test(tc.name, async () => {
            if (tc.testFn) {
                const result = await tc.testFn();
                assert.ok(result, `Test "${tc.name}" returned false`);
            }
        });
    }
}

// Self-test: running this file directly runs a sanity-check test case.
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
    void runTests(
        [
            {
                name: 'test-utils sanity',
                description: 'runTests wires up and executes a trivial test',
                tags: ['unit', 'self-test'],
                testFn: async () => normalizeLineEndings('a\r\nb') === 'a\nb',
            },
        ],
        'test-utils self-test',
    );
}
