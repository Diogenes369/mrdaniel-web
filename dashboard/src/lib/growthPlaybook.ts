import { GENERIC_ENGAGEMENT_LINES, SITE_PROMO_FOOTER, type NewsTopic } from './newsAgentTypes';
import { deckToCaption } from './socialPublish';
import type { StoryPayload } from './storySlides';
import type { HookOption, HookPattern, ReelScript } from './agentTypes';
import type { EngagementTrigger, GrowthContent, GrowthKind, GrowthPack, LeadMagnet } from './igGrowthTypes';

/**
 * IG Growth playbook — the pure, network-free half of the Organic Growth Strategy Engine.
 *
 * Everything here is deterministic: the hashtag blend, the ManyChat keyword rules, the caption
 * composer, and the offline builders the Growth panel falls back on when /api/agent-generate is
 * unreachable, rate-limited or rejects the request (client libs never throw — see AGENTS.md). The
 * banks and the lead-magnet template mirror src/server/igGrowthStrategy.ts — keep the two in sync,
 * or the fallback and the AI path will disagree about what a valid caption looks like.
 */

// ─── Banks (mirrored in src/server/igGrowthStrategy.ts) ───────────────────────────────────────

/** The four tags the operator named as the brand's Israeli-niche anchors. */
export const CORE_IL_TAGS = ['#בינהמלאכותית', '#סייבר', '#אוטומציה', '#פיתוחתוכנה'];

const NICHE_TAGS: Record<NewsTopic, string[]> = {
  ai: ['#בינהמלאכותית', '#אוטומציה', '#סוכניAI', '#אוטומציהלעסקים', '#פיתוחתוכנה'],
  cyber: ['#סייבר', '#אבטחתמידע', '#בינהמלאכותית', '#אבטחתסייבר'],
  cloud: ['#פיתוחתוכנה', '#אוטומציה', '#ענן', '#תשתיותIT'],
  devops: ['#DevOps', '#אוטומציה', '#פיתוחתוכנה', '#תשתיותIT'],
  general: ['#בינהמלאכותית', '#אוטומציה', '#פיתוחתוכנה', '#הייטק'],
};

const BROAD_TAGS: Record<NewsTopic, string[]> = {
  ai: ['#AI', '#ArtificialIntelligence', '#AIAutomation', '#AITools'],
  cyber: ['#CyberSecurity', '#InfoSec', '#AI'],
  cloud: ['#DevOps', '#CloudComputing', '#Automation'],
  devops: ['#DevOps', '#CICD', '#Automation'],
  general: ['#Tech', '#AI', '#Automation'],
};

export const SEO_KEYWORD_BANK: Record<NewsTopic, string[]> = {
  ai: ['סוכני AI לעסקים', 'בינה מלאכותית לעסקים', 'אוטומציה לעסקים', 'כלי AI'],
  cyber: ['אבטחת סייבר לעסקים', 'אבטחת מידע', 'הגנה מפני פישינג', 'סייבר לעסק קטן'],
  cloud: ['פיתוח תוכנה', 'תשתיות ענן', 'אוטומציה לעסקים', 'DevOps'],
  devops: ['DevOps לעסקים', 'ניהול מערכות', 'אוטומציית CI/CD', 'תשתיות IT'],
  general: ['בינה מלאכותית', 'אוטומציה לעסקים', 'פיתוח תוכנה', 'טכנולוגיה לעסקים'],
};

const TOPIC_KEYWORD: Record<NewsTopic, string> = { ai: 'סוכן', cyber: 'הגנה', cloud: 'ענן', devops: 'תפעול', general: 'מדריך' };

/** Same 3–5 ceiling the server caption rules use. */
export const MAX_HASHTAGS = 5;

const SITE_ORIGIN = 'https://mrdaniel.co.il';

/** Where the DM button points when the operator has not pasted a ManyChat guide link. */
export const DEFAULT_DM_LINK = SITE_ORIGIN;

/** Shape hint for the DM-link field: a guide landing page, static slug or published guideId. */
export const DM_LINK_PLACEHOLDER = `${SITE_ORIGIN}/g/<slug>`;

