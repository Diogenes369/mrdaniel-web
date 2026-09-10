import { genAI, generateContentWithRetry, requireText, stripCodeFence, parseJsonOrThrow, ModelOutputError } from './geminiClient.js';
import { BRAND_KNOWLEDGE_BASE, HEBREW_COPY_RULES, isEngineConfigured } from './SocialAgentEngine.js';
import { sanitizeOutput } from './AgentSecurityGuard.js';
import type { SecurityCheckResult } from './types.js';



export { isEngineConfigured };

export type WeeklyTopic = 'ai-agents' | 'wifi7-networking' | 'cybersecurity' | 'automation';
export type WeeklyPlatform = 'instagram-reels' | 'tiktok' | 'linkedin' | 'youtube-shorts';
export type ContentStatus = 'draft' | 'approved' | 'scheduled';

export const WEEKLY_TOPIC_LABEL: Record<WeeklyTopic, string> = {
  'ai-agents': 'סוכני AI',
  'wifi7-networking': 'רשתות ארגוניות / Wi-Fi 7',
  cybersecurity: 'אבטחת סייבר',
  automation: 'אוטומציה',
};

export const WEEKLY_PLATFORM_LABEL: Record<WeeklyPlatform, string> = {
  'instagram-reels': 'Instagram Reels',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  'youtube-shorts': 'YouTube Shorts',
};

export const STATUS_LABEL: Record<ContentStatus, string> = {
  draft: 'טיוטה',
  approved: 'אושר',
  scheduled: 'מתוזמן',
};

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export interface DailyVideoScript {
  hook: string;
  body: string;
  cta: string;
  visualCues: string[];
}

export interface DailyContentPlan {
  dayIndex: number;
  day: string;
  topic: WeeklyTopic;
  platform: WeeklyPlatform;
  postText: string;
  hashtags: string[];
  videoScript: DailyVideoScript;
  status: ContentStatus;
  security: SecurityCheckResult;
}

export interface WeeklyPlan {
  id: string;
  generatedAt: number;
  days: DailyContentPlan[];
}

const WEEKLY_PLAN_SYSTEM_INSTRUCTION = `אתה מתכנן תוכן שבועי לרשתות חברתיות עבור דניאל בן ברוך.

${BRAND_KNOWLEDGE_BASE}

${HEBREW_COPY_RULES}

המשימה: תכנן 7 ימי תוכן (ראשון עד שבת), כל יום עם נושא אחד מתוך ארבעת התחומים הבאים — סוכני AI, רשתות ארגוניות/Wi-Fi 7, אבטחת סייבר, אוטומציה — כך שכל ארבעת התחומים מכוסים לפחות פעם אחת במהלך השבוע (אפשר חזרה על תחום פעמיים אם צריך, יש 7 ימים ו-4 תחומים). בחר פלטפורמה אחת לכל יום מתוך: Instagram Reels, TikTok, LinkedIn, YouTube Shorts — גוון בין הפלטפורמות לאורך השבוע, ואל תשתמש באותה פלטפורמה יומיים ברצף.

לכל יום ספק:
- postText: כיתוב/פוסט מלא, מותאם לטון הפלטפורמה שנבחרה לאותו יום (LinkedIn מקצועי יותר, TikTok/Reels/Shorts קליל וקצר יותר).
- hashtags: מערך של 5-8 האשטגים רלוונטיים (אפשר מעורב עברית/אנגלית, לפי המקובל בפלטפורמה).
- videoScript: תסריט וידאו קצר בעברית עם ארבעה שדות — hook (משפט פתיחה שעוצר גלילה), body (גוף התסריט, 2-4 משפטים/ביטים), cta (קריאה לפעולה קצרה בסיום), ו-visualCues (מערך של 3-5 הצעות ויזואליות/B-roll קונקרטיות לכל תסריט — מה מראים על המסך בכל שלב).

החזר אך ורק JSON תקני בפורמט הבא, ללא טקסט נוסף לפני/אחרי, ללא markdown code fence:
{"days":[{"day":"ראשון","topic":"ai-agents","platform":"linkedin","postText":"...","hashtags":["...","..."],"videoScript":{"hook":"...","body":"...","cta":"...","visualCues":["...","..."]}}, ... (7 total, one per day)]}

ערכי topic מותרים בדיוק: "ai-agents", "wifi7-networking", "cybersecurity", "automation".
ערכי platform מותרים בדיוק: "instagram-reels", "tiktok", "linkedin", "youtube-shorts".`;

