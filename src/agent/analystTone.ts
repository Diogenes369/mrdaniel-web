/**
 * The analyst register for article-derived social posts — the deterministic half.
 *
 * Added 2026-09-23 against three concrete complaints about the news posts: they drifted into
 * meta-talk ("במעבדה שלי", "אילו פרמטרים הייתם מוסיפים?", a paragraph on how language models work
 * in general instead of on the article), they were emoji-heavy, and the hashtag line was the same
 * generic block (#AI #Tech #בינה_מלאכותית) on every post whatever the story was about.
 *
 * The prompt (`ANALYST_VOICE_RULES` in expertVoice.ts) moves the model most of the way. This module
 * is what makes it hold, for the same reason `scrubAiPhrases` exists: a rule the model is only
 * *told* is a rule it breaks one post in ten. It runs after the model is done, so no phrasing of the
 * prompt can route around it.
 *
 * MIRRORED in dashboard/src/lib/analystTone.ts. The dashboard assembles the final post (source line,
 * CTA, hashtags) and must apply the same filter to the deterministic fallback it builds when the AI
 * is unavailable; `scripts/__tests__/analyst-tone.test.mjs` runs both copies over the same inputs and
 * fails on any difference. Keep the two byte-identical below the header comment.
 */

/** The fixed closing line of every article-derived post. Hardcoded by explicit decision
 *  (2026-09-23) — the model never writes the CTA, so it can never drift. */
export const NEWS_CTA_LINE = '📡 להישאר צעד אחד קדימה: חדשות AI בזמן אמת וסוכנים אוטונומיים – mrdaniel.co.il';

/** Tags that fit every post equally and therefore describe none of them. Compared lowercase with
 *  `_` and `-` removed, so `#Artificial_Intelligence` and `#artificialintelligence` both match. */
const GENERIC_TAGS = new Set(
  [
    'ai', 'tech', 'technology', 'news', 'innovation', 'digital', 'future', 'startup', 'startups',
    'artificialintelligence', 'machinelearning', 'ml', 'genai', 'generativeai', 'automation',
    'techil', 'startupnation', 'israel', 'hitech', 'hightech', 'trending', 'viral', 'business',
    'בינהמלאכותית', 'בינה', 'טכנולוגיה', 'חדשנות', 'חדשות', 'הייטק', 'ישראל', 'דיגיטל', 'עסקים',
    'אוטומציה', 'טרנספורמציהדיגיטלית', 'טכנולוגיהישראלית', 'עתיד', 'סטארטאפ', 'סטארטאפים',
  ].map((t) => t.toLowerCase())
);

/** Capitalised Latin words that are sentence furniture or generic acronyms, not entities. */
const NON_ENTITY_WORDS = new Set([
  'AI', 'A', 'I', 'The', 'This', 'That', 'And', 'For', 'With', 'CEO', 'CTO', 'API', 'APIs', 'PDF',
  'URL', 'HTTP', 'HTTPS', 'ALT', 'Tech', 'News', 'OK', 'US', 'USA', 'UK', 'EU', 'Inc', 'Ltd', 'Co',
  'New', 'Pro', 'Plus', 'Max', 'Mini', 'Beta', 'Alpha', 'Update', 'Version', 'Mr', 'Daniel',
]);

function tagKey(tag: string): string {
  return tag.replace(/^#/, '').replace(/[_\-]/g, '').toLowerCase();
}

/** True when a tag names nothing specific to the article. */
export function isGenericHashtag(tag: string): boolean {
  return GENERIC_TAGS.has(tagKey(tag));
}

/** A tag platforms actually link: `#` + letters/digits/underscore, no punctuation, no bidi marks. */
function toHashtag(raw: string): string {
  const body = raw
    .replace(/[‎‏؜‪-‮⁦-⁩]/g, '')
    .replace(/^#+/, '')
    // Between Latin letters/digits a separator just goes ("GPT-5" → GPT5, "Smart Contracts" →
    // SmartContracts); anywhere else (Hebrew) it becomes the underscore platforms keep readable.
    .replace(/([A-Za-z0-9])[\s.\-–—/]+(?=[A-Za-z0-9])/g, '$1')
    .replace(/[\s.\-–—/]+/g, '_')
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return body ? `#${body}` : '';
}

/**
 * Named entities worth tagging — product, model, company and protocol names as the article wrote
 * them ("OpenAI", "GPT-5", "Claude", "MCP", "Nvidia"). Ranked by how often the text repeats them,
 * then by first appearance, because the entity a post keeps returning to is the one it is about.
 * Hebrew-only posts can still yield nothing, which is why the model's own tags come first.
 */
export function entityHashtags(text: string, limit = 5): string[] {
  const counts = new Map<string, { tag: string; n: number; first: number }>();
  // A run of plain Titlecase words is one entity ("Smart Contracts"); a mixed-case or all-caps word
  // ("OpenAI", "GPT-5", "MCP") always stands alone, so "OpenAI GPT-5" still yields two tags.
  const re = /\b[A-Z][a-z]+(?: [A-Z][a-z]+)+\b|\b[A-Z][A-Za-z0-9]*(?:[-.][A-Za-z0-9]+)*\b|\b[a-z]+[A-Z][A-Za-z0-9]*\b/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text || ''))) {
    const word = m[0].replace(/[.-]+$/, '');
    if (word.length < 2 || NON_ENTITY_WORDS.has(word)) continue;
    const tag = toHashtag(word);
    if (!tag || isGenericHashtag(tag)) continue;
    const key = tagKey(tag);
    const hit = counts.get(key);
    if (hit) hit.n += 1;
    else counts.set(key, { tag, n: 1, first: i++ });
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.first - b.first)
    .slice(0, limit)
    .map((e) => e.tag);
}

