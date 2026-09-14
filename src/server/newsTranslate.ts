import { createHash } from 'node:crypto';
import {
  genAI,
  generateContentWithRetry,
  requireText,
  stripCodeFence,
  parseJsonOrThrow,
  detectGeminiRateLimit,
} from '../agent/geminiClient.js';
import type { NewsItem } from './newsFeed.js';

/**
 * Auto-translates non-Hebrew feed items (AWS/Azure/GCP/OpenAI/Dark Reading/BleepingComputer/…) into
 * fluent Hebrew, so `/api/news` never has to choose between an empty category tab and a raw English
 * headline reaching the UI. Runs once per `refreshAll()` cycle in newsFeed.ts, BEFORE the cache is
 * written and BEFORE `sanitizeAndKeep` runs — by the time an item is cached, its title/excerpt/
 * summary are already Hebrew (or the item was dropped).
 *
 * Zero-bug contract: an item that can't be translated (Gemini unconfigured, rate-limited, or a bad
 * response for its chunk) is dropped from the batch entirely rather than passed through with its
 * original English text. There is no partial-translation state visible to a consumer.
 */

const HEBREW_CHAR_RE = /[֐-׿]/g;

/** Mirrors the "mostly-Latin" heuristic in newsFeed.ts's `sanitizeAndKeep` — a title needs real
 *  Hebrew content, not just one stray glyph, to count as already-Hebrew. */
function isAlreadyHebrew(title: string): boolean {
  return (title.match(HEBREW_CHAR_RE) || []).length >= 6;
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

interface TranslatedText {
  title: string;
  summary: string;
}

// 30 min — the top of the product's stated 15-30 min window, and deliberately longer than the news
// feed's own 15 min refresh (newsFeed.ts CACHE_TTL_MS): an article that's still live on the NEXT
// refresh is a cache hit, not a re-translation, which is most of them in steady state.
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 600;
const cache = new Map<string, { at: number; value: TranslatedText }>();

function cacheKey(item: NewsItem): string {
  // `id` is a sha1-based slug of the article link (see newsFeed.ts buildSlug) — stable across
  // refreshes for the same article, unlike an array index.
  return item.id;
}

function readCache(key: string): TranslatedText | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key: string, value: TranslatedText) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
}

const SYSTEM_INSTRUCTION = `אתה מתרגם טכני מקצועי. אתה מתרגם כותרות ותקצירי חדשות טכנולוגיה, סייבר, ענן ו-AI מאנגלית לעברית תקנית ושוטפת, עבור אתר חדשות ישראלי.

כללים:
1. תרגם משמעות, לא מילה במילה — עברית טבעית שנשמעת כאילו נכתבה במקור בעברית, לא תרגום מכונה מילולי.
2. שמות מוצרים, חברות, פרוטוקולים וטכנולוגיות (AWS, Kubernetes, GPT-5, Azure, CVE-2026-1234 וכדומה) נשארים באנגלית בתוך המשפט העברי.
3. שמור בדיוק על כל עובדה, מספר, תאריך ושם שמופיעים במקור — אסור להמציא, להוסיף או להשמיט מידע.
4. כותרת: עד 20 מילים, תמציתית וברורה, בלי מרכאות מיותרות. תקציר: פסקה שוטפת אחת, לא רשימת תבליטים.
5. אל תוסיף פרשנות, דעה, אימוג'ים או משפט פתיחה — רק את התרגום עצמו.

קלט: מערך פריטים, כל אחד עם id, title, summary באנגלית.
פלט: JSON תקין בלבד, בלי code fence, במבנה:
{"items":[{"id":"...","title":"...","summary":"..."}]}
כל id בפלט חייב להתאים בדיוק ל-id שקיבלת, ובאותו סדר. אל תדלג על אף פריט.`;

interface TranslateTarget {
  id: string;
  title: string;
  summary: string;
}

async function translateChunk(targets: TranslateTarget[]): Promise<Map<string, TranslatedText>> {
  const out = new Map<string, TranslatedText>();
  if (!genAI) return out;

  const payload = targets.map((t) => ({
    id: t.id,
    title: t.title.slice(0, 300),
    summary: t.summary.slice(0, 900),
  }));

  const prompt = `תרגם לעברית את הפריטים הבאים:\n${JSON.stringify({ items: payload })}`;

  const response = await generateContentWithRetry({
    model: 'gemini-3.6-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.3,
      topP: 0.9,
      responseMimeType: 'application/json',
    },
  });

  const raw = stripCodeFence(requireText(response));
  const parsed = parseJsonOrThrow<{ items?: Array<{ id?: unknown; title?: unknown; summary?: unknown }> }>(
    raw,
    'news translation',
  );

  // Diagnostics only — no article text is sensitive, this is public headline data. Kept terse
  // (one line, not per-item) so it doesn't flood logs once translation is working reliably.
  let notHebrew = 0;
  let idMismatch = 0;
  let tooShort = 0;
  const knownIds = new Set(targets.map((t) => t.id));
  let sample: { id: string; title: string } | null = null;

  for (const entry of Array.isArray(parsed.items) ? parsed.items : []) {
    const id = String(entry.id ?? '').trim();
    const title = String(entry.title ?? '').replace(/\s+/g, ' ').trim();
    const summary = String(entry.summary ?? '').replace(/\s+/g, ' ').trim();
    if (!sample && title) sample = { id, title: title.slice(0, 60) };
    if (!id || !knownIds.has(id)) { idMismatch++; continue; }
    if (title.length < 8 || summary.length < 15) { tooShort++; continue; }
    if (!isAlreadyHebrew(title)) { notHebrew++; continue; } // model failed to actually translate — drop, don't pass English through
    out.set(id, { title, summary });
  }
  if (out.size === 0 && targets.length > 0) {
    console.warn(
      `[news-translate] chunk of ${targets.length} produced 0 usable translations ` +
        `(notHebrew=${notHebrew} idMismatch=${idMismatch} tooShort=${tooShort} parsedItems=${parsed.items?.length ?? 0}) ` +
        `sample=${sample ? JSON.stringify(sample) : 'none'}`,
    );
  }
  return out;
}

