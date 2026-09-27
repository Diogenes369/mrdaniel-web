/**
 * Source fidelity for product / model names — "Claude Opus 5.5" in the article must come out as
 * "Claude Opus 5.5" on the slide, never "Claude 3.5 Opus".
 *
 * Why this exists: every text model this repo calls (gpt-oss on Groq, Gemini Flash, Grok) was
 * trained before the releases this hub covers. When a source names a model newer than the
 * generator's own knowledge, the generator "corrects" it to the closest name it has seen — the
 * version it remembers, the tier order it remembers. Nothing upstream is stale: the audit on
 * 2026-09-27 found no old model name in any prompt, and the importers pass the article through
 * intact. The drift is the model's prior overriding the input, and it hits exactly the facts this
 * brand is judged on.
 *
 * Two layers, both applied centrally in `generateContentWithRetry` so no generator can opt in late:
 *   1. **Lock** — the versioned names found in the request's user content are listed back to the
 *      model as a verbatim-copy rule in the system instruction.
 *   2. **Repair** — the answer is scanned for versioned names of the same families; one whose
 *      version is not in the source is rewritten to the source's name when that is unambiguous,
 *      or stripped to the bare family name when it is not. No prompt reliably prevents the drift,
 *      and a fabricated version number is a fabricated fact, so the backstop runs in code.
 *
 * Deliberately narrow: only *versioned* mentions of known model families are touched. A bare
 * "Claude", an unrelated number, or a family the source never names are all left alone — the
 * repair can only ever move a name TOWARD what the source says.
 */

interface FamilyDef {
  id: string;
  display: string;
  /** How the display name joins its first token: "GPT-6" vs "Claude Opus". */
  joiner: string;
  latin: string[];
  hebrew: string[];
}

const FAMILIES: FamilyDef[] = [
  { id: 'claude', display: 'Claude', joiner: ' ', latin: ['claude'], hebrew: ['קלוד'] },
  { id: 'gpt', display: 'GPT', joiner: '-', latin: ['gpt', 'chatgpt'], hebrew: ["ג'יפיטי", 'ג׳יפיטי', 'ג׳י פי טי'] },
  { id: 'gemini', display: 'Gemini', joiner: ' ', latin: ['gemini'], hebrew: ["ג'מיני", 'ג׳מיני', 'גמיני'] },
  { id: 'gemma', display: 'Gemma', joiner: ' ', latin: ['gemma'], hebrew: [] },
  { id: 'grok', display: 'Grok', joiner: ' ', latin: ['grok'], hebrew: ['גרוק'] },
  { id: 'llama', display: 'Llama', joiner: ' ', latin: ['llama'], hebrew: ['לאמה', 'ללאמה'] },
  { id: 'mistral', display: 'Mistral', joiner: ' ', latin: ['mistral', 'mixtral'], hebrew: ['מיסטרל'] },
  { id: 'qwen', display: 'Qwen', joiner: ' ', latin: ['qwen'], hebrew: [] },
  { id: 'deepseek', display: 'DeepSeek', joiner: '-', latin: ['deepseek'], hebrew: ['דיפסיק'] },
  { id: 'kimi', display: 'Kimi', joiner: ' ', latin: ['kimi'], hebrew: [] },
  { id: 'phi', display: 'Phi', joiner: '-', latin: ['phi'], hebrew: [] },
  { id: 'sora', display: 'Sora', joiner: ' ', latin: ['sora'], hebrew: ['סורה'] },
  { id: 'veo', display: 'Veo', joiner: ' ', latin: ['veo'], hebrew: [] },
  { id: 'imagen', display: 'Imagen', joiner: ' ', latin: ['imagen'], hebrew: [] },
];

