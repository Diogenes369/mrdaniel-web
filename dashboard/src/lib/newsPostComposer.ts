import { SITE_PROMO_FOOTER, type NewsItem, type SocialPlatform } from './newsAgentTypes';
import { describeAiError, aiRetryDelayMs } from './aiErrors';
import { adminSecretHeader } from './adminSecret';
import { stripMetaPhrases } from './storySlides';
import { resolveArticleText } from './articleText';
import { contextualHashtags, enforceAnalystTone } from './analystTone';

/**
 * Turns a news item into a ready-to-publish social post.
 *
 * Every post ends the same way, whichever path wrote the body:
 *   body → source line → NEWS_CTA_LINE (fixed closing line) → 3-5 article-specific hashtags.
 *
 * The deterministic fallback used to pad the body with topic-level banks ("סוכני AI כבר לא דמו…",
 * "מהשטח: הפרויקטים שמצליחים…") so a post without AI still looked long. Removed 2026-09-23 with the
 * analyst register: those paragraphs were identical on every post in a topic, which is the exact
 * generic filler the register bans, and several addressed an organisation the audience does not
 * have. The fallback now carries only what the article itself says — shorter, and true.
 */

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Keeps the item's own summary as a real paragraph — up to ~`maxChars`, ALWAYS ending on a full
 * sentence. Never appends "…" and never cuts mid-sentence: if no sentence boundary lands in range,
 * the first complete sentence is kept at whatever length. */
function contextParagraph(text: string, maxChars: number): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= Math.floor(maxChars * 1.35)) return clean;
  const window = clean.slice(0, Math.floor(maxChars * 1.35));
  const upToLastStop = window.match(/^[\s\S]*[.!?](?=\s|$)/);
  if (upToLastStop && upToLastStop[0].length >= maxChars * 0.4) return upToLastStop[0].trim();
  const first = clean.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (first ? first[0] : clean).trim();
}

export interface ComposedPost {
  /** The full text block — hook → sections → hashtags → footer — ready to paste. */
  fullText: string;
  hashtags: string[];
  /** Just the footer, so the UI can show it as a locked/highlighted block. */
  footer: string;
  /** true when the body was written by the adaptive LLM synthesis step; false = deterministic. */
  synthesized: boolean;
  /** When `synthesized` is false: why the LLM path was skipped (stale secret, Gemini quota, thin
   *  article text, network). Shown next to the "תבנית בסיס" badge so the operator can tell a
   *  fixable failure from one worth retrying, instead of guessing at a silent downgrade. */
  fallbackReason?: string;
  /** One-sentence Hebrew image description for screen readers + image SEO. Only the LLM path
   *  produces one; the deterministic template fallback leaves it empty. */
  altText?: string;
}

/** Publisher display-name → canonical domain for the clean text citation. Covers the outlets in
 * src/server/newsFeed.ts's SOURCES plus the publishers the Google-News fallback attributes by the
 * "Headline - Publisher" title suffix (whose `link` is then a news.google.com redirect). */
const SOURCE_DOMAINS: Record<string, string> = {
  geektime: 'geektime.co.il',
  גיקטיים: 'geektime.co.il',
  techtime: 'techtime.co.il',
  'ynet דיגיטל': 'ynet.co.il',
  ynet: 'ynet.co.il',
  'ידיעות אחרונות': 'ynet.co.il',
  גלובס: 'globes.co.il',
  globes: 'globes.co.il',
  כלכליסט: 'calcalist.co.il',
  calcalist: 'calcalist.co.il',
  ctech: 'calcalistech.com',
  themarker: 'themarker.com',
  'the marker': 'themarker.com',
  'דה מרקר': 'themarker.com',
  הארץ: 'haaretz.co.il',
  haaretz: 'haaretz.co.il',
  מעריב: 'maariv.co.il',
  maariv: 'maariv.co.il',
  'ישראל היום': 'israelhayom.co.il',
  'israel hayom': 'israelhayom.co.il',
  וואלה: 'walla.co.il',
  walla: 'walla.co.il',
  'israel defense': 'israeldefense.co.il',
  'ישראל דיפנס': 'israeldefense.co.il',
  'times of israel': 'timesofisrael.com',
  reuters: 'reuters.com',
  bloomberg: 'bloomberg.com',
  techcrunch: 'techcrunch.com',
  'the verge': 'theverge.com',
  cnbc: 'cnbc.com',
};

