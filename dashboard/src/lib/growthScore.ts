import type {
  DimensionScore,
  GrowthContent,
  GrowthDimension,
  GrowthLevel,
  GrowthPack,
  GrowthRecommendation,
  GrowthReport,
  LeadMagnet,
} from './igGrowthTypes';
import {
  CORE_IL_TAGS,
  ENGAGEMENT_BAIT,
  SEO_KEYWORD_BANK,
  SEO_SPACER,
  isHebrewTag,
  normalizeTriggerKeyword,
  rateHookLine,
  stripBidi,
  tagKey,
  wordCount,
} from './growthPlaybook';
import { GENERIC_ENGAGEMENT_LINES } from './newsAgentTypes';

/**
 * Organic Growth Score — a deterministic, explainable read of how a carousel / reel / caption will
 * fare against what Instagram rewards: the first three seconds, saves, comments that open a DM,
 * and search. Rule-based on purpose, like scoreLeadIntent in the engine: it re-runs on every edit,
 * so it has to be instant and free, and every point it gives or takes comes with a sentence the
 * operator can act on. The AI is only involved when the operator presses a refine button.
 *
 * The weights favour the two signals that decide distribution (hook → watch/swipe-through, save)
 * over the two that decide conversion and discovery (comment trigger, SEO).
 */

const WEIGHTS: Record<GrowthDimension, number> = { hook: 0.35, save: 0.3, comment: 0.2, seo: 0.15 };

export function levelFor(score: number): GrowthLevel {
  return score >= 75 ? 'strong' : score >= 50 ? 'ok' : 'weak';
}

function dimension(id: GrowthDimension, raw: number, positives: string[], gaps: string[]): DimensionScore {
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { id, score, level: levelFor(score), positives, gaps };
}

// ─── Hook ────────────────────────────────────────────────────────────────────────────────────

function scoreHook(content: GrowthContent): DimensionScore {
  const rating = rateHookLine(content.hook);
  return dimension('hook', rating.score, rating.positives, rating.gaps);
}

// ─── Save-ability ────────────────────────────────────────────────────────────────────────────

