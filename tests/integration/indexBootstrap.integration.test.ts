// ============================================================================
// Cosmos-compatibility regression test (issue #93).
//
// Prod symptom (Azure Cosmos DB / Mongo API):
//   GET /r/:loc/api/staff → HTTP 503 {"error":"temporarily unavailable",
//   "code":"db_throw"} for a freshly-signed-up owner with a valid membership
//   row. The same code on local MongoDB returned 200 with the staff list.
//
// Root cause (per fraim/ai-employee/skills/azure/cosmos-db-mongodb-setup.md):
//   "Cosmos DB cannot do collection scans — queries with sort() on unindexed
//    fields will fail with an error, not just run slowly."
//
// Both /staff queries do `.sort({ createdAt: 1 })`, but neither `memberships`
// nor `invites` had an index covering `createdAt`. Real MongoDB tolerates
// this with an in-memory SORT stage after the indexed find; Cosmos rejects
// the plan outright.
//
// This test runs against the local Mongo and exercises the same find+sort
// the production routes do, then inspects the query plan via `.explain()`.
// The faithful repro of Cosmos's rejection is: the winning plan must NOT
// contain a `SORT` stage. If it does, Cosmos throws — which is exactly what
// happens in prod.
//
// Before the fix: plan has a SORT stage on top of an IXSCAN of `(locationId)`.
// After the fix: the new compound `(locationId, createdAt)` index lets the
// planner satisfy the sort from the index alone — no SORT stage, no Cosmos
// rejection.
// ============================================================================

process.env.MONGODB_DB_NAME ??= 'skb_index_bootstrap_test';

import { runTests } from '../test-utils.js';
import { closeDb, getDb, memberships, invites } from '../../src/core/db/mongo.js';

interface T { name: string; description?: string; tags?: string[]; testFn?: () => Promise<boolean>; }

interface PlanStage {
    stage?: string;
    inputStage?: PlanStage;
    inputStages?: PlanStage[];
    queryPlan?: PlanStage;
    winningPlan?: PlanStage;
}

interface ExplainResult {
    queryPlanner?: {
        winningPlan?: PlanStage;
    };
}

/**
 * Walk a Mongo explain() winning plan tree and collect every stage name.
 * Mongo represents the plan as a recursive object with `inputStage` (single
 * child), `inputStages` (multiple children for $or/index intersection),
 * `queryPlan`, and similar wrappers. We flatten all of them.
 */
function collectStageNames(node: PlanStage | undefined): string[] {
    if (!node) return [];
    const names: string[] = [];
    if (typeof node.stage === 'string') names.push(node.stage);
    if (node.inputStage) names.push(...collectStageNames(node.inputStage));
    if (Array.isArray(node.inputStages)) {
        for (const s of node.inputStages) names.push(...collectStageNames(s));
    }
    if (node.queryPlan) names.push(...collectStageNames(node.queryPlan));
    if (node.winningPlan) names.push(...collectStageNames(node.winningPlan));
    return names;
}

const cases: T[] = [
    {
        name: 'memberships /staff query (with index hint) has NO blocking SORT stage',
        description: 'listStaffAtLocation hints the (locationId, createdAt) compound index by name so Cosmos always picks a plan that satisfies the sort from the index. This test confirms the named index exists AND the planner uses it without a SORT stage. Issue #93.',
        tags: ['unit', 'index', 'cosmos', 'issue-93'],
        testFn: async () => {
            const db = await getDb();
            const explain = (await memberships(db)
                .find({ locationId: 'plan-probe-loc', revokedAt: { $exists: false } })
                .sort({ createdAt: 1 })
                .hint('location_createdAt_for_staff_list')
                .explain('queryPlanner')) as ExplainResult;
            const stages = collectStageNames(explain.queryPlanner?.winningPlan);
            return !stages.includes('SORT');
        },
    },
    {
        name: 'invites /staff query (with index hint) has NO blocking SORT stage',
        description: 'listPendingInvites hints invite_loc_createdAt_for_staff_list. Same Cosmos rationale as memberships.',
        tags: ['unit', 'index', 'cosmos', 'issue-93'],
        testFn: async () => {
            const db = await getDb();
            const explain = (await invites(db)
                .find({
                    locationId: 'plan-probe-loc',
                    acceptedAt: { $exists: false },
                    revokedAt: { $exists: false },
                    expiresAt: { $gt: new Date() },
                })
                .sort({ createdAt: 1 })
                .hint('invite_loc_createdAt_for_staff_list')
                .explain('queryPlanner')) as ExplainResult;
            const stages = collectStageNames(explain.queryPlanner?.winningPlan);
            return !stages.includes('SORT');
        },
    },
];

cases.push({
    name: 'cleanup: close Mongo connection',
    tags: ['unit', 'index', 'cosmos', 'issue-93', 'cleanup'],
    testFn: async () => { await closeDb(); return true; },
});

void runTests(cases, 'Cosmos sort-plan compatibility (issue #93)');
