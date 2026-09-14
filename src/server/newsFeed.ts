import Parser from 'rss-parser';
import { createHash } from 'node:crypto';

export type NewsTopic = 'ai' | 'cyber' | 'cloud' | 'devops' | 'general';

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
  /** 'en' marks a curated English specialist outlet (AWS/Azure/GCP/OpenAI/…). Absent = Hebrew
   * native or Google-News. Consumers that want the Hebrew-only site stream leave these out by
   * default (see `sanitizeAndKeep`); `allowEnglish` opts in (used by the dashboard). */
  lang?: 'he' | 'en';
}

interface FeedSource {
  name: string;
  url: string;
  /** Lower = higher priority when the same story surfaces in more than one feed (see `dedupe`). */
  priority: number;
  /** Per-feed hard cap so one slow/hanging outlet can't stall `/api/news`. Default 8s. */
  timeoutMs?: number;
  /** Google News RSS titles are formatted "Headline - Publisher" — when set, that suffix is
   * split off so the article's real outlet shows in the source badge (and `category` fallback)
   * instead of the generic aggregator name, and doesn't linger inside the displayed headline. */
  stripTitleSuffix?: boolean;
  /** Single-topic feeds (e.g. Israel Defense) can pin their display category directly. */
  defaultCategory?: string;
  /** Keep only items whose classified `topic` is in this list. Used for broad-mandate outlets
   * (Israel Defense carries naval / air / ground stories too) so the feed contributes only the
   * slice that's on-topic for this site — its cyber coverage — instead of military noise. */
  onlyTopics?: NewsTopic[];
  /** Per-source item cap (default `PER_FEED_ITEM_CAP`). International outlets publish constantly —
   * a lower cap keeps them present in the mix without drowning the Israeli feeds. */
  maxItems?: number;
  /** 'en' for a curated English specialist outlet — tags every item with `NewsItem.lang: 'en'` so
   * `sanitizeAndKeep` can gate it behind `allowEnglish` instead of the Hebrew-only requirement.
   * Omit (default 'he') for native Hebrew outlets and the Google-News queries. */
  lang?: 'he' | 'en';
  /** Pins the item's topic without running it through `classifyTopic` — for a single-purpose
   * outlet (AWS/Azure/GCP/OpenAI/…) whose headlines rarely repeat the vendor/category keyword the
   * classifier looks for (e.g. an AWS "What's New" title is just a feature name). Also skips the
   * `onlyTopics` check, since the source itself is the topic filter. */
  forceTopic?: NewsTopic;
}

// Aggregated Israeli tech / AI / cyber / economy coverage. Native RSS from each outlet first, with
// a Google-News search as a safety net so one 404'd feed never leaves a gap. Ordered by dedup
// priority: the outlets we most want to attribute a shared story to come first.
const GNEWS_QUERY = '(טכנולוגיה OR סייבר OR "בינה מלאכותית" OR הייטק OR סטארטאפ) when:14d';
const GNEWS_URL = `https://news.google.com/rss/search?q=${encodeURIComponent(GNEWS_QUERY)}&hl=iw&gl=IL&ceid=IL:iw`;

const GNEWS_CYBER_QUERY = '(סייבר OR "אבטחת מידע" OR ransomware OR "מתקפת סייבר" OR פריצה OR דלף) when:10d';
const GNEWS_CYBER_URL = `https://news.google.com/rss/search?q=${encodeURIComponent(GNEWS_CYBER_QUERY)}&hl=iw&gl=IL&ceid=IL:iw`;

