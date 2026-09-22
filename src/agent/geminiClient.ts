import { GoogleGenAI } from '@google/genai';
import { scrubAiPhrases } from './expertVoice.js';
import {
  groqGenerate,
  isGroqConfigured,
  groqConfigReason,
  isTextOnlyRequest,
  GROQ_TEXT_MODEL,
  type GeminiLikeRequest,
} from './groqClient.js';

// Re-exported so endpoints and the health check can report which engines are live without
// importing a second module.
export { isGroqConfigured, groqConfigReason, GROQ_TEXT_MODEL };

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
  /**
   * Declares "this call only ever needs TEXT out", which does two things:
   *   1. Any `inlineData` part is STRIPPED from the payload before the request is built, and
   *   2. the call is therefore always eligible for Groq.
   *
   * Set on the interactive copywriting paths — news summaries, post drafting, captions, the
   * "העתק טקסט" flows. Those never need to see a picture to write a paragraph, but an image
   * riding along in the payload would pin them to Gemini (`isTextOnlyRequest` rejects any
   * binary part) and therefore to Gemini's 20-requests/day free-tier cap. Stripping is cheap
   * insurance: it cannot change a text answer, and it guarantees the operator's click is never
   * blocked by a quota that background work already spent.
   */
  textOnly?: boolean;
  /**
   * Which end of the free-tier waterfall to start from (see planLegs). `background` is for work no
   * one is waiting on — feed translation — and starts on Groq's small model so it never drains the
   * flash-lite daily quota that interactive agent calls depend on. Default `interactive`.
   */
  priority?: 'interactive' | 'background';
}

/**
 * Drop every binary part, keeping the text. Returns the SAME object when there was nothing to
 * strip, so the common path allocates nothing.
 */
function stripInlineData(params: GenContentReq): GenContentReq {
  const contents = (params as GeminiLikeRequest).contents;
  if (!Array.isArray(contents)) return params;
  let stripped = 0;
  const cleaned = contents.map((c) => {
    const parts = c?.parts ?? [];
    const kept = parts.filter((p) => !p?.inlineData);
    stripped += parts.length - kept.length;
    return kept.length === parts.length ? c : { ...c, parts: kept };
  });
  if (!stripped) return params;
  console.info(`[ai-router] textOnly: stripped ${stripped} media part(s) before the model call`);
  // A turn whose only content was an image would otherwise be sent empty.
  return { ...params, contents: cleaned.filter((c) => (c?.parts ?? []).length > 0) } as GenContentReq;
}

// ─── free-tier waterfall ───────────────────────────────────────────────────────────────────────
//
// Every agent (dashboard studios, social agent, email, weekly plan, chat, X intel, translation)
// asks for the general flash model. On the free tier that model allows ~20 requests a DAY for the
// whole project, and Groq's main model 200k tokens a day — both gone by midday, after which every
// agent 429'd. Free quotas are counted PER MODEL, and the same two keys expose models nothing else
// spends. So a request for the general flash model is served by a waterfall of free models instead,
// and the 20/day model is never called.
//
//   interactive (default) : gemini-3.1-flash-lite → gemini-3.5-flash-lite → Groq gpt-oss-120b
//                           → Groq gpt-oss-20b
//   background            : Groq gpt-oss-20b → Groq gpt-oss-120b → gemini-3.5-flash-lite
//                           (feed translation runs every refresh; it must not drain the ~500/day
//                           flash-lite quota the operator's clicks depend on)
//   media in the payload  : the Gemini legs only (Groq cannot read images/video/audio)
//
// A request naming a SPECIFIC non-general model (TTS, image generation, Gemma) is sent to that model
// as-is. GEMINI_FREE_CHAIN (comma-separated) overrides the Gemini legs.

/** The Gemini legs, in order. Measured 2026-09-22: 3.1 ~6s with clean Hebrew, ~500 RPD; 3.5 has its
 *  own ~500 RPD but 503s under load more often. */
const GEMINI_FREE_CHAIN = (process.env.GEMINI_FREE_CHAIN?.split(',').map((s) => s.trim()).filter(Boolean)) ?? [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
];
const GROQ_SMALL_MODEL = 'openai/gpt-oss-20b';

/** "The general flash model" — what every agent asks for. Specialised variants (tts, image,
 *  transcribe, computer-use) do not match and keep their own model. */
function isGeneralFlashModel(model: string): boolean {
  if (model === GEMINI_TEXT_MODEL) return true;
  return /^gemini-(?:[\d.]+-)?flash(?:-lite)?(?:-latest|-preview)?$/.test(model);
}

type Leg = { provider: 'gemini' | 'groq'; model: string };

function planLegs(requested: string, textOnly: boolean, priority: 'interactive' | 'background'): Leg[] {
  if (!isGeneralFlashModel(requested)) return [{ provider: 'gemini', model: requested }];
  const gemini: Leg[] = genAI ? GEMINI_FREE_CHAIN.map((model) => ({ provider: 'gemini' as const, model })) : [];
  if (!textOnly || !isGroqConfigured()) return gemini;
  const bigGroq: Leg = { provider: 'groq', model: GROQ_TEXT_MODEL };
  const smallGroq: Leg = { provider: 'groq', model: GROQ_SMALL_MODEL };
  if (priority === 'background') return [smallGroq, bigGroq, ...gemini.slice(-1)];
  return [...gemini, bigGroq, smallGroq];
}

/**
 * Per-instance cooldowns, keyed by provider:model. A spent DAILY quota benches the model until the
 * next UTC midnight (when Google's and Groq's free quotas reset); a per-minute 429 for a minute; a
 * 503 for 20s after one quick retry; a 404 (model withdrawn) for the rest of the day. The next
 * request goes straight to a leg that can answer instead of re-hitting a known wall.
 */