const CHUNK_SIZE = 10;
const CHUNK_CONCURRENCY = 3;
// Runs CONCURRENTLY with `enrichImages` in refreshAll (newsFeed.ts), not after it — kept well under
// `api/news.ts`'s 30s (now raised, see vercel.json) function budget alongside the RSS fetch phase
// that precedes both.
const OVERALL_DEADLINE_MS = 18_000;
// Hard cap on how many foreign items get a translation attempt per refresh cycle — the source list
// can carry 100+ English items before cache warms up; this keeps one refresh bounded. Skipped items
// are simply dropped this cycle and retried (cache miss) on the next `refreshAll()`.
const MAX_ITEMS_PER_REFRESH = 90;

/**
 * Returns a NEW array: Hebrew-native items pass through untouched; foreign-language items are
 * replaced with a translated copy (title/excerpt/summary in Hebrew, `lang` cleared since the
 * content is now genuinely Hebrew) or dropped entirely when translation isn't possible. Never
 * throws — a total Gemini outage degrades to "foreign items dropped," not a broken feed.
 */
export async function translateForeignItems(items: NewsItem[], excerptMax = 160): Promise<NewsItem[]> {
  const passthrough: NewsItem[] = [];
  const foreign: NewsItem[] = [];
  for (const item of items) {
    if (isAlreadyHebrew(item.title)) passthrough.push(item);
    else foreign.push(item);
  }
  if (foreign.length === 0) return passthrough;

  if (!genAI) {
    console.warn(`[news-translate] Gemini not configured — dropping ${foreign.length} foreign-language items`);
    return passthrough;
  }

  const capped = foreign.slice(0, MAX_ITEMS_PER_REFRESH);
  if (capped.length < foreign.length) {
    console.warn(`[news-translate] ${foreign.length - capped.length} foreign items skipped this cycle (per-refresh cap)`);
  }

  const resolved = new Map<string, TranslatedText>();
  const pending = capped.filter((item) => {
    const key = cacheKey(item);
    const hit = readCache(key);
    if (hit) {
      resolved.set(key, hit);
      return false;
    }
    return true;
  });

  if (pending.length > 0) {
    const chunks: TranslateTarget[][] = [];
    for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
      chunks.push(
        pending.slice(i, i + CHUNK_SIZE).map((item) => ({ id: item.id, title: item.title, summary: item.summary })),
      );
    }

    const deadline = Date.now() + OVERALL_DEADLINE_MS;
    let cursor = 0;
    let rateLimited = false;
    let translatedCount = 0;
    const worker = async () => {
      while (cursor < chunks.length && Date.now() < deadline && !rateLimited) {
        const chunk = chunks[cursor++];
        try {
          const result = await translateChunk(chunk);
          for (const [id, value] of result) {
            resolved.set(id, value);
            writeCache(id, value);
            translatedCount++;
          }
        } catch (err) {
          if (detectGeminiRateLimit(err)) {
            rateLimited = true;
            console.warn('[news-translate] Gemini rate-limited — stopping translation for this refresh cycle');
          } else {
            console.error('[news-translate] chunk translation failed:', err instanceof Error ? err.message : err);
          }
        }
      }
    };
    await Promise.race([
      Promise.all(Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, worker)),
      new Promise((r) => setTimeout(r, OVERALL_DEADLINE_MS + 1000)),
    ]);
    console.info(
      `[news-translate] translated ${translatedCount}/${pending.length} pending items (${resolved.size - translatedCount} from cache)`,
    );
  }

  // Mutates each item IN PLACE (rather than spreading into a copy) so that `enrichImages`, which
  // the caller runs concurrently with this function against the SAME array (see refreshAll in
  // newsFeed.ts), can safely fill `.image` on these same object references — whichever of the two
  // async operations finishes last doesn't clobber the other's write.
  const out = [...passthrough];
  for (const item of capped) {
    const hit = resolved.get(cacheKey(item));
    if (!hit) continue; // translation unavailable for this item — dropped, never shown in English
    item.title = hit.title;
    item.summary = hit.summary;
    item.excerpt = truncate(hit.summary, excerptMax);
    item.lang = undefined;
    out.push(item);
  }
  return out;
}
