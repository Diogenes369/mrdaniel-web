import { SITE_ORIGIN } from './useDashboardRefresh';
import { importUrl, parseRawText, stripAuthorNoise, cleanExtractedBody } from './repurposeApi';
import type { NewsTopic } from './newsAgentTypes';
import type { LayoutKind, ResearchBrief, SlideRole, StudioDeck, StudioPreset, StudioSlide, StudioTheme } from './carouselStudioTypes';
import { getAdminSecret } from './adminSecret';
import { describeAiError, aiRetryDelayMs } from './aiErrors';

/**
 * Agents 1 & 2 of the WEB3 Carousel Studio.
 *
 *  · researchSource()      — "Scraper & Researcher": pulls a clean brief from a URL / pasted text /
 *                            preset, then extracts candidate hooks + technical takeaways.
 *  · synthesizeStudioDeck() — "Copywriter & Hook Architect": calls /api/agent-generate
 *                            (action:'carousel-studio') for a 10–14 slide Hebrew script; on any
 *                            failure (429 / 503 / network / thin output) falls back to a
 *                            deterministic local builder. NEVER throws.
 */

const ENDPOINT = `${SITE_ORIGIN.replace(/\/$/, '')}/api/agent-generate`;

async function post(body: Record<string, unknown>, timeoutMs = 90000): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(getAdminSecret() ? { 'x-admin-secret': getAdminSecret() } : {}),
  };
  const payload = JSON.stringify({ action: 'carousel-studio', ...body });
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

// ─── sentence helpers ──────────────────────────────────────────────────────────────────────

