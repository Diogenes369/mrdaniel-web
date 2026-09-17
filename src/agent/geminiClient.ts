import { GoogleGenAI } from '@google/genai';
import { scrubAiPhrases } from './expertVoice.js';

/**
 * The one Gemini client, and the one retry policy, for every model call in the codebase.
 *
 * This used to live inside SocialAgentEngine.ts, which meant only the calls in that file got the
 * hardening. Four others — WeeklyPlanEngine, emailCopywriter, newsInsights and api/chat — built
 * their own client with `process.env.GEMINI_API_KEY ? new GoogleGenAI(...) : null` and called
 * `models.generateContent()` directly, so they had neither the retry on a transient Google 5xx nor
 * the placeholder-key check. Both gaps surfaced the same way: an opaque 500 with nothing to act on.
 *
 * Importing SocialAgentEngine from those modules would have fixed it at the cost of pulling the
 * whole engine (and its prompt corpus) into unrelated serverless bundles, so the shared parts live
 * here instead. SocialAgentEngine re-exports them, and every existing importer is unaffected.
 */

/**
 * The text model every generation call uses. Kept as one constant (overridable with GEMINI_MODEL)
 * so a model rename is a one-line change instead of twenty literals — a stale name otherwise fails
 * as an opaque 500 on every action at once.
 */
export const GEMINI_TEXT_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash';

/**
 * The key, trimmed. A value that is present but obviously not a key (a `.env.example` placeholder,
 * a quoted empty string, a shell-expanded blank) used to pass the truthy check and then fail at
 * Google with 400/API_KEY_INVALID on every call — which surfaced as an indistinguishable 500.
 * Treating it as "not configured" makes the endpoint answer 503 with the real reason instead.
 * Google's keys are ~39 chars; 20 is a floor no real key falls under.
 */
const RAW_GEMINI_KEY = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '') ?? '';
const KEY_LOOKS_REAL = RAW_GEMINI_KEY.length >= 20 && !/^(?:your|placeholder|changeme|xxx|todo|<)/i.test(RAW_GEMINI_KEY);

export const genAI = KEY_LOOKS_REAL ? new GoogleGenAI({ apiKey: RAW_GEMINI_KEY }) : null;

export function isEngineConfigured(): boolean {
  return genAI !== null;
}

/** Why the engine is unavailable — lets the endpoint say "key looks like a placeholder" rather
 *  than the generic "not configured" when that is actually what happened. */
export function engineConfigReason(): string | null {
  if (genAI) return null;
  if (!RAW_GEMINI_KEY) return 'GEMINI_API_KEY is not set in this runtime';
  return 'GEMINI_API_KEY is set but does not look like a real key (placeholder or truncated value)';
}

/** Error text that means "Google had a hiccup", not "your request was wrong" - the only
 *  class of failure worth retrying automatically. */
export const TRANSIENT_UPSTREAM = /\b50[0-3]\b|INTERNAL|UNAVAILABLE|overloaded|deadline|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed/i;

export interface RateLimitInfo {
  retryAfterSeconds: number;
  /**
   * Which 429 this is — they share a status code and RESOURCE_EXHAUSTED, but only one is worth
   * waiting out:
   *   - `rate`        per-minute RPM/TPM throttle; clears in seconds, safe to back off and retry.
   *   - `daily_quota` a per-day quota; nothing clears it before Google's daily reset.
   *   - `billing`     the project's prepaid credits are spent (or billing is off). Seen in prod on
   *                   2026-09-17 as "Your prepayment credits are depleted" on a PAID key — every
   *                   retry fails identically until someone tops up in AI Studio.
   */
  kind: 'rate' | 'daily_quota' | 'billing';
  /** Google's own RetryInfo.retryDelay, when the error carried one. */
  retryDelaySeconds: number | null;
}

const BILLING_EXHAUSTED = /prepay(?:ment)?\s+credits?|credits? (?:are|is) depleted|billing (?:account|is not|has not|disabled)|check your plan and billing/i;
const DAILY_QUOTA = /PerDay|per[ _-]?day|daily (?:limit|quota)/i;

