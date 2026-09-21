import { genAI, generateContentWithRetry, requireText, stripCodeFence, parseJsonOrThrow, ModelOutputError } from '../agent/geminiClient.js';
import { EXPERT_VOICE_RULES } from '../agent/expertVoice.js';

/**
 * AI email copywriter — Gemini generates a full, long-form, structured HTML email body (inner
 * fragments only; src/server/emailEngine.ts wraps it in the branded shell). Called from
 * api/agent-generate.ts via `action: 'email-generate'`.
 */



export function isCopywriterConfigured(): boolean {
  return Boolean(genAI);
}

export type EmailPreset = 'digest' | 'announcement' | 'insight' | '';

const PRESET_GUIDANCE: Record<Exclude<EmailPreset, ''>, string> = {
  digest:
    'סוג המייל: "עדכון AI חודשי" (Monthly AI Digest). מבנה עריכתי: פתיח קצר, 2-3 בלוקי נושא עם כותרת משנה וניתוח, רשימת מגמות AI (bullets), ותיבת callout אחת עם תובנה מרכזית. הגדר includeNews=true ו-includeServices=true.',
  announcement:
    'סוג המייל: "הכרזה על מוצר/שירות". מבנה: Hero עם משפט ערך חד, 3-4 יתרונות מרכזיים (bullets), תיבת callout עם snippet של מקרה לקוח/תוצאה מדידה, ו-CTA ראשי חזק ל"תיאום שיחת אפיון". הגדר includeServices=true, includeNews=false.',
  insight:
    'סוג המייל: "מכתב מומחה / Thought Leadership". מבנה: פתיח דעתני, deep-dive מובנה של 3-4 פסקאות עם דוגמאות, תיבת callout עם ציטוט/עיקרון, ו"Key Takeaways" כרשימה ממוספרת. טון סמכותי ומעמיק. הגדר includeServices=true, includeNews=false.',
};

const SYSTEM = `אתה קופירייטר בכיר למיילים בעברית, עבור המותג "MR. DANIEL" (דניאל בן ברוך) — חדשות AI, פירוק מודלי שפה ובניית סוכני AI אוטונומיים. תוכן AI בלבד.

${EXPERT_VOICE_RULES}

החזר אך ורק JSON תקין במבנה:
{
  "subjectOptions": [3 שורות נושא שונות, כל אחת עד 62 תווים, בעלות CTR גבוה, בלי clickbait זול, בלי אימוג'י מוגזם],
  "preheader": "טקסט teaser קצר עד 110 תווים שמופיע לצד הנושא בתיבת הדואר",
  "bodyHtml": "<... HTML פנימי בלבד ...>",
  "includeNews": true או false,
  "includeServices": true או false
}

חוקים ל-bodyHtml:
- HTML פנימי בלבד — בלי <html>, <head>, <body>, בלי <table> עוטף. זה נכנס לתוך כרטיס גוף כהה קיים.
- כל עיצוב ב-inline style בלבד (תאימות Gmail/Outlook). בלי <style>, בלי class, בלי flex/grid.
- טקסט ברירת מחדל: כהה על רקע כהה — צבע #d8dade, גופן Arial,Helvetica,sans-serif, גודל 15px, line-height 1.85.
- כותרות: <p style="margin:0 0 12px;color:#ffffff;font:700 19px/1.5 Arial,Helvetica,sans-serif;">...</p>
- פסקאות: <p style="margin:0 0 14px;">...</p>
- רשימות: <ul style="margin:0 0 14px;padding-right:20px;color:#d8dade;"><li style="margin:0 0 7px;">...</li></ul>
- תיבת callout/ציטוט: <div style="margin:0 0 16px;background:#0e0e14;border-right:3px solid #76B900;border-radius:10px;padding:14px 18px;color:#c7cad0;font:400 14px/1.7 Arial,Helvetica,sans-serif;">...</div>
- כפתור CTA ראשי: <p style="margin:18px 0;"><a href="https://mrdaniel.co.il/ai" style="display:inline-block;background:#76B900;background-image:linear-gradient(180deg,#9FE870,#5C9200);color:#0b0f0e;font:800 15px/1 Arial,Helvetica,sans-serif;text-decoration:none;padding:14px 28px;border-radius:12px;box-shadow:0 6px 22px rgba(118,185,0,.35);">טקסט הכפתור&nbsp;&larr;</a></p>
- כפתור CTA משני: <a style="...color:#9FE870;border:1px solid #2f3a33;border-radius:10px;padding:10px 18px;display:inline-block;text-decoration:none;font:700 14px/1 Arial,Helvetica,sans-serif;">...</a>
- קישורים: תמיד ל-https://mrdaniel.co.il/... (למשל /ai, /jarvis, /news, /magazines). אין להוסיף פרמטרי utm — המערכת מוסיפה אותם.
- אורך: 400-700 מילים. תוכן עשיר: storytelling, ניתוח מומחה, נקודות ערך, לפחות תיבת callout אחת ולפחות CTA ראשי + משני.
- עברית תקנית, טון סמכותי-מקצועי, בלי הבטחות מוגזמות.
- includeNews=true אם המייל עריכתי/חדשותי; includeServices=true כמעט תמיד (אלא אם המייל צר-מיקוד מאוד).`;

