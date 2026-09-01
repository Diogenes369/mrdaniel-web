import { SITE_PROMO_FOOTER, type NewsItem, type NewsTopic, type SocialPlatform } from './newsAgentTypes';

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
 * a tech/cyber expert voice; the item's own headline + summary are woven in. Hook and takeaway
 * selection are seeded off the item title, so the same item is stable but different items vary.
 */

const TOPIC_HASHTAGS: Record<NewsTopic, string[]> = {
  cyber: ['#סייבר', '#אבטחת_מידע', '#אבטחת_סייבר', '#CyberSecurity', '#InfoSec', '#ZeroTrust', '#Ransomware', '#SOC'],
  ai: ['#בינה_מלאכותית', '#AI', '#GenAI', '#סוכני_AI', '#AgenticAI', '#LLM', '#RAG', '#Automation'],
  cloud: ['#ענן', '#Cloud', '#DevOps', '#FinOps', '#Terraform', '#Kubernetes', '#תשתיות_IT', '#IaC'],
  general: ['#טכנולוגיה', '#Tech', '#חדשנות', '#Innovation', '#דיגיטל', '#אוטומציה', '#טרנספורמציה_דיגיטלית'],
};

const GLOBAL_HASHTAGS = ['#הייטק', '#TechIL', '#ישראל', '#StartupNation', '#טכנולוגיה_ישראלית'];

const HOOKS: Record<NewsTopic, string[]> = {
  cyber: [
    '{title} — וזו בדיוק התזכורת שאף ארגון לא אוהב לקבל.',
    'בזמן שאתם קוראים את השורות האלה, מישהו כבר בודק אם הדלת אצלכם פתוחה. {title}',
    'אבטחת מידע היא לא פרויקט שנגמר — היא משמעת יומיומית. {title}',
    '{title}. עוד אירוע שמזכיר שהחוליה החלשה כמעט תמיד תהליכית או אנושית, לא טכנולוגית.',
  ],
  ai: [
    '{title}. מי שעדיין מחכה ש"זה יתבהר" — כבר מאחר.',
    'הפער בין ארגונים שמדברים על AI לבין כאלה שמייצרים איתו ערך רק הולך ומתרחב. {title}',
    '{title} — עוד סימן שהשאלה כבר לא "האם AI" אלא "איפה, איך, ובאיזו בקרה".',
    'כל תהליך חוזר בארגון שלכם הוא מועמד לאוטומציה מבוססת סוכן. {title}',
  ],
  cloud: [
    '{title}. תשתית טובה היא כזו שאף אחד לא מרגיש — עד שהיא נופלת.',
    'העלות האמיתית של ענן לא מופיעה בחשבונית — היא מופיעה בארכיטקטורה. {title}',
    '{title} — תזכורת שאסטרטגיית ענן בלי משילות (Governance) היא בעיקר חשבון שגדל.',
  ],
  general: [
    '{title}. הטכנולוגיה זזה מהר — היתרון שייך למי שמתרגם אותה לערך, לא למי שרק עוקב.',
    '{title} — ושוב מתברר שהחדשנות האמיתית היא לא הכלי, אלא איך משלבים אותו בתהליך.',
    'בעולם רווי באזז, {title} מזכיר שמה שנשאר בסוף זה מה שעובד בשטח.',
  ],
};

