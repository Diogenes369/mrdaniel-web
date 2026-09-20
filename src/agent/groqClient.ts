import { scrubAiPhrases } from './expertVoice.js';

/**
 * The Groq client — the primary engine for every TEXT-only model call in the codebase.
 *
 * ## Why this exists
 *
 * Gemini's free tier throttles at a handful of requests per minute and its `gemini-3.6-flash`
 * endpoint returns `503 UNAVAILABLE / high demand` regularly enough to be a user-facing failure
 * (observed repeatedly in production on 2026-09-21). Groq serves an OpenAI-compatible completion
 * API on dedicated inference hardware and answers a full Hebrew carousel deck in well under two
 * seconds. For prose and JSON, which is what almost every action in this project generates, it is
 * both faster and far less rate-limited.
 *
 * What it deliberately does NOT do: images, video or audio. Groq's chat endpoint is text-in /
 * text-out, so anything with an `inlineData` part — `screenshot-to-code`, `x-subtitles`,
 * `image-carousel-deck` — must stay on Gemini. That split is enforced structurally by
 * `isTextOnlyRequest` below rather than by a list of action names, so a new multimodal action
 * cannot accidentally be routed here and fail at runtime.
 *
 * ## Why it speaks Gemini's request shape
 *
 * Every generator in this repo (twenty-odd of them, across SocialAgentEngine, newsInsights,
 * emailCopywriter, the agents) already calls `generateContentWithRetry(params)` with the
 * `@google/genai` request object. Translating that object here — once — means the router in
 * geminiClient.ts can swap providers with no change at any call site, and no risk of the two
 * paths drifting in what they ask the model for. The response is translated back into the same
 * shape (`{ text, candidates, usageMetadata }`) for exactly the same reason: `requireText()`,
 * `stripCodeFence()` and `parseJsonOrThrow()` keep working unchanged.
 */

/**
 * The model every Groq call uses.
 *
 * NOT `llama-3.3-70b-versatile`: that model has been retired and is not served on this account
 * (verified against `GET /openai/v1/models` on 2026-09-21 — it is absent from the list, and a
 * request naming it fails). `openai/gpt-oss-120b` is the largest text model currently offered and
 * measured best of the available set on Hebrew: natural Israeli phrasing, valid JSON on the first
 * try, and it keeps Latin product names in Latin, which is a hard requirement here (AGENTS.md).
 *
 * `qwen/qwen3.8-27b` was faster still but rewrote or dropped the Latin technical terms
 * (`npm install`, `Wi-Fi 7`), which breaks the source-fidelity rule, so it is not the default.
 */
export const GROQ_TEXT_MODEL = process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/** Same placeholder-tolerant check as the Gemini key: a `.env.example` value that is present but
 *  obviously not a key must read as "not configured", not fail at the provider on every call. */
