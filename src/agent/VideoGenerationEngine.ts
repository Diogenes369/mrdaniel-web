import { GoogleGenAI } from '@google/genai';
import { createHmac } from 'crypto';

/** Accepts either shape of "video script" already in use across this codebase: the agent queue's
 * VideoScript (scene-by-scene, from SocialAgentEngine.generateVideoScript) or the weekly plan's
 * flatter DailyVideoScript (single body + visualCues list, from WeeklyPlanEngine). Both describe
 * the same creative brief; this engine only needs hook/cta plus whatever beat-level detail is
 * available to build one text prompt, so it normalizes rather than forcing one shape at the API
 * boundary. */
export interface VideoScriptInput {
  hook: string;
  cta: string;
  scenes?: { onScreenText: string; voiceover?: string }[];
  body?: string;
  visualCues?: string[];
  estimatedSeconds?: number;
}

/** A script with a blank hook/cta and no scene/body/visualCue text carries nothing for any provider
 * to actually generate from — this is what "Validation of body failed" meant in practice: a
 * video-script field existed on the card but every string inside it was empty (e.g. a Gemini
 * generation that returned blank fields, or a card whose script was never filled in). Rather than
 * hard-rejecting the request, the API route falls back to a synthetic script built from whatever
 * plain post/slide text the card actually has — see `buildScriptFromText` and its use in
 * api/generate-video.ts. */
export function isScriptUsable(script: VideoScriptInput | null | undefined): boolean {
  if (!script) return false;
  const sceneText = (script.scenes ?? []).map((s) => `${s.onScreenText ?? ''}${s.voiceover ?? ''}`).join('');
  const text = `${script.hook ?? ''}${script.cta ?? ''}${script.body ?? ''}${sceneText}${(script.visualCues ?? []).join('')}`;
  return text.trim().length > 0;
}

/** Builds a minimal usable script from plain text (a post caption, a carousel slide, whatever the
 * card's own written content is) — the fallback path when the structured script is missing/empty. */
export function buildScriptFromText(text: string): VideoScriptInput {
  const trimmed = text.trim();
  const hook = trimmed.length > 100 ? `${trimmed.slice(0, 97)}...` : trimmed;
  return { hook, cta: '', body: trimmed };
}

/**
 * Text-to-video is a genuinely different capability tier than the text-generation this module
 * otherwise wraps (Gemini chat/JSON calls) — every provider here is either gated behind separate
 * billing/allowlisting (Veo) or a wholly separate paid third-party service (Runway/HeyGen/
 * Replicate/Kling). This file NEVER pretends a provider is available when its required key(s) are
 * missing, and never swallows a provider error into a fake "success" — see `startVideoGeneration`
 * and the explicit `printMissingVideoProviderKeysMessage`/`describeMissingKeysFor` below.
 */

export type VideoProvider = 'veo' | 'runway' | 'heygen' | 'replicate' | 'kling';
export type VideoJobStatus = 'processing' | 'done' | 'error';

export interface VideoJobResult {
  status: VideoJobStatus;
  videoDataUrl?: string;
  mimeType?: string;
  error?: string;
}

export interface VideoStartResult {
  provider: VideoProvider;
  status: VideoJobStatus;
  providerState?: Record<string, unknown>;
  error?: string;
}

const VEO_MODEL_ID = process.env.VEO_MODEL_ID || 'veo-3.0-generate-001';
const geminiKey = process.env.GEMINI_API_KEY;
const genAI = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null;

// Replicate's "run a model at its latest version" endpoint (no version hash needed) — used unless
// REPLICATE_MODEL_VERSION pins a specific version. Wan 2.1 (text-to-video) is the default since
// it's a stable, widely-available Replicate model; LTX-Video is the other option requested — set
// REPLICATE_MODEL to `lightricks/ltx-video` (or any other owner/model slug) to switch.
const REPLICATE_MODEL = process.env.REPLICATE_MODEL || 'wavespeedai/wan-2.1-t2v-480p';

