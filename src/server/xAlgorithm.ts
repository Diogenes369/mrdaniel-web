/**
 * X (Twitter) "For You" ranking — what the open-sourced code actually rewards, turned into rules a
 * generator can follow and a scorer can check.
 *
 * ## Source (read 2026-09-21, not folklore)
 *
 * github.com/xai-org/x-algorithm — the Grok-era rewrite of the For You feed. Numbers below are the
 * production defaults the repo's cron keeps in `home-mixer/params/param.rs`; the arithmetic is in
 * `home-mixer/scorers/ranking_scorer.rs`:
 *
 *     final score = Σ weight_i × P(viewer takes action_i)
 *
 * Phoenix (a transformer over the viewer's own engagement history) predicts each P. The weights
 * multiply PREDICTED PROBABILITIES, not raw counts — the repo says so explicitly (a report weighing
 * 468× a like does not mean one report cancels 468 likes). So the job is to write posts that make
 * the model predict replies, quotes and link-copies, not to "farm" any single count.
 *
 * ## What that means, lever by lever
 *
 * - Conversation is the currency. reply 5.0, quote 5.0 vs like 0.5 and repost 1.0. A reply is worth
 *   ten likes; a mutual-follow reply gets a +15 boost on top (the July 2026 bidirectional change).
 * - Sharing out is huge: share-via-copy-link 20.0, share-via-DM 5.0, share 2.0. "Save this / send it
 *   to the one person who needs it" content is the highest-leverage format there is.
 * - Follow-from-post 4.0 — a thread that ends on a clear reason to follow is scored for it.
 * - External links: there is NO hard-coded link penalty in the open code. The penalty is emergent:
 *   open-link is weighted 0.2 (vs reply 5), and a viewer who leaves the app neither dwells, replies
 *   nor quotes. Rule: never put the link in the hook post — put it in the last post / a reply.
 * - Media: photo-expand 0.05, video-open 0.07, and video-quality-view is currently 0.0 (with a 10s
 *   minimum duration gate). Media is not a direct multiplier; it earns its keep through dwell
 *   (0.05 + 0.004/s continuous) and by raising every other predicted P. Native images, not link
 *   cards — a card is a link.
 * - Negative signals dominate: report -234, mute -58.8, not-interested -43.2, block -31.2. One
 *   rage-bait post that gets muted costs more than a week of likes. Sharp, not hostile.
 * - Author diversity decay 0.5 (floor 0.25): your 2nd post in one viewer's session scores half, the
 *   3rd a quarter. Space top-level posts out; a thread is one conversation (DedupConversationFilter
 *   collapses branches), so threads beat bursts.
 * - Out-of-network discount 0.75: strangers see you only if the predicted score survives it — which
 *   is what a strong hook buys.
 * - Freshness: AgeFilter drops posts older than 48 hours from For You. Cold-start: authors under
 *   1,000 followers get their <48h posts lifted toward slots 15–16.
 * - Clustering: out-of-network retrieval is SimClusters + Phoenix embeddings of who engages with
 *   what. Staying on one topic (AI) keeps the account in one cluster, so the right strangers see it.
 *
 * Mirrored for the dashboard's offline scorer in dashboard/src/lib/xAlgorithm.ts — keep in sync.
 */

export const X_ALGORITHM_SOURCE = {
  repo: 'https://github.com/xai-org/x-algorithm',
  paramsFile: 'home-mixer/params/param.rs',
  readOn: '2026-09-21',
} as const;

/** Production defaults from param.rs, verbatim. */
export const X_RANKING_WEIGHTS = {
  favorite: 0.5,
  reply: 5.0,
  bidirectionalFollowReplyBoost: 15.0,
  retweet: 1.0,
  quote: 5.0,
  share: 2.0,
  shareViaDm: 5.0,
  shareViaCopyLink: 20.0,
  followAuthor: 4.0,
  click: 0.4,
  openLink: 0.2,
  photoExpand: 0.05,
  videoOpen: 0.07,
  videoQualityView: 0.0,
  dwell: 0.05,
  continuousDwellPerSecond: 0.004,
  notInterested: -43.2,
  blockAuthor: -31.2,
  muteAuthor: -58.8,
  report: -234.0,
  notDwelled: -0.02,
} as const;

