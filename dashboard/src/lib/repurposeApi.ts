import { SITE_ORIGIN } from './useDashboardRefresh';
import { getAdminSecret } from './adminSecret';
import { describeAiError } from './aiErrors';

/** Shared POST helper with one bounded 429 retry (Gemini free-tier hourly cap). */
async function post(action: string, body: Record<string, unknown>): Promise<Response> {
  const url = `${SITE_ORIGIN.replace(/\/$/, '')}/api/agent-generate`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(getAdminSecret() ? { 'x-admin-secret': getAdminSecret() } : {}),
  };
  const payload = JSON.stringify({ action, ...body });
  let res = await fetch(url, { method: 'POST', headers, body: payload });
  if (res.status === 429) {
    let waitMs = 6000;
    try {
      const j = (await res.clone().json()) as { retryAfterSeconds?: number };
      if (typeof j.retryAfterSeconds === 'number') waitMs = Math.min(12000, Math.max(3000, j.retryAfterSeconds * 1000));
    } catch {
      /* keep default */
    }
    await new Promise((r) => setTimeout(r, waitMs));
    res = await fetch(url, { method: 'POST', headers, body: payload });
  }
  return res;
}

export interface ImportedContent {
  ok: boolean;
  url: string;
  title: string;
  body: string;
  image: string;
  source: string;
  via: 'direct' | 'jina' | 'none';
}

// ─── clean & de-duplicate extraction (mirrors src/server/contentImport.ts) ───────────────────

