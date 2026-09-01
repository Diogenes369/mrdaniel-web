import type { NewsItem, NewsTopic } from './newsAgentTypes';

/**
 * Server copy of dashboard/src/lib/storySlides.ts — the autonomous cron builds the same
 * Instagram-Story text payload alongside the feed-post caption and saves it to Firebase for the
 * dashboard's Story Studio to render. Text/data only; no canvas server-side.
 *
 * Slide count is DYNAMIC (4–6) based on how much substance the article's `summary` carries:
 *   cover → "מה קרה" (overview) → ["העמקה" (deep dive)] → "למה זה חשוב" (takeaways)
 *         → ["המשמעות לעסק שלכם" (business impact)] → CTA
 * The two bracketed slides are added only when the feed text yields enough distinct points.
 */

export type StorySlideKind = 'cover' | 'bullets' | 'insight' | 'cta';

export interface StorySlide {
  kind: StorySlideKind;
  index: number;
  total: number;
  kicker: string;
  heading?: string;
  headline?: string;
  points?: string[];
  body?: string;
  linkLabel?: string;
  source?: string;
}

export interface StoryPayload {
  newsId: string;
  newsTitle: string;
  newsLink: string;
  topic: NewsTopic;
  imageUrl: string;
  slides: StorySlide[];
  createdAt: number;
}

const KICKER: Record<NewsTopic, string> = {
  cyber: 'סייבר ואבטחה',
  ai: 'בינה מלאכותית',
  cloud: 'ענן ותשתיות',
  general: 'טכנולוגיה',
};

const INSIGHT: Record<NewsTopic, string> = {
  cyber: 'רוב הפריצות לא מתחילות ב-0-day אלא בהרשאה עודפת, בנכס שנשכח או במשתמש בלי MFA. מהירות הזיהוי והבידוד היא ההבדל בין אירוע מנוהל למשבר עסקי.',
  ai: 'סוכני AI כבר מבצעים משימות שלמות מקצה לקצה. הערך נמדד בשעות תפעול שמוחזרות ובזמן תגובה שמתקצר — לא ב"וואו" של הדמו.',
  cloud: 'ארכיטקטורת ענן נכונה היא הבסיס לכל מוצר מהיר ויציב — אבל גם המקום שבו עלויות וחוב טכני מצטברים בשקט. משילות לפני עוד שירות מנוהל.',
  general: 'היתרון התחרותי לא מגיע מאימוץ כל טרנד, אלא מהיכולת לבחור קרב אחד — תהליך אחד, מדד אחד — ולבצע אותו עד הסוף עם תשתית, אבטחה ומדידה.',
};

/** "So what does it mean for a small team / solo operator" — the business-impact slide. */
const IMPACT: Record<NewsTopic, string> = {
  cyber: 'בשבילכם, כעסק קטן או עצמאי: כדאי לוודא כבר היום שהחשיפה הזו לא קיימת אצלכם — סקירת הרשאות, MFA וניטור בסיסי עולים שעות עבודה, לא תקציב ענק.',
  ai: 'הזווית המעשית: אותה יכולת שמתוארת כאן זמינה גם לצוות קטן — סוכן ממוקד לתהליך אחד, זמן הטמעה קצר, ו-ROI שנמדד בשבועות ולא ברבעונים.',
  cloud: 'המשמעות: ארכיטקטורה נכונה עכשיו חוסכת חוב טכני וחשבון ענן מנופח אחר כך. תיוג, תקרות תקציב והפרדת סביבות — לפני עוד שירות מנוהל.',
  general: 'בתכל׳ס: לא לרדוף אחרי כל טרנד — לזהות תהליך אחד שאפשר לשפר, לחבר אותו למערכות הקיימות, ולמדוד את התוצאה עד הסוף.',
};

const FALLBACK_POINTS: Record<NewsTopic, string[]> = {
  cyber: ['שטח התקיפה גדל מהר יותר מהיכולת לנטר אותו', 'Zero-Trust ו-MFA הם קו ההגנה עם התשואה הגבוהה ביותר', 'תוכנית תגובה לאירועים שלא תורגלה — היא מסמך, לא יכולת'],
  ai: ['סוכן טוב נבנה סביב תהליך אחד, לא סביב "צ׳אט עם הכל"', 'RAG הוא ההבדל בין תשובה מבוססת-מקור להזיה', 'מגדירים מדד הצלחה מספרי לפני הפיילוט'],
  cloud: ['FinOps מהיום הראשון — תיוג, תקרות תקציב והתראות', 'Infrastructure as Code הופך סביבה לנכס בר-שחזור', 'הפרדת סביבות והרשאות מינימום הן קו הגנה ראשון'],
  general: ['אינטגרציה לפני כלים חדשים', 'אוטומציה של תהליך חוזר אחד מחזירה השקעה מהר', 'אבטחה היא חלק מהאפיון, לא שלב אחריו'],
};