/** Tier words, Latin → display. Claude's tiers also START a mention ("Opus 3.5" with no family). */
const TIERS: Record<string, string> = {
  opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku', fable: 'Fable',
  pro: 'Pro', flash: 'Flash', lite: 'Lite', 'flash-lite': 'Flash-Lite', ultra: 'Ultra', nano: 'Nano',
  mini: 'mini', luna: 'Luna', sol: 'Sol', astra: 'Astra', turbo: 'Turbo', max: 'Max',
  large: 'Large', medium: 'Medium', small: 'Small', coder: 'Coder', code: 'Code',
  instant: 'Instant', thinking: 'Thinking', preview: 'Preview', vision: 'Vision',
  scout: 'Scout', maverick: 'Maverick', heavy: 'Heavy',
};
const HEBREW_TIERS: Record<string, string> = {
  'אופוס': 'opus', 'סונט': 'sonnet', 'הייקו': 'haiku', 'פייבל': 'fable', 'פרו': 'pro', 'פלאש': 'flash',
};
const CLAUDE_TIERS = new Set(['opus', 'sonnet', 'haiku', 'fable']);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const LEADS: Array<{ word: string; family: string; tier?: string }> = [
  ...FAMILIES.flatMap((f) => [...f.latin, ...f.hebrew].map((word) => ({ word, family: f.id }))),
  ...[...CLAUDE_TIERS].map((t) => ({ word: t, family: 'claude', tier: t })),
  ...Object.entries(HEBREW_TIERS)
    .filter(([, t]) => CLAUDE_TIERS.has(t))
    .map(([word, t]) => ({ word, family: 'claude', tier: t })),
];
// Longest first so "chatgpt" wins over "gpt" and "flash-lite" over "flash".
LEADS.sort((a, b) => b.word.length - a.word.length);
const LEAD_LOOKUP = new Map(LEADS.map((l) => [l.word.toLowerCase(), l]));

// A lead may carry a one-letter Hebrew prefix ("בקלוד", "לGPT", "ו-Gemini"). Latin leads must not
// sit inside a longer Latin word ("Claudette", "megrok").
const HEB_PREFIX = '(?:[והבלמשכ][-־]?)?';
const LEAD_RE = new RegExp(
  `(?<![A-Za-z0-9\\u0590-\\u05FF])${HEB_PREFIX}(${LEADS.map((l) => esc(l.word)).join('|')})(?![A-Za-z])`,
  'giu'
);
// Bidi marks count as separators: text that already went through the Hebrew sanitizer (a slide
// being re-edited) carries RLM / LRI…PDI around the version.
const SEP = '[\\s\\-\\u2010\\u2011\\u05BE\\u200E\\u200F\\u2066-\\u2069]{1,4}';
// A trailing "." is a version separator only before a digit — "Grok 4." ends a sentence.
const TOKEN_RE = new RegExp(
  `^${SEP}(flash-lite|[A-Za-z]+|[\\u0590-\\u05FF]+|[vVrR]?\\d+(?:\\.\\d+)*[a-zA-Z]?)(?![A-Za-z0-9]|\\.\\d)`,
  'u'
);
const VERSION_RE = /^[vr]?\d+(?:\.\d+)*[a-z]?$/i;
const SIZE_RE = /^\d+(?:\.\d+)?[bm]$/i;

export interface ModelMention {
  /** Exact text as it appears, including any tokens after the lead. */
  text: string;
  start: number;
  end: number;
  family: string;
  /** Lower-case versions in order, e.g. ["5.5"]. Never empty. */
  versions: string[];
  /** Lower-case tier words, e.g. ["opus"]. */
  tiers: string[];
  /** Parameter-size tokens ("70b"). Kept so they are re-emitted, never compared. */
  sizes: string[];
  /** Tokens in their original order, normalised to Latin where a Hebrew alias was used. */
  tokens: Array<{ kind: 'version' | 'tier' | 'size'; value: string }>;
}

