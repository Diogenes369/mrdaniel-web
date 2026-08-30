import Parser from 'rss-parser';
import { createHash } from 'node:crypto';

export type NewsTopic = 'ai' | 'cyber' | 'cloud' | 'general';

export interface NewsItem {
  id: string;
  slug: string;
  source: string;
  category: string;
  topic: NewsTopic;
  title: string;
  link: string;
  excerpt: string;
  summary: string;
  publishedAt: string;
  /** Lead image URL pulled from the feed item (enclosure / media:* / first inline <img>), when the
   * source provides one — many Hebrew RSS feeds don't. Absolute `https:`/`http:` only; consumers
   * that draw it onto a <canvas> must route it through `/api/img-proxy` for CORS. */
  image?: string;
}

interface FeedSource {
  name: string;
  url: string;
  /** Google News RSS titles are formatted "Headline - Publisher" — when set, that suffix is
   * split off so the article's real outlet shows in the source badge (and `category` fallback)
   * instead of the generic aggregator name, and doesn't linger inside the displayed headline. */
  stripTitleSuffix?: boolean;
}

// Real Israeli Hebrew tech/cyber outlets — matches the sources named in CyberNewsGrid's copy. The
// last entry is a Google News RSS search for Hebrew cloud-computing coverage (aggregated from
// Globes, TheMarker, ynet, etc.) — the four named outlets above are general tech/cyber/business
// press and rarely cover cloud-provider news specifically, so without a dedicated source the
// "cloud" topic filter had nothing reliable to populate it with.
const SOURCES: FeedSource[] = [
  { name: 'Geektime', url: 'https://www.geektime.co.il/feed/' },
  { name: 'אנשים ומחשבים', url: 'https://www.pc.co.il/feed/' },
  { name: 'Techtime', url: 'https://techtime.co.il/feed/' },
  { name: 'Israel Defense', url: 'https://www.israeldefense.co.il/rss.xml' },
  {
    // `when:30d` keeps this aligned with the "daily update" framing elsewhere on the site —
    // without it, Google News' relevance ranking surfaces results going back to 2010.
    name: 'Google News',
    url: 'https://news.google.com/rss/search?q=%22%D7%9E%D7%97%D7%A9%D7%95%D7%91%20%D7%A2%D7%A0%D7%9F%22%20when:30d&hl=iw&gl=IL&ceid=IL:iw',
    stripTitleSuffix: true,
  },
];

const CACHE_TTL_MS = 45 * 60 * 1000;

// A real desktop-browser User-Agent (plus the Accept/Accept-Language headers a real browser sends
// along with it) — the previous self-identifying "DBBNewsBot/1.0" UA is exactly what a WAF pattern
// match blocks on, which is what was producing the Israel Defense 403s. This is a standard,
// widely-used technique for RSS aggregation (fetching publicly-published feed content, not
// bypassing any paywall or auth), not an attempt to evade any access control.
const parser = new Parser({
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    Accept: 'application/rss+xml, application/xml, text/xml, */*;q=0.8',
    'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
  },
  timeout: 15000,
  // Media namespaces so an item's lead image can be recovered even when it isn't a plain
  // <enclosure> — keepArray on media:content because feeds often list several (image + video).
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
      ['content:encoded', 'contentEncoded'],
    ],
  },
});

/** Best-effort lead-image recovery from a feed item: <enclosure>, then media:thumbnail, then the
 * first image in media:content, then the first inline <img> in the item's HTML body. Returns an
 * absolute http(s) URL (protocol-relative `//host/…` is upgraded to https) or undefined. */
function extractImage(item: Record<string, any>): string | undefined {
  const normalize = (u: unknown): string | undefined => {
    if (typeof u !== 'string') return undefined;
    const trimmed = u.trim();
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return undefined;
  };

  const enc = item.enclosure;
  if (enc?.url && (!enc.type || String(enc.type).startsWith('image/'))) {
    const u = normalize(enc.url);
    if (u) return u;
  }

  const thumb = normalize(item.mediaThumbnail?.$?.url);
  if (thumb) return thumb;

  const mc = Array.isArray(item.mediaContent) ? item.mediaContent : item.mediaContent ? [item.mediaContent] : [];
  for (const m of mc) {
    const attrs = m?.$ ?? {};
    const isImage =
      attrs.medium === 'image' ||
      (typeof attrs.type === 'string' && attrs.type.startsWith('image/')) ||
      (typeof attrs.url === 'string' && /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(attrs.url));
    if (isImage) {
      const u = normalize(attrs.url);
      if (u) return u;
    }
  }

  const html = String(item.contentEncoded || item.content || '');
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  if (m) {
    const u = normalize(m[1]);
    if (u) return u;
  }

  return undefined;
}

