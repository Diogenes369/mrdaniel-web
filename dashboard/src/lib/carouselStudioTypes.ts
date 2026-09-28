import type { NewsTopic } from './newsAgentTypes';

/**
 * Shared types for the WEB3 Carousel Studio (dashboard/src/components/CarouselStudio.tsx).
 *
 * The studio runs a 4-agent pipeline — Scraper/Researcher → Copywriter/Hook-Architect →
 * WEB3 Creative Director → Compositor/Export — over a single source (URL, pasted text, or a
 * preset brief) to produce a 10–14 slide 1080×1350 Instagram carousel in Hebrew, plus a
 * one-click ZIP bundle of pixel-perfect PNGs.
 */

// ─── Slide model ────────────────────────────────────────────────────────────────────────────

/** Layout the Creative Director assigns + the Compositor knows how to draw. */
export type LayoutKind =
  | 'hero' // slide 1 — the hook
  | 'value' // narrative value paragraph
  | 'checklist' // 3–5 actionable items
  | 'stat' // one oversized number/percent callout
  | 'comparison' // two-column grid (myth vs reality / before vs after)
  | 'prompt' // ready-to-copy prompt / code box (monospace)
  | 'quote' // pull quote
  | 'items' // 1–3 numbered entries from a source list (listicle decks)
  | 'cta'; // final slide — conversion

export type SlideRole = 'hook' | 'value' | 'cta';

/**
 * Per-slide art direction. Written by the model on the carousel tier (Claude Opus 5.5), made to
 * vary by the server's verifier, and filled from a title-derived seed by `directDeck` for decks that
 * arrive without it (the local fallback, older sessions). Mirrors `CarouselSlideDesign` in
 * src/agent/SocialAgentEngine.ts.
 */
export interface SlideDesign {
  align: 'right' | 'center';
  zone: 'top' | 'center' | 'bottom';
  tone: 'plain' | 'band' | 'split' | 'spot';
  scale: 'xl' | 'l' | 'm';
}

/** One numbered entry on an `items` slide. `n` is the item's position in the SOURCE list. */
export interface ListEntry {
  n: number;
  name: string;
  text: string;
}

/** The server verifier's report — see src/server/carouselVerifier.ts. */
export interface DeckVerification {
  passed: boolean;
  score: number;
  checks: { id: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }[];
  fixes: string[];
  coverage: { expected: number; covered: number; missing: { n: number; name: string }[]; promised: number | null } | null;
}
export type AccentKey = 'green' | 'cyan';

/**
 * Visual system the Compositor paints in:
 *  · 'web3'  — deep-obsidian / neon-cyber (the default studio look)
 *  · 'notes' — light "study-notes" carousel: white paper, dotted grid, bold black headlines,
 *              coloured italic sub-headlines, disc bullet lists, author bar + swipe arrows.
 */
export type StudioTheme = 'web3' | 'notes';

export interface StudioSlide {
  id: string;
  index: number; // 0-based position in the deck
  role: SlideRole;
  layout: LayoutKind;
  /** short section tag shown in the slide's top bar */
  kicker: string;
  headline: string;
  subhead: string;
  /** narrative paragraph (value / stat explainer / quote reinforcement / cta body) */
  body: string;
  bullets: string[];
  /** left column for `comparison` (right column reuses `bullets`) */
  bulletsLeft: string[];
  columnLabels: [string, string] | null;
  stat: string;
  code: string;
  quote: string;
  readingTime: string;
  // ── styling assigned by the Creative Director (agent 3) ──
  accent: AccentKey;
  /** 0..1 ambient neon glow intensity behind the key element */
  glow: number;
  /** `items` layout only. Optional so sessions persisted by an older build deserialise. */
  items?: ListEntry[];
  design?: SlideDesign;
}

export interface StudioDeck {
  slides: StudioSlide[];
  topic: NewsTopic;
  title: string;
  sourceLabel: string;
  sourceLink: string;
  /** ready-to-paste Instagram caption */
  caption: string;
  hashtags: string[];
  /** true = AI-synthesised copy, false = deterministic local fallback */
  synthesized: boolean;
  fallbackReason?: string;
  /** visual system the slides are rendered in */
  theme: StudioTheme;
  /** Company/product names from the source, drawn as wordmark lockups. Source-checked server-side. */
  entities?: string[];
  /** Router leg that wrote the copy ("claude:claude-opus-5-5", "gemini:…"); absent on the fallback. */
  engine?: string;
  /** The pre-render verification report; absent on the local fallback deck. */
  verification?: DeckVerification;
  createdAt: number;
}

// ─── Research brief (agent 1 output) ────────────────────────────────────────────────────────

export interface ResearchBrief {
  title: string;
  /** cleaned full body text — the single grounding source for the Copywriter agent */
  body: string;
  sourceLabel: string;
  sourceLink: string;
  imageUrl: string;
  /** candidate scroll-stopping hooks extracted from the text */
  hooks: string[];
  /** key technical takeaways / viral patterns */
  takeaways: string[];
  /** one-line visual + subject theme for the Creative Director */
  theme: string;
  /** provenance: 'direct' | 'jina' | 'manual' | 'preset' */
  via: string;
}

// ─── Live execution feed (agents' status) ───────────────────────────────────────────────────

export type AgentId = 'scraper' | 'copywriter' | 'director' | 'compositor';
export type AgentPhase = 'idle' | 'running' | 'done' | 'error';

