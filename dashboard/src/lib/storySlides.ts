import type { NewsItem, NewsTopic } from './newsAgentTypes';

/**
 * Splits a news item into 3–4 sequential Instagram-Story slides (text/data only — the canvas
 * rendering lives in instagramStoryRenderer.ts). Deterministic, client-side. A server copy in
 * src/server/storySlides.ts keeps the same shape for the autonomous cron.
 */

export type StorySlideKind = 'cover' | 'bullets' | 'insight' | 'cta';

export interface StorySlide {
  kind: StorySlideKind;
  index: number;
  total: number;
  /** Topic label shown on every slide for unified branding. */
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
  /** Background image for the renderer (proxied original / topic stock). */
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

const FALLBACK_POINTS: Record<NewsTopic, string[]> = {
  cyber: ['שטח התקיפה גדל מהר יותר מהיכולת לנטר אותו', 'Zero-Trust ו-MFA הם קו ההגנה עם התשואה הגבוהה ביותר', 'תוכנית תגובה לאירועים שלא תורגלה — היא מסמך, לא יכולת'],
  ai: ['סוכן טוב נבנה סביב תהליך אחד, לא סביב "צ׳אט עם הכל"', 'RAG הוא ההבדל בין תשובה מבוססת-מקור להזיה', 'מגדירים מדד הצלחה מספרי לפני הפיילוט'],
  cloud: ['FinOps מהיום הראשון — תיוג, תקרות תקציב והתראות', 'Infrastructure as Code הופך סביבה לנכס בר-שחזור', 'הפרדת סביבות והרשאות מינימום הן קו הגנה ראשון'],
  general: ['אינטגרציה לפני כלים חדשים', 'אוטומציה של תהליך חוזר אחד מחזירה השקעה מהר', 'אבטחה היא חלק מהאפיון, לא שלב אחריו'],
};

/** 2–3 short points from the item's summary, padded from the topic bank if the feed text is thin. */
function summaryPoints(text: string, topic: NewsTopic): string[] {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  const sentences = clean
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.replace(/[.…]+$/, '').trim())
    .filter((s) => s.length >= 15 && s.length <= 150);
  const out = sentences.slice(0, 3);
  for (const extra of FALLBACK_POINTS[topic]) {
    if (out.length >= 3) break;
    if (!out.includes(extra)) out.push(extra);
  }
  return out.slice(0, 3);
}

export function buildStorySlides(item: NewsItem, imageUrl: string): StoryPayload {
  const topic = item.topic;
  const kicker = KICKER[topic];
  const total = 4;

  const slides: StorySlide[] = [
    { kind: 'cover', index: 0, total, kicker, headline: item.title.trim(), source: item.source },
    { kind: 'bullets', index: 1, total, kicker, heading: 'מה קרה?', points: summaryPoints(item.summary || item.excerpt, topic) },
    { kind: 'insight', index: 2, total, kicker, heading: 'למה זה חשוב?', body: INSIGHT[topic] },
    {
      kind: 'cta',
      index: 3,
      total,
      kicker,
      heading: 'רוצים להעמיק?',
      body: 'לכתבה המלאה ולעוד עדכונים בזמן אמת, סייבר ופתרונות סוכני AI',
      linkLabel: 'mrdaniel.co.il',
    },
  ];

  return {
    newsId: item.id,
    newsTitle: item.title,
    newsLink: item.link,
    topic,
    imageUrl,
    slides,
    createdAt: Date.now(),
  };
}
