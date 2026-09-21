import type { NewsItem, NewsTopic } from './newsFeed.js';
import { stripMetaPhrases } from './storySlides.js';

/**
 * Server-side counterpart of dashboard/src/lib/newsPostComposer.ts — kept as a separate copy
 * because the two run in different build graphs (Vercel Function vs the dashboard bundle). Same
 * structure and content banks: Hook → מה קרה → למה זה חשוב → עיקרי הדברים → זווית המומחה →
 * source → engagement → hashtags → MANDATORY site-promo footer (always last).
 */

export type SocialPlatform = 'linkedin' | 'instagram';

export const SITE_PROMO_FOOTER =
  '💡 אהבתם את התוכן? לעוד עדכונים, חדשות בזמן אמת ופתרונות סוכני AI מתקדמים – היכנסו עכשיו לאתר: mrdaniel.co.il';

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
    'הפער בין מי שמדבר על AI לבין מי שבאמת מבין איך הוא עובד רק הולך ומתרחב. {title}',
    '{title} — עוד סימן שהשאלה כבר לא "האם AI" אלא "איפה, איך, ובאיזו בקרה".',
    'כל תהליך חוזר וצפוי הוא מועמד לאוטומציה מבוססת סוכן — וזה אחד הדברים הראשונים שכדאי להבין בתחום. {title}',
  ],
  ai_models: [
    '{title} — עוד מודל, עוד יכולות, ועוד הזדמנות להבין לאן התחום הזה זז.',
    'קצב שחרור המודלים הפך למרוץ שקט בין המעבדות הגדולות. {title}',
    '{title}. הפער בין מודל שמככב בבנצ׳מרק לבין מודל שעובד בפרודקשן הולך ומצטמצם.',
    'מי שעדיין בונה על גרסת מודל אחת בלי אסטרטגיית מעבר — כדאי שיעצור רגע. {title}',
  ],
  ai_agents: [
    '{title}. מי שעדיין מחכה ש"זה יתבהר" — כבר מאחר.',
    'הפער בין מי שמדבר על AI לבין מי שבאמת מבין איך הוא עובד רק הולך ומתרחב. {title}',
    '{title} — עוד סימן שהשאלה כבר לא "האם AI" אלא "איפה, איך, ובאיזו בקרה".',
    'כל תהליך חוזר וצפוי הוא מועמד לאוטומציה מבוססת סוכן — וזה אחד הדברים הראשונים שכדאי להבין בתחום. {title}',
  ],
  general: [
    '{title}. הטכנולוגיה זזה מהר — היתרון שייך למי שמתרגם אותה לערך, לא למי שרק עוקב.',
    '{title} — ושוב מתברר שהחדשנות האמיתית היא לא הכלי, אלא איך משלבים אותו בתהליך.',
    'בעולם רווי באזז, {title} מזכיר שמה שנשאר בסוף זה מה שעובד בשטח.',
  ],
};

