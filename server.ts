import 'dotenv/config';
import { randomUUID } from 'crypto';
import express from 'express';
import type { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import { GoogleGenAI } from '@google/genai';
import { getNewsItemBySlug, getNewsItems } from './src/server/newsFeed';
import { getAINews } from './src/server/aiNewsFeed';
import { AI_ASSISTANT_SYSTEM_INSTRUCTION } from './src/server/aiSystemPrompt';
import { generateSocialContent, generateVideoScript, draftEngagementMessage, scoreLeadIntent, isEngineConfigured, transcribeAudio, detectGeminiRateLimit, classifyGeminiError, generateVisualSearchQuery, generateImageGenerationPrompt } from './src/agent/SocialAgentEngine';
import { sanitizeOutput, containsPromptInjection } from './src/agent/AgentSecurityGuard';
import { buildMediaFrames } from './src/agent/MediaTemplateRenderer';
import {
  pushQueueItem,
  readStrategicContext,
  findLatestPendingQueueItem,
  updateQueueItemStatus,
  updateQueueItemBody,
  readAwaitingEditFor,
  setAwaitingEditFor,
  appendStrategicContext,
  agentFirebaseConfigured,
  writeWeeklyPlan,
  createVideoJob,
  readVideoJob,
  updateVideoJob,
} from './src/agent/firebaseServer';
import { sendAdminMessage } from './src/agent/WhatsAppDispatcher';
import type { ContentFormat, VideoProvider, VideoJobStatus } from './src/agent/types';
import { generateWeeklyPlan } from './src/agent/WeeklyPlanEngine';
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
} from './src/agent/VideoGenerationEngine';
import { runAutoPublishCycle, dispatchPublish } from './src/server/autoPublish';
import { generateEmailCampaign, isCopywriterConfigured } from './src/server/emailCopywriter';
import leadsHandler from './api/leads';
import { isHiggsfieldAction, handleHiggsfieldAction } from './src/server/openHiggsfieldActions';

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Gemini chat
// ---------------------------------------------------------------------------

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

app.post('/api/chat', async (req: Request, res: Response) => {
  const messages: ChatMessage[] = Array.isArray(req.body?.messages) ? req.body.messages : [];

  if (!genAI) {
    res.json({
      reply: 'שירות הצ׳אט אינו זמין כרגע. ניתן למלא את טופס יצירת הקשר או לפנות ישירות במייל danihell3039@gmail.com.',
    });
    return;
  }

  try {
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const response = await genAI.models.generateContent({
      model: 'gemini-3.6-flash',
      contents,
      config: {
        systemInstruction: AI_ASSISTANT_SYSTEM_INSTRUCTION,
        temperature: 0.7,
        topP: 0.95,
      },
    });

    const reply = response.text?.trim() || 'תודה על פנייתך. אשמח לסייע בהמשך.';
    res.json({ reply });
  } catch (err) {
    console.error('Gemini chat error:', err);
    res.json({
      reply: 'מצטער, חלה שגיאת תקשורת רגעית. אפשר גם למלא את טופס יצירת הקשר באתר או לפנות ישירות במייל danihell3039@gmail.com.',
    });
  }
});

// ---------------------------------------------------------------------------
// Lead capture + email engine — delegate to the Vercel handler (api/leads.ts), which is
// Express-compatible. Keeps the lead flow and the send-campaign / send-test / newsletter-signup
// actions identical between local dev and production.
// ---------------------------------------------------------------------------

app.post('/api/leads', (req: Request, res: Response) => leadsHandler(req, res));

// ---------------------------------------------------------------------------
// Health check — pinged by src/lib/tracker.ts to derive real client-measured latency
// ---------------------------------------------------------------------------

app.get('/api/health', (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const h = req.headers || {};
  const first = (v: unknown) => String(Array.isArray(v) ? v[0] : (v ?? '')).split(',')[0].trim();
  res.json({
    ok: true,
    ts: Date.now(),
    region: process.env.VERCEL_REGION ?? null,
    ip: first(h['x-real-ip']) || first(h['x-forwarded-for']) || null,
    country: first(h['x-vercel-ip-country']) || null,
    countryRegion: first(h['x-vercel-ip-country-region']) || null,
    city: h['x-vercel-ip-city'] ? decodeURIComponent(first(h['x-vercel-ip-city'])) : null,
  });
});

