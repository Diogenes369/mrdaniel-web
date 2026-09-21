import { GENERIC_ENGAGEMENT_LINE, SITE_PROMO_FOOTER, type NewsItem, type NewsTopic, type SocialPlatform } from './newsAgentTypes';
import { describeAiError, aiRetryDelayMs } from './aiErrors';
import { adminSecretHeader } from './adminSecret';
import { stripMetaPhrases } from './storySlides';
import { resolveArticleText } from './articleText';

/**
 * Turns a news item into a rich, long-form, ready-to-publish social post — entirely client-side
 * (deterministic, no API key, no rate limit).
 *
 * Every post is structured:
 *   Hook → "מה קרה" (context) → "למה זה חשוב" (deep-dive) → "עיקרי הדברים" (3–4 bullets) →
 *   "זווית המומחה" (strategic insight) → source line → engagement prompt →
 *   strategic hashtags → MANDATORY site-promo footer (always last).
 *
 * The deep-dive / takeaways / expert-insight text is topic-level, authoritative Hebrew written for
 * an AI expert voice; the item's own headline + summary are woven in. Hook and takeaway
 * selection are seeded off the item title, so the same item is stable but different items vary.
 */

const TOPIC_HASHTAGS: Record<NewsTopic, string[]> = {
  ai: ['#בינה_מלאכותית', '#AI', '#GenAI', '#סוכני_AI', '#AgenticAI', '#LLM', '#RAG', '#Automation'],
  ai_models: ['#מודלי_AI', '#LLM', '#GenerativeAI', '#OpenWeights', '#MachineLearning', '#AIResearch', '#GPT', '#Claude'],
  ai_agents: ['#בינה_מלאכותית', '#AI', '#GenAI', '#סוכני_AI', '#AgenticAI', '#LLM', '#RAG', '#Automation'],
  general: ['#טכנולוגיה', '#Tech', '#חדשנות', '#Innovation', '#דיגיטל', '#אוטומציה', '#טרנספורמציה_דיגיטלית'],
};

const GLOBAL_HASHTAGS = ['#הייטק', '#TechIL', '#ישראל', '#StartupNation', '#טכנולוגיה_ישראלית'];

const HOOKS: Record<NewsTopic, string[]> = {
  ai: [
    '{title}. מי שעדיין מחכה ש"זה יתבהר" — כבר מאחר.',
    'הפער בין מי שמדבר על AI לבין מי שבאמת עובד איתו רק הולך ומתרחב. {title}',
    '{title} — עוד סימן שהשאלה כבר לא "האם AI" אלא "איפה, איך, ובאיזו בקרה".',
    'כל תהליך חוזר בארגון שלכם הוא מועמד לאוטומציה מבוססת סוכן. {title}',
  ],
  ai_models: [
    '{title} — עוד מודל, עוד יכולות, ועוד שאלה שכל ארגון צריך לשאול: מה זה אומר בשבילנו.',
    'קצב שחרור המודלים הפך למרוץ שקט בין המעבדות הגדולות. {title}',
    '{title}. הפער בין מודל שמככב בבנצ׳מרק לבין מודל שעובד בפרודקשן הולך ומצטמצם.',
    'מי שעדיין בונה על גרסת מודל אחת בלי אסטרטגיית מעבר — כדאי שיעצור רגע. {title}',
  ],
  ai_agents: [
    '{title}. מי שעדיין מחכה ש"זה יתבהר" — כבר מאחר.',
    'הפער בין מי שמדבר על AI לבין מי שבאמת עובד איתו רק הולך ומתרחב. {title}',
    '{title} — עוד סימן שהשאלה כבר לא "האם AI" אלא "איפה, איך, ובאיזו בקרה".',
    'כל תהליך חוזר בארגון שלכם הוא מועמד לאוטומציה מבוססת סוכן. {title}',
  ],
  general: [
    '{title}. הטכנולוגיה זזה מהר — היתרון שייך למי שמתרגם אותה לערך, לא למי שרק עוקב.',
    '{title} — ושוב מתברר שהחדשנות האמיתית היא לא הכלי, אלא איך משלבים אותו בתהליך.',
    'בעולם רווי באזז, {title} מזכיר שמה שנשאר בסוף זה מה שעובד בשטח.',
  ],
};