export const X_RANKING_ADJUSTMENTS = {
  authorDiversityDecay: 0.5,
  authorDiversityFloor: 0.25,
  outOfNetworkFactor: 0.75,
  maxPostAgeHours: 48,
  coldStartFollowerCap: 1000,
  minVideoDurationMs: 10_000,
} as const;

/** Standard (non-Premium-long-post) limit; also what renders un-truncated in every client. */
export const X_POST_LIMIT = 280;
/** A URL always counts as 23 characters (t.co wrapping). */
const URL_WEIGHT = 23;
const URL_RE = /https?:\/\/\S+|(?:www\.)?[a-z0-9-]+\.(?:co\.il|com|ai|io|net|org)(?:\/\S*)?/gi;

/**
 * X's weighted character count (twitter-text v3): most scripts — Latin, Hebrew, Arabic — weigh 1,
 * CJK and emoji weigh 2, and every URL weighs 23 regardless of its length.
 */
export function xWeightedLength(text: string): number {
  let n = 0;
  const withoutUrls = text.replace(URL_RE, () => {
    n += URL_WEIGHT;
    return '';
  });
  for (const ch of withoutUrls) {
    const cp = ch.codePointAt(0) ?? 0;
    const heavy = (cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x2e80 && cp <= 0x9fff) || (cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xffef) || cp >= 0x1f000;
    n += heavy ? 2 : 1;
  }
  return n;
}

export function hasExternalLink(text: string): boolean {
  URL_RE.lastIndex = 0;
  return URL_RE.test(text);
}

export interface XThreadPost {
  text: string;
  /** Indexes into the carousel's rendered slides to attach natively (max 4 per post). */
  mediaSlides: number[];
}

export interface XThreadDraft {
  posts: XThreadPost[];
  /** How many native media items the operator will attach in total. */
  hasVideo?: boolean;
}

export interface XAlgorithmCheck {
  id: string;
  label: string;
  passed: boolean;
  /** The ranking lever this protects, with its weight — shown in the UI so the "why" is visible. */
  lever: string;
  /** Share of the 100-point score. */
  points: number;
  fix?: string;
}

export interface XAlgorithmReport {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  checks: XAlgorithmCheck[];
}

const W = X_RANKING_WEIGHTS;
const HASHTAG_RE = /(^|\s)#[\p{L}\p{N}_]+/gu;
const QUESTION_RE = /[?؟]\s*$/;
const SAVE_SHARE_RE = /שמרו|שמור|שלחו|תשלחו|תייגו מישהו|שתפו עם|save this|bookmark|send (?:this|it) to/i;
const FOLLOW_RE = /עקבו|follow/i;
const RAGE_RE = /מטומטמ|אידיוט|טיפש|סתום|shut up|idiot|stupid/i;
const GENERIC_HOOK_RE = /^(?:בעולם של היום|בעידן|היום נדבר|שרשור|thread|🧵\s*$|הנה|חשוב לציין)/i;

/**
 * Deterministic pre-flight for a thread. It does not predict reach — nothing outside X can — it
 * checks the draft against every lever above that the author controls, weighted by how much that
 * lever is worth in the real scorer.
 */