/** All usable sentences from the article body, cleaned and de-duplicated, newest-first order kept.
 * Wider bounds than before (up to 200 chars, up to 8 items) so deep-dive slides have real material. */
function extractPoints(text: string): string[] {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  const seen = new Set<string>();
  return clean
    .split(/(?<=[.!?…])\s+|\s+[-–—]\s+/)
    .map((s) => s.replace(/^["'׳״]+|["'׳״.…]+$/g, '').trim())
    .filter((s) => {
      if (s.length < 15 || s.length > 200) return false;
      const key = s.slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function padPoints(base: string[], topic: NewsTopic, want: number): string[] {
  const out = [...base];
  for (const extra of FALLBACK_POINTS[topic]) {
    if (out.length >= want) break;
    if (!out.some((p) => p.slice(0, 20) === extra.slice(0, 20))) out.push(extra);
  }
  return out.slice(0, want);
}

/** Journalistic slide headline pulled from the article's own text: drop leading filler, keep it
 * to a scannable ~46 chars on a word boundary, no trailing punctuation. Falls back to `alt` when
 * the source sentence is too thin to carry a headline. */
function headlineFrom(text: string | undefined, alt: string): string {
  let s = (text || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/^(לפי|על פי|עם זאת|בנוסף|כמו כן|בין היתר|יצוין כי|למעשה)[,\s]+/u, '');
  s = s.replace(/["'׳״.…:;\-–—]+$/u, '').trim();
  if (s.length < 14) return alt;
  if (s.length <= 46) return s;
  const cut = s.slice(0, 46);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > 24 ? cut.slice(0, lastSpace) : cut}…`;
}

// Sharp, non-generic frames — used only when the article text can't yield a headline.
const LEAD_HEADING: Record<NewsTopic, string> = {
  cyber: 'מה קרה בשטח הסייבר',
  ai: 'ההתפתחות ב-AI',
  cloud: 'מה זז בענן ובתשתיות',
  general: 'הידיעה בקצרה',
};
const TAKEAWAY_HEADING: Record<NewsTopic, string> = {
  cyber: 'הלקח למי שמגן על עסק',
  ai: 'מה זה אומר על AI בעסק שלכם',
  cloud: 'המשמעות לארכיטקטורה שלכם',
  general: 'הזווית המעשית',
};

export function buildStorySlides(item: NewsItem, imageUrl: string): StoryPayload {
  const topic = item.topic;
  const kicker = KICKER[topic];
  const pts = extractPoints(item.summary || item.excerpt);

  const overview = padPoints(pts.slice(0, 3), topic, 3);
  const deep = pts.slice(3, 6); // real deep-dive material only — never padded
  const hasDeep = deep.length >= 2;
  const rich = hasDeep || (item.summary?.length ?? 0) > 320;

  const slides: StorySlide[] = [];
  slides.push({ kind: 'cover', index: 0, total: 0, kicker, headline: item.title.trim(), source: item.source });
  slides.push({ kind: 'bullets', index: 0, total: 0, kicker, heading: headlineFrom(pts[0], LEAD_HEADING[topic]), points: overview });
  if (hasDeep) slides.push({ kind: 'bullets', index: 0, total: 0, kicker, heading: headlineFrom(deep[0], 'הפרטים המלאים'), points: deep });
  slides.push({ kind: 'insight', index: 0, total: 0, kicker, heading: TAKEAWAY_HEADING[topic], body: INSIGHT[topic] });
  if (rich) slides.push({ kind: 'insight', index: 0, total: 0, kicker, heading: 'בשורה התחתונה לעסק קטן', body: IMPACT[topic] });
  slides.push({
    kind: 'cta',
    index: 0,
    total: 0,
    kicker,
    heading: 'רוצים ליישם את זה אצלכם?',
    body: 'סוכני AI, אוטומציה והגנת סייבר לעצמאים ולעסקים קטנים — אפיון קצר וחוזרים אליכם עם תוכנית.',
    linkLabel: 'mrdaniel.co.il',
  });

  const total = slides.length;
  slides.forEach((s, i) => {
    s.index = i;
    s.total = total;
  });

  return { newsId: item.id, newsTitle: item.title, newsLink: item.link, topic, imageUrl, slides, createdAt: Date.now() };
}
