import { GoogleGenAI } from '@google/genai';

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
}

/** Detects a Gemini free-tier 429 (RESOURCE_EXHAUSTED/quota-exceeded) from a caught error — the
 * @google/genai SDK throws a plain Error whose message embeds the underlying Google API error JSON,
 * so this checks the message text rather than a typed error class. When Google's error includes a
 * RetryInfo.retryDelay (e.g. `"retryDelay":"35s"`), that exact value is used; otherwise a
 * conservative fixed estimate is returned, since the free tier's actual reset window isn't always
 * present on every 429. Returns null for any other kind of error (network, malformed response,
 * etc.) so callers only special-case genuine rate-limiting. */
export function detectGeminiRateLimit(err: unknown): RateLimitInfo | null {
  const message = err instanceof Error ? err.message : String(err);
  if (!/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(message)) return null;
  const match = message.match(/retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i);
  const retryAfterSeconds = match ? Math.max(5, Math.ceil(parseFloat(match[1]))) : 60;
  return { retryAfterSeconds };
}

type GenContentReq = Parameters<GoogleGenAI['models']['generateContent']>[0];

/** Up to two retries (0.7s then 1.8s) for a transient upstream 5xx from Gemini Flash — INTERNAL /
 * UNAVAILABLE / "overloaded" / deadline / reset. A 429 is NOT retried here (surfaced so the
 * endpoint can return its structured rate-limit response); a genuine 4xx/parse error is not
 * retried either. */
export async function generateContentWithRetry(params: GenContentReq) {
  if (!genAI) throw new Error(engineConfigReason() ?? 'GEMINI_API_KEY not configured');
  let lastErr: unknown;
  // Two retries with a widening gap: a Gemini INTERNAL/UNAVAILABLE blip usually clears inside a
  // second, and this is the difference between the operator seeing a 500 and seeing their deck.
  for (const waitMs of [0, 700, 1800]) {
    if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
    try {
      return await genAI.models.generateContent(params);
    } catch (err) {
      lastErr = err;
      // A quota error is surfaced immediately - retrying it only burns the remaining budget.
      if (detectGeminiRateLimit(err)) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!TRANSIENT_UPSTREAM.test(msg)) throw err;
    }
  }
  throw lastErr;
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
