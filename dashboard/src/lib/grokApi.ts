import { SITE_ORIGIN } from './useDashboardRefresh';
import { getAdminSecret, reportAuthFailure } from './adminSecret';
import { describeAiError } from './aiErrors';
import { buildDeckFallback, deckCaption, toStudioSlide, type ApiSlide } from './web3CarouselApi';
import { scoreXThread, threadFromDeck, type XAlgorithmReport, type XThreadPost } from './xAlgorithm';
import { trackActivity } from './agentActivity';
import type { NewsTopic } from './newsAgentTypes';
import type { ResearchBrief, StudioDeck } from './carouselStudioTypes';

/**
 * Client for the Grok agent (`grok-*` actions in api/agent-generate.ts).
 *
 * Same contract as every other `*Api.ts` here: NEVER throws. With no XAI_API_KEY, a spent balance or
 * a network failure, the operator still gets a deck (the local builder) and a thread built from it
 * by the mirrored X-algorithm rules — flagged `synthesized: false` with the reason.
 */

const ENDPOINT = `${SITE_ORIGIN.replace(/\/$/, '')}/api/agent-generate`;

export interface GrokStatus {
  configured: boolean;
  /** False when the key exists but xAI refuses it for billing — drafts then come from free Groq. */
  usable?: boolean;
  reason?: string;
  model: string;
  reachable: boolean;
}

export interface HermesVerification {
  unverifiedNumbers: string[];
  flaggedSlides: number[];
  securityPassed: boolean;
  securityFlags: string[];
  trimmedPosts: number;
}

export interface GrokResult {
  deck: StudioDeck;
  thread: XThreadPost[];
  report: XAlgorithmReport;
  verification: HermesVerification | null;
  model: string;
  synthesized: boolean;
  fallbackReason?: string;
}

async function post(body: Record<string, unknown>, timeoutMs = 120_000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(getAdminSecret() ? { 'x-admin-secret': getAdminSecret() } : {}) },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchGrokStatus(): Promise<GrokStatus> {
  try {
    const res = await post({ action: 'grok-status' }, 15_000);
    if (res.status === 401) reportAuthFailure('grok-status');
    if (!res.ok) return { configured: false, model: '', reachable: false };
    const data = (await res.json()) as { configured?: boolean; usable?: boolean; reason?: string; model?: string };
    return { configured: Boolean(data.configured), usable: data.usable ?? Boolean(data.configured), reason: data.reason, model: data.model ?? '', reachable: true };
  } catch {
    return { configured: false, model: '', reachable: false };
  }
}

function localResult(brief: ResearchBrief, topic: NewsTopic, reason: string): GrokResult {
  const deck = buildDeckFallback(brief, topic, reason);
  const thread = threadFromDeck(deck.slides);
  return { deck, thread, report: scoreXThread({ posts: thread }), verification: null, model: 'local', synthesized: false, fallbackReason: reason };
}

