import { SITE_ORIGIN } from './useDashboardRefresh';
import type { NewsItem } from './newsAgentTypes';
import { getAdminSecret } from './adminSecret';
import { describeAiError } from './aiErrors';

/**
 * Tech Tips & Motion Studio — content layer.
 *
 * Mirrors src/agent/types.ts's TechTipSlide/TechTipDeck (hand-synced; the dashboard is a separate
 * npm project). Provides the tip "feed" (curated topic presets + live AI/dev headlines pulled from
 * the site's own sanitized news stream) and the deck synthesiser, which — like every other client
 * lib here — NEVER throws: on 429/503/network/thin output it returns a deterministic local deck
 * built from the topic itself, so the studio always has something to render.
 */

export type TipSlideKind = 'cover' | 'concept' | 'code' | 'step' | 'tool' | 'takeaway' | 'cta';

/** Subject family a deck belongs to. Assigned server-side by the Threads agent
 *  (src/server/agents/threadsThreadAgent.ts); drives the accent colour and the topic badge. */
export type ThreadTheme = 'ai' | 'automation' | 'security' | 'code' | 'data' | 'web3' | 'general';

/** A tool the slide is about, detected server-side from the thread's own words. Drives the vector
 *  logo mark drawn on the slide and the colour of the backdrop glow. Mirrors src/agent/types.ts. */
export type ToolBrand =
  | 'gemini'
  | 'chatgpt'
  | 'claude'
  | 'canva'
  | 'notebooklm'
  | 'make'
  | 'n8n'
  | 'perplexity'
  | 'copilot'
  | 'workspace'
  | 'veo'
  | 'midjourney'
  | 'glm';

/** Hand-drawn accent painted over the slide — the creator-deck signature. */
export type ScribbleKind = 'underline' | 'circle' | 'arrow' | 'none';

/** A service a workflow node stands for. Closed set: each has a vector mark and brand colour in
 *  NODE_STYLE (designAssets.ts), so a diagram never fetches a logo and cannot taint the canvas. */
export type NodeIcon =
  | 'webhook'
  | 'openai'
  | 'gmail'
  | 'calendar'
  | 'apify'
  | 'crm'
  | 'make'
  | 'n8n'
  | 'filter'
  | 'router'
  | 'scheduler'
  | 'chat'
  | 'phone'
  | 'globe'
  | 'doc'
  | 'sheet'
  | 'db';

/** One node in a workflow diagram. `label` is Hebrew (RTL); `sublabel` names the service and stays
 *  LTR and untranslated. `lane` 0 is the trunk, 1+ are fan-out branches. Mirrors src/agent/types.ts. */
export interface WorkflowNode {
  label: string;
  sublabel?: string;
  icon: NodeIcon;
  lane?: number;
}

/** The dark "HOW TO INSTALL" container at the foot of a cream-preset slide. Both fields LTR. */
export interface InstallBlock {
  saveAs?: string;
  run?: string;
}

export interface TechTipSlide {
  kind: TipSlideKind;
  kicker: string;
  title: string;
  body: string;
  bullets: string[];
  code: string;
  codeLang: string;
  stepNumber: number;
  visualPrompt: string;

  // Threads agent extensions — all optional and additive, so a Tech Tips deck (which sets none of
  // them) renders exactly as it always has. Mirrors src/agent/types.ts; keep the two in sync.
  /** Subject family, for the accent colour and typography accents. Defaults to 'general'. */
  theme?: ThreadTheme;
  /** Short topic chip drawn in the top bar, e.g. "Gemini AI". */
  badge?: string;
  /** Sub-post progress, pre-formatted as `"2 / 7"`. Replaces the deck-wide slide index. */
  stepLabel?: string;
  /** A prompt lifted verbatim from the source thread, drawn in its own dark copyable container. */
  promptBox?: string;
  /** An image from the original Thread post, already same-origin-proxied. */
  sourceImage?: string;
  /** Absolute link the CTA slide promotes, e.g. `https://mrdaniel.co.il/g/<slug>`. */
  ctaUrl?: string;

  // Creator design engine — see src/agent/types.ts for the full contract.
  /** The tool this slide is about. Paints its vector mark and tints the backdrop glow. */
  tool?: ToolBrand;
  /** The exact UI path the thread named, split into steps: `['Tools','Canvas']`. Drawn LTR. */
  workflowPath?: string[];
  /** Hand-drawn accent for this slide. */
  scribble?: ScribbleKind;
  /** Forbids a searched/generated photo here — technical slides keep the procedural backdrop.
   *  An image the thread itself published still renders; it is not stock. */
  noPhoto?: boolean;

  // Cream & terracotta preset — optional and additive; the dark presets ignore them.
  /** The slash command / CLI invocation the slide teaches (`/tdd`). Drawn LTR in its own mono
   *  headline, kept out of `title` so bidi can't reorder it into "tdd/". */
  slashCommand?: string;
  /** One short Hebrew line under the headline, drawn in the accent colour. */
  subtitle?: string;
  /** The dark "HOW TO INSTALL" container. Drawn only when a field is set. */
  install?: InstallBlock;
  /** The node flowchart this slide is about — drives the `workflow-nodes` preset. */
  workflow?: WorkflowNode[];
}

