// Text quality gate (src/server/newsQuality.ts) + JSON-LD paragraph repair (articleExtract.ts).
// The regression: a headline-only feed item (Stocktwits "טסלה דוחפת לכאורה…", 2026-09-27) opened
// a modal whose summary and body were the same one sentence.
// Run: npx tsx scripts/__tests__/news-quality.test.mjs
import { insightQualityIssues, isNearDuplicate, isSameText, insightKey } from '../../src/server/newsQuality.ts';
import { unglueParagraphs } from '../../src/server/articleExtract.ts';

let pass = 0;
let fail = 0;
const t = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};

const title = 'טסלה דוחפת לכאורה את עובדיה להשתמש ב-Grok 4.5 עם כניסת מגבלת הוצאות הבינה המלאכותית לתוקף';
const good = {
  fullText: true,
  executiveSummary: [
    'אילון מאסק הורה לעובדי טסלה לעבור לשימוש ב-Grok 4.5 בכל מקום שאפשר.',
    'ההנחיה נכנסת לתוקף יחד עם תקרת הוצאות חדשה על כלי בינה מלאכותית בחברה.',
    'המהלך מחזק את הקשר העסקי בין טסלה לבין xAI, שתיהן בשליטת מאסק.',
  ],
  extendedArticle: [
    'לפי הדיווח, ההנחיה הועברה לעובדים במקביל להשקת Grok 4.5 ביום רביעי. מאסק נימק אותה ביכולות המודל ובעלות הנמוכה יותר שלו לעומת כלים חיצוניים.',
    'זו דוגמה נוספת לגישה של מאסק לחבר בין החברות שלו: טסלה ו-xAI כבר מחזיקות בפרויקטים משותפים ובהשקעות הדדיות, והמהלך מעמיק את התלות ביניהן.',
  ],
};
const issues = (x) => insightQualityIssues(x, title);

// ── the reported bug, in its exact shape ──────────────────────────────────────────────────────
const headlineOnly = { fullText: false, executiveSummary: [`${title}.`, title], extendedArticle: [title] };
t('bug · headline repeated as summary + body is rejected', issues(headlineOnly).length > 0, issues(headlineOnly).join(','));
t('bug · flags the repeated bullets', issues(headlineOnly).includes('duplicate-bullets'));
t('bug · flags body repeating the summary', issues(headlineOnly).includes('body-repeats-summary'));
t('bug · flags the headline standing in for content', issues(headlineOnly).includes('bullet-repeats-title'));

// ── each rule on its own ──────────────────────────────────────────────────────────────────────
t('pass · a real analysis passes', issues(good).length === 0, issues(good).join(','));
t('rule · not written from the full article', issues({ ...good, fullText: false }).includes('no-full-text'));
t('rule · fewer than 3 real bullets', issues({ ...good, executiveSummary: good.executiveSummary.slice(0, 2) }).includes('few-bullets'));
t('rule · fragments do not count as bullets', issues({ ...good, executiveSummary: [...good.executiveSummary.slice(0, 2), 'עדכון.'] }).includes('few-bullets'));
t('rule · body under 200 chars', issues({ ...good, extendedArticle: ['קצר מדי.'] }).includes('short-body'));
t('rule · duplicate paragraphs', issues({ ...good, extendedArticle: [good.extendedArticle[0], good.extendedArticle[0]] }).includes('duplicate-paragraphs'));
t('rule · missing analysis', issues(undefined).includes('no-analysis'));
t('rule · leading "- " is ignored like the modal does', issues({ ...good, executiveSummary: good.executiveSummary.map((b) => `- ${b}`) }).length === 0);

// ── similarity helpers ────────────────────────────────────────────────────────────────────────
t('dup · punctuation/case/bidi differences are the same text', isNearDuplicate('Grok 4.5 is out.', '‏grok 4.5 is out'));
t('dup · a bullet inside a much longer paragraph is NOT a duplicate', !isNearDuplicate(good.executiveSummary[0], `${good.executiveSummary[0]} ${good.extendedArticle[0]} ${good.extendedArticle[1]}`));
t('title · a paraphrasing lead bullet is allowed', !isSameText('כ-100 חברות ישראליות מפתחות טכנולוגיות AI לאקלים', 'דוח: כ-100 חברות בישראל מפתחות פתרונות אקלים מבוססי בינה מלאכותית'));
t('title · the headline verbatim is caught', isSameText(`${title}.`, title));
t('key · stable 16-hex per link', /^[0-9a-f]{16}$/.test(insightKey('https://x.test/a')) && insightKey('https://x.test/a') === insightKey('https://x.test/a'));

// ── JSON-LD paragraph repair ──────────────────────────────────────────────────────────────────
t('unglue · restores a lost paragraph break', unglueParagraphs('on Wednesday.The fresh directive') === 'on Wednesday.\n\nThe fresh directive');
t('unglue · Hebrew boundary', unglueParagraphs('עלה ב-5%.החברה הודיעה') === 'עלה ב-5%.\n\nהחברה הודיעה');
t('unglue · keeps abbreviations', unglueParagraphs('the U.S. market') === 'the U.S. market');
t('unglue · keeps version numbers', unglueParagraphs('Grok 4.5 and GPT-6') === 'Grok 4.5 and GPT-6');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
