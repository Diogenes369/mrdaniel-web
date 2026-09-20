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
 *
 * Two live formats as of September 2026: the legacy Standard key (`AIza…`, 39 chars), which Google
 * now rejects outright, and the Auth key (`AQ.Ab…`, ~53 chars) that AI Studio issues by default.
 * The check is deliberately a length floor rather than a prefix match — a prefix allowlist written
 * against one format is exactly what broke third-party tools through this transition.
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
 *  when it names a longer one — but only up to this cap, so a long wait is surfaced, not slept on.
 *
 *  The cap is 30s because the free tier's real ceiling is 5 RPM, and a genuine collision there comes
 *  back asking for ~22s (measured in production). At the old 15s cap that request was abandoned one
 *  second before the wait Google actually wanted, turning a recoverable collision into a user-facing
 *  error. Anything past 30s is a quota problem, not a throttle, and still surfaces. */
const RATE_WAITS_MS = [2000, 4000, 8000];
const MAX_RATE_WAIT_MS = 30000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const withJitter = (ms: number) => Math.round(ms * (0.8 + Math.random() * 0.4));

/**
 * Client-side pacing: never let two model calls leave this runtime close enough to trip the RPM quota.
 *
 * The budget is expressed as RPM rather than as a delay because the delay is a consequence, and
 * guessing it wrong is silent. `MIN_CALL_SPACING_MS` derives the delay from whatever ceiling is in
 * force, adding a second of headroom because the window is Google's, not ours, and a call landing
 * on the boundary counts against the older window.
 *
 * **The project moved to the paid / pay-as-you-go tier on 2026-09-20, so pacing is OFF by default.**
 * The free tier's measured ceilings were 5 RPM and 20 requests/day (see the daily-budget note
 * below), which forced a 13s gap between every call — a tax that no longer buys anything. Paid
 * Tier 1 for gemini-3.6-flash is three orders of magnitude above that, and a 13s client-side gap
 * would now be the slowest thing in the request by a wide margin.
 *
 * What is deliberately kept rather than deleted:
 *   - the whole mechanism, one env var away from returning. Billing lapses, keys get swapped back
 *     to a free project, and a new quota ceiling is a config change, not a code change.
 *   - the 429 retry path below, which is the real backstop. Paid tiers still have ceilings, and
 *     nothing here is a distributed limiter — see the scope note.
 *
 * Scope, stated plainly: this is per *runtime instance*. Fluid Compute reuses an instance across
 * concurrent requests, so one instance's calls would be genuinely serialised — but two instances
 * know nothing about each other. That mattered at 5 RPM; at paid-tier ceilings it does not.
 *
 * GEMINI_MAX_RPM=0 (the default) disables pacing. Set it to the tier's real RPM to switch pacing
 * back on — e.g. GEMINI_MAX_RPM=5 restores the free-tier 13s floor. GEMINI_MIN_SPACING_MS overrides
 * the derived value outright when a specific spacing is wanted.
 */
/**
 * Read a non-negative number from the environment, treating unset/blank/garbage as absent.
 *
 * `Number('')` is 0, not NaN — so a plain `Number(process.env.X)` check reads an *empty* variable as
 * a deliberate zero. For these two settings zero means "no pacing at all", which would have turned
 * an empty Vercel env var into silently unlimited request rate. Blank must mean unset.
 */