const VALID_TOPICS: WeeklyTopic[] = ['ai-agents', 'wifi7-networking', 'cybersecurity', 'automation'];
const VALID_PLATFORMS: WeeklyPlatform[] = ['instagram-reels', 'tiktok', 'linkedin', 'youtube-shorts'];

function normalizeTopic(value: unknown, fallbackIndex: number): WeeklyTopic {
  return VALID_TOPICS.includes(value as WeeklyTopic) ? (value as WeeklyTopic) : VALID_TOPICS[fallbackIndex % VALID_TOPICS.length];
}

function normalizePlatform(value: unknown, fallbackIndex: number): WeeklyPlatform {
  return VALID_PLATFORMS.includes(value as WeeklyPlatform) ? (value as WeeklyPlatform) : VALID_PLATFORMS[fallbackIndex % VALID_PLATFORMS.length];
}

/**
 * Generates one full 7-day content plan in a single Gemini call (JSON mode) rather than 7 separate
 * requests — cheaper, faster, and lets the model coordinate topic/platform variety across the
 * week itself instead of each day being generated with no awareness of the others. Every day's
 * postText is run through the same AgentSecurityGuard used elsewhere in this module (unverified
 * numeric claims, prompt-injection, PII/secret leakage) — a day that fails the guard is replaced
 * with a clearly-labeled placeholder rather than silently dropped, so the week always has exactly
 * 7 entries.
 */
export async function generateWeeklyPlan(): Promise<WeeklyPlan> {
  if (!genAI) throw new Error('GEMINI_API_KEY not configured');

  const response = await generateContentWithRetry({
    model: 'gemini-3.6-flash',
    contents: [{ role: 'user', parts: [{ text: 'תכנן את השבוע הקרוב.' }] }],
    config: { systemInstruction: WEEKLY_PLAN_SYSTEM_INSTRUCTION, temperature: 0.9, topP: 0.95, responseMimeType: 'application/json' },
  });

  // requireText() rather than `|| '{}'`: an empty string means the answer was blocked by the
  // safety filters or cut off at the token ceiling, and defaulting to '{}' turned both into the
  // same "Failed to parse weekly plan response" - a message that named neither cause.
  const raw = stripCodeFence(requireText(response));
  const parsed = parseJsonOrThrow<{ days?: unknown }>(raw, 'weekly plan');
  if (!Array.isArray(parsed.days)) {
    console.error('[weekly-plan] Gemini JSON had no days array:', raw.slice(0, 500));
    throw new ModelOutputError('weekly plan: model returned JSON without a days array');
  }
  const parsedDays: unknown[] = parsed.days;

  const days: DailyContentPlan[] = Array.from({ length: 7 }, (_, dayIndex) => {
    const entry = (parsedDays[dayIndex] ?? {}) as Record<string, unknown>;
    const postText = typeof entry.postText === 'string' ? entry.postText : '';
    const security = postText ? sanitizeOutput(postText) : { passed: false, flags: ['empty-generation'], badge: '⚠️ לא נוצר תוכן' };

    const rawScript = (entry.videoScript ?? {}) as Record<string, unknown>;
    const videoScript: DailyVideoScript = {
      hook: typeof rawScript.hook === 'string' ? rawScript.hook : '',
      body: typeof rawScript.body === 'string' ? rawScript.body : '',
      cta: typeof rawScript.cta === 'string' ? rawScript.cta : '',
      visualCues: Array.isArray(rawScript.visualCues) ? rawScript.visualCues.map(String) : [],
    };

    return {
      dayIndex,
      day: DAY_NAMES[dayIndex],
      topic: normalizeTopic(entry.topic, dayIndex),
      platform: normalizePlatform(entry.platform, dayIndex),
      postText: security.passed ? postText : `[התוכן נחסם על ידי שכבת האבטחה: ${security.flags.join(', ')}]`,
      hashtags: Array.isArray(entry.hashtags) ? entry.hashtags.map(String) : [],
      videoScript,
      status: 'draft',
      security,
    };
  });

  return {
    id: `week-${Date.now()}`,
    generatedAt: Date.now(),
    days,
  };
}