export const PROVIDER_LABEL: Record<VideoProvider, string> = {
  veo: 'Google Veo (via Gemini API)',
  runway: 'Runway ML (Cinematic)',
  heygen: 'HeyGen (Avatar)',
  replicate: 'Replicate (Wan/LTX Visual)',
  kling: 'KlingAI (Scene)',
};

/** Provider availability checks — each returns exactly the env var name(s) still missing, so the
 * caller can name them precisely instead of a generic "not configured" message. Replicate and
 * Kling need only their one credential — REPLICATE_MODEL/KLING_ACCESS_KEY are optional refinements
 * with working defaults/fallbacks, not hard requirements (see startReplicate/buildKlingAuthHeader).
 */
const PROVIDER_REQUIREMENTS: Record<VideoProvider, string[]> = {
  veo: ['GEMINI_API_KEY'],
  runway: ['RUNWAY_API_KEY'],
  heygen: ['HEYGEN_API_KEY', 'HEYGEN_AVATAR_ID', 'HEYGEN_VOICE_ID'],
  replicate: ['REPLICATE_API_TOKEN'],
  kling: ['KLING_API_KEY'],
};

function missingKeysFor(provider: VideoProvider): string[] {
  return PROVIDER_REQUIREMENTS[provider].filter((key) => !process.env[key]);
}

/** Exposed so the API route can build a message scoped to exactly the provider the dashboard's
 * dropdown asked for, instead of the "here's every provider's status" dump below. */
export function describeMissingKeysFor(provider: VideoProvider): string[] {
  return missingKeysFor(provider);
}

/** Ordered by the spec's stated priority: Veo/Gemini first (already-configured in this project via
 * GEMINI_API_KEY), then external providers. Only returns providers whose full requirement set is
 * present. Used for the no-explicit-choice fallback chain in startVideoGeneration. */
export function getConfiguredVideoProviders(): VideoProvider[] {
  return (['veo', 'runway', 'heygen', 'replicate', 'kling'] as VideoProvider[]).filter((p) => missingKeysFor(p).length === 0);
}

/** Prints the exact env var(s) Daniel needs to add for every NOT-yet-configured provider, so a
 * blocked video-generation attempt tells him precisely what to go add — never a vague "configure a
 * provider" message. Called whenever no provider at all is available. */
export function printMissingVideoProviderKeysMessage(): string {
  const lines = ['[agent/video] No video generation provider is configured. To enable AI video generation, set ONE of the following in your environment (.env / Vercel project settings):', ''];
  for (const provider of ['veo', 'runway', 'heygen', 'replicate', 'kling'] as VideoProvider[]) {
    const missing = missingKeysFor(provider);
    lines.push(`  - ${PROVIDER_LABEL[provider]}: missing ${missing.join(', ')}`);
  }
  lines.push('', 'Veo access additionally requires video generation to be enabled on your Google AI Studio / Cloud project (separate from standard Gemini text access) — see https://ai.google.dev/gemini-api/docs/video.');
  const message = lines.join('\n');
  console.error(message);
  return message;
}

/** Prints (and returns) a message scoped to one specific provider the dashboard's dropdown asked
 * for — used when a request names a provider explicitly rather than letting the engine pick. */
export function printMissingKeysForProvider(provider: VideoProvider): string {
  const missing = missingKeysFor(provider);
  const message = `[agent/video] ${PROVIDER_LABEL[provider]} is not configured — missing ${missing.join(', ')}. Add ${missing.length > 1 ? 'these' : 'this'} to your environment (.env / Vercel project settings) to use this provider.`;
  console.error(message);
  return message;
}