function envNumber(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

const MIN_CALL_SPACING_MS = (() => {
  const explicit = envNumber('GEMINI_MIN_SPACING_MS');
  if (explicit !== null) return explicit;
  const rpm = envNumber('GEMINI_MAX_RPM') ?? 0;
  if (rpm === 0) return 0;
  return Math.ceil(60_000 / rpm) + 1000;
})();

let lastCallStartedAt = 0;
/** Serialises the waiters, so N concurrent callers space out instead of all reading the same gap. */
let throttleChain: Promise<void> = Promise.resolve();

/**
 * How long a caller may be made to wait for its slot before the call is refused instead.
 *
 * Sleeping until the slot is free is only safe when the caller has the time. `/api/news/analyze`
 * runs under a 45s maxDuration, and pacing turned a fast 429 into a 504: cold start + a 13s wait +
 * generation overran the function and the user got a gateway timeout, which is strictly worse than
 * an honest "busy, retry in Ns". So a wait longer than this is reported, not slept through.
 *
 * The cap sits just above one full spacing interval, so a caller that merely queued behind one
 * other request still waits it out; only genuine pile-ups are refused.
 */
const MAX_PACING_WAIT_MS = envNumber('GEMINI_MAX_PACING_WAIT_MS') ?? MIN_CALL_SPACING_MS + 2000;

/** Thrown when pacing would block longer than the caller can afford. Carries a retry hint. */
export class GeminiPacedOutError extends Error {
  readonly retryAfterSeconds: number;
  constructor(waitMs: number) {
    super(`gemini pacing: next free slot is ${Math.ceil(waitMs / 1000)}s away, which exceeds the ${Math.ceil(MAX_PACING_WAIT_MS / 1000)}s wait budget — refused rather than risking a function timeout`);
    this.name = 'GeminiPacedOutError';
    this.retryAfterSeconds = Math.ceil(waitMs / 1000);
  }
}

function reserveCallSlot(): Promise<void> {
  if (MIN_CALL_SPACING_MS <= 0) return Promise.resolve();
  const slot = throttleChain.then(async () => {
    const waitMs = MIN_CALL_SPACING_MS - (Date.now() - lastCallStartedAt);
    if (waitMs > MAX_PACING_WAIT_MS) throw new GeminiPacedOutError(waitMs);
    if (waitMs > 0) await sleep(waitMs);
    lastCallStartedAt = Date.now();
  });
  // The chain must never reject, or every subsequent caller inherits the rejection. A refused
  // caller also must not advance lastCallStartedAt — it never sent anything.
  throttleChain = slot.catch(() => undefined);
  return slot;
}

/**
 * Daily call budget — a local ceiling on requests-per-day, OFF by default since the move to the
 * paid tier on 2026-09-20.
 *
 * Why it existed: the free tier's real daily ceiling, measured in production on 2026-09-19, was
 *
 *   quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier, value: 20, model: gemini-3.6-flash
 *
 * Twenty calls per day for the whole project — not per user, not per endpoint. A 429 for a spent
 * daily quota reads exactly like a throttle while being unrecoverable until Google's UTC reset, so
 * refusing locally turned that into an immediate honest error instead of four retries per call.
 *
 * Why it is now 0: on pay-as-you-go there is no daily cap to protect, and a hard local ceiling is
 * strictly a way to break a working product at call 19. Overspend is a billing concern, and the
 * place to bound it is Google's own budget alert, which can see every instance — this counter only
 * ever saw one (same instance-scoped caveat as the throttle: a soft guard, never an accountant).
 *
 * Set GEMINI_DAILY_CALL_BUDGET to a positive number to re-arm it — for a free key, or as a
 * deliberate spend fuse. The counter still runs, so `geminiPacingStatus()` reports callsToday
 * either way.
 */
const DAILY_CALL_BUDGET = envNumber('GEMINI_DAILY_CALL_BUDGET') ?? 0;

let budgetDay = '';
let callsToday = 0;

/** UTC day, matching how Google resets free-tier daily quota. */
const utcDay = () => new Date().toISOString().slice(0, 10);

function consumeDailyBudget(context: string): void {
  const today = utcDay();
  if (today !== budgetDay) {
    budgetDay = today;
    callsToday = 0;
  }
  // Counting is unconditional so geminiPacingStatus() still reports the day's usage with the budget
  // disabled; only the refusal is gated. Observability shouldn't switch off with the fuse.
  if (DAILY_CALL_BUDGET > 0 && callsToday >= DAILY_CALL_BUDGET) {
    throw new Error(
      `gemini daily call budget exhausted (${callsToday}/${DAILY_CALL_BUDGET} for ${today}) — refused locally before calling Google. Raise GEMINI_DAILY_CALL_BUDGET or wait for the UTC reset. [context: ${context}]`
    );
  }
  callsToday += 1;
}

/** What the pacing layer has done in this runtime — for health checks and debugging. */
export function geminiPacingStatus(): { minSpacingMs: number; dailyBudget: number; callsToday: number; day: string } {
  return { minSpacingMs: MIN_CALL_SPACING_MS, dailyBudget: DAILY_CALL_BUDGET, callsToday, day: budgetDay || utcDay() };
}

/**
 * Per-call switches for `generateContentWithRetry`.
 *
 * `scrub: false` opts out of `scrubResponse`. Every caller that generates Hebrew *prose* wants the
 * scrubber and gets it by default; a caller that generates **source code** must not have it, because
 * `scrubAiPhrases` finishes by collapsing runs of spaces and tabs (`/[ 	]{2,}/ -> ' '`). That is
 * harmless in a paragraph and destroys a file: a screenshot carrying any Hebrew UI text produces a
 * component with Hebrew string literals, `HEBREW.test()` then passes for the whole answer, and every
 * level of indentation in the returned TSX collapses to a single space. Opting out is therefore not
 * a style preference — it is the difference between valid output and mangled output.
 */
export interface GenerateOptions {
  /** Default true. Set false when the response is code, not prose — see above. */
  scrub?: boolean;
}

/**
 * One model call with the shared retry policy:
 *   - transient upstream 5xx (INTERNAL / UNAVAILABLE / overloaded / reset) → up to 2 retries;
 *   - per-minute 429 throttle → up to 3 retries with exponential backoff + jitter;
 *   - billing / daily-quota 429 → thrown immediately: nothing clears either within a request, and
 *     retrying only adds load and latency before the same answer;
 *   - any other 4xx / parse error → thrown immediately.
 * Every failed attempt is logged with its status and Google's error payload (logGeminiFailure).
 */
export async function generateContentWithRetry(params: GenContentReq, options: GenerateOptions = {}) {
  if (!genAI) throw new Error(engineConfigReason() ?? 'GEMINI_API_KEY not configured');
  let transientRetries = 0;
  let rateRetries = 0;
  for (let attempt = 1; ; attempt++) {
    // Pacing sits inside the retry loop on purpose: a retry is another request against the same
    // per-minute limit, so it waits its turn exactly like a first attempt. Both are outside the
    // try, because a locally refused call is not a Gemini failure and must not be logged as one.
    consumeDailyBudget(String(params.model));
    await reserveCallSlot();
    try {
      const res = await genAI.models.generateContent(params);
      return options.scrub === false ? res : scrubResponse(res);
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
