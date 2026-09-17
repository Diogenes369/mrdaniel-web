import { generateWeeklyPlan, isEngineConfigured } from '../src/agent/WeeklyPlanEngine.js';
import { classifyGeminiError } from '../src/agent/SocialAgentEngine.js';
import { writeWeeklyPlan, agentFirebaseConfigured } from '../src/agent/firebaseServer.js';

/**
 * Generates one full 7-day content plan (4 platforms × 4 topic pillars, see WeeklyPlanEngine.ts)
 * and persists it to Firebase at `weekly_plan`, replacing whatever plan was there before — this
 * is what the dashboard's "Generate New Weekly Plan" button calls. Same admin-secret auth model as
 * /api/agent-generate — see that file's isAdminAuthorized for the "fails open until configured"
 * reasoning.
 */

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
}

function isAdminAuthorized(req: any): boolean {
  const configured = process.env.ADMIN_API_SECRET;
  if (!configured) return true;
  return req.headers?.['x-admin-secret'] === configured;
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  if (!isAdminAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  if (!isEngineConfigured()) {
    res.status(503).json({ ok: false, error: 'GEMINI_API_KEY not configured' });
    return;
  }

  try {
    const plan = await generateWeeklyPlan();
    const saved = agentFirebaseConfigured ? await writeWeeklyPlan(plan) : false;
    res.status(200).json({ ok: true, plan, saved });
  } catch (err) {
    const failure = classifyGeminiError(err);
    if (failure.code === 'rate_limited' || failure.code === 'quota_exhausted' || failure.code === 'billing_exhausted') {
      res.status(failure.status).json({ ok: false, status: failure.code === 'rate_limited' ? 'rate_limited' : failure.code, code: failure.code, message: failure.message, retryable: failure.retryable, retryAfterSeconds: failure.retryAfterSeconds });
      return;
    }
    console.error('[api/generate-weekly-plan] error:', err);
    res.status(500).json({ ok: false, error: 'generation failed' });
  }
}