const WHY_IT_MATTERS: Record<NewsTopic, string> = {
  cyber:
    'מעבר לכותרת, האירוע הזה חושף דפוס מוכר: תוקפים מנצלים את הפער שבין "יש לנו כלי הגנה" לבין "הכלים מוגדרים, מנוטרים ומתוחזקים כמו שצריך". רוב הפריצות המשמעותיות לא מתחילות ב-0-day מתוחכם, אלא בהרשאה עודפת, בנכס שנשכח, במשתמש בלי MFA או בסגמנט רשת שאפשר לנוע בו לרוחב בלי התנגדות. ברגע שתוקף בפנים — מהירות הזיהוי והבידוד היא מה שקובע אם מדובר באירוע מנוהל או במשבר עסקי עם השבתה ודליפת מידע.',
  ai:
    'ההבשלה של סוכני AI (Agentic AI) משנה את כללי המשחק: לא עוד צ׳אטבוט שעונה על שאלה, אלא מערכת שמפרקת משימה מורכבת לצעדים, מפעילה כלים ומערכות אמיתיות (CRM, מייל, בסיסי נתונים) דרך פרוטוקולים כמו MCP, ומחזירה תוצאה מקצה לקצה. הערך העסקי לא נמדד ב"וואו" של הדמו אלא בשעות תפעול שמוחזרות לצוות, בזמן תגובה ללקוח שמתקצר משעות לשניות, ובשגיאות אנוש שנעלמות. האתגר האמיתי הוא הטמעה אחראית — חיבור לנתונים הנכונים (RAG), שכבת בקרה שמאשרת פעולות רגישות, ומדידת ROI אמיתית.',
  cloud:
    'מעבר לכותרת: ארכיטקטורת ענן נכונה היא הבסיס לכל מוצר דיגיטלי מהיר, יציב ובר-הרחבה — אבל היא גם המקום שבו עלויות, אבטחה וחוב טכני מצטברים בשקט. ההחלטות המשמעותיות הן לא "איזה ספק" אלא איך מנהלים זהויות והרשאות, איך מפרידים סביבות, איך מגדירים תקרות עלות והתראות, ואיך שומרים על יכולת יציאה (Exit) בלי כאב עתידי.',
  general:
    'מעבר לכותרת: קצב השינוי הטכנולוגי מייצר הזדמנות אמיתית לארגונים שיודעים לחבר בין תשתיות רשת חזקות, אבטחה מודרנית ואוטומציה חכמה — ולא בין רכיבים נפרדים. הערך נוצר באינטגרציה: כשמערכות מדברות זו עם זו, כשהתהליך אוטומטי מקצה לקצה, וכשיש בקרה ומדידה על התוצאה, לא רק על הפעילות.',
};