// ---------------------------------------------------------------------------
// AI news aggregation
// ---------------------------------------------------------------------------

app.get('/api/news', async (_req: Request, res: Response) => {
  // CORS open (mirrors api/news.ts) so the dashboard, on its own origin, can read the feed for the
  // news-driven content generator. Public read-only news metadata.
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Local mirror of api/news.ts's `?action=x-feed` (the homepage's live @mrdaniel_ai feed).
  if (_req.query?.action === 'x-feed') {
    const { getXFeed } = await import('./src/server/xFeed.js');
    res.json({ ok: true, ...(await getXFeed(_req.query?.refresh === '1')) });
    return;
  }
  // Local mirrors of the two autonomous sync agents (api/news.ts `?action=creator-feed|models`).
  if (_req.query?.action === 'creator-feed') {
    const { getCreatorFeed } = await import('./src/server/agents/socialSyncAgent.js');
    res.json({ ok: true, ...(await getCreatorFeed(_req.query?.refresh === '1')) });
    return;
  }
  if (_req.query?.action === 'models') {
    const { getModelCatalog } = await import('./src/server/agents/modelUpdateAgent.js');
    res.json({ ok: true, ...(await getModelCatalog(_req.query?.refresh === '1')) });
    return;
  }
  // Local mirrors of the article precompute agent (api/news.ts `?action=insights|precompute`).
  if (_req.query?.action === 'insights') {
    const { getInsightsMap } = await import('./src/server/articlePrecompute.js');
    const { map, coverage } = await getInsightsMap();
    res.json({ ok: true, coverage, insights: map });
    return;
  }
  if (_req.query?.action === 'precompute') {
    const { runPrecompute } = await import('./src/server/articlePrecompute.js');
    res.json(await runPrecompute({ maxItems: Number(_req.query?.max) || undefined }));
    return;
  }
  const data = await getNewsItems();
  res.json(data);
});

// Same-origin image relay (local-dev mirror of api/img-proxy.ts) — lets the dashboard draw a
// remote news photo onto a <canvas> without tainting it. Same SSRF guards as the Vercel function.
const IMG_PROXY_BLOCKED_HOST =
  /^(localhost|0\.0\.0\.0|\[?::1\]?|127(\.\d{1,3}){3}|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|169\.254(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})$/i;

app.get('/api/img-proxy', async (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const raw = typeof req.query.url === 'string' ? req.query.url : '';
  if (!raw) {
    res.status(400).json({ error: 'missing ?url' });
    return;
  }
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    res.status(400).json({ error: 'invalid url' });
    return;
  }
  if ((target.protocol !== 'https:' && target.protocol !== 'http:') || IMG_PROXY_BLOCKED_HOST.test(target.hostname)) {
    res.status(403).json({ error: 'blocked' });
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const upstream = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
      },
    });
    if (!upstream.ok) {
      res.status(502).json({ error: `upstream ${upstream.status}` });
      return;
    }
    const contentType = upstream.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      res.status(415).json({ error: 'not an image' });
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) {
      res.status(413).json({ error: 'image too large' });
      return;
    }
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(buf);
  } catch (err) {
    console.error('[api/img-proxy] fetch failed:', (err as Error)?.message ?? err);
    res.status(502).json({ error: 'fetch failed' });
  } finally {
    clearTimeout(timer);
  }
});

app.get('/api/news/item/:slug', async (req: Request, res: Response) => {
  const item = await getNewsItemBySlug(req.params.slug);
  if (!item) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json({ item });
});

