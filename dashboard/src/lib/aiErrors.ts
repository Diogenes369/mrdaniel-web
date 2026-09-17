import { reportAuthFailure } from './adminSecret';

/**
 * One place that turns a failed /api/agent-generate response into a sentence the operator can act on.
 *
 * The endpoint classifies its own failures (see classifyGeminiError in SocialAgentEngine.ts) and
 * answers with a stable `code` plus a Hebrew `message`. Reading those beats guessing from the status
 * alone: a bare "שרת ה-AI החזיר שגיאה 500" cannot distinguish a revoked key from a Google outage
 * from a safety block, and those have three different operator actions.
 */

/** Stable causes the endpoint reports. Anything unrecognised falls back to the status text. */
export type AiErrorCode =
  | 'rate_limited'
  // Per-day quota spent — waiting seconds does nothing; resets at Google's daily boundary.
  | 'quota_exhausted'
  // Prepaid Gemini credits spent (answered as 402). Every call fails until the project is topped up.
  | 'billing_exhausted'
  | 'invalid_api_key'
  | 'model_not_found'
  | 'safety_blocked'
  | 'bad_model_output'
  | 'upstream_unavailable'
  | 'timeout'
  | 'not_configured'
  // The request never reached the model: the source text was below the minimum the action needs.
  // Distinct from every other cause because the fix is the operator's (paste more text), not a
  // retry and not a re-key.
  | 'source_too_short'
  | 'unknown';

export interface AiError {
  status: number;
  code: AiErrorCode | null;
  /** What to show the operator. */
  message: string;
  /** True when retrying the same request unchanged could plausibly work. */
  retryable: boolean;
}

/** Status-only fallback, for the cases where the body is unreadable (proxy error page, offline). */
export function httpReason(status: number): string {
  if (status === 429) return 'Gemini הגביל את קצב הבקשות (429)';
  if (status === 402) return 'קרדיט Gemini אזל — יש להטעין ב-AI Studio (402)';
  if (status === 401) {
    // One actionable re-auth prompt — the usual cause is a build-time secret that went stale
    // after ADMIN_API_SECRET was rotated on the site.
    reportAuthFailure('agent-generate');
    return 'אימות מול /api/agent-generate נכשל (401)';
  }
  if (status === 503) return 'GEMINI_API_KEY לא מוגדר כראוי בסביבת השרת (503)';
  if (status === 504) return 'הבקשה למנוע ה-AI עברה את זמן ההמתנה (504)';
  if (status >= 500) return `שרת ה-AI לא זמין כרגע (${status})`;
  return `שרת ה-AI החזיר שגיאה ${status}`;
}

/**
 * Read the endpoint's own explanation off a failed response.
 *
 * The body is consumed from a clone, so the caller can still read the response if it wants to.
 * A 401 still raises the shared re-auth prompt exactly once, as before.
 */
export async function describeAiError(res: Response): Promise<AiError> {
  if (res.status === 401) reportAuthFailure('agent-generate');

  let code: AiErrorCode | null = null;
  let message = '';
  let retryable = res.status >= 500 || res.status === 429;

  try {
    const body = (await res.clone().json()) as {
      code?: string;
      message?: string;
      detail?: string;
      error?: string;
      retryable?: boolean;
    };
    if (typeof body.code === 'string') code = body.code as AiErrorCode;
    if (typeof body.retryable === 'boolean') retryable = body.retryable;
    // `message` is the Hebrew operator-facing line; `detail` is the underlying error text, appended
    // in parentheses because it is what makes a bug report actionable.
    if (typeof body.message === 'string' && body.message.trim()) {
      message = body.detail && body.detail !== body.message ? `${body.message} (${body.detail})` : body.message;
    } else if (typeof body.detail === 'string' && body.detail.trim()) {
      message = `${httpReason(res.status)} — ${body.detail}`;
    }
  } catch {
    /* non-JSON body (gateway error page, offline) — the status text below is all there is */
  }

  return { status: res.status, code, message: message || httpReason(res.status), retryable };
}

/** Convenience for the many call sites that only want the sentence. */
export async function aiErrorMessage(res: Response): Promise<string> {
  return (await describeAiError(res)).message;
}

/**
 * How long to wait before retrying a 429 from the AI endpoint, or `null` when a retry is pointless.
 *
 * Every API client used to retry any 429 after a fixed pause, which is right for a per-minute
 * throttle and wrong for the other two things Google also reports as 429 — a spent daily quota and
 * depleted prepaid credits. Those now arrive as `retryable: false` (billing as a 402), and this is
 * the one place that honours it. The wait follows the server's `retryAfterSeconds`, clamped so the
 * UI is never parked for long, with jitter so parallel tabs don't retry in lockstep.
 */
export async function aiRetryDelayMs(res: Response, attempt = 0): Promise<number | null> {
  if (res.status !== 429) return null;
  let retryAfterSeconds: number | undefined;
  try {
    const j = (await res.clone().json()) as { retryable?: boolean; code?: string; retryAfterSeconds?: number };
    if (j.retryable === false || j.code === 'quota_exhausted' || j.code === 'billing_exhausted') return null;
    if (typeof j.retryAfterSeconds === 'number') retryAfterSeconds = j.retryAfterSeconds;
  } catch {
    /* unreadable body — treat as a plain throttle */
  }
  const base = Math.max(2000 * 2 ** attempt, (retryAfterSeconds ?? 0) * 1000);
  if (base > 20000) return null;
  return Math.round(base * (0.8 + Math.random() * 0.4));
}