export interface EmailCopyInput {
  goal: string;
  tone?: string;
  notes?: string;
  preset?: EmailPreset;
}

export interface EmailCopyResult {
  subjectOptions: string[];
  preheader: string;
  bodyHtml: string;
  includeNews: boolean;
  includeServices: boolean;
}

function fallback(input: EmailCopyInput): EmailCopyResult {
  return {
    subjectOptions: [input.goal.slice(0, 60) || 'עדכון מ-MR. DANIEL'],
    preheader: input.goal.slice(0, 100),
    bodyHtml: `<p style="margin:0 0 14px;color:#ffffff;font:700 19px/1.5 Arial,Helvetica,sans-serif;">${input.goal || 'עדכון'}</p><p style="margin:0 0 14px;">${(input.notes || 'תוכן יתווסף כאן.').slice(0, 400)}</p>`,
    includeNews: false,
    includeServices: true,
  };
}

export async function generateEmailCampaign(input: EmailCopyInput): Promise<EmailCopyResult> {
  if (!genAI) throw new Error('GEMINI_API_KEY not configured');

  const parts = [
    `מטרת/נושא המייל: ${input.goal}`,
    input.tone ? `טון וקהל יעד: ${input.tone}` : '',
    input.notes ? `הערות נוספות מהמנהל: ${input.notes}` : '',
    input.preset && PRESET_GUIDANCE[input.preset as Exclude<EmailPreset, ''>]
      ? PRESET_GUIDANCE[input.preset as Exclude<EmailPreset, ''>]
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await generateContentWithRetry({
    model: 'gemini-3.6-flash',
    contents: [{ role: 'user', parts: [{ text: parts }] }],
    config: { systemInstruction: SYSTEM, temperature: 0.9, topP: 0.95, responseMimeType: 'application/json' },
  });

  // See the note in WeeklyPlanEngine: `|| '{}'` hid a safety block behind "empty AI email result".
  const raw = stripCodeFence(requireText(response));
  try {
    const p = parseJsonOrThrow<Record<string, unknown>>(raw, 'email copy');
    const subjectOptions = (Array.isArray(p.subjectOptions) ? p.subjectOptions : [])
      .map((s: unknown) => String(s).trim())
      .filter(Boolean)
      .slice(0, 5);
    const bodyHtml = String(p.bodyHtml ?? '').trim();
    if (!bodyHtml || subjectOptions.length === 0) throw new Error('empty AI email result');
    return {
      subjectOptions,
      preheader: String(p.preheader ?? subjectOptions[0]).trim().slice(0, 140),
      bodyHtml,
      includeNews: Boolean(p.includeNews),
      includeServices: p.includeServices === false ? false : true,
    };
  } catch (err) {
    console.error('[email-copywriter] parse failed, using fallback:', (err as Error)?.message ?? err);
    return fallback(input);
  }
}
