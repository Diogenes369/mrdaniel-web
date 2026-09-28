import Anthropic from '@anthropic-ai/sdk';
import { scrubAiPhrases } from './expertVoice.js';
import { normalizeModelUnicode, toGroqMessages, type GeminiLikeRequest } from './groqClient.js';

/**
 * The Claude client — the CAROUSEL leg of the model router, and nothing else.
 *
 * ## Why only carousels
 *
 * Decided 2026-09-28: a designed slide deck is the one output where writing quality is the product.
 * It is read slide by slide, saved, and judged on whether it sounds like a person; a 20-item listicle
 * compressed into four paragraphs, or a deck that opens every slide the same way, is the failure the
 * operator keeps flagging. Claude Opus 5.5 is measurably better at long structured Hebrew and at
 * covering every item of a source without dropping any. It is also the only PAID leg in the router,
 * so it is spent where it earns its cost and nowhere else: news summaries, captions, posts, email
 * and translation stay on the free Gemini/Groq waterfall.
 *
 * The restriction is enforced at the call site, not here: `generateContentWithRetry` only plans a
 * Claude leg when the caller passes `tier: 'carousel'`, and only the deck generators do. A new
 * caller gets the free waterfall unless someone deliberately opts it in.
 *
 * ## Why it speaks Gemini's shape
 *
 * Same reason as groqClient.ts: every generator already builds an `@google/genai` request, so the
 * router can swap providers with no change at any call site, and `requireText` / `stripCodeFence` /
 * `parseJsonOrThrow` read the answer unchanged. The message translation is Groq's own
 * (`toGroqMessages`), so the two text providers cannot drift in what they ask the model.
 *
 * `ANTHROPIC_API_KEY` is optional. Unset, no Claude leg is ever planned and carousels run on the
 * free waterfall exactly as before.
 */

/** Overridable so a model launch or rollback is a config change. Named explicitly by the operator. */
export const CLAUDE_CAROUSEL_MODEL = process.env.CLAUDE_CAROUSEL_MODEL?.trim() || 'claude-opus-5-5';

/**
 * Effort, set explicitly: Opus 5.5 defaults to `medium` (one below Opus 5) and thinking cannot be
 * disabled at all, so effort is the only cost/latency lever. `medium` measured as the right point for
 * a deck: `high` adds tens of seconds on a 16-slide listicle, which the 180s function cannot spare
 * once a fallback leg might still need to run.
 */
const CLAUDE_EFFORT = ((): 'low' | 'medium' | 'high' | 'xhigh' | 'max' => {
  const v = process.env.CLAUDE_CAROUSEL_EFFORT?.trim().toLowerCase();
  return v === 'low' || v === 'high' || v === 'xhigh' || v === 'max' ? v : 'medium';
})();

/**
 * Hard wall-clock ceiling for one Claude call. Past it the call is abandoned and the router hands the
 * deck to Gemini/Groq, which answer in seconds — so a slow Claude turn costs latency, never the deck.
 */
const CLAUDE_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS) || 90_000;

/** A 16-slide deck with 20 covered items runs ~6k output tokens; thinking shares this ceiling. */
const CLAUDE_MAX_TOKENS = Number(process.env.CLAUDE_MAX_OUTPUT_TOKENS) || 32_000;

