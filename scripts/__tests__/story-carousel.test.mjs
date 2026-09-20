// The Figma slot limits: do they survive a model that ignores them?
//
// The prompt states every cap, but the whole point of enforceDeck is that a prompt cannot be
// trusted with character counts in Hebrew. So every case here feeds enforceDeck output that
// violates a limit on purpose and checks the text that would reach Figma, not the text the model
// produced. No key, no quota.
// Run: npx tsx scripts/__tests__/story-carousel.test.mjs
import {
  SLOT_LIMITS,
  capAtWord,
  enforceDeck,
  normalizeBodyLines,
  toFigmaEntries,
  toFigmaSlides,
  visibleLength,
  FIGMA_LAYER_MAP,
  CONTENT_KIND_RULES,
  storyCarouselInstruction,
  STORY_CAROUSEL_SYSTEM_INSTRUCTION,
} from '../../src/agent/storyCarousel.ts';

const results = [];
const t = (label, cond, detail = '') => results.push([cond ? 'PASS' : 'FAIL', label, cond ? '' : detail]);

// capAtWord: a real cap, on a word boundary, with no ellipsis.
t('capAtWord leaves short text alone', capAtWord('Grok Bot', 16) === 'Grok Bot');
const capped = capAtWord('מתקפת BragJack חוטפת סוכני AI בדפדפן דרך תוסף זדוני', 42);
t('capAtWord respects the cap', capped.length <= 42, `${capped.length}: ${capped}`);
t('capAtWord breaks on a space', !capped.endsWith(' ') && capAtWord('אבגד הוזח טיכל', 8) === 'אבגד', capAtWord('אבגד הוזח טיכל', 8));
t('capAtWord never adds an ellipsis', !capped.includes('…') && !capped.includes('...'), capped);
t('capAtWord drops a dangling comma', capAtWord('לקוחות, לידים, פרויקטים', 13) === 'לקוחות', capAtWord('לקוחות, לידים, פרויקטים', 13));

// A single over-long line is re-wrapped rather than clipped — the meaning survives.
const longLine = 'החוקר גל ויזמן הראה איך תוסף דפדפן זדוני מזריק הוראות ישירות למודל ומשתלט על הסוכן';
const wrapped = normalizeBodyLines([longLine], [], SLOT_LIMITS.bodyMaxLines);
t('over-long line is re-wrapped, not dropped', wrapped.length >= 2, JSON.stringify(wrapped));
t('every wrapped line fits', wrapped.every((l) => l.length <= SLOT_LIMITS.bodyLineMax), JSON.stringify(wrapped.map((l) => l.length)));
t('re-wrap keeps the opening words', wrapped[0].startsWith('החוקר גל ויזמן'), wrapped[0]);

// Bidi marks: sanitizeHebrewText wraps Latin runs in RLM (U+200F), which is invisible but counts
// toward String.length. Measuring raw length truncated text that fit — a live run cut a 17-char
// title to 12. Every cap decision must use visible length.
const RLM = '‏';
const withMarks = `${RLM}Claude${RLM} פרץ ל-${RLM}OpenAI${RLM}`;
t('visibleLength ignores bidi marks', visibleLength(withMarks) === 19, `${visibleLength(withMarks)} vs raw ${withMarks.length}`);
t('a title that visually fits is not cut', capAtWord(withMarks, 20) === withMarks, JSON.stringify(capAtWord(withMarks, 20)));
t('raw length would have cut it (guarding the regression)', withMarks.length > 20);
const cutMarked = capAtWord(`${RLM}Claude${RLM} פרץ לתוך מערכות ${RLM}OpenAI${RLM} בלי הרשאות`, 20);
t('a genuinely over-long marked string is still capped', visibleLength(cutMarked) <= 20, `${visibleLength(cutMarked)}: ${cutMarked}`);
t('no orphan bidi mark is left at the edges', !/^[‎‏]|[‎‏]$/.test(cutMarked), JSON.stringify(cutMarked));

// A model that returns five lines must not produce five layers — the template has three.
const tooMany = normalizeBodyLines(['אחת שתיים שלוש.', 'ארבע חמש שש.', 'שבע שמונה תשע.', 'עשר.', 'אחת עשרה.'], [], SLOT_LIMITS.bodyMaxLines);
t('line count is capped at the template max', tooMany.length <= SLOT_LIMITS.bodyMaxLines, String(tooMany.length));

// Full deck, every slot violated on purpose.
const deck = enforceDeck({
  slides: [
    { role: 'cover', title: 'כותרת שער ארוכה בהרבה ממה שהעיצוב מסוגל להציג בשורה אחת', subtitle: 'תגית שלא אמורה להופיע בשער', bodyLines: ['שורת פתיחה.', 'שורה שנייה.'] },
    {
      role: 'item',
      title: 'BragJack Browser Extension Attack Chain',
      subtitle: 'קטגוריה ארוכה מדי שלא תיכנס לתגית הקטנה בעיצוב',
      bodyLines: ['תוסף דפדפן זדוני מזריק הוראות ישירות למודל ומשתלט על הסוכן בלי הרשאות מערכת.', 'שני מזהי CVE.', 'מעל 20,000 דולר בפרסים.'],
    },
    { role: 'cta', title: 'שמרו', subtitle: 'לא אמור להופיע', bodyLines: ['שמרו את הקרוסלה.'] },
  ],
});

