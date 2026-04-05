// ============================================================================
// SKB - Health routes
// ============================================================================

import { Router, type Request, type Response } from 'express';

import { pingDb } from '../core/db/mongo.js';

export function healthRouter(serviceName: string): Router {
    const r = Router();

    r.get('/health', (_req: Request, res: Response) => {
        res.json({
            status: 'ok',
            service: serviceName,
            timestamp: new Date().toISOString(),
        });
    });

    r.get('/health/db', async (_req: Request, res: Response) => {
        try {
            await pingDb();
            res.json({ status: 'ok', db: 'reachable' });
        } catch (err) {
            res.status(503).json({
                status: 'degraded',
                db: 'unreachable',
                detail: err instanceof Error ? err.message : String(err),
            });
        }
    });

    return r;
}
