// ============================================================================
// SKB MCP tools — Admin surface (completed retrospective, stats, analytics,
// settings). Read-heavy; the only writer here is set_settings.
// ============================================================================

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { listCompletedParties } from '../../services/dining.js';
import { getHostStats } from '../../services/stats.js';
import { getAnalytics, isValidAnalyticsStagePair } from '../../services/analytics.js';
import {
    DEFAULT_AVG_TURN_TIME_MINUTES,
    MIN_AVG_TURN_TIME,
    MAX_AVG_TURN_TIME,
    getEffectiveTurnTime,
    setAvgTurnTime,
    setEtaMode,
} from '../../services/settings.js';
import type { AnalyticsStage, EtaMode } from '../../types/queue.js';
import type { McpAuthContext } from '../auth.js';

function ok(data: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
function err(message: string) {
    return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

const stageSchema = z.enum(['joined', 'seated', 'ordered', 'served', 'checkout', 'departed']);

export function registerAdminTools(server: McpServer, getCtx: () => McpAuthContext): void {
    server.tool(
        'list_completed',
        "Today's retrospective — parties that finished service (departed) plus no-shows, with summary avgs (Served, No-shows, Avg Wait, Avg Table).",
        z.object({}).shape,
        async () => {
            const ctx = getCtx();
            const result = await listCompletedParties(ctx.locationId);
            return ok(result);
        },
    );

    server.tool(
        'get_stats',
        "Admin dashboard header counts: seated, no-shows, avg wait, avg order/serve/checkout/table, peak hour, turn-time-set-vs-actual. Equivalent to the admin Service Debrief card.",
        z.object({}).shape,
        async () => {
            const ctx = getCtx();
            const result = await getHostStats(ctx.locationId);
            return ok(result);
        },
    );

    server.tool(
        'get_analytics',
        "Stage-based histogram analytics. Default: past 7 days, all party sizes, joined→checkout. Override range (1/7/30 days), partySize bucket ('all' | '1-2' | '3-4' | '5+'), and stage pair.",
        z.object({
            rangeDays: z.enum(['1', '7', '30']).optional(),
            partySize: z.enum(['all', '1-2', '3-4', '5+']).optional(),
            startStage: stageSchema.optional(),
            endStage: stageSchema.optional(),
        }).shape,
        async ({ rangeDays, partySize, startStage, endStage }) => {
            if (startStage && endStage && !isValidAnalyticsStagePair(startStage as AnalyticsStage, endStage as AnalyticsStage)) {
                return err(`invalid stage pair: ${startStage} → ${endStage}`);
            }
            const ctx = getCtx();
            try {
                const result = await getAnalytics(
                    ctx.locationId,
                    rangeDays ?? '7',
                    partySize ?? 'all',
                    startStage as AnalyticsStage | undefined,
                    endStage as AnalyticsStage | undefined,
                );
                return ok(result);
            } catch (e) {
                return err((e as Error).message);
            }
        },
    );

    server.tool(
        'get_settings',
        "Read the ETA settings (manual vs dynamic mode, manualMinutes, effectiveMinutes, sample size, fallback flag).",
        z.object({}).shape,
        async () => {
            const ctx = getCtx();
            const result = await getEffectiveTurnTime(ctx.locationId);
            return ok(result);
        },
    );

    server.tool(
        'set_settings',
        `Update ETA settings. Partial update: pass one or both fields. etaMode ∈ {'manual','dynamic'}. avgTurnTimeMinutes ∈ [${MIN_AVG_TURN_TIME},${MAX_AVG_TURN_TIME}] (default ${DEFAULT_AVG_TURN_TIME_MINUTES}).`,
        z.object({
            etaMode: z.enum(['manual', 'dynamic']).optional(),
            avgTurnTimeMinutes: z.number().int().min(MIN_AVG_TURN_TIME).max(MAX_AVG_TURN_TIME).optional(),
        }).shape,
        async ({ etaMode, avgTurnTimeMinutes }) => {
            if (etaMode === undefined && avgTurnTimeMinutes === undefined) {
                return err('must provide at least one of etaMode or avgTurnTimeMinutes');
            }
            const ctx = getCtx();
            try {
                if (etaMode !== undefined) await setEtaMode(ctx.locationId, etaMode as EtaMode);
                if (avgTurnTimeMinutes !== undefined) await setAvgTurnTime(ctx.locationId, avgTurnTimeMinutes);
                const effective = await getEffectiveTurnTime(ctx.locationId);
                return ok(effective);
            } catch (e) {
                return err((e as Error).message);
            }
        },
    );
}