// Local-dev mirror of api/news-analyze.ts — the Gemini-generated "ניתוח טכנולוגי ומשמעויות"
// block of the article modal. No boilerplate fallback: an unconfigured key or a model failure
// answers `available: false` and the modal hides the section.
// Read-only since 2026-09-23 (mirrors api/news.ts handleAnalyze): serves the analysis the
// background agent stored, never generates on request.
app.all('/api/news/analyze', async (req: Request, res: Response) => {
  const b: Record<string, unknown> = (req.method === 'GET' ? req.query : req.body) ?? {};
  const { getStoredInsight } = await import('./src/server/articlePrecompute.js');
  const insights = b.link ? await getStoredInsight(String(b.link)) : null;
  res.json(insights ? { available: true, insights } : { available: false, pending: true });
});

app.get('/api/ai-news', async (_req: Request, res: Response) => {
  const data = await getAINews();
  res.json(data);
});

// Autonomous news auto-publisher (local-dev mirror) — in production these actions live on
// /api/agent-generate (POST { action: 'auto-publish-run' | 'auto-publish-dispatch' }); here they
// get thin dedicated routes off the shared src/server/autoPublish.ts module.
app.post('/api/auto-publish/run', async (req: Request, res: Response) => {
  const trigger = req.body?.force ? 'force' : 'scheduler';
  res.json(await runAutoPublishCycle({ trigger }));
});
app.post('/api/auto-publish/dispatch', async (req: Request, res: Response) => {
  const b = req.body ?? {};
  res.json(
    await dispatchPublish(
      {
        platform: String(b.platform ?? ''),
        caption: String(b.caption ?? ''),
        hashtags: Array.isArray(b.hashtags) ? b.hashtags : [],
        imageUrl: String(b.imageUrl ?? ''),
        newsTitle: String(b.newsTitle ?? ''),
        newsLink: typeof b.newsLink === 'string' ? b.newsLink : undefined,
        category: typeof b.category === 'string' ? b.category : undefined,
      },
      typeof b.webhookUrl === 'string' ? b.webhookUrl : undefined
    )
  );
});

// ---------------------------------------------------------------------------
// Social Agent (local-dev mirror of api/agent-generate.ts) — see that file for the full
// action/auth/CORS contract; this is intentionally a thin duplicate, matching every other route
// in this file's existing convention of a separate Express route per Vercel Function.
// ---------------------------------------------------------------------------

function isAgentAdminAuthorized(req: Request): boolean {
  const configured = process.env.ADMIN_API_SECRET;
  if (!configured) return true;
  return req.headers['x-admin-secret'] === configured;
}