/** Every versioned model mention in `text`. A mention with no version token is not returned. */
export function findModelMentions(text: string): ModelMention[] {
  const out: ModelMention[] = [];
  if (!text) return out;
  LEAD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LEAD_RE.exec(text))) {
    const lead = LEAD_LOOKUP.get(m[1].toLowerCase());
    if (!lead) continue;
    const leadStart = m.index + m[0].length - m[1].length;
    let end = m.index + m[0].length;
    const tokens: ModelMention['tokens'] = [];
    if (lead.tier) tokens.push({ kind: 'tier', value: lead.tier });

    // A GPT/DeepSeek/Phi version is often glued with a hyphen ("GPT-6"), which SEP covers.
    for (let i = 0; i < 4; i++) {
      const t = TOKEN_RE.exec(text.slice(end));
      if (!t) break;
      const raw = t[1];
      const lower = raw.toLowerCase();
      let token: ModelMention['tokens'][number] | null = null;
      if (SIZE_RE.test(raw)) token = { kind: 'size', value: lower };
      else if (VERSION_RE.test(raw)) token = { kind: 'version', value: lower };
      else if (TIERS[lower]) token = { kind: 'tier', value: lower };
      else if (HEBREW_TIERS[raw]) token = { kind: 'tier', value: HEBREW_TIERS[raw] };
      if (!token) break;
      tokens.push(token);
      end += t[0].length;
    }
    const versions = tokens.filter((t) => t.kind === 'version').map((t) => t.value);
    // A lead-tier with no version ("Opus") or a family with no version ("Claude") is not a claim
    // about a specific release — nothing to check.
    if (!versions.length) {
      LEAD_RE.lastIndex = leadStart + m[1].length;
      continue;
    }
    out.push({
      text: text.slice(leadStart, end),
      start: leadStart,
      end,
      family: lead.family,
      versions,
      tiers: tokens.filter((t) => t.kind === 'tier').map((t) => t.value),
      sizes: tokens.filter((t) => t.kind === 'size').map((t) => t.value),
      tokens,
    });
    LEAD_RE.lastIndex = end;
  }
  return out;
}

const HAS_HEBREW = /[֐-׿]/;

/** The name as it should be printed: the source's own spelling when it is Latin, otherwise a
 *  Latin rendering — this repo keeps product names in Latin inside Hebrew copy. */
function canonicalName(m: ModelMention): string {
  if (!HAS_HEBREW.test(m.text)) return m.text.replace(/[‐‑]/g, '-');
  const fam = FAMILIES.find((f) => f.id === m.family)!;
  const words = m.tokens.map((t) => (t.kind === 'tier' ? TIERS[t.value] ?? t.value : t.kind === 'size' ? t.value.toUpperCase() : t.value));
  // "Opus 5.5" written without the family still gets it back.
  return words.length ? `${fam.display}${fam.joiner}${words.join(' ')}` : fam.display;
}

const sameVersion = (a: ModelMention, b: ModelMention) =>
  a.family === b.family && a.versions.join('|') === b.versions.join('|');

export interface SourceLock {
  /** Distinct source names, canonical spelling, in order of first appearance. */
  names: string[];
  mentions: ModelMention[];
}

