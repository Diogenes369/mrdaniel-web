/**
 * The tight Title / Subtitle / Body carousel — the format in the operator's reference deck.
 *
 * This is NOT a replacement for synthesizeCarouselDeck in SocialAgentEngine.ts. That one builds a
 * 10–14 slide editorial deck with seven layout variants and bodies up to 480 characters, and the
 * dashboard's `carousel-studio` action depends on its shape. This is a second, much stricter
 * format, because the reference template has no room for that: every content slide is an index
 * numeral, one short Title, one Subtitle pill and two or three body lines, and the design breaks
 * visibly if any of them runs long.
 *
 * Measured off the six reference slides (2026-09-20), which is where every number in SLOT_LIMITS
 * comes from rather than from taste:
 *
 *   slide │ title │ subtitle │ body lines │ line lengths │ body total
 *   ──────┼───────┼──────────┼────────────┼──────────────┼───────────
 *   02    │   8   │    19    │     3      │ 26 / 25 / 41 │    94
 *   03    │   6   │    11    │     3      │ 32 / 25 / 26 │    85
 *   04    │   6   │    15    │     3      │ 23 / 28 / 30 │    83
 *   05    │   6   │    12    │     2      │ 39 / 39      │    79
 *   06    │  11   │    16    │     3      │ 22 / 33 / 22 │    79
 *
 * The caps sit just above the observed maxima, because the references are one creator's deck and
 * not the actual overflow point of the Figma frame. If a real render clips, lower the cap here —
 * it is the single source of truth for both the prompt and the enforcement pass.
 *
 * Two halves, deliberately, for the same reason expertVoice.ts has two: the prompt states the
 * limits so the model aims at them, and `enforceDeck` applies them so a miss cannot reach Figma.
 * Models cannot count characters in Hebrew reliably; asking nicely is necessary and not sufficient.
 */
import { AUDIENCE_RULES, EXPERT_VOICE_RULES, scrubAiPhrases } from './expertVoice.js';
import { sanitizeHebrewText } from './hebrewTextSanitizer.js';

/** Hard caps, derived from the reference deck. Both the prompt and the enforcement pass read these. */
export const SLOT_LIMITS = {
  /** The named thing: a product, company, model, attack or vulnerability. Usually Latin script. */
  titleMax: 16,
  /** The category pill under the title — what the thing IS, in two or three words. */
  subtitleMax: 22,
  /** One body line. The design wraps at roughly this width in Hebrew. */
  bodyLineMax: 42,
  /** All body lines joined. Two short lines beat three that each run to the cap. */
  bodyTotalMax: 100,
  bodyMinLines: 2,
  bodyMaxLines: 3,
  /** Cover slide: no subtitle pill, and the title carries the whole hook. */
  coverTitleMax: 24,
  coverBodyMaxLines: 4,
} as const;

export type StoryCarouselRole = 'cover' | 'item' | 'cta';

export interface StoryCarouselSlide {
  /** 1-based position. Rendered as the large outlined numeral on item slides. */
  index: number;
  role: StoryCarouselRole;
  /** The named thing. Empty only if the model failed to find one. */
  title: string;
  /** The category pill. Always empty on cover and cta slides — they have no pill in the design. */
  subtitle: string;
  /** 2–3 discrete lines. The line breaks are deliberate, not reflowed by the renderer. */
  bodyLines: string[];
}

export interface StoryCarouselDeck {
  slides: StoryCarouselSlide[];
  /** Slots enforceDeck had to cut, so the operator sees it here rather than in the render. */
  warnings: string[];
}

/**
 * Bidi control characters: invisible, zero-width, and inserted by sanitizeHebrewText.
 *
 * That sanitizer wraps every embedded Latin run in RLM (U+200F) so "Claude" renders on the correct
 * side of a Hebrew sentence. The marks draw nothing, but `String.length` counts them, so a title
 * like "Claude פרץ ל-OpenAI" measures 23 while occupying 19 characters of the slot. Measuring the
 * raw length therefore under-fills every slot and, worse, truncates text that actually fits — the
 * first live run cut a 17-character title to 12 for exactly this reason.
 *
 * So every cap decision here is made on VISIBLE length, while the marks stay in the emitted string
 * because Figma needs them to lay the text out correctly.
 */
const BIDI_MARKS = /[‎‏؜⁦-⁩‪-‮]/g;

