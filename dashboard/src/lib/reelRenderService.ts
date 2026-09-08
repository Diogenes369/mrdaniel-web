import { SITE_ORIGIN } from './useDashboardRefresh';
import type { ReelScript } from './agentTypes';
import { getAdminSecret, reportAuthFailure } from './adminSecret';

/**
 * Media & audio asset assembly for the Reel video compositor (Step B). For every beat in a
 * ReelScript (hook → scenes → cta) this resolves:
 *   - a stock background image from Pexels, keyed on that scene's own `mediaPrompt` — reuses the
 *     EXISTING `api/pexels-search.ts` proxy (same one the Story/Carousel renderers already use),
 *     just called with `query` directly instead of the Hebrew `slideText` path, since a
 *     `mediaPrompt` is already a specific English photography brief.
 *   - a Hebrew voiceover track via Gemini's native TTS (`reel-tts` action, GEMINI_API_KEY — no new
 *     provider key needed). Best-effort: a beat with no audio still renders (silent beat; the
 *     encoder falls back to a text-length duration estimate).
 * Both fetchers are independently best-effort — a failed image or a failed voiceover for one beat
 * never blocks the others or the overall render.
 */


const AGENT_ENDPOINT = `${SITE_ORIGIN.replace(/\/$/, '')}/api/agent-generate`;
const PEXELS_ENDPOINT = `${SITE_ORIGIN.replace(/\/$/, '')}/api/pexels-search`;

export type ReelBeatKind = 'hook' | 'scene' | 'cta';

export interface ReelBeat {
  kind: ReelBeatKind;
  /** Large on-screen headline text for this beat. */
  caption: string;
  /** What's spoken — also rendered as a smaller subtitle when it differs from `caption`. */
  voiceover: string;
  mediaPrompt: string;
  imageUrl: string | null;
  /** Base64 PCM audio bytes from Gemini TTS, or null if synthesis failed/unavailable. */
  audioBase64: string | null;
  /** The model's own MIME type for the PCM stream (carries the real sample rate). */
  audioMimeType: string | null;
  /** Text-length estimate in seconds — used for UI/progress math; the encoder uses the REAL
   * decoded audio duration instead whenever a beat has audio. */
  estimatedDurationSec: number;
}

function authHeaders(): HeadersInit {
  return getAdminSecret() ? { 'x-admin-secret': getAdminSecret() } : {};
}

/** ~14 Hebrew characters/sec spoken — a reasonable estimate for a beat with no audio track. */
function estimateDurationSec(text: string): number {
  const secs = (text || '').trim().length / 14;
  return Math.max(2.2, Math.min(6.5, secs || 2.2));
}

async function fetchPexelsImage(query: string): Promise<string | null> {
  if (!query.trim()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const url = `${PEXELS_ENDPOINT}?${new URLSearchParams({ query, orientation: 'portrait' }).toString()}`;
    const res = await fetch(url, { headers: authHeaders(), signal: ctrl.signal });
    if (res.status === 401) reportAuthFailure('agent-generate');
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; photoUrl?: string };
    return data.ok && data.photoUrl ? data.photoUrl : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchVoiceover(text: string): Promise<{ audioBase64: string; mimeType: string } | null> {
  if (!text.trim()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(AGENT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ action: 'reel-tts', text }),
      signal: ctrl.signal,
    });
    if (res.status === 401) reportAuthFailure('agent-generate');
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; audioBase64?: string; mimeType?: string };
    if (!data.ok || !data.audioBase64) return null;
    return { audioBase64: data.audioBase64, mimeType: data.mimeType || 'audio/L16;codec=pcm;rate=24000' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Flattens a ReelScript into an ordered beat list: hook → each scene → cta. The hook and CTA
 * beats borrow the first/last scene's mediaPrompt as a visual anchor (falling back to a generic
 * brand-toned brief) since the script itself only gives per-scene prompts. */
function beatsFromScript(reel: ReelScript): Pick<ReelBeat, 'kind' | 'caption' | 'voiceover' | 'mediaPrompt'>[] {
  const genericPrompt =
    'Photorealistic modern enterprise technology office at night, dark cinematic lighting, subtle green accent glow, 35mm, shallow depth of field, 8k.';
  const beats: Pick<ReelBeat, 'kind' | 'caption' | 'voiceover' | 'mediaPrompt'>[] = [
    { kind: 'hook', caption: reel.hook, voiceover: reel.hook, mediaPrompt: reel.scenes[0]?.mediaPrompt || genericPrompt },
  ];
  for (const s of reel.scenes) {
    beats.push({ kind: 'scene', caption: s.onScreenText, voiceover: s.voiceover, mediaPrompt: s.mediaPrompt || genericPrompt });
  }
  beats.push({
    kind: 'cta',
    caption: reel.cta,
    voiceover: reel.cta,
    mediaPrompt: reel.scenes[reel.scenes.length - 1]?.mediaPrompt || genericPrompt,
  });
  return beats;
}

/** Bounded-concurrency map — mirrors the pattern already used by newsFeed.ts's image enrichment. */
async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export type ReelAssetStage = 'media' | 'voice';

/** Resolves every beat's image + voiceover, reporting 0..1 progress across BOTH stages combined
 * (media fetch is the first half, TTS the second) so the UI can drive one continuous bar. */
export async function resolveReelBeats(
  reel: ReelScript,
  onProgress?: (fraction: number, stage: ReelAssetStage) => void
): Promise<ReelBeat[]> {
  const base = beatsFromScript(reel);
  const total = base.length * 2;
  let done = 0;
  const tick = (stage: ReelAssetStage) => {
    done += 1;
    onProgress?.(Math.min(1, done / total), stage);
  };

  const images = await mapWithLimit(base, 3, async (b) => {
    const url = await fetchPexelsImage(b.mediaPrompt);
    tick('media');
    return url;
  });
  const voices = await mapWithLimit(base, 2, async (b) => {
    const v = await fetchVoiceover(b.voiceover);
    tick('voice');
    return v;
  });

  return base.map((b, i) => ({
    ...b,
    imageUrl: images[i],
    audioBase64: voices[i]?.audioBase64 ?? null,
    audioMimeType: voices[i]?.mimeType ?? null,
    estimatedDurationSec: estimateDurationSec(b.voiceover || b.caption),
  }));
}