export function scoreXThread(draft: XThreadDraft): XAlgorithmReport {
  const posts = draft.posts.filter((p) => p.text.trim());
  const first = posts[0]?.text ?? '';
  const last = posts[posts.length - 1]?.text ?? '';
  const all = posts.map((p) => p.text).join('\n');
  const firstLine = first.split('\n')[0].trim();
  const media = posts.reduce((n, p) => n + p.mediaSlides.length, 0);
  const overLimit = posts.filter((p) => xWeightedLength(p.text) > X_POST_LIMIT).length;
  const hashtags = (all.match(HASHTAG_RE) || []).length;
  const linkPosts = posts.map((p, i) => (hasExternalLink(p.text) ? i : -1)).filter((i) => i >= 0);

  const checks: XAlgorithmCheck[] = [
    {
      id: 'hook-no-link',
      label: 'אין קישור חיצוני בפוסט הפתיחה',
      passed: !hasExternalLink(first),
      lever: `open-link ${W.openLink} מול reply ${W.reply}: מי שיוצא מהאפליקציה לא מגיב ולא נשאר`,
      points: 16,
      fix: 'העבירו את הקישור לפוסט האחרון בשרשור או לתגובה ראשונה.',
    },
    {
      id: 'hook-media',
      label: 'מדיה נייטיב מוצמדת לפוסט הפתיחה',
      passed: (posts[0]?.mediaSlides.length ?? 0) > 0,
      lever: `dwell ${W.dwell} + ${W.continuousDwellPerSecond}/שנייה, ו-photo-expand ${W.photoExpand}: תמונה מחזיקה את העין`,
      points: 14,
      fix: 'הצמידו עד 4 שקופיות מהקרוסלה כתמונות לפוסט הראשון — לא כרטיס קישור.',
    },
    {
      id: 'hook-specific',
      label: 'ההוק ספציפי וקצר (עד 200 תווים, לא פתיח גנרי)',
      passed: firstLine.length >= 20 && xWeightedLength(firstLine) <= 200 && !GENERIC_HOOK_RE.test(firstLine),
      lever: `מקדם out-of-network ${X_RANKING_ADJUSTMENTS.outOfNetworkFactor}: רק הוק חזק שורד את ההנחה מול זרים`,
      points: 14,
      fix: 'פתחו בעובדה הכי חזקה: מספר, שם מודל, או "מה שכולם חושבים X — בפועל Y".',
    },
    {
      id: 'reply-close',
      label: 'סיום בשאלה פתוחה שמזמינה תגובה',
      passed: QUESTION_RE.test(last.replace(HASHTAG_RE, '').replace(URL_RE, '').trim()) || /[?؟]/.test(last),
      lever: `reply ${W.reply} (ועוד +${W.bidirectionalFollowReplyBoost} מעוקבים הדדיים) — פי 10 מלייק`,
      points: 14,
      fix: 'סיימו בשאלה אחת קונקרטית שהקורא יכול לענות עליה מהניסיון שלו.',
    },
    {
      id: 'share-trigger',
      label: 'טריגר לשמירה או שליחה',
      passed: SAVE_SHARE_RE.test(all),
      lever: `share-via-copy-link ${W.shareViaCopyLink}, share-via-DM ${W.shareViaDm} — המנוף הכבד ביותר בנוסחה`,
      points: 12,
      fix: 'הוסיפו "שמרו את זה" או "שלחו למי שבונה סוכן השבוע" בפוסט האחרון.',
    },
    {
      id: 'follow-reason',
      label: 'סיבה ברורה לעקוב',
      passed: FOLLOW_RE.test(all),
      lever: `follow-author ${W.followAuthor}`,
      points: 6,
      fix: 'משפט אחד: "עוקבים = פירוק AI כל יום".',
    },
    {
      id: 'length',
      label: `כל פוסט עד ${X_POST_LIMIT} תווים`,
      passed: overLimit === 0,
      lever: 'פוסט שנחתך ב"הצג עוד" מאבד dwell אצל מי שלא לוחץ',
      points: 8,
      fix: `קצרו ${overLimit} פוסט(ים) או פצלו לשניים.`,
    },
    {
      id: 'thread-size',
      label: 'שרשור של 3–10 פוסטים',
      passed: posts.length >= 3 && posts.length <= 10,
      lever: 'שרשור הוא שיחה אחת (DedupConversationFilter) — עדיף על פרץ פוסטים שנחתך ב-decay',
      points: 6,
      fix: posts.length < 3 ? 'פרקו את הרעיון ל-3 פוסטים לפחות.' : 'קצרו ל-10 פוסטים לכל היותר.',
    },
    {
      id: 'hashtags',
      label: 'עד 2 האשטגים בכל השרשור',
      passed: hashtags <= 2,
      lever: 'האשטגים לא מופיעים בנוסחה; עודף שלהם נראה כספאם ומעלה not-interested (−43.2)',
      points: 5,
      fix: 'השאירו האשטג אחד או שניים לכל היותר.',
    },
    {
      id: 'no-rage',
      label: 'חד בלי להיות פוגעני',
      passed: !RAGE_RE.test(all),
      lever: `mute ${W.muteAuthor}, report ${W.report} — אות שלילי אחד מוחק שבוע של לייקים`,
      points: 5,
      fix: 'חדדו את הטענה, לא את העלבון.',
    },
  ];

  if (linkPosts.length > 1) {
    checks.push({
      id: 'single-link',
      label: 'קישור אחד בלבד בשרשור',
      passed: false,
      lever: 'כל קישור הוא יציאה מהאפליקציה',
      points: 0,
      fix: 'השאירו קישור אחד, בפוסט האחרון.',
    });
  }
  if (draft.hasVideo) {
    checks.push({
      id: 'video-10s',
      label: 'וידאו של 10 שניות לפחות',
      passed: true,
      lever: `וידאו קצר מ-${X_RANKING_ADJUSTMENTS.minVideoDurationMs / 1000} שניות לא נספר כצפייה איכותית`,
      points: 0,
    });
  }
  void media;

  const total = checks.reduce((n, c) => n + c.points, 0) || 1;
  const earned = checks.reduce((n, c) => n + (c.passed ? c.points : 0), 0);
  const score = Math.round((earned / total) * 100);
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';
  return { score, grade, checks };
}