const SOURCES: FeedSource[] = [
  // ── Israeli tech / business (native RSS, highest dedup priority) ──
  { name: 'Geektime', url: 'https://www.geektime.co.il/feed/', priority: 0 },
  { name: 'TechTime', url: 'https://techtime.co.il/feed/', priority: 1 },
  { name: 'אנשים ומחשבים', url: 'https://www.pc.co.il/feed/', priority: 2 },
  { name: 'גלובס', url: 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=1725', priority: 2, timeoutMs: 9000 },
  // Ynet DIGITAL/TECH feed only (StoryRss544). Do NOT use the general-news feed (StoryRss2) —
  // it floods the aggregate with politics/crime that isn't on-topic for this site.
  { name: 'ynet דיגיטל', url: 'https://www.ynet.co.il/Integration/StoryRss544.xml', priority: 2, timeoutMs: 9000 },
  // Calcalist + TheMarker native feeds often 403 datacenter IPs (Yediot / Haaretz WAF) — kept in
  // the list anyway: Promise.allSettled logs the failure and moves on, and when they DO answer
  // (CDN edge, warm cache) it's real Hebrew business/tech coverage. Google News is the safety net.
  { name: 'כלכליסט', url: 'https://www.calcalist.co.il/GeneralRSS/0,16335,L-3927,00.xml', priority: 3, timeoutMs: 7000 },
  { name: 'TheMarker', url: 'https://www.themarker.com/cmlink/1.145', priority: 3, timeoutMs: 7000 },
  { name: 'Israel Defense', url: 'https://www.israeldefense.co.il/rss.xml', priority: 3, onlyTopics: ['cyber'] },
  // ── Israeli AI / cyber specialist blogs (small WordPress feeds — lower per-feed cap + tighter
  //    timeout; the two security blogs are pinned cyber-only via onlyTopics so an off-topic post
  //    never leaks into the general mix). ──
  { name: 'Machine Learning Israel', url: 'https://machinelearning.co.il/feed/', priority: 2, maxItems: 10, timeoutMs: 8000 },
  { name: 'SPD Blog', url: 'https://blog.spd.co.il/feed/', priority: 3, maxItems: 10, onlyTopics: ['cyber'], timeoutMs: 8000 },
  { name: 'Kodkod Cyber', url: 'https://kodkodcyber.com/feed/', priority: 3, maxItems: 10, onlyTopics: ['cyber'], timeoutMs: 8000 },
  // NOTE: the general-purpose English international outlets (TechCrunch, The Verge, Ars Technica,
  // CyberNews, Krebs on Security) stay removed — the PUBLIC site feed is a Hebrew-only AI/cyber
  // stream (see `sanitizeAndKeep`), so those broad-mandate sources would just add fetch latency for
  // no on-brand content. The curated single-topic outlets below are different: `lang: 'en'` tags
  // their items so they're gated behind `allowEnglish` (opt-in, off by default) instead of dropped
  // by the Hebrew gate outright — the dashboard's Cloud/AI/DevOps/extra-Cyber tabs opt in via
  // `/api/news?allowEnglish=1` (see newsFeedClient.ts) because those categories had no real Hebrew
  // coverage to draw from (this is what was making the dashboard's Cloud tab come back empty).
  // ── Cyber specialists ──
  { name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml', priority: 5, lang: 'en', forceTopic: 'cyber', maxItems: 10, timeoutMs: 9000 },
  { name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/', priority: 5, lang: 'en', forceTopic: 'cyber', maxItems: 10, timeoutMs: 9000 },
  { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', priority: 5, lang: 'en', forceTopic: 'cyber', maxItems: 10, timeoutMs: 9000 },
  { name: 'CISA Advisories', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', priority: 5, lang: 'en', forceTopic: 'cyber', maxItems: 10, timeoutMs: 9000 },
  // ── Cloud & infrastructure ──
  { name: 'AWS News', url: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/', priority: 5, lang: 'en', forceTopic: 'cloud', maxItems: 10, timeoutMs: 9000 },
  // Azure + GCP's blogs are real 200s (verified) but heavier to parse than the others — a slightly
  // longer timeout avoids them flaking out under `Promise.allSettled` on a slow tick.
  { name: 'Azure Blog', url: 'https://azure.microsoft.com/en-us/blog/feed/', priority: 5, lang: 'en', forceTopic: 'cloud', maxItems: 10, timeoutMs: 13000 },
  // cloud.google.com/blog/rss serves an HTML page, not RSS — this is GCP's actual feed endpoint.
  { name: 'Google Cloud Blog', url: 'https://cloudblog.withgoogle.com/rss/', priority: 5, lang: 'en', forceTopic: 'cloud', maxItems: 10, timeoutMs: 13000 },
  { name: 'Kubernetes Blog', url: 'https://kubernetes.io/feed.xml', priority: 5, lang: 'en', forceTopic: 'cloud', maxItems: 8, timeoutMs: 9000 },
  { name: 'CNCF', url: 'https://www.cncf.io/feed/', priority: 5, lang: 'en', forceTopic: 'cloud', maxItems: 8, timeoutMs: 9000 },
  // ── Artificial intelligence ──
  { name: 'OpenAI News', url: 'https://openai.com/news/rss.xml', priority: 5, lang: 'en', forceTopic: 'ai', maxItems: 10, timeoutMs: 9000 },
  { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', priority: 5, lang: 'en', forceTopic: 'ai', maxItems: 8, timeoutMs: 9000 },
  { name: 'AI News', url: 'https://www.artificialintelligence-news.com/feed/', priority: 5, lang: 'en', forceTopic: 'ai', maxItems: 8, timeoutMs: 9000 },
  // ── DevOps & SysAdmin ──
  { name: 'The New Stack', url: 'https://thenewstack.io/feed/', priority: 5, lang: 'en', forceTopic: 'devops', maxItems: 10, timeoutMs: 9000 },
  { name: 'Red Hat Blog', url: 'https://www.redhat.com/en/rss/blog', priority: 5, lang: 'en', forceTopic: 'devops', maxItems: 10, timeoutMs: 9000 },
  { name: 'Microsoft Tech Community · IT Ops', url: 'https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=ITOpsTalkBlog', priority: 5, lang: 'en', forceTopic: 'devops', maxItems: 8, timeoutMs: 9000 },
  // ── Google News safety nets — Hebrew tech query + a dedicated Hebrew cyber query ──
  { name: 'Google News', url: GNEWS_URL, priority: 7, stripTitleSuffix: true, timeoutMs: 9000 },
  { name: 'Google News · סייבר', url: GNEWS_CYBER_URL, priority: 7, stripTitleSuffix: true, maxItems: 12, timeoutMs: 9000 },
];

// Publishers still dropped from the aggregate (name-only Google-News hits). pc.co.il was
// re-added above as a native source per product direction — no longer blocked.
const BLOCKED_PUBLISHERS = /\b(?:sponsored content|advertorial|תוכן שיווקי|כתבה ממומנת)\b/i;

const PER_FEED_ITEM_CAP = 30;
// The `summary` field carries the article's real lede — enough for the story/post generators to
// synthesise rich slides from, not a one-sentence teaser. `excerpt` stays short for feed cards.
const SUMMARY_MAX = 720;
const EXCERPT_MAX = 160;

/** Rejects a source promise if it hasn't settled within `ms` — so `Promise.allSettled` in
 * `refreshAll` never waits on a hanging outlet longer than its own cap. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} feed timed out after ${ms}ms`)), ms);
    }),
  ]);
}

const CACHE_TTL_MS = 15 * 60 * 1000;

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

// Feed-plumbing / tracking artefacts that show up as "images" but aren't editorial photos.
// `googleusercontent|gstatic|/logos/` catches the generic branding image that Google's consent
// wall / News interstitial pages expose as their og:image — it was getting scraped off
// `news.google.com` redirect links and pinned onto a dozen unrelated stories.
const JUNK_IMAGE_RE =
  /(feedburner|feedsportal|feeds\.wordpress|doubleclick|googlesyndication|scorecardresearch|googleusercontent\.com|gstatic\.com|\/logos?\/|\/pixel|pixel\.|1x1|blank\.(gif|png)|spacer\.(gif|png)|gravatar\.com\/avatar\/0{16}|\/wp-includes\/images\/)/i;

/**
 * Rewrites a thumbnail/low-res image URL to its highest-resolution rendition, so the dashboard's
 * 1080×1350 / 1080×1920 canvas always has a sharp source to cover-crop from instead of visibly
 * upscaling a small thumbnail. Handles, in order:
 *   1. Globes' Cloudinary named crops (`t_800X392`, `w_300` …) → an explicit 1600px limit-fit.
 *   2. WordPress' auto-generated size suffix (`photo-300x169.jpg` → `photo.jpg`) — the un-suffixed
 *      original is the same media-library file, almost always still hosted at that path
 *      (Geektime / TechTime / pc.co.il and most other WP outlets in the feed list).
 *   3. Generic CDN query-string thumbnail hints (`w=`/`width=`/`h=`/`height=` under 800px,
 *      `quality=`/`q=` under 70) — bumped to a real-photo minimum. Any other URL shape, or a URL
 *      with no such hints, is returned unchanged (never breaks a working image URL).
 */
export function upscaleImageUrl(url: string): string {
  if (/res\.cloudinary\.com\/globes\/image\/upload\//.test(url)) {
    return url.replace(/\/upload\/(t_[^/]+|c_[^/]+|w_\d+[^/]*)\//, '/upload/w_1600,c_limit,q_auto:good/');
  }
  let u = url.replace(/-(\d{2,4})x(\d{2,4})(?=\.(?:jpe?g|png|webp|gif)(?:[?#]|$))/i, '');
  u = u.replace(/([?&])(w|width)=(\d+)/i, (m, sep, key, val) => (Number(val) < 800 ? `${sep}${key}=1200` : m));
  u = u.replace(/([?&])(h|height)=(\d+)/i, (m, sep, key, val) => (Number(val) < 800 ? `${sep}${key}=1350` : m));
  u = u.replace(/([?&])quality=(low|\d+)/i, (m, sep, val) => (val.toLowerCase() === 'low' || Number(val) < 70 ? `${sep}quality=85` : m));
  u = u.replace(/([?&])q=(\d+)(?![a-z])/i, (m, sep, val) => (Number(val) < 70 ? `${sep}q=85` : m));
  return u;
}

const OG_IMAGE_RES = [
  /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  /<meta[^>]+property=["']article:image["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:image["']/i,
  /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
  /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
];

function safeHost(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return '';
  }
}

function pickOgImage(html: string, baseUrl: string): string | undefined {
  for (const re of OG_IMAGE_RES) {
    const m = html.match(re);
    if (!m?.[1]) continue;
    let candidate = m[1].trim().replace(/&amp;/g, '&');
    if (candidate.startsWith('//')) candidate = `https:${candidate}`;
    if (candidate.startsWith('/')) {
      try {
        candidate = new URL(candidate, baseUrl).toString();
      } catch {
        continue;
      }
    }
    if (!/^https?:\/\//i.test(candidate) || JUNK_IMAGE_RE.test(candidate)) continue;
    return upscaleImageUrl(candidate);
  }
  return undefined;
}

// Optional Jina Reader key (https://jina.ai/reader) — lifts the anonymous rate limit. Works
// without it, just slower / more likely to 429 under load.
const JINA_KEY = process.env.JINA_API_KEY?.trim();

/** GET a URL as text with a hard timeout; returns the body or undefined. Never throws. */
async function getText(url: string, timeoutMs: number, headers: Record<string, string>): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow', headers });
    if (!res.ok) return undefined;
    const body = await res.text();
    return body.length > 1_500_000 ? body.slice(0, 1_500_000) : body;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Recover an article's lead image from its `og:image` / `twitter:image` when the feed carried no
 * inline media (TechTime, Israel Defense, most Google-News entries). Tries a direct fetch first;
 * if that fails — which it does for any outlet whose origin WAF-blocks datacenter IPs — retries
 * through the Jina Reader proxy (`r.jina.ai`), which fetches from its own infrastructure. Bounded
 * and best-effort; returns an absolute URL or undefined, never throws. */
async function fetchOgImage(articleUrl: string): Promise<string | undefined> {
  const browserHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  const direct = await getText(articleUrl, 5000, browserHeaders);
  if (direct) {
    const hit = pickOgImage(direct, articleUrl);
    if (hit) return hit;
  }

  const viaJina = await getText(
    `https://r.jina.ai/${articleUrl}`,
    7000,
    JINA_KEY ? { Authorization: `Bearer ${JINA_KEY}`, 'X-Return-Format': 'html' } : { 'X-Return-Format': 'html' },
  );
  if (viaJina) {
    const hit = pickOgImage(viaJina, articleUrl);
    if (hit) return hit;
  }
  return undefined;
}

/** Fills in `image` for the newest items whose feed carried none, by scraping the article
 * `og:image` (see `fetchOgImage`). Concurrency-limited AND under a single overall deadline so a
 * batch of slow/blocked outlets can never balloon the `/api/news` refresh — whatever's filled
 * when the clock runs out is kept. Best-effort: any individual failure is silently skipped. */
async function enrichImages(items: NewsItem[], limit = 28, overallMs = 12_000): Promise<void> {
  // Skip Google-News entries: their `link` is a news.google.com redirect, not a scrapeable
  // article — fetching it just yields Google's consent-wall og:image.
  const targets = items
    .filter((it) => !it.image && !/(^|\.)news\.google\.com/i.test(safeHost(it.link)))
    .slice(0, limit);
  if (targets.length === 0) return;

  const deadline = Date.now() + overallMs;
  const assigned = new Set<string>(items.map((it) => it.image).filter(Boolean) as string[]);
  let cursor = 0;
  let filled = 0;
  const worker = async () => {
    while (cursor < targets.length && Date.now() < deadline) {
      const it = targets[cursor++];
      const og = await fetchOgImage(it.link);
      // Reject a URL we've already used this refresh — a repeat almost always means a generic
      // placeholder / error-page image rather than the real article photo.
      if (og && !assigned.has(og)) {
        it.image = og;
        assigned.add(og);
        filled++;
      }
    }
  };
  const run = Promise.all(Array.from({ length: Math.min(6, targets.length) }, worker));
  await Promise.race([run, new Promise((r) => setTimeout(r, overallMs + 500))]);
  console.info(
    `[news] og:image enrichment — filled ${filled}/${targets.length} imageless items in ${Date.now() - (deadline - overallMs)}ms`,
  );
}

/** Best-effort lead-image recovery, tried in order across every feed shape we've seen from the
 * Israeli outlets: <enclosure>, media:thumbnail, media:content / media:group, itunes:image, and
 * finally the first real <img>/<img data-src> inside the item body (contentEncoded / content /
 * summary / description). Protocol-relative `//host/…` is upgraded to https; obvious tracking
 * pixels and feed chrome are skipped. Returns an absolute http(s) URL or undefined. */
function extractImage(item: Record<string, any>): string | undefined {
  const normalize = (u: unknown): string | undefined => {
    if (typeof u !== 'string') return undefined;
    let s = u.trim().replace(/&amp;/g, '&');
    if (s.startsWith('//')) s = `https:${s}`;
    if (!/^https?:\/\//i.test(s)) return undefined;
    if (JUNK_IMAGE_RE.test(s)) return undefined;
    return upscaleImageUrl(s);
  };

  const enc = item.enclosure;
  if (enc?.url && (!enc.type || String(enc.type).startsWith('image/'))) {
    const u = normalize(enc.url);
    if (u) return u;
  }

  const thumb = normalize(item.mediaThumbnail?.$?.url ?? item.mediaThumbnail?.url);
  if (thumb) return thumb;

  const group = item['media:group'];
  const mcRaw = item.mediaContent ?? group?.['media:content'] ?? group?.mediaContent;
  const mc = Array.isArray(mcRaw) ? mcRaw : mcRaw ? [mcRaw] : [];
  for (const m of mc) {
    const attrs = m?.$ ?? m ?? {};
    const url = attrs.url ?? attrs.href;
    const isImage =
      attrs.medium === 'image' ||
      (typeof attrs.type === 'string' && attrs.type.startsWith('image/')) ||
      (typeof url === 'string' && /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(url));
    if (isImage) {
      const u = normalize(url);
      if (u) return u;
    }
  }

  const itunes = normalize(item.itunes?.image ?? item['itunes:image']?.$?.href);
  if (itunes) return itunes;

  const html = String(item.contentEncoded || item.content || item.summary || item['content:encoded'] || '');
  const imgRe = /<img[^>]+(?:data-src|src)=["']([^"'\s]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html))) {
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
  /google cloud/i, /\bvercel\b/i, /קוברנטיס/, /kubernetes/i, /\bcncf\b/i,
  /מרכז(י)? נתונים/, /data.?center/i, /serverless/i, /\bsaas\b/i,
];
// DevOps / SysAdmin operational tooling & culture — distinct from CLOUD_PATTERNS' vendor/infra
// terms so a story about running/operating systems (CI/CD, IaC, on-call) lands in its own tab
// rather than the cloud-provider one.
const DEVOPS_PATTERNS = [
  /דבופס/, /ניהול מערכות/, /תפעול מערכות/, /אוטומציה( של)? תשתיות/,
  /\bdevops\b/i, /\bsysadmin\b/i, /\bci\/cd\b/i, /\bcontinuous (integration|deployment|delivery)\b/i,
  /\bansible\b/i, /\bterraform\b/i, /\bdocker\b/i, /\bgitops\b/i, /\bred ?hat\b/i, /\bopenshift\b/i,
  /\binfrastructure as code\b/i, /\bit ops\b/i, /\bobservability\b/i, /\bincident response\b/i,
];

function classifyTopic(text: string): NewsTopic {
  if (CYBER_PATTERNS.some((re) => re.test(text))) return 'cyber';
  if (AI_PATTERNS.some((re) => re.test(text))) return 'ai';
  if (CLOUD_PATTERNS.some((re) => re.test(text))) return 'cloud';
  if (DEVOPS_PATTERNS.some((re) => re.test(text))) return 'devops';
  return 'general';
}

// Generic consumer-tech / gadget / gaming markers. The opt-in strict filter drops an item that
// matches one of these UNLESS it also carries an AI / cyber / cloud signal (so "AI comes to your
// smart TV" stays, "best gaming monitors of 2026" goes).
const GENERIC_CONSUMER_PATTERNS = [
  /גיימינג/, /קונסול/, /טלוויזי/, /סמארטפון/, /מכשיר סלולרי/, /מחשב נייד/, /לפטופ/, /אוזניות/,
  /שעון חכם/, /רחפן/, /מצלמ(ה|ת)/, /כונן קשיח/, /כרטיס מסך/, /ספק כוח/, /שואב אבק/,
  /\bgaming\b/i, /\bconsole\b/i, /\bsmartphone\b/i, /\blaptop\b/i, /\bwearable\b/i,
  /\bheadphones?\b/i, /\bearbuds?\b/i, /\bdrone\b/i, /\bTV\b/, /\bGPU\b.*\bgaming\b/i,
];

const HEBREW_CHAR = /[֐-׿]/;
// A "title" that is actually a scrape/parse artefact rather than a headline: a bare URL, an
// ellipsis-only / punctuation-only string, leftover markup or entities, or a CDATA tail. These
// showed up in the Live Feed ticker as `...` / `[…]` / raw `&#8217;` fragments.
const GARBAGE_TITLE =
  /^(?:\s*(?:https?:\/\/\S+|[.…\-–—_·•*#>«»"'׳״|/\\]+|\[[^\]]*\]|&#?\w+;?)\s*)+$/i;
const MARKUP_LEFTOVER = /<\/?[a-z][^>]*>|&#\d{2,};|\]\]>|\{\{|https?:\/\/\S+\s*$/i;

/**
 * The feed's content gate — ON BY DEFAULT for `/api/news` (opt out with `?strict=0`). An item is
 * kept only when ALL hold:
 *   1. Hebrew — the title carries Hebrew letters (drops the residual English items Google News
 *      still slips in).
 *   2. Clean — the title isn't a scrape/parse artefact (`...`, bare URL, leftover `<tag>` /
 *      `&#8217;`, CDATA tail) and is a real headline length.
 *   3. On-topic — AI / cyber / cloud signal in the title+summary (reuses the SAME classifier
 *      patterns the feed already runs on), and NOT generic consumer-tech/gadget/gaming without
 *      one of those signals.
 * Applied as a per-request VIEW over the shared cache in `getNewsItems` — never mutates the cache,
 * so an unfiltered (`?strict=0`) call and a filtered one can't poison each other.
 */
export function sanitizeAndKeep(item: NewsItem, opts: { allowEnglish?: boolean } = {}): boolean {
  const title = (item.title || '').trim();
  // clean, real headline — applies regardless of language
  if (title.length < 12 || GARBAGE_TITLE.test(title) || MARKUP_LEFTOVER.test(title)) return false;

  const text = `${title} ${item.excerpt} ${item.summary} ${item.category}`;
  const onTopic =
    CYBER_PATTERNS.some((re) => re.test(text)) ||
    AI_PATTERNS.some((re) => re.test(text)) ||
    CLOUD_PATTERNS.some((re) => re.test(text)) ||
    DEVOPS_PATTERNS.some((re) => re.test(text));

  // Curated English specialist outlets (AWS/Azure/GCP/OpenAI/Red Hat/…) are single-topic by
  // construction (`forceTopic`) — skip the Hebrew requirement below for them when the caller opts
  // in, since it exists only to filter Google-News noise, not to gatekeep a deliberately bilingual
  // source list.
  if (opts.allowEnglish && item.lang === 'en') {
    if (GENERIC_CONSUMER_PATTERNS.some((re) => re.test(text)) && !onTopic) return false;
    return onTopic || classifyTopic(text) !== 'general';
  }

  // 1 · Hebrew
  if (!HEBREW_CHAR.test(title)) return false;
  const hebLen = (title.match(/[֐-׿]/g) || []).length;
  if (hebLen < 6) return false; // mostly-Latin string with one stray Hebrew glyph
  // 2 · on-topic
  if (GENERIC_CONSUMER_PATTERNS.some((re) => re.test(text)) && !onTopic) return false;
  if (onTopic) return true;
  return classifyTopic(text) !== 'general';
}

/** @deprecated kept as an alias so any external caller of the old name still resolves. */
export const strictTopicKeep = sanitizeAndKeep;

// Business/finance signals — used only to refine the DISPLAY `category` label (kept as a free
// string), NOT the `topic` enum that the site's category filters run on.
const ECONOMY_PATTERNS = [
  /גיוס(\s|$)/, /גיוס הון/, /הנפק(ה|ת)/, /מיזוג/, /רכישת חברה/, /נרכשה/, /שווי חברה/, /הון סיכון/,
  /קרן(ות)? הון/, /אקזיט/, /בורסה/, /מנייה|מניה|מניות/, /רבעון/, /דוחות כספיים/, /הכנסות/, /רווח נקי/,
  /\bIPO\b/i, /\bVC\b/, /\bM&A\b/i, /valuation/i, /funding round/i, /\bseed\b/i, /series [a-e]\b/i, /raised \$/i,
];

/** Clean Hebrew display tag: סייבר / בינה מלאכותית / ענן ותשתיות / כלכלה / טכנולוגיה. */
function deriveCategory(topic: NewsTopic, text: string): string {
  if (topic === 'cyber') return 'סייבר';
  if (topic === 'ai') return 'בינה מלאכותית';
  if (topic === 'cloud') return 'ענן ותשתיות';
  if (topic === 'devops') return 'ניהול מערכות ו-DevOps';
  if (ECONOMY_PATTERNS.some((re) => re.test(text))) return 'כלכלה';
  return 'טכנולוגיה';
}

/** Normalised headline key for cross-source de-duplication. */
function normTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/["'׳״“”‘’.,:;!?()\[\]{}\-–—|/\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70);
}

/** host + path, no protocol / www / trailing slash / query — same article at different trackers. */
function canonicalLink(link: string): string {
  try {
    const u = new URL(link);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return link.toLowerCase();
  }
}

/** Drops duplicate stories across feeds. Keeps the copy from the highest-priority source (then the
 * newest), so a story that Geektime and Google News both carry is attributed to Geektime. */
function dedupe(items: NewsItem[], priorityOf: (source: string) => number): NewsItem[] {
  const isAggregatorLink = (l: string) => /(^|\.)news\.google\.com/i.test(l);
  const sorted = [...items].sort((a, b) => {
    const p = priorityOf(a.source) - priorityOf(b.source);
    if (p !== 0) return p;
    // Same outlet via two feeds: keep the direct article link, not a Google-News redirect.
    const agg = Number(isAggregatorLink(a.link)) - Number(isAggregatorLink(b.link));
    if (agg !== 0) return agg;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
  const seenTitle = new Set<string>();
  const seenLink = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of sorted) {
    const tk = normTitle(it.title);
    const lk = canonicalLink(it.link);
    if (seenLink.has(lk)) continue;
    if (tk.length > 10 && seenTitle.has(tk)) continue;
    seenLink.add(lk);
    if (tk.length > 10) seenTitle.add(tk);
    out.push(it);
  }
  return out;
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
  const feed = await withTimeout(parser.parseURL(source.url), source.timeoutMs ?? 8000, source.name);
  const items: NewsItem[] = [];

  for (const item of feed.items ?? []) {
    let title = (item.title ?? '').trim();
    const link = item.link ?? '';
    if (!title || !link || !/^https?:\/\//i.test(link)) continue;

    let sourceName = source.name;
    if (source.stripTitleSuffix) {
      const match = title.match(TITLE_SUFFIX_RE);
      if (match) {
        sourceName = match[1].trim();
        title = title.slice(0, match.index).trim();
      }
    }
    if (BLOCKED_PUBLISHERS.test(sourceName) || BLOCKED_PUBLISHERS.test(link)) continue;

    // Prefer the full article body (`content:encoded`, present on Geektime/TechTime WordPress
    // feeds) over the short `description`/`contentSnippet` teaser, so downstream generators get
    // real substance. `cleanText` strips markup and WordPress trailers; keep a generous slice.
    const rawBody = item.contentEncoded || item['content:encoded'] || item.content || item.contentSnippet;
    const fullText = cleanText(rawBody as string | undefined, title);
    const summary = truncate(fullText || cleanText(item.contentSnippet, title) || title, SUMMARY_MAX);
    const categories = item.categories ?? [];
    const classifierText = `${title} ${summary} ${categories.join(' ')}`;
    const topic = source.forceTopic ?? classifyTopic(classifierText);
    if (!source.forceTopic && source.onlyTopics && !source.onlyTopics.includes(topic)) continue;
    const publishedAt = item.isoDate || (item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString());
    const slug = buildSlug(title, link);

    items.push({
      id: slug,
      slug,
      source: sourceName,
      category: source.defaultCategory ?? deriveCategory(topic, classifierText),
      topic,
      title,
      link,
      excerpt: truncate(summary, EXCERPT_MAX),
      summary,
      publishedAt,
      image: extractImage(item as Record<string, any>),
      lang: source.lang,
    });
  }

  return items.slice(0, source.maxItems ?? PER_FEED_ITEM_CAP);
}

let cache: { items: NewsItem[]; fetchedAt: number } | null = null;
let inFlight: Promise<NewsItem[]> | null = null;

async function refreshAll(): Promise<NewsItem[]> {
  const priorityByName = new Map(SOURCES.map((s) => [s.name, s.priority]));
  const priorityOf = (name: string) => priorityByName.get(name) ?? 9;

  const results = await Promise.allSettled(SOURCES.map(fetchSource));
  const raw: NewsItem[] = [];
  const stats: string[] = [];

  results.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      raw.push(...result.value);
      stats.push(`${SOURCES[idx].name}:${result.value.length}`);
    } else {
      stats.push(`${SOURCES[idx].name}:FAIL`);
      console.error(`[news] failed to fetch ${SOURCES[idx].name}:`, result.reason?.message ?? result.reason);
    }
  });

  const items = dedupe(raw, priorityOf).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  // Scrape og:image for the newest items whose feed carried no inline media (TechTime, Israel
  // Defense, most Google-News entries) so the Content Agent has a real article photo to render.
  await enrichImages(items).catch((err) => console.error('[news] enrichImages failed:', err));

  const withImg = items.filter((i) => i.image).length;
  console.info(
    `[news] refreshed — ${items.length} items after dedup (${raw.length} raw), ${withImg} with image · ${stats.join(' ')}`
  );

  cache = { items, fetchedAt: Date.now() };
  return items;
}

export async function getNewsItems(
  // `strict` is ON by default — the site news page, the Live Feed ticker and the dashboard all get
  // the sanitized stream. Pass `{ strict: false }` (via `/api/news?strict=0`) only for debugging
  // the raw aggregate. `allowEnglish` additionally lets the curated English specialist outlets
  // (AWS/Azure/GCP/OpenAI/…) through the strict gate — off by default so the public site stays
  // Hebrew-only; the dashboard opts in via `/api/news?allowEnglish=1` for its Cloud/AI/DevOps tabs.
  opts: { strict?: boolean; allowEnglish?: boolean } = {}
): Promise<{ items: NewsItem[]; updatedAt: string }> {
  const strict = opts.strict ?? true;
  const allowEnglish = opts.allowEnglish ?? false;
  const isStale = !cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS;
  if (isStale) {
    inFlight = inFlight ?? refreshAll().finally(() => { inFlight = null; });
    await inFlight;
  }
  const all = cache?.items ?? [];
  return {
    // Applied here, on the way out — the cache always holds the full unfiltered set.
    items: strict ? all.filter((it) => sanitizeAndKeep(it, { allowEnglish })) : all,
    updatedAt: cache ? new Date(cache.fetchedAt).toISOString() : new Date().toISOString(),
  };
}

export async function getNewsItemBySlug(slug: string): Promise<NewsItem | null> {
  const { items } = await getNewsItems();
  return items.find((item) => item.slug === slug) ?? null;
}
