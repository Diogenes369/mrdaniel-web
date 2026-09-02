import type { NewsItem, NewsTopic } from '../services/newsService';

/**
 * Deterministic, client-side enrichment of a feed item for the News Command Center's expanded
 * view. The public /news page has no admin auth, so there is no LLM call here: the executive
 * summary and deep-dive are re-shaped from the article's OWN summary/excerpt text, and the
 * technical-impact section is topic-keyed editorial guidance framed as "considerations" — never
 * invented facts about the specific story.
 */

/** Bare registrable domain of a URL — "geektime.co.il", "www." stripped. */
export function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function toSentences(text: string): string[] {
  return (text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+(?=[^\s])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

function heDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('he-IL', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** 3–5 executive-summary bullets, drawn from the article's own text. */
export function executiveSummary(item: NewsItem): string[] {
  const src = (item.summary || item.excerpt || '').trim();
  const ss = toSentences(src);
  if (ss.length >= 3) return ss.slice(0, 5);

  const out: string[] = [];
  if (item.title) out.push(item.title.replace(/[.\s]+$/, '') + '.');
  if (src && !out.includes(src)) out.push(src.length > 12 ? src : `${src}.`);
  out.push(`הכתבה פורסמה ב-${item.source}${heDate(item.publishedAt) ? ` · ${heDate(item.publishedAt)}` : ''}.`);
  return out.filter(Boolean);
}

/** The deep-dive body: the article summary regrouped into readable ~2-sentence paragraphs. */
export function deepDive(item: NewsItem): string[] {
  const src = (item.summary || item.excerpt || '').trim();
  if (!src) {
    return [
      'הפיד סיפק לכתבה זו כותרת ותקציר קצר בלבד. הניתוח כאן מבוסס על המידע הזמין; לסיקור המלא עברו למקור המקורי בכפתור למטה.',
    ];
  }
  const ss = toSentences(src);
  if (ss.length <= 2) return [src];
  const paras: string[] = [];
  for (let i = 0; i < ss.length; i += 2) paras.push(ss.slice(i, i + 2).join(' '));
  return paras;
}

const IMPACT: Record<NewsTopic, { headline: string; points: string[] }> = {
  cyber: {
    headline: 'מה זה אומר לסביבת ה-IT והאבטחה שלכם',
    points: [
      'בדקו אם וקטור התקיפה או הפרצה שמתוארים רלוונטיים למערכות שבשימוש אצלכם — הפער הוא כמעט תמיד בין המדיניות הכתובה לבין מה שבאמת רץ ב-production.',
      'ודאו כיסוי EDR/XDR ולוגים על הנכסים הקריטיים, ושבקרת הזהויות (IAM/Entra ID) לא נשענת על סיסמה בלבד אלא על אימות רב-שלבי.',
      'לעסקים קטנים ובינוניים: עיקרון Zero-Trust כברירת מחדל — פילוח רשת, הרשאות מינימום ואימות מתמשך — מקטין את רדיוס הפגיעה גם בלי צוות אבטחה גדול.',
    ],
  },
  ai: {
    headline: 'מה זה אומר לאימוץ AI בארגון',
    points: [
      'ההזדמנות היא בתהליך העסקי, לא בכלי: סוכן שמאנדקס ידע ארגוני אמיתי (RAG) ומקבל החלטות בתוך workflow שווה יותר מצ׳אטבוט כללי.',
      'הטמעה בטוחה מחייבת שכבת ממשל — Guardrails, בקרת גישה לנתונים ותיעוד — אחרת כלי ה-AI הטוב ביותר הופך לחשיפת מידע.',
      'התחילו מתרחיש אחד מדיד (זמן טיפול, צמצום סיכון, משוב צוות) לפני הרחבה רוחבית בארגון.',
    ],
  },
  cloud: {
    headline: 'מה זה אומר לתשתית ולפיתוח',
    points: [
      'האיזון בין עלות, ביצועים ואבטחה בענן הוא החלטה ארכיטקטונית מתמשכת — לא הגדרה שמסמנים פעם אחת ושוכחים.',
      'ודאו Infrastructure-as-Code, סביבות מופרדות ובקרת שינויים; latency ורוחב פס משפיעים ישירות על חוויית המשתמש ועל עלות ה-compute.',
      'רשת ארגונית מודרנית (כולל Wi-Fi 7) משנה את מה שכדאי להריץ on-prem מול edge מול ענן — שווה למפות מחדש.',
    ],
  },
  general: {
    headline: 'מה זה אומר להחלטות הטכנולוגיות שלכם',
    points: [
      'הפרידו בין רעש שיווקי לשינוי מבני: מה מהעדכון הזה משנה בפועל תהליך, עלות או סיכון אצלכם?',
      'בדקו תלות ספקים והשלכות תאימות לפני שמאמצים גרסה, פלטפורמה או ספק חדשים.',
      'צוות ה-IT שיתחזק את זה בשוטף הוא השיקול שנוטים לפספס — קחו אותו בחשבון כבר בשלב ההחלטה.',
    ],
  },
};

export function technicalImpact(item: NewsItem): { headline: string; points: string[] } {
  return IMPACT[item.topic] ?? IMPACT.general;
}