const TAKEAWAYS: Record<NewsTopic, string[]> = {
  cyber: [
    'שטח התקיפה גדל מהר יותר מהיכולת לנטר אותו — מיפוי נכסים מלא ורציף הוא תנאי בסיס, לא "נייס טו הב".',
    'Zero-Trust הוא לא מוצר אלא ארכיטקטורה: אימות מתמשך, הרשאות מינימום (Least Privilege) והפרדת רשתות (Micro-segmentation).',
    'MFA על כל גישה מרחוק וכל חשבון פריבילגי — ההגנה עם יחס העלות/תועלת הגבוה ביותר שקיים.',
    'תוכנית תגובה לאירועים (IR) שלא תורגלה היא מסמך, לא יכולת. תרגול רבעוני מקצר את זמן התגובה בפועל.',
    'גיבוי שאינו מנותק (offline / immutable) ולא נבדק בשחזור — לא ייתן מענה מול כופרה.',
    'הקשחה לפי Benchmark של תחנות, שרתים וציוד תקשורת מצמצמת את משטח התקיפה עוד לפני שמדברים על EDR.',
    'הזמן שבין חדירה לגילוי נמדד לרוב בשבועות — ניטור מרוכז (SIEM/XDR) עם תגובה מוגדרת מקצר אותו לשעות.',
  ],
  ai: [
    'סוכן AI מוצלח נבנה סביב תהליך עסקי אחד שהוא עושה טוב יותר מכל כלי כללי — לא סביב "צ׳אט עם הכל".',
    'RAG (שליפה מבוססת-מקור) הוא ההבדל בין תשובה סמכותית לבין הזיה בטוחה בעצמה.',
    'שכבת Guardian שמאשרת, חוסמת ומתעדת כל פעולה — הכרחית לפני שמחברים סוכן למערכות ייצור.',
    'אינטגרציה דרך MCP הופכת חיבור למערכות (CRM, ERP, יומן, מייל) לסטנדרטי, מאובטח וקל לתחזוקה.',
    'ה-ROI נמדד בשעות שמוחזרות לצוות ובזמן תגובה ללקוח — הגדירו את המדד לפני הפיילוט, לא אחריו.',
    'Prompt Injection ודליפת מידע דרך פרומפטים הם וקטורי תקיפה חדשים — אבטחת AI היא חלק מהאפיון.',
    'התחילו קטן: תהליך אחד, מדד הצלחה אחד, שבועיים להטמעה — ואז מרחיבים בהדרגה.',
  ],
  cloud: [
    'FinOps מהיום הראשון: תיוג משאבים, תקרות תקציב והתראות — לפני שהחשבונית מפתיעה.',
    'Infrastructure as Code (Terraform) הופך סביבה מ"ידע בראש של מישהו" לנכס גרסאתי ובר-שחזור.',
    'הפרדת סביבות (dev / stage / prod) והרשאות מינימום הן קו הגנה ראשון, לא יכולת מתקדמת.',
    'ניטור, לוגים ו-Tracing מבוזרים — בלעדיהם "המערכת איטית" נשארת תעלומה יקרה.',
    'אל תיכנסו ל-Lock-In בעיניים עצומות: תכננו את נקודות היציאה מראש.',
    'אוטומציית CI/CD עם בדיקות ו-Rollback מוגדר — ההבדל בין דיפלוי שגרתי לבין לילה לבן.',
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
  cyber:
    'מהשטח: ארגונים שמשקיעים בהיגיינת אבטחה בסיסית — ניהול הרשאות, הקשחה, ניטור והפרדת רשתות — סופגים פחות אירועים ומתאוששים מהר יותר מאלה שרוכשים את "המוצר הכי מתקדם" ומשאירים אותו בהגדרות ברירת מחדל. הפער הוא לא בתקציב, הוא במשמעת תפעולית.',
  ai:
    'מהשטח: הפרויקטים שמצליחים הם אלה שמתחילים מתהליך כואב וספציפי, מגדירים מדד הצלחה מספרי, ומטמיעים סוכן צר עם בקרה — ולא אלה שמנסים "להכניס AI לכל מקום" בבת אחת. הטכנולוגיה בשלה; מה שמבדיל הוא המשמעת בהגדרת ההיקף.',
  cloud:
    'מהשטח: רוב חריגות התקציב וההשבתות בענן לא נובעות מטכנולוגיה חסרה אלא ממשילות חסרה — חוסר תיוג, הרשאות רחבות מדי, וסביבות שלא מופרדות. סדר תפעולי שווה יותר מכל שירות מנוהל חדש.',
  general:
    'מהשטח: היתרון התחרותי לא מגיע מאימוץ מוקדם של כל טרנד, אלא מהיכולת לבחור את הקרב הנכון — תהליך אחד, מדד אחד — ולבצע אותו עד הסוף עם תשתית, אבטחה ומדידה.',
};

/** A concrete technical-context paragraph per topic — names the actual architecture / attack
 * chain so the post reads as researched, not hand-wavy. Included on LinkedIn (long-form) only. */
const TECH_CONTEXT: Record<NewsTopic, string> = {
  cyber:
    'הקשר הטכני: שרשרת התקיפה המוכרת היא גישה ראשונית (פישינג / אשראי שדלף / שירות חשוף) → הסלמת הרשאות → תנועה לרוחב ברשת שטוחה → הוצאת מידע או הצפנה. נקודות השבירה: MFA על כל גישה מרחוק וכל חשבון פריבילגי, מיקרו-סגמנטציה שמונעת תנועה לרוחב, וניטור מרוכז (SIEM/XDR) שמקצר את הזמן מחדירה לגילוי משבועות לשעות.',
  ai:
    'הקשר הטכני: סוכן אג׳נטי אמיתי = מודל שפה (Claude / GPT / Gemini) + שכבת תזמור שמפרקת משימה לצעדים + כלים דרך פרוטוקולים כמו MCP + RAG על בסיס הידע הפנימי + שכבת Guardian שמאשרת פעולות רגישות. הנקודה הקריטית היא צמצום היקף: תהליך אחד, מדד הצלחה מספרי אחד, והרחבה בהדרגה.',
  cloud:
    'הקשר הטכני: ההחלטות שמשנות הן ניהול זהויות והרשאות (IAM), הפרדת סביבות (dev / stage / prod), תשתית-כקוד (Terraform) שהופכת סביבה לנכס בר-שחזור, ו-FinOps מהיום הראשון — תיוג, תקרות תקציב והתראות. Lock-In מתכננים מראש, לא מגלים בדיעבד.',
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

/** Keeps the item's own summary as a real paragraph — up to `maxChars`, cut on a sentence boundary. */
function contextParagraph(text: string, maxChars: number): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= maxChars) return clean;
  const slice = clean.slice(0, maxChars);
  const lastStop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '), slice.lastIndexOf('… '));
  return `${(lastStop > maxChars * 0.5 ? slice.slice(0, lastStop + 1) : slice).trimEnd()}…`;
}