/** Collect the versioned names the source actually states. `null` when it states none. */
export function buildSourceLock(sourceText: string): SourceLock | null {
  const mentions = findModelMentions(sourceText);
  if (!mentions.length) return null;
  const names: string[] = [];
  for (const m of mentions) {
    const name = canonicalName(m);
    if (!names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return { names: names.slice(0, 24), mentions };
}

/**
 * The instruction appended to the system prompt. Written in Hebrew like the prompts it joins,
 * with the names in Latin exactly as they must appear.
 */
export function sourceLockInstruction(lock: SourceLock): string {
  return [
    'נאמנות למקור — שמות מודלים וגרסאות (כלל מחייב):',
    `המקור מציין את השמות האלה: ${lock.names.join(' · ')}.`,
    '- העתק כל שם מודל וגרסה בדיוק כפי שהוא כתוב במקור, תו אחר תו, כולל סדר המילים ומספר הגרסה.',
    '- המקור חדש יותר מהידע שלך. אם שם או גרסה לא מוכרים לך, המקור צודק — אל תתקן, אל "תעדכן" ואל תחליף בגרסה שאתה מכיר.',
    '- אל תוסיף שמות מודלים, גרסאות או מספרים שלא מופיעים במקור.',
  ].join('\n');
}

export interface RepairResult {
  text: string;
  fixes: Array<{ from: string; to: string }>;
}

/**
 * Rewrite versioned mentions in `output` that the source does not state.
 *
 * - Same family + same version as a source mention → untouched (tier order may differ; that is
 *   a spelling choice, not a fact).
 * - Otherwise, candidates = source mentions of that family, narrowed by shared tier when the
 *   output names one. Exactly one distinct candidate → replaced with its canonical name.
 * - Several candidates → the bare family display name ("Claude"): true, and invents nothing.
 * - Family absent from the source's versioned names → untouched; there is nothing to anchor to.
 */
export function repairModelMentions(output: string, lock: SourceLock | null): RepairResult {
  if (!lock || !output) return { text: output, fixes: [] };
  const found = findModelMentions(output);
  if (!found.length) return { text: output, fixes: [] };

  const fixes: RepairResult['fixes'] = [];
  let text = '';
  let cursor = 0;
  for (const m of found) {
    let replacement: string | null = null;
    if (!lock.mentions.some((s) => sameVersion(s, m))) {
      const family = lock.mentions.filter((s) => s.family === m.family);
      if (family.length) {
        const byTier = m.tiers.length ? family.filter((s) => s.tiers.some((t) => m.tiers.includes(t))) : family;
        const pool = byTier.length ? byTier : family;
        const distinct = [...new Map(pool.map((s) => [canonicalName(s).toLowerCase(), canonicalName(s)])).values()];
        replacement = distinct.length === 1 ? distinct[0] : FAMILIES.find((f) => f.id === m.family)!.display;
      }
    }
    text += output.slice(cursor, m.start) + (replacement ?? m.text);
    if (replacement && replacement !== m.text) fixes.push({ from: m.text, to: replacement });
    cursor = m.end;
  }
  text += output.slice(cursor);
  return { text, fixes };
}

// ─── request / response plumbing (Gemini-shaped, shared by the Gemini and Groq legs) ──────────

interface PartLike { text?: string; thought?: boolean; inlineData?: unknown }
interface ContentLike { role?: string; parts?: PartLike[] }

/** The text the operator supplied: every user turn, never the system prompt and never a prior
 *  model turn (whose names are exactly what is being checked). */
export function requestSourceText(contents: unknown): string {
  if (typeof contents === 'string') return contents;
  if (!Array.isArray(contents)) return '';
  return (contents as ContentLike[])
    .filter((c) => c && c.role !== 'model')
    .flatMap((c) => (c.parts ?? []).map((p) => (typeof p?.text === 'string' && !p.thought ? p.text : '')))
    .filter(Boolean)
    .join('\n');
}

/** Append the lock instruction to whatever shape `systemInstruction` already has. */
export function withLockInstruction(systemInstruction: unknown, lock: SourceLock): unknown {
  const rule = sourceLockInstruction(lock);
  if (!systemInstruction) return rule;
  if (typeof systemInstruction === 'string') return `${systemInstruction}\n\n${rule}`;
  if (Array.isArray(systemInstruction)) return [...systemInstruction, rule];
  const obj = systemInstruction as { parts?: PartLike[]; text?: string };
  if (Array.isArray(obj.parts)) return { ...obj, parts: [...obj.parts, { text: rule }] };
  if (typeof obj.text === 'string') return { ...obj, text: `${obj.text}\n\n${rule}` };
  return systemInstruction;
}

/**
 * Repair every text part of a Gemini-shaped response in place, plus a plain `text` own-property
 * (the Groq adapter sets one; Gemini's `text` is a getter over the parts and needs nothing).
 */
export function repairResponseInPlace<T>(res: T, lock: SourceLock | null, context = 'generate'): T {
  if (!lock || !res) return res;
  const all: RepairResult['fixes'] = [];
  const r = res as unknown as { candidates?: Array<{ content?: { parts?: PartLike[] } }>; text?: unknown };
  for (const cand of r.candidates ?? []) {
    for (const part of cand.content?.parts ?? []) {
      if (typeof part.text === 'string' && !part.thought) {
        const { text, fixes } = repairModelMentions(part.text, lock);
        part.text = text;
        all.push(...fixes);
      }
    }
  }
  const desc = Object.getOwnPropertyDescriptor(r, 'text');
  if (desc && 'value' in desc && desc.writable && typeof desc.value === 'string') {
    const { text, fixes } = repairModelMentions(desc.value, lock);
    r.text = text;
    if (!all.length) all.push(...fixes);
  }
  if (all.length) {
    const uniq = [...new Map(all.map((f) => [`${f.from}→${f.to}`, f])).values()];
    console.warn(`[source-fidelity] ${context}: rewrote ${uniq.map((f) => `"${f.from}" → "${f.to}"`).join(', ')}`);
  }
  return res;
}