/** Length as the design sees it: bidi controls excluded. */
export function visibleLength(text: string): number {
  return (text || '').replace(BIDI_MARKS, '').length;
}

/** Drop a bidi mark left dangling at either edge by a cut, so a slot never opens a run it never closes. */
function trimOrphanMarks(text: string): string {
  return text.replace(/^[‎‏؜⁦-⁩‪-‮]+|[‎‏؜⁦-⁩‪-‮]+$/g, '');
}

/** Single-character test. Separate from BIDI_MARKS because that one is /g and therefore stateful —
 *  calling .test() on it in a loop advances lastIndex and silently skips characters. */
const IS_BIDI_MARK = /[‎‏؜⁦-⁩‪-‮]/;

/**
 * Trim to a hard character cap on a word boundary.
 *
 * Unlike trimToCleanSentenceEnd in SocialAgentEngine (which protects whole sentences and will
 * happily return more than asked), this one is a real cap: the slot is a fixed pixel width, and
 * text past it is not shown smaller, it is shown clipped. Cuts at the last space inside the cap,
 * drops a dangling comma or hyphen, and never appends an ellipsis — a visible "…" reads as an
 * error in this design, where every reference line ends on a full stop or a clean word.
 */
export function capAtWord(text: string, max: number): string {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (visibleLength(t) <= max) return t;
  // Walk to the raw index at which `max` VISIBLE characters have been consumed, so the window below
  // reflects what the slot can actually show rather than what .length reports.
  let visible = 0;
  let rawEnd = t.length;
  for (let i = 0; i < t.length; i++) {
    if (!IS_BIDI_MARK.test(t[i])) visible++;
    if (visible > max) {
      rawEnd = i;
      break;
    }
  }
  const window = t.slice(0, rawEnd);
  const lastSpace = window.lastIndexOf(' ');
  // Any word boundary beats a mid-word cut. An earlier version required the space to sit past
  // max/2 to avoid returning something very short, but that guard fired on exactly the input it
  // was meant to protect — "אבגד הוזח טיכל" capped at 8 has its only space AT the midpoint, so the
  // function fell through and returned "אבגד הוז", splitting a word. In Hebrew that reads as a
  // typo, not as a trim. A short line is a design problem; a broken word is a correctness one.
  // The hard slice is now reached only when the text has no space at all inside the window — a
  // single long token such as a URL or a product name, where there is nothing better to do.
  const cut = lastSpace > 0 ? window.slice(0, lastSpace) : window;
  return trimOrphanMarks(cut.replace(/[\s,\-–—:;]+$/, '').trim());
}

/** Applies one slot's cap and records a warning when it actually had to cut. */
function enforceSlot(value: unknown, max: number, label: string, warnings: string[]): string {
  const clean = scrubAiPhrases(sanitizeHebrewText(String(value ?? '').trim()));
  const capped = capAtWord(clean, max);
  if (visibleLength(capped) < visibleLength(clean)) warnings.push(`${label}: cut ${visibleLength(clean)}→${visibleLength(capped)} chars`);
  return capped;
}

/**
 * Normalise the body into lines that each fit, without reflowing the model's intent away.
 *
 * The model is asked for discrete lines and usually returns them. When a line overruns it is
 * re-wrapped on word boundaries rather than cut, because a body line in this design is a clause,
 * not a sentence — splitting one across two lines preserves the meaning, clipping it does not.
 * Only once the deck is over its total or its line count does anything get dropped, and then a
 * whole trailing line goes rather than the tail of the last one.
 */
export function normalizeBodyLines(raw: unknown, warnings: string[], maxLines: number): string[] {
  const incoming = (Array.isArray(raw) ? raw : String(raw ?? '').split(/\r?\n/))
    .map((l) => scrubAiPhrases(sanitizeHebrewText(String(l ?? '').trim())))
    .filter((l) => l.length > 1);

  const wrapped: string[] = [];
  for (const line of incoming) {
    let rest = line;
    while (visibleLength(rest) > SLOT_LIMITS.bodyLineMax && wrapped.length < maxLines) {
      const head = capAtWord(rest, SLOT_LIMITS.bodyLineMax);
      if (!head) break;
      wrapped.push(head);
      rest = rest.slice(head.length).trim();
    }
    if (rest && wrapped.length < maxLines) wrapped.push(capAtWord(rest, SLOT_LIMITS.bodyLineMax));
    if (wrapped.length >= maxLines) break;
  }

  let lines = wrapped.filter(Boolean).slice(0, maxLines);
  if (lines.length > incoming.length) {
    warnings.push(`body: re-wrapped ${incoming.length}→${lines.length} lines to fit ${SLOT_LIMITS.bodyLineMax} chars`);
  }

  while (lines.length > SLOT_LIMITS.bodyMinLines && visibleLength(lines.join(' ')) > SLOT_LIMITS.bodyTotalMax) {
    warnings.push(`body: dropped a line to meet the ${SLOT_LIMITS.bodyTotalMax}-char total`);
    lines = lines.slice(0, -1);
  }
  return lines;
}