const WHY_IT_MATTERS: Record<NewsTopic, string> = {
  ai:
    'סוכני AI (Agentic AI) כבר לא דמו: לא עוד צ׳אטבוט שעונה על שאלה, אלא מערכת שמפרקת משימה מורכבת לצעדים, מפעילה כלים ומערכות אמיתיות (CRM, מייל, בסיסי נתונים) דרך פרוטוקולים כמו MCP, ומחזירה תוצאה מקצה לקצה. הערך העסקי לא נמדד ב"וואו" של הדמו אלא בשעות תפעול שמוחזרות לצוות, בזמן תגובה ללקוח שמתקצר משעות לשניות, ובשגיאות אנוש שנעלמות. האתגר האמיתי הוא הטמעה אחראית — חיבור לנתונים הנכונים (RAG), שכבת בקרה שמאשרת פעולות רגישות, ומדידת ROI אמיתית.',
  ai_models:
    'מעבר לכותרת: כל שחרור מודל חדש מזיז את עקומת היכולת-מול-עלות, ולא תמיד לכיוון שברור מיד — מודל "חכם יותר" לפי בנצ׳מרק לא בהכרח זול יותר, מהיר יותר, או יציב יותר במשימה הספציפית שלכם. ההבדל בין מעבדות מציג פערים אמיתיים: מודלים קנייניים (Closed) מול מודלים פתוחי-משקל (Open-Weight) שאפשר לארח ולכוונן עצמאית, חלונות הקשר (Context Window) שגדלים אבל לא תמיד נוצלים נכון, ועלויות Inference שמצטברות בשקט בקנה מידה.',
  ai_agents:
    'סוכני AI (Agentic AI) כבר לא דמו: לא עוד צ׳אטבוט שעונה על שאלה, אלא מערכת שמפרקת משימה מורכבת לצעדים, מפעילה כלים ומערכות אמיתיות (CRM, מייל, בסיסי נתונים) דרך פרוטוקולים כמו MCP, ומחזירה תוצאה מקצה לקצה. הערך העסקי לא נמדד ב"וואו" של הדמו אלא בשעות תפעול שמוחזרות לצוות, בזמן תגובה ללקוח שמתקצר משעות לשניות, ובשגיאות אנוש שנעלמות. האתגר האמיתי הוא הטמעה אחראית — חיבור לנתונים הנכונים (RAG), שכבת בקרה שמאשרת פעולות רגישות, ומדידת ROI אמיתית.',
  general:
    'מעבר לכותרת: הכלי עצמו הוא רק חצי מהסיפור. הערך נוצר כשמחברים אותו לעבודה האמיתית — למסמכים, להודעות וליומן — ומודדים כמה זמן הוא באמת חוסך. מי שלומד את התחום מרוויח מלהבין את החיבור הזה, לא רק את הכלי.',
};