function buildPrompt(script: VideoScriptInput, topic: string): string {
  const bodyLines = script.scenes && script.scenes.length > 0
    ? script.scenes.map((s, i) => `Scene ${i + 1}: ${s.onScreenText}${s.voiceover ? ` (voiceover: ${s.voiceover})` : ''}`).join('\n')
    : [script.body, ...(script.visualCues ?? []).map((cue) => `Visual: ${cue}`)].filter(Boolean).join('\n');
  return [
    `Vertical short-form social video (9:16), topic: ${topic}.`,
    `Opening hook (first 1-2 seconds must grab attention): ${script.hook}`,
    bodyLines,
    `Closing call-to-action: ${script.cta}`,
    'Style: clean, modern, AI-news brand aesthetic, confident and direct tone, dark background with cyan/blue accents, on-screen text overlays matching the script beats.',
  ].join('\n');
}

/** Builds a prompt from just the Visual Cues (B-roll direction) — used by Replicate/Kling per the
 * spec's "background visual generation based on Visual Cues" framing, as distinct from Veo/Runway
 * which get the full hook+body+cta narrative prompt. Falls back to the full prompt if no explicit
 * visual cues exist on this script (e.g. the agent queue's scene-based scripts). */
function buildVisualCuePrompt(script: VideoScriptInput, topic: string): string {
  if (!script.visualCues || script.visualCues.length === 0) return buildPrompt(script, topic);
  return [`Vertical (9:16) B-roll style background video, topic: ${topic}.`, ...script.visualCues, 'Style: clean, modern, AI-news brand aesthetic, dark background with cyan/blue accents, no on-screen text.'].join('\n');
}

async function startVeo(script: VideoScriptInput, topic: string, aspectRatio: '9:16' | '16:9'): Promise<VideoStartResult> {
  if (!genAI) return { provider: 'veo', status: 'error', error: 'GEMINI_API_KEY not configured' };
  try {
    const operation = await genAI.models.generateVideos({
      model: VEO_MODEL_ID,
      prompt: buildPrompt(script, topic),
      config: { aspectRatio, numberOfVideos: 1, durationSeconds: Math.min(Math.max(script.estimatedSeconds || 8, 5), 8) },
    });
    return { provider: 'veo', status: 'processing', providerState: { operation: JSON.parse(JSON.stringify(operation)) } };
  } catch (err) {
    return { provider: 'veo', status: 'error', error: err instanceof Error ? err.message : 'veo request failed' };
  }
}

async function pollVeo(providerState: Record<string, unknown>): Promise<VideoJobResult> {
  if (!genAI) return { status: 'error', error: 'GEMINI_API_KEY not configured' };
  try {
    const operation = await genAI.operations.getVideosOperation({ operation: providerState.operation as never });
    if (!operation.done) {
      return { status: 'processing' };
    }
    if (operation.error) {
      return { status: 'error', error: JSON.stringify(operation.error) };
    }
    const video = operation.response?.generatedVideos?.[0]?.video;
    if (!video?.uri && !video?.videoBytes) {
      return { status: 'error', error: 'veo finished with no video in the response' };
    }
    if (video.videoBytes) {
      return { status: 'done', videoDataUrl: `data:${video.mimeType || 'video/mp4'};base64,${video.videoBytes}`, mimeType: video.mimeType || 'video/mp4' };
    }
    const res = await fetch(video.uri!, { headers: { 'x-goog-api-key': geminiKey! } });
    if (!res.ok) return { status: 'error', error: `failed to download generated video (${res.status})` };
    const buf = Buffer.from(await res.arrayBuffer());
    const mimeType = video.mimeType || 'video/mp4';
    return { status: 'done', videoDataUrl: `data:${mimeType};base64,${buf.toString('base64')}`, mimeType };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'veo poll failed' };
  }
}