/**
 * Renumbers step slides 1..N from their position.
 *
 * Defensive twin of the server-side pass: a deck can also arrive from cache, from the local
 * fallback, or from an older build, and the renderer only draws a badge when stepNumber > 0.
 * Deriving from position guarantees no step slide is ever left unbadged.
 */
export function renumberSteps<T extends { kind: string; stepNumber: number }>(slides: T[]): T[] {
  let seq = 0;
  for (const slide of slides) {
    slide.stepNumber = slide.kind === 'step' ? ++seq : 0;
  }
  return slides;
}

export interface TechTipDeck {
  title: string;
  slides: TechTipSlide[];
  hashtags: string[];
  synthesized: boolean;
  fallbackReason?: string;
  /** The Threads agent's read of the source thread's subject. Absent on Tech Tips decks. */
  topic?: { theme: ThreadTheme; badge: string; guideSlug: string; signals: string[] };
  createdAt: number;
}

const ENDPOINT = `${SITE_ORIGIN.replace(/\/$/, '')}/api/agent-generate`;

// ─── the tip "feed" ─────────────────────────────────────────────────────────────────────────

export interface TipTopic {
  id: string;
  label: string;
  topic: string;
  /** where this suggestion came from — curated shelf vs. today's live AI headlines */
  source: 'preset' | 'feed';
}

/** Curated shelf — the evergreen dev-education topics this brand actually teaches. */
export const TIP_PRESETS: TipTopic[] = [
  { id: 'rag-basics', label: 'RAG ב-20 שורות', topic: 'איך בונים RAG בסיסי שמאנדקס מסמכים ומחזיר תשובות מבוססות מקור — בקוד מינימלי', source: 'preset' },
  { id: 'mcp-tools', label: 'MCP — חיבור כלים לסוכן', topic: 'מה זה Model Context Protocol ואיך מחברים כלי חיצוני לסוכן AI, שלב אחר שלב', source: 'preset' },
  { id: 'prompt-eng', label: 'הנדסת פרומפטים מעשית', topic: 'חמישה דפוסי פרומפט שמשפרים תוצאות מיידית, עם דוגמאות קוד לקריאות API', source: 'preset' },
  { id: 'agent-guardrails', label: 'Guardrails לסוכנים', topic: 'איך מגנים על סוכן AI מפני Prompt Injection ודליפת מידע — דפוסים וקוד', source: 'preset' },
  { id: 'py-tricks', label: 'טריקים ב-Python', topic: 'טריקים ב-Python שכל מפתח שעובד עם AI צריך להכיר — comprehensions, dataclasses, async', source: 'preset' },
  { id: 'ts-strict', label: 'TypeScript מחמיר', topic: 'דפוסי TypeScript שמונעים באגים בזמן ריצה — narrowing, discriminated unions, satisfies', source: 'preset' },
  { id: 'embeddings', label: 'Embeddings וחיפוש סמנטי', topic: 'איך עובד חיפוש סמנטי עם embeddings ואיך מיישמים אותו בפועל עם vector store', source: 'preset' },
  { id: 'streaming', label: 'סטרימינג של תשובות LLM', topic: 'איך מזרימים תשובות מ-LLM למשתמש בזמן אמת — SSE, ReadableStream, וטיפול בשגיאות', source: 'preset' },
  { id: 'devtools-2026', label: 'כלי פיתוח AI שווים', topic: 'כלי פיתוח מבוססי AI ששווה להכיר — מה כל אחד עושה בפועל ומתי להשתמש בו', source: 'preset' },
  { id: 'cost-control', label: 'שליטה בעלויות LLM', topic: 'איך מורידים עלויות של קריאות LLM בייצור — caching, routing, וצמצום טוקנים', source: 'preset' },
];

/** Live half of the feed: today's AI/dev headlines from the site's own sanitized Hebrew stream,
 * reshaped into "explain this as a dev tip" topics. Best-effort — returns [] on any failure. */
export async function fetchTipFeed(limit = 8): Promise<TipTopic[]> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    let items: NewsItem[] = [];
    try {
      const res = await fetch(`${SITE_ORIGIN.replace(/\/$/, '')}/api/news`, {
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { items?: NewsItem[] };
      items = Array.isArray(data.items) ? data.items : [];
    } finally {
      clearTimeout(timer);
    }
    return items
      .filter((i) => i.topic === 'ai' || i.topic === 'cloud')
      .slice(0, limit)
      .map((i) => ({
        id: `feed-${i.id}`,
        label: i.title.slice(0, 60),
        topic: `הסבר למפתחים, כמדריך מעשי עם קוד: ${i.title}. ${(i.summary || i.excerpt || '').slice(0, 400)}`,
        source: 'feed' as const,
      }));
  } catch {
    return [];
  }
}

// ─── deck synthesis ─────────────────────────────────────────────────────────────────────────

