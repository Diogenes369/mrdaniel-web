/**
 * xAI (Grok) client — the one place this repo talks to `api.x.ai`.
 *
 * ## Why a hand-rolled fetch client and not the OpenAI / AI SDK packages
 *
 * Every other provider in this repo is reached the same way (see geminiClient.ts), the Vercel Hobby
 * bundle stays small, and xAI's REST surface is OpenAI-compatible enough that two endpoints cover
 * everything we need:
 *   - `POST /v1/chat/completions` — plain text / JSON generation (carousel + thread drafting).
 *   - `POST /v1/responses` with the server-side `x_search` tool — the only way to read a profile's
 *     latest posts now that X's free syndication timeline answers 429 to everyone
 *     (verified 2026-09-21, see xFeed.ts).
 *
 * ## Billing — X Premium is NOT API access
 *
 * An X Premium (Blue) subscription unlocks Grok inside the X apps only. The API is billed
 * separately per token (and, from 2026-09-21, `x_search` per post fetched) on console.x.ai. The key
 * lives in `XAI_API_KEY`; with it unset every caller gets `XaiNotConfiguredError` and falls back.
 *
 * Model: `XAI_MODEL` overrides the default. `grok-4.7` is the current flagship per docs.x.ai
 * (checked 2026-09-21); the bare alias tracks the latest stable build.
 */

export const XAI_BASE_URL = 'https://api.x.ai/v1';
export const XAI_DEFAULT_MODEL = 'grok-4.7';

export class XaiNotConfiguredError extends Error {
  readonly code = 'not_configured';
  constructor() {
    super('XAI_API_KEY is not configured');
  }
}

export class XaiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`xAI responded ${status}: ${body.slice(0, 300)}`);
  }
}

export function xaiApiKey(): string {
  return (process.env.XAI_API_KEY || '').trim();
}

export function isXaiConfigured(): boolean {
  return xaiApiKey().length > 0;
}

export function xaiModel(): string {
  return (process.env.XAI_MODEL || '').trim() || XAI_DEFAULT_MODEL;
}

/**
 * Free probe: `GET /v1/models` is not billed, and a team without credits answers it 403
 * ("doesn't have any credits or licenses yet", verified 2026-09-22). `usable: false` means callers
 * should expect the Groq fallback, not that the key is wrong.
 */
export async function probeXai(timeoutMs = 4000): Promise<{ usable: boolean; status: number; reason: string }> {
  const key = xaiApiKey();
  if (!key) return { usable: false, status: 0, reason: 'not_configured' };
  try {
    const res = await fetch(`${XAI_BASE_URL}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) return { usable: true, status: res.status, reason: 'ok' };
    return { usable: false, status: res.status, reason: res.status === 402 || res.status === 403 ? 'no_credits' : res.status === 401 ? 'bad_key' : 'upstream' };
  } catch {
    return { usable: false, status: 0, reason: 'unreachable' };
  }
}

async function xaiPost(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const key = xaiApiKey();
  if (!key) throw new XaiNotConfiguredError();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${XAI_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new XaiHttpError(res.status, text);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export interface GrokChatOptions {
  system: string;
  user: string;
  /** Ask for a JSON object back (`response_format: json_object`). */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/** One chat completion; returns the assistant text. Throws `XaiNotConfiguredError` / `XaiHttpError`. */
export async function grokChat(opts: GrokChatOptions): Promise<string> {
  const data = (await xaiPost(
    '/chat/completions',
    {
      model: xaiModel(),
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      temperature: opts.temperature ?? 0.8,
      max_tokens: opts.maxTokens ?? 6000,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    },
    opts.timeoutMs ?? 100_000,
  )) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('xAI returned an empty completion');
  return text;
}

export interface XSearchOptions {
  prompt: string;
  system?: string;
  /** `allowed_x_handles` — without the "@". Max 20. */
  handles?: string[];
  /** ISO `YYYY-MM-DD`. */
  fromDate?: string;
  timeoutMs?: number;
}

export interface XSearchResult {
  text: string;
  /** Every URL the model cited — post permalinks for x_search. */
  citations: string[];
}

/**
 * A Responses-API call with the server-side `x_search` tool enabled. The payload shape follows
 * docs.x.ai/developers/tools/x-search (read 2026-09-21). Output is parsed defensively: text from
 * every `output_text` part, citations from `url_citation` annotations plus the top-level
 * `citations` array some SDK versions return.
 */
export async function grokXSearch(opts: XSearchOptions): Promise<XSearchResult> {
  const tool: Record<string, unknown> = { type: 'x_search' };
  if (opts.handles?.length) tool.allowed_x_handles = opts.handles.slice(0, 20);
  if (opts.fromDate) tool.from_date = opts.fromDate;
  const input: { role: string; content: string }[] = [];
  if (opts.system) input.push({ role: 'system', content: opts.system });
  input.push({ role: 'user', content: opts.prompt });

  const data = (await xaiPost('/responses', { model: xaiModel(), input, tools: [tool] }, opts.timeoutMs ?? 90_000)) as Record<string, unknown>;

  const texts: string[] = [];
  const citations = new Set<string>();
  const output = Array.isArray(data.output) ? (data.output as Record<string, unknown>[]) : [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? (item.content as Record<string, unknown>[]) : [];
    for (const part of content) {
      if (typeof part.text === 'string') texts.push(part.text);
      const annotations = Array.isArray(part.annotations) ? (part.annotations as Record<string, unknown>[]) : [];
      for (const a of annotations) if (typeof a.url === 'string') citations.add(a.url);
    }
  }
  if (typeof data.output_text === 'string' && !texts.length) texts.push(data.output_text);
  if (Array.isArray(data.citations)) for (const c of data.citations) if (typeof c === 'string') citations.add(c);
  return { text: texts.join('\n').trim(), citations: [...citations] };
}

/** Pull the first JSON object/array out of a model answer (tolerates code fences and preambles). */
export function parseGrokJson(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('xAI answer was not JSON');
  }
}

/** Maps an xAI failure onto the HTTP status + Hebrew message the dashboard already renders. */
export function describeXaiError(err: unknown): { status: number; code: string; message: string } {
  if (err instanceof XaiNotConfiguredError) {
    return { status: 503, code: 'not_configured', message: 'XAI_API_KEY לא מוגדר. הדביקו מפתח מ-console.x.ai בהגדרות הסביבה של Vercel.' };
  }
  if (err instanceof XaiHttpError) {
    if (err.status === 401 || err.status === 403) return { status: 502, code: 'bad_key', message: 'מפתח ה-xAI נדחה. בדקו שהמפתח תקף ושיש לו הרשאה למודל.' };
    if (err.status === 402) return { status: 402, code: 'no_credits', message: 'נגמר הקרדיט בחשבון ה-xAI. מנוי X Premium לא כולל גישת API — יש לטעון קרדיט ב-console.x.ai.' };
    if (err.status === 429) return { status: 429, code: 'rate_limited', message: 'Grok עמוס כרגע (429). נסו שוב בעוד דקה.' };
    return { status: 502, code: 'upstream', message: `שגיאה מ-xAI (${err.status}).` };
  }
  if ((err as Error)?.name === 'AbortError') return { status: 504, code: 'timeout', message: 'Grok לא ענה בזמן.' };
  return { status: 500, code: 'error', message: (err as Error)?.message || 'שגיאה לא צפויה מול xAI.' };
}
