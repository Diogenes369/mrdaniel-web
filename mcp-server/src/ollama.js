import { config } from './env.js';

/**
 * The local Ollama instance (default http://127.0.0.1:11434).
 *
 * This is the opposite trade-off from `site.js`: content that has to match the published voice goes
 * through the production `/api/agent-generate`, because GEMINI_API_KEY and the voice rules live
 * there. Ollama is for the work that should never leave the machine or burn paid quota — drafting,
 * translation, reshaping text into JSON, and dry-running a prompt before spending a Gemini call.
 *
 * Nothing here writes to Firebase. Callers decide what to do with the text.
 */

const DEFAULT_URL = 'http://127.0.0.1:11434';

/** Ollama keeps a model resident for `keep_alive` after a call; the first call of the day still pays the load. */
const LOAD_GRACE_MS = 120000;

async function ollamaFetch(pathname, { method = 'GET', body, timeoutMs = LOAD_GRACE_MS } = {}) {
  const base = config.ollama.url.replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${base}${pathname}`, {
      method,
      signal: controller.signal,
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    if (!res.ok) {
      // Ollama reports a missing model as 404 {"error":"model 'x' not found"} — surface that verbatim.
      let detail = text.slice(0, 300);
      try {
        detail = JSON.parse(text).error ?? detail;
      } catch {
        // non-JSON error body; the status plus the raw snippet is enough to act on
      }
      throw new Error(`ollama ${method} ${pathname} → ${res.status}: ${detail}`);
    }
    return { json: JSON.parse(text), ms: Date.now() - started };
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`ollama ${pathname} timed out after ${timeoutMs}ms`);
    if (err?.cause?.code === 'ECONNREFUSED') throw new Error(`ollama is not running at ${base} — start it with \`ollama serve\``);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Installed models plus the server version. The cheapest proof that Ollama is actually up. */
export async function ollamaHealth() {
  const [tags, version] = await Promise.all([ollamaFetch('/api/tags'), ollamaFetch('/api/version', { timeoutMs: 5000 })]);
  const models = (tags.json.models ?? []).map((m) => ({
    name: m.name,
    parameters: m.details?.parameter_size,
    quantization: m.details?.quantization_level,
    contextLength: m.details?.context_length,
    sizeGb: m.size ? Number((m.size / 1e9).toFixed(2)) : undefined,
  }));
  return { ok: true, url: config.ollama.url, version: version.json.version, defaultModel: config.ollama.model, models };
}

/**
 * Resolve the model to use. An explicit name wins; otherwise OLLAMA_MODEL; otherwise the first
 * installed model, so a fresh machine with one model pulled works without any configuration.
 */
async function resolveModel(requested) {
  if (requested) return requested;
  if (config.ollama.model) return config.ollama.model;
  const { json } = await ollamaFetch('/api/tags', { timeoutMs: 5000 });
  const first = json.models?.[0]?.name;
  if (!first) throw new Error('no models installed in Ollama — pull one, e.g. `ollama pull llama3`');
  return first;
}

function buildMessages({ prompt, system }) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  return messages;
}

/**
 * One non-streaming chat completion.
 *
 * `format` is Ollama's structured-output hook: pass a JSON schema object and the sampler is
 * constrained to it, which is what makes `ollamaJson` reliable rather than a parse-and-pray.
 */
async function chat({ prompt, system, model, temperature, maxTokens, format, timeoutMs }) {
  const resolved = await resolveModel(model);
  const { json, ms } = await ollamaFetch('/api/chat', {
    method: 'POST',
    timeoutMs,
    body: {
      model: resolved,
      messages: buildMessages({ prompt, system }),
      stream: false,
      ...(format ? { format } : {}),
      options: {
        ...(temperature === undefined ? {} : { temperature }),
        ...(maxTokens === undefined ? {} : { num_predict: maxTokens }),
      },
    },
  });
  return {
    model: resolved,
    text: json.message?.content ?? '',
    ms,
    tokens: { prompt: json.prompt_eval_count, completion: json.eval_count },
    doneReason: json.done_reason,
  };
}

/** Free-text generation. */
export async function ollamaGenerate({ prompt, system, model, temperature = 0.7, maxTokens, timeoutMs }) {
  if (!prompt?.trim()) throw new Error('prompt is required');
  return chat({ prompt, system, model, temperature, maxTokens, timeoutMs });
}

/**
 * Generation constrained to a JSON schema. Returns the parsed object.
 *
 * A local 8B model will still occasionally wrap the object in prose despite `format`, so the parse
 * falls back to the first balanced `{...}` or `[...]` in the response before giving up.
 */
export async function ollamaJson({ prompt, system, schema, model, temperature = 0.2, maxTokens, timeoutMs }) {
  if (!prompt?.trim()) throw new Error('prompt is required');
  if (!schema || typeof schema !== 'object') throw new Error('schema must be a JSON Schema object');
  const result = await chat({
    prompt,
    system: system ?? 'You output JSON only. No prose, no markdown fences, no commentary.',
    model,
    temperature,
    maxTokens,
    format: schema,
    timeoutMs,
  });
  return { ...result, data: parseJson(result.text) };
}

function parseJson(text) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const salvaged = firstBalanced(trimmed);
    if (salvaged) {
      try {
        return JSON.parse(salvaged);
      } catch {
        // fall through to the shared error below
      }
    }
    throw new Error(`model did not return JSON: ${trimmed.slice(0, 200)}`);
  }
}

/** First balanced {...} or [...] in the text, ignoring braces inside string literals. */
function firstBalanced(text) {
  const start = text.search(/[{[]/);
  if (start === -1) return null;
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Translation that preserves formatting. Hebrew is the house language, so it is the default target
 * and the prompt says so explicitly — a bare "translate" prompt on an 8B model tends to drift into
 * transliteration or drop the RTL punctuation.
 */
export async function ollamaTranslate({ text, to = 'Hebrew', from, model, timeoutMs }) {
  if (!text?.trim()) throw new Error('text is required');
  const system = [
    `You are a professional translator into ${to}.`,
    from ? `The source language is ${from}.` : 'Detect the source language yourself.',
    'Rules: translate meaning, not words. Keep line breaks, lists, emoji and any @handles or #hashtags exactly as they are.',
    'Never transliterate a word you can translate. Never add, explain or summarise anything.',
    'Output the translation only.',
  ].join(' ');
  return chat({ prompt: text, system, model, temperature: 0.2, timeoutMs });
}
