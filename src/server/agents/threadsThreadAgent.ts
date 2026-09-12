import { synthesizeThreadDeck, ModelOutputError, stripSourceCredits } from '../../agent/SocialAgentEngine.js';
import { sanitizeHebrewText } from '../../agent/hebrewTextSanitizer.js';
import { STATIC_GUIDES } from '../leadMagnets.js';
import type { TechTipDeck, TechTipSlide, ThreadTheme } from '../../agent/types.js';
import type { ImportedThread } from '../threadsThreadFetcher.js';

/**
 * Threads thread → contextual Hebrew carousel. The agent half of the pipeline whose other half is
 * `src/server/threadsThreadFetcher.ts`; driven by /api/agent-generate · action:"thread-deck".
 *
 * The fetcher answers "what did the author actually write". This module answers "what should that
 * look like": it reads the thread's own subject matter, assigns a theme (accent colour, topic
 * badge, CTA guide), asks the engine for the Hebrew adaptation, then lays the result out as slides
 * — cover, one numbered slide per sub-post, prompts and code isolated into their own containers,
 * and a CTA pointing at whichever live guide actually matches the topic.
 *
 * Division of labour, deliberately: the LANGUAGE is the model's job (it translates and adapts), the
 * STRUCTURE is this module's (numbering, themes, images, CTA). Layout decisions made in code are
 * deterministic and testable; asking the model for them produced a deck that drifted every run.
 */

// ─── topic analysis ─────────────────────────────────────────────────────────────────────────

export interface ThreadTopicProfile {
  theme: ThreadTheme;
  /** Topic chip drawn on every slide. A named product wins over the generic family label. */
  badge: string;
  /** `/g/<slug>` the CTA promotes, or '' when no live guide fits the topic. */
  guideSlug: string;
  /** Signals that fired, in order — surfaced in the dashboard so the operator sees the reasoning. */
  signals: string[];
}

interface ThemeRule {
  theme: ThreadTheme;
  badge: string;
  re: RegExp;
  /** Which live guide this family sells. Validated against STATIC_GUIDES before it becomes a link. */
  guideSlug: string;
}

/**
 * Subject families, most specific first. A thread is scored against all of them and the highest
 * match count wins; ties go to the earlier rule, so "an AI agent that scans for vulnerabilities"
 * lands on security rather than the broader AI bucket only when the security words genuinely
 * outnumber the AI ones.
 */
const THEME_RULES: ThemeRule[] = [
  {
    theme: 'security',
    badge: 'Cyber Security',
    guideSlug: 'ai-business-automations-2026',
    re: /\b(security|cyber(?:security)?|vulnerabilit(?:y|ies)|exploit|ransomware|phishing|malware|zero[- ]?trust|prompt injection|jailbreak|cve-?\d|pentest|breach|attack surface|encryption|threat)\b|סייבר|אבטח|פריצה|חדיר|כופר|הצפנ/i,
  },
  {
    theme: 'web3',
    badge: 'Web3',
    guideSlug: 'ai-learning-guide-2026',
    re: /\b(web3|blockchain|solidity|ethereum|smart ?contract|on-?chain|nft|defi|wallet|crypto(?:currency)?|token(?:omics)?)\b|בלוקצ|קריפטו|חוזה חכם/i,
  },
  {
    theme: 'automation',
    badge: 'Automation',
    guideSlug: 'ai-business-automations-2026',
    re: /\b(automation|automate|workflow|n8n|zapier|make\.com|webhook|no-?code|low-?code|pipeline|orchestrat|zero[- ]?touch|cron|trigger|integration)\b|אוטומצ|תהליך אוטומטי|זרימת עבודה/i,
  },
  {
    theme: 'ai',
    badge: 'AI & LLM',
    guideSlug: 'ai-learning-guide-2026',
    re: /\b(ai|a\.i\.|llm|gpt|gemini|claude|openai|anthropic|copilot|chatgpt|prompt(?:ing)?|rag|embedding|fine-?tun|inference|token|agent(?:ic|s)?|mcp|context window|hallucinat|multimodal|transformer|neural)\b|בינה מלאכותית|מודל שפה|סוכן ai|פרומפט/i,
  },
  {
    theme: 'data',
    badge: 'Data',
    guideSlug: 'ai-learning-guide-2026',
    re: /\b(data(?:base|set)?|sql|postgres(?:ql)?|mysql|mongo(?:db)?|vector (?:db|store|database)|analytics|etl|warehouse|bigquery|snowflake|query|schema|index(?:ing)?)\b|נתונים|מסד נתונים|אנליטיק/i,
  },
  {
    theme: 'code',
    badge: 'Engineering',
    guideSlug: 'ai-business-automations-2026',
    re: /\b(python|typescript|javascript|react|node(?:\.js)?|rust|golang|docker|kubernetes|k8s|terraform|git(?:hub)?|npm|regex|refactor|deploy(?:ment)?|api|sdk|framework|library|repo(?:sitory)?|compil|debug)\b|קוד|תכנות|מפתחים|פיתוח/i,
  },
];