/** Detects a Gemini 429 (RESOURCE_EXHAUSTED) from a caught error — the @google/genai SDK throws an
 * ApiError whose message embeds the underlying Google API error JSON, so this checks the message
 * text rather than a typed error class. When Google's error includes a RetryInfo.retryDelay
 * (e.g. `"retryDelay":"35s"`), that exact value is used; otherwise a conservative estimate. Returns
 * null for any other kind of error so callers only special-case genuine quota exhaustion. */
export function detectGeminiRateLimit(err: unknown): RateLimitInfo | null {
  const message = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: unknown })?.status;
  // `quota` alone used to match too, which let any error text that merely mentioned quotas be
  // reported as a rate limit. Require the status or Google's status string.
  if (status !== 429 && !/\b429\b|RESOURCE_EXHAUSTED/.test(message)) return null;
  const match = message.match(/retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i);
  const kind: RateLimitInfo['kind'] = BILLING_EXHAUSTED.test(message) ? 'billing' : DAILY_QUOTA.test(message) ? 'daily_quota' : 'rate';
  const retryDelaySeconds = match ? Math.max(1, Math.ceil(parseFloat(match[1]))) : null;
  const retryAfterSeconds = retryDelaySeconds ?? (kind === 'rate' ? 30 : 3600);
  return { retryAfterSeconds, kind, retryDelaySeconds };
}

/** One structured line per failed model call: HTTP status, Google's status string and message, and
 *  any retryDelay/quota metric — the facts needed to tell a billing block from a throttle without
 *  digging a stack trace out of the function log. */
export function logGeminiFailure(context: string, err: unknown, attempt: number): void {
  const message = err instanceof Error ? err.message : String(err);
  let google: { code?: number; status?: string; message?: string; details?: unknown } | undefined;
  const jsonStart = message.indexOf('{');
  if (jsonStart >= 0) {
    try {
      google = (JSON.parse(message.slice(jsonStart)) as { error?: typeof google }).error;
    } catch {
      /* not JSON — the raw message below is all there is */
    }
  }
  const rate = detectGeminiRateLimit(err);
  console.warn(
    `[gemini] ${context} failed`,
    JSON.stringify({
      attempt,
      httpStatus: (err as { status?: unknown })?.status ?? google?.code ?? null,
      googleStatus: google?.status ?? null,
      rateLimitKind: rate?.kind ?? null,
      retryAfterSeconds: rate?.retryAfterSeconds ?? null,
      message: (google?.message ?? message).slice(0, 500),
      details: google?.details ?? null,
    })
  );
}

type GenContentReq = Parameters<GoogleGenAI['models']['generateContent']>[0];
type GenContentRes = Awaited<ReturnType<GoogleGenAI['models']['generateContent']>>;

/**
 * Strips the banned AI-cliché phrases out of every text part, in place, before any caller reads it.
 * Done on the parts rather than on `response.text` because `text` is a getter that re-joins the
 * parts on every read — and half the callers read `response.text` directly, not via requireText.
 * See expertVoice.ts for why this is enforced in code and not left to the prompt.
 */
function scrubResponse(res: GenContentRes): GenContentRes {
  for (const cand of res.candidates ?? []) {
    for (const part of cand.content?.parts ?? []) {
      if (typeof part.text === 'string' && !part.thought) part.text = scrubAiPhrases(part.text);
    }
  }
  return res;
}

/** Transient 5xx: two retries with a short widening gap. */
const TRANSIENT_WAITS_MS = [700, 1800];
/** Per-minute 429: three retries at 2s, 4s, 8s (plus jitter), stretched to Google's own retryDelay
 *  when it names a longer one — but only up to this cap, so a long wait is surfaced, not slept on. */
const RATE_WAITS_MS = [2000, 4000, 8000];
const MAX_RATE_WAIT_MS = 15000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const withJitter = (ms: number) => Math.round(ms * (0.8 + Math.random() * 0.4));

