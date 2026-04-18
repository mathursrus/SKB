// ============================================================================
// SKB - Onboarding wizard state endpoints (issue #54, spec §6.2)
// ============================================================================
//
// The onboarding wizard on /r/:loc/admin.html is a dismissable 4-step
// checklist. Step state is persisted server-side on the Location row so
// dismissal → revisit-from-different-device shows the same progress.
//
// Surface:
//   GET  /r/:loc/api/onboarding/steps    → { steps: string[], done: boolean }
//   POST /r/:loc/api/onboarding/steps    { step }  → marks step complete
//   DELETE /r/:loc/api/onboarding/steps  → resets (for admins re-running)
//
// Steps are the fixed v1 set { 'basics', 'template', 'menu', 'staff' }.
// Unknown step IDs are rejected so typos don't silently accumulate in the
// db array.
//
// Gating: owner OR admin (spec §6.2 — either can work the wizard; only the
// staff-invite step is owner-only and gated at that route).
// ============================================================================

import { Router, type Request, type Response } from 'express';

import { requireRole } from '../middleware/hostAuth.js';
import { getDb, locations } from '../core/db/mongo.js';

const STEP_IDS = ['basics', 'template', 'menu', 'staff'] as const;
type StepId = typeof STEP_IDS[number];
const STEP_SET = new Set<string>(STEP_IDS);

function isStep(value: unknown): value is StepId {
    return typeof value === 'string' && STEP_SET.has(value);
}

export function onboardingRouter(): Router {
    // mergeParams so the :loc param from the parent mount (/r/:loc/api) is
    // visible inside requireRole and the per-request handlers. Without this,
    // req.params.loc is always undefined and requireRole's tenant check
    // silently passes (no paramLoc to compare to), but our handlers return
    // 400 "loc required".
    const r = Router({ mergeParams: true });

    const ownerOrAdmin = requireRole('owner', 'admin');

    r.get('/onboarding/steps', ownerOrAdmin, async (req: Request, res: Response) => {
        const loc = String(req.params?.loc ?? '');
        if (!loc) { res.status(400).json({ error: 'loc required' }); return; }
        try {
            const db = await getDb();
            const doc = await locations(db).findOne(
                { _id: loc },
                { projection: { onboardingSteps: 1 } },
            );
            if (!doc) { res.status(404).json({ error: 'location not found' }); return; }
            const steps = Array.isArray(doc.onboardingSteps) ? doc.onboardingSteps.filter(isStep) : [];
            res.json({
                steps,
                total: STEP_IDS.length,
                done: steps.length >= STEP_IDS.length,
                allSteps: STEP_IDS.slice(),
            });
        } catch (err) {
            console.error('[onboarding] GET error:', err);
            res.status(503).json({ error: 'service unavailable' });
        }
    });

    r.post('/onboarding/steps', ownerOrAdmin, async (req: Request, res: Response) => {
        const loc = String(req.params?.loc ?? '');
        const body = (req.body ?? {}) as { step?: unknown };
        if (!loc) { res.status(400).json({ error: 'loc required' }); return; }
        if (!isStep(body.step)) {
            res.status(400).json({ error: `step must be one of ${STEP_IDS.join(', ')}`, field: 'step' });
            return;
        }
        try {
            const db = await getDb();
            // $addToSet is idempotent — resubmitting a step is a no-op,
            // which matches the client's natural retry behavior.
            const result = await locations(db).findOneAndUpdate(
                { _id: loc },
                { $addToSet: { onboardingSteps: body.step } },
                { returnDocument: 'after', projection: { onboardingSteps: 1 } },
            );
            if (!result) { res.status(404).json({ error: 'location not found' }); return; }
            const steps = Array.isArray(result.onboardingSteps) ? result.onboardingSteps.filter(isStep) : [];
            res.json({
                steps,
                total: STEP_IDS.length,
                done: steps.length >= STEP_IDS.length,
                allSteps: STEP_IDS.slice(),
            });
        } catch (err) {
            console.error('[onboarding] POST error:', err);
            res.status(503).json({ error: 'service unavailable' });
        }
    });

    r.delete('/onboarding/steps', ownerOrAdmin, async (req: Request, res: Response) => {
        const loc = String(req.params?.loc ?? '');
        if (!loc) { res.status(400).json({ error: 'loc required' }); return; }
        try {
            const db = await getDb();
            const result = await locations(db).findOneAndUpdate(
                { _id: loc },
                { $set: { onboardingSteps: [] } },
                { returnDocument: 'after', projection: { onboardingSteps: 1 } },
            );
            if (!result) { res.status(404).json({ error: 'location not found' }); return; }
            res.json({
                steps: [],
                total: STEP_IDS.length,
                done: false,
                allSteps: STEP_IDS.slice(),
            });
        } catch (err) {
            console.error('[onboarding] DELETE error:', err);
            res.status(503).json({ error: 'service unavailable' });
        }
    });

    return r;
}

export const __test__ = { STEP_IDS };