/**
 * Named products worth putting on the badge instead of the family label.
 *
 * "Gemini AI" tells the reader what the deck is about at a glance; "AI & LLM" does not. Latin brand
 * names stay Latin — transliterating them into Hebrew is exactly the machine-translation tell the
 * copy rules forbid. Matched on word boundaries so "Go" cannot fire on "Google".
 */
const BRAND_BADGES: { re: RegExp; label: string }[] = [
  { re: /\bgemini\b/i, label: 'Gemini AI' },
  { re: /\bclaude\b/i, label: 'Claude AI' },
  { re: /\b(chatgpt|gpt-?[45](?:\.\d)?|openai)\b/i, label: 'OpenAI GPT' },
  { re: /\b(copilot|github copilot)\b/i, label: 'GitHub Copilot' },
  { re: /\bmcp\b|model context protocol/i, label: 'MCP' },
  { re: /\brag\b|retrieval[- ]augmented/i, label: 'RAG' },
  { re: /\bn8n\b/i, label: 'n8n' },
  { re: /\bzapier\b/i, label: 'Zapier' },
  { re: /\blangchain\b/i, label: 'LangChain' },
  { re: /\b(kubernetes|k8s)\b/i, label: 'Kubernetes' },
  { re: /\bdocker\b/i, label: 'Docker' },
  { re: /\bpython\b/i, label: 'Python' },
  { re: /\btypescript\b/i, label: 'TypeScript' },
  { re: /\breact\b/i, label: 'React' },
  { re: /\bsolidity\b/i, label: 'Solidity' },
  { re: /\bprompt injection\b/i, label: 'Prompt Injection' },
  { re: /\bzero[- ]?trust\b/i, label: 'Zero Trust' },
];

/** How many distinct matches a rule scores against the thread. */
function score(text: string, re: RegExp): number {
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  const hits = text.match(global);
  if (!hits) return 0;
  return new Set(hits.map((h) => h.toLowerCase())).size;
}

/** A slug only becomes a link when the guide is actually registered and live. */
function liveGuide(slug: string): string {
  return STATIC_GUIDES.some((g) => g.slug === slug) ? slug : '';
}

/**
 * The thread's subject family, its badge and the guide its CTA should promote.
 *
 * Reads the thread's own words only — never the author's handle or the URL, which say nothing
 * about the content and would let one prolific account pin every deck to the same theme.
 */