async function startRunway(script: VideoScriptInput, topic: string, aspectRatio: '9:16' | '16:9'): Promise<VideoStartResult> {
  try {
    const res = await fetch('https://api.dev.runwayml.com/v1/text_to_video', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Runway-Version': '2024-11-06',
      },
      body: JSON.stringify({ promptText: buildPrompt(script, topic), model: 'gen4_turbo', ratio: aspectRatio === '9:16' ? '720:1280' : '1280:720' }),
    });
    const data = await res.json();
    if (!res.ok || !data.id) {
      return { provider: 'runway', status: 'error', error: data?.error || `Runway request failed (${res.status})` };
    }
    return { provider: 'runway', status: 'processing', providerState: { taskId: data.id } };
  } catch (err) {
    return { provider: 'runway', status: 'error', error: err instanceof Error ? err.message : 'runway request failed' };
  }
}

async function pollRunway(providerState: Record<string, unknown>): Promise<VideoJobResult> {
  try {
    const res = await fetch(`https://api.dev.runwayml.com/v1/tasks/${providerState.taskId}`, {
      headers: { Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`, 'X-Runway-Version': '2024-11-06' },
    });
    const data = await res.json();
    if (!res.ok) return { status: 'error', error: data?.error || `Runway poll failed (${res.status})` };
    if (data.status === 'FAILED') return { status: 'error', error: data?.failure || 'Runway generation failed' };
    if (data.status !== 'SUCCEEDED') return { status: 'processing' };
    const videoUrl = Array.isArray(data.output) ? data.output[0] : data.output;
    if (!videoUrl) return { status: 'error', error: 'Runway finished with no output video' };
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) return { status: 'error', error: `failed to download Runway video (${videoRes.status})` };
    const buf = Buffer.from(await videoRes.arrayBuffer());
    return { status: 'done', videoDataUrl: `data:video/mp4;base64,${buf.toString('base64')}`, mimeType: 'video/mp4' };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'runway poll failed' };
  }
}

async function startHeygen(script: VideoScriptInput, topic: string): Promise<VideoStartResult> {
  try {
    const beats = script.scenes && script.scenes.length > 0 ? script.scenes.map((s) => s.voiceover || s.onScreenText) : [script.body ?? ''];
    const flatScript = [script.hook, ...beats, script.cta].join(' ');
    const res = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: { 'X-Api-Key': process.env.HEYGEN_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_inputs: [
          {
            character: { type: 'avatar', avatar_id: process.env.HEYGEN_AVATAR_ID, avatar_style: 'normal' },
            voice: { type: 'text', input_text: flatScript, voice_id: process.env.HEYGEN_VOICE_ID },
          },
        ],
        dimension: { width: 720, height: 1280 },
        caption: false,
        title: topic,
      }),
    });
    const data = await res.json();
    const videoId = data?.data?.video_id;
    if (!res.ok || !videoId) return { provider: 'heygen', status: 'error', error: data?.error?.message || `HeyGen request failed (${res.status})` };
    return { provider: 'heygen', status: 'processing', providerState: { videoId } };
  } catch (err) {
    return { provider: 'heygen', status: 'error', error: err instanceof Error ? err.message : 'heygen request failed' };
  }
}

async function pollHeygen(providerState: Record<string, unknown>): Promise<VideoJobResult> {
  try {
    const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${providerState.videoId}`, {
      headers: { 'X-Api-Key': process.env.HEYGEN_API_KEY! },
    });
    const data = await res.json();
    const status = data?.data?.status;
    if (!res.ok) return { status: 'error', error: data?.error?.message || `HeyGen poll failed (${res.status})` };
    if (status === 'failed') return { status: 'error', error: data?.data?.error?.message || 'HeyGen generation failed' };
    if (status !== 'completed') return { status: 'processing' };
    const videoUrl = data?.data?.video_url;
    if (!videoUrl) return { status: 'error', error: 'HeyGen finished with no output video' };
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) return { status: 'error', error: `failed to download HeyGen video (${videoRes.status})` };
    const buf = Buffer.from(await videoRes.arrayBuffer());
    return { status: 'done', videoDataUrl: `data:video/mp4;base64,${buf.toString('base64')}`, mimeType: 'video/mp4' };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'heygen poll failed' };
  }
}