function normKey(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/["'׳״“”‘’.,:;!?()\[\]{}|—–\-•·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NOISE_LINE =
  /^(?:\d[\d,.]*\s*(?:תגובות|תגובה|comments?|reactions?|likes?|shares?|repost(?:s|ed)?).*|(?:הצג|ראה|קרא)\s+(?:עוד|הכל).*|(?:see|show|read)\s+more\b.*|(?:like|comment|share|repost|send|save|follow(?:ing)?|connect)\b.*|activate to view.*|report this\s+(?:post|comment|article|profile)\b.*|(?:promoted|sponsored)\b.*|(?:ממומן|מקודם|edited|נערך).*|\d+\s*(?:w|d|h|mo|yr|שע|יום|שב)\b.*|hashtag\b.*|#[\p{L}\p{N}_]+(?:\s+#[\p{L}\p{N}_]+)*|\d[\d,]*\s*(?:followers|עוקבים|connections|קשרים).*|(?:view profile|צפייה בפרופיל|message|שליחת הודעה).*|(?:image|photo|תמונה)|(?:תנאי שימוש|מדיניות פרטיות|privacy policy|terms of (?:use|service)|צרו קשר|contact us|about us|הניוזלטר.*|newsletter.*|כל הזכויות שמורות.*|all rights reserved.*|©.*|הקוד האתי.*|בואו נתחיל!?|היי,?\s*אנחנו.*|עקבו אחרינו.*|follow us.*|קטגוריות|categories|תפריט|menu|דילוג לתוכן|skip to (?:content|main)|כתבות (?:נוספות|קשורות).*|related (?:posts|articles).*|read (?:next|also).*|עוד (?:בנושא|כתבות).*|share this.*|שתפו.*)|[—–\-]\s*[\p{L}][\p{L}'.֐-׿ \-]{1,38}|\s*[•·|—–\-]\s*)$/iu;

const CONSENT_HINT =
  /(?:עוגיות|cookies?)\b|consent (?:banner|panel)|האחסון או הגישה הטכניים|technical storage or access|legitimate purpose of storing|למטרה החוקית של מתן|subscriber or user|אי-הסכמה או ביטול הסכמה/i;

/** Truncate at the first "end of article" marker past the first ~400 chars of real content. */
function cutAtTail(text: string): string {
  const markers: RegExp[] = [
    /\n[^\n]*\bGeektime INSIDER\b/i,
    /\n\s*\{\s*כללי\s*\}/,
    /\nכתבות (?:נוספות|קשורות|מומלצות)/,
    /\nעוד (?:בנושא|כתבות|מ)/,
    /\nPlease leave this field empty/i,
    /\n-?\s*\[[ x]\]\s*אני מאשר/,
    /\nהירשמו? לניוזלטר/,
    /\nשתפו את הכתבה/,
    /\n(?:לכתבה|למאמר) (?:הקודמ|הבא)/,
    /\nrelated (?:posts|articles|stories)/i,
    /\nsubscribe to (?:our )?newsletter/i,
  ];
  let cut = text.length;
  for (const re of markers) {
    const m = text.slice(400).match(re);
    if (m && m.index !== undefined) cut = Math.min(cut, 400 + m.index);
  }
  return text.slice(0, cut).trim();
}

/** Crop leading site-nav / trailing footer clutter to the first/last real prose line. */
function cropToArticle(text: string): string {
  const lines = text.split('\n');
  const isProse = (l: string): boolean => {
    const t = l.trim();
    if (CONSENT_HINT.test(t)) return false;
    return (t.length >= 70 && /[.!?…]/.test(t) && /[א-ת]/.test(t)) || (t.length >= 120 && /[A-Za-z]/.test(t));
  };
  let start = lines.findIndex(isProse);
  if (start < 0) return text;
  const head = lines.slice(0, start).filter((l) => l.trim());
  const shortish = head.filter((l) => l.trim().length < 50).length;
  if (head.length < 3 || shortish / Math.max(1, head.length) < 0.6) start = 0;
  let end = lines.length;
  for (let i = lines.length - 1; i > start; i--) {
    if (isProse(lines[i])) {
      end = i + 1;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

const BYLINE_LINE = /^\s*(?:מאת|נכתב(?:\s+על[- ]ידי)?|כתב[הת]?|קרדיט|by|written by|posted by|author|source|via)\s*[:\-–—]?\s*.{1,60}$/i;

const TRAILING_AUTHOR = /[\s ]*[|｜]\s*[\p{L}][\p{L}'.\-֐-׿]{1,20}(?:\s+[\p{L}][\p{L}'.\-֐-׿]{1,20}){0,3}\s*$/u;

/** Remove social/UI noise lines, author bylines, a first line that duplicates the headline,
 * repeated paragraphs, and a trailing "| Author" credit. */
export function cleanExtractedBody(rawBody: string, title: string): string {
  let text = (rawBody || '')
    .replace(/\r\n?/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[*•‣▪]\s+/gm, '')
    .replace(/\[\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*https?:\/\/\S+\s*$/gm, '')
    .replace(/^\s*(?:mon|tue|wed|thu|fri|sat|sun),?\s+\d{1,2}\s+\S+\s+\d{4}\b.*$/gim, '')
    .replace(/^\s*\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\s*$/gm, '')
    .replace(/^\s*\[[ x]\]\s.*$/gim, '')
    .replace(
      /^.*(?:אנחנו משתמשים בטכנולוגיות כמו עוגיות|הסכמה לטכנולוגיות אלו תאפשר|לאחסון ו\/או גישה למידע במכשיר|נתונים אישיים כמו התנהגות גלישה|אי-הסכמה או ביטול הסכמה|האחסון או הגישה הטכניים|העדפות שלא התבקשו|נהל אפשרויות|צפה בהעדפות|תמיד פעיל|we use cookies (?:and|to|on)|by (?:clicking|continuing)[^.]*(?:accept|consent)|cookie (?:policy|consent|settings|preferences)|manage (?:your )?(?:cookie )?preferences|the technical storage or access|is necessary for the legitimate purpose|purpose of storing preferences|view preferences|always active|(?:העדפות|סטטיסטיקה|שיווק|פונקציונלי|נחוץ)-?\s*\[).*$/gim,
      ''
    );
  text = cutAtTail(cropToArticle(text));
  const titleKey = normKey(title);
  const lines = text.split('\n').map((l) => l.trim());
  const kept: string[] = [];
  for (const line of lines) {
    if (!line) {
      if (kept.length && kept[kept.length - 1] !== '') kept.push('');
      continue;
    }
    if (NOISE_LINE.test(line) || BYLINE_LINE.test(line)) continue;
    if (kept.filter(Boolean).length === 0 && titleKey.length > 10) {
      const lk = normKey(line);
      if (lk === titleKey || (lk.length > 12 && (titleKey.includes(lk) || lk.includes(titleKey)))) continue;
    }
    kept.push(line);
  }

  // Drop runs of >=4 consecutive short link-label lines (site nav / category column dumps).
  const short = (l: string) => l.length > 0 && l.length < 34 && !/[.!?…:]/.test(l);
  const pruned: string[] = [];
  for (let i = 0; i < kept.length; i++) {
    if (short(kept[i])) {
      let j = i;
      while (j < kept.length && (short(kept[j]) || kept[j] === '')) j++;
      if (kept.slice(i, j).filter(Boolean).length >= 4) {
        i = j - 1;
        continue;
      }
    }
    pruned.push(kept[i]);
  }
  text = pruned.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  const seen = new Set<string>();
  const paras: string[] = [];
  for (const p of text.split(/\n{2,}/)) {
    const para = p.trim();
    if (!para) continue;
    const key = normKey(para).slice(0, 90);
    if (key.length > 20 && seen.has(key)) continue;
    if (para.length < 400 && paras.some((k) => normKey(k).includes(normKey(para)) && normKey(para).length > 20)) continue;
    seen.add(key);
    paras.push(para);
  }
  text = paras.join('\n\n').trim().replace(TRAILING_AUTHOR, '').trim();

  const finalLines = text.split('\n');
  while (finalLines.length && (BYLINE_LINE.test(finalLines[finalLines.length - 1].trim()) || NOISE_LINE.test(finalLines[finalLines.length - 1].trim()))) {
    finalLines.pop();
  }
  return finalLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Strip original-author credits and social-network noise from AI-generated copy — the only
 * brand on the output is mrdaniel.co.il. */
export function stripAuthorNoise(text: string): string {
  return (text || '')
    .replace(/^\s*(?:מאת|נכתב(?:\s+על[- ]ידי)?|קרדיט|כתב[הת]?|by|written by|posted by|source|via)\s*[:\-–—]?\s*.{1,60}$/gim, '')
    .replace(/\b\d[\d,]*\s*(?:comments?|תגובות)\s*(?:on LinkedIn|על LinkedIn)?/gi, '')
    .replace(/\b(?:via|through)\s+(?:LinkedIn|Twitter|X|Facebook|Instagram)\b/gi, '')
    .replace(/(?:פורסם|נצפה)\s+(?:במקור\s+)?ב[- ]?(?:LinkedIn|לינקדאין|טוויטר|פייסבוק)\b/gi, '')
    .replace(/[ \t]*[|｜]\s*[\p{L}][\p{L}'.\-֐-׿]{1,20}(?:\s+[\p{L}][\p{L}'.\-֐-׿]{1,20}){0,3}\s*$/u, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * DEEP SCRAPE — fetch a news article's full body text (server-side: direct fetch → Jina Reader
 * `r.jina.ai` → `cleanExtractedBody`). Used to rescue slide generation for feed items whose
 * summary is a thin headline fragment. Never throws — returns '' if extraction fails / is blocked.
 */
export async function fetchFullArticleBody(url: string): Promise<string> {
  try {
    const res = await post('import-url', { url });
    if (!res.ok) return '';
    const data = (await res.json()) as { ok?: boolean; blocked?: boolean; imported?: ImportedContent };
    if (!data.ok || data.blocked || !data.imported?.body) return '';
    return cleanExtractedBody(data.imported.body, data.imported.title || '');
  } catch {
    return '';
  }
}

/** Server-side best-effort import of a pasted URL (LinkedIn post / article / blog). */
export async function importUrl(url: string): Promise<ImportedContent> {
  const res = await post('import-url', { url });
  if (!res.ok) throw new Error((await describeAiError(res)).message);
  const data = (await res.json()) as { ok?: boolean; blocked?: boolean; imported?: ImportedContent };
  if (data.blocked) throw new Error('התוכן שיובא נחסם ע"י מסנן התוכן.');
  if (!data.ok || !data.imported) throw new Error('לא הצלחנו לחלץ תוכן מהקישור — נסו להדביק את הטקסט ידנית.');
  const imported = data.imported;
  // Belt-and-braces: re-clean client-side too (covers an older server deploy).
  return { ...imported, body: cleanExtractedBody(imported.body, imported.title) };
}

/** Synthesise platform-tailored Hebrew copy for a channel from raw source text. */
export async function synthesizeChannelPost(
  input: { title: string; source: string; topic: string; articleText: string; variant: 'linkedin' | 'whatsapp' }
): Promise<{ body: string; hashtags: string[] }> {
  const res = await post('post-synthesize', {
    title: input.title,
    source: input.source,
    topic: input.topic,
    platform: 'linkedin',
    variant: input.variant,
    articleText: input.articleText,
  });
  if (!res.ok) throw new Error((await describeAiError(res)).message);
  const data = (await res.json()) as {
    ok?: boolean;
    blocked?: boolean;
    post?: { body?: string; hashtags?: string[] };
  };
  if (data.blocked) throw new Error('הפלט נחסם ע"י מסנן התוכן.');
  if (!data.ok || !data.post || typeof data.post.body !== 'string' || data.post.body.trim().length < 80) {
    throw new Error('מנוע ה-AI לא החזיר טקסט שמיש.');
  }
  return { body: data.post.body, hashtags: data.post.hashtags ?? [] };
}

/** Local parser for pasted raw text (often a copied LinkedIn post with its UI chrome): first
 * non-empty line → headline, rest → body, a trailing bare URL → source link. The body is run
 * through the same cleanup as URL imports (drops "X תגובות על LinkedIn", author trailers,
 * duplicated headline line, repeated paragraphs). */
export function parseRawText(raw: string): { title: string; body: string; link: string } {
  const text = (raw || '').replace(/\r/g, '').trim();
  if (!text) return { title: '', body: '', link: '' };
  const urlMatch = text.match(/https?:\/\/[^\s)]+/);
  const link = urlMatch ? urlMatch[0] : '';
  const withoutUrl = link ? text.replace(link, '').trim() : text;
  const lines = withoutUrl.split('\n').map((l) => l.trim()).filter(Boolean);
  // first content-bearing line (skip leading noise) becomes the title
  const firstContentIdx = lines.findIndex((l) => !NOISE_LINE.test(l) && !BYLINE_LINE.test(l) && l.length > 3);
  const title = (lines[firstContentIdx >= 0 ? firstContentIdx : 0] || '').slice(0, 120);
  const rest = lines.slice((firstContentIdx >= 0 ? firstContentIdx : 0) + 1).join('\n');
  const body = cleanExtractedBody(rest || withoutUrl, title);
  return { title, body, link };
}