const TAKEAWAYS: Record<NewsTopic, string[]> = {
  ai: [
    'סוכן AI מוצלח נבנה סביב תהליך עסקי אחד שהוא עושה טוב יותר מכל כלי כללי — לא סביב "צ׳אט עם הכל".',
    'RAG (שליפה מבוססת-מקור) הוא ההבדל בין תשובה סמכותית לבין הזיה בטוחה בעצמה.',
    'שכבת Guardian שמאשרת, חוסמת ומתעדת כל פעולה — הכרחית לפני שמחברים סוכן למערכות ייצור.',
    'אינטגרציה דרך MCP הופכת חיבור למערכות (CRM, ERP, יומן, מייל) לסטנדרטי, מאובטח וקל לתחזוקה.',
    'ה-ROI נמדד בשעות שמוחזרות לצוות ובזמן תגובה ללקוח — הגדירו את המדד לפני הפיילוט, לא אחריו.',
    'Prompt Injection ודליפת מידע דרך פרומפטים הם וקטורי תקיפה חדשים — אבטחת AI היא חלק מהאפיון.',
    'התחילו קטן: תהליך אחד, מדד הצלחה אחד, שבועיים להטמעה — ואז מרחיבים בהדרגה.',
  ],
  ai_models: [
    'לפני שמאמצים מודל חדש — בדקו על המשימה שלכם, לא על בנצ׳מרק כללי. תוצאות משתנות דרמטית בין תחומים.',
    'עלות Inference בקנה מידה יכולה לעלות על עלות ה-API עצמה — מדדו טוקנים בפועל, לא רק את המחיר לטוקן.',
    'מודל פתוח-משקל (Open-Weight) נותן שליטה, פרטיות ועצמאות מספק — במחיר של תחזוקת תשתית ואירוח עצמאי.',
    'חלון הקשר גדול לא פותר בעיית עיצוב פרומפט — RAG ממוקד עדיין מנצח "לזרוק הכל למודל".',
    'תכננו מראש למעבר בין גרסאות מודל — API ותיקה מוצאת משימוש (Deprecated) מהר יותר ממה שנדמה.',
    'הערכה (Evaluation) שיטתית עם מדגם מקרים אמיתיים — לא תחושת בטן — היא מה שמבדיל אימוץ מוצלח מכישלון שקט.',
  ],
  ai_agents: [
    'סוכן AI מוצלח נבנה סביב תהליך עסקי אחד שהוא עושה טוב יותר מכל כלי כללי — לא סביב "צ׳אט עם הכל".',
    'RAG (שליפה מבוססת-מקור) הוא ההבדל בין תשובה סמכותית לבין הזיה בטוחה בעצמה.',
    'שכבת Guardian שמאשרת, חוסמת ומתעדת כל פעולה — הכרחית לפני שמחברים סוכן למערכות ייצור.',
    'אינטגרציה דרך MCP הופכת חיבור למערכות (CRM, ERP, יומן, מייל) לסטנדרטי, מאובטח וקל לתחזוקה.',
    'ה-ROI נמדד בשעות שמוחזרות לצוות ובזמן תגובה ללקוח — הגדירו את המדד לפני הפיילוט, לא אחריו.',
    'Prompt Injection ודליפת מידע דרך פרומפטים הם וקטורי תקיפה חדשים — אבטחת AI היא חלק מהאפיון.',
    'התחילו קטן: תהליך אחד, מדד הצלחה אחד, שבועיים להטמעה — ואז מרחיבים בהדרגה.',
  ],
  general: [
    'אינטגרציה לפני כלים חדשים: מערכת שמדברת עם המערכות הקיימות שווה יותר מעוד רכש.',
    'אוטומציה של תהליך חוזר אחד, עם מדד הצלחה ברור, מחזירה השקעה מהר יותר מ"טרנספורמציה" רחבה.',
    'אבטחה ופרטיות הן חלק מהאפיון (Security by Design), לא שלב אחרי הפיתוח.',
    'מדדו את מה שחשוב: שעות שנחסכו, זמן תגובה, שגיאות שירדו — לא כמות הפיצ׳רים.',
    'ראייה מערכתית: תשתית, אבטחה ואוטומציה הן מקשה אחת — לא שלושה פרויקטים נפרדים.',
  ],
};

const EXPERT_INSIGHT: Record<NewsTopic, string> = {
  ai:
    'מהשטח: הפרויקטים שמצליחים הם אלה שמתחילים מתהליך כואב וספציפי, מגדירים מדד הצלחה מספרי, ומטמיעים סוכן צר עם בקרה — ולא אלה שמנסים "להכניס AI לכל מקום" בבת אחת. הטכנולוגיה בשלה; מה שמבדיל הוא המשמעת בהגדרת ההיקף.',
  ai_models:
    'מהשטח: מי שמפיק הכי הרבה ערך ממודלים חדשים הם אלה שבנו שכבת הפשטה (Abstraction) מעל ספק המודל — כך שמעבר מ-GPT ל-Claude ל-Gemini, או משדרוג גרסה, הוא שינוי קונפיגורציה ולא כתיבה מחדש. מי שחיבר את המודל ישירות לכל שכבות המוצר משלם על כך בכל עדכון.',
  ai_agents:
    'מהשטח: הפרויקטים שמצליחים הם אלה שמתחילים מתהליך כואב וספציפי, מגדירים מדד הצלחה מספרי, ומטמיעים סוכן צר עם בקרה — ולא אלה שמנסים "להכניס AI לכל מקום" בבת אחת. הטכנולוגיה בשלה; מה שמבדיל הוא המשמעת בהגדרת ההיקף.',
  general:
    'מהשטח: היתרון התחרותי לא מגיע מאימוץ מוקדם של כל טרנד, אלא מהיכולת לבחור את הקרב הנכון — תהליך אחד, מדד אחד — ולבצע אותו עד הסוף עם תשתית, אבטחה ומדידה.',
};