const RAW_KEY = process.env.ANTHROPIC_API_KEY?.trim().replace(/^["']|["']$/g, '') ?? '';
const KEY_LOOKS_REAL = RAW_KEY.length >= 20 && !/^(?:your|placeholder|changeme|xxx|todo|<)/i.test(RAW_KEY);

/** A kill switch that does not require deleting the key: CLAUDE_CAROUSELS=off. */
const DISABLED = /^(?:0|off|false|no)$/i.test(process.env.CLAUDE_CAROUSELS?.trim() ?? '');

// maxRetries 1: the router already has a fallback chain; retrying a slow Opus call twice would burn
// the whole function budget before Gemini ever got a turn.
const client = KEY_LOOKS_REAL && !DISABLED ? new Anthropic({ apiKey: RAW_KEY, maxRetries: 1, timeout: CLAUDE_TIMEOUT_MS }) : null;

export function isClaudeConfigured(): boolean {
  return client !== null;
}

export function claudeConfigReason(): string | null {
  if (client) return null;
  if (DISABLED) return 'CLAUDE_CAROUSELS is switched off';
  if (!RAW_KEY) return 'ANTHROPIC_API_KEY is not set in this runtime';
  return 'ANTHROPIC_API_KEY is set but does not look like a real key (placeholder or truncated value)';
}

/** Same response shape the Groq client returns — see GroqGeminiLikeResponse for why. */
export interface ClaudeGeminiLikeResponse {
  text: string;
  candidates: {
    finishReason: string;
    content: { parts: { text: string; inlineData?: { data?: string; mimeType?: string } }[]; role: string };
  }[];
  usageMetadata: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
  provider: 'claude';
  modelUsed: string;
}

/**
 * One Claude call, taking and returning the Gemini shapes. Throws on any failure (including a
 * refusal) so the router moves to the next leg; never returns a partial answer as if it were whole.
 */
export async function claudeGenerate(params: GeminiLikeRequest, options: { scrub?: boolean } = {}): Promise<ClaudeGeminiLikeResponse> {
  if (!client) throw new Error(claudeConfigReason() ?? 'ANTHROPIC_API_KEY not configured');

  const all = toGroqMessages(params);
  const system = all.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const messages: Anthropic.MessageParam[] = all
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const), content: m.content }));
  if (!messages.length) throw new Error('claudeGenerate: request carried no user content');
  // No assistant prefill on Opus 5.5 (400). A trailing model turn in a Gemini request is a prefill.
  if (messages[messages.length - 1].role === 'assistant') messages.pop();

  // Gemini's JSON mode has no Claude equivalent that fits every deck schema, so the contract is
  // stated in the system prompt — the same way the Gemini path has always worked here — and the
  // callers' stripCodeFence/parseJsonOrThrow handle the answer.
  const wantsJson = params.config?.responseMimeType === 'application/json';
  const jsonNote = wantsJson ? '\n\nOutput contract: reply with the JSON only — no prose before or after it, no markdown code fence.' : '';

  const started = Date.now();
  // Streaming + finalMessage: a long deck at a 32k ceiling would otherwise risk an HTTP timeout.
  const stream = client.messages.stream({
    model: CLAUDE_CAROUSEL_MODEL,
    max_tokens: CLAUDE_MAX_TOKENS,
    thinking: { type: 'adaptive' },
    output_config: { effort: CLAUDE_EFFORT },
    // Stable system prompt first so a burst of decks on the same template hits the cache.
    system: system ? [{ type: 'text', text: system + jsonNote, cache_control: { type: 'ephemeral' } }] : jsonNote.trim() || undefined,
    messages,
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    throw new Error(`claude refusal (${message.stop_details?.category ?? 'uncategorised'})`);
  }
  const raw = normalizeModelUnicode(
    message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
  );
  if (!raw) throw new Error(`claude returned no text (stop_reason: ${message.stop_reason})`);
  const text = options.scrub === false ? raw : scrubAiPhrases(raw);

  console.info(
    `[claude] ${CLAUDE_CAROUSEL_MODEL} effort=${CLAUDE_EFFORT} in ${Math.round((Date.now() - started) / 1000)}s — ` +
      `in ${message.usage.input_tokens} (cache read ${message.usage.cache_read_input_tokens ?? 0}) / out ${message.usage.output_tokens}`
  );

  return {
    text,
    candidates: [
      {
        // requireText() branches on the Gemini vocabulary; a cut-off deck must read as MAX_TOKENS.
        finishReason: message.stop_reason === 'max_tokens' ? 'MAX_TOKENS' : 'STOP',
        content: { parts: [{ text }], role: 'model' },
      },
    ],
    usageMetadata: {
      promptTokenCount: message.usage.input_tokens,
      candidatesTokenCount: message.usage.output_tokens,
      totalTokenCount: message.usage.input_tokens + message.usage.output_tokens,
    },
    provider: 'claude',
    modelUsed: CLAUDE_CAROUSEL_MODEL,
  };
}