/**
 * The final hashtag line: the model's tags minus the generic ones, topped up from the article's own
 * entities when fewer than 3 survive, deduplicated, capped at 5. Returns fewer than 3 only when the
 * article genuinely names nothing taggable — a short honest line beats padding it with #AI.
 */
export function contextualHashtags(modelTags: string[], context: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const tag = toHashtag(raw);
    const key = tagKey(tag);
    if (!tag || seen.has(key) || isGenericHashtag(tag) || out.length >= 5) return;
    seen.add(key);
    out.push(tag);
  };
  for (const t of modelTags || []) push(t);
  if (out.length < 3) for (const t of entityHashtags(context, 8)) push(t);
  return out;
}

/** Sentences that talk about the writer, the model or the reader instead of about the article. */
const META_PATTERNS: RegExp[] = [
  /(?:ב|ה)מעבדה (?:שלי|שלנו)/,
  /(?:בדקתי|ניסיתי|הרצתי) (?:את זה |זאת )?(?:אצלי|בעצמי|במעבדה)/,
  /אילו פרמטרים/,
  /(?:איזה|איזו|אילו|מה) (?:[֐-׿]+ )?(?:הייתם|היית) (?:מוסיפים|מוסיף|מוסיפה|בוחרים|בוחר|עושים|עושה)/,
  /כמודל (?:שפה|AI)/,
  /(?:אני|אנחנו) (?:מודל|בינה מלאכותית)/,
  /(?:כך|ככה|איך) (?:בעצם )?(?:עובד|עובדים) (?:מודל|מודלי) (?:שפה|ה-?AI)/,
  /מודלי שפה (?:עובדים|פועלים) (?:על ידי|באמצעות|כך ש)/,
  /(?:ספרו|כתבו|שתפו) (?:לי |לנו )?(?:בתגובות|למטה)/,
  /מה (?:דעתכם|אתם חושבים)/,
  /(?:קישור|לינק) בביו/,
  /mrdaniel\.co\.il/i,
];

/** Pictographic emoji plus the joiners/selectors that glue multi-codepoint ones together. */
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]️?(?:‍[\p{Extended_Pictographic}]️?)*|️|⃣/gu;

/**
 * Body clean-up for the analyst register:
 *   • every emoji goes — "minimal to none", and the fixed CTA already carries the one the post has;
 *   • any sentence matching META_PATTERNS goes (lab talk, how-models-work asides, reader polls,
 *     a CTA the model wrote despite being told the system appends one);
 *   • a question left dangling at the end goes — the closing slot belongs to NEWS_CTA_LINE.
 * Structure (blank lines, `•` bullets) is preserved; a line emptied by the filter disappears.
 */
export function enforceAnalystTone(body: string): string {
  const lines = (body || '')
    .replace(EMOJI, '')
    .split('\n')
    .map((line) => {
      const bullet = /^\s*•\s*/.exec(line)?.[0] ?? '';
      const text = line.slice(bullet.length);
      // A sentence ends at . ! ? FOLLOWED BY whitespace — "GPT-4.5" and "mrdaniel.co.il" stay whole.
      const sentences = text.split(/(?<=[.!?])\s+/);
      const kept = sentences.filter((s) => !META_PATTERNS.some((re) => re.test(s))).join(' ').replace(/\s{2,}/g, ' ').trim();
      return kept ? `${bullet.trim() ? '• ' : ''}${kept}` : text.trim() ? null : '';
    })
    .filter((l): l is string => l !== null);

  // Trailing questions: the model's habit of closing on "?" survives every prompt revision.
  while (lines.length) {
    const last = lines[lines.length - 1].trim();
    if (!last || /[?？]["״”]?$/.test(last)) lines.pop();
    else break;
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
