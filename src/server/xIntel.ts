/**
 * X intelligence — "why did this post work?" for the dashboard's X panel.
 *
 * ## What is actually free
 *
 * Checked 2026-09-22: the profile timeline (syndication) answers 429 to everyone, `x_search` needs
 * xAI credits, and the v2 API's read endpoints need a paid X Developer plan. The one keyless source
 * left is the per-post embed JSON (`cdn.syndication.twimg.com/tweet-result`), which carries the
 * text, media, timestamp and TWO engagement numbers: `favorite_count` (likes) and
 * `conversation_count` (replies). Reposts, quotes, views and bookmarks are not in it. So the panel
 * takes post URLs — the operator's own or viral posts from the AI niche — and never pretends to
 * have numbers it does not.
 *
 * Per post: likes, replies, age, likes/hour velocity, reply ratio (replies weigh 10× a like in the
 * open-sourced ranker, see xAlgorithm.ts), and the lever report from `scoreXThread`. Then ONE text call
 * (Groq, Gemini once Groq's daily budget is spent) reads the batch and explains, per post, what drove it — grounded in those numbers only.
 */
import { syndicationToken, normalizeXUrl } from './xPostFetcher.js';
import { scoreXThread, X_RANKING_WEIGHTS, type XAlgorithmReport } from './xAlgorithm.js';
import { generateContentWithRetry, isEngineConfigured, requireText, stripCodeFence, parseJsonOrThrow } from '../agent/geminiClient.js';
import { isGroqConfigured } from '../agent/groqClient.js';

export const X_INTEL_MAX_POSTS = 8;

export interface XIntelPost {
  id: string;
  url: string;
  author: string;
  authorName: string;
  verified: boolean;
  text: string;
  createdAt: string;
  ageHours: number;
  likes: number;
  replies: number;
  photos: number;
  hasVideo: boolean;
  hasLink: boolean;
  likesPerHour: number;
  /** Ranker-weighted engagement: replies × 5 + likes × 0.5 (the weights in xAlgorithm.ts). */
  weightedEngagement: number;
  report: XAlgorithmReport;
  /** Groq's read of why the post performed — empty when Groq is unavailable. */
  why: string[];
}