/** A concrete technical-context paragraph per topic — names the actual architecture / attack
 * chain so the post reads as researched, not hand-wavy. Included on LinkedIn (long-form) only. */
const TECH_CONTEXT: Record<NewsTopic, string> = {
  ai:
    'הקשר הטכני: סוכן אג׳נטי אמיתי = מודל שפה (Claude / GPT / Gemini) + שכבת תזמור שמפרקת משימה לצעדים + כלים דרך פרוטוקולים כמו MCP + RAG על בסיס הידע הפנימי + שכבת Guardian שמאשרת פעולות רגישות. הנקודה הקריטית היא צמצום היקף: תהליך אחד, מדד הצלחה מספרי אחד, והרחבה בהדרגה.',
  ai_models:
    'הקשר הטכני: מודל שפה חדש נמדד בכמה צירים במקביל — איכות תשובה (בנצ׳מרק ומשימה אמיתית), חלון הקשר, מהירות Inference, עלות לטוקן, ותמיכה ב-Function/Tool Calling. ההבדל בין מודל סגור (API בלבד) למודל פתוח-משקל (ניתן להורדה ואירוח עצמי) הוא לא רק רישוי — הוא שליטה על Fine-Tuning, פרטיות נתונים, ותלות בזמינות ספק חיצוני.',
  ai_agents:
    'הקשר הטכני: סוכן אג׳נטי אמיתי = מודל שפה (Claude / GPT / Gemini) + שכבת תזמור שמפרקת משימה לצעדים + כלים דרך פרוטוקולים כמו MCP + RAG על בסיס הידע הפנימי + שכבת Guardian שמאשרת פעולות רגישות. הנקודה הקריטית היא צמצום היקף: תהליך אחד, מדד הצלחה מספרי אחד, והרחבה בהדרגה.',
  general:
    'הקשר הטכני: הערך נוצר באינטגרציה — API שמחבר בין מערכות, תהליך אוטומטי מקצה לקצה, ושכבת מדידה על התוצאה. תשתית רשת יציבה, אבטחה מודרנית ואוטומציה חכמה הן מקשה אחת, לא שלושה פרויקטים נפרדים.',
};

function seededInt(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function seededPick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

/** Deterministic distinct subset of `arr`, length `count`, driven by `seed`. */
function seededSubset<T>(arr: T[], count: number, seed: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  let s = seed || 1;
  while (out.length < count && pool.length > 0) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out.push(pool.splice(s % pool.length, 1)[0]);
  }
  return out;
}

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

/** Close a fragment with a full stop so takeaways read as flowing sentences, not a list. */
function asSentence(s: string): string {
  const t = (s || '').replace(/^[▪️•\-–—*\s]+/, '').trim();
  return !t || /[.!?…]$/.test(t) ? t : `${t}.`;
}

