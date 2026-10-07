import { generateContentWithRetry, requireText, stripCodeFence, parseJsonOrThrow } from '../agent/geminiClient.js';
import { sanitizeInput, sanitizeOutput } from '../agent/AgentSecurityGuard.js';
import { scrubAiPhrases } from '../agent/expertVoice.js';
import { FIELD_ORDER, FIELD_LABEL, REQUIRED_FIELDS, type IntakeFields, type IntakeField } from '../lib/intakeFields.js';

/**
 * The chat agent (2026-10-07): the conversation a visitor has on /chat and in the floating chat,
 * and the hot lead the owner gets out of it.
 *
 * The owner asked for a chat that feels like talking to a person: it answers any question, asks its
 * own questions one at a time, collects who the visitor is and what they need, and hands Daniel the
 * whole thing as a lead with a clean summary and the full conversation. It replaced a widget that
 * answered questions and then pushed a form, and a WhatsApp link that no longer exists.
 *
 * One model call per turn returns both the reply and what the visitor has said about themselves so
 * far, as JSON. Two things are never taken from the model:
 *
 *   the email   read from the visitor's own messages with a regex. A model can mistype one, or
 *               invent one, and this is the address the lead and the reply email go to.
 *   completion  decided in code from the fields (need + name + email), so the lead is sent exactly
 *               once, at a moment the code can name.
 *
 * When the model is unavailable (free-tier limits, an outage, unusable JSON) the turn falls back to
 * a short scripted interview that asks for the same fields in order. The chat never dead-ends and
 * a visitor never sees an error in place of an answer.
 */

export type IntakeRole = 'user' | 'assistant';
export interface IntakeMessage {
  role: IntakeRole;
  content: string;
}

export type { IntakeFields, IntakeField } from '../lib/intakeFields.js';
export { FIELD_ORDER, FIELD_LABEL, REQUIRED_FIELDS };

export interface IntakeTurn {
  reply: string;
  fields: IntakeFields;
  /** The field this reply asks for, so the scripted fallback knows what the next answer fills. */
  ask: IntakeField | null;
  /** Up to three one-tap answers to the question just asked. */
  suggestions: string[];
  complete: boolean;
  mode: 'ai' | 'script';
}

const MAX_MESSAGES = 40;
/** How long a visitor waits for the model before the scripted turn answers. */
const TURN_TIMEOUT_MS = 18_000;
const MAX_CHARS = 1200;
const FIELD_MAX = 160;

/** The transcript as the browser sent it, typed and capped. Anything else is dropped. */
export function cleanMessages(raw: unknown): IntakeMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is { role: string; content: string } => !!m && typeof m === 'object' && typeof (m as { content?: unknown }).content === 'string')
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as IntakeRole, content: m.content.trim().slice(0, MAX_CHARS) }))
    .filter((m) => m.content)
    .slice(-MAX_MESSAGES);
}

const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_IN_TEXT = /(?:\+972[-\s]?|0)5\d[-\s]?\d{3}[-\s]?\d{4}/;

/** The last email the visitor typed themselves. Never the model's version of it. */
export function emailFromMessages(messages: IntakeMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'user') continue;
    const found = messages[i].content.match(EMAIL_IN_TEXT);
    if (found) return found[found.length - 1].toLowerCase();
  }
  return '';
}

/** A phone the visitor offered without being asked. */
export function phoneFromMessages(messages: IntakeMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'user') continue;
    const m = messages[i].content.match(PHONE_IN_TEXT);
    if (m) return m[0].replace(/[\s-]/g, '');
  }
  return '';
}

function cleanField(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, FIELD_MAX) : '';
}

/** A name is a few words of letters: no digits, no address, no link. */
function cleanName(v: unknown): string {
  const s = cleanField(v).slice(0, 60);
  return s && !/[@\d<>/:]|www\./i.test(s) ? s : '';
}

/**
 * Folds what this turn learned into what was already known. A field the model left empty keeps
 * its earlier value (a model that forgets is not the visitor taking it back), and the contact
 * fields always come from the visitor's own words.
 */