const [cover, item, cta] = deck.slides;
t('indexes are 1-based and sequential', deck.slides.map((s) => s.index).join(',') === '1,2,3');
t('first slide is the cover', cover.role === 'cover' && item.role === 'item' && cta.role === 'cta');
t('cover title respects the cover cap', cover.title.length <= SLOT_LIMITS.coverTitleMax, `${cover.title.length}: ${cover.title}`);
t('cover has no subtitle pill', cover.subtitle === '', cover.subtitle);
t('cta has no subtitle pill', cta.subtitle === '', cta.subtitle);
t('item title respects the item cap', item.title.length <= SLOT_LIMITS.titleMax, `${item.title.length}: ${item.title}`);
t('item subtitle respects its cap', item.subtitle.length <= SLOT_LIMITS.subtitleMax, `${item.subtitle.length}: ${item.subtitle}`);
t('item body lines all fit', item.bodyLines.every((l) => l.length <= SLOT_LIMITS.bodyLineMax), JSON.stringify(item.bodyLines.map((l) => l.length)));
t('item body total fits', item.bodyLines.join(' ').length <= SLOT_LIMITS.bodyTotalMax, String(item.bodyLines.join(' ').length));
t('item keeps at least the minimum lines', item.bodyLines.length >= SLOT_LIMITS.bodyMinLines, String(item.bodyLines.length));
t('cuts are reported, not silent', deck.warnings.length > 0, JSON.stringify(deck.warnings));

// The Figma hand-off: every slot maps to a named layer, and the numeral is zero-padded.
const entries = toFigmaEntries(item);
const names = entries.map((e) => e.name);
t('every layer in the map is emitted', Object.values(FIGMA_LAYER_MAP).every((n) => names.includes(n)), names.join(', '));
t('index is zero-padded to two digits', entries.find((e) => e.name === FIGMA_LAYER_MAP.index)?.text === '02');
t('three body layers are always emitted', names.filter((n) => n.startsWith('slide-body-')).length === 3);
t('an unused body layer is cleared, not left stale', entries.filter((e) => e.name.startsWith('slide-body-')).every((e) => typeof e.text === 'string'));
t('deck maps to render-slides shape', toFigmaSlides(deck).length === 3 && toFigmaSlides(deck)[0].name === '01-cover', JSON.stringify(toFigmaSlides(deck)[0].name));

// The scrubber runs inside enforceDeck, so a banned phrase cannot reach a slide.
const scrubbed = enforceDeck({ slides: [{ role: 'cover', title: 'בדיקה', bodyLines: ['זהו עידן חדש לגמרי.'] }] });
t('banned phrases are scrubbed on the way in', !scrubbed.slides[0].bodyLines.join(' ').includes('עידן חדש'), JSON.stringify(scrubbed.slides[0].bodyLines));

// An empty answer must fail loudly rather than render blank frames.
let threw = false;
try { enforceDeck({ slides: [] }); } catch { threw = true; }
t('an empty deck throws', threw);

// -- Content kinds ------------------------------------------------------------------------------
// The limits and the voice are identical across kinds; only the decomposition differs. Getting that
// wrong produces a technically correct deck that misses the point -- a thread re-sorted out of its
// argument order, or a comparison that describes each side and never contrasts them.
const KINDS = ['news', 'thread', 'comparison'];
t('every kind has rules', KINDS.every((k) => CONTENT_KIND_RULES[k]?.length > 80), JSON.stringify(Object.keys(CONTENT_KIND_RULES)));
t('default instruction is the news one', storyCarouselInstruction() === storyCarouselInstruction('news'));
for (const k of KINDS) {
  const ins = storyCarouselInstruction(k);
  t(`${k}: base rules are still present`, ins.includes(STORY_CAROUSEL_SYSTEM_INSTRUCTION), `len ${ins.length}`);
  t(`${k}: its own rules are appended`, ins.includes(CONTENT_KIND_RULES[k]));
  t(`${k}: slot limits survive`, ins.includes(String(SLOT_LIMITS.bodyLineMax)) && ins.includes(String(SLOT_LIMITS.titleMax)));
  t(`${k}: specificity rule survives`, ins.includes('מבחן ההחלפה'));
}
t('kind rules are distinct', new Set(KINDS.map((k) => CONTENT_KIND_RULES[k])).size === 3);
t('thread rules pin the original order', CONTENT_KIND_RULES.thread.includes('סדר הפוסטים המקורי'));
t('thread rules ban quoting the author', CONTENT_KIND_RULES.thread.includes('@'));
t('comparison rules require an axis per slide', CONTENT_KIND_RULES.comparison.includes('ציר השוואה אחד'));
t('comparison rules reject one-sided lines', CONTENT_KIND_RULES.comparison.includes('רק צד אחד'));

for (const [state, label, detail] of results) console.log(`${state} ${label}${detail ? ` — ${detail}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