export async function synthesizeGrokCarousel(brief: ResearchBrief, topic: NewsTopic): Promise<GrokResult> {
  if (brief.body.trim().length < 40) return localResult(brief, topic, 'טקסט המקור קצר מדי לשכתוב AI');
  try {
    const res = await post({
      action: 'grok-carousel',
      title: brief.title,
      source: brief.sourceLabel,
      topic,
      brief: brief.body,
      takeaways: brief.takeaways,
    });
    if (res.status === 401) reportAuthFailure('grok-carousel');
    if (!res.ok) {
      const data = (await res.clone().json().catch(() => null)) as { message?: string } | null;
      return localResult(brief, topic, data?.message || (await describeAiError(res)).message);
    }
    const data = (await res.json()) as {
      ok?: boolean;
      blocked?: boolean;
      deck?: ApiSlide[];
      thread?: XThreadPost[];
      report?: XAlgorithmReport;
      verification?: HermesVerification;
      model?: string;
    };
    if (data.blocked) return localResult(brief, topic, 'Hermes חסם את הפלט (מסנן תוכן)');
    if (!data.ok || !Array.isArray(data.deck) || data.deck.length < 5) return localResult(brief, topic, 'Grok לא החזיר קרוסלה שמישה');

    // Hermes' client-side pass: the server already verified numbers; here the thread is re-scored
    // against the mirrored rules so the operator's edits and the server agree on the same scale.
    const endHermes = trackActivity('hermes', 'מאמת את הפלט של Grok');
    const slides = data.deck.map(toStudioSlide).map((s, i) => ({ ...s, index: i }));
    const deck: StudioDeck = {
      slides,
      topic,
      title: brief.title,
      sourceLabel: brief.sourceLabel,
      sourceLink: brief.sourceLink,
      caption: deckCaption(brief.title, slides),
      hashtags: ['#בינהמלאכותית', '#AI', '#Grok'],
      synthesized: true,
      theme: 'web3',
      createdAt: Date.now(),
    };
    const thread = Array.isArray(data.thread) && data.thread.length ? data.thread : threadFromDeck(slides);
    const report = scoreXThread({ posts: thread });
    endHermes(true);
    return { deck, thread, report, verification: data.verification ?? null, model: data.model ?? 'grok', synthesized: true };
  } catch (e) {
    return localResult(brief, topic, (e as Error).message || 'שגיאת רשת מול Grok');
  }
}

/** Forces a fresh fetch of the homepage's X feed (admin only; otherwise it's cached for hours). */
export async function refreshXFeed(): Promise<{ ok: boolean; count: number; source: string }> {
  try {
    const res = await fetch(`${SITE_ORIGIN.replace(/\/$/, '')}/api/news?action=x-feed&refresh=1`, {
      headers: getAdminSecret() ? { 'x-admin-secret': getAdminSecret() } : {},
    });
    const data = (await res.json()) as { posts?: unknown[]; source?: string };
    return { ok: res.ok, count: Array.isArray(data.posts) ? data.posts.length : 0, source: data.source ?? 'none' };
  } catch {
    return { ok: false, count: 0, source: 'none' };
  }
}

// ─── X intelligence (`x-intel`) and the locked write scaffold (`x-write-status`) ────────────────

export interface XIntelPost {
  id: string;
  url: string;
  author: string;
  authorName: string;
  verified: boolean;
  text: string;
  createdAt: string;
  ageHours: number;
  likes: number;
  replies: number;
  photos: number;
  hasVideo: boolean;
  hasLink: boolean;
  likesPerHour: number;
  weightedEngagement: number;
  report: XAlgorithmReport;
  why: string[];
}

export interface XIntelResult {
  ok: boolean;
  posts: XIntelPost[];
  failed: { url: string; reason: string }[];
  pattern: string;
  analyst: 'ai' | 'none';
  error?: string;
}

/** Never throws: a failure comes back as `ok: false` with a Hebrew message. */
export async function analyzeXPosts(urls: string[]): Promise<XIntelResult> {
  const empty = { posts: [], failed: [], pattern: '', analyst: 'none' as const };
  // No manual trackActivity: the fetch tap already lights Scout for `x-intel` (agentActivity.ts).
  try {
    const res = await post({ action: 'x-intel', urls }, 60_000);
    if (res.status === 401) reportAuthFailure('x-intel');
    const data = (await res.json().catch(() => null)) as (XIntelResult & { message?: string }) | null;
    if (!res.ok || !data?.ok) return { ok: false, ...empty, error: data?.message || (await describeAiError(res)).message };
    return data;
  } catch (e) {
    return { ok: false, ...empty, error: (e as Error).message || 'שגיאת רשת' };
  }
}

export async function fetchXWriteStatus(): Promise<{ enabled: boolean; missing: string[] } | null> {
  try {
    const res = await post({ action: 'x-write-status' }, 15_000);
    if (!res.ok) return null;
    const data = (await res.json()) as { enabled?: boolean; missing?: string[] };
    return { enabled: Boolean(data.enabled), missing: data.missing ?? [] };
  } catch {
    return null;
  }
}