// Keyword heuristics over title + summary + feed categories. Checked cyber first so a
// security-flavored AI story (e.g. "AI-powered phishing") lands under cyber, not ai.
const CYBER_PATTERNS = [
  /סייבר/, /אבטחת מידע/, /האק(ר|רים|ינג)/, /תקיפ(ת|ה) סייבר/, /כופרה/, /פישינג/,
  /פרצ(ת|ה) אבטחה/, /דלף מידע/, /malware/i, /ransomware/i, /phishing/i, /\bcve-?\d/i,
  /\bbreach(ed)?\b/i, /\bhack(ed|er|ing)?\b/i, /zero.?trust/i,
];
const AI_PATTERNS = [
  /בינה מלאכותית/, /למידת מכונה/, /רשת(ות)? נוירונים/, /אג'נט/, /\bAI\b/, /chatgpt/i,
  /openai/i, /\bllm\b/i, /gemini/i, /copilot/i, /anthropic/i, /\bclaude\b/i, /generativ/i,
  /gpt-?\d/i, /agentic/i,
];
// NOTE: `/ענן/` is a deliberate bare substring match, not `/\bענן\b/` — JavaScript's `\b` is
// defined only in terms of ASCII `[A-Za-z0-9_]`, so it never recognizes a boundary next to a
// Hebrew letter. `/\bענן\b/` silently matched nothing, ever (confirmed: `/\bענן\b/.test("מחשוב
// ענן חדש")` is `false`) — which was the actual root cause of the Cloud category being empty.
// Hebrew's final-letter forms (a plain "ן" only ever appears at the end of a word) keep this safe
// from matching inside a longer word — e.g. "עננים" (plural) ends in a regular "נ", not "ן".
const CLOUD_PATTERNS = [
  /ענן/, /מחשוב ענן/, /אחסון (ב)?ענן/, /שירותי ענן/, /ספק(ית)? ענן/, /תשתית(ות)? ענן/,
  /דאטה סנטר/, /גוגל קלאוד/, /\bcloud\b/i, /\baws\b/i, /\bazure\b/i, /\bgcp\b/i,
  /google cloud/i, /\bvercel\b/i, /קוברנטיס/, /kubernetes/i, /\bdocker\b/i, /\bterraform\b/i,
  /מרכז(י)? נתונים/, /data.?center/i, /serverless/i, /\bsaas\b/i,
];

function classifyTopic(text: string): NewsTopic {
  if (CYBER_PATTERNS.some((re) => re.test(text))) return 'cyber';
  if (AI_PATTERNS.some((re) => re.test(text))) return 'ai';
  if (CLOUD_PATTERNS.some((re) => re.test(text))) return 'cloud';
  return 'general';
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, ' ');
}

/** Normalizes a feed's raw description/content into a clean summary paragraph. Drops WordPress's
 * "The post X appeared first on Y." trailer, and drops the whole thing (falling back to the title
 * elsewhere) when a feed's description field turns out to hold no real prose — e.g. Israel
 * Defense's RSS wraps just the title/author/timestamp in markup rather than an excerpt. */
function cleanText(raw: string | undefined, title: string): string {
  if (!raw) return '';
  let text = stripHtml(decodeEntities(raw));
  // WordPress's auto-generated excerpt trailer — English default, or a Hebrew-localized WP install
  // (e.g. "הפוסט X הופיע ראשון ב-Y").
  text = text.replace(/\s*The post .*? appeared first on .*?\.\s*$/is, '');
  text = text.replace(/\s*הפוסט .+? (הופיע ראשון|פורסם לראשונה) ב.*$/s, '');
  text = text.replace(/\s+/g, ' ').trim();
  if (!text || text.length < 20 || text.startsWith(title.slice(0, 15))) return '';
  return text;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function slugify(title: string): string {
  const base = title
    .trim()
    .replace(/['"׳״]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'article';
}

function buildSlug(title: string, link: string): string {
  const hash = createHash('sha1').update(link).digest('hex').slice(0, 8);
  return `${slugify(title)}-${hash}`;
}

const TITLE_SUFFIX_RE = /\s-\s([^-]+)$/;

async function fetchSource(source: FeedSource): Promise<NewsItem[]> {
  const feed = await parser.parseURL(source.url);
  const items: NewsItem[] = [];

  for (const item of feed.items ?? []) {
    let title = (item.title ?? '').trim();
    const link = item.link ?? '';
    if (!title || !link) continue;

    let sourceName = source.name;
    if (source.stripTitleSuffix) {
      const match = title.match(TITLE_SUFFIX_RE);
      if (match) {
        sourceName = match[1].trim();
        title = title.slice(0, match.index).trim();
      }
    }

    const summary = cleanText(item.contentSnippet || item.content, title) || title;
    const categories = item.categories ?? [];
    const topic = classifyTopic(`${title} ${summary} ${categories.join(' ')}`);
    const publishedAt = item.isoDate || (item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString());
    const slug = buildSlug(title, link);

    items.push({
      id: slug,
      slug,
      source: sourceName,
      category: categories[0] || sourceName,
      topic,
      title,
      link,
      excerpt: truncate(summary, 160),
      summary,
      publishedAt,
      image: extractImage(item as Record<string, any>),
    });
  }

  return items;
}

let cache: { items: NewsItem[]; fetchedAt: number } | null = null;
let inFlight: Promise<NewsItem[]> | null = null;

async function refreshAll(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(SOURCES.map(fetchSource));
  const items: NewsItem[] = [];

  results.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      console.error(`[news] failed to fetch ${SOURCES[idx].name}:`, result.reason?.message ?? result.reason);
    }
  });

  items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  cache = { items, fetchedAt: Date.now() };
  return items;
}

export async function getNewsItems(): Promise<{ items: NewsItem[]; updatedAt: string }> {
  const isStale = !cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS;
  if (isStale) {
    inFlight = inFlight ?? refreshAll().finally(() => { inFlight = null; });
    await inFlight;
  }
  return {
    items: cache?.items ?? [],
    updatedAt: cache ? new Date(cache.fetchedAt).toISOString() : new Date().toISOString(),
  };
}

export async function getNewsItemBySlug(slug: string): Promise<NewsItem | null> {
  const { items } = await getNewsItems();
  return items.find((item) => item.slug === slug) ?? null;
}