app.post('/api/agent-generate', async (req: Request, res: Response) => {
  if (!isAgentAdminAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const { action } = req.body ?? {};

  try {
    // OpenHiggsfield image/video generation — the same module api/agent-generate.ts calls, so the
    // catalog, the field mapping and the key checks are identical in dev and production.
    if (isHiggsfieldAction(action)) {
      const { status, payload } = await handleHiggsfieldAction(action, req.body ?? {});
      res.status(status).json(payload);
      return;
    }

    if (action === 'score-lead') {
      const { query } = req.body ?? {};
      if (typeof query !== 'string' || !query.trim()) {
        res.status(400).json({ ok: false, error: 'missing query' });
        return;
      }
      res.json({ ok: true, result: scoreLeadIntent(query) });
      return;
    }

    if (action === 'generate-content') {
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, error: 'GEMINI_API_KEY not configured' });
        return;
      }
      const { platform, topic, format } = req.body ?? {};
      if (!['tiktok', 'instagram', 'linkedin'].includes(platform)) {
        res.status(400).json({ ok: false, error: 'invalid platform' });
        return;
      }
      if (typeof topic !== 'string' || !topic.trim()) {
        res.status(400).json({ ok: false, error: 'missing topic' });
        return;
      }
      const resolvedFormat: ContentFormat = ['post', 'carousel', 'video-script'].includes(format) ? format : 'post';
      const strategicContext = await readStrategicContext();

      if (resolvedFormat === 'video-script') {
        const script = await generateVideoScript(topic, strategicContext);
        const flatBody = [script.hook, ...script.scenes.map((s) => s.onScreenText), script.cta].join('\n');
        const security = sanitizeOutput(flatBody);
        if (!security.passed) {
          res.json({ ok: true, blocked: true, security });
          return;
        }
        const mediaPreview = buildMediaFrames({ format: resolvedFormat, topic, body: flatBody, videoScript: script });
        const imageGenerationPrompt = await generateImageGenerationPrompt(platform, topic, flatBody);
        const id = await pushQueueItem({ kind: 'content', platform, format: resolvedFormat, topic, body: flatBody, videoScript: script, mediaPreview, imageGenerationPrompt, status: 'pending_approval', security, createdAt: Date.now() });
        res.json({ ok: true, id, body: flatBody, videoScript: script, imageGenerationPrompt, security });
        return;
      }

      const { body, carouselSlides, hashtags } = await generateSocialContent(platform, topic, resolvedFormat, strategicContext);
      const security = sanitizeOutput(body);
      if (!security.passed) {
        res.json({ ok: true, blocked: true, security });
        return;
      }
      const mediaPreview = buildMediaFrames({ format: resolvedFormat, topic, body, carouselSlides });
      const imageGenerationPrompt = await generateImageGenerationPrompt(platform, topic, body);
      const id = await pushQueueItem({ kind: 'content', platform, format: resolvedFormat, topic, body, carouselSlides: carouselSlides ?? null, hashtags: hashtags ?? null, mediaPreview, imageGenerationPrompt, status: 'pending_approval', security, createdAt: Date.now() });
      res.json({ ok: true, id, body, carouselSlides, hashtags, imageGenerationPrompt, security });
      return;
    }

    if (action === 'email-generate') {
      if (!isCopywriterConfigured()) {
        res.status(200).json({ ok: false, error: 'GEMINI_API_KEY not configured' });
        return;
      }
      const { goal, tone, notes, preset } = req.body ?? {};
      if (typeof goal !== 'string' || !goal.trim()) {
        res.status(400).json({ ok: false, error: 'missing goal' });
        return;
      }
      const result = await generateEmailCampaign({
        goal: goal.trim().slice(0, 400),
        tone: typeof tone === 'string' ? tone.slice(0, 200) : undefined,
        notes: typeof notes === 'string' ? notes.slice(0, 1200) : undefined,
        preset: typeof preset === 'string' ? (preset as never) : undefined,
      });
      res.json({ ok: true, ...result });
      return;
    }

    if (action === 'draft-engagement') {
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, error: 'GEMINI_API_KEY not configured' });
        return;
      }
      const { query } = req.body ?? {};
      if (typeof query !== 'string' || !query.trim()) {
        res.status(400).json({ ok: false, error: 'missing query' });
        return;
      }
      const scored = scoreLeadIntent(query);
      const draftMessage = await draftEngagementMessage(query, scored.intent);
      const security = sanitizeOutput(draftMessage);
      if (!security.passed) {
        res.json({ ok: true, blocked: true, security });
        return;
      }
      const id = await pushQueueItem({ kind: 'engagement', query, intent: scored.intent, intentScore: scored.score, intentReasons: scored.reasons, draftMessage, status: 'pending_approval', security, createdAt: Date.now() });
      res.json({ ok: true, id, draftMessage, scored, security });
      return;
    }

    // Screenshot / design mock -> React + Tailwind component. Mirrors the production branch in
    // api/agent-generate.ts, including the dynamic import — see src/server/agents/screenshotCodeAgent.ts.
    if (action === 'screenshot-to-code') {
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured' });
        return;
      }
      const { images, instructions, componentName, variant } = req.body ?? {};
      if (!Array.isArray(images) || images.length === 0) {
        res.status(400).json({ ok: false, error: 'missing images' });
        return;
      }
      const { generateComponentFromScreenshot, validateScreenshotImage, MAX_SCREENSHOTS } = await import('./src/server/agents/screenshotCodeAgent.js');
      if (images.length > MAX_SCREENSHOTS) {
        res.status(400).json({ ok: false, error: 'too many images' });
        return;
      }
      const checked = images.map((img: unknown) => validateScreenshotImage(img));
      const bad = checked.findIndex((c) => !c.ok);
      if (bad >= 0) {
        res.status(400).json({ ok: false, error: `image ${bad + 1}: ${(checked[bad] as { ok: false; reason: string }).reason}` });
        return;
      }
      const result = await generateComponentFromScreenshot({
        images: checked.map((c) => (c as { ok: true; image: { mimeType: string; data: string } }).image),
        instructions: typeof instructions === 'string' ? instructions : undefined,
        componentName: typeof componentName === 'string' ? componentName : undefined,
        variant: variant === 'jsx' ? 'jsx' : 'tsx',
      });
      res.json({ ok: true, ...result });
      return;
    }

    res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (err) {
    const failure = classifyGeminiError(err);
    if (failure.code === 'rate_limited' || failure.code === 'quota_exhausted' || failure.code === 'billing_exhausted') {
      res.status(failure.status).json({ ok: false, status: failure.code === 'rate_limited' ? 'rate_limited' : failure.code, code: failure.code, message: failure.message, retryable: failure.retryable, retryAfterSeconds: failure.retryAfterSeconds });
      return;
    }
    console.error('[api/agent-generate] error:', err);
    res.status(500).json({ ok: false, error: 'generation failed' });
  }
});

