import { SITE_ORIGIN } from './useDashboardRefresh';
import type { NewsItem } from './newsAgentTypes';
import type {
  TrendRadar,
  TrendEntry,
  TrendMomentum,
  ViralHeadline,
  ContentBlueprint,
  EngagementReply,
  EngagementReplySet,
  ReplyStyle,
} from './igGrowthTypes';
import { REPLY_META } from './igGrowthTypes';
import type { EngagementTrigger, GrowthContent, GrowthPack, HookOption } from './igGrowthTypes';
import { getAdminSecret } from './adminSecret';
import { describeAiError, aiRetryDelayMs } from './aiErrors';
import {
  ENGAGEMENT_BAIT,
  blendHashtags,
  buildCheatSheetLocal,
  buildGrowthPackLocal,
  buildHookOptionsLocal,
  defaultDeliverable,
  defaultTriggerKeyword,
  leadMagnetTemplate,
  normalizeHookOptions,
  normalizeSeoKeywords,
  normalizeTriggerKeyword,
  stripBidi,
  wordCount,
} from './growthPlaybook';

const ENDPOINT = `${SITE_ORIGIN.replace(/\/$/, '')}/api/agent-generate`;

/** POST to /api/agent-generate with a hard per-attempt timeout + ONE bounded retry:
 *  - HTTP 429  → wait the server's retryAfter (3–12s) then retry once.
 *  - HTTP ≥500 → wait 800ms (transient upstream/Gemini 500/502/504) then retry once, so a single
 *    blip doesn't drop the caller straight to the local deterministic fallback.
 *  Mirrors the hung-fetch guard in storySlides.ts (a stalled fetch never rejects on its own). */