const ACTION_VERB =
  /(?:^|[\s,.:;("'׳״])[ו]?(?:בדקו|הגדירו|הפעילו|חברו|שמרו|העתיקו|התחילו|צרו|השתמשו|הוסיפו|עדכנו|הגבילו|גבו|הריצו|נסו|מפו|הטמיעו|כבו|החליפו|סגרו|אפשרו|הקפידו|ודאו|תעדו)(?=$|[\s,.:;!?)"'׳״])/g;
const ENUMERATION = /(?:^|\s)\d\)|(?:^|\s)\d\.\s|שלב\s*\d|ראשית|שנית|לבסוף|בשלב הבא/;
const CHEAT_SHEET = /צ[׳']?יט[ -]?שיט|צ[׳']?קליסט|שמרו את זה|לשמירה|תקציר מהיר|רשימת בדיקות/;
const PROMPT_OR_CODE = /פרומפט|prompt|```|=>|\bnpm\b|\bpip\b/i;
const SAVE_CTA = /שמרו|לשמור|שמירה/;
const SHARE_TRIGGER = /שלחו (?:את זה )?ל|שתפו עם|שלחו למי/;

function scoreSave(content: GrowthContent, caption: string): DimensionScore {
  const positives: string[] = [];
  const gaps: string[] = [];
  const units = content.units.map(stripBidi);
  const text = units.join('\n');
  const closing = `${stripBidi(content.cta)}\n${stripBidi(caption)}`;
  let score = 30;

  const verbs = (text.match(ACTION_VERB) ?? []).length;
  if (verbs >= 3) {
    score += 20;
    positives.push(`${verbs} פעלי פעולה — תוכן שאפשר ליישם`);
  } else if (verbs > 0) {
    score += 10;
    positives.push('יש צעד מעשי אחד לפחות');
  } else {
    gaps.push('אין צעדים לביצוע — התוכן מדווח, לא מלמד');
  }

  if (ENUMERATION.test(text)) {
    score += 12;
    positives.push('מבנה צעד-אחר-צעד');
  }

  if (units.some((u) => CHEAT_SHEET.test(u))) {
    score += 18;
    positives.push(content.kind === 'reel' ? 'יש סצנת סיכום לשמירה' : 'יש שקופית צ׳יט-שיט לשמירה');
  } else if (content.kind !== 'post') {
    gaps.push(content.kind === 'reel' ? 'אין סצנת סיכום שכדאי לשמור' : 'אין שקופית לשמירה (צ׳קליסט / תקציר צעדים)');
  }

  if (PROMPT_OR_CODE.test(text)) {
    score += 8;
    positives.push('פרומפט או קוד מוכן להעתקה');
  }

  if (SAVE_CTA.test(closing)) {
    score += 8;
    positives.push('קריאה מפורשת לשמור');
  } else {
    gaps.push('אין קריאה לשמור את הפוסט');
  }

  if (SHARE_TRIGGER.test(`${text}\n${closing}`)) {
    score += 6;
    positives.push('טריגר שליחה ב-DM');
  }

  if (content.kind === 'carousel' && units.length) {
    const avg = Math.round(units.reduce((n, u) => n + wordCount(u), 0) / units.length);
    if (avg >= 25 && avg <= 70) {
      score += 8;
      positives.push(`צפיפות ערך טובה (${avg} מילים לשקופית)`);
    } else if (avg < 15) {
      score -= 10;
      gaps.push(`שקופיות דלילות (${avg} מילים בממוצע)`);
    }
    if (content.unitCount >= 5 && content.unitCount <= 10) {
      score += 6;
      positives.push(`${content.unitCount} שקופיות — אורך שנגלל עד הסוף`);
    } else if (content.unitCount <= 3) {
      score -= 6;
      gaps.push('מעט מדי שקופיות כדי להחזיק החלקה');
    }
  }

  if (content.kind === 'reel') {
    const seconds = content.unitCount * 5;
    if (content.unitCount >= 4 && content.unitCount <= 7) {
      score += 6;
      positives.push(`~${seconds} שניות — בטווח שנצפה עד הסוף`);
    }
    if (seconds > 45) {
      score -= 8;
      gaps.push(`~${seconds} שניות — ארוך מדי, קצרו ל-15–35`);
    }
  }

  return dimension('save', score, positives, gaps);
}

// ─── Comment trigger ─────────────────────────────────────────────────────────────────────────

function scoreComment(caption: string, leadMagnet: LeadMagnet | null, included: boolean): DimensionScore {
  const positives: string[] = [];
  const gaps: string[] = [];
  const text = stripBidi(caption);
  let score = 10;

  if (leadMagnet && included && text.includes(stripBidi(leadMagnet.captionCta))) {
    score += 55;
    positives.push(`CTA מגנט לידים עם מילת הטריגר '${leadMagnet.keyword}'`);
  } else if (leadMagnet) {
    gaps.push('ה-CTA מוכן אבל כבוי — הפעילו את טריגר המעורבות');
  } else {
    gaps.push('אין CTA מסוג Comment-to-DM');
  }

  if (leadMagnet) {
    if (normalizeTriggerKeyword(leadMagnet.keyword, '') === leadMagnet.keyword) {
      score += 10;
      positives.push('מילת טריגר ייחודית שתואמת ManyChat');
    }
    if (leadMagnet.dmMessage.trim().length > 20) {
      score += 5;
      positives.push('הודעת DM מוכנה');
    }
  }

  const closingLines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(-8);
  const generic = closingLines.some((l) => GENERIC_ENGAGEMENT_LINES.includes(l) || /^מה דעתכם\??$/.test(l));
  const openQuestion = closingLines.some((l) => /\?\s*$/.test(l) && !GENERIC_ENGAGEMENT_LINES.includes(l) && !/^מה דעתכם\??$/.test(l));
  if (openQuestion) {
    score += 15;
    positives.push('שאלה פתוחה שמזמינה שיחה');
  }
  if (generic) {
    score -= 5;
    gaps.push('שאלת סיום גנרית ("מה דעתכם?")');
  }
  if (ENGAGEMENT_BAIT.test(text)) {
    score -= 20;
    gaps.push('engagement bait — Meta מורידה לזה חשיפה');
  }

  return dimension('comment', score, positives, gaps);
}

// ─── Search / SEO ────────────────────────────────────────────────────────────────────────────

function scoreSeo(content: GrowthContent, caption: string, pack: GrowthPack | null): DimensionScore {
  const positives: string[] = [];
  const gaps: string[] = [];
  const text = stripBidi(caption);
  let score = 15;

  const tags = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  if (tags.length >= 3 && tags.length <= 5) {
    score += 20;
    positives.push(`${tags.length} האשטגים — בטווח המומלץ`);
  } else if (tags.length > 5) {
    score -= 10;
    gaps.push(`${tags.length} האשטגים — מעל 5 נקרא כספאם`);
  } else if (tags.length > 0) {
    score += 8;
    gaps.push('מעט האשטגים — 3 עד 5 זה הטווח');
  } else {
    gaps.push('אין האשטגים');
  }

  const tagKeys = new Set(tags.map(tagKey));
  const anchors = CORE_IL_TAGS.filter((t) => tagKeys.has(tagKey(t))).length;
  if (anchors >= 2) {
    score += 15;
    positives.push('עוגני נישה ישראליים (#בינהמלאכותית, #סייבר…)');
  } else if (anchors === 1) {
    score += 7;
  } else if (tags.length) {
    gaps.push('חסרים תגי נישה ישראליים');
  }
  if (tags.some((t) => !isHebrewTag(t))) {
    score += 8;
    positives.push('תג באנגלית בנפח חיפוש גבוה');
  }

  const keywords = pack?.seoKeywords?.length ? pack.seoKeywords : SEO_KEYWORD_BANK[content.topic] ?? SEO_KEYWORD_BANK.general;
  const hasSeoBlock = text.includes(SEO_SPACER) && text.split('\n').some((l) => l.trim().startsWith('🔎'));
  if (hasSeoBlock) {
    score += 20;
    positives.push('שורת מילות מפתח לחיפוש באינסטגרם');
  } else {
    gaps.push('אין שורת מילות מפתח לחיפוש');
  }

  const stems = keywords.flatMap((k) => stripBidi(k).split(/\s+/)).filter((w) => w.length >= 3);
  const opening = text.slice(0, 125);
  if (stems.some((w) => opening.includes(w))) {
    score += 12;
    positives.push('מילת מפתח ב-125 התווים הראשונים');
  } else {
    gaps.push('אין מילת מפתח בתחילת הכיתוב (125 התווים שנראים בפיד)');
  }

  if (content.kind === 'reel') {
    const firstScreen = stripBidi(`${content.hook} ${content.onScreen?.[0] ?? ''}`);
    if (stems.some((w) => firstScreen.includes(w))) {
      score += 8;
      positives.push('מילת מפתח בטקסט שעל המסך — נקלטת ב-OCR');
    }
  }

  return dimension('seo', score, positives, gaps);
}

// ─── Report ──────────────────────────────────────────────────────────────────────────────────

function recommendations(content: GrowthContent, dims: DimensionScore[], leadMagnet: LeadMagnet | null, included: boolean): GrowthRecommendation[] {
  const byId = Object.fromEntries(dims.map((d) => [d.id, d])) as Record<GrowthDimension, DimensionScore>;
  const out: GrowthRecommendation[] = [];

  if (byId.hook.score < 75) {
    out.push({ id: 'hook', dimension: 'hook', action: 'punchier-hook', text: `${byId.hook.gaps[0] ?? 'ה-hook לא מספיק חד'} — צרו 3 חלופות חדות יותר.` });
  }
  if (byId.save.score < 70 && content.kind !== 'post') {
    out.push({
      id: 'save',
      dimension: 'save',
      action: 'cheat-sheet',
      text: content.kind === 'reel' ? 'הוסיפו סצנת סיכום לשמירה — צעדים ממוספרים שהצופה ירצה לחזור אליהם.' : 'הוסיפו שקופית צ׳יט-שיט — תקציר צעדים שהקורא ירצה לשמור.',
    });
  }
  if (byId.comment.score < 60) {
    out.push({
      id: 'comment',
      dimension: 'comment',
      action: 'lead-magnet',
      text: leadMagnet && !included ? 'הפעילו את טריגר המעורבות כדי להכניס את ה-CTA לכיתוב (אחרי שזרימת ManyChat מוכנה).' : 'צרו CTA מגנט לידים — מילת טריגר אחת שפותחת DM עם משאב אמיתי.',
    });
  }
  if (byId.seo.score < 60) {
    out.push({ id: 'seo', dimension: 'seo', action: 'seo-pack', text: 'הפיקו חבילת האשטגים ו-SEO — 3 תגי נישה + 2 תגי נפח ושורת מילות מפתח לחיפוש.' });
  }

  const hookWords = wordCount(stripBidi(content.hook));
  if (hookWords > 12) out.push({ id: 'hook-length', dimension: 'hook', text: `קצרו את ה-hook ל-10 מילים לכל היותר (כרגע ${hookWords}).` });
  if (content.kind === 'reel' && content.unitCount * 5 > 45) out.push({ id: 'reel-length', dimension: 'save', text: 'קצרו את הריל ל-15–35 שניות — פחות סצנות, אותה הבטחה.' });

  const rank: Record<GrowthDimension, number> = { hook: byId.hook.score, save: byId.save.score, comment: byId.comment.score, seo: byId.seo.score };
  return out.sort((a, b) => rank[a.dimension] - rank[b.dimension]);
}

export function scoreGrowth(
  content: GrowthContent,
  ctx: { pack: GrowthPack | null; leadMagnet: LeadMagnet | null; includeLeadMagnet: boolean; caption: string }
): GrowthReport {
  const dims = [
    scoreHook(content),
    scoreSave(content, ctx.caption),
    scoreComment(ctx.caption, ctx.leadMagnet, ctx.includeLeadMagnet),
    scoreSeo(content, ctx.caption, ctx.pack),
  ];
  const overall = Math.round(dims.reduce((n, d) => n + d.score * WEIGHTS[d.id], 0));
  return { overall, level: levelFor(overall), dimensions: dims, recommendations: recommendations(content, dims, ctx.leadMagnet, ctx.includeLeadMagnet) };
}