const COMMON_COMMENT_WORDS = new Set(['כן', 'לא', 'תודה', 'מעולה', 'וואו', 'אמן', 'יפה', 'אש', 'מדהים', 'נכון', 'yes', 'no', 'wow', 'nice', 'great', 'thanks']);

/** Engagement-bait phrasing Meta demotes — scored as a penalty, never generated. */
export const ENGAGEMENT_BAIT = /תייג|לייק אם|תגיבו כן|שתפו כדי|שתפו ל-?\d|tag (?:a|\d)|like if/i;

const BIDI_MARKS = /[‎‏؜‪-‮⁦-⁩]/g;

export function stripBidi(text: string): string {
  return (text || '').replace(BIDI_MARKS, '');
}

export function wordCount(text: string): number {
  return ((text || '').trim().match(/\S+/g) ?? []).length;
}

export function splitSentences(text: string): string[] {
  return (text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 6);
}

// ─── Hashtags ────────────────────────────────────────────────────────────────────────────────

/** A usable hashtag or null — bidi marks, inner spaces and punctuation out, exactly one '#'. */
export function normalizeHashtag(raw: string): string | null {
  const body = stripBidi(String(raw || '')).trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
  if (body.length < 2 || body.length > 30 || /^\d+$/.test(body)) return null;
  return `#${body}`;
}

export const tagKey = (tag: string) => stripBidi(tag).toLowerCase().replace(/_/g, '');
export const isHebrewTag = (tag: string) => /[א-ת]/.test(tag);