/** The same rules, phrased for the model. Injected into the Grok system prompt. */
export const X_ALGORITHM_PROMPT_RULES = `חוקי האלגוריתם של X — מבוססים על הקוד הפתוח (xai-org/x-algorithm, ${X_ALGORITHM_SOURCE.readOn}). הדירוג הוא סכום של משקל × הסתברות חזויה לכל פעולה:
- תגובה ${W.reply} וציטוט ${W.quote} מול לייק ${W.favorite} וריפוסט ${W.retweet}. המטרה היא שיחה, לא לייקים.
- שליחה בהעתקת קישור ${W.shareViaCopyLink} ושליחה ב-DM ${W.shareViaDm}: תוכן שאנשים שומרים ושולחים הוא המנוף הכבד ביותר.
- מעקב מתוך פוסט ${W.followAuthor}: תנו סיבה ברורה לעקוב.
- קישור חיצוני לעולם לא בפוסט הפתיחה. פתיחת קישור שווה רק ${W.openLink}, ומי שיוצא מ-X לא מגיב. הקישור הולך לפוסט האחרון.
- פוסט הפתיחה נושא את השקופיות כתמונות נייטיב. הוא עומד לבד: אין "שרשור 🧵" ואין "בואו נדבר על".
- אותות שליליים שולטים: דיווח ${W.report}, השתקה ${W.muteAuthor}, "לא מעניין" ${W.notInterested}. חד ושנון — אף פעם לא פוגעני, לא מתלהם ולא clickbait שלא מקיים.
- כל פוסט עד ${X_POST_LIMIT} תווים. עד 2 האשטגים בכל השרשור.
- פוסט חי ב-For You רק 48 שעות, ופוסט שני של אותו כותב מקבל חצי ציון — שרשור אחד חזק עדיף על פרץ פוסטים.`;

/**
 * Builds a thread from a finished carousel deck: hook post carries slides 1–4 natively, value slides
 * become the middle posts (each with its own slide image), and the link lives only in the last post.
 * Used as the deterministic fallback when Grok is unavailable, and to back-fill media plans.
 */
export function threadFromDeck(
  deck: { role: string; headline: string; subhead: string; body: string; bullets: string[]; quote: string; stat: string }[],
  siteUrl = 'mrdaniel.co.il',
): XThreadPost[] {
  const clip = (s: string, max = X_POST_LIMIT) => {
    const t = s.replace(/\s+\n/g, '\n').trim();
    if (xWeightedLength(t) <= max) return t;
    const cut = t.slice(0, max - 1);
    const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'), cut.lastIndexOf('\n'));
    return (lastStop > max * 0.5 ? cut.slice(0, lastStop + 1) : cut.slice(0, cut.lastIndexOf(' '))).trim();
  };
  const hook = deck.find((s) => s.role === 'hook') ?? deck[0];
  const values = deck.filter((s) => s.role === 'value');
  const posts: XThreadPost[] = [];
  if (hook) {
    posts.push({ text: clip([hook.headline, hook.subhead].filter(Boolean).join('\n\n')), mediaSlides: [0, 1, 2, 3].filter((i) => i < deck.length) });
  }
  values.slice(0, 7).forEach((s) => {
    const idx = deck.indexOf(s);
    const body = s.stat ? `${s.stat} — ${s.body}` : s.body || s.quote || s.bullets.map((b) => `• ${b}`).join('\n');
    posts.push({ text: clip([s.headline, body].filter(Boolean).join('\n\n')), mediaSlides: idx >= 4 ? [idx] : [] });
  });
  posts.push({
    text: clip(`שמרו את השרשור ושלחו למי שבונה עם AI השבוע.\nעוקבים = פירוק AI כל יום.\nהמדריך המלא: ${siteUrl}\n\nאיזה חלק מזה הייתם מנסים ראשון?`),
    mediaSlides: [],
  });
  return posts;
}