function splitSentences(text: string): string[] {
  return (text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

const CONTRARIAN = /(?:רוב האנשים|טעות נפוצה|בניגוד|לא מה שחושבים|האמת היא|בפועל|מסתבר ש|כדאי לדעת|רבים מפספסים)/;
const HAS_NUMBER = /\d|אחוז|פי \d|פי שניים|פי שלושה|פי ארבעה|מיליון|מיליארד/;

/** Candidate scroll-stopping hooks: questions, contrarian statements, then the strongest openers. */
function extractHooks(sentences: string[], title: string): string[] {
  const scored = sentences
    .map((s) => {
      let score = 0;
      if (/\?$/.test(s)) score += 3;
      if (CONTRARIAN.test(s)) score += 3;
      if (HAS_NUMBER.test(s)) score += 1;
      if (s.length >= 40 && s.length <= 140) score += 1;
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);
  const out = [...new Set([title.trim(), ...scored, ...sentences.slice(0, 3)])].filter(Boolean);
  return out.slice(0, 5);
}

/** Key technical takeaways: sentences carrying numbers, product/tech names, or "how it works". */
function extractTakeaways(sentences: string[]): string[] {
  const TECH = /(?:RAG|Zero-Trust|Prompt Injection|API|LLM|Guardian|EDR|XDR|IAM|Entra|Micro-Segmentation|Wi-Fi 7|Web3|WebGL|chain-of-thought|evals?)/i;
  const picked = sentences
    .map((s) => {
      let score = 0;
      if (HAS_NUMBER.test(s)) score += 2;
      if (TECH.test(s)) score += 2;
      if (/(?:שלב|ראשון|שני|שלישי|הצעד|הפתרון|המשמעות|לכן|כדי)/.test(s)) score += 1;
      return { s, score };
    })
    .filter((x) => x.score > 1)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s.replace(/^[,;:–—-]\s*/, ''));
  return [...new Set(picked)].slice(0, 8);
}

// ─── Agent 1 · Scraper & Researcher ────────────────────────────────────────────────────────

export interface ResearchInput {
  mode: 'url' | 'text' | 'preset';
  url?: string;
  rawText?: string;
  preset?: StudioPreset;
  topic: NewsTopic;
}

export async function researchSource(input: ResearchInput): Promise<{ brief: ResearchBrief; notice?: string }> {
  if (input.mode === 'preset' && input.preset) {
    const p = input.preset;
    const sentences = splitSentences(p.brief);
    return {
      brief: {
        title: p.title,
        body: p.brief,
        sourceLabel: 'תדריך מובנה',
        sourceLink: '',
        imageUrl: '',
        hooks: extractHooks(sentences, p.title),
        takeaways: extractTakeaways(sentences),
        theme: `${p.label} · ${p.topic}`,
        via: 'preset',
      },
    };
  }

  if (input.mode === 'text') {
    const parsed = parseRawText(input.rawText || '');
    const body = parsed.body || cleanExtractedBody(input.rawText || '', parsed.title);
    const sentences = splitSentences(body);
    return {
      brief: {
        title: parsed.title || 'תוכן חופשי',
        body,
        sourceLabel: parsed.link ? new URL(parsed.link).hostname.replace(/^www\./, '') : 'טקסט חופשי',
        sourceLink: parsed.link,
        imageUrl: '',
        hooks: extractHooks(sentences, parsed.title),
        takeaways: extractTakeaways(sentences),
        theme: input.topic,
        via: 'manual',
      },
      notice: body.length < 200 ? 'הטקסט קצר — מומלץ להוסיף עוד תוכן לפני יצירת הקרוסלה.' : undefined,
    };
  }

  // URL
  let notice: string | undefined;
  const hostOf = (u: string): string => {
    try {
      return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };
  const c = await importUrl(input.url || ''); // throws on hard failure — caller surfaces it
  const title = stripAuthorNoise(c.title || '')
    .replace(/\s*[|｜]\s*[^|]{2,40}$/u, '')
    .trim();
  const body = c.body || '';
  const sentences = splitSentences(body);
  if (c.via === 'jina') notice = 'התוכן חולץ דרך קורא חיצוני — עברו על הטקסט לפני יצירה.';
  if (body.length < 200) notice = 'חולץ תוכן חלקי בלבד — השלימו את גוף הטקסט ידנית לתוצאה מלאה.';
  return {
    brief: {
      title: title || 'כתבה',
      body,
      sourceLabel: c.source || hostOf(input.url || ''),
      sourceLink: c.url || (input.url || '').trim(),
      imageUrl: c.image || '',
      hooks: extractHooks(sentences, title),
      takeaways: extractTakeaways(sentences),
      theme: input.topic,
      via: c.via,
    },
    notice,
  };
}

// ─── Agent 2 · Copywriter & Hook Architect ─────────────────────────────────────────────────

export interface ApiSlide {
  role?: string;
  layout?: string;
  kicker?: string;
  headline?: string;
  subhead?: string;
  body?: string;
  bullets?: string[];
  bulletsLeft?: string[];
  columnLabels?: [string, string] | null;
  stat?: string;
  code?: string;
  quote?: string;
  readingTime?: string;
}

export function toStudioSlide(s: ApiSlide, index: number): StudioSlide {
  const role: SlideRole = s.role === 'hook' ? 'hook' : s.role === 'cta' ? 'cta' : 'value';
  const layout = (s.layout || (role === 'hook' ? 'hero' : role === 'cta' ? 'cta' : 'value')) as LayoutKind;
  return {
    id: `s${index}-${Math.random().toString(36).slice(2, 7)}`,
    index,
    role,
    layout,
    kicker: s.kicker || 'תובנה',
    headline: s.headline || '',
    subhead: s.subhead || '',
    body: s.body || '',
    bullets: Array.isArray(s.bullets) ? s.bullets.filter(Boolean) : [],
    bulletsLeft: Array.isArray(s.bulletsLeft) ? s.bulletsLeft.filter(Boolean) : [],
    columnLabels: Array.isArray(s.columnLabels) && s.columnLabels.length === 2 ? [s.columnLabels[0], s.columnLabels[1]] : null,
    stat: s.stat || '',
    code: s.code || '',
    quote: s.quote || '',
    readingTime: s.readingTime || '',
    accent: 'green',
    glow: 0.5,
  };
}

function estimateReadingTime(body: string): string {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const min = Math.max(2, Math.round(words / 180));
  return `${min} דק׳ קריאה`;
}

/** Deterministic fallback deck — used when the AI endpoint is unavailable / rate-limited. Builds a
 * real 10–12 slide carousel from the research brief so generation never stops. */
export function buildDeckFallback(brief: ResearchBrief, topic: NewsTopic, reason: string, theme: StudioTheme = 'web3'): StudioDeck {
  const sentences = splitSentences(brief.body);
  const takeaways = brief.takeaways.length ? brief.takeaways : sentences.slice(0, 8);
  const hook = brief.hooks[0] || brief.title;

  const slides: StudioSlide[] = [];
  const push = (p: Partial<StudioSlide> & { role: SlideRole; layout: LayoutKind }) =>
    slides.push(toStudioSlide({ ...p } as ApiSlide, slides.length));

  // 1 · hero
  push({
    role: 'hook',
    layout: 'hero',
    kicker: 'הנושא',
    headline: brief.title,
    subhead: hook !== brief.title ? hook : brief.hooks[1] || 'מה שרוב האנשים מפספסים — ואיך לעשות את זה נכון.',
    readingTime: estimateReadingTime(brief.body),
  });

  // 2 · opening value paragraph
  if (sentences.length) {
    push({ role: 'value', layout: 'value', kicker: 'רקע', headline: 'למה זה חשוב עכשיו', body: sentences.slice(0, 3).join(' ') });
  }

  // 3 · checklist of the key takeaways
  if (takeaways.length >= 3) {
    push({
      role: 'value',
      layout: 'checklist',
      kicker: 'הנקודות',
      headline: 'מה חשוב לקחת מכאן',
      bullets: takeaways.slice(0, 5).map((t) => t.replace(/\s+/g, ' ').slice(0, 110)),
    });
  }

  // 4..N · one value slide per remaining takeaway, alternating layout for variety
  const rest = takeaways.slice(3);
  const midSentences = sentences.slice(3);
  rest.forEach((t, i) => {
    if (slides.length >= 10) return;
    const statMatch = t.match(/(\d[\d.,]*\s?%|פי \d+|\d[\d.,]*\s?(?:מיליון|מיליארד))/);
    if (statMatch && i % 3 === 0) {
      push({ role: 'value', layout: 'stat', kicker: 'נתון', headline: 'המספר שמספר את הסיפור', stat: statMatch[1], body: t });
    } else {
      const extra = midSentences[i + 1] ? ` ${midSentences[i + 1]}` : '';
      push({ role: 'value', layout: 'value', kicker: `שלב ${i + 1}`, headline: `נקודה ${i + 1}`, body: (t + extra).slice(0, 380) });
    }
  });

  // penultimate · pull quote
  const quote = sentences.find((s) => s.length > 40 && s.length < 150 && s !== hook) || hook;
  if (quote) {
    push({ role: 'value', layout: 'quote', kicker: 'בשורה התחתונה', quote, body: 'הפער בין מי שמבין את זה למי שלא — רק ילך ויגדל.' });
  }

  // last · CTA
  push({
    role: 'cta',
    layout: 'cta',
    kicker: 'צעד הבא',
    headline: 'רוצים ליישם את זה נכון?',
    body: 'המדריך המלא, כלים ודוגמאות — ב-mrdaniel.co.il. עקבו לעוד פירוקים של AI.',
  });

  return {
    slides: slides.map((s, i) => ({ ...s, index: i })),
    topic,
    title: brief.title,
    sourceLabel: brief.sourceLabel,
    sourceLink: brief.sourceLink,
    caption: deckCaption(brief.title, slides),
    hashtags: topicHashtags(topic),
    synthesized: false,
    fallbackReason: reason,
    theme,
    createdAt: Date.now(),
  };
}

export async function synthesizeStudioDeck(
  brief: ResearchBrief,
  topic: NewsTopic,
  theme: StudioTheme = 'web3'
): Promise<StudioDeck> {
  if (brief.body.trim().length < 40) {
    return buildDeckFallback(brief, topic, 'טקסט המקור קצר מדי לשכתוב AI', theme);
  }
  try {
    const res = await post({
      title: brief.title,
      source: brief.sourceLabel,
      topic,
      brief: brief.body,
      takeaways: brief.takeaways,
    });
    if (!res.ok) return buildDeckFallback(brief, topic, (await describeAiError(res)).message, theme);
    const data = (await res.json()) as { ok?: boolean; blocked?: boolean; deck?: ApiSlide[] };
    if (data.blocked) return buildDeckFallback(brief, topic, 'הפלט נחסם ע"י מסנן התוכן', theme);
    if (!data.ok || !Array.isArray(data.deck) || data.deck.length < 5) {
      return buildDeckFallback(brief, topic, 'מנוע ה-AI לא החזיר קרוסלה שמישה', theme);
    }
    let slides = data.deck.map(toStudioSlide).map((s, i) => ({ ...s, index: i }));
    // hero needs a reading-time; the engine may omit it
    if (slides[0] && !slides[0].readingTime) slides[0].readingTime = estimateReadingTime(brief.body);
    // fill an empty CTA from the standard branded copy
    const cta = slides[slides.length - 1];
    if (cta && cta.role === 'cta') {
      if (!cta.headline) cta.headline = 'רוצים ליישם את זה נכון?';
      if (!cta.body) cta.body = 'המדריך המלא, כלים ודוגמאות — ב-mrdaniel.co.il. עקבו לעוד פירוקים של AI.';
    }
    slides = slides.filter((s) => s.headline || s.body || s.bullets.length || s.quote || s.code || s.stat || s.role === 'cta');
    return {
      slides: slides.map((s, i) => ({ ...s, index: i })),
      topic,
      title: brief.title,
      sourceLabel: brief.sourceLabel,
      sourceLink: brief.sourceLink,
      caption: deckCaption(brief.title, slides),
      hashtags: topicHashtags(topic),
      synthesized: true,
      theme,
      createdAt: Date.now(),
    };
  } catch (e) {
    return buildDeckFallback(brief, topic, (e as Error).message || 'שגיאת רשת מול מנוע ה-AI', theme);
  }
}

// ─── caption + hashtags ────────────────────────────────────────────────────────────────────

function topicHashtags(topic: NewsTopic): string[] {
  const base: Record<NewsTopic, string[]> = {
    ai: ['#בינה_מלאכותית', '#סוכני_AI', '#AI', '#אוטומציה', '#פרודוקטיביות'],
    ai_models: ['#מודלי_AI', '#LLM', '#GenerativeAI', '#AI', '#MachineLearning'],
    ai_agents: ['#בינה_מלאכותית', '#סוכני_AI', '#AI', '#אוטומציה', '#פרודוקטיביות'],
    general: ['#טכנולוגיה', '#חדשנות', '#הייטק', '#Tech', '#דיגיטל'],
  };
  return [...(base[topic] || base.general), '#mrdaniel'];
}

function deckCaption(title: string, slides: StudioSlide[]): string {
  const hook = slides.find((s) => s.role === 'hook');
  const first = hook?.subhead || slides.find((s) => s.body)?.body || '';
  return [
    stripAuthorNoise(title).trim(),
    '',
    first.slice(0, 220),
    '',
    'החליקו לכל השקפים ➔',
    'המדריך המלא ב-mrdaniel.co.il',
  ]
    .join('\n')
    .trim();
}

export { deckCaption };