function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const key = tagKey(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/** Three Israeli-niche Hebrew tags (topic anchors first) + two high-volume English tags. */
export function blendHashtags(candidates: string[], topic: NewsTopic): { hashtags: string[]; niche: string[]; broad: string[] } {
  const bankNiche = NICHE_TAGS[topic] ?? NICHE_TAGS.general;
  const bankBroad = BROAD_TAGS[topic] ?? BROAD_TAGS.general;
  const clean = candidates.map(normalizeHashtag).filter((t): t is string => t !== null);
  const niche = uniqueTags([...bankNiche.slice(0, 2), ...clean.filter(isHebrewTag), ...bankNiche.slice(2)]).slice(0, 3);
  const nicheKeys = new Set(niche.map(tagKey));
  const broad = uniqueTags([...clean.filter((t) => !isHebrewTag(t)), ...bankBroad])
    .filter((t) => !nicheKeys.has(tagKey(t)))
    .slice(0, MAX_HASHTAGS - niche.length);
  return { hashtags: [...niche, ...broad], niche, broad };
}

// ─── Comment-to-DM lead magnet ───────────────────────────────────────────────────────────────

/**
 * One ManyChat-safe trigger word, or `fallback`: a single word, no quotes / emoji / bidi marks (an
 * invisible RLM in the keyword makes it impossible to type), phone-length, and not a word that
 * turns up in ordinary comments — otherwise the automation DMs people who never asked.
 */
export function normalizeTriggerKeyword(raw: string, fallback: string): string {
  const word =
    stripBidi(String(raw || ''))
      .replace(/["'׳״`“”‘’]/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .trim()
      .split(/\s+/)[0] ?? '';
  if (word.length < 2 || word.length > 14 || COMMON_COMMENT_WORDS.has(word.toLowerCase())) return fallback;
  return word;
}

/** True when `raw` would be accepted as-is (used to warn in the settings field, not to block). */
export function isValidTriggerKeyword(raw: string): boolean {
  const k = raw.trim();
  return k.length > 0 && normalizeTriggerKeyword(k, '') === k;
}

/** Keyword list for the ManyChat trigger — the ה- form, Latin cases, the English equivalent. */
export function triggerVariants(keyword: string, english = ''): string[] {
  const candidates = [keyword];
  if (/^[א-ת]/.test(keyword)) {
    if (!keyword.startsWith('ה')) candidates.push(`ה${keyword}`);
  } else {
    candidates.push(keyword.toUpperCase(), keyword.toLowerCase());
  }
  const en = normalizeTriggerKeyword(english, '');
  if (en && /^[A-Za-z]/.test(en)) candidates.push(en.toUpperCase(), en.toLowerCase());
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of candidates) {
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out.slice(0, 6);
}

/** "את" only before a definite object: "את הצ׳קליסט המלא", but "צ׳קליסט מלא". */
function asObject(deliverable: string): string {
  const d = deliverable.trim();
  if (/^ה[א-ת]/.test(d)) return `את ${d}`;
  if (/^[A-Za-z]/.test(d)) return `את ה-${d}`;
  return d;
}

export function defaultDeliverable(kind: GrowthKind): string {
  return kind === 'reel' ? 'המדריך המלא' : kind === 'carousel' ? 'הצ׳קליסט המלא' : 'הסיכום המלא';
}

export function defaultTriggerKeyword(topic: NewsTopic): string {
  return TOPIC_KEYWORD[topic] ?? TOPIC_KEYWORD.general;
}

export function leadMagnetTemplate(keyword: string, deliverable: string, english = ''): LeadMagnet {
  return {
    keyword,
    triggerVariants: triggerVariants(keyword, english),
    deliverable,
    captionCta: `💬 תגיבו '${keyword}' ואשלח לכם בפרטי ${asObject(deliverable)}`,
    publicReplies: ['שלחתי לך בפרטי 📩', 'נשלח! בדקו את ההודעות 🙌', 'זה כבר מחכה לך בפרטי ✅'],
    dmMessage: `היי! 👋 תודה שהגבת. הנה ${deliverable} שהבטחתי. יש שאלה? פשוט עונים להודעה הזו.`,
    dmButtonLabel: 'לקבלת הקובץ',
  };
}

/**
 * The lead magnet as it should read under the operator's CURRENT trigger settings. The pack was
 * generated for whatever keyword/deliverable applied at the time; when the operator edits either
 * afterwards, the CTA and DM are rebuilt from the template on the spot (the model's wording names
 * the old values) while the model's public-reply variants and button label are kept. No API call.
 */
export function effectiveLeadMagnet(pack: GrowthPack | null, trigger: EngagementTrigger, kind: GrowthKind, topic: NewsTopic): LeadMagnet | null {
  if (!pack) return null;
  const base = pack.leadMagnet;
  const keyword = trigger.keyword.trim() ? normalizeTriggerKeyword(trigger.keyword, base.keyword) : base.keyword;
  const deliverable = trigger.deliverable.trim() || base.deliverable || defaultDeliverable(kind);
  if (keyword === base.keyword && deliverable === base.deliverable) return base;
  const english = base.triggerVariants.find((v) => /^[A-Za-z]/.test(v) && v.toLowerCase() !== keyword.toLowerCase()) ?? '';
  const t = leadMagnetTemplate(keyword || defaultTriggerKeyword(topic), deliverable, english);
  return { ...t, publicReplies: base.publicReplies.length ? base.publicReplies : t.publicReplies, dmButtonLabel: base.dmButtonLabel || t.dmButtonLabel };
}

const SITE_HOST = /(^|\.)mrdaniel\.co\.il$/i;
const GUIDE_PATH = /^\/(?:g|download)\/([a-z0-9-]{2,64})\/?$/i;

/** The guide slug / guideId a site guide link points at, or '' for any other link. */
export function guideIdFromLink(link: string): string {
  try {
    const url = new URL(link.trim());
    return SITE_HOST.test(url.hostname) ? (url.pathname.match(GUIDE_PATH)?.[1] ?? '').toLowerCase() : '';
  } catch {
    return '';
  }
}

/**
 * Tags a site guide link with the ManyChat campaign, so the landing page's `guide_download` event
 * records which keyword sent the visitor. Any other link, or one already tagged, passes through.
 */
export function withDmTracking(link: string, keyword: string): string {
  const raw = link.trim();
  if (!guideIdFromLink(raw)) return raw;
  const url = new URL(raw);
  if (url.searchParams.has('utm_source')) return raw;
  url.searchParams.set('utm_source', 'manychat');
  url.searchParams.set('utm_medium', 'dm');
  if (keyword) url.searchParams.set('kw', keyword);
  return url.toString();
}

/** Plain-text ManyChat setup sheet for this post — paste-ready for a Comment-to-DM flow. */
export function manychatSetupText(lm: LeadMagnet, link: string): string {
  const guideId = guideIdFromLink(link);
  return [
    'הגדרת ManyChat — Comment-to-DM לפוסט הזה',
    '',
    'טריגר: Instagram › Comments › "User comments on your Post or Reel" › בחרו את הפוסט הזה',
    `מילות מפתח (Contains): ${lm.triggerVariants.join(', ')}`,
    '',
    'תשובה פומבית לתגובה (Randomize — נוסח אחר בכל פעם):',
    ...lm.publicReplies.map((r) => `• ${r}`),
    '',
    'הודעת DM (Private Reply):',
    lm.dmMessage,
    `כפתור URL (Open website): ${lm.dmButtonLabel} → ${withDmTracking(link.trim() || DEFAULT_DM_LINK, lm.keyword)}`,
    '',
    'שמירת הליד (אופציונלי) — Action › External Request:',
    `POST ${SITE_ORIGIN}/api/leads`,
    'Header: x-manychat-secret = הערך של MANYCHAT_WEBHOOK_SECRET',
    `Body (JSON): {"action":"manychat-lead","subscriberId":"<Contact Id>","igUsername":"<Instagram Username>","name":"<Full Name>","email":"<Email>","phone":"<Phone>","keyword":"${lm.keyword}","guideId":"${guideId || '<slug>'}"}`,
    'את הערכים בסוגריים המשולשים משבצים דרך "+ Add Field" של ManyChat.',
    '',
    `CTA בכיתוב: ${lm.captionCta}`,
  ].join('\n');
}

// ─── SEO keywords + caption composition ──────────────────────────────────────────────────────

/** Hebrew search phrases: no '#', quotes or bidi marks, 2–5 words, topped up to 4, capped at 6. */
export function normalizeSeoKeywords(raw: unknown, topic: NewsTopic): string[] {
  const bank = SEO_KEYWORD_BANK[topic] ?? SEO_KEYWORD_BANK.general;
  const fromInput = (Array.isArray(raw) ? raw : [])
    .map((k) => stripBidi(String(k ?? '')).replace(/^#+/, '').replace(/["״“”]/g, '').replace(/\s+/g, ' ').trim())
    .filter((k) => k.length >= 2 && k.length <= 40 && k.split(' ').length <= 5);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of [...fromInput, ...bank]) {
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
    if (out.length >= 6) break;
  }
  return out;
}

/**
 * U+2800 BRAILLE PATTERN BLANK. It renders as nothing, but unlike an empty line Instagram does not
 * collapse a line that holds it — two of them reliably push the keyword line below the "…עוד" fold.
 * The line itself stays ordinary visible text (no zero-width or hidden-text tricks): hidden text is
 * a black-hat pattern, and characters Instagram cannot read would not be indexed anyway.
 */
export const SEO_SPACER = '⠀';

/** One natural-language keyword line for Instagram search — a sentence, not a stuffed list, so it
 *  carries the four strongest phrases even when the pack holds six. */
export function seoLine(keywords: string[]): string {
  const k = keywords.map((w) => stripBidi(w).trim()).filter(Boolean).slice(0, 4);
  if (k.length === 0) return '';
  const last = k[k.length - 1];
  const joined = k.length === 1 ? last : `${k.slice(0, -1).join(', ')} ${/^[A-Za-z0-9]/.test(last) ? `ו-${last}` : `ו${last}`}`;
  return `🔎 עוד על ${joined} — ב-mrdaniel.co.il`;
}

const HASHTAG_LINE = /^\s*(?:#[^\s#]+\s*)+$/u;

export function isHashtagLine(line: string): boolean {
  return HASHTAG_LINE.test(stripBidi(line));
}

/**
 * The publish-ready caption: the host's base caption, minus any tag block it already carried,
 * plus the lead-magnet CTA (when the Engagement Trigger is on), the blended hashtag set, the
 * mandatory promo footer kept last among the visible blocks, and the SEO keyword line below the
 * fold. Idempotent — composing an already-composed caption does not stack a second copy of anything.
 */
export function composeGrowthCaption(base: string, pack: GrowthPack | null, leadMagnet: LeadMagnet | null, includeLeadMagnet: boolean): string {
  const clean = (base || '').replace(/\r/g, '').trim();
  if (!pack) return clean;

  const knownCta = leadMagnet?.captionCta ? stripBidi(leadMagnet.captionCta) : '';
  let lines = clean.split('\n').filter((l) => {
    const t = stripBidi(l).trim();
    if (isHashtagLine(l) || t === SEO_SPACER || t.startsWith('🔎')) return false;
    if (knownCta && t === knownCta) return false;
    return true;
  });
  // A keyword CTA makes the composer's stock engagement question redundant — one clear ask
  // converts better than two competing ones.
  if (includeLeadMagnet) lines = lines.filter((l) => !GENERIC_ENGAGEMENT_LINES.includes(l.trim()));

  let body = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  let footer = '';
  const footerAt = body.lastIndexOf(SITE_PROMO_FOOTER);
  if (footerAt !== -1) {
    footer = SITE_PROMO_FOOTER;
    body = `${body.slice(0, footerAt)}${body.slice(footerAt + SITE_PROMO_FOOTER.length)}`.replace(/\n{3,}/g, '\n\n').trim();
  }

  const blocks = [body];
  if (includeLeadMagnet && leadMagnet?.captionCta) blocks.push(leadMagnet.captionCta);
  if (pack.hashtags.length) blocks.push(pack.hashtags.join(' '));
  if (footer) blocks.push(footer);

  const seo = seoLine(pack.seoKeywords);
  return `${blocks.filter(Boolean).join('\n\n')}${seo ? `\n${SEO_SPACER}\n${SEO_SPACER}\n${seo}` : ''}`;
}

// ─── Hook options ────────────────────────────────────────────────────────────────────────────

const HOOK_PATTERNS: readonly HookPattern[] = ['number', 'contrarian', 'risk', 'result', 'question', 'myth'];

export const HOOK_VISUAL_CUE: Record<HookPattern, string> = {
  number: 'המספר ענק במרכז המסך, זום-אין חד בשנייה הראשונה',
  contrarian: 'קו אדום מוחק את ההנחה הנפוצה על המסך',
  risk: 'הבהוב התראה אדומה או מסך שגיאה בפריים הראשון',
  result: 'מסך מפוצל — התוצאה קודם, ה"לפני" אחר כך',
  question: 'השאלה בטקסט ענק, קאט מהיר ישר למצלמה',
  myth: 'המילה "מיתוס" נחתמת על המסך ונמחקת',
};

const CONTRARIAN = /רוב ה|בפועל|כולם |אף אחד|במקום ל|הפסיקו|תפסיקו|אל ת|לא מה ש|הסוד|טעות נפוצה/;
const RISK = /סיכון|נפרץ|פריצ|דליפ|חשופ|חשוף|מסוכן|אזהרה|להפסיד|מפסידים|טעות|🚨|⚠/;
const CLICHE = /בעולם של היום|בעידן ה|היום נדבר|שלום לכולם|היי חברים|חדשות טובות|עדכון חדש|כתבה חדשה|מעניין לדעת|בואו נדבר/;
/** Second person with an optional Hebrew prefix letter — JS `\b` is ASCII-only, so boundaries are spelled out. */
const SECOND_PERSON = /(?:^|[\s,.:;!?"'׳״(–—-])[ושהבלכמ]?(?:אתם|אתן|אתה|לכם|לכן|שלכם|אצלכם|אתכם|עליכם|שלך|לך|אצלך|אותך)(?=$|[\s,.:;!?"'׳״)–—-])/;

export function inferHookPattern(line: string): HookPattern {
  const t = stripBidi(line);
  if (/\d/.test(t)) return 'number';
  if (/\?\s*$/.test(t)) return 'question';
  if (/מיתוס|לא נכון|שקר/.test(t)) return 'myth';
  if (RISK.test(t)) return 'risk';
  if (CONTRARIAN.test(t)) return 'contrarian';
  return 'result';
}

/** Coerce whatever arrived (model JSON, a persisted payload) into clean HookOption[] — never throws. */
export function normalizeHookOptions(raw: unknown, max = 3): HookOption[] {
  if (!Array.isArray(raw)) return [];
  const out: HookOption[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const rec = (item && typeof item === 'object' ? item : { line: item }) as Record<string, unknown>;
    const line = String(rec.line ?? rec.hook ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (line.length < 4) continue;
    const key = stripBidi(line).replace(/[^\p{L}\p{N}]/gu, '');
    if (seen.has(key)) continue;
    seen.add(key);
    const p = String(rec.pattern ?? '').toLowerCase() as HookPattern;
    const pattern = HOOK_PATTERNS.includes(p) ? p : inferHookPattern(line);
    out.push({ line, visual: String(rec.visual ?? '').trim().slice(0, 160) || HOOK_VISUAL_CUE[pattern], pattern });
    if (out.length >= max) break;
  }
  return out;
}

export interface HookRating {
  score: number;
  positives: string[];
  gaps: string[];
}

/**
 * Explainable hook-strength heuristic — the same rule-based idea as scoreLeadIntent in the engine:
 * instant, free, and able to say WHY a hook scored low, which a model score cannot do for free.
 * Rewards the opener shapes HOOK_RETENTION_RULES asks for; penalises the clichés it bans.
 */
export function rateHookLine(hook: string): HookRating {
  const t = stripBidi(hook || '').trim();
  const words = wordCount(t);
  if (!words) return { score: 0, positives: [], gaps: ['אין hook — השער/הפתיח ריק'] };

  let score = 45;
  const positives: string[] = [];
  const gaps: string[] = [];

  if (words >= 4 && words <= 12) {
    score += 12;
    positives.push(`אורך שנקרא בשנייה אחת (${words} מילים)`);
  } else if (words > 16) {
    score -= 14;
    gaps.push(`ארוך מדי ל-3 שניות (${words} מילים) — עד 10 מילים`);
  } else if (words > 12) {
    score -= 4;
    gaps.push(`קצת ארוך (${words} מילים) — קצרו ל-10`);
  } else {
    score -= 6;
    gaps.push('קצר מדי כדי לייצר סקרנות');
  }

  const hasNumber = /\d/.test(t);
  const hasContrarian = CONTRARIAN.test(t);
  const hasRisk = RISK.test(t);
  const hasQuestion = t.includes('?');
  if (hasNumber) {
    score += 12;
    positives.push('מספר קונקרטי — עוצר גלילה');
  }
  if (hasContrarian) {
    score += 12;
    positives.push('סתירה לאינטואיציה');
  }
  if (hasRisk) {
    score += 9;
    positives.push('סיכון או טעות קונקרטיים');
  }
  if (hasQuestion) {
    score += 8;
    positives.push('שאלה שפותחת פער סקרנות');
  }
  if (!hasNumber && !hasContrarian && !hasRisk && !hasQuestion) {
    gaps.push('אין תבנית hook מוכרת — מספר, סתירה, סיכון או שאלה');
  }
  if (SECOND_PERSON.test(t)) {
    score += 8;
    positives.push('פונה ישירות לקורא');
  } else {
    gaps.push('לא פונה לקורא ("אתם", "העסק שלכם")');
  }
  if (/[A-Za-z]{2,}/.test(t)) {
    score += 5;
    positives.push('מונח או מוצר ספציפי');
  }
  if (CLICHE.test(t)) {
    score -= 20;
    gaps.push('פתיח קלישאתי — נחסם ע"י כללי הכתיבה');
  }

  return { score: Math.max(0, Math.min(100, score)), positives, gaps };
}

/** First ≤`max` words of a sentence, cut at a comma/dash when one lands inside the window. */
function tightenLine(sentence: string, max = 12): string {
  const s = sentence.replace(/\s+/g, ' ').trim();
  if (wordCount(s) <= max) return s.replace(/[.…]+$/u, '');
  const words = s.split(' ');
  const head = words.slice(0, max).join(' ');
  const clause = head.match(/^(.{12,}?)[,–—:](?=\s)/u);
  return (clause ? clause[1] : '').trim();
}

/**
 * Offline hook options: the content's OWN strongest sentences, ranked by rateHookLine. Grounded by
 * construction — nothing is invented — so it can return fewer than three when the content has no
 * hook-shaped sentence. The one framed variant ("… — מה זה אומר על העסק שלכם?") wraps the title
 * in a question without adding a claim.
 */
export function buildHookOptionsLocal(content: GrowthContent): HookOption[] {
  const current = stripBidi(content.hook).replace(/[^\p{L}\p{N}]/gu, '');
  const pool = [...content.units.flatMap(splitSentences), ...splitSentences(content.caption)]
    .map((s) => tightenLine(s))
    .filter((s) => wordCount(s) >= 4 && wordCount(s) <= 12);

  const seen = new Set<string>([current]);
  const candidates = pool
    .map((line) => ({ line, score: rateHookLine(line).score, pattern: inferHookPattern(line) }))
    .sort((a, b) => b.score - a.score)
    .filter(({ line }) => {
      const key = stripBidi(line).replace(/[^\p{L}\p{N}]/gu, '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  // Three variations on one shape are really one option — take the best of each pattern first,
  // then fill the remaining slots by score.
  const picked: typeof candidates = [];
  const patterns = new Set<HookPattern>();
  for (const c of candidates) {
    if (picked.length < 3 && !patterns.has(c.pattern)) {
      picked.push(c);
      patterns.add(c.pattern);
    }
  }
  for (const c of candidates) if (picked.length < 3 && !picked.includes(c)) picked.push(c);
  const ranked = picked.map(({ line }) => line);

  const titleCore = tightenLine(content.title || content.hook, 9);
  if (ranked.length < 3 && titleCore) ranked.push(`${titleCore.replace(/[.?!]+$/u, '')} — מה זה אומר על העסק שלכם?`);

  return ranked.slice(0, 3).map((line) => {
    const pattern = inferHookPattern(line);
    return { line, visual: HOOK_VISUAL_CUE[pattern], pattern };
  });
}

// ─── Cheat-sheet (save-worthy summary unit) ──────────────────────────────────────────────────

const ACTIONABLE = /(?:^|\s)[ו]?(?:בדקו|הגדירו|הפעילו|חברו|שמרו|העתיקו|התחילו|צרו|השתמשו|הוסיפו|עדכנו|הגבילו|גבו|הריצו|נסו|מפו|הטמיעו|כבו|ודאו|הקפידו|חשוב|כדאי|מומלץ|צריך)/;

/**
 * Offline cheat-sheet: the content's own actionable / numeric sentences, numbered inside ONE
 * paragraph (the story deck's content slides are paragraph-only by a hard layout rule). Kept to
 * ~70 words, the top of the deck's density band. Returns null when there are fewer than two usable
 * sentences — a one-item "checklist" is worse than no slide.
 */
export function buildCheatSheetLocal(content: GrowthContent): { slideText: string; shortLabel: string } | null {
  const sentences = content.units
    .flatMap(splitSentences)
    .map((s) => s.replace(/[.!?…]+$/u, '').trim())
    .filter((s) => wordCount(s) >= 5 && wordCount(s) <= 24);
  if (sentences.length < 2) return null;

  const preferred = sentences.filter((s) => ACTIONABLE.test(s) || /\d/.test(s));
  const order = [...preferred, ...sentences.filter((s) => !preferred.includes(s))];
  const picked: string[] = [];
  let words = 3;
  for (const s of order) {
    if (picked.length >= 4) break;
    if (picked.length >= 2 && words + wordCount(s) > 72) break;
    picked.push(s);
    words += wordCount(s) + 1;
  }
  const inDeckOrder = sentences.filter((s) => picked.includes(s));
  return {
    slideText: `שמרו את זה: ${inDeckOrder.map((s, i) => `${i + 1}) ${s}`).join(' ')}.`,
    shortLabel: `צ׳קליסט לשמירה: ${inDeckOrder.length} נקודות`,
  };
}

// ─── Growth pack (offline) ───────────────────────────────────────────────────────────────────

/** Capitalised Latin product / tech terms in the title ("OpenAI", "Zero-Trust") — content-specific
 *  tags. Four letters minimum: bare acronyms like "API" or "AI" make generic, low-signal tags. */
function latinTerms(text: string): string[] {
  return (stripBidi(text).match(/\b[A-Z][A-Za-z0-9-]{3,20}\b/g) ?? []).filter((t) => !/^(The|And|For|With|From)$/.test(t)).slice(0, 3);
}

export function buildGrowthPackLocal(content: GrowthContent, trigger: EngagementTrigger, fallbackReason: string): GrowthPack {
  const keyword = normalizeTriggerKeyword(trigger.keyword, defaultTriggerKeyword(content.topic));
  const deliverable = trigger.deliverable.trim() || defaultDeliverable(content.kind);
  const terms = latinTerms(`${content.title} ${content.hook}`);
  const blended = blendHashtags(terms.map((t) => `#${t}`), content.topic);
  return {
    leadMagnet: leadMagnetTemplate(keyword, deliverable),
    hashtags: blended.hashtags,
    nicheHashtags: blended.niche,
    broadHashtags: blended.broad,
    seoKeywords: normalizeSeoKeywords(terms, content.topic),
    synthesized: false,
    fallbackReason,
    createdAt: Date.now(),
  };
}

// ─── Content adapters ────────────────────────────────────────────────────────────────────────

/** A rendered story/carousel deck → the shape the Growth panel scores. */
export function deckToGrowthContent(payload: StoryPayload, caption?: string): GrowthContent {
  const slides = Array.isArray(payload?.slides) ? payload.slides.filter(Boolean) : [];
  const cover = slides.find((s) => s.kind === 'cover');
  const cta = slides.find((s) => s.kind === 'cta');
  return {
    kind: 'carousel',
    contentKey: `deck:${payload.deckId || payload.newsId || payload.newsTitle}`,
    topic: payload.topic || 'general',
    title: payload.newsTitle || cover?.headline || '',
    hook: (cover?.headline || '').trim(),
    hookOptions: normalizeHookOptions(payload.hookOptions),
    units: slides
      .filter((s) => s.kind !== 'cover' && s.kind !== 'cta')
      .map((s) => (s.narrativeText || s.body || '').trim())
      .filter(Boolean),
    caption: (caption || deckToCaption(payload)).trim(),
    cta: (cta?.narrativeText || cta?.body || '').trim(),
    unitCount: slides.length,
  };
}

/** A reel script → the shape the Growth panel scores. The caption is a draft built from the script. */
export function reelToGrowthContent(reel: ReelScript, meta: { key: string; title: string; topic: NewsTopic }): GrowthContent {
  const scenes = Array.isArray(reel?.scenes) ? reel.scenes : [];
  const caption = [reel.hook, scenes.slice(0, 3).map((s) => s.voiceover).join(' '), reel.cta].filter(Boolean).join('\n\n');
  return {
    kind: 'reel',
    contentKey: `reel:${meta.key}`,
    topic: meta.topic || 'general',
    title: meta.title,
    hook: (reel.hook || '').trim(),
    hookOptions: normalizeHookOptions(reel.hookOptions),
    units: scenes.map((s) => s.voiceover).filter(Boolean),
    onScreen: scenes.map((s) => s.onScreenText),
    caption,
    cta: reel.cta || '',
    unitCount: scenes.length,
  };
}