/** Hosts that are feed aggregators / link shorteners / redirects — never the real publisher. */
const AGGREGATOR_HOSTS =
  /(^|\.)(news\.google\.com|google\.com|feedproxy\.google\.com|feedburner\.com|feeds\.feedburner\.com|feedsportal\.com|rss\.app|bing\.com|t\.co|lnkd\.in)$/i;

/** Tracking/analytics query params to drop from an article URL — keeps functional ones such as
 * Globes' `?did=` article id. */
const TRACKING_PARAM =
  /^(utm_[a-z]+|fbclid|gclid|dclid|mc_[a-z]+|ref|ref_src|referrer|cmpid|cmp|campaign|source|medium|at_medium|at_campaign|spm|s_cid|__twitter_impression|guccounter|igshid)$/i;

/** A clean, bare domain for the source citation — never a URL. Prefers the real article host,
 * falls back to a lookup on the source display name, then to the display name itself.
 * Exported so the Story/Carousel generator can stamp the same clean attribution on its slides. */
export function citationDomain(item: NewsItem): string {
  try {
    const host = new URL(item.link).hostname.replace(/^www\./, '').toLowerCase();
    if (host && !AGGREGATOR_HOSTS.test(host)) return host;
  } catch {
    /* item.link isn't a URL — fall through to the name lookup */
  }
  const key = item.source.trim().toLowerCase();
  if (SOURCE_DOMAINS[key]) return SOURCE_DOMAINS[key];
  const hit = Object.keys(SOURCE_DOMAINS).find((name) => key.includes(name));
  return hit ? SOURCE_DOMAINS[hit] : item.source.trim();
}

/** LinkedIn only: a clean canonical article URL — protocol normalised, `www.`, tracking params
 * and `#fragment` stripped — or null when the link is a Google-News / aggregator redirect that
 * can't be resolved to the real article without a network hop (the caller then shows just the
 * bare-domain citation instead of an opaque redirect URL). */
function canonicalArticleUrl(link: string): string | null {
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');
  if (!/^https?:$/.test(u.protocol) || AGGREGATOR_HOSTS.test(host)) return null;
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAM.test(k)) u.searchParams.delete(k);
  u.hash = '';
  u.hostname = host;
  u.protocol = 'https:';
  const s = u.toString();
  return u.search ? s : s.replace(/\/$/, '');
}

/** Source attribution, the fixed closing line, then the hashtag line as the very last block —
 * appended after both the deterministic body and an LLM-synthesised one.
 *
 * Instagram captions can't carry clickable links, so IG gets a bare-domain text citation only
 * ("מקור: ynet.co.il · 01.09.2026"). LinkedIn gets that same citation plus the canonical article
 * URL — but only when it's a real publisher link, not a news.google.com redirect.
 *
 * The stock engagement question (GENERIC_ENGAGEMENT_LINE) no longer rides here: the closing slot
 * belongs to SITE_PROMO_FOOTER, and a poll in front of it is the meta-talk the register bans. */
function postTail(item: NewsItem, platform: SocialPlatform, hashtags: string[]): string[] {
  const isLinkedin = platform === 'linkedin';
  const dateLabel = formatDate(item.publishedAt);
  const citation = `מקור: ${[citationDomain(item), dateLabel].filter(Boolean).join(' · ')}`;

  const articleUrl = isLinkedin ? canonicalArticleUrl(item.link) : null;
  const sourceLine = articleUrl ? `${citation}\nלכתבה המלאה: ${articleUrl}` : citation;

  return [sourceLine, SITE_PROMO_FOOTER, hashtags.join(' ')].filter(Boolean);
}

/** Everything the post may draw entity tags from — the headline weighs in first. */
function tagContext(item: NewsItem, body: string): string {
  return [item.title, item.summary, item.excerpt, body].filter(Boolean).join('\n');
}

/**
 * DETERMINISTIC FALLBACK (no API key / synthesis failed): the headline and the article's own
 * summary, nothing invented around them. Tags come from the entities the article names; when it
 * names none, the line is simply left off rather than padded with a generic one.
 */