async function post(action: string, body: Record<string, unknown>, timeoutMs = 75000): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(getAdminSecret() ? { 'x-admin-secret': getAdminSecret() } : {}),
  };
  const payload = JSON.stringify({ action, ...body });
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(ENDPOINT, { method: 'POST', headers, body: payload, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (attempt >= 1) return res;
    if (res.status === 429) {
      // Only a per-minute throttle is worth waiting out; a spent quota or depleted credits is not.
      const waitMs = await aiRetryDelayMs(res, attempt);
      if (waitMs === null) return res;
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    if (res.status >= 500) {
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }
    return res;
  }
}

// ─── 1. TREND & TOP-ACCOUNT RESEARCH ─────────────────────────────────────────────────────────

export interface TrendSource {
  title: string;
  source: string;
  topic: string;
  summary: string;
}

/** Max headlines actually forwarded to Gemini (compact form). The local fallback still uses the
 *  full `sources` list — this cap only shrinks the LLM prompt to avoid transient 500s. */
export const TREND_RADAR_SEND_LIMIT = 14;

/** Condense the live news feed into the shape the analyser + local fallback need. `summary` is
 *  kept for the deterministic fallback's keyword clustering; it is NOT sent to Gemini. */
export function newsItemsToTrendSources(items: NewsItem[], limit = 24): TrendSource[] {
  return items.slice(0, limit).map((i) => ({
    title: i.title,
    source: i.source,
    topic: i.topic,
    summary: (i.summary || i.excerpt || '').slice(0, 320),
  }));
}

const TOPIC_HE: Record<string, string> = {
  ai: 'בינה מלאכותית',
  cyber: 'אבטחת סייבר',
  cloud: 'ענן ותשתיות',
  general: 'טכנולוגיה',
};

const STOP = new Set(
  'the a an of to in on for and or with without is are was how why what new using use over into from at by як של על עם בין גם רק כי אבל מה איך למה חדש חדשה זה זו את של ל ב מ ה ו כ ש ואת גם עד'.split(
    /\s+/
  )
);

function keywords(text: string, n = 6): string[] {
  const counts = new Map<string, number>();
  for (const raw of (text || '').toLowerCase().split(/[^a-z֐-׿0-9]+/)) {
    const w = raw.trim();
    if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

/** Deterministic Trend Radar — clusters the feed by topic, ranks by volume, templates blueprints.
 *  Used offline / when the LLM path is unavailable. */
export function buildTrendRadarLocal(sources: TrendSource[], fallbackReason: string): TrendRadar {
  const byTopic = new Map<string, TrendSource[]>();
  for (const s of sources) {
    const key = s.topic || 'general';
    const arr = byTopic.get(key) ?? [];
    arr.push(s);
    byTopic.set(key, arr);
  }
  const ranked = [...byTopic.entries()].sort((a, b) => b[1].length - a[1].length);

  const momentumFor = (count: number, total: number): TrendMomentum => {
    const share = total ? count / total : 0;
    if (share >= 0.4) return 'hot';
    if (share >= 0.2) return 'rising';
    return 'steady';
  };

  const trends: TrendEntry[] = ranked.slice(0, 5).map(([topic, list]) => {
    const kws = keywords(list.map((l) => `${l.title} ${l.summary}`).join(' '), 4);
    const he = TOPIC_HE[topic] || topic;
    return {
      title: kws.length ? `${he}: ${kws.slice(0, 3).join(', ')}` : he,
      momentum: momentumFor(list.length, sources.length),
      why: `${list.length} כתבות מהפיד ב-${he} בימים האחרונים — ${list[0]?.source ?? ''} ואחרים מכסים את הנושא במקביל.`,
      audiencePainPoint:
        topic === 'cyber'
          ? 'מנהלי IT בארגונים קטנים-בינוניים לא בטוחים אם ההגנות הקיימות מכסות את וקטור התקיפה הזה.'
          : topic === 'ai'
            ? 'עסקים רוצים לאמץ AI אבל חוששים מהטמעה לא בטוחה ומחוסר שליטה על התוצאה.'
            : topic === 'cloud'
              ? 'צוותים מתקשים לאזן בין עלות, ביצועים ואבטחה בתשתית הענן.'
              : 'קבלת ההחלטות הטכנולוגיות מרגישה כמו רדיפה אחרי טרנדים בלי מסגרת ברורה.',
    };
  });

  const viralHeadlines: ViralHeadline[] = sources.slice(0, 6).map((s) => ({
    headline: s.title.length > 4 ? `${s.title.replace(/[.!?…]+$/, '')} — מה זה אומר בפועל לארגון שלך?` : 'הטרנד שכולם מדברים עליו — והזווית שמפספסים',
    angle: `לקחת את הכותרת של ${s.source} ולתרגם אותה להשלכה מעשית אחת שהקהל יכול ליישם.`,
  }));

  const topWords = keywords(sources.map((s) => `${s.title} ${s.summary}`).join(' '), 3);
  const topicHint = topWords.join(', ') || 'הטרנד המרכזי בפיד';
  const blueprints: ContentBlueprint[] = [
    {
      format: 'reel',
      hook: `רוב האנשים חושבים ש-${topicHint} זה באזוורד. בפועל, זה כבר משנה איך ארגונים עובדים.`,
      outline: [
        'פתיחה: סטטמנט שנוגד אינטואיציה על הטרנד',
        'הבעיה: מה הקהל מפספס היום',
        'הדגמה קצרה: דוגמה אחת מהשטח',
        'הפואנטה: הצעד הראשון שאפשר לעשות השבוע',
      ],
      cta: 'שמרו את הסרטון ועקבו לניתוחים נוספים על סייבר ו-AI.',
    },
    {
      format: 'story',
      hook: `3 דברים שקורים עכשיו סביב ${topicHint} ואף אחד לא עצר להסביר.`,
      outline: [
        'פריים 1: כותרת + שאלה שמזמינה תגובה (סטיקר)',
        'פריים 2: העובדה המרכזית מהפיד',
        'פריים 3: מה ההשלכה על הקהל',
        'פריים 4: קישור לכתבה המלאה + סטיקר "שאלו אותי"',
      ],
      cta: 'החליקו למעלה / הגיבו בהודעה לפרטים.',
    },
    {
      format: 'carousel',
      hook: `${topicHint}: המדריך המהיר לפני שמקבלים החלטה.`,
      outline: [
        'שקופית 1 (שער): הכותרת + למי זה רלוונטי',
        'שקופית 2: ההקשר — מה השתנה',
        'שקופית 3: הסיכון / ההזדמנות המרכזית',
        'שקופית 4: מה לעשות בפועל — צ׳קליסט קצר',
        'שקופית 5 (CTA): עקבו + כתובת האתר mrdaniel.co.il',
      ],
      cta: 'עקבו אחר העמוד לניתוחים בזמן אמת, וקראו עוד באתר mrdaniel.co.il.',
    },
  ];

  return {
    trends: trends.length ? trends : [
      {
        title: 'אין מספיק נתונים בפיד כרגע',
        momentum: 'steady',
        why: 'לא נמשכו כתבות — רעננו את הפיד או בדקו את החיבור ל-mrdaniel.co.il/api/news.',
        audiencePainPoint: '—',
      },
    ],
    viralHeadlines,
    blueprints,
    synthesized: false,
    fallbackReason,
    createdAt: Date.now(),
    sourceCount: sources.length,
  };
}

interface RawTrendRadar {
  trends?: Array<{ title?: unknown; momentum?: unknown; why?: unknown; audiencePainPoint?: unknown; painPoint?: unknown }>;
  viralHeadlines?: Array<{ headline?: unknown; angle?: unknown }>;
  blueprints?: Array<{ format?: unknown; hook?: unknown; outline?: unknown; cta?: unknown }>;
}

function coerceMomentum(v: unknown): TrendMomentum {
  const s = String(v ?? '').toLowerCase();
  return s === 'hot' || s === 'rising' || s === 'steady' ? (s as TrendMomentum) : 'rising';
}

function coerceRadar(raw: RawTrendRadar, sourceCount: number): TrendRadar | null {
  const trends: TrendEntry[] = (Array.isArray(raw.trends) ? raw.trends : [])
    .map((t) => ({
      title: String(t.title ?? '').trim().slice(0, 120),
      momentum: coerceMomentum(t.momentum),
      why: String(t.why ?? '').trim().slice(0, 400),
      audiencePainPoint: String(t.audiencePainPoint ?? t.painPoint ?? '').trim().slice(0, 400),
    }))
    .filter((t) => t.title.length > 1);
  const viralHeadlines: ViralHeadline[] = (Array.isArray(raw.viralHeadlines) ? raw.viralHeadlines : [])
    .map((h) => ({ headline: String(h.headline ?? '').trim().slice(0, 240), angle: String(h.angle ?? '').trim().slice(0, 300) }))
    .filter((h) => h.headline.length > 2);
  const blueprints: ContentBlueprint[] = (Array.isArray(raw.blueprints) ? raw.blueprints : [])
    .map((b) => {
      const fmt = String(b.format ?? '').toLowerCase();
      return {
        format: (fmt === 'reel' || fmt === 'story' || fmt === 'carousel' ? fmt : 'carousel') as ContentBlueprint['format'],
        hook: String(b.hook ?? '').trim().slice(0, 300),
        outline: (Array.isArray(b.outline) ? b.outline : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 8),
        cta: String(b.cta ?? '').trim().slice(0, 240),
      };
    })
    .filter((b) => b.hook.length > 2 && b.outline.length >= 2);

  if (trends.length < 2 || blueprints.length < 1) return null;
  return { trends, viralHeadlines, blueprints, synthesized: true, createdAt: Date.now(), sourceCount };
}

/** Analyse recent headlines → Viral Topic Radar + content blueprints. Never throws — on any
 *  failure (network, 429/503, malformed model output) it returns the deterministic local radar. */
export async function fetchTrendRadar(sources: TrendSource[]): Promise<TrendRadar> {
  if (sources.length < 3) {
    return buildTrendRadarLocal(sources, 'אין מספיק כתבות בפיד לניתוח AI — הוצג ניתוח מקומי.');
  }
  // Slim, capped payload for Gemini: title/source/category only, no summaries/URLs (a 36-item
  // body was triggering transient HTTP 500s). The local fallback below still sees full `sources`.
  const slim = sources.slice(0, TREND_RADAR_SEND_LIMIT).map((s) => ({
    title: s.title.replace(/\s+/g, ' ').trim().slice(0, 180),
    source: (s.source || '').slice(0, 60),
    category: s.topic || 'general',
  }));
  try {
    const res = await post('trend-radar', { items: slim });
    if (!res.ok) return buildTrendRadarLocal(sources, (await describeAiError(res)).message);
    const data = (await res.json()) as { ok?: boolean; blocked?: boolean; radar?: RawTrendRadar };
    if (data.blocked) return buildTrendRadarLocal(sources, 'פלט ה-AI נחסם ע"י מסנן התוכן.');
    if (!data.ok || !data.radar) return buildTrendRadarLocal(sources, 'מנוע ה-AI לא החזיר ניתוח תקין.');
    const coerced = coerceRadar(data.radar, slim.length);
    return coerced ?? buildTrendRadarLocal(sources, 'מבנה הניתוח מה-AI לא היה שלם — הוצג ניתוח מקומי.');
  } catch (err) {
    return buildTrendRadarLocal(sources, (err as Error)?.message || 'הקריאה ל-AI נכשלה — הוצג ניתוח מקומי.');
  }
}

// ─── 2. SMART RESPONSE & ENGAGEMENT ──────────────────────────────────────────────────────────

const REPLY_ORDER: ReplyStyle[] = ['expert', 'question', 'concise'];

/** Deterministic 3-reply set — used offline / when the LLM path is unavailable. */
export function buildRepliesLocal(postText: string, fallbackReason: string, sourceUrl?: string): EngagementReplySet {
  const t = (postText || '').replace(/\s+/g, ' ').trim();
  const topic = /סייבר|אבטח|cyber|ransomware|phishing|zero.?trust|vulnerab/i.test(t)
    ? 'cyber'
    : /\bai\b|בינה מלאכותית|llm|agent|סוכן|מודל/i.test(t)
      ? 'ai'
      : /ענן|cloud|kubernetes|devops|תשתית/i.test(t)
        ? 'cloud'
        : 'general';

  const angle: Record<string, string> = {
    cyber: 'מזווית של מי שמנהל את זה בפועל — הפער הוא כמעט תמיד בין המדיניות הכתובה לבין מה שבאמת רץ ב-production.',
    ai: 'ההטמעה הבטוחה היא החלק הקשה: בלי שכבת Guardrails וממשל, כלי ה-AI הכי טוב הופך לחשיפה.',
    cloud: 'האיזון בין עלות, ביצועים ואבטחה בענן הוא החלטה ארכיטקטונית, לא הגדרה שמסמנים פעם אחת.',
    general: 'הנקודה המעשית שנוטים לפספס היא איך זה משפיע על צוות ה-IT שצריך לתחזק את זה בשוטף.',
  };

  const replies: EngagementReply[] = [
    {
      style: 'expert',
      label: REPLY_META.expert.label,
      text: `נקודה חשובה. מהניסיון בשטח בניהול תשתיות ארגוניות — ${angle[topic]} שווה להוסיף שגם ההיבט של בקרה ותיעוד שינויים הוא קריטי כאן, לא רק הכלי עצמו.`,
    },
    {
      style: 'question',
      label: REPLY_META.question.label,
      text: `מסכים עם הכיוון. מעניין אותי: איך אתם מודדים בפועל שההטמעה הזו עובדת — לפי מדד עסקי, לפי צמצום סיכון, או לפי משוב מהצוות? חסר לי סטנדרט מוסכם כאן.`,
    },
    {
      style: 'concise',
      label: REPLY_META.concise.label,
      text: `הטכנולוגיה הבשילה. מה שעוד לא — הממשל סביבה.`,
    },
  ];

  return { replies, synthesized: false, fallbackReason, createdAt: Date.now(), sourceUrl };
}

function coerceReplies(raw: unknown): EngagementReply[] | null {
  const arr = Array.isArray(raw) ? raw : (raw as { replies?: unknown[] })?.replies;
  if (!Array.isArray(arr)) return null;
  const out: EngagementReply[] = [];
  for (const r of arr) {
    const rec = r as Record<string, unknown>;
    const style = String(rec.style ?? '').toLowerCase() as ReplyStyle;
    const text = String(rec.text ?? rec.body ?? '').trim();
    if (!text) continue;
    const known = REPLY_ORDER.includes(style) ? style : REPLY_ORDER[out.length] ?? 'expert';
    out.push({ style: known, label: REPLY_META[known].label, text: text.slice(0, 600) });
  }
  // keep one of each known style, in canonical order, when possible
  const byStyle = new Map(out.map((r) => [r.style, r]));
  const ordered = REPLY_ORDER.map((s) => byStyle.get(s)).filter(Boolean) as EngagementReply[];
  const final = ordered.length >= 3 ? ordered.slice(0, 3) : out.slice(0, 3);
  return final.length === 3 ? final : null;
}

/** Generate 3 brand-aligned engagement replies for a leader's post. Never throws — falls back to
 *  the deterministic local set on any failure. */
export async function generateEngagementReplies(input: {
  postText: string;
  sourceUrl?: string;
  lang?: 'he' | 'en';
}): Promise<EngagementReplySet> {
  const postText = (input.postText || '').trim();
  if (postText.length < 20) {
    return buildRepliesLocal(postText, 'הטקסט קצר מדי לניסוח AI — הוצגו תגובות ברירת מחדל.', input.sourceUrl);
  }
  try {
    const res = await post('engagement-replies', {
      postText: postText.slice(0, 4000),
      sourceUrl: input.sourceUrl ?? '',
      lang: input.lang ?? 'he',
    });
    if (!res.ok) return buildRepliesLocal(postText, (await describeAiError(res)).message, input.sourceUrl);
    const data = (await res.json()) as { ok?: boolean; blocked?: boolean; replies?: unknown };
    if (data.blocked) return buildRepliesLocal(postText, 'פלט ה-AI נחסם ע"י מסנן התוכן.', input.sourceUrl);
    const replies = coerceReplies(data.replies);
    if (!data.ok || !replies) return buildRepliesLocal(postText, 'מנוע ה-AI לא החזיר 3 תגובות תקינות.', input.sourceUrl);
    return { replies, synthesized: true, createdAt: Date.now(), sourceUrl: input.sourceUrl };
  } catch (err) {
    return buildRepliesLocal(postText, (err as Error)?.message || 'הקריאה ל-AI נכשלה.', input.sourceUrl);
  }
}

// ─── 3. ORGANIC GROWTH STRATEGY ENGINE (GrowthScorePanel) ────────────────────────────────────
// action:"growth-optimize" · op hooks | cheat-sheet | pack. Same never-throw contract as the two
// tools above: every failure resolves to the deterministic playbook build, stamped with the reason.

type GrowthOp = 'hooks' | 'cheat-sheet' | 'pack';

/** The grounding source for every op: the body units in order, then the caption. */
function growthBody(content: GrowthContent): string {
  return [...content.units, content.caption].filter(Boolean).join('\n\n').slice(0, 6000);
}

function growthRequest(op: GrowthOp, content: GrowthContent, trigger?: EngagementTrigger): Record<string, unknown> {
  return {
    op,
    kind: content.kind,
    topic: content.topic,
    title: content.title,
    hook: content.hook,
    body: growthBody(content),
    ...(trigger ? { trigger: { keyword: trigger.keyword.trim(), deliverable: trigger.deliverable.trim() } } : {}),
  };
}

export interface HookRefineResult {
  hookOptions: HookOption[];
  synthesized: boolean;
  fallbackReason?: string;
}

/** Three sharper first-3-seconds openers. Offline it ranks the content's own sentences instead. */
export async function refineHooks(content: GrowthContent): Promise<HookRefineResult> {
  const local = (reason: string): HookRefineResult => ({ hookOptions: buildHookOptionsLocal(content), synthesized: false, fallbackReason: reason });
  if (growthBody(content).length < 40) return local('התוכן קצר מדי לחידוד AI — הוצגו חלופות מתוך הטקסט עצמו.');
  try {
    const res = await post('growth-optimize', growthRequest('hooks', content), 60000);
    if (!res.ok) return local((await describeAiError(res)).message);
    const data = (await res.json()) as { ok?: boolean; blocked?: boolean; hookOptions?: unknown };
    if (data.blocked) return local('פלט ה-AI נחסם ע"י מסנן התוכן.');
    const hookOptions = normalizeHookOptions(data.hookOptions);
    if (!data.ok || hookOptions.length < 2) return local('מנוע ה-AI לא החזיר חלופות hook שמישות.');
    return { hookOptions, synthesized: true };
  } catch (err) {
    return local((err as Error)?.message || 'הקריאה ל-AI נכשלה.');
  }
}

export interface CheatSheetResult {
  slideText: string;
  shortLabel: string;
  synthesized: boolean;
  fallbackReason?: string;
}

/** One save-worthy summary unit. Resolves null only when neither the AI nor the offline builder
 *  can make one (the content has fewer than two usable sentences). */
export async function buildCheatSheet(content: GrowthContent): Promise<CheatSheetResult | null> {
  const local = (reason: string): CheatSheetResult | null => {
    const built = buildCheatSheetLocal(content);
    return built ? { ...built, synthesized: false, fallbackReason: reason } : null;
  };
  if (growthBody(content).length < 40) return local('אין פה מספיק תוכן בשביל ניתוח AI.');
  try {
    const res = await post('growth-optimize', growthRequest('cheat-sheet', content), 60000);
    if (!res.ok) return local((await describeAiError(res)).message);
    const data = (await res.json()) as { ok?: boolean; blocked?: boolean; slideText?: unknown; shortLabel?: unknown };
    if (data.blocked) return local('פלט ה-AI נחסם ע"י מסנן התוכן.');
    const slideText = String(data.slideText ?? '').replace(/\s+/g, ' ').trim();
    if (!data.ok || wordCount(slideText) < 18) return local('מנוע ה-AI לא החזיר סיכום שמיש.');
    return { slideText, shortLabel: String(data.shortLabel ?? '').trim() || 'צ׳קליסט לשמירה', synthesized: true };
  } catch (err) {
    return local((err as Error)?.message || 'הקריאה ל-AI נכשלה.');
  }
}

/**
 * Re-validate the server's pack on this side of the wire, so the panel can rely on its invariants
 * (a bidi-free single-word keyword, a CTA that carries it, ≤5 tags, 4–6 keywords) even if the two
 * halves of the engine drift apart. Returns null when the lead magnet is missing altogether.
 */
function coerceGrowthPack(raw: unknown, content: GrowthContent, trigger: EngagementTrigger): GrowthPack | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!r.leadMagnet || typeof r.leadMagnet !== 'object') return null;
  const lm = r.leadMagnet as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : []);

  const keyword = normalizeTriggerKeyword(String(lm.keyword ?? ''), normalizeTriggerKeyword(trigger.keyword, defaultTriggerKeyword(content.topic)));
  const deliverable = String(lm.deliverable ?? '').trim() || trigger.deliverable.trim() || defaultDeliverable(content.kind);
  const template = leadMagnetTemplate(keyword, deliverable);
  const cta = String(lm.captionCta ?? '').trim();
  const variants = [keyword, ...list(lm.triggerVariants).map((v) => normalizeTriggerKeyword(v, '')).filter(Boolean)];
  const replies = list(lm.publicReplies).slice(0, 3);
  const blended = blendHashtags(list(r.hashtags), content.topic);

  return {
    leadMagnet: {
      keyword,
      triggerVariants: [...new Set(variants)].slice(0, 6),
      deliverable,
      captionCta: cta && stripBidi(cta).includes(keyword) && !ENGAGEMENT_BAIT.test(cta) ? cta : template.captionCta,
      publicReplies: replies.length >= 2 ? replies : template.publicReplies,
      dmMessage: String(lm.dmMessage ?? '').trim() || template.dmMessage,
      dmButtonLabel: String(lm.dmButtonLabel ?? '').trim().slice(0, 30) || template.dmButtonLabel,
    },
    hashtags: blended.hashtags,
    nicheHashtags: blended.niche,
    broadHashtags: blended.broad,
    seoKeywords: normalizeSeoKeywords(r.seoKeywords, content.topic),
    synthesized: true,
    createdAt: Date.now(),
  };
}

/** Lead magnet (Comment-to-DM) + blended hashtags + Instagram-search keywords. Never throws. */
export async function fetchGrowthPack(content: GrowthContent, trigger: EngagementTrigger): Promise<GrowthPack> {
  const local = (reason: string) => buildGrowthPackLocal(content, trigger, reason);
  if (growthBody(content).length < 40) return local('התוכן קצר מדי לחבילת AI — הוצגה חבילה מקומית.');
  try {
    const res = await post('growth-optimize', growthRequest('pack', content, trigger), 60000);
    if (!res.ok) return local((await describeAiError(res)).message);
    const data = (await res.json()) as { ok?: boolean; blocked?: boolean; pack?: unknown };
    if (data.blocked) return local('פלט ה-AI נחסם ע"י מסנן התוכן.');
    if (!data.ok) return local('מנוע ה-AI לא החזיר חבילת צמיחה.');
    return coerceGrowthPack(data.pack, content, trigger) ?? local('מבנה חבילת הצמיחה מה-AI לא היה שלם — הוצגה חבילה מקומית.');
  } catch (err) {
    return local((err as Error)?.message || 'הקריאה ל-AI נכשלה.');
  }
}