export interface ComposedPost {
  /** The full text block — hook → sections → hashtags → footer — ready to paste. */
  fullText: string;
  hashtags: string[];
  /** Just the footer, so the UI can show it as a locked/highlighted block. */
  footer: string;
}

export function composeNewsPost(item: NewsItem, platform: SocialPlatform): ComposedPost {
  const topic = item.topic;
  const seed = seededInt(item.title);
  const isLinkedin = platform === 'linkedin';

  const hook = seededPick(HOOKS[topic], seed).replace('{title}', item.title.trim());
  const context = contextParagraph(item.summary || item.excerpt, isLinkedin ? 900 : 520);
  const whyItMatters = WHY_IT_MATTERS[topic];
  const techContext = TECH_CONTEXT[topic];
  const bullets = seededSubset(TAKEAWAYS[topic], isLinkedin ? 5 : 4, seed).map((b) => `▪️ ${b}`);
  const insight = EXPERT_INSIGHT[topic];

  const dateLabel = formatDate(item.publishedAt);
  const sourceLine = isLinkedin
    ? [`📰 מקור: ${[item.source, dateLabel].filter(Boolean).join(' · ')}`, item.link ? `🔗 לכתבה המלאה: ${item.link}` : '']
        .filter(Boolean)
        .join('\n')
    : `📰 ${[item.source, dateLabel].filter(Boolean).join(' · ')}`;

  const engagement = isLinkedin ? 'מה דעתכם? האם הארגון שלכם ערוך לזה? 👇' : 'שתפו בתגובות מה הכי מפתיע אתכם כאן 👇';

  const topicTags = isLinkedin ? TOPIC_HASHTAGS[topic].slice(0, 6) : TOPIC_HASHTAGS[topic];
  const globalTags = isLinkedin ? GLOBAL_HASHTAGS.slice(0, 3) : GLOBAL_HASHTAGS;
  const hashtags = [...topicTags, ...globalTags];

  const sections: string[] = [
    hook,
    context ? `📌 העובדות מהכתבה\n${context}` : '',
    `🔍 הניתוח\n${whyItMatters}`,
    isLinkedin ? `🧩 הקשר טכני\n${techContext}` : '',
    `📋 מה לקחת מזה\n${bullets.join('\n')}`,
    `🎯 מהניסיון בשטח\n${insight}`,
    sourceLine,
    engagement,
    hashtags.join(' '),
    SITE_PROMO_FOOTER,
  ].filter(Boolean);

  return { fullText: sections.join('\n\n'), hashtags, footer: SITE_PROMO_FOOTER };
}