/**
 * The prompt. Structure and limits are stated as numbers, and the anti-generic rule is stated as a
 * test the model can apply to its own draft ("could this line sit on a different article?") — the
 * phrasing that already works for the hook rules in SocialAgentEngine.
 */
export const STORY_CAROUSEL_SYSTEM_INSTRUCTION = `אתה כותב קרוסלת אינסטגרם בעברית עבור דניאל בן ברוך, לפי תבנית עיצוב קבועה ונוקשה.

${EXPERT_VOICE_RULES}

${AUDIENCE_RULES}

מבנה קבוע — כל שקופית תוכן בנויה משלושה חלקים בדיוק, ואסור לחרוג מהם:
1. title — הדבר הקונקרטי שהשקופית עוסקת בו: שם מוצר, חברה, מודל, מתקפה, חולשה או טכניקה. עד ${SLOT_LIMITS.titleMax} תווים. לרוב באנגלית, כי זה שם. לא משפט, לא תיאור, לא כותרת שיווקית — שם.
2. subtitle — מה זה, בשתיים-שלוש מילים. עד ${SLOT_LIMITS.subtitleMax} תווים. זו תווית קטגוריה שיושבת בתגית מתחת לכותרת ("חטיפת סוכני AI", "מודל שפה חדש", "חולשה קריטית"). בעברית, בלי פועל ובלי משפט שלם.
3. bodyLines — ${SLOT_LIMITS.bodyMinLines} עד ${SLOT_LIMITS.bodyMaxLines} שורות נפרדות. כל שורה עד ${SLOT_LIMITS.bodyLineMax} תווים, וסך כל השורות עד ${SLOT_LIMITS.bodyTotalMax} תווים. כל שורה היא פסוקית שלמה שעומדת בפני עצמה — לא חצי משפט שנמשך לשורה הבאה.

חוק הספציפיות — החוק החשוב ביותר כאן:
- כל שורת body חייבת לשאת פרט קונקרטי מהכתבה: מספר, שם, גרסה, סכום, שיטה או ממצא. שורה בלי פרט כזה נמחקת.
- מבחן ההחלפה: אם אפשר להעתיק את השורה לשקופית על כתבה אחרת והיא עדיין מסתדרת — היא גנרית. כתוב אותה מחדש עם פרט מהכתבה הזו.
- אסור לחלוטין: "זה משנה את התמונה", "שווה לעקוב", "העתיד כבר כאן", "הטכנולוגיה מתקדמת", "צריך להיזהר", או כל משפט שנכון תמיד.
- הפרט המרתק עדיף על הפרט החשוב: מה שגורם למישהו לעצור ולקרוא הוא בדרך כלל המספר המפתיע, השיטה החכמה או הדבר שלא ציפית לו — לא הסיכום הכללי.

מבנה הקרוסלה:
- שקופית 1 (role:"cover") — title בלבד, עד ${SLOT_LIMITS.coverTitleMax} תווים: ההוק, בנוי מהעובדה החזקה ביותר בכתבה. אחריו bodyLines של עד ${SLOT_LIMITS.coverBodyMaxLines} שורות שאומרות על מה הקרוסלה. subtitle="" — לשער אין תגית בעיצוב.
- שקופיות 2..N (role:"item") — הפירוק עצמו, שקופית לכל היבט. כל אחת עם title, subtitle ו-bodyLines מלאים.
- שקופית אחרונה (role:"cta") — title קצר, subtitle="", bodyLines: שורה או שתיים שמזמינות לשמור את הקרוסלה או לעקוב. בלי קישור ובלי URL.

חוקי אמת:
- כל עובדה, מספר, שם וגרסה חייבים להופיע בטקסט המקור שסופק. אסור להשלים מידע מהידע הכללי שלך.
- מספר נשאר עם היחידה שלו: "20,000 דולר" הוא סכום כסף, לא מספר משתמשים ולא מספר חולשות.
- אסור להזכיר את שם הכותב המקורי, שם המגזין, כינויי משתמש (@) או קרדיט חיצוני.
- אסור Markdown: בלי כוכביות, בלי מקפים מובילים, בלי סולמיות.

פלט: JSON בלבד, בלי code fence:
{"slides":[{"role":"cover|item|cta","title":"...","subtitle":"...","bodyLines":["...","..."]}]}`;