export function analyzeThreadTopic(threadText: string): ThreadTopicProfile {
  const text = String(threadText || '').slice(0, 12000);
  const scored = THEME_RULES.map((rule) => ({ rule, n: score(text, rule.re) })).filter((s) => s.n > 0);
  scored.sort((a, b) => b.n - a.n || THEME_RULES.indexOf(a.rule) - THEME_RULES.indexOf(b.rule));

  const winner = scored[0]?.rule;
  const brand = BRAND_BADGES.find((b) => b.re.test(text));
  const signals = scored.slice(0, 3).map((s) => `${s.rule.theme}×${s.n}`);
  if (brand) signals.unshift(brand.label);

  if (!winner) {
    return { theme: 'general', badge: brand?.label ?? 'Tech', guideSlug: liveGuide('ai-learning-guide-2026'), signals };
  }
  return {
    theme: winner.theme,
    badge: brand?.label ?? winner.badge,
    guideSlug: liveGuide(winner.guideSlug),
    signals,
  };
}

// ─── prompt & code isolation ────────────────────────────────────────────────────────────────

/**
 * Prompts the author quoted in the thread, in order.
 *
 * A thread that teaches prompting embeds the prompt itself, and burying it in a body paragraph
 * wastes the single most screenshot-worthy thing in the post. Three shapes are recognised, all of
 * them explicit — nothing is inferred from prose alone, because a false positive would pull a
 * normal sentence into a code box and make the slide look broken:
 *   1. a fenced block (``` … ```)
 *   2. text after an explicit "Prompt:" / "System prompt:" / "הפרומפט:" label
 *   3. a long fully-quoted run ("…") of at least 60 characters
 */
