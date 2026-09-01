import type { NewsItem, NewsTopic } from './newsAgentTypes';

/**
 * Turns a news item into a sequence of Instagram-Story slides (text/data only — the canvas render
 * lives in instagramStoryRenderer.ts). Two paths:
 *
 *   synthesizeStory()  — PRIMARY. Sends the full cleaned article text to the LLM
 *                        (/api/agent-generate · action:"story-synthesize") which returns strict
 *                        JSON: per-slide { title, narrativeText }. No bullets, no generic filler,
 *                        the body never restates its own title, every fact is grounded in the
 *                        article. Dynamic 4–6 slides.
 *   buildStorySlides() — DETERMINISTIC FALLBACK for when there's no GEMINI_API_KEY / the call
 *                        fails. Still article-grounded (narrative paragraphs pulled straight from
 *                        the item summary) — NO topic "wisdom" banks, NO bullet lists.
 *
 * A server copy in src/server/storySlides.ts stays in sync for the autonomous cron.
 */

export type StorySlideKind = 'cover' | 'bullets' | 'insight' | 'cta';

export interface StorySlide {
  kind: StorySlideKind;
  index: number;
  total: number;
  kicker: string;
  /** Slide's own headline / section title. */
  heading?: string;
  /** Cover slide only — the news headline. */
  headline?: string;
  /** Narrative paragraph body (2–4 sentences). Replaces the old `points[]` bullet list. */
  narrativeText?: string;
  /** @deprecated kept so old cached payloads still render — new payloads use `narrativeText`. */
  points?: string[];
  body?: string;
  linkLabel?: string;
  source?: string;
}

export interface StoryPayload {
  newsId: string;
  newsTitle: string;
  newsLink: string;
  topic: NewsTopic;
  imageUrl: string;
  slides: StorySlide[];
  /** true when the LLM synthesised the copy; false = deterministic fallback. */
  synthesized: boolean;
  createdAt: number;
}

const KICKER: Record<NewsTopic, string> = {
  cyber: 'סייבר ואבטחה',
  ai: 'בינה מלאכותית',
  cloud: 'ענן ותשתיות',
  general: 'טכנולוגיה',
};

const CTA_HEADING = 'רוצים ליישם את זה אצלכם?';
const CTA_BODY =
  'סוכני AI, אוטומציה והגנת סייבר לעצמאים ולעסקים קטנים — אפיון קצר ב-mrdaniel.co.il וחוזרים אליכם עם תוכנית.';

// ─── shared helpers ──────────────────────────────────────────────────────────────────────────

