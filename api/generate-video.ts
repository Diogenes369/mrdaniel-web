import { randomUUID } from 'crypto';
import {
  startVideoGeneration,
  pollVideoGeneration,
  getConfiguredVideoProviders,
  printMissingVideoProviderKeysMessage,
  printMissingKeysForProvider,
  describeMissingKeysFor,
  isScriptUsable,
  buildScriptFromText,
  type VideoScriptInput,
} from '../src/agent/VideoGenerationEngine.js';
import { createVideoJob, readVideoJob, updateVideoJob, agentFirebaseConfigured } from '../src/agent/firebaseServer.js';
import type { VideoProvider, VideoJobStatus } from '../src/agent/types.js';

const KNOWN_PROVIDERS: VideoProvider[] = ['veo', 'runway', 'heygen', 'replicate', 'kling'];

/** Temporarily disabled per explicit request — video generation had validation/reliability issues
 * across providers, so the whole endpoint is switched off while system focus shifts to posts,
 * carousels, and real image generation. Flip back to `true` to re-enable; nothing else needs to
 * change (the dashboard's buttons have their own matching flag in dashboard/src/lib/agentTypes.ts). */
const VIDEO_GENERATION_ENABLED = false;

/**
 * POST starts a new video-generation job from a VideoScript (Hook/scenes/CTA — the same shape
 * already produced by SocialAgentEngine.generateVideoScript and stored on both queue items and
 * weekly-plan days) and returns a job id immediately, since real video generation (Veo/Runway/
 * HeyGen/Replicate) takes anywhere from ~30s to several minutes — far past what one request should
 * block on. GET polls that job id; the dashboard is expected to call it every few seconds until
 * `status` is `done` or `error`. See VideoGenerationEngine.ts for the honest "which provider, which
 * missing keys" logic — this route never claims a video was generated when no provider is
 * configured or a provider call actually failed.
 */

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
}

function isAdminAuthorized(req: any): boolean {
  const configured = process.env.ADMIN_API_SECRET;
  if (!configured) return true;
  return req.headers?.['x-admin-secret'] === configured;
}

/** Accepts either the agent queue's scene-by-scene VideoScript or the weekly plan's flatter
 * body+visualCues shape — see VideoGenerationEngine.ts's VideoScriptInput for why both are valid. */
function isVideoScript(value: unknown): value is VideoScriptInput {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.hook !== 'string' || typeof v.cta !== 'string') return false;
  return Array.isArray(v.scenes) || typeof v.body === 'string';
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (!isAdminAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  if (!VIDEO_GENERATION_ENABLED) {
    res.status(503).json({ ok: false, error: 'video generation is temporarily disabled' });
    return;
  }
  if (!agentFirebaseConfigured) {
    res.status(503).json({ ok: false, error: 'Firebase not configured' });
    return;
  }

  if (req.method === 'GET') {
    const id = req.query?.id as string | undefined;
    if (!id) {
      res.status(400).json({ ok: false, error: 'missing id' });
      return;
    }
    const job = await readVideoJob(id);
    if (!job) {
      res.status(404).json({ ok: false, error: 'job not found' });
      return;
    }
    if (job.status !== 'processing') {
      res.status(200).json({ ok: true, ...job });
      return;
    }
    const result = await pollVideoGeneration(job.provider as VideoProvider, (job.providerState as Record<string, unknown>) || {});
    const patch: Record<string, unknown> = { status: result.status as VideoJobStatus, updatedAt: Date.now() };
    if (result.videoDataUrl) patch.videoDataUrl = result.videoDataUrl;
    if (result.mimeType) patch.mimeType = result.mimeType;
    if (result.error) patch.error = result.error;
    if (result.status !== 'processing') {
      await updateVideoJob(id, patch);
    }
    res.status(200).json({ ok: true, id, ...job, ...patch });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  const body = req.body ?? {};
  const visualPrompt: string | undefined = typeof body.visualPrompt === 'string' ? body.visualPrompt : undefined;
  let topic: string | undefined = typeof body.topic === 'string' ? body.topic : undefined;
  const { aspectRatio, aspect_ratio, provider } = body;

  // The card's structured script (Hook/scenes/CTA) is preferred, but a script with every field
  // blank (or missing outright) can't drive any provider — fall back to whatever plain text the
  // card actually has (visualPrompt, e.g. the slide/post caption, or the topic) instead of
  // rejecting outright. Only a genuinely empty request (no script AND no fallback text) 400s.
  let script: VideoScriptInput | null = isVideoScript(body.script) ? body.script : null;
  if (!isScriptUsable(script)) {
    const fallbackText = visualPrompt?.trim() || topic?.trim();
    script = fallbackText ? buildScriptFromText(fallbackText) : null;
  }
  if (!isScriptUsable(script)) {
    res.status(400).json({ ok: false, error: 'no usable video script — provide a script with content, or a visualPrompt/topic to use as fallback text' });
    return;
  }
  const finalScript: VideoScriptInput = script!;
  const finalTopic: string = topic?.trim() || visualPrompt?.trim() || finalScript.hook || 'AI video';
  const resolvedAspect = (aspectRatio ?? aspect_ratio) === '16:9' ? '16:9' : '9:16';
  const requestedProvider: VideoProvider | undefined = KNOWN_PROVIDERS.includes(provider) ? provider : undefined;
  if (provider && !requestedProvider) {
    res.status(400).json({ ok: false, error: `unknown provider "${provider}" — expected one of ${KNOWN_PROVIDERS.join(', ')}` });
    return;
  }

  if (requestedProvider) {
    const missing = describeMissingKeysFor(requestedProvider);
    if (missing.length > 0) {
      const message = printMissingKeysForProvider(requestedProvider);
      res.status(503).json({ ok: false, error: `${requestedProvider} not configured — missing ${missing.join(', ')}`, details: message });
      return;
    }
  } else if (getConfiguredVideoProviders().length === 0) {
    const message = printMissingVideoProviderKeysMessage();
    res.status(503).json({ ok: false, error: 'no video generation provider configured', details: message });
    return;
  }

  try {
    const start = await startVideoGeneration(finalScript, finalTopic, resolvedAspect, requestedProvider);
    const id = randomUUID();
    const now = Date.now();
    const job = {
      id,
      provider: start.provider,
      status: start.status,
      aspectRatio: resolvedAspect,
      createdAt: now,
      updatedAt: now,
      providerState: start.providerState ?? null,
      error: start.error ?? null,
    };
    await createVideoJob(id, job);
    res.status(200).json({ ok: true, id, provider: start.provider, status: start.status, error: start.error });
  } catch (err) {
    console.error('[api/generate-video] error:', err);
    res.status(500).json({ ok: false, error: 'video generation failed to start' });
  }
}
