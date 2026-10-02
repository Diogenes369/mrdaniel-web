/**
 * The glyph field's alphabet and the text it is made of.
 *
 * The background is a live scene rendered as typewriter characters: tone is made by glyph density
 * (blank → . → : → - → =) and the brightest cells are LETTERS — Hebrew and Latin, taken from real
 * AI headlines and real tool names. That is a product decision, not decoration: the noise the
 * visitor sees behind the hero is literally the week's AI noise. Nothing here is a made-up slogan.
 *
 * Index 0 is a space and indices 1–6 are the density ramp; the renderer relies on both.
 */

const RAMP = ' .:-=+*';
const HEBREW = 'אבגדהוזחטיכךלמםנןסעפףצץקרשת';
const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const PUNCT = ",'\"/%&#@()_";

export const GLYPHS = RAMP + HEBREW + LATIN + PUNCT;
export const GLYPH_COUNT = GLYPHS.length;
/** First glyph that is a real character rather than a density step. */
export const FIRST_LETTER = RAMP.length;
export const ATLAS_COLS = 16;
export const ATLAS_ROWS = Math.ceil(GLYPH_COUNT / ATLAS_COLS);

const INDEX = new Map<string, number>([...GLYPHS].map((ch, i) => [ch, i]));

/** Width of one row of the words texture, in characters. */
export const WORDS_W = 256;
/** Rows of running text; one extra row (the last) holds the headline fill word. */
export const WORDS_TEXT_ROWS = 47;
export const WORDS_H = WORDS_TEXT_ROWS + 1;

/**
 * Real names and terms only — every one of them is a tool, a model or a word a beginner meets in
 * the first week. No invented hype lines: the background is real, so it has to stay real.
 */
export const SEED_TERMS: readonly string[] = [
  'ChatGPT', 'Claude', 'Gemini', 'Grok', 'Llama', 'DeepSeek', 'Qwen', 'Mistral', 'Copilot', 'Cursor',
  'Midjourney', 'Sora', 'Veo', 'n8n', 'Make', 'Perplexity', 'NotebookLM', 'Ollama', 'Hugging Face',
  'ElevenLabs', 'Runway', 'Kling', 'Suno', 'Lovable', 'Windsurf', 'Replit', 'MCP', 'RAG', 'API',
  'GPU', 'LLM', 'prompt', 'agents', 'tokens', 'open weights',
  'סוכני AI', 'פרומפט', 'מודל שפה', 'חלון הקשר', 'קוד פתוח', 'אוטומציה', 'וייב קודינג', 'מודל חדש',
  'גרסה חדשה', 'השקה', 'עדכון', 'בינה מלאכותית', 'צ׳אטבוט', 'הנדסת פרומפטים', 'למידת מכונה',
  'בנצ׳מרק', 'הזיות', 'טוקנים', 'סוכן אוטונומי', 'מודל קוד פתוח', 'מחשוב ענן', 'שבבים',
];

/** The headlines the field is built from: the newest real titles, long enough to read as words. */
export function selectFieldTitles(titles: readonly string[]): string[] {
  return titles.filter((t) => t.length > 8).slice(0, 60);
}

/** The word the glyph-built headline is filled with. */
export const FILL_WORD = 'סדר';

const NIQQUD = /[֑-ׇ]/g;
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;

export function normalizeForField(s: string): string {
  return s
    .replace(NIQQUD, '')
    .replace(INVISIBLE, '')
    .replace(/[‐-―−]/g, '-')
    .replace(/[׳‘’`]/g, "'")
    .replace(/[״“”]/g, '"')
    .replace(/[ \s]+/g, ' ')
    .trim();
}

// A strong-LTR run: Latin letters and digits, plus the neutrals that sit BETWEEN two of them
// ("Hugging Face", "GPT-5.1", "n8n"). Everything else in an RTL line is laid out right to left.
const LTR_RUN = /[A-Za-z0-9]+(?:[ .\-:/_'+]+[A-Za-z0-9]+)*/g;

/**
 * Logical (typed) order → visual left-to-right order, for one RTL line. The grid is filled cell by
 * cell from the left, so a Hebrew run has to be reversed and a Latin run kept as is — otherwise
 * "Claude" would come out as "edualC". This is the minimal Unicode bidi needed for a single
 * paragraph of Hebrew with embedded Latin terms, which is all the feed ever contains.
 */
export function toVisual(logical: string): string {
  const runs: { text: string; ltr: boolean }[] = [];
  let last = 0;
  for (const m of logical.matchAll(LTR_RUN)) {
    const at = m.index ?? 0;
    if (at > last) runs.push({ text: logical.slice(last, at), ltr: false });
    runs.push({ text: m[0], ltr: true });
    last = at + m[0].length;
  }
  if (last < logical.length) runs.push({ text: logical.slice(last), ltr: false });
  return runs
    .reverse()
    .map((r) => (r.ltr ? r.text : [...r.text].reverse().join('').replace(/[()]/g, (p) => (p === '(' ? ')' : '('))))
    .join('');
}

/** Small deterministic PRNG so the same words lay out the same way on every visit. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function encodeRow(visual: string, out: Uint8Array, row: number) {
  const chars = [...visual];
  for (let x = 0; x < WORDS_W; x++) {
    const ch = chars.length ? chars[x % chars.length] : ' ';
    out[row * WORDS_W + x] = INDEX.get(ch) ?? 0;
  }
}

/**
 * The words texture: WORDS_TEXT_ROWS rows of running text (headlines and tool names mixed, each
 * row a different shuffle), and a last row that repeats the fill word for the glyph-built headline.
 */
export function buildWordsTexture(phrases: readonly string[]): Uint8Array {
  const out = new Uint8Array(WORDS_W * WORDS_H);
  const pool = phrases.map(normalizeForField).filter((p) => p.length > 1);
  if (pool.length === 0) pool.push(...SEED_TERMS);
  const rand = mulberry32(0x5eed + pool.length);
  for (let row = 0; row < WORDS_TEXT_ROWS; row++) {
    let line = '';
    while ([...line].length < WORDS_W + 24) line += pool[Math.floor(rand() * pool.length)] + '   ';
    encodeRow(toVisual(line), out, row);
  }
  encodeRow(toVisual(FILL_WORD.repeat(Math.ceil(WORDS_W / FILL_WORD.length))), out, WORDS_H - 1);
  return out;
}