/**
 * Canonical Figma TEXT layer names, and the deck field each is filled from.
 *
 * figma_inject_text matches on layer NAME, not node id — that is what lets one template frame be
 * duplicated per slide. It also means Figma's autoRename is a live hazard: editing a TEXT layer's
 * content makes Figma rename the layer after its text unless the layer was renamed by hand, which
 * silently breaks every mapping here. The template's layers must carry exactly these names, and
 * must keep them. See the figma-mcp-bridge note.
 */
export const FIGMA_LAYER_MAP = {
  title: 'slide-title',
  subtitle: 'slide-subtitle',
  /** Three separate TEXT layers, because the design's line breaks are deliberate. */
  bodyLine1: 'slide-body-1',
  bodyLine2: 'slide-body-2',
  bodyLine3: 'slide-body-3',
  /** The large outlined numeral. Zero-padded to two digits, as in the reference. */
  index: 'slide-index',
} as const;

/** One slide as figma_inject_text / figma_render_slides wants it: a flat list of name→text. */
export function toFigmaEntries(slide: StoryCarouselSlide): Array<{ name: string; text: string }> {
  const [l1 = '', l2 = '', l3 = ''] = slide.bodyLines;
  return [
    { name: FIGMA_LAYER_MAP.index, text: String(slide.index).padStart(2, '0') },
    { name: FIGMA_LAYER_MAP.title, text: slide.title },
    { name: FIGMA_LAYER_MAP.subtitle, text: slide.subtitle },
    { name: FIGMA_LAYER_MAP.bodyLine1, text: l1 },
    { name: FIGMA_LAYER_MAP.bodyLine2, text: l2 },
    { name: FIGMA_LAYER_MAP.bodyLine3, text: l3 },
  ];
}

/** Whole deck in figma_render_slides' `slides` shape. */
export function toFigmaSlides(deck: StoryCarouselDeck): Array<{ name: string; entries: Array<{ name: string; text: string }> }> {
  return deck.slides.map((s) => ({ name: `${String(s.index).padStart(2, '0')}-${s.role}`, entries: toFigmaEntries(s) }));
}

/**
 * Apply every limit to a raw model answer. Exported so the same enforcement runs in tests and in
 * the endpoint — a slot checked in only one of the two is a slot that reaches Figma wrong.
 */
export function enforceDeck(raw: unknown): StoryCarouselDeck {
  const warnings: string[] = [];
  const rows = Array.isArray(raw) ? raw : ((raw as { slides?: unknown[] })?.slides ?? []);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('model did not return a slide array');

  const slides = rows.map((r, i): StoryCarouselSlide => {
    const rec = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    const roleRaw = String(rec.role ?? '').toLowerCase();
    const role: StoryCarouselRole = i === 0 ? 'cover' : /cta|סיום|קריא/.test(roleRaw) ? 'cta' : 'item';
    const isCover = role === 'cover';
    return {
      index: i + 1,
      role,
      title: enforceSlot(rec.title, isCover ? SLOT_LIMITS.coverTitleMax : SLOT_LIMITS.titleMax, `slide ${i + 1} title`, warnings),
      // Cover and CTA have no pill in the design, so anything the model put there is dropped rather
      // than injected into a layer those frames do not have.
      subtitle: role === 'item' ? enforceSlot(rec.subtitle, SLOT_LIMITS.subtitleMax, `slide ${i + 1} subtitle`, warnings) : '',
      bodyLines: normalizeBodyLines(rec.bodyLines ?? rec.body, warnings, isCover ? SLOT_LIMITS.coverBodyMaxLines : SLOT_LIMITS.bodyMaxLines),
    };
  });

  return { slides, warnings };
}