const WHY_IT_MATTERS: Record<NewsTopic, string> = {
  ai:
    'סוכני AI (Agentic AI) כבר לא דמו: לא עוד צ׳אטבוט שעונה על שאלה, אלא מערכת שמפרקת משימה מורכבת לצעדים, מפעילה כלים ומערכות אמיתיות (CRM, מייל, בסיסי נתונים) דרך פרוטוקולים כמו MCP, ומחזירה תוצאה מקצה לקצה. ההבדל בין דמו מרשים למערכת שבאמת עובדת הוא לא ביכולת של המודל אלא במה שעוטף אותו: חיבור לנתונים הנכונים (RAG), ושכבת בקרה שמאשרת פעולות רגישות לפני שהן קורות. מי שלומד את התחום — שם נמצאת העבודה האמיתית.',
  ai_models:
    'מעבר לכותרת: כל שחרור מודל חדש מזיז את עקומת היכולת-מול-עלות, ולא תמיד לכיוון שברור מיד — מודל "חכם יותר" לפי בנצ׳מרק לא בהכרח זול יותר, מהיר יותר, או יציב יותר במשימה הספציפית שלכם. ההבדל בין מעבדות מציג פערים אמיתיים: מודלים קנייניים (Closed) מול מודלים פתוחי-משקל (Open-Weight) שאפשר לארח ולכוונן עצמאית, חלונות הקשר (Context Window) שגדלים אבל לא תמיד נוצלים נכון, ועלויות Inference שמצטברות בשקט בקנה מידה.',
  ai_agents:
    'סוכני AI (Agentic AI) כבר לא דמו: לא עוד צ׳אטבוט שעונה על שאלה, אלא מערכת שמפרקת משימה מורכבת לצעדים, מפעילה כלים ומערכות אמיתיות (CRM, מייל, בסיסי נתונים) דרך פרוטוקולים כמו MCP, ומחזירה תוצאה מקצה לקצה. ההבדל בין דמו מרשים למערכת שבאמת עובדת הוא לא ביכולת של המודל אלא במה שעוטף אותו: חיבור לנתונים הנכונים (RAG), ושכבת בקרה שמאשרת פעולות רגישות לפני שהן קורות. מי שלומד את התחום — שם נמצאת העבודה האמיתית.',
  general:
    'מעבר לכותרת: הכלי עצמו הוא רק חצי מהסיפור. הערך נוצר כשמחברים אותו לעבודה האמיתית — למסמכים, להודעות וליומן — ומודדים כמה זמן הוא באמת חוסך. מי שלומד את התחום מרוויח מלהבין את החיבור הזה, לא רק את הכלי.',
};