export function extractPrompts(posts: string[]): string[] {
  const out: string[] = [];
  const push = (raw: string) => {
    const text = raw.replace(/^\s+|\s+$/g, '').replace(/\s*\n\s*\n\s*/g, '\n');
    if (text.length >= 40 && text.length <= 700) out.push(text.slice(0, 700));
  };

  for (const post of posts) {
    const body = String(post ?? '');
    for (const m of body.matchAll(/```[a-z]*\n?([\s\S]*?)```/gi)) push(m[1]);
    for (const m of body.matchAll(
      /^[ \t]*(?:system[ \t]+)?(?:prompt|instruction)s?[ \t]*:[ \t]*\n?([\s\S]*?)(?=\n[ \t]*\n|$)/gim
    )) {
      push(m[1]);
    }
    for (const m of body.matchAll(/^[ \t]*(?:הפרומפט|פרומפט|ההוראה)[ \t]*:[ \t]*\n?([\s\S]*?)(?=\n[ \t]*\n|$)/gim)) {
      push(m[1]);
    }
    for (const m of body.matchAll(/["“]([^"”]{60,600})["”]/g)) push(m[1]);
  }
  // The same prompt is often restated in a later post; the box should show it once.
  const seen = new Set<string>();
  return out.filter((p) => {
    const key = p.toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── slide layout ───────────────────────────────────────────────────────────────────────────

/** The CTA copy, per theme. Promises only what the linked guide actually delivers. */
const CTA_COPY: Record<ThreadTheme, { title: string; body: string }> = {
  ai: { title: 'רוצים להעמיק?', body: 'המדריך המלא ללימוד ויישום בינה מלאכותית — להורדה חינם.' },
  automation: { title: 'רוצים לבנות את זה בעסק?', body: 'המדריך המלא לאוטומציות AI ובניית סוכנים — להורדה חינם.' },
  security: { title: 'רוצים לעשות את זה בבטחה?', body: 'המדריך המלא לאוטומציה עם פרק שלם על אבטחה ו-Prompt Injection.' },
  code: { title: 'רוצים את זה בקוד?', body: 'המדריך המלא לבניית סוכנים וחיבור מערכות — להורדה חינם.' },
  data: { title: 'רוצים להעמיק בנתונים?', body: 'המדריך המלא ל-RAG, חיפוש סמנטי וחיבור ידע למודל.' },
  web3: { title: 'רוצים ללמוד עוד?', body: 'המדריך המלא לבינה מלאכותית ולטכנולוגיות שמאחוריה.' },
  general: { title: 'רוצים את המדריך המלא?', body: 'עוד מדריכים, כלים ודוגמאות מעשיות — להורדה חינם.' },
};

const SITE = 'https://mrdaniel.co.il';

/**
 * Applies the visual layout to an adapted deck: theme, badges, step indicators, prompt boxes,
 * the thread's own images, and the CTA link.
 *
 * Runs over whatever the engine produced rather than asking the model to produce it, so the same
 * rules apply to the AI deck and to the local fallback below, and a model that ignores an
 * instruction cannot break the numbering.
 */
function layOutDeck(deck: TechTipDeck, thread: ImportedThread, topic: ThreadTopicProfile): TechTipDeck {
  const slides = deck.slides;
  if (!slides.length) return deck;

  // Content slides are everything between the cover and the CTA — the sub-post body of the thread.
  const firstContent = 1;
  const lastContent = slides.length - 2;
  const contentCount = Math.max(0, lastContent - firstContent + 1);

  // Images and prompts are consumed in thread order across the content slides, so slide N tends to
  // carry the media that came from roughly that point in the thread.
  const images = [...thread.images];
  const prompts = extractPrompts(thread.posts);
  const ctaUrl = topic.guideSlug ? `${SITE}/g/${topic.guideSlug}` : SITE;

  slides.forEach((slide, i) => {
    slide.theme = topic.theme;
    slide.badge = topic.badge;

    if (i >= firstContent && i <= lastContent && contentCount > 0) {
      slide.stepLabel = `${i - firstContent + 1} / ${contentCount}`;
      // A slide that already carries real code keeps it; the prompt box is for the slides that
      // don't, so the two never compete for the same panel.
      if (!slide.code.trim() && prompts.length) slide.promptBox = prompts.shift();
      if (images.length) slide.sourceImage = images.shift();
    }
  });

  const cover = slides[0];
  if (cover.kind === 'cover' && !cover.sourceImage && thread.images.length) {
    // The thread's lead image is the strongest cover backdrop available — better than a generated
    // one, because it is what the post itself showed.
    cover.sourceImage = thread.images[0];
  }

  const cta = slides[slides.length - 1];
  if (cta.kind === 'cta') {
    const copy = CTA_COPY[topic.theme];
    cta.ctaUrl = ctaUrl;
    cta.stepLabel = undefined;
    if (!cta.title.trim()) cta.title = copy.title;
    if (!cta.body.trim()) cta.body = copy.body;
  }

  return { ...deck, slides };
}

// ─── deterministic fallback ─────────────────────────────────────────────────────────────────

const NEUTRAL_VISUAL =
  'abstract dark cyber technology background, deep obsidian, circuit and node grid geometry, neon green and cyan accents, no text, no letters, no words, no logos, no watermark';

function blankSlide(partial: Partial<TechTipSlide> & Pick<TechTipSlide, 'kind'>): TechTipSlide {
  return {
    kicker: 'מהשרשור',
    title: '',
    body: '',
    bullets: [],
    code: '',
    codeLang: '',
    stepNumber: 0,
    visualPrompt: NEUTRAL_VISUAL,
    ...partial,
  };
}

function clampWords(text: string, max: number): string {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  return words.length <= max ? words.join(' ') : words.slice(0, max).join(' ').replace(/[,;:\-–—״"']+$/, '').trim();
}

/**
 * The source-faithful deck, built without the model.
 *
 * Used when the model answers with something structurally unusable — not when the API is down or
 * rate-limited, which must surface to the operator as the retryable error it is. Deliberately
 * honest: it does NOT machine-translate and does NOT invent Hebrew copy, it carries the source text
 * through one post per slide so the operator can see exactly what was imported and edit from there.
 * It still gets the full visual treatment, so a fallback deck looks like a deck, not like an error.
 */
export function buildLocalThreadDeck(thread: ImportedThread, topic: ThreadTopicProfile): TechTipDeck {
  const source = thread.posts.length ? thread.posts : [thread.text].filter(Boolean);
  const cover = clampWords(source[0] ?? 'שרשור מ-Threads', 8);
  const copy = CTA_COPY[topic.theme];

  const body = source.slice(1, 11).map((post, i) =>
    blankSlide({
      kind: 'concept',
      kicker: `חלק ${i + 1}`,
      title: clampWords(post.split('\n')[0] ?? '', 8),
      body: clampWords(post.replace(/\n+/g, ' '), 30),
    })
  );

  const deck: TechTipDeck = {
    title: cover,
    slides: [
      // No author credit on the cover — the only brand on generated output is mrdaniel.co.il.
      blankSlide({ kind: 'cover', kicker: 'טיוטה', title: cover, body: 'טקסט המקור כפי שיובא — לעריכה ידנית לפני פרסום.' }),
      ...body,
      blankSlide({ kind: 'cta', kicker: 'צעד הבא', title: copy.title, body: copy.body }),
    ],
    hashtags: ['#AI', '#אוטומציה', '#עסקים', '#טכנולוגיה'],
  };
  return layOutDeck(deck, thread, topic);
}

// ─── entry point ────────────────────────────────────────────────────────────────────────────

export interface ThreadDeckResult {
  deck: TechTipDeck;
  topic: ThreadTopicProfile;
  /** false when the model's output was unusable and this is the deterministic source-faithful deck */
  synthesized: boolean;
  /** why, when `synthesized` is false — shown on the dashboard's amber badge */
  fallbackReason?: string;
}

/** Whether a failure is the model producing junk (recoverable here) rather than the API being
 *  unavailable (which must reach the operator as a retryable 429/503, not a silent fallback). */
function isModelOutputFailure(err: unknown): boolean {
  if (err instanceof ModelOutputError) return true;
  return /too few usable thread slides|thread too short to adapt|no text in response/i.test(
    (err as Error)?.message ?? ''
  );
}

/**
 * Adapt an imported thread into a themed, laid-out Hebrew carousel.
 *
 * Throws only for failures the operator can act on (missing key, rate limit, network) — those keep
 * their classified status through api/agent-generate.ts's error handler.
 */
export async function buildThreadDeck(input: {
  thread: ImportedThread;
  notes?: string;
}): Promise<ThreadDeckResult> {
  const { thread, notes } = input;
  const topic = analyzeThreadTopic(thread.text || thread.posts.join('\n'));

  try {
    const raw = await synthesizeThreadDeck({
      posts: thread.posts,
      author: thread.author || undefined,
      sourceUrl: thread.url || undefined,
      notes: notes?.trim() || undefined,
    });
    return { deck: layOutDeck(raw, thread, topic), topic, synthesized: true };
  } catch (err) {
    if (!isModelOutputFailure(err)) throw err;
    console.warn('[threadsThreadAgent] model output unusable, serving source-faithful deck:', (err as Error).message);
    return {
      deck: buildLocalThreadDeck(thread, topic),
      topic,
      synthesized: false,
      fallbackReason: 'מנוע ה-AI לא החזיר דק שמיש — מוצג טקסט המקור לעריכה',
    };
  }
}

/**
 * Ready-to-paste caption for an adapted thread deck.
 *
 * Carries no source attribution, per the repo-wide rule that the only brand on generated output is
 * mrdaniel.co.il — `stripSourceCredits` enforces the same on the slide copy.
 */
export function threadDeckCaption(deck: TechTipDeck, topic: ThreadTopicProfile): string {
  const lead = deck.slides.find((s) => s.body)?.body ?? '';
  const link = topic.guideSlug ? `${SITE}/g/${topic.guideSlug}` : SITE;
  return [
    sanitizeHebrewText(stripSourceCredits(deck.title)),
    '',
    sanitizeHebrewText(stripSourceCredits(lead)).slice(0, 220),
    '',
    'החליקו לכל השקפים ➔',
    `המדריך המלא: ${link}`,
    '',
    deck.hashtags.join(' '),
  ]
    .join('\n')
    .trim();
}