export function mergeFields(prev: IntakeFields, next: IntakeFields, messages: IntakeMessage[]): IntakeFields {
  const out: IntakeFields = {};
  for (const key of FIELD_ORDER) {
    if (key === 'email' || key === 'phone') continue;
    const value = key === 'name' ? cleanName(next[key]) || cleanName(prev[key]) : cleanField(next[key]) || cleanField(prev[key]);
    if (value) out[key] = value;
  }
  const email = emailFromMessages(messages);
  if (email) out.email = email;
  const phone = phoneFromMessages(messages);
  if (phone) out.phone = phone;
  return out;
}

export function isComplete(f: IntakeFields): boolean {
  return REQUIRED_FIELDS.every((k) => (f[k] ?? '').length >= (k === 'need' ? 4 : 2));
}

// ── The scripted fallback ─────────────────────────────────────────────────────────────────────

const SCRIPT: { field: IntakeField; ask: string; suggestions: string[] }[] = [
  { field: 'need', ask: 'ספרו לי במשפט או שניים: מה הייתם רוצים שסוכן AI יעשה בשבילכם?', suggestions: ['לענות ללקוחות', 'לחסוך עבודה חוזרת', 'ללמוד AI מאפס'] },
  { field: 'who', ask: 'ולמי זה? עבודה עצמאית, עסק, או שימוש אישי?', suggestions: ['עבודה עצמאית', 'עסק קטן', 'שימוש אישי'] },
  { field: 'name', ask: 'איך קוראים לכם?', suggestions: [] },
  { field: 'email', ask: 'לאיזה מייל דניאל יחזור אליכם?', suggestions: [] },
];

/**
 * The interview without a model: the answer to the last question fills that field, then the next
 * missing one is asked. Used only when the model can't answer, so it says so once, plainly, rather
 * than pretending to understand a question it can't.
 */
export function scriptTurn(messages: IntakeMessage[], prev: IntakeFields, asked: IntakeField | null): IntakeTurn {
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const fields: IntakeFields = { ...prev };
  let note = '';
  if (asked && last && asked !== 'email' && asked !== 'phone') {
    const value = asked === 'name' ? cleanName(last) : cleanField(last);
    if (value) fields[asked] = value;
  } else if (!asked && last && !fields.need) {
    fields.need = cleanField(last);
  }
  const merged = mergeFields(fields, {}, messages);
  if (asked === 'email' && last && !merged.email) note = 'זה לא נראה לי כמו כתובת מייל. ';
  if (/\?/.test(last) && asked !== 'email') note = 'על השאלה הזו דניאל יענה לכם בעצמו, במייל. ';

  const next = SCRIPT.find((s) => !merged[s.field]);
  if (!next) {
    const first = (merged.name ?? '').split(' ')[0];
    return {
      reply: `תודה${first ? ` ${first}` : ''}. העברתי לדניאל את כל מה שסיפרתם, והוא יחזור אליכם ל-${merged.email}. יש עוד משהו שכדאי שיידע?`,
      fields: merged,
      ask: null,
      suggestions: ['זה הכול, תודה'],
      complete: isComplete(merged),
      mode: 'script',
    };
  }
  return { reply: note + next.ask, fields: merged, ask: next.field, suggestions: next.suggestions, complete: isComplete(merged), mode: 'script' };
}

// ── The model turn ────────────────────────────────────────────────────────────────────────────

let catalog: string | null = null;
/** The agents for sale, from the site's own data: the model may quote these names and prices and
 * nothing else. aiAgents.ts pulls lucide-react in for its icons, so it loads on first use. */
async function agentCatalog(): Promise<string> {
  if (catalog !== null) return catalog;
  try {
    const { AI_AGENTS } = await import('../data/aiAgents.js');
    catalog = AI_AGENTS.map((a) => `- ${a.name} (${a.tierLabel}, ₪${a.price.toLocaleString('he-IL')}): ${a.tagline}`).join('\n');
  } catch {
    catalog = '';
  }
  return catalog;
}

