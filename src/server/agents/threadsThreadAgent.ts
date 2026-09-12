import { synthesizeThreadDeck, ModelOutputError, stripSourceCredits } from '../../agent/SocialAgentEngine.js';
import { sanitizeHebrewText } from '../../agent/hebrewTextSanitizer.js';
import { STATIC_GUIDES } from '../leadMagnets.js';
import type { TechTipDeck, TechTipSlide, ThreadTheme, ToolBrand } from '../../agent/types.js';
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
  /** The tool the thread as a whole is about, when one dominates. Drives the deck's logo mark. */
  tool?: ToolBrand;
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
  // Tested before the generic Claude AI badge: a post that teaches "point Claude Code at GLM-5.2"
  // mentions Claude too, but the model actually being taught is GLM. detectTool below is scored, not
  // first-match, so this rule's own weight is what decides it — see TOOL_RULES for the same fix.
  { re: /\bglm-?5(?:\.\d)?\b|\bz\.ai\b|\bzhipu\b/i, label: 'GLM' },
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

/**
 * Tools whose own mark and brand colour the deck should wear.
 *
 * Narrower than BRAND_BADGES on purpose: a badge is a text chip and any product name can fill one,
 * but this list only holds tools we can DRAW — each entry has a vector mark in the renderer's
 * TOOL_MARKS table. Ordered most specific first, so "Google AI Studio" resolves to Gemini rather
 * than to the generic Workspace family, and NotebookLM is tested before the Gemini pattern that
 * would otherwise swallow it.
 */
const TOOL_RULES: { tool: ToolBrand; re: RegExp }[] = [
  { tool: 'notebooklm', re: /\bnotebook\s?lm\b/i },
  { tool: 'veo', re: /\bveo\s?[0-9]?\b/i },
  { tool: 'gemini', re: /\bgemini\b|\bgoogle ai studio\b|\bnano\s?banana\b|\bgems?\b(?=\s*(?:->|→|›|»|>|:))/i },
  { tool: 'chatgpt', re: /\bchat\s?gpt\b|\bopenai\b|\bgpt-?[45](?:\.\d)?\b|\bsora\b|\bdall-?e\b/i },
  // GLM / Z.ai, tested before Claude: a post teaching "point Claude Code at GLM-5.2" is a GLM deck,
  // even though it also names Claude as the client. Scored like every other rule here — this wins
  // only when GLM's own mentions genuinely outnumber Claude's, exactly like the security-vs-AI tie
  // rule above.
  { tool: 'glm', re: /\bglm-?5(?:\.\d)?\b|\bz\.ai\b|\bzhipu\b/i },
  { tool: 'claude', re: /\bclaude\b|\banthropic\b/i },
  { tool: 'canva', re: /\bcanva\b/i },
  { tool: 'make', re: /\bmake\.com\b|\bintegromat\b/i },
  { tool: 'n8n', re: /\bn8n\b/i },
  { tool: 'perplexity', re: /\bperplexity\b/i },
  { tool: 'copilot', re: /\b(?:github\s+)?copilot\b/i },
  { tool: 'midjourney', re: /\bmid\s?journey\b/i },
  { tool: 'workspace', re: /\bgoogle\s+(?:workspace|docs|sheets|slides|drive|forms)\b|\bgmail\b/i },
];

/**
 * The tool a piece of text is actually about, or undefined.
 *
 * Scored rather than first-match: a thread that mentions ChatGPT once in an aside but walks the
 * reader through Gemini eight times is a Gemini deck. Ties go to the earlier (more specific) rule.
 */
export function detectTool(text: string): ToolBrand | undefined {
  const source = String(text || '').slice(0, 12000);
  const scored = TOOL_RULES.map((rule) => ({ rule, n: score(source, rule.re) })).filter((s) => s.n > 0);
  if (!scored.length) return undefined;
  scored.sort((a, b) => b.n - a.n || TOOL_RULES.indexOf(a.rule) - TOOL_RULES.indexOf(b.rule));
  return scored[0].rule.tool;
}

// ─── workflow paths ─────────────────────────────────────────────────────────────────────────

/** The separators authors write a UI path with: `Tools -> Canvas`, `Gems › Create New`. */
const PATH_SEP = /\s*(?:->|=>|→|➔|➜|›|»|>)\s*/;