/**
 * One model call with the shared retry policy:
 *   - transient upstream 5xx (INTERNAL / UNAVAILABLE / overloaded / reset) → up to 2 retries;
 *   - per-minute 429 throttle → up to 3 retries with exponential backoff + jitter;
 *   - billing / daily-quota 429 → thrown immediately: nothing clears either within a request, and
 *     retrying only adds load and latency before the same answer;
 *   - any other 4xx / parse error → thrown immediately.
 * Every failed attempt is logged with its status and Google's error payload (logGeminiFailure).
 */
export async function generateContentWithRetry(params: GenContentReq) {
  if (!genAI) throw new Error(engineConfigReason() ?? 'GEMINI_API_KEY not configured');
  let transientRetries = 0;
  let rateRetries = 0;
  for (let attempt = 1; ; attempt++) {
    try {
      return scrubResponse(await genAI.models.generateContent(params));
    } catch (err) {
      logGeminiFailure(`generateContent(${params.model})`, err, attempt);
      const rate = detectGeminiRateLimit(err);
      if (rate) {
        if (rate.kind !== 'rate' || rateRetries >= RATE_WAITS_MS.length) throw err;
        const waitMs = Math.max(RATE_WAITS_MS[rateRetries], (rate.retryDelaySeconds ?? 0) * 1000);
        if (waitMs > MAX_RATE_WAIT_MS) throw err;
        rateRetries++;
        await sleep(withJitter(waitMs));
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (!TRANSIENT_UPSTREAM.test(msg) || transientRetries >= TRANSIENT_WAITS_MS.length) throw err;
      await sleep(TRANSIENT_WAITS_MS[transientRetries++]);
    }
  }
}

// ─── response contract ───────────────────────────────────────────────────────────────────────
// Validating the response is as much a part of calling the model as the retry is: an answer
// that was blocked or truncated arrives as an empty string, and `|| '{}'` turns both into a
// generic parse failure. Shared so every caller reports the real cause.

export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) return fenceMatch[1];
  // A matched pair is the common case, but an answer cut short can carry the opening fence with
  // no closing one. newsInsights.ts had its own copy that stripped each marker independently for
  // exactly that reason; handling it here too means consolidating the two loses nothing.
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

/** Thrown when the model answered but the answer was unusable (empty, truncated, wrong shape).
 *  Separate from a transport failure so it is never retried as if it were an outage. */
export class ModelOutputError extends Error {
  readonly blockedBySafety: boolean;
  constructor(message: string, blockedBySafety = false) {
    super(message);
    this.name = 'ModelOutputError';
    this.blockedBySafety = blockedBySafety;
  }
}

/**
 * Reads the text off a response, refusing the shapes that would otherwise blow up downstream.
 *
 * `response.text` is empty both when the candidate was blocked and when generation stopped at the
 * token ceiling mid-JSON; in the second case `JSON.parse` throws a bare SyntaxError
 * ("Unexpected end of JSON input") that says nothing about the real cause. Both are turned into a
 * ModelOutputError carrying which one it was.
 */
export function requireText(response: { text?: string; candidates?: Array<{ finishReason?: string }>; promptFeedback?: { blockReason?: string } }): string {
  const finishReason = response.candidates?.[0]?.finishReason ?? '';
  const blockReason = response.promptFeedback?.blockReason ?? '';
  const text = response.text?.trim() ?? '';

  if (blockReason || /SAFETY|BLOCKLIST|PROHIBITED|RECITATION/i.test(finishReason)) {
    throw new ModelOutputError(`blocked by Gemini safety filters (${blockReason || finishReason})`, true);
  }
  if (!text) throw new ModelOutputError(`model returned an empty response (finishReason: ${finishReason || 'unknown'})`);
  if (/MAX_TOKENS/i.test(finishReason)) {
    throw new ModelOutputError('model hit the output token ceiling and the answer was cut off mid-way');
  }
  return text;
}

/** JSON.parse, with the failure reported as a model-output problem rather than a raw SyntaxError
 *  bubbling all the way to the endpoint as an opaque 500. */
export function parseJsonOrThrow<T>(raw: string, what: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ModelOutputError(`${what}: model did not return valid JSON (got: ${raw.slice(0, 120)})`);
  }
}
