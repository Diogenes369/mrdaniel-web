/**
 * Grok carousel agent — takes one scraped AI news item and returns BOTH a carousel deck (same shape
 * the dashboard's studio renderer already draws) AND an X thread built for the For You ranker.
 *
 * Three stages, named after the agents the dashboard's Mission Control arena visualises:
 *   1. Grok   — drafts slides + thread in one JSON call, in Grok's own register: witty, sharp,
 *               irreverent about hype. Grounding rules still win: every fact comes from the source.
 *   2. Hermes — verifies before anything is shown: numbers that do not appear in the source are
 *               flagged (and their slide marked), the text runs through the same security guard and
 *               AI-phrase scrubber every other generator uses, and the thread is re-cut to X limits.
 *   3. Score  — xAlgorithm.ts checks the thread against the levers the open-sourced ranker rewards.
 *
 * Without XAI_API_KEY this throws XaiNotConfiguredError; the dashboard falls back to its local deck
 * builder + `threadFromDeck`, so the operator still gets a thread.
 */
import { grokChat, parseGrokJson, xaiModel } from '../xaiClient.js';
import {
  X_ALGORITHM_PROMPT_RULES,
  X_POST_LIMIT,
  scoreXThread,
  threadFromDeck,
  xWeightedLength,
  type XAlgorithmReport,
  type XThreadPost,
} from '../xAlgorithm.js';
import { EXPERT_VOICE_RULES, AUDIENCE_RULES, scrubAiPhrases } from '../../agent/expertVoice.js';
import { sanitizeInput, sanitizeOutput } from '../../agent/AgentSecurityGuard.js';
import { sanitizeHebrewText } from '../../agent/hebrewTextSanitizer.js';
import { cleanCarouselList, cleanCarouselText, mapCarouselLayout, type CarouselStudioSlide } from '../../agent/SocialAgentEngine.js';

export interface GrokCarouselInput {
  title: string;
  source: string;
  topic: string;
  brief: string;
  takeaways?: string[];
}

export interface HermesVerification {
  /** Numbers in the output that never appear in the source brief. */
  unverifiedNumbers: string[];
  /** Slide indexes carrying an unverified number. */
  flaggedSlides: number[];
  securityPassed: boolean;
  securityFlags: string[];
  /** Thread posts Hermes had to cut to fit X's limit. */
  trimmedPosts: number;
}

export interface GrokCarouselResult {
  deck: CarouselStudioSlide[];
  thread: XThreadPost[];
  report: XAlgorithmReport;
  verification: HermesVerification;
  model: string;
  timings: { grokMs: number; hermesMs: number };
}

const GROK_SYSTEM = `אתה Grok, הכותב של דניאל בן ברוך (mrdaniel.co.il) לקרוסלות ולשרשורים ב-X. הנושא: AI בלבד — חדשות AI, מודלי שפה וסוכנים.

האישיות שלך: שנון, חד, קצת חצוף כלפי הייפ, ישיר עד כאב. אתה לא מתחנף למעבדות ולא חוזר על הודעות לעיתונות — אתה אומר מה באמת חדש, מה מנופח, ומה זה משנה למי שבונה עם AI. הומור יבש מותר ורצוי. עלבונות, השפלה של אנשים, וקללות — לא. החוצפה מופנית לטענות, לא לאנשים.

${EXPERT_VOICE_RULES}

${AUDIENCE_RULES}

${X_ALGORITHM_PROMPT_RULES}

עובדתיות — גוברת על האישיות:
- כל עובדה, מספר, שם מודל או ציטוט חייבים להופיע בטקסט המקור. אסור להמציא, אסור להשלים מהזיכרון.
- מותר לשפוט (״זה מנופח״, ״זה הפרט שכולם מפספסים״) כשהשיפוט נשען על מה שכתוב במקור.
- אין קרדיט לכותב המקורי, אין @ ואין שם רשת כמקור. המותג היחיד: mrdaniel.co.il.

הפלט: JSON בלבד, אובייקט אחד:
{
  "slides": [ 8–12 שקופיות. הראשונה {"role":"hook","layout":"hero",...}, האחרונה {"role":"cta","layout":"cta",...}, ביניהן {"role":"value","layout":"value|checklist|stat|comparison|prompt|quote",...}.
    כל שקופית: {"role","layout","kicker","headline","subhead","body","bullets":[],"bulletsLeft":[],"columnLabels":[],"stat":"","code":"","quote":"","readingTime":""}.
    hook: headline עד 10 מילים שעוצר גלילה + subhead שפותח פער סקרנות. value: body של 25–55 מילים, או bullets 3–5. stat רק עם מספר מהמקור. ],
  "thread": [ 4–8 פוסטים ל-X בעברית. {"text": "...", "mediaSlides": [אינדקסים של שקופיות להצמדה כתמונה]}.
    פוסט 1: ההוק, בלי קישור, עם "mediaSlides":[0,1,2,3]. פוסטים באמצע: תובנה אחת כל אחד, עד ${X_POST_LIMIT} תווים.
    פוסט אחרון: טריגר שמירה/שליחה + סיבה לעקוב + mrdaniel.co.il + שאלה פתוחה אחת בסוף. ]
}`;