/** Cleaned sentences from the article body, de-duplicated, order preserved. Article text only. */
function sentences(text: string): string[] {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  const seen = new Set<string>();
  return clean
    .split(/(?<=[.!?…])\s+|\s+[-–—]\s+/)
    .map((s) => s.replace(/^["'׳״]+|["'׳״.…]+$/g, '').trim())
    .filter((s) => {
      if (s.length < 16 || s.length > 260) return false;
      const key = s.slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** A short section label built from the entity-rich part of a chunk (number / brand / English
 * token), 2–6 words, never equal to the chunk's own opening — so the heading and the body's first
 * sentence can't be redundant. Falls back to '' (renderer then shows the body alone). */
function labelFor(chunk: string): string {
  const words = chunk.replace(/["'׳״.…:;]/g, '').split(/\s+/).filter(Boolean);
  const idx = words.findIndex((w) => /\d/.test(w) || /[A-Za-z]{3,}/.test(w) || /^[₪$%]/.test(w));
  if (idx === -1) return '';
  const start = Math.max(0, idx - 1);
  const label = words.slice(start, start + 5).join(' ');
  // reject if it's just the sentence opening again
  if (chunk.trim().startsWith(label)) return words.slice(idx, idx + 4).join(' ');
  return label.length >= 6 ? label : '';
}

function stampIndexes(slides: StorySlide[]): void {
  const total = slides.length;
  slides.forEach((s, i) => {
    s.index = i;
    s.total = total;
  });
}

// ─── PRIMARY: LLM synthesis ──────────────────────────────────────────────────────────────────

interface SynthSlide {
  kind: 'cover' | 'body' | 'takeaway' | 'cta';
  title: string;
  narrativeText: string;
}

/**
 * Calls the site's story-synthesis endpoint and maps the strict-JSON result onto a StoryPayload.
 * `apiBase` is the site origin (e.g. https://mrdaniel.co.il); `adminSecret` is optional
 * (x-admin-secret). Throws on any failure so the caller can fall back to buildStorySlides().
 */
export async function synthesizeStory(
  item: NewsItem,
  imageUrl: string,
  opts: { apiBase: string; adminSecret?: string }
): Promise<StoryPayload> {
  const articleText = (item.summary || item.excerpt || '').trim();
  if (articleText.length < 60) throw new Error('article text too thin for synthesis');

  const res = await fetch(`${opts.apiBase.replace(/\/$/, '')}/api/agent-generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.adminSecret ? { 'x-admin-secret': opts.adminSecret } : {}),
    },
    body: JSON.stringify({
      action: 'story-synthesize',
      title: item.title,
      source: item.source,
      topic: item.topic,
      articleText,
    }),
  });
  if (!res.ok) throw new Error(`story-synthesize responded ${res.status}`);
  const data = (await res.json()) as { ok?: boolean; slides?: SynthSlide[]; blocked?: boolean };
  if (!data.ok || data.blocked || !Array.isArray(data.slides) || data.slides.length < 3) {
    throw new Error('story-synthesize returned no usable slides');
  }

  const kicker = KICKER[item.topic];
  const slides: StorySlide[] = data.slides.map((s) => {
    if (s.kind === 'cover') {
      return { kind: 'cover', index: 0, total: 0, kicker, headline: s.title || item.title.trim(), narrativeText: s.narrativeText, source: item.source };
    }
    if (s.kind === 'cta') {
      return { kind: 'cta', index: 0, total: 0, kicker, heading: s.title || CTA_HEADING, narrativeText: s.narrativeText || CTA_BODY, body: s.narrativeText || CTA_BODY, linkLabel: 'mrdaniel.co.il' };
    }
    // body / takeaway both render as a heading + narrative paragraph
    return { kind: 'insight', index: 0, total: 0, kicker, heading: s.title, narrativeText: s.narrativeText, body: s.narrativeText };
  });

  // guarantee a CTA is last
  if (slides[slides.length - 1].kind !== 'cta') {
    slides.push({ kind: 'cta', index: 0, total: 0, kicker, heading: CTA_HEADING, narrativeText: CTA_BODY, body: CTA_BODY, linkLabel: 'mrdaniel.co.il' });
  }
  stampIndexes(slides);

  return { newsId: item.id, newsTitle: item.title, newsLink: item.link, topic: item.topic, imageUrl, slides, synthesized: true, createdAt: Date.now() };
}

// ─── FALLBACK: deterministic, article-grounded, no banks, no bullets ──────────────────────────

export function buildStorySlides(item: NewsItem, imageUrl: string): StoryPayload {
  const kicker = KICKER[item.topic];
  const S = sentences(item.summary || item.excerpt);

  const slides: StorySlide[] = [];
  slides.push({
    kind: 'cover',
    index: 0,
    total: 0,
    kicker,
    headline: item.title.trim(),
    narrativeText: S[0] || '',
    source: item.source,
  });

  // Body slides: chunk the remaining sentences into 2-sentence narrative paragraphs (max 2).
  const rest = S.slice(1);
  let consumed = 1; // how many of `rest`'s sentences ended up in a body slide
  for (let i = 0; i < rest.length && slides.length < 3; i += 2) {
    const chunk = rest.slice(i, i + 2).join(' ');
    if (chunk.length < 24) continue;
    slides.push({ kind: 'insight', index: 0, total: 0, kicker, heading: labelFor(chunk), narrativeText: chunk, body: chunk });
    consumed = i + 2;
  }

  // Takeaway slide — only if there's a genuinely UNUSED later sentence to carry it.
  const leftover = rest.slice(consumed).find((s) => s.length >= 24);
  if (leftover) {
    slides.push({ kind: 'insight', index: 0, total: 0, kicker, heading: 'המשמעות', narrativeText: leftover, body: leftover });
  }

  slides.push({ kind: 'cta', index: 0, total: 0, kicker, heading: CTA_HEADING, narrativeText: CTA_BODY, body: CTA_BODY, linkLabel: 'mrdaniel.co.il' });
  stampIndexes(slides);

  return { newsId: item.id, newsTitle: item.title, newsLink: item.link, topic: item.topic, imageUrl, slides, synthesized: false, createdAt: Date.now() };
}
