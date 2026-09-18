// Asserts what checkCaption actually decides, not merely that it returns without throwing.
// The Hebrew CTA detection is the part worth testing: JS `\b` is ASCII-only, so the obvious
// implementation silently reports "no CTA" for every Hebrew caption ever written.
// Run: npm run test:copy
import { checkCaption, captionSystemPrompt, CAPTION_RULES } from './copy-rules.js';

const results = [];
const t = (label, cond, detail = '') => results.push([cond ? 'PASS' : 'FAIL', label, cond ? '' : detail]);

// ─── CTA detection ──────────────────────────────────────────────────────────────────────────

const withCta = [
  'רוב הדליפות מתחילות בהרשאה שאף אחד לא ביטל. שמרו את זה לפעם הבאה שעובד עוזב.',
  'זה לוקח שתי דקות. תשמרו לפני שתשכחו.',
  'הכי הרבה כסף נשרף על שרתים שאף אחד לא כיבה. כתבו לי כמה אתם משלמים.',
  'המדריך המלא מחכה. קישור בביו.',
  'רוב האנשים טועים פה. מה דעתכם?',
  'בדקו את הלוגים לפני שאתם מאשימים את הרשת.',
];
for (const caption of withCta) {
  const r = checkCaption(caption);
  t(`CTA found: "${caption.slice(0, 32)}…"`, r.stats.hasCta === true, JSON.stringify(r.issues));
}

const withoutCta = ['אבטחת מידע היא נושא מורכב מאוד. יש הרבה מה ללמוד עליו.', 'הרבה חברות עדיין מריצות שרתים ישנים.'];
for (const caption of withoutCta) {
  const r = checkCaption(caption);
  t(`no CTA flagged: "${caption.slice(0, 32)}…"`, r.stats.hasCta === false && r.issues.some((i) => /no CTA/.test(i)), JSON.stringify(r.issues));
}

// ─── limits ─────────────────────────────────────────────────────────────────────────────────

const good = 'רוב הדליפות לא מתחילות בהאקר. הן מתחילות בהרשאה שאף אחד לא ביטל. שמרו את זה לפעם הבאה שעובד עוזב.';
const goodResult = checkCaption(good);
t('a compliant caption passes clean', goodResult.ok === true, JSON.stringify(goodResult.issues));
t('sentence count is right', goodResult.stats.sentences === 3, String(goodResult.stats.sentences));

const fourSentences = 'משפט אחד. משפט שני. משפט שלישי. משפט רביעי. שמרו.';
t('4+ sentences flagged', checkCaption(fourSentences).issues.some((i) => /sentences; the cap is 3/.test(i)));

// Stacked short lines with no terminal punctuation still count as separate sentences.
t('line breaks count as sentence breaks', checkCaption('שורה אחת\nשורה שתיים\nשורה שלוש\nשורה ארבע\nשמרו').stats.sentences === 5, JSON.stringify(checkCaption('שורה אחת\nשורה שתיים\nשורה שלוש\nשורה ארבע\nשמרו').stats));

const long = `${Array.from({ length: 50 }, (_, i) => `מילה${i}`).join(' ')}. שמרו.`;
t('word cap flagged', checkCaption(long).issues.some((i) => /words; the cap is 45/.test(i)));

// ─── content bans ───────────────────────────────────────────────────────────────────────────

t('banned Hebrew cliché flagged', checkCaption('בעידן הדיגיטלי הכל משתנה. שמרו.').issues.some((i) => /בעידן הדיגיטלי/.test(i)));
t('banned English cliché flagged', checkCaption('This is a total game-changer. שמרו.').issues.some((i) => /game-changer/.test(i)));
t('URL flagged', checkCaption('המדריך כאן https://mrdaniel.co.il/g/x. שמרו.').issues.some((i) => /URL/.test(i)));
t('emoji spam flagged', checkCaption('זה טוב 🔥💪🚀✅. שמרו.').issues.some((i) => /emoji/.test(i)));
t('one emoji is fine', !checkCaption('זה עובד 🔥. שמרו את זה.').issues.some((i) => /emoji/.test(i)));
t('empty caption rejected', checkCaption('').ok === false);
t('whitespace-only caption rejected', checkCaption('   \n  ').ok === false);

// ─── garbled output ─────────────────────────────────────────────────────────────────────────
// Real qwen2.5 output. Both met every length/CTA rule, which is exactly why this check exists.

t('mid-word symbol flagged', checkCaption("רוב הצ'*בוטים נכשלים. שמרו.").stats.garbled.length > 0, JSON.stringify(checkCaption("רוב הצ'*בוטים נכשלים. שמרו.").stats.garbled));
t('script-mixing inside a word flagged', checkCaption('הרוב מהבוטים החATT@BOTים נכשלים. שמרו.').stats.garbled.length > 0);
t('garbled text fails overall', checkCaption("רוב הצ'*בוטים נכשלים. שמרו.").ok === false);
t('hangul inside a Hebrew word flagged', checkCaption("רוב הצ'אט봇ים נכשלים. שמרו.").stats.garbled.length > 0);
t('code punctuation flagged', checkCaption('כלים מתאימים משלמים עכשיו! ש]={ שמרו.').stats.garbled.length > 0);
t('cyrillic flagged', checkCaption('רוב הчатботים נכשלים. שמרו.').stats.garbled.length > 0);

// Mixed-script writing this repo actually publishes must survive untouched.
for (const clean of [
  'שדרגתם כבר ל-Wi-Fi 7 או לא. שמרו את זה.',
  'ה-AI לא יציל לכם את הפרודקשן. בדקו את הלוגים.',
  'פיתוח Full-Stack זה לא באז. כתבו לי מה תקוע.',
  'העלות האמיתית של AWS מתחילה בחשבונית השנייה. שמרו.',
]) {
  const r = checkCaption(clean);
  t(`clean mixed-script passes: "${clean.slice(0, 28)}…"`, r.stats.garbled.length === 0 && r.ok, JSON.stringify(r.issues));
}

// ─── prompt ─────────────────────────────────────────────────────────────────────────────────

const prompt = captionSystemPrompt({ platform: 'instagram', hasCarousel: true });
t('prompt states the sentence cap', prompt.includes(String(CAPTION_RULES.maxSentences)));
t('prompt states the word cap', prompt.includes(String(CAPTION_RULES.maxWords)));
t('prompt defers heavy content to the carousel', /קרוסלה/.test(prompt));
t('no-carousel prompt differs', captionSystemPrompt({ hasCarousel: false }).includes('אין קרוסלה'));

for (const [s, l, d] of results) console.log(`${s} ${l}${d ? ` — ${d}` : ''}`);
const failed = results.filter(([s]) => s === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
