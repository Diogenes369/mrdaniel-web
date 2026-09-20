/**
 * Short-form caption rules, and the checker that enforces them after the fact.
 *
 * The division of labour the whole content engine now assumes: the carousel carries the teaching
 * (30–60 word slides, rendered in Figma), and the caption's only job is to make someone stop and
 * swipe. A caption that re-explains the carousel competes with it and gets the post skipped, so the
 * cap here is deliberately brutal — 3 sentences and one CTA.
 *
 * This is the local mirror of `src/agent/expertVoice.ts`'s SHORT_CAPTION_RULES, for the Ollama path
 * that never touches the site engine. The two must say the same thing; `npm run check:mirrors`
 * covers the dashboard type mirror, and this pair is small enough to read side by side.
 */

export const CAPTION_RULES = {
  maxSentences: 3,
  maxWords: 45,
  /** Past this, a "short" caption is a paragraph and Instagram truncates it behind "more" anyway. */
  maxChars: 280,
  ctaRequired: true,
};

/**
 * Hebrew CTA verbs, in the imperative forms captions actually use.
 *
 * Built with an explicit Hebrew-letter boundary rather than `\b`: JavaScript's `\b` is defined
 * against ASCII `\w`, so every Hebrew letter counts as a non-word character and `/\bשמרו\b/` never
 * matches a Hebrew word at all. The first version of this file shipped that bug and reported "no
 * CTA" on every valid caption.
 */
const HEB = '\\u0590-\\u05FF';
const cta = (body) => new RegExp(`(?<![${HEB}])(?:${body})(?![${HEB}])`);

const CTA_PATTERNS = [
  cta('שמרו|תשמרו'),
  cta('שתפו|תשתפו'),
  cta('כתבו|תכתבו'),
  cta('תגיבו|הגיבו'),
  cta('ספרו|תספרו'),
  cta('נסו|תנסו'),
  cta('בדקו|תבדקו'),
  cta('עקבו|תעקבו'),
  cta('הצטרפו'),
  cta('קישור ב(?:ביו|פרופיל)'),
  cta('לינק ב(?:ביו|פרופיל)'),
  cta('מה דעתכם'),
  cta('איפה אתם'),
  cta('ראיתם'),
  cta('תגידו'),
  cta('שאלו|תשאלו'),
];

/** The AI tells that survive the Gemini scrubber and that a local 8B model reaches for constantly.
 *  Hebrew entries first, then the English equivalents — `captionSystemPrompt` splits on that.
 *  Mirrors the banned list in src/agent/expertVoice.ts; add a phrase to both or it is only
 *  blocked on one of the two paths that write Hebrew (expert-voice.test.mjs checks this). */
export const BANNED_PHRASES = [
  'בעידן הדיגיטלי',
  'בעידן ה-AI',
  'בעולם של היום',
  'בעולם הדינמי',
  'בעולם המשתנה',
  'עידן חדש',
  'חשוב לציין',
  'חשוב לזכור',
  'בואו נצלול',
  'מהפכני',
  'פורץ דרך',
  'משנה את כללי המשחק',
  'לסיכום',
  'הנה כמה דרכים',
  'ללא ספק',
  'צוללים',
  'in today',
  'in the world of',
  'it is important to note',
  'game-changer',
  'revolutionary',
  'dive into',
  'unlock the power',
  'in conclusion',
];

/**
 * The instruction block handed to whichever model writes the caption.
 *
 * Written as hard numeric limits rather than adjectives: "short and punchy" produces 150 words from
 * every model tried, "3 sentences, 45 words, then stop" produces 3 sentences.
 */
/** The Hebrew half of BANNED_PHRASES, for the Hebrew prompt. Derived rather than sliced by index:
 *  the old `.slice(0, 11)` silently dropped the last three Hebrew phrases the moment a phrase was
 *  added to the middle of the list, which is exactly what happened on 2026-09-20. */
const HEBREW_BANNED = BANNED_PHRASES.filter((p) => /[֐-׿]/.test(p));

export function captionSystemPrompt({ platform = 'instagram', hasCarousel = true } = {}) {
  const name = platform === 'tiktok' ? 'TikTok' : platform === 'linkedin' ? 'LinkedIn' : 'Instagram';
  return `כללי כיתוב ל-${name} — כלל אדום:
- ${CAPTION_RULES.maxSentences} משפטים קצרים לכל היותר, ואז CTA אחד. סך הכל עד ${CAPTION_RULES.maxWords} מילים. זה תקרה, לא יעד.
- המשפט הראשון עוצר גלילה בכוחות עצמו: אמירה חדה, מספר, או טעות שכולם עושים. לא שאלה גנרית.
- כתוב כמו אדם: משפט שבור לאפקט מותר, דעה מותרת, "תכל'ס" מותר. בלי שפה שיווקית ובלי אימוג'ים לקישוט (לכל היותר אחד, ורק אם הוא באמת מוסיף).
${hasCarousel ? '- התוכן הכבד יושב בשקפים של הקרוסלה. הכיתוב לא מסביר אותם ולא מסכם אותם — הוא רק גורם למישהו להחליק ימינה.' : '- אין קרוסלה, ולכן המשפטים חייבים לעמוד לבד. עדיין עד המגבלה למעלה.'}
- CTA אחד בלבד בסוף, קונקרטי (שמרו / כתבו לי X / קישור בביו). לא שניים, ולא "עקבו + שמרו + שתפו".
- בלי קישורים ובלי כתובות URL בגוף הכיתוב.
- אסור: ${HEBREW_BANNED.join(', ')}.`;
}