const NUMBER_RE = /\d[\d.,]*%?/g;

function normalizeNumber(n: string): string {
  return n.replace(/[,]/g, '').replace(/\.$/, '');
}

/** Hermes: every number the model printed must exist somewhere in the source it was given. */
export function findUnverifiedNumbers(text: string, source: string): string[] {
  const sourceNums = new Set((source.match(NUMBER_RE) || []).map(normalizeNumber));
  const out = new Set<string>();
  for (const raw of text.match(NUMBER_RE) || []) {
    const n = normalizeNumber(raw);
    // Single digits are list ordinals and step counts ("3 דברים"), and years/dates in brand copy
    // like 2026 are not claims about the story.
    if (n.replace('%', '').length <= 1) continue;
    if (/^20\d\d$/.test(n)) continue;
    if (!sourceNums.has(n) && !sourceNums.has(n.replace('%', ''))) out.add(raw);
  }
  return [...out];
}

function toSlide(rec: Record<string, unknown>): CarouselStudioSlide {
  const roleRaw = String(rec.role || '');
  const role: CarouselStudioSlide['role'] = /cta/.test(roleRaw) ? 'cta' : /hook/.test(roleRaw) ? 'hook' : 'value';
  const cols = Array.isArray(rec.columnLabels) ? rec.columnLabels.map((c) => sanitizeHebrewText(String(c ?? '')).slice(0, 24)) : [];
  return {
    role,
    layout: mapCarouselLayout(rec.layout, role),
    kicker: cleanCarouselText(rec.kicker, 40) || 'Grok',
    headline: cleanCarouselText(rec.headline, 120),
    subhead: cleanCarouselText(rec.subhead, 160),
    body: cleanCarouselText(rec.body, 480),
    bullets: cleanCarouselList(rec.bullets, 5, 120),
    bulletsLeft: cleanCarouselList(rec.bulletsLeft, 4, 120),
    columnLabels: cols.length === 2 ? [cols[0], cols[1]] : null,
    stat: sanitizeHebrewText(String(rec.stat ?? '')).slice(0, 24),
    code: String(rec.code ?? '').trim().slice(0, 600),
    quote: cleanCarouselText(rec.quote, 220),
    readingTime: sanitizeHebrewText(String(rec.readingTime ?? '')).slice(0, 24),
  };
}

function fitPost(text: string): { text: string; trimmed: boolean } {
  const t = scrubAiPhrases(sanitizeHebrewText(text)).trim();
  if (xWeightedLength(t) <= X_POST_LIMIT) return { text: t, trimmed: false };
  let cut = t;
  while (xWeightedLength(cut) > X_POST_LIMIT - 1 && cut.includes(' ')) cut = cut.slice(0, cut.lastIndexOf(' '));
  return { text: cut.trim(), trimmed: true };
}