// ---------------------------------------------------------------------------
// WhatsApp bridge webhook (local-dev mirror of api/agent-whatsapp-webhook.ts) — see that file for
// the full action-word/edit-flow contract.
// ---------------------------------------------------------------------------

function isWhatsAppBridgeAuthorized(req: Request): boolean {
  const configured = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!configured) return true;
  return req.headers['x-webhook-secret'] === configured;
}

const AGENT_APPROVE_WORDS = ['1', 'אשר', 'אישור', 'מאשר'];
const AGENT_EDIT_WORDS = ['2', 'ערוך', 'עריכה'];
const AGENT_REJECT_WORDS = ['3', 'דחה', 'דחייה', 'לדחות'];

app.post('/api/agent-whatsapp-webhook', async (req: Request, res: Response) => {
  if (!isWhatsAppBridgeAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  if (!agentFirebaseConfigured) {
    res.json({ ok: true, skipped: true, reason: 'firebase-not-configured' });
    return;
  }

  const { from, text, audioBase64, audioMimeType } = req.body ?? {};

  try {
    let effectiveText: string = typeof text === 'string' ? text.trim() : '';
    if (!effectiveText && audioBase64 && audioMimeType) {
      effectiveText = (await transcribeAudio(audioBase64, audioMimeType)).trim();
    }
    if (!effectiveText) {
      res.json({ ok: true, skipped: true, reason: 'empty message' });
      return;
    }
    if (containsPromptInjection(effectiveText)) {
      await sendAdminMessage('⚠️ ההודעה זוהתה כמכילה ניסיון הזרקת הוראות ולא עובדה.');
      res.json({ ok: true, blocked: true });
      return;
    }

    const normalized = effectiveText.trim().toLowerCase();
    const awaitingEditFor = await readAwaitingEditFor();

    if (awaitingEditFor && !AGENT_APPROVE_WORDS.includes(normalized) && !AGENT_EDIT_WORDS.includes(normalized) && !AGENT_REJECT_WORDS.includes(normalized)) {
      await updateQueueItemBody(awaitingEditFor, effectiveText);
      await setAwaitingEditFor(null);
      await sendAdminMessage('✏️ הטקסט עודכן בהצלחה.');
      res.json({ ok: true, action: 'edited', id: awaitingEditFor });
      return;
    }

    if (AGENT_APPROVE_WORDS.includes(normalized)) {
      const latest = await findLatestPendingQueueItem();
      if (!latest) {
        await sendAdminMessage('אין כרגע פריטים ממתינים לאישור.');
        res.json({ ok: true, action: 'approve', found: false });
        return;
      }
      await updateQueueItemStatus(latest.id, 'approved');
      await sendAdminMessage('✅ אושר. הטקסט הסופי זמין בלוח הבקרה להעתקה/פרסום ידני.');
      res.json({ ok: true, action: 'approve', id: latest.id });
      return;
    }

    if (AGENT_EDIT_WORDS.includes(normalized)) {
      const latest = await findLatestPendingQueueItem();
      if (!latest) {
        await sendAdminMessage('אין כרגע פריטים ממתינים לעריכה.');
        res.json({ ok: true, action: 'edit', found: false });
        return;
      }
      await setAwaitingEditFor(latest.id);
      await sendAdminMessage('✏️ שלחו את הטקסט המעודכן בהודעה הבאה.');
      res.json({ ok: true, action: 'edit-prompt', id: latest.id });
      return;
    }

    if (AGENT_REJECT_WORDS.includes(normalized)) {
      const latest = await findLatestPendingQueueItem();
      if (!latest) {
        await sendAdminMessage('אין כרגע פריטים ממתינים לדחייה.');
        res.json({ ok: true, action: 'reject', found: false });
        return;
      }
      await updateQueueItemStatus(latest.id, 'rejected');
      await sendAdminMessage('🗑️ נדחה.');
      res.json({ ok: true, action: 'reject', id: latest.id });
      return;
    }

    await appendStrategicContext(effectiveText);
    await sendAdminMessage('📝 נרשם כהנחיה אסטרטגית להמשך יצירת תוכן.');
    res.json({ ok: true, action: 'strategic-note', from });
  } catch (err) {
    console.error('[api/agent-whatsapp-webhook] error:', err);
    res.status(500).json({ ok: false, error: 'processing failed' });
  }
});

// ---------------------------------------------------------------------------
// Weekly content plan (local-dev mirror of api/generate-weekly-plan.ts)
// ---------------------------------------------------------------------------

function isWeeklyPlanAuthorized(req: Request): boolean {
  const configured = process.env.ADMIN_API_SECRET;
  if (!configured) return true;
  return req.headers['x-admin-secret'] === configured;
}

app.post('/api/generate-weekly-plan', async (req: Request, res: Response) => {
  if (!isWeeklyPlanAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  if (!isEngineConfigured()) {
    res.status(503).json({ ok: false, error: 'GEMINI_API_KEY not configured' });
    return;
  }
  try {
    const plan = await generateWeeklyPlan();
    const saved = agentFirebaseConfigured ? await writeWeeklyPlan(plan) : false;
    res.json({ ok: true, plan, saved });
  } catch (err) {
    const failure = classifyGeminiError(err);
    if (failure.code === 'rate_limited' || failure.code === 'quota_exhausted' || failure.code === 'billing_exhausted') {
      res.status(failure.status).json({ ok: false, status: failure.code === 'rate_limited' ? 'rate_limited' : failure.code, code: failure.code, message: failure.message, retryable: failure.retryable, retryAfterSeconds: failure.retryAfterSeconds });
      return;
    }
    console.error('[api/generate-weekly-plan] error:', err);
    res.status(500).json({ ok: false, error: 'generation failed' });
  }
});

// ---------------------------------------------------------------------------
// AI video generation (local-dev mirror of api/generate-video.ts) — see that file for the full
// provider-priority / missing-key-messaging contract.
// ---------------------------------------------------------------------------

function isVideoScriptShape(value: unknown): value is VideoScriptInput {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.hook !== 'string' || typeof v.cta !== 'string') return false;
  return Array.isArray(v.scenes) || typeof v.body === 'string';
}

const KNOWN_VIDEO_PROVIDERS: VideoProvider[] = ['veo', 'runway', 'heygen', 'replicate', 'kling'];

/** Same temporary disable as api/generate-video.ts — see that file's comment. */
const VIDEO_GENERATION_ENABLED = false;

app.get('/api/generate-video', async (req: Request, res: Response) => {
  if (!isWeeklyPlanAuthorized(req)) {
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
    res.json({ ok: true, ...job });
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
  res.json({ ok: true, id, ...job, ...patch });
});

app.post('/api/generate-video', async (req: Request, res: Response) => {
  if (!isWeeklyPlanAuthorized(req)) {
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
  const body = req.body ?? {};
  const visualPrompt: string | undefined = typeof body.visualPrompt === 'string' ? body.visualPrompt : undefined;
  let topic: string | undefined = typeof body.topic === 'string' ? body.topic : undefined;
  const { aspectRatio, aspect_ratio, provider } = body;

  let script: VideoScriptInput | null = isVideoScriptShape(body.script) ? body.script : null;
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
  const requestedProvider: VideoProvider | undefined = KNOWN_VIDEO_PROVIDERS.includes(provider) ? provider : undefined;
  if (provider && !requestedProvider) {
    res.status(400).json({ ok: false, error: `unknown provider "${provider}" — expected one of ${KNOWN_VIDEO_PROVIDERS.join(', ')}` });
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
    res.json({ ok: true, id, provider: start.provider, status: start.status, error: start.error });
  } catch (err) {
    console.error('[api/generate-video] error:', err);
    res.status(500).json({ ok: false, error: 'video generation failed to start' });
  }
});

// ---------------------------------------------------------------------------
// Pexels search proxy (local-dev mirror of api/pexels-search.ts) — see that file for why the
// PEXELS_API_KEY stays server-side while the resolved photo URL itself is fetched directly by the
// browser afterward.
// ---------------------------------------------------------------------------

const VALID_PEXELS_ORIENTATIONS = ['landscape', 'portrait', 'square'];

app.get('/api/pexels-search', async (req: Request, res: Response) => {
  if (!isWeeklyPlanAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const slideText = req.query?.slideText as string | undefined;
  const fallbackQuery = req.query?.query as string | undefined;
  const orientationParam = req.query?.orientation as string | undefined;
  const orientation = VALID_PEXELS_ORIENTATIONS.includes(orientationParam || '') ? orientationParam : 'square';

  let effectiveQuery: string | undefined;
  let creativeQueryFailed = false;
  if (slideText && slideText.trim()) {
    try {
      effectiveQuery = await generateVisualSearchQuery(slideText);
    } catch (err) {
      creativeQueryFailed = true;
      const rateLimit = detectGeminiRateLimit(err);
      console.error(rateLimit ? '[agent/pexels] visual query generation rate-limited, falling back to plain query:' : '[agent/pexels] visual query generation failed, falling back to plain query:', err);
    }
  }
  if (!effectiveQuery) effectiveQuery = fallbackQuery;
  if (!effectiveQuery || !effectiveQuery.trim()) {
    res.status(400).json({ ok: false, error: 'missing slideText or query' });
    return;
  }

  const pexelsKey = process.env.PEXELS_API_KEY;
  if (!pexelsKey) {
    console.error('[agent/pexels] PEXELS_API_KEY not configured — the dashboard will use its curated fallback photo pool instead.');
    res.status(503).json({ ok: false, error: 'PEXELS_API_KEY not configured' });
    return;
  }

  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(effectiveQuery)}&per_page=3&orientation=${orientation}`;
    const pexelsRes = await fetch(url, { headers: { Authorization: pexelsKey } });
    const data = await pexelsRes.json();
    const photo = data?.photos?.[0];
    if (!pexelsRes.ok || !photo) {
      res.status(502).json({ ok: false, error: data?.error || `Pexels search failed (${pexelsRes.status})` });
      return;
    }
    res.json({ ok: true, photoUrl: photo.src?.large2x || photo.src?.large || photo.src?.original, photographer: photo.photographer, usedQuery: effectiveQuery, creativeQueryFailed });
  } catch (err) {
    console.error('[api/pexels-search] error:', err);
    res.status(500).json({ ok: false, error: 'pexels search failed' });
  }
});

// ---------------------------------------------------------------------------
// Vite middleware for development / static serving for production
// ---------------------------------------------------------------------------

async function start() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.use('*', async (req: Request, res: Response) => {
      try {
        const url = req.originalUrl;
        let template = await vite.transformIndexHtml(url, await (await import('fs/promises')).readFile('index.html', 'utf-8'));
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        console.error(e);
        res.status(500).end((e as Error).message);
      }
    });
  } else {
    const path = await import('path');
    const express404 = express.static(path.resolve('dist'));
    app.use(express404);
    app.use('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

start();