export function composeNewsPost(item: NewsItem, platform: SocialPlatform, reason?: string): ComposedPost {
  const isLinkedin = platform === 'linkedin';
  const headline = item.title.trim().replace(/[.׃]+$/, '');
  const context = contextParagraph(item.summary || item.excerpt, isLinkedin ? 1400 : 900);
  const body = enforceAnalystTone(stripMetaPhrases([`${headline}.`, context].filter(Boolean).join('\n\n')));
  const hashtags = contextualHashtags([], tagContext(item, body));

  const fullText = [body, ...postTail(item, platform, hashtags)].join('\n\n');
  return { fullText, hashtags, footer: SITE_PROMO_FOOTER, synthesized: false, fallbackReason: reason };
}

/** Wraps an LLM-synthesised post body with the standard source line, closing line and hashtags.
 *
 * The analyst filter runs HERE as well as on the server: the dashboard deploys independently of the
 * API it calls, so a body from an older server build — emoji, "במעבדה שלי", a closing poll, #AI —
 * is still brought into register before the operator sees it. */
export function assembleComposedPost(
  item: NewsItem,
  platform: SocialPlatform,
  body: string,
  aiHashtags: string[],
  altText?: string
): ComposedPost {
  const cleanBody = enforceAnalystTone(stripMetaPhrases(body.trim()));
  const hashtags = contextualHashtags(aiHashtags ?? [], tagContext(item, cleanBody));
  const fullText = [cleanBody, ...postTail(item, platform, hashtags)].join('\n\n');
  return { fullText, hashtags, footer: SITE_PROMO_FOOTER, synthesized: true, altText };
}

/**
 * PRIMARY (dashboard, human-in-the-loop): calls the site's post-synthesis endpoint
 * (/api/agent-generate · action:"post-synthesize") for an article-specific Hebrew analysis in the
 * senior-analyst register — every material fact from the source, plain text with no markdown
 * emphasis, no CTA (appended here), 3-5 entity hashtags, plus an ALT-text line.
 * Throws on any failure so the caller can fall back to composeNewsPost().
 */
export async function synthesizeNewsPost(
  item: NewsItem,
  platform: SocialPlatform,
  opts: { apiBase: string; adminSecret?: string }
): Promise<ComposedPost> {
  // Fetches the real article body when the feed teaser is thin — without this the synthesis was
  // fed an RSS <description> (58 characters on ice.co.il) and either tripped the floor below or
  // wrote a whole post from one sentence. See dashboard/src/lib/articleText.ts.
  const resolved = await resolveArticleText(item);
  const articleText = resolved.text;
  // These messages are shown to the operator verbatim on the fallback badge, so they are Hebrew
  // and name the cause — not the internal English strings the catch block used to swallow.
  if (articleText.length < 60) {
    const why = resolved.note ? ` — ${resolved.note}` : ' — פתחו את הכתבה המלאה';
    throw new Error(`טקסט הכתבה קצר מדי לניסוח AI (${articleText.length} תווים, נדרשים 60)${why}`);
  }

  const url = `${opts.apiBase.replace(/\/$/, '')}/api/agent-generate`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...adminSecretHeader(opts.adminSecret),
  };
  const reqBody = JSON.stringify({
    action: 'post-synthesize',
    title: item.title,
    source: item.source,
    topic: item.topic,
    platform,
    articleText,
  });

  // Retry once on a per-minute 429 throttle. A spent quota / depleted credits is not retried.
  let res = await fetch(url, { method: 'POST', headers, body: reqBody });
  const waitMs = await aiRetryDelayMs(res);
  if (waitMs !== null) {
    await new Promise((r) => setTimeout(r, waitMs));
    res = await fetch(url, { method: 'POST', headers, body: reqBody });
  }
  // One classifier for every failure shape — it also raises the shared 401 re-auth prompt once.
  if (!res.ok) throw new Error((await describeAiError(res)).message);
  const data = (await res.json()) as {
    ok?: boolean;
    blocked?: boolean;
    post?: { body?: string; hashtags?: string[]; altText?: string };
  };
  if (
    !data.ok ||
    data.blocked ||
    !data.post ||
    typeof data.post.body !== 'string' ||
    data.post.body.trim().length < 120
  ) {
    throw new Error(data.blocked ? 'הפלט נחסם ע"י מסנן התוכן' : 'מנוע ה-AI לא החזיר גוף פוסט שמיש');
  }
  return assembleComposedPost(item, platform, data.post.body, data.post.hashtags ?? [], data.post.altText);
}
