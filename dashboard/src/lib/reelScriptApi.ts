import { SITE_ORIGIN } from './useDashboardRefresh';
import type { NewsItem } from './newsAgentTypes';
import type { ReelScript, ReelScriptScene } from './agentTypes';

/**
 * Client lib for the "תסריט לרילס" (Reel Generator) mode in NewsContentAgent — article-grounded
 * Reel/Reels script synthesis. Follows the project's `never throw` rule: on 429/503/network/thin
 * output it falls back to a deterministic script built straight from the selected article's real
 * sentences, so the operator always gets a usable draft.
 */

const ADMIN_SECRET = import.meta.env.VITE_ADMIN_API_SECRET as string | undefined;
const ENDPOINT = `${SITE_ORIGIN.replace(/\/$/, '')}/api/agent-generate`;

async function post(body: Record<string, unknown>, timeoutMs = 75000): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(ADMIN_SECRET ? { 'x-admin-secret': ADMIN_SECRET } : {}),
  };
  const payload = JSON.stringify({ action: 'reel-script-synthesize', ...body });
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

function httpReason(status: number): string {
  if (status === 429) return 'מכסת ה-API של Gemini לשעה זו מוצתה (429)';
  if (status === 401) return 'אימות מול /api/agent-generate נכשל (401)';
  if (status === 503) return 'GEMINI_API_KEY לא מוגדר בסביבת השרת (503)';
  return `שרת ה-AI החזיר שגיאה ${status}`;
}

function splitSentences(text: string): string[] {
  return (text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

const CTA_DEFAULT = 'עקבו לעוד תוכן על AI, סייבר ופיתוח — mrdaniel.co.il';

function mediaPromptFor(sceneText: string): string {
  return `Photorealistic enterprise IT / cybersecurity / AI scene illustrating: "${sceneText.slice(0, 140)}". Modern office or data center / SOC room, engineer at a workstation, real server racks or dashboard screens. 35mm lens, natural lighting, shallow depth of field, 8k. No text overlays, no cartoon or abstract 3D "AI art".`;
}

/** Deterministic reel built straight from the article's own sentences — real content, never a
 * placeholder — used whenever AI synthesis is unavailable. */
export function buildFallbackReel(item: NewsItem): ReelScript {
  const source = (item.summary || item.excerpt || item.title || '').trim();
  const sentences = splitSentences(source);
  const hook = (sentences[0] || item.title || 'עדכון מהיר').slice(0, 160);
  const body = sentences.slice(1, 7);

  const scenes: ReelScriptScene[] = body.map((s) => ({
    onScreenText: s.slice(0, 60),
    voiceover: s,
    mediaPrompt: mediaPromptFor(s),
  }));
  while (scenes.length < 3) {
    const filler = scenes.length === 0 ? item.title : `עוד פרט מ-${item.source || 'הכתבה'}`;
    scenes.push({ onScreenText: filler.slice(0, 60), voiceover: filler, mediaPrompt: mediaPromptFor(filler) });
  }

  return { hook, scenes: scenes.slice(0, 6), cta: CTA_DEFAULT };
}

export interface ReelResult {
  reel: ReelScript;
  /** true = AI-synthesised from the article, false = deterministic local fallback */
  synthesized: boolean;
  fallbackReason?: string;
}

export async function synthesizeReel(item: NewsItem): Promise<ReelResult> {
  const articleText = (item.summary || item.excerpt || '').trim();
  if (articleText.length < 40) {
    return { reel: buildFallbackReel(item), synthesized: false, fallbackReason: 'הטקסט קצר מדי לסינתוז AI' };
  }

  try {
    const res = await post({ title: item.title, source: item.source, topic: item.topic, articleText });
    if (!res.ok) return { reel: buildFallbackReel(item), synthesized: false, fallbackReason: httpReason(res.status) };
    const data = (await res.json()) as { ok?: boolean; blocked?: boolean; reel?: ReelScript };
    if (data.blocked) return { reel: buildFallbackReel(item), synthesized: false, fallbackReason: 'הפלט נחסם ע"י מסנן התוכן' };
    if (!data.ok || !data.reel || !Array.isArray(data.reel.scenes) || data.reel.scenes.length < 3) {
      return { reel: buildFallbackReel(item), synthesized: false, fallbackReason: 'מנוע ה-AI לא החזיר תסריט שמיש' };
    }
    return { reel: data.reel, synthesized: true };
  } catch (e) {
    return { reel: buildFallbackReel(item), synthesized: false, fallbackReason: (e as Error).message || 'שגיאת רשת מול מנוע ה-AI' };
  }
}

/** Plain-text rendering for copy/download — hook, numbered scenes (on-screen + voiceover + media
 * prompt), CTA. */
export function reelToText(reel: ReelScript, title?: string): string {
  const lines: string[] = [];
  if (title) lines.push(`תסריט רילס — ${title}`, '='.repeat(30), '');
  lines.push(`HOOK: ${reel.hook}`, '');
  reel.scenes.forEach((s, i) => {
    lines.push(`סצנה ${i + 1}`);
    lines.push(`  טקסט על המסך: ${s.onScreenText}`);
    lines.push(`  קריינות: ${s.voiceover}`);
    lines.push(`  Media prompt: ${s.mediaPrompt}`);
    lines.push('');
  });
  lines.push(`CTA: ${reel.cta}`);
  return lines.join('\n');
}