async function post(body: Record<string, unknown>, timeoutMs = 90000): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(getAdminSecret() ? { 'x-admin-secret': getAdminSecret() } : {}),
  };
  const payload = JSON.stringify({ action: 'tech-tip-deck', ...body });
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
      let waitMs = 6000;
      try {
        const j = (await res.clone().json()) as { retryAfterSeconds?: number };
        if (typeof j.retryAfterSeconds === 'number') waitMs = Math.min(12000, Math.max(3000, j.retryAfterSeconds * 1000));
      } catch {
        /* keep default */
      }
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

const VISUAL_BASE =
  'abstract dark cyber technology background, deep obsidian, subtle circuit and node grid geometry, neon green and cyan accents, no text, no people, cinematic depth';

/** Deterministic local deck — real structure with the operator's own topic, used whenever AI
 * synthesis is unavailable. Deliberately honest: it does NOT invent code, it prompts for it. */
function buildFallbackDeck(topic: string, reason: string): TechTipDeck {
  const short = topic.trim().slice(0, 90);
  const slides: TechTipSlide[] = [
    { kind: 'cover', kicker: 'מדריך', title: short, body: 'מדריך קצר למפתחים — הרעיון, הקוד, והצעדים המעשיים.', bullets: [], code: '', codeLang: '', stepNumber: 0, visualPrompt: VISUAL_BASE },
    { kind: 'concept', kicker: 'הרעיון', title: 'מה זה בעצם', body: `${short} — כאן נכנס ההסבר הקצר של הרעיון: מה הבעיה שהוא פותר ולמי זה רלוונטי.`, bullets: [], code: '', codeLang: '', stepNumber: 0, visualPrompt: VISUAL_BASE },
    { kind: 'step', kicker: 'שלב 1', title: 'הכנה', body: 'התקינו את התלויות והגדירו את משתני הסביבה הנדרשים.', bullets: [], code: '', codeLang: '', stepNumber: 1, visualPrompt: VISUAL_BASE },
    { kind: 'step', kicker: 'שלב 2', title: 'מימוש', body: 'כתבו את הליבה — פונקציה אחת שעושה את העבודה, בלי הפשטות מיותרות.', bullets: [], code: '', codeLang: '', stepNumber: 2, visualPrompt: VISUAL_BASE },
    { kind: 'step', kicker: 'שלב 3', title: 'בדיקה', body: 'הריצו על מקרה אמיתי אחד, ומדדו את התוצאה מול קריטריון ברור.', bullets: [], code: '', codeLang: '', stepNumber: 3, visualPrompt: VISUAL_BASE },
    { kind: 'takeaway', kicker: 'לסיכום', title: 'מה לוקחים מכאן', body: '', bullets: ['התחילו מתהליך אחד קטן', 'מדדו לפני שמרחיבים', 'אבטחה כברירת מחדל, לא כתוספת'], code: '', codeLang: '', stepNumber: 0, visualPrompt: VISUAL_BASE },
    { kind: 'cta', kicker: 'צעד הבא', title: 'רוצים את המדריך המלא?', body: 'עוד מדריכים, כלים ודוגמאות קוד — ב-mrdaniel.co.il. עקבו לעוד תוכן על AI, סייבר ופיתוח.', bullets: [], code: '', codeLang: '', stepNumber: 0, visualPrompt: VISUAL_BASE },
  ];
  return {
    title: short,
    slides,
    hashtags: ['#פיתוח', '#AI', '#קוד', '#כלים_למפתחים'],
    synthesized: false,
    fallbackReason: reason,
    createdAt: Date.now(),
  };
}

export async function synthesizeTechTipDeck(topic: string, notes?: string): Promise<TechTipDeck> {
  if (topic.trim().length < 8) return buildFallbackDeck(topic || 'מדריך', 'הנושא קצר מדי לסינתוז AI');
  try {
    const res = await post({ topic, notes });
    if (!res.ok) return buildFallbackDeck(topic, (await describeAiError(res)).message);
    const data = (await res.json()) as { ok?: boolean; blocked?: boolean; deck?: { title: string; slides: TechTipSlide[]; hashtags: string[] } };
    if (data.blocked) return buildFallbackDeck(topic, 'הפלט נחסם ע"י מסנן התוכן');
    if (!data.ok || !data.deck || !Array.isArray(data.deck.slides) || data.deck.slides.length < 5) {
      return buildFallbackDeck(topic, 'מנוע ה-AI לא החזיר דק שמיש');
    }
    return {
      title: data.deck.title || topic,
      slides: renumberSteps(data.deck.slides),
      hashtags: data.deck.hashtags?.length ? data.deck.hashtags : ['#פיתוח', '#AI', '#קוד'],
      synthesized: true,
      createdAt: Date.now(),
    };
  } catch (e) {
    return buildFallbackDeck(topic, (e as Error).message || 'שגיאת רשת מול מנוע ה-AI');
  }
}

/** Ready-to-paste Instagram caption for the deck. */
export function tipDeckCaption(deck: TechTipDeck): string {
  const first = deck.slides.find((s) => s.body)?.body || '';
  return [deck.title, '', first.slice(0, 220), '', 'החליקו לכל השקפים ➔', 'עוד מדריכים ב-mrdaniel.co.il', '', deck.hashtags.join(' ')]
    .join('\n')
    .trim();
}