async function startReplicate(script: VideoScriptInput, topic: string): Promise<VideoStartResult> {
  try {
    // Pinned version (REPLICATE_MODEL_VERSION) takes priority if set; otherwise run the model's
    // latest version via the owner/model endpoint — no version hash to keep up to date.
    const version = process.env.REPLICATE_MODEL_VERSION;
    const url = version ? 'https://api.replicate.com/v1/predictions' : `https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`;
    const body = version ? { version, input: { prompt: buildVisualCuePrompt(script, topic) } } : { input: { prompt: buildVisualCuePrompt(script, topic) } };
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.id) return { provider: 'replicate', status: 'error', error: data?.detail || `Replicate request failed (${res.status})` };
    return { provider: 'replicate', status: 'processing', providerState: { predictionId: data.id } };
  } catch (err) {
    return { provider: 'replicate', status: 'error', error: err instanceof Error ? err.message : 'replicate request failed' };
  }
}

async function pollReplicate(providerState: Record<string, unknown>): Promise<VideoJobResult> {
  try {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${providerState.predictionId}`, {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
    });
    const data = await res.json();
    if (!res.ok) return { status: 'error', error: data?.detail || `Replicate poll failed (${res.status})` };
    if (data.status === 'failed' || data.status === 'canceled') return { status: 'error', error: data?.error || 'Replicate generation failed' };
    if (data.status !== 'succeeded') return { status: 'processing' };
    const videoUrl = Array.isArray(data.output) ? data.output[0] : data.output;
    if (!videoUrl) return { status: 'error', error: 'Replicate finished with no output video' };
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) return { status: 'error', error: `failed to download Replicate video (${videoRes.status})` };
    const buf = Buffer.from(await videoRes.arrayBuffer());
    return { status: 'done', videoDataUrl: `data:video/mp4;base64,${buf.toString('base64')}`, mimeType: 'video/mp4' };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'replicate poll failed' };
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** KlingAI's documented API authenticates with a short-lived JWT signed (HS256) from an Access Key
 * ID + Secret Key pair (KLING_ACCESS_KEY / KLING_SECRET_KEY) — not a single static token. If only
 * KLING_API_KEY is set (as given), this falls back to sending it directly as a Bearer token, which
 * matches Kling's scheme ONLY if that string is itself a pre-issued token from their console; if
 * Kling rejects it, the resulting 401 surfaces honestly as the job's error rather than a fake
 * success. Set KLING_ACCESS_KEY + KLING_SECRET_KEY instead for the officially documented flow. */
function buildKlingAuthHeader(): string {
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (accessKey && secretKey) {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64url(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 }));
    const signature = base64url(createHmac('sha256', secretKey).update(`${header}.${payload}`).digest());
    return `Bearer ${header}.${payload}.${signature}`;
  }
  return `Bearer ${process.env.KLING_API_KEY}`;
}

const KLING_API_BASE = process.env.KLING_API_BASE || 'https://api.klingai.com';

async function startKling(script: VideoScriptInput, topic: string, aspectRatio: '9:16' | '16:9'): Promise<VideoStartResult> {
  try {
    const res = await fetch(`${KLING_API_BASE}/v1/videos/text2video`, {
      method: 'POST',
      headers: { Authorization: buildKlingAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_name: 'kling-v1',
        prompt: buildVisualCuePrompt(script, topic),
        aspect_ratio: aspectRatio,
        duration: '5',
        mode: 'std',
      }),
    });
    const data = await res.json();
    const taskId = data?.data?.task_id;
    if (!res.ok || !taskId) return { provider: 'kling', status: 'error', error: data?.message || `KlingAI request failed (${res.status})` };
    return { provider: 'kling', status: 'processing', providerState: { taskId } };
  } catch (err) {
    return { provider: 'kling', status: 'error', error: err instanceof Error ? err.message : 'kling request failed' };
  }
}

async function pollKling(providerState: Record<string, unknown>): Promise<VideoJobResult> {
  try {
    const res = await fetch(`${KLING_API_BASE}/v1/videos/text2video/${providerState.taskId}`, {
      headers: { Authorization: buildKlingAuthHeader() },
    });
    const data = await res.json();
    const status = data?.data?.task_status;
    if (!res.ok) return { status: 'error', error: data?.message || `KlingAI poll failed (${res.status})` };
    if (status === 'failed') return { status: 'error', error: data?.data?.task_status_msg || 'KlingAI generation failed' };
    if (status !== 'succeed') return { status: 'processing' };
    const videoUrl = data?.data?.task_result?.videos?.[0]?.url;
    if (!videoUrl) return { status: 'error', error: 'KlingAI finished with no output video' };
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) return { status: 'error', error: `failed to download KlingAI video (${videoRes.status})` };
    const buf = Buffer.from(await videoRes.arrayBuffer());
    return { status: 'done', videoDataUrl: `data:video/mp4;base64,${buf.toString('base64')}`, mimeType: 'video/mp4' };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'kling poll failed' };
  }
}

const STARTERS: Record<VideoProvider, (script: VideoScriptInput, topic: string, aspectRatio: '9:16' | '16:9') => Promise<VideoStartResult>> = {
  veo: (s, t, a) => startVeo(s, t, a),
  runway: (s, t, a) => startRunway(s, t, a),
  heygen: (s, t) => startHeygen(s, t),
  replicate: (s, t) => startReplicate(s, t),
  kling: (s, t, a) => startKling(s, t, a),
};

/** If `preferredProvider` is given (the dashboard's model dropdown), tries ONLY that provider and
 * returns its error as-is — no silent fallback to a different model than the one the admin
 * explicitly picked. Without a preference, falls back through `getConfiguredVideoProviders()`'s
 * priority order (Veo first), advancing only past a provider that fails at the START call — a
 * provider that starts successfully is never abandoned mid-poll, since re-starting a different one
 * after money/quota was already spent on the first would be a bad default. */
export async function startVideoGeneration(
  script: VideoScriptInput,
  topic: string,
  aspectRatio: '9:16' | '16:9' = '9:16',
  preferredProvider?: VideoProvider
): Promise<VideoStartResult> {
  if (preferredProvider) {
    if (missingKeysFor(preferredProvider).length > 0) {
      printMissingKeysForProvider(preferredProvider);
      return { provider: preferredProvider, status: 'error', error: `${PROVIDER_LABEL[preferredProvider]} not configured — missing ${missingKeysFor(preferredProvider).join(', ')}` };
    }
    return STARTERS[preferredProvider](script, topic, aspectRatio);
  }

  const configured = getConfiguredVideoProviders();
  if (configured.length === 0) {
    printMissingVideoProviderKeysMessage();
    return { provider: 'veo', status: 'error', error: 'no video generation provider configured' };
  }
  let lastError: VideoStartResult | null = null;
  for (const provider of configured) {
    const result = await STARTERS[provider](script, topic, aspectRatio);
    if (result.status !== 'error') return result;
    lastError = result;
    console.error(`[agent/video] ${provider} failed to start, trying next configured provider if any:`, result.error);
  }
  return lastError!;
}

export async function pollVideoGeneration(provider: VideoProvider, providerState: Record<string, unknown>): Promise<VideoJobResult> {
  switch (provider) {
    case 'veo':
      return pollVeo(providerState);
    case 'runway':
      return pollRunway(providerState);
    case 'heygen':
      return pollHeygen(providerState);
    case 'replicate':
      return pollReplicate(providerState);
    case 'kling':
      return pollKling(providerState);
  }
}