const RAW_GROQ_KEY = process.env.GROQ_API_KEY?.trim().replace(/^["']|["']$/g, '') ?? '';
const KEY_LOOKS_REAL = RAW_GROQ_KEY.length >= 20 && !/^(?:your|placeholder|changeme|xxx|todo|<)/i.test(RAW_GROQ_KEY);

export function isGroqConfigured(): boolean {
  return KEY_LOOKS_REAL;
}

export function groqConfigReason(): string | null {
  if (KEY_LOOKS_REAL) return null;
  if (!RAW_GROQ_KEY) return 'GROQ_API_KEY is not set in this runtime';
  return 'GROQ_API_KEY is set but does not look like a real key (placeholder or truncated value)';
}

// ─── unicode hygiene ────────────────────────────────────────────────────────────────────────

/**
 * Characters a model substitutes for their ASCII equivalents, normalised back.
 *
 * This is not cosmetic. The `gpt-oss` family emits U+2011 NON-BREAKING HYPHEN inside Latin
 * technical terms — "Wi‑Fi 7", "Retrieval‑Augmented Generation" — and the bidi wrapper in
 * `hebrewTextSanitizer.ts` matches a Latin run with `[-'’ ]`, an ASCII hyphen only. Measured on
 * 2026-09-21: `Wi‑Fi 7` came out of the sanitiser as THREE separate bidi runs
 * (`[RLM]Wi[RLM]`, the orphaned hyphen, `[RLM]Fi 7[RLM]`), and in an RTL paragraph the later runs
 * are ordered to the left of the earlier ones — so the slide rendered "Fi 7 ‑ Wi". That is the
 * exact corruption `scripts/__tests__/hebrew-bidi.test.mjs` was written to catch.
 *
 * Only HYPHEN-like characters and invisible whitespace are normalised. EN DASH and EM DASH are
 * deliberately left alone: this project's Hebrew copy uses "—" as real punctuation throughout, and
 * rewriting it to "-" would damage correct text to fix a different problem.
 */
const UNICODE_FIXES: [RegExp, string][] = [
  [/[‐‑‒−]/g, '-'], // HYPHEN, NON-BREAKING HYPHEN, FIGURE DASH, MINUS SIGN
  [/ /g, ' '], // NBSP — breaks word-splitting in every clamp/wrap helper here
  [/[​‌‍﻿]/g, ''], // zero-width joiners / BOM smuggled mid-token
];

/** Normalise the model's unicode substitutions back to ASCII. Exported for the tests and reused by
 *  the Gemini path, which emits the same characters less often but not never. */
export function normalizeModelUnicode(text: string): string {
  let out = String(text ?? '');
  for (const [re, to] of UNICODE_FIXES) out = out.replace(re, to);
  return out;
}

// ─── request translation ────────────────────────────────────────────────────────────────────

type Part = { text?: string; inlineData?: { mimeType?: string; data?: string }; thought?: boolean };
type Content = { role?: string; parts?: Part[] };

/** Loosely-typed view of the `@google/genai` request — only the fields that translate. */
export interface GeminiLikeRequest {
  model?: string;
  contents?: Content[] | string;
  config?: {
    systemInstruction?: unknown;
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
    responseModalities?: unknown[];
    speechConfig?: unknown;
    [k: string]: unknown;
  };
}

/**
 * True when the request is text in AND text out.
 *
 * The routing decision, made structurally rather than from an allowlist of action names, so a
 * multimodal action added later routes correctly with no list to remember to update. Two things
 * disqualify a request:
 *
 *   1. An `inlineData` part — an image, a PDF or an mp4. Groq's chat endpoint cannot read it.
 *      (`screenshot-to-code`, `x-subtitles`, `image-carousel-deck`.)
 *   2. A non-TEXT `responseModalities`, which is how a request asks for something other than text
 *      back. `synthesizeSpeech` is the live case: its INPUT is a plain string, so an
 *      input-only check would happily route a text-to-speech call to a chat endpoint and get
 *      prose where the caller needed PCM audio.
 */
export function isTextOnlyRequest(params: GeminiLikeRequest): boolean {
  const modalities = params?.config?.responseModalities;
  if (Array.isArray(modalities) && modalities.some((m) => String(m).toUpperCase() !== 'TEXT')) return false;
  // A speech config is only ever present on a TTS call; belt and braces alongside the modality
  // check, since an SDK version that defaults the modalities array would otherwise slip through.
  if (params?.config?.speechConfig) return false;

  const contents = params?.contents;
  if (typeof contents === 'string') return true;
  if (!Array.isArray(contents)) return false;
  return contents.every((c) => (c?.parts ?? []).every((p) => !p?.inlineData));
}

/** Flatten a Gemini `systemInstruction` — which may be a string, a Part, or a Content — into text. */
function systemText(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.map(systemText).filter(Boolean).join('\n\n');
  const obj = raw as { text?: string; parts?: Part[] };
  if (typeof obj.text === 'string') return obj.text;
  if (Array.isArray(obj.parts)) return obj.parts.map((p) => p?.text ?? '').filter(Boolean).join('\n');
  return '';
}

/** Gemini `contents` → OpenAI `messages`. */
export function toGroqMessages(params: GeminiLikeRequest): { role: string; content: string }[] {
  const messages: { role: string; content: string }[] = [];
  const sys = systemText(params.config?.systemInstruction);
  if (sys) messages.push({ role: 'system', content: sys });

  const contents = params.contents;
  if (typeof contents === 'string') {
    messages.push({ role: 'user', content: contents });
    return messages;
  }
  for (const c of contents ?? []) {
    const text = (c?.parts ?? [])
      .filter((p) => typeof p?.text === 'string' && !p.thought)
      .map((p) => p.text as string)
      .join('\n')
      .trim();
    if (!text) continue;
    // Gemini calls the assistant turn "model"; OpenAI calls it "assistant". Every other role maps
    // straight through, and an absent role is a user turn.
    messages.push({ role: c?.role === 'model' ? 'assistant' : 'user', content: text });
  }
  return messages;
}

// ─── errors + retry ─────────────────────────────────────────────────────────────────────────

export class GroqError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;
  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = 'GroqError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const withJitter = (ms: number) => Math.round(ms * (0.8 + Math.random() * 0.4));

/** Transient 5xx: two retries. Per-minute 429: three, honouring Retry-After when Groq sends one.
 *  Same policy shape as the Gemini client, so the two providers behave alike under load. */
const TRANSIENT_WAITS_MS = [600, 1500];
const RATE_WAITS_MS = [1500, 3000, 6000];
const MAX_RATE_WAIT_MS = 30000;
const REQUEST_TIMEOUT_MS = 60000;

/** The response shape the rest of the codebase already knows how to read. `requireText()` reads
 *  `.text` and `.candidates[0].finishReason`; both are populated here. */
export interface GroqGeminiLikeResponse {
  text: string;
  //  is declared but never populated: Groq returns text only. It is here so this type
  // stays assignment-compatible with the Gemini response the callers already destructure — see
  // synthesizeSpeech, which reads parts[].inlineData off the shared return type.
  candidates: {
    finishReason: string;
    content: { parts: { text: string; inlineData?: { data?: string; mimeType?: string } }[]; role: string };
  }[];
  usageMetadata: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
  /** Which provider actually answered — surfaced in logs so a fallback is visible, not silent. */
  provider: 'groq';
  modelUsed: string;
}

/** OpenAI finish reasons → the Gemini vocabulary `requireText()` branches on. */
function toGeminiFinishReason(raw: string): string {
  if (raw === 'length') return 'MAX_TOKENS';
  if (raw === 'content_filter') return 'SAFETY';
  return 'STOP';
}

/**
 * One Groq call with the shared retry policy, taking and returning the Gemini shapes.
 *
 * `scrub` mirrors the Gemini client's option exactly: prose gets `scrubAiPhrases`, code does not,
 * because that scrubber collapses runs of whitespace and would destroy the indentation of a
 * generated component.
 */
export async function groqGenerate(
  params: GeminiLikeRequest,
  options: { scrub?: boolean } = {}
): Promise<GroqGeminiLikeResponse> {
  if (!KEY_LOOKS_REAL) throw new Error(groqConfigReason() ?? 'GROQ_API_KEY not configured');

  const messages = toGroqMessages(params);
  if (!messages.some((m) => m.role !== 'system')) {
    throw new Error('groqGenerate: request carried no user content');
  }

  const body: Record<string, unknown> = {
    model: GROQ_TEXT_MODEL,
    messages,
    temperature: typeof params.config?.temperature === 'number' ? params.config.temperature : 0.6,
  };
  if (typeof params.config?.topP === 'number') body.top_p = params.config.topP;
  // A 12-slide deck runs ~3.2k completion tokens and the biggest prompts here go further. Groq's
  // default ceiling truncates them mid-JSON, which surfaces as an unparseable answer rather than as
  // the "ran out of room" it actually is, so a generous default is set when the caller names none.
  body.max_tokens = typeof params.config?.maxOutputTokens === 'number' ? params.config.maxOutputTokens : 8000;
  // Gemini's `responseMimeType: 'application/json'` is OpenAI's `response_format`. Carrying it over
  // is what keeps every `parseJsonOrThrow` caller working — without it the model wraps its JSON in
  // prose and every structured action fails at the parse step.
  const wantsJson = params.config?.responseMimeType === 'application/json';
  if (wantsJson) body.response_format = { type: 'json_object' };

  let transientRetries = 0;
  let rateRetries = 0;

  for (let attempt = 1; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${RAW_GROQ_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      // A network failure or a timeout is transient; anything else is not worth a retry.
      if (transientRetries >= TRANSIENT_WAITS_MS.length) {
        throw new GroqError(`groq request failed: ${(err as Error)?.message ?? String(err)}`, 0);
      }
      console.warn(`[groq] request failed (attempt ${attempt}):`, (err as Error)?.message);
      await sleep(TRANSIENT_WAITS_MS[transientRetries++]);
      continue;
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      if (rateRetries >= RATE_WAITS_MS.length) {
        throw new GroqError('groq rate limit exceeded', 429, retryAfter || null);
      }
      const waitMs = Math.max(RATE_WAITS_MS[rateRetries], retryAfter * 1000);
      if (waitMs > MAX_RATE_WAIT_MS) throw new GroqError('groq rate limit exceeded', 429, retryAfter || null);
      rateRetries++;
      await sleep(withJitter(waitMs));
      continue;
    }

    if (res.status >= 500) {
      if (transientRetries >= TRANSIENT_WAITS_MS.length) {
        throw new GroqError(`groq upstream ${res.status}`, res.status);
      }
      await sleep(TRANSIENT_WAITS_MS[transientRetries++]);
      continue;
    }

    const payload = (await res.json().catch(() => null)) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      error?: { message?: string; code?: string };
    } | null;

    if (!res.ok) {
      const detail = payload?.error?.message ?? `http ${res.status}`;
      // Groq's strict JSON mode answers 400 "Failed to validate/generate JSON" when the model's
      // own output does not satisfy the json_object contract. It is INTERMITTENT — the same prompt
      // succeeds on a retry — so one retry without `response_format` is worth taking before giving
      // up on the provider: the answer then arrives as ordinary text, and `stripCodeFence()` +
      // `parseJsonOrThrow()` (which every structured caller here already runs) handle it exactly
      // as they handle Gemini's, which has never had a JSON mode in this codebase either.
      if (res.status === 400 && wantsJson && body.response_format && /json/i.test(detail)) {
        console.warn('[groq] strict JSON mode rejected the generation, retrying without it');
        delete body.response_format;
        continue;
      }
      throw new GroqError(`groq ${res.status}: ${detail}`, res.status);
    }

    const choice = payload?.choices?.[0];
    // Normalised BEFORE anything downstream sees it, so the bidi wrapper, the JSON parser and every
    // clamp helper all work on ASCII hyphens and real spaces.
    const raw = normalizeModelUnicode(choice?.message?.content ?? '');
    const text = options.scrub === false ? raw : scrubAiPhrases(raw);

    return {
      text,
      candidates: [
        {
          finishReason: toGeminiFinishReason(String(choice?.finish_reason ?? '')),
          content: { parts: [{ text }], role: 'model' },
        },
      ],
      usageMetadata: {
        promptTokenCount: payload?.usage?.prompt_tokens ?? 0,
        candidatesTokenCount: payload?.usage?.completion_tokens ?? 0,
        totalTokenCount: payload?.usage?.total_tokens ?? 0,
      },
      provider: 'groq',
      modelUsed: GROQ_TEXT_MODEL,
    };
  }
}