function topicHashtags(topic: NewsTopic, isLinkedin: boolean): string[] {
  const topicTags = isLinkedin ? TOPIC_HASHTAGS[topic].slice(0, 6) : TOPIC_HASHTAGS[topic];
  const globalTags = isLinkedin ? GLOBAL_HASHTAGS.slice(0, 3) : GLOBAL_HASHTAGS;
  return [...topicTags, ...globalTags];
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

/** Source attribution, engagement prompt, hashtag line and the mandatory promo footer —
 * appended after both the deterministic body and an LLM-synthesised one.
 *
 * Instagram captions can't carry clickable links, so IG gets a bare-domain text citation only
 * ("מקור: ynet.co.il · 01.09.2026"). LinkedIn gets that same citation plus the canonical article
 * URL — but only when it's a real publisher link, not a news.google.com redirect. */
function postTail(item: NewsItem, platform: SocialPlatform, hashtags: string[]): string[] {
  const isLinkedin = platform === 'linkedin';
  const dateLabel = formatDate(item.publishedAt);
  const citation = `מקור: ${[citationDomain(item), dateLabel].filter(Boolean).join(' · ')}`;

  const articleUrl = isLinkedin ? canonicalArticleUrl(item.link) : null;
  const sourceLine = articleUrl ? `${citation}\nלכתבה המלאה: ${articleUrl}` : citation;

  const engagement = GENERIC_ENGAGEMENT_LINE[platform];
  return [sourceLine, engagement, hashtags.join(' '), SITE_PROMO_FOOTER];
}

/**
 * DETERMINISTIC FALLBACK (no API key / synthesis failed). Organic flow — no fixed
 * "📌 / 🔍 / 📋 / 🎯" header blocks: hook, then the article's own facts, then the analysis and
 * technical context as running paragraphs, one header-free takeaway cluster with a varied
 * lead-in, and the field note to close.
 */
export function composeNewsPost(item: NewsItem, platform: SocialPlatform, reason?: string): ComposedPost {
  const topic = item.topic;
  const seed = seededInt(item.title);
  const isLinkedin = platform === 'linkedin';

  const hook = seededPick(HOOKS[topic], seed).replace('{title}', item.title.trim());
  const context = contextParagraph(item.summary || item.excerpt, isLinkedin ? 900 : 520);
  // Takeaways woven into ONE flowing paragraph — no bullet markers, no "📋 / כמה נקודות" label.
  const takeaways = seededSubset(TAKEAWAYS[topic], isLinkedin ? 5 : 4, seed).map(asSentence).filter(Boolean).join(' ');
  const hashtags = topicHashtags(topic, isLinkedin);

  const body = stripMetaPhrases(
    [
      hook,
      context,
      WHY_IT_MATTERS[topic],
      isLinkedin ? TECH_CONTEXT[topic] : '',
      takeaways,
      EXPERT_INSIGHT[topic],
    ]
      .filter(Boolean)
      .join('\n\n')
  );

  const fullText = [body, ...postTail(item, platform, hashtags)].join('\n\n');
  return { fullText, hashtags, footer: SITE_PROMO_FOOTER, synthesized: false, fallbackReason: reason };
}

/** Wraps an LLM-synthesised post body (adaptive structure, article-typed) with the standard
 * source line, engagement prompt, hashtags and mandatory promo footer. */
export function assembleComposedPost(
  item: NewsItem,
  platform: SocialPlatform,
  body: string,
  aiHashtags: string[],
  altText?: string
): ComposedPost {
  // Capped at 5: the brief calls for exactly 3-5 relevant Israeli-market tags, and a long tag
  // block reads as spam on both Instagram and LinkedIn.
  const hashtags = (
    aiHashtags && aiHashtags.length >= 3 ? aiHashtags : topicHashtags(item.topic, platform === 'linkedin')
  ).slice(0, 5);
  const fullText = [stripMetaPhrases(body.trim()), ...postTail(item, platform, hashtags)].join('\n\n');
  return { fullText, hashtags, footer: SITE_PROMO_FOOTER, synthesized: true, altText };
}

/**
 * PRIMARY (dashboard, human-in-the-loop): calls the site's post-synthesis endpoint
 * (/api/agent-generate · action:"post-synthesize") for an adaptive, article-typed Hebrew post
 * body — a four-part conversion structure (hook / value + insight / brand tie-in / CTA) written
 * for Israeli business owners and SMBs, every material fact from the source woven in, plain text
 * with no markdown emphasis, 3-5 hashtags, plus an ALT-text line for accessibility and image SEO.
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