/**
 * One leg of a UI path. Deliberately strict — it must open with a capital or a digit and run no
 * longer than a real menu label, because the whole point is to separate `Tools → Canvas` from a
 * sentence that merely happens to contain an arrow ("AI -> better results", which fails on the
 * lower-case second leg).
 */
const PATH_SEG = /^[A-Z0-9][A-Za-z0-9 .&+'’_-]{0,24}$/;

/**
 * The exact click-paths the thread told the reader to walk, in order.
 *
 * A how-to thread's most reusable sentence is the navigation line, and flattening it into a Hebrew
 * paragraph destroys it: menu labels are not translatable, and a reader following along needs the
 * literal English string that is printed in the product. Lifted here, they render as an LTR
 * breadcrumb instead of being paraphrased away.
 */
export function extractWorkflowPaths(posts: string[]): string[][] {
  const out: string[][] = [];
  const seen = new Set<string>();
  for (const post of posts) {
    for (const rawLine of String(post ?? '').split('\n')) {
      const line = rawLine
        .trim()
        // Leading list furniture only — `>` is a separator here, so it is never stripped.
        .replace(/^[\s\-*•‣▪]+/, '')
        // The sentence's closing punctuation is not part of the last menu label.
        .replace(/[.,;:!?)\]]+$/, '');
      if (!PATH_SEP.test(line)) continue;
      const raw = line.split(PATH_SEP).map((s) => s.trim());
      const segs = raw
        .map((s, i) => {
          // A path is almost never written on a line of its own — it is embedded in a sentence
          // ("Take the palette into Canva. Tools -> Brand Kit -> Add colours."), so the outer legs
          // arrive carrying prose. The first leg keeps only what follows the last sentence break,
          // the last leg only what precedes the first one; the middle legs are already clean.
          if (i === 0) return (s.split(/[.!?;:]/).pop() ?? s).trim();
          if (i === raw.length - 1) return (s.split(/[.!?;:,"'“”]/)[0] ?? s).trim();
          return s;
        })
        // "Open Gemini → Gems" names the same path as "Gemini → Gems"; the imperative and the
        // connective belong to the sentence, not to the breadcrumb the reader hunts for on screen.
        .map((s, i) =>
          i === 0
            ? s.replace(/^(?:open|go to|head to|navigate to|click|tap|select|then|next|now|and|so)\s+/i, '')
            : s
        )
        .filter(Boolean);
      if (segs.length < 2 || segs.length > 4) continue;
      if (!segs.every((s) => PATH_SEG.test(s) && s.split(/\s+/).length <= 3)) continue;
      const key = segs.join('>').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(segs);
    }
  }
  return out;
}

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
  const tool = detectTool(text);
  const signals = scored.slice(0, 3).map((s) => `${s.rule.theme}×${s.n}`);
  if (tool) signals.unshift(`🎨 ${tool}`);
  if (brand) signals.unshift(brand.label);

  if (!winner) {
    return { theme: 'general', badge: brand?.label ?? 'Tech', guideSlug: liveGuide('ai-learning-guide-2026'), tool, signals };
  }
  return {
    theme: winner.theme,
    badge: brand?.label ?? winner.badge,
    guideSlug: liveGuide(winner.guideSlug),
    tool,
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

/**
 * The closing slide's copy, per theme.
 *
 * Deliberately carries no link and no keyword: a URL painted into a PNG is not tappable, and a
 * carousel whose last slide is a link overlay reads as an ad rather than as a piece of teaching.
 * The guide link lives in the caption (`threadDeckCaption`), where a reader can actually use it.
 */
export const CTA_COPY: Record<ThreadTheme, { title: string; body: string }> = {
  ai: { title: 'זה כל התהליך', body: 'שמרו את הפוסט ותריצו את זה על המשימה הראשונה שלכם היום.' },
  automation: { title: 'עכשיו תורכם לבנות', body: 'קחו תהליך אחד שחוזר אצלכם כל שבוע, ותתחילו ממנו.' },
  security: { title: 'תריצו את זה בבטחה', body: 'בדקו את ההרשאות לפני שאתם מחברים מודל למערכת אמיתית.' },
  code: { title: 'זה הקוד, זה הרעיון', body: 'העתיקו, תריצו, ותשנו פרמטר אחד כדי להבין מה באמת קורה שם.' },
  data: { title: 'ככה הנתונים מתחברים', body: 'התחילו ממקור ידע אחד קטן לפני שאתם מחברים את כל הארגון.' },
  web3: { title: 'זה הבסיס להמשך', body: 'תתנסו בסביבת בדיקות לפני שאתם נוגעים במשהו אמיתי.' },
  general: { title: 'זה הסיכום', body: 'שמרו את הפוסט, ותחזרו אליו ברגע שתתחילו ליישם.' },
};

const SITE = 'https://mrdaniel.co.il';

/**
 * Strips link overlays and comment-bait out of slide copy.
 *
 * Two separate jobs that happen to have the same fix. The model is told not to write a URL or a
 * "write X in the comments" line into a slide, but an instruction is not an enforcement: the source
 * thread often ends with exactly that, and an adaptation faithful to the source will carry it
 * through. A printed URL is dead pixels in a PNG, and comment-bait is against the repo's
 * no-engagement-bait rule, so both are removed in code, on every slide, every run.
 *
 * Applied to prose only — never to `code`, where a URL can be a real part of the snippet.
 */
export function stripSlideCta(text: string): string {
  return String(text || '')
    // Absolute URLs, www-prefixed hosts, and any bare domain carrying a path.
    .replace(/\bhttps?:\/\/[^\s)"'\]]+/gi, '')
    .replace(/\bwww\.[^\s)"'\]]+/gi, '')
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|co\.il|io|net|org|ai|dev|app)\/[^\s)"'\]]*/gi, '')
    // Our own domain is removed even bare — it is the one the model is most likely to volunteer.
    // A bare third-party domain is NOT: "make.com" and "n8n.io" are tool names the reader needs,
    // and stripping them would silently gut the very instruction the slide exists to give.
    .replace(/\bmrdaniel\.co\.il\b/gi, '')
    // "כתבו/הגיבו/שלחו <keyword> בתגובות / ב-DM" and its English twin.
    //
    // Each of these consumes the rest of its sentence AND that sentence's closing punctuation
    // (`[.!?]*`). Without the second part the period stayed behind, so removing a trailing bait
    // sentence left the slide reading "…let it run nightly.." — the doubled stop being the only
    // visible trace of the thing that was supposed to disappear cleanly.
    .replace(/(?:כתבו|רשמו|הגיבו|תגיבו|שלחו|תשלחו)\s+(?:לי\s+)?[^\s,.!?]{1,24}\s*(?:בתגובות|בתגובה|בהודעה|ב-?DM|בדיאם)[^.!?\n]*[.!?]*/gi, '')
    .replace(/\b(?:comment|dm|write)\s+["“']?\w{1,24}["”']?\s+(?:below|to get|for the)[^.!?\n]*[.!?]*/gi, '')
    // "הקישור בביו" and friends — the link is in the caption, not on the slide.
    //
    // The leading `\b` was removed on 2026-09-12: it is an ASCII word boundary, and Hebrew letters
    // are not ASCII word characters, so `\bהקישור` asserts a boundary between two non-word
    // positions and can never match. The rule had therefore never once fired. No anchor is needed
    // in its place — "הקישורים בביו" still cannot match, because `\s+` must follow "הקישור".
    .replace(/(?:הקישור|קישור|לינק)\s+(?:נמצא\s+)?(?:בביו|בבio|בתגובה הראשונה|למטה)[^.!?\n]*[.!?]*/gi, '')
    // The English twin, added 2026-09-12: only the (dead) Hebrew form was covered, so "Link in bio
    // for the full guide." survived onto a slide verbatim — a dead string painted into a PNG. It
    // matters most for the Instagram importer, where that line is the house style of almost every
    // source caption, but the gap was the same on the Threads path and is fixed for both here.
    .replace(/\b(?:the\s+)?link'?s?\s+(?:is\s+)?in\s+(?:my\s+|the\s+)?bio[^.!?\n]*[.!?]*/gi, '')
    .replace(/\b(?:swipe up|tap the link|check the link|link below)[^.!?\n]*[.!?]*/gi, '')
    // Whatever furniture the removals left behind.
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[\s,;:.\-–—]+/, '')
    .replace(/[\s,;:\-–—]+$/, '')
    .trim();
}

/**
 * The parts of an imported source the layout pass actually reads.
 *
 * Structural, not nominal: `ImportedThread` satisfies it as-is, and so does an imported Instagram
 * post once its caption paragraphs and frame images are named this way. That is the whole reason
 * the layout below is shared rather than copied — the numbering, the prompt boxes, the click-path
 * chips and the CTA rules are identical for both sources, and two copies would drift.
 */
export interface DeckSource {
  /** the source's text, already split into the units a slide can be built from */
  posts: string[];
  /** every image the source published, same-origin-proxied and in order */
  images: string[];
}

/**
 * Applies the visual layout to an adapted deck: theme, badges, step indicators, prompt boxes,
 * the source's own images, and the closing card.
 *
 * Runs over whatever the engine produced rather than asking the model to produce it, so the same
 * rules apply to the AI deck and to the local fallback below, and a model that ignores an
 * instruction cannot break the numbering.
 */
export function layOutDeck(deck: TechTipDeck, thread: DeckSource, topic: ThreadTopicProfile): TechTipDeck {
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
  const paths = extractWorkflowPaths(thread.posts);

  slides.forEach((slide, i) => {
    slide.theme = topic.theme;
    slide.badge = topic.badge;
    // Link overlays and comment-bait never reach a slide, whatever the source thread ended with.
    // `code` is exempt on purpose — a URL inside a snippet is part of what the reader has to run.
    slide.title = stripSlideCta(slide.title);
    slide.body = stripSlideCta(slide.body);
    slide.bullets = slide.bullets.map((b) => stripSlideCta(b)).filter((b) => b.length > 1);
    // The cream preset's tagline is prose like any other field the model wrote, and just as
    // capable of carrying a stray "link in bio" through from the source caption. Optional and a
    // no-op for every deck that never sets it (Threads decks, and Instagram decks outside the
    // cream-skill preset).
    if (slide.subtitle) slide.subtitle = stripSlideCta(slide.subtitle);
    // A slide that names its own tool wins over the deck's — a round-up thread walks through
    // several, and each of those slides should wear the mark it is actually talking about. Brand
    // names survive the Hebrew adaptation as Latin text (source-fidelity rule 3), so this reads the
    // adapted copy directly rather than needing the English original.
    const ownText = `${slide.title} ${slide.body} ${slide.bullets.join(' ')} ${slide.code}`;
    slide.tool = detectTool(ownText) ?? topic.tool;

    if (i >= firstContent && i <= lastContent && contentCount > 0) {
      slide.stepLabel = `${i - firstContent + 1} / ${contentCount}`;
      // A slide that already carries real code keeps it; the prompt box is for the slides that
      // don't, so the two never compete for the same panel.
      if (!slide.code.trim() && prompts.length) slide.promptBox = prompts.shift();
      if (paths.length) slide.workflowPath = paths.shift();
      if (images.length) slide.sourceImage = images.shift();
    }

    // Anything carrying a payload the reader is meant to copy, run or click is a technical slide,
    // and a searched stock photo behind one is the loudest "assembled, not made" tell there is.
    // The thread's own screenshot is exempt — it is evidence, not filler.
    if (slide.promptBox || slide.code.trim() || slide.workflowPath?.length || slide.tool) {
      slide.noPhoto = true;
    }

    // Hand-drawn accents, assigned from the slide's ROLE so the rhythm is identical every run:
    // the cover and the CTA get an underline under their closing line, a numbered step gets a
    // circled numeral, and a prompt slide gets an arrow pointing into the box.
    slide.scribble =
      slide.kind === 'cover' || slide.kind === 'cta'
        ? 'underline'
        : slide.promptBox
          ? 'arrow'
          : slide.kind === 'step' && slide.stepNumber > 0
            ? 'circle'
            : 'none';
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
    // No link on the closing slide. Cleared rather than merely left unset, so a deck restored from
    // a session written by an earlier build cannot re-draw the pill this build removed.
    cta.ctaUrl = undefined;
    cta.stepLabel = undefined;
    cta.noPhoto = true;
    if (!cta.title.trim()) cta.title = copy.title;
    if (!cta.body.trim()) cta.body = copy.body;
    // The closing card summarises the deck with the deck's OWN step headlines rather than with
    // invented marketing lines — every item on it was already a slide the reader just swiped past.
    if (!cta.bullets.length && contentCount > 0) {
      cta.bullets = slides
        .slice(firstContent, lastContent + 1)
        .map((s) => s.title.trim())
        .filter(Boolean)
        .slice(0, 3);
    }
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