/**
 * Check a caption against the rules. Returns findings rather than throwing: the caller decides
 * whether to regenerate, trim, or ship it — a 4th sentence is worth a retry, an em-dash is not.
 */
export function checkCaption(text, { platform = 'instagram' } = {}) {
  const caption = String(text ?? '').trim();
  const issues = [];

  if (!caption) return { ok: false, issues: ['caption is empty'], stats: { sentences: 0, words: 0, chars: 0 } };

  const sentences = splitSentences(caption);
  const words = caption.split(/\s+/).filter(Boolean).length;

  if (sentences.length > CAPTION_RULES.maxSentences) {
    issues.push(`${sentences.length} sentences; the cap is ${CAPTION_RULES.maxSentences}`);
  }
  if (words > CAPTION_RULES.maxWords) issues.push(`${words} words; the cap is ${CAPTION_RULES.maxWords}`);
  if (caption.length > CAPTION_RULES.maxChars) issues.push(`${caption.length} characters; the cap is ${CAPTION_RULES.maxChars}`);

  const hasCta = CTA_PATTERNS.some((re) => re.test(caption));
  if (CAPTION_RULES.ctaRequired && !hasCta) issues.push('no CTA found — end with one concrete ask');

  const banned = BANNED_PHRASES.filter((phrase) => caption.toLowerCase().includes(phrase.toLowerCase()));
  if (banned.length) issues.push(`banned phrases: ${banned.join(', ')}`);

  // Instagram strips links from captions entirely, so one in the text is dead pixels that also
  // reads as spam. The guide link belongs in the bio.
  if (/https?:\/\/|www\./i.test(caption)) issues.push('contains a URL — Instagram captions cannot carry links; put it in the bio');

  const emoji = (caption.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  if (emoji > 2) issues.push(`${emoji} emoji; keep it to at most 1`);

  const garbled = findGarbledTokens(caption);
  if (garbled.length) issues.push(`garbled tokens: ${garbled.join(', ')} — the model mangled the Hebrew; regenerate or switch model`);

  return { ok: issues.length === 0, platform, issues, stats: { sentences: sentences.length, words, chars: caption.length, hasCta, emoji, garbled } };
}

/**
 * Words a local model mangled rather than wrote.
 *
 * Added after qwen2.5 returned `הצ'*בוטים` and `החATT@BOTים` — both of which passed every length,
 * CTA and cliché rule, so the checker reported ok:true on text that cannot be published. Small
 * quantised models corrupt Hebrew tokens this way often enough that "it met the word count" is not
 * evidence the copy is usable.
 *
 * Two signals, both chosen to leave legitimate mixed-script writing alone. This codebase's real
 * posts say "Wi-Fi 7", "ה-AI" and "Full-Stack", so a Latin word standing on its own, or joined to
 * Hebrew by a hyphen, is fine. What is never fine is a script change *inside* a word, or a stray
 * symbol wedged between its letters.
 */
function findGarbledTokens(text) {
  const bad = new Set();
  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    // A Hebrew letter touching a Latin letter with nothing between them.
    if (/[\u0590-\u05FF][A-Za-z]|[A-Za-z][\u0590-\u05FF]/.test(token)) bad.add(token);
    // A script that has no business in a Hebrew caption at all. Observed in real qwen2.5 output,
    // which dropped a Hangul syllable into the middle of the word "צ'אטבוטים".
    else if (FOREIGN_SCRIPT.test(token)) bad.add(token);
    // Code punctuation. A caption never legitimately contains a brace, bracket or backslash, and a
    // model that emits "ש]={" has stopped writing prose.
    else if (/[[\]{}<>=\\|^~`]/.test(token)) bad.add(token);
    // A symbol wedged inside a word.
    else if (/[\p{L}][*@]+[\p{L}'"׳״]*|['"׳״][*@]+[\p{L}]/u.test(token)) bad.add(token);
  }
  return [...bad].slice(0, 5);
}

/** CJK, Hangul, Cyrillic, Arabic, Devanagari, Thai, Greek — none of which belong in this feed. */
const FOREIGN_SCRIPT = /[\u0400-\u04FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u0370-\u03FF\u1100-\u11FF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/;

/**
 * Sentence split for Hebrew and English.
 *
 * A line break is a sentence boundary here even without punctuation: captions are written as
 * stacked short lines, and treating the whole stack as one sentence would let a 6-line wall pass.
 */
function splitSentences(text) {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.replace(/[^\p{L}\p{N}]/gu, '').length > 0);
}