export interface XIntelResult {
  posts: XIntelPost[];
  failed: { url: string; reason: string }[];
  /** Cross-post pattern, one or two sentences. */
  pattern: string;
  /** 'ai' = Groq, or Gemini when Groq's daily budget is spent (routed by generateContentWithRetry). */
  analyst: 'ai' | 'none';
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' ? (v as Rec) : {});
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

async function fetchPost(id: string): Promise<Rec | null> {
  try {
    const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(id)}&token=${syndicationToken(id)}&lang=en`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = rec(await res.json());
    return str(data.id_str) ? data : null;
  } catch {
    return null;
  }
}

function toIntelPost(data: Rec, url: string, now: number): Omit<XIntelPost, 'why'> {
  const user = rec(data.user);
  const media = Array.isArray(data.mediaDetails) ? (data.mediaDetails as Rec[]) : [];
  const photos = media.filter((m) => str(m.type) === 'photo').length;
  const hasVideo = media.some((m) => ['video', 'animated_gif'].includes(str(m.type)));
  const urls = Array.isArray(rec(data.entities).urls) ? (rec(data.entities).urls as unknown[]) : [];
  const text = str(data.text).replace(/https:\/\/t\.co\/\w+/g, '').trim();
  const createdAt = str(data.created_at);
  const ageHours = Math.max(0.25, (now - new Date(createdAt).getTime()) / 3_600_000);
  const likes = num(data.favorite_count);
  const replies = num(data.conversation_count);
  return {
    id: str(data.id_str),
    url,
    author: str(user.screen_name) ? `@${str(user.screen_name)}` : '',
    authorName: str(user.name),
    verified: Boolean(user.is_blue_verified || user.verified),
    text,
    createdAt,
    ageHours: Math.round(ageHours * 10) / 10,
    likes,
    replies,
    photos,
    hasVideo,
    hasLink: urls.length > 0,
    likesPerHour: Math.round((likes / ageHours) * 10) / 10,
    weightedEngagement: Math.round(replies * X_RANKING_WEIGHTS.reply + likes * X_RANKING_WEIGHTS.favorite),
    report: scoreXThread({
      posts: [{ text: text + (urls.length ? ' https://link' : ''), mediaSlides: Array.from({ length: Math.min(4, photos) }, (_, i) => i) }],
      hasVideo,
    }),
  };
}

const ANALYST_SYSTEM = `אתה אנליסט תוכן ב-X שעובד עבור דניאל בן ברוך (AI בלבד: מודלי שפה, סוכנים, חדשות AI).
קיבלת פוסטים עם המספרים האמיתיים שלהם: לייקים, תגובות, גיל בשעות, קצב לייקים לשעה, מדיה, קישור, ודוח מנופים של האלגוריתם.
משקלות הדירוג בקוד הפתוח של X: תגובה 5, ציטוט 5, לייק 0.5, שיתוף קישור 20, מעקב 4, פתיחת קישור 0.2.

חוקים:
1. לכל פוסט 2-3 נקודות קצרות (עד 20 מילים כל אחת) שמסבירות מה הניע את הביצועים שלו — ההוק, הפורמט, המדיה, הזמן, יחס התגובות.
2. כל נקודה נשענת על מה שכתוב בפוסט או על המספרים שקיבלת. אסור להמציא צפיות, ריטוויטים או נתונים שלא ניתנו.
3. אם הביצועים חלשים — אמור מה חסר, בלי ריכוך.
4. בסוף: "pattern" — משפט או שניים על הדפוס המשותף לפוסטים החזקים, ומה ליישם בפוסט הבא.
5. עברית ישירה, בלי סופרלטיבים, בלי אימוג'ים. מונחים באנגלית נשארים באנגלית.
החזר JSON: {"posts":[{"id":"...","why":["...","..."]}],"pattern":"..."}`;

export async function analyzeXPosts(urls: string[]): Promise<XIntelResult> {
  const now = Date.now();
  const targets = [...new Set(urls.map((u) => String(u).trim()).filter(Boolean))].slice(0, X_INTEL_MAX_POSTS);
  const failed: XIntelResult['failed'] = [];
  const fetched = await Promise.all(
    targets.map(async (raw) => {
      const t = normalizeXUrl(raw);
      if (!t) {
        failed.push({ url: raw, reason: 'לא קישור לפוסט ב-X' });
        return null;
      }
      const data = await fetchPost(t.id);
      if (!data) {
        failed.push({ url: raw, reason: 'X לא החזיר את הפוסט (נמחק, מוגן, או חסימת קצב)' });
        return null;
      }
      return toIntelPost(data, t.url, now);
    }),
  );
  const posts = fetched.filter((p): p is Omit<XIntelPost, 'why'> => Boolean(p)).sort((a, b) => b.weightedEngagement / b.ageHours - a.weightedEngagement / a.ageHours);

  let whyById = new Map<string, string[]>();
  let pattern = '';
  let analyst: XIntelResult['analyst'] = 'none';
  if (posts.length && (isGroqConfigured() || isEngineConfigured())) {
    try {
      const brief = posts.map((p) => ({
        id: p.id,
        author: p.author,
        text: p.text.slice(0, 600),
        likes: p.likes,
        replies: p.replies,
        ageHours: p.ageHours,
        likesPerHour: p.likesPerHour,
        photos: p.photos,
        video: p.hasVideo,
        externalLink: p.hasLink,
        leverScore: p.report.score,
        failedLevers: p.report.checks.filter((c) => !c.passed).map((c) => c.label),
      }));
      const res = await generateContentWithRetry({
        model: 'gemini-3.6-flash',
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(brief) }] }],
        config: { systemInstruction: ANALYST_SYSTEM, temperature: 0.4, responseMimeType: 'application/json' },
      });
      const parsed = rec(parseJsonOrThrow<Rec>(stripCodeFence(requireText(res)), 'x intel'));
      const rows = Array.isArray(parsed.posts) ? (parsed.posts as Rec[]) : [];
      whyById = new Map(rows.map((r) => [str(r.id), (Array.isArray(r.why) ? r.why : []).map((w) => str(w).trim()).filter(Boolean).slice(0, 3)]));
      pattern = str(parsed.pattern).trim();
      analyst = 'ai';
    } catch (err) {
      console.warn('[x-intel] Groq analysis failed:', (err as Error)?.message ?? err);
    }
  }

  return { posts: posts.map((p) => ({ ...p, why: whyById.get(p.id) ?? [] })), failed, pattern, analyst };
}