export interface AgentState {
  id: AgentId;
  label: string; // Hebrew display name
  role: string; // English sub-title, e.g. "Extractor Agent"
  phase: AgentPhase;
  detail: string; // latest status line
  startedAt?: number;
  endedAt?: number;
}

export interface StudioLogLine {
  t: number;
  agent: AgentId;
  text: string;
}

export const AGENT_BLUEPRINT: { id: AgentId; label: string; role: string }[] = [
  { id: 'scraper', label: 'סורק וחוקר', role: 'Extractor & Research Agent' },
  { id: 'copywriter', label: 'קופירייטר ואדריכל Hook', role: 'Hebrew Content Engine' },
  { id: 'director', label: 'מנהל קריאייטיב WEB3', role: 'Design Engine' },
  { id: 'compositor', label: 'קומפוזיטור וייצוא', role: 'Render & Production Agent' },
];

export function freshAgents(): AgentState[] {
  return AGENT_BLUEPRINT.map((a) => ({ ...a, phase: 'idle' as AgentPhase, detail: 'ממתין' }));
}

// ─── Preset briefs (seed content when there is no URL) ──────────────────────────────────────

export interface StudioPreset {
  id: string;
  label: string;
  topic: NewsTopic;
  title: string;
  /** seed body — real grounding text so the Copywriter agent has material without a URL */
  brief: string;
}

export const STUDIO_PRESETS: StudioPreset[] = [
  {
    id: 'ai-tools',
    label: '10 כלי AI מובילים',
    topic: 'ai',
    title: '10 כלי AI שכל איש מקצוע חייב להכיר',
    brief:
      'סוכני AI אוטונומיים כבר לא רעיון תיאורטי — הם רצים בתוך תהליכי עבודה אמיתיים. ההבדל המרכזי בין צ׳אטבוט גנרי לסוכן אוטונומי הוא שהסוכן מאנדקס ידע אמיתי דרך RAG, מקבל החלטות, ומבצע פעולות בפועל תחת שכבת Guardian Agents לבקרה וממשל. ניתוב רב-מודלי (Claude, Gemini, GPT) מפנה כל משימה למודל המתאים לפי מורכבות. הקטגוריות המרכזיות: כלי RAG לאינדוקס ידע, מסגרות אורקסטרציה לסוכנים, כלי הערכה ובדיקות (evals), שכבות אבטחה נגד Prompt Injection, וכלי ניטור לתצפית על התנהגות הסוכן בזמן אמת. מי שמוסיף AI בלי שכבת בקרה מקבל סוכן שעושה דברים שאף אחד לא אישר — ולכן כל פעולה רגישה עוברת אישור אנושי. הצעד הנכון: להתחיל מתהליך עסקי אחד, למדוד, ורק אז להרחיב.',
  },
  {
    id: 'prompt-eng',
    label: 'הנדסת פרומפטים שלב-אחר-שלב',
    topic: 'ai',
    title: 'הנדסת פרומפטים: מדריך מעשי לתוצאות ברמת מומחה',
    brief:
      'פרומפט טוב הוא הנדסה, לא ניחוש. שלב ראשון: הגדרת תפקיד מפורשת למודל — מי הוא, לאיזה קהל הוא כותב, ומה הטון. שלב שני: הקשר לפני הוראה — קודם נותנים למודל את חומר הרקע, ורק אז את המשימה. שלב שלישי: הגדרת פורמט פלט מדויק, כולל דוגמה של מבנה התשובה הרצוי. שלב רביעי: פירוק משימה מורכבת לשרשרת צעדים (chain-of-thought) במקום בקשה אחת גדולה. שלב חמישי: אילוצים שליליים — מה אסור לכלול, לא רק מה כן. שלב שישי: לולאת שיפור — מריצים, בודקים מול קריטריון, ומנסחים מחדש את החלק שנכשל. טעות נפוצה: פרומפט ארוך ומעורפל במקום קצר ומדויק. מדידה: בלי קריטריון הצלחה ברור אי אפשר לדעת אם הפרומפט עובד.',
  },
  {
    id: 'agent-blueprint',
    label: 'בניית סוכן AI ראשון',
    topic: 'ai_agents',
    title: 'סוכן AI ראשון: 7 החלטות שקובעות אם הוא יעבוד',
    brief:
      'סוכן AI הוא מודל שפה שמקבל מטרה, בוחר כלים ומריץ צעדים עד שהמשימה נגמרת. החלטה ראשונה: משימה אחת צרה ומדידה, לא "עוזר לכל דבר". החלטה שנייה: בחירת מודל לפי המשימה — מודל חזק לתכנון, מודל זול ומהיר לצעדים חוזרים. החלטה שלישית: אילו כלים הסוכן מקבל, וכל כלי עם תיאור מדויק של מה הוא עושה. החלטה רביעית: זיכרון — מה נשמר בין ריצות ומה נזרק. החלטה חמישית: נקודות אישור אנושי לפני פעולה בלתי הפיכה. החלטה שישית: תיעוד כל צעד, כדי שאפשר יהיה להבין למה הסוכן עשה מה שעשה. החלטה שביעית: מדד הצלחה אחד שנמדד מהיום הראשון. טעות נפוצה: להוסיף עוד כלים במקום לחדד את המשימה.',
  },
];
