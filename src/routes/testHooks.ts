// ============================================================================
// SKB - Test-only HTTP hooks (issue #69 review round 2)
// ============================================================================
//
// These routes exist solely to give integration tests a way to inspect state
// that's internal to the server process (Twilio captured calls) from a
// separate test process. All routes are gated on SKB_ENABLE_SMS_TEST_HOOK=1
// — if that env var is unset, this router mounts no handlers and returns
// an empty Router, so the routes 404 in production.
//
// Routes (only when enabled):
//   GET    /__test__/sms-captured   → { calls: CapturedSmsCall[] }
//   DELETE /__test__/sms-captured   → { ok: true }
// ============================================================================

import { Router, type Request, type Response } from 'express';

import { __getCapturedSmsCalls, __clearCapturedSmsCalls } from '../services/sms.js';

export function testHooksRouter(): Router {
    const r = Router();
    if (process.env.SKB_ENABLE_SMS_TEST_HOOK !== '1') return r;

    r.get('/__test__/sms-captured', (_req: Request, res: Response) => {
        res.json({ calls: __getCapturedSmsCalls() });
    });

    r.delete('/__test__/sms-captured', (_req: Request, res: Response) => {
        __clearCapturedSmsCalls();
        res.json({ ok: true });
    });

    return r;
}