function systemInstruction(known: IntakeFields, agents: string): string {
  const knownLines = FIELD_ORDER.filter((k) => known[k]).map((k) => `${FIELD_LABEL[k]}: ${known[k]}`);
  const missing = REQUIRED_FIELDS.filter((k) => !known[k]).map((k) => FIELD_LABEL[k]);
  return `אתה הסוכן של דניאל בן ברוך באתר mrdaniel.co.il, בחלון צ׳אט. דניאל בונה סוכני AI ומלמד AI בעברית פשוטה.

המטרה שלך כפולה:
1. לענות באמת על כל שאלה של המבקר: AI, סוכנים, מודלי שפה, JARVIS, מה דניאל עושה ואיך עובדים איתו. תשובה אמיתית ומועילה, לא הפניה.
2. תוך כדי, להכיר את המבקר, כדי שדניאל יחזור אליו מוכן: מה הוא צריך, למי זה (עבודה עצמאית, עסק, תחום), באילו כלים הוא עובד היום, מתי הוא רוצה להתחיל, תקציב (רק אם זה עולה טבעי, בלי לחץ), שם, ומייל שדניאל יחזור אליו.

איך מדברים:
- כמו בן אדם בצ׳אט: 1–3 משפטים קצרים בכל הודעה. בלי רשימות ובלי כותרות, אלא אם ביקשו הסבר מפורט.
- קודם עונים על מה שנשאל. אחר כך, אם חסר משהו, שואלים שאלה אחת בלבד, בסוף ההודעה.
- לא חוקרים: לא שתי שאלות באותה הודעה, ולא שואלים שוב משהו שכבר נאמר.
- עברית טבעית בגובה העיניים, פנייה ברבים (אתם, לכם, אליכם, תרצו), ניטרלית מגדרית, לאורך כל השיחה: גם אחרי שהמבקר אמר את שמו, לא עוברים ליחיד (לא "אליך", לא "תרצה"). בלי אימוג׳י, בלי "בואו נצלול", "חשוב לציין", "שאלה מצוינת".
- אתה סוכן AI, לא בן אדם, ולא דניאל. אם שואלים, אומרים את זה בפשטות ומוסיפים שדניאל עצמו קורא את השיחה וחוזר במייל.
- לא ממציאים: לא מחירים מעבר לרשימה למטה, לא לקוחות, לא מספרים ולא הבטחות תוצאה. מחיר מדויק דניאל נותן אחרי שהוא מבין את העבודה.
- לא מבטיחים זמנים: לא "תוך חודש", לא "תוך שבוע", לא "מהר". כמה זמן ייקח, דניאל אומר אחרי שהוא מבין את העבודה.
- אין לדניאל טלפון או וואטסאפ לפניות. טלפון לא מבקשים. כל ההמשך במייל.
- קודם מבינים את המבקר: מה הוא צריך, למי זה, באילו כלים הוא עובד ומתי. שם ומייל מבקשים רק אחרי שלוש הודעות של המבקר לפחות, או כשהוא עצמו מבקש שיחזרו אליו.
- שם ומייל הם שתי שאלות נפרדות, בשתי הודעות: קודם השם, ובהודעה הבאה המייל.
- המייל נדרש כדי שדניאל יחזור. מי שלא רוצה לתת, ממשיכים לעזור לו, ומזכירים בעדינות פעם אחת בלבד שבלי מייל דניאל לא יוכל לחזור.
- לפני שהמבקר כתב כתובת מייל, שום דבר לא עובר לדניאל: אסור לכתוב "העברתי", "הפרטים אצל דניאל" או "דניאל יחזור" לפני שיש מייל.
- כשיש צורך, שם ומייל: מסכמים במשפט אחד מה הבנתם, אומרים שהכול עובר לדניאל ושהוא יחזור למייל, ושואלים אם יש עוד משהו להוסיף.
- שאלה שלא קשורה ל-AI: עונים בקצרה שזה מחוץ לתחום ומחזירים לנושא.

עובדות על דניאל (רק אלה):
- סוכני AI אוטונומיים: סוכן למשימה אחת, שמתחבר למייל, ליומן, למסמכים ולכלים שכבר יש. נבנים יחד: שיחת אפיון, בנייה, בדיקה על מקרים אמיתיים.
- מודלי שפה: עזרה בבחירה בין Grok, Claude, Gemini, GPT ומודלים מקומיים, RAG ואינטגרציות.
- JARVIS: סוכן AI אוטונומי בעברית שמבצע משימות שלמות מפקודה קולית, בגבולות שהלקוח קובע. אין מחירון קבוע: אחרי שיחה קצרה מקבלים הצעה בכתב.
- לומדים AI: מדריכים חינמיים בעמוד "לומדים AI", וחדשות AI כל יום בעמוד החדשות.
- סוכנים מוכנים שמוצגים באתר (המחיר הוא של החבילה המוכנה כפי שהיא באתר; התאמה מיוחדת מקבלת הצעה מדניאל):
${agents || '- (הרשימה לא זמינה כרגע: על מחיר עונים שדניאל ייתן הצעה)'}

מה כבר ידוע על המבקר:
${knownLines.length ? knownLines.join('\n') : '(עוד כלום)'}
${missing.length ? `עוד חסר כדי שדניאל יוכל לחזור: ${missing.join(', ')}.` : 'יש כל מה שדניאל צריך. אל תבקשו עוד פרטים, רק תעזרו.'}

החזירו JSON בלבד, בלי טקסט מסביב:
{"reply": "ההודעה למבקר", "fields": {"need": "", "who": "", "tools": "", "timeline": "", "budget": "", "name": ""}, "ask": "need|who|tools|timeline|budget|name|email|none", "suggestions": []}
- fields: רק מה שהמבקר אמר במפורש בשיחה, בניסוח קצר (עד 12 מילים). מה שלא נאמר: מחרוזת ריקה.
- ask: איזה פרט ההודעה שלכם שואלת עליו, או none.
- suggestions: 0–3 תשובות קצרות (1–4 מילים) שהמבקר יכול ללחוץ עליהן כתשובה לשאלה ששאלתם. לשאלה על שם או מייל: מערך ריק.`;
}