export async function runGrokCarouselAgent(input: GrokCarouselInput): Promise<GrokCarouselResult> {
  const { clean } = sanitizeInput(input.brief.slice(0, 9000));
  if (clean.trim().length < 40) throw new Error('brief too thin to build a carousel');
  const takeaways = (input.takeaways ?? []).map((t) => String(t).slice(0, 200)).filter(Boolean).slice(0, 8);

  const t0 = Date.now();
  const raw = await grokChat({
    system: GROK_SYSTEM,
    user: `כותרת המקור: ${input.title}\nמקור: ${input.source}\nנושא: ${input.topic}\n\n${
      takeaways.length ? `תובנות שחולצו:\n- ${takeaways.join('\n- ')}\n\n` : ''
    }טקסט המקור המלא (הבסיס היחיד לעובדות):\n"""\n${clean}\n"""`,
    json: true,
    temperature: 0.85,
  });
  const grokMs = Date.now() - t0;

  // ── Hermes ──
  const t1 = Date.now();
  const parsed = parseGrokJson(raw) as { slides?: unknown[]; thread?: unknown[] };
  const slidesRaw = Array.isArray(parsed?.slides) ? parsed.slides : Array.isArray(parsed) ? (parsed as unknown[]) : [];
  const deck = slidesRaw
    .map((s) => toSlide((s && typeof s === 'object' ? s : {}) as Record<string, unknown>))
    .filter((s) => s.role === 'cta' || s.headline.length > 2 || s.body.length > 15 || s.bullets.length > 0 || s.quote.length > 5);
  if (deck.length < 5) throw new Error('Grok did not return a usable carousel');
  if (deck[0].role !== 'hook') deck[0] = { ...deck[0], role: 'hook', layout: 'hero' };
  const lastIdx = deck.length - 1;
  if (deck[lastIdx].role !== 'cta') deck.push({ ...deck[lastIdx], role: 'cta', layout: 'cta', headline: 'רוצים עוד פירוקים כאלה?', body: 'שמרו את הקרוסלה, ועקבו לעוד AI בלי הייפ — mrdaniel.co.il', bullets: [], bulletsLeft: [], columnLabels: null, stat: '', code: '', quote: '' });

  let trimmedPosts = 0;
  const threadRaw = Array.isArray(parsed?.thread) ? parsed.thread : [];
  let thread: XThreadPost[] = threadRaw
    .map((p) => {
      const rec = (p && typeof p === 'object' ? p : { text: String(p ?? '') }) as Record<string, unknown>;
      const fitted = fitPost(String(rec.text ?? ''));
      if (fitted.trimmed) trimmedPosts++;
      const media = Array.isArray(rec.mediaSlides)
        ? rec.mediaSlides.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n < deck.length).slice(0, 4)
        : [];
      return { text: fitted.text, mediaSlides: media };
    })
    .filter((p) => p.text.length > 0);
  if (thread.length < 3) thread = threadFromDeck(deck);
  // The hook post always carries native media — the one rule the model most often forgets.
  if (!thread[0].mediaSlides.length) thread[0] = { ...thread[0], mediaSlides: [0, 1, 2, 3].filter((i) => i < deck.length) };

  const deckText = deck.map((s) => [s.headline, s.subhead, s.body, s.stat, s.quote, ...s.bullets, ...s.bulletsLeft].join('\n'));
  const unverifiedNumbers = findUnverifiedNumbers([...deckText, ...thread.map((p) => p.text)].join('\n'), `${input.title}\n${clean}\n${takeaways.join('\n')}`);
  const flaggedSlides = deckText.map((t, i) => (findUnverifiedNumbers(t, `${input.title}\n${clean}`).length ? i : -1)).filter((i) => i >= 0);
  const security = sanitizeOutput([...deckText, ...thread.map((p) => p.text)].join('\n\n'));
  const hermesMs = Date.now() - t1;

  return {
    deck,
    thread,
    report: scoreXThread({ posts: thread }),
    verification: {
      unverifiedNumbers,
      flaggedSlides,
      securityPassed: security.passed,
      securityFlags: security.flags,
      trimmedPosts,
    },
    model: xaiModel(),
    timings: { grokMs, hermesMs },
  };
}