const benchedUntil = new Map<string, number>();

function nextUtcMidnight(): number {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

const legKey = (leg: Leg) => `${leg.provider}:${leg.model}`;

function isLegBenched(leg: Leg): boolean {
  const until = benchedUntil.get(legKey(leg));
  if (!until) return false;
  if (Date.now() < until) return true;
  benchedUntil.delete(legKey(leg));
  return false;
}

function benchLeg(leg: Leg, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: unknown })?.status;
  let until = 0;
  if (leg.provider === 'gemini') {
    const rate = detectGeminiRateLimit(err);
    if (rate) until = rate.kind === 'rate' ? Date.now() + 60_000 : nextUtcMidnight();
    else if (status === 404 || /\b404\b|NOT_FOUND|no longer available/i.test(msg)) until = nextUtcMidnight();
    else if (TRANSIENT_UPSTREAM.test(msg)) until = Date.now() + 20_000;
  } else if (/DAILY|per day|TPD/i.test(msg)) {
    until = nextUtcMidnight();
  } else if (/429|rate.?limit/i.test(msg)) {
    until = Date.now() + 60_000;
  }
  if (until) benchedUntil.set(legKey(leg), until);
}

/** Which legs are cooling down in this runtime — for the health check. */
export function modelBenchStatus(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, until] of benchedUntil) if (until > Date.now()) out[key] = new Date(until).toISOString();
  return out;
}

async function runGeminiLeg(params: GenContentReq, model: string, options: GenerateOptions) {
  if (!genAI) throw new Error(engineConfigReason() ?? 'GEMINI_API_KEY not configured');
  for (let attempt = 1; ; attempt++) {
    consumeDailyBudget(model);
    await reserveCallSlot();
    try {
      const res = await genAI.models.generateContent({ ...params, model });
      return options.scrub === false ? res : scrubResponse(res);
    } catch (err) {
      logGeminiFailure(`generateContent(${model})`, err, attempt);
      // One quick retry on a transient 5xx — Google's free models 503 in short bursts. Anything
      // else (a 429 of any kind, a 4xx) moves straight to the next leg instead of sleeping here.
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 1 && !detectGeminiRateLimit(err) && TRANSIENT_UPSTREAM.test(msg)) {
        await sleep(withJitter(1500));
        continue;
      }
      throw err;
    }
  }
}

/**
 * One model call, served by the free-tier waterfall above. Each leg is tried once (a Gemini 503
 * gets one quick retry); a failed leg is benched for as long as its failure means, and the next leg
 * answers. Only when every leg fails is the LAST error thrown, unchanged, so callers' existing
 * 429 / billing / safety classification keeps working.
 */
export async function generateContentWithRetry(params: GenContentReq, options: GenerateOptions = {}) {
  // `textOnly: true` is the caller stating the answer is prose, so any media in the payload is
  // dead weight that would otherwise pin the call to Gemini. Strip first, then route.
  if (options.textOnly) params = stripInlineData(params);
  const textOnly = options.textOnly === true || isTextOnlyRequest(params as GeminiLikeRequest);
  const legs = planLegs(String(params.model), textOnly, options.priority ?? 'interactive');

  if (!legs.length) {
    throw new Error(
      textOnly
        ? (groqConfigReason() ?? engineConfigReason() ?? 'no text engine configured')
        : (engineConfigReason() ?? 'GEMINI_API_KEY not configured (required for image/video input)')
    );
  }

  // When every leg is cooling down only briefly (a 503 burst or a per-minute 429 — common for
  // media calls, which have no Groq legs), try them anyway rather than fail without calling anyone.
  // Legs benched for the day stay skipped.
  const allBenched = legs.every(isLegBenched);
  const shortBench = (leg: Leg) => (benchedUntil.get(legKey(leg)) ?? 0) - Date.now() <= 90_000;

  let lastError: unknown = null;
  const skipped: string[] = [];
  for (const leg of legs) {
    // A single explicitly-named model is always attempted — there is nothing to fall back to.
    if (legs.length > 1 && isLegBenched(leg) && !(allBenched && shortBench(leg))) {
      skipped.push(legKey(leg));
      continue;
    }
    try {
      const res =
        leg.provider === 'gemini'
          ? await runGeminiLeg(params, leg.model, options)
          : await groqGenerate(params as GeminiLikeRequest, {
              ...options,
              model: leg.model,
              // gpt-oss-20b spends its room on hidden reasoning at the default effort.
              reasoningEffort: leg.model === GROQ_SMALL_MODEL ? 'low' : undefined,
            });
      if (skipped.length || lastError) console.info(`[ai-router] served by ${legKey(leg)}${skipped.length ? ` (benched: ${skipped.join(', ')})` : ''}`);
      return res;
    } catch (err) {
      lastError = err;
      if (err instanceof GeminiPacedOutError) continue;
      benchLeg(leg, err);
      console.warn(`[ai-router] ${legKey(leg)} failed, trying next leg:`, (err as Error)?.message?.replace(/\s+/g, ' ').slice(0, 200));
    }
  }
  if (lastError) throw lastError;
  // Every leg was benched: report the soonest recovery rather than a bare failure.
  const soonest = Math.min(...legs.map((l) => benchedUntil.get(legKey(l)) ?? Infinity));
  throw new Error(
    `429 all free models are cooling down (${skipped.join(', ')}); next one frees at ${Number.isFinite(soonest) ? new Date(soonest).toISOString() : 'unknown'} — RESOURCE_EXHAUSTED`
  );
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