interface ModelTurn {
  reply?: unknown;
  fields?: Record<string, unknown>;
  ask?: unknown;
  suggestions?: unknown;
}

const ASKABLE = new Set<string>(FIELD_ORDER);

/**
 * Reads the model's JSON into a turn, or throws so the caller falls back to the script.
 *
 * A model that answered in plain prose instead of JSON (seen 2026-10-07 on a free leg that ignored
 * the JSON mime type) still wrote a usable reply: it is kept as the reply, with nothing new learned
 * and no question to track, rather than thrown away for a scripted line.
 */
export function readModelTurn(raw: string, messages: IntakeMessage[], prev: IntakeFields): IntakeTurn {
  const body = stripCodeFence(raw);
  const prose = !/^[\[{]/.test(body.trim()) && /[\u0590-\u05FF]{2}/.test(body);
  const parsed: ModelTurn = prose ? { reply: body } : parseJsonOrThrow<ModelTurn>(body, 'intake turn');
  const reply = typeof parsed.reply === 'string' ? scrubAiPhrases(parsed.reply).trim() : '';
  if (reply.length < 2) throw new Error('intake turn: empty reply');
  const guard = sanitizeOutput(reply);
  if (!guard.passed) throw new Error(`intake turn: guard blocked the reply (${guard.flags.join(',')})`);

  const next: IntakeFields = {};
  const f = parsed.fields && typeof parsed.fields === 'object' ? parsed.fields : {};
  for (const key of ['need', 'who', 'tools', 'timeline', 'budget', 'name'] as const) next[key] = cleanField(f[key]);
  const fields = mergeFields(prev, next, messages);

  const ask = typeof parsed.ask === 'string' && ASKABLE.has(parsed.ask) ? (parsed.ask as IntakeField) : null;
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 3)
    : [];
  return { reply: reply.slice(0, 1500), fields, ask, suggestions: ask === 'email' || ask === 'name' ? [] : suggestions, complete: isComplete(fields), mode: 'ai' };
}

/** One turn of the conversation. Never throws: a model failure becomes a scripted turn. */
export async function intakeTurn(rawMessages: unknown, rawFields: unknown, rawAsk: unknown): Promise<IntakeTurn> {
  const messages = cleanMessages(rawMessages).map((m) => (m.role === 'user' ? { ...m, content: sanitizeInput(m.content).clean } : m));
  const prevRaw = (rawFields && typeof rawFields === 'object' ? rawFields : {}) as Record<string, unknown>;
  const prev: IntakeFields = {};
  for (const key of FIELD_ORDER) {
    const v = key === 'name' ? cleanName(prevRaw[key]) : cleanField(prevRaw[key]);
    if (v) prev[key] = v;
  }
  const asked = typeof rawAsk === 'string' && ASKABLE.has(rawAsk) ? (rawAsk as IntakeField) : null;
  const known = mergeFields(prev, {}, messages);
  if (!messages.some((m) => m.role === 'user')) return scriptTurn(messages, known, null);

  try {
    const call = generateContentWithRetry(
      {
        model: 'gemini-3.6-flash',
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        config: { systemInstruction: systemInstruction(known, await agentCatalog()), temperature: 0.6, topP: 0.95, maxOutputTokens: 1500, responseMimeType: 'application/json' },
      },
      // Free chat: the visitor may name a model release the conversation never did. The reply is
      // scrubbed after parsing, not before: the scrubber collapses whitespace inside the JSON.
      // `chat` puts the fastest free legs first (geminiClient.ts planLegs).
      { sourceLock: false, scrub: false, textOnly: true, priority: 'chat' }
    );
    // Someone is waiting on the other side of the window: past TURN_TIMEOUT_MS the scripted turn
    // answers instead (the model call is abandoned, not cancelled; its answer is simply not used).
    const response = await Promise.race([
      call,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no answer within ${TURN_TIMEOUT_MS}ms`)), TURN_TIMEOUT_MS)),
    ]);
    return readModelTurn(requireText(response), messages, known);
  } catch (err) {
    console.warn('[intake] model turn failed, scripted turn instead:', (err as Error)?.message ?? err);
    return scriptTurn(messages, known, asked);
  }
}

// ── The lead ──────────────────────────────────────────────────────────────────────────────────

export type LeadHeat = 'חם' | 'פושר' | 'ראשוני';
export interface IntakeSummary {
  summary: string;
  heat: LeadHeat;
  nextStep: string;
  openQuestions: string[];
}

/** Without a model: what the fields say, and heat from how much the visitor told. */
export function fallbackSummary(f: IntakeFields): IntakeSummary {
  const parts = [f.need && `רוצה: ${f.need}.`, f.who && `למי: ${f.who}.`, f.tools && `עובד היום עם: ${f.tools}.`, f.timeline && `זמנים: ${f.timeline}.`, f.budget && `תקציב: ${f.budget}.`].filter(Boolean);
  const heat: LeadHeat = f.email && f.need && (f.timeline || f.budget) ? 'חם' : f.email && f.need ? 'פושר' : 'ראשוני';
  return {
    summary: parts.join(' ') || 'השיחה קצרה, אין עדיין פירוט של הצורך.',
    heat,
    nextStep: f.email ? 'לחזור במייל עם שאלה אחת שמבהירה את ההיקף, ולהציע שיחת אפיון קצרה.' : 'אין דרך לחזור: המבקר לא השאיר מייל.',
    openQuestions: (['who', 'tools', 'timeline', 'budget'] as const).filter((k) => !f[k]).map((k) => `${FIELD_LABEL[k]}?`),
  };
}

/** The owner's summary of the conversation. Never throws. */
export async function summarizeIntake(messages: IntakeMessage[], f: IntakeFields): Promise<IntakeSummary> {
  const fallback = fallbackSummary(f);
  if (messages.filter((m) => m.role === 'user').length < 2) return fallback;
  try {
    const transcript = messages.map((m) => `${m.role === 'user' ? 'מבקר' : 'סוכן'}: ${m.content}`).join('\n');
    const response = await generateContentWithRetry(
      {
        model: 'gemini-3.6-flash',
        contents: [{ role: 'user', parts: [{ text: transcript }] }],
        config: {
          systemInstruction: `לפניך שיחה בין מבקר באתר mrdaniel.co.il לבין הסוכן של דניאל. כתבו לדניאל סיכום ליד, בעברית, רק ממה שנאמר בשיחה, בלי להמציא.
החזירו JSON בלבד:
{"summary": "3–5 משפטים: מי המבקר, מה הוא צריך ולמה, ומה חשוב לו", "heat": "חם|פושר|ראשוני", "nextStep": "משפט אחד: מה הצעד הבא הנכון מול המבקר", "openQuestions": ["עד 3 דברים שעוד לא ברורים"]}
חם = צורך ברור, רוצה להתקדם, ציין זמנים או תקציב. פושר = מתעניין עם צורך ברור. ראשוני = עוד בודק.`,
          temperature: 0.3,
          responseMimeType: 'application/json',
        },
      },
      { sourceLock: false, scrub: false, textOnly: true }
    );
    const parsed = parseJsonOrThrow<Record<string, unknown>>(stripCodeFence(requireText(response)), 'intake summary');
    const heat = parsed.heat === 'חם' || parsed.heat === 'פושר' || parsed.heat === 'ראשוני' ? parsed.heat : fallback.heat;
    const summary = typeof parsed.summary === 'string' && parsed.summary.trim() ? scrubAiPhrases(parsed.summary).trim().slice(0, 900) : fallback.summary;
    const nextStep = typeof parsed.nextStep === 'string' && parsed.nextStep.trim() ? parsed.nextStep.trim().slice(0, 300) : fallback.nextStep;
    const openQuestions = Array.isArray(parsed.openQuestions)
      ? parsed.openQuestions.filter((q): q is string => typeof q === 'string' && !!q.trim()).map((q) => q.trim().slice(0, 160)).slice(0, 3)
      : fallback.openQuestions;
    return { summary, heat, nextStep, openQuestions };
  } catch (err) {
    console.warn('[intake] summary failed, fallback summary instead:', (err as Error)?.message ?? err);
    return fallback;
  }
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

const HEAT_COLOR: Record<LeadHeat, string> = { חם: '#9FE870', פושר: '#E8C870', ראשוני: '#8A957D' };

/**
 * The lead as the owner reads it: who, what, how warm, what to do next, then the conversation.
 * Table-based with inline CSS like every email in emailEngine.ts. It goes only to the owner's
 * inbox, so the transcript is included whole; every visitor-written string is escaped.
 */
export function intakeLeadEmail(opts: {
  fields: IntakeFields;
  summary: IntakeSummary;
  messages: IntakeMessage[];
  complete: boolean;
  update: boolean;
}): { subject: string; html: string; text: string } {
  const { fields: f, summary: s, messages, complete, update } = opts;
  const who = f.name || 'מבקר בלי שם';
  const status = update ? 'עדכון לשיחה' : complete ? `ליד ${s.heat}` : 'שיחה שלא הושלמה';
  const subject = `${status} מהצ׳אט: ${who}${f.need ? ` · ${f.need.slice(0, 50)}` : ''}`;

  const rows = FIELD_ORDER.filter((k) => f[k])
    .map(
      (k) => `<tr><td style="padding:6px 0;color:#8a8f98;font:700 12px/1.6 Arial,Helvetica,sans-serif;width:90px;vertical-align:top;">${esc(FIELD_LABEL[k])}</td>
      <td style="padding:6px 0;color:#ffffff;font:400 14px/1.6 Arial,Helvetica,sans-serif;">${k === 'email' ? `<a href="mailto:${esc(f.email!)}" style="color:#9FE870;">${esc(f.email!)}</a>` : esc(f[k]!)}</td></tr>`
    )
    .join('');
  const transcript = messages
    .map((m) => {
      const mine = m.role === 'user';
      return `<tr><td style="padding:5px 0;">
        <div style="color:${mine ? '#9FE870' : '#8a8f98'};font:700 11px/1.4 Arial,Helvetica,sans-serif;">${mine ? esc(who) : 'הסוכן'}</div>
        <div style="color:${mine ? '#ffffff' : '#c7cad0'};font:400 14px/1.7 Arial,Helvetica,sans-serif;white-space:pre-wrap;">${esc(m.content)}</div>
      </td></tr>`;
    })
    .join('');
  const open = s.openQuestions.length
    ? `<div style="color:#8a8f98;font:700 12px/1.6 Arial,Helvetica,sans-serif;margin-top:14px;">עוד לא ברור</div><div style="color:#d8dade;font:400 14px/1.7 Arial,Helvetica,sans-serif;">${s.openQuestions.map(esc).join('<br>')}</div>`
    : '';

  const html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#09090b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#09090b;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
  <tr><td style="height:4px;line-height:4px;font-size:0;background:${HEAT_COLOR[s.heat]};">&nbsp;</td></tr>
  <tr><td style="background:#121218;padding:20px 24px;">
    <div style="color:${HEAT_COLOR[s.heat]};font:800 12px/1.4 Arial,Helvetica,sans-serif;letter-spacing:1px;">${esc(status)} · הסוכן באתר</div>
    <div style="color:#ffffff;font:800 22px/1.4 Arial,Helvetica,sans-serif;margin-top:6px;">${esc(who)}</div>
    ${f.email ? `<div style="margin-top:4px;"><a href="mailto:${esc(f.email)}" style="color:#9FE870;font:400 14px/1.5 Arial,Helvetica,sans-serif;">${esc(f.email)}</a> &nbsp;<span style="color:#8a8f98;font:400 12px Arial,Helvetica,sans-serif;">(השיבו למייל הזה כדי לענות ישר למבקר)</span></div>` : ''}
  </td></tr>
  <tr><td style="background:#181820;border:1px solid #24242e;padding:20px 24px;">
    <div style="color:#8a8f98;font:700 12px/1.6 Arial,Helvetica,sans-serif;">הסיכום</div>
    <div style="color:#e6ecdd;font:400 15px/1.8 Arial,Helvetica,sans-serif;">${esc(s.summary)}</div>
    <div style="color:#8a8f98;font:700 12px/1.6 Arial,Helvetica,sans-serif;margin-top:14px;">הצעד הבא</div>
    <div style="color:#e6ecdd;font:400 15px/1.8 Arial,Helvetica,sans-serif;">${esc(s.nextStep)}</div>
    ${open}
  </td></tr>
  <tr><td style="background:#121218;border:1px solid #24242e;border-top:0;padding:16px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
  </td></tr>
  <tr><td style="padding:22px 24px 8px;color:#8a8f98;font:700 12px/1.6 Arial,Helvetica,sans-serif;">השיחה המלאה (${messages.length} הודעות)</td></tr>
  <tr><td style="background:#0e0e14;border:1px solid #24242e;padding:14px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${transcript}</table>
  </td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `${status} מהצ׳אט באתר`,
    '',
    ...FIELD_ORDER.filter((k) => f[k]).map((k) => `${FIELD_LABEL[k]}: ${f[k]}`),
    '',
    `סיכום: ${s.summary}`,
    `הצעד הבא: ${s.nextStep}`,
    ...(s.openQuestions.length ? [`עוד לא ברור: ${s.openQuestions.join(' · ')}`] : []),
    '',
    '— השיחה —',
    ...messages.map((m) => `${m.role === 'user' ? who : 'הסוכן'}: ${m.content}`),
  ].join('\n');

  return { subject, html, text };
}