const TAKEAWAYS: Record<NewsTopic, string[]> = {
  ai: [
    'סוכן AI מוצלח נבנה סביב משימה אחת שהוא עושה טוב יותר מכל כלי כללי — לא סביב "צ׳אט עם הכל".',
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
    'סוכן AI מוצלח נבנה סביב משימה אחת שהוא עושה טוב יותר מכל כלי כללי — לא סביב "צ׳אט עם הכל".',
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

/** Up to ~`maxChars`, ALWAYS ending on a full sentence. Never appends "…", never cuts mid-sentence. */
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
  fullText: string;
  hashtags: string[];
  footer: string;
  /** true when the body was written by the adaptive LLM synthesis step; false = deterministic. */
  synthesized: boolean;
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

  const engagement = isLinkedin
    ? 'מה הדבר שהכי לא היה ברור לכם כאן? כתבו בתגובות.'
    : 'שתפו בתגובות מה הכי מפתיע אתכם כאן 👇';
  return [sourceLine, engagement, hashtags.join(' '), SITE_PROMO_FOOTER];
}

/**
 * DETERMINISTIC FALLBACK (no API key / synthesis failed). Organic flow — no fixed
 * "📌 / 🔍 / 📋 / 🎯" header blocks: hook, then the article's own facts, then the analysis and
 * technical context as running paragraphs, one header-free takeaway cluster with a varied
 * lead-in, and the field note to close.
 */
export function composeNewsPost(item: NewsItem, platform: SocialPlatform): ComposedPost {
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
  return { fullText, hashtags, footer: SITE_PROMO_FOOTER, synthesized: false };
}

/** Wraps an LLM-synthesised post body (adaptive structure, article-typed) with the standard
 * source line, engagement prompt, hashtags and mandatory promo footer. */
export function assembleComposedPost(
  item: NewsItem,
  platform: SocialPlatform,
  body: string,
  aiHashtags: string[]
): ComposedPost {
  const hashtags = (
    aiHashtags && aiHashtags.length >= 3 ? aiHashtags : topicHashtags(item.topic, platform === 'linkedin')
  ).slice(0, 12);
  const fullText = [stripMetaPhrases(body.trim()), ...postTail(item, platform, hashtags)].join('\n\n');
  return { fullText, hashtags, footer: SITE_PROMO_FOOTER, synthesized: true };
}

/**
 * PRIMARY (dashboard, human-in-the-loop): calls the site's post-synthesis endpoint
 * (/api/agent-generate · action:"post-synthesize") for an adaptive, article-typed Hebrew post
 * body — dynamic structure per subject (cyber incident / AI launch / hardware / policy), every
 * material fact from the source woven in, organic paragraphs, **bold** key terms. Throws on any
 * failure so the caller can fall back to composeNewsPost().
 */
export async function synthesizeNewsPost(
  item: NewsItem,
  platform: SocialPlatform,
  opts: { apiBase: string; adminSecret?: string }
): Promise<ComposedPost> {
  const articleText = (item.summary || item.excerpt || '').trim();
  if (articleText.length < 60) throw new Error('article text too thin for synthesis');

  const url = `${opts.apiBase.replace(/\/$/, '')}/api/agent-generate`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.adminSecret ? { 'x-admin-secret': opts.adminSecret } : {}),
  };
  const reqBody = JSON.stringify({
    action: 'post-synthesize',
    title: item.title,
    source: item.source,
    topic: item.topic,
    platform,
    articleText,
  });

  // Retry once on a 429 (Gemini free-tier hourly cap) after a short bounded wait.
  let res = await fetch(url, { method: 'POST', headers, body: reqBody });
  if (res.status === 429) {
    let waitMs = 6000;
    try {
      const j = (await res.clone().json()) as { retryAfterSeconds?: number };
      if (typeof j.retryAfterSeconds === 'number') waitMs = Math.min(12000, Math.max(3000, j.retryAfterSeconds * 1000));
    } catch {
      /* keep default wait */
    }
    await new Promise((r) => setTimeout(r, waitMs));
    res = await fetch(url, { method: 'POST', headers, body: reqBody });
  }
  if (res.status === 429) throw new Error('post-synthesize rate-limited (429) — Gemini free-tier hourly quota');
  if (res.status === 401) throw new Error('post-synthesize unauthorized (401) — x-admin-secret missing/mismatched');
  if (!res.ok) throw new Error(`post-synthesize responded ${res.status}`);
  const data = (await res.json()) as {
    ok?: boolean;
    blocked?: boolean;
    post?: { body?: string; hashtags?: string[] };
  };
  if (
    !data.ok ||
    data.blocked ||
    !data.post ||
    typeof data.post.body !== 'string' ||
    data.post.body.trim().length < 120
  ) {
    throw new Error('post-synthesize returned no usable body');
  }
  return assembleComposedPost(item, platform, data.post.body, data.post.hashtags ?? []);
}

const TOPIC_FALLBACK_IMAGE: Record<NewsTopic, string> = {
  ai: 'https://images.pexels.com/photos/8386440/pexels-photo-8386440.jpeg?auto=compress&cs=tinysrgb&w=1080',
  // Reuses a photo already verified reachable in the dashboard's curated Pexels pool (pexelsBackground.ts).
  ai_models: 'https://images.pexels.com/photos/8108716/pexels-photo-8108716.jpeg?auto=compress&cs=tinysrgb&w=1080',
  ai_agents: 'https://images.pexels.com/photos/8386440/pexels-photo-8386440.jpeg?auto=compress&cs=tinysrgb&w=1080',
  // Reuses a photo already verified reachable in the dashboard's curated Pexels pool (pexelsBackground.ts).
  general: 'https://images.pexels.com/photos/373543/pexels-photo-373543.jpeg?auto=compress&cs=tinysrgb&w=1080',
};

/** The image URL the publish payload should carry: the item's own photo (routed through the site's
 * CORS relay so downstream tools that fetch it don't hit hotlink/CORS issues) or a topic-matched
 * stock photo. Server-side branded compositing is intentionally not part of this codebase — the
 * dashboard renders the branded canvas version for review/download. */
export function publishImageUrl(item: NewsItem, siteOrigin: string): string {
  if (item.image) return `${siteOrigin}/api/img-proxy?url=${encodeURIComponent(item.image)}`;
  return TOPIC_FALLBACK_IMAGE[item.topic];
}
