import { generateSocialContent, generateVideoScript, draftEngagementMessage, scoreLeadIntent, isEngineConfigured, detectGeminiRateLimit, generateImageGenerationPrompt, synthesizeStorySlides } from '../src/agent/SocialAgentEngine.js';
import { sanitizeOutput } from '../src/agent/AgentSecurityGuard.js';
import { buildMediaFrames } from '../src/agent/MediaTemplateRenderer.js';
import { pushQueueItem, readAgentMode, readAgentWebhooks, readStrategicContext, writeAutoPilotRunTimestamp, agentFirebaseConfigured } from '../src/agent/firebaseServer.js';
import { runAutoPublishCycle, dispatchPublish } from '../src/server/autoPublish.js';
import { generateEmailCampaign, isCopywriterConfigured } from '../src/server/emailCopywriter.js';
import { dispatchAgentNotifications } from '../src/agent/NotificationDispatcher.js';
import { notifyNewContent, isWhatsAppBridgeConfigured } from '../src/agent/WhatsAppDispatcher.js';
import type { Platform, ContentFormat, QueueItem } from '../src/agent/types.js';

const DASHBOARD_QUEUE_URL = 'https://mrdaniel.co.il/#agent-queue'; // placeholder anchor; real link is wherever the dashboard is hosted for this admin

// Rotates through the site's real service pillars, posts + carousels only — video-script entries
// were removed while video generation is temporarily disabled (see VIDEO_GENERATION_ENABLED below
// and dashboard/src/lib/agentTypes.ts's matching flag); this list is what unattended Auto-Pilot
// cycles draw from (see the `cycle` branch below). Manual "generate now" calls from the dashboard
// pass their own topic/format instead of using this list.
const AUTO_PILOT_TOPICS: { platform: Platform; topic: string; format: ContentFormat }[] = [
  { platform: 'linkedin', topic: 'איך סוכן AI אוטונומי (RAG) שונה מצ׳אטבוט גנרי', format: 'carousel' },
  { platform: 'linkedin', topic: 'למה ארכיטקטורת Zero-Trust רלוונטית גם לסוכני AI, לא רק לרשת הארגונית', format: 'post' },
  { platform: 'linkedin', topic: 'Wi-Fi 7 בסביבה ארגונית: מה זה באמת משנה מעבר לשיווקיות', format: 'post' },
  { platform: 'instagram', topic: 'שילוב בין אבטחת סייבר, סוכני AI ופיתוח Web3 בפרויקט אחד', format: 'carousel' },
  { platform: 'instagram', topic: '3 טעויות שעסקים עושים כשהם "מוסיפים AI" בלי לחשוב על אבטחה', format: 'carousel' },
];

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
}

function isAdminAuthorized(req: any): boolean {
  const configured = process.env.ADMIN_API_SECRET;
  // No secret configured yet — see .env.example. Fails OPEN only in that unconfigured state so a
  // fresh checkout isn't hard-blocked before the admin has had a chance to set one; once set, every
  // request must present it.
  if (!configured) return true;
  return req.headers?.['x-admin-secret'] === configured;
}

async function generateAndPushOne(
  pick: { platform: Platform; topic: string; format: ContentFormat },
  strategicContext: string[]
): Promise<{ skipped: boolean; id?: string; reason?: string; item?: QueueItem }> {
  if (pick.format === 'video-script') {
    const script = await generateVideoScript(pick.topic, strategicContext);
    const flatBody = [script.hook, ...script.scenes.map((s) => s.onScreenText), script.cta].join('\n');
    const security = sanitizeOutput(flatBody);
    if (!security.passed) return { skipped: true, reason: 'blocked-by-guard' };
    const mediaPreview = buildMediaFrames({ format: pick.format, topic: pick.topic, body: flatBody, videoScript: script });
    const imageGenerationPrompt = await generateImageGenerationPrompt(pick.platform, pick.topic, flatBody);
    const record = {
      kind: 'content' as const,
      platform: pick.platform,
      format: pick.format,
      topic: pick.topic,
      body: flatBody,
      videoScript: script,
      mediaPreview,
      imageGenerationPrompt,
      status: 'pending_approval' as const,
      security,
      createdAt: Date.now(),
    };
    const id = await pushQueueItem(record);
    return { skipped: false, id: id ?? undefined, item: id ? ({ id, ...record } as QueueItem) : undefined };
  }

  const { body, carouselSlides, hashtags } = await generateSocialContent(pick.platform, pick.topic, pick.format, strategicContext);
  const security = sanitizeOutput(body);
  if (!security.passed) return { skipped: true, reason: 'blocked-by-guard' };
  const mediaPreview = buildMediaFrames({ format: pick.format, topic: pick.topic, body, carouselSlides });
  const imageGenerationPrompt = await generateImageGenerationPrompt(pick.platform, pick.topic, body);
  const record = {
    kind: 'content' as const,
    platform: pick.platform,
    format: pick.format,
    topic: pick.topic,
    body,
    carouselSlides: carouselSlides ?? null,
    hashtags: hashtags ?? null,
    mediaPreview,
    imageGenerationPrompt,
    status: 'pending_approval' as const,
    security,
    createdAt: Date.now(),
  };
  const id = await pushQueueItem(record);
  return { skipped: false, id: id ?? undefined, item: id ? ({ id, ...record } as QueueItem) : undefined };
}

async function runAutoPilotCycle() {
  // 2-3 daily items, per spec — sampled without replacement so a single cycle never repeats topic.
  const shuffled = [...AUTO_PILOT_TOPICS].sort(() => Math.random() - 0.5);
  const count = 2 + Math.round(Math.random());
  const picks = shuffled.slice(0, count);
  const strategicContext = await readStrategicContext();

  const results = await Promise.all(picks.map((pick) => generateAndPushOne(pick, strategicContext)));
  const successItems = results.filter((r): r is { skipped: false; id: string; item: QueueItem } => !r.skipped && Boolean(r.item)).map((r) => r.item);

  await writeAutoPilotRunTimestamp();

  if (successItems.length > 0) {
    const webhooks = await readAgentWebhooks();
    await Promise.all([
      dispatchAgentNotifications(webhooks, successItems.length, DASHBOARD_QUEUE_URL),
      isWhatsAppBridgeConfigured() ? notifyNewContent(successItems) : Promise.resolve(),
    ]);
  }

  return { generated: successItems.length, attempted: picks.length, results };
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Vercel Cron invokes this as a GET with the platform-managed CRON_SECRET bearer token — see
  // vercel.json's `crons` entry. This is the "autonomous system loop": the cron fires on a fixed
  // schedule regardless of admin settings, but the mode check below means it only ever *does*
  // anything while the dashboard's toggle is set to Auto-Pilot — Standby/Semi-Auto make every tick
  // a no-op. Auto-Pilot here means "auto-generates 2-3 queued DRAFTS for human review, and pings
  // the configured webhook(s)/WhatsApp bridge about it," never "auto-publishes to a real social
  // account" — there is no live LinkedIn/Instagram/TikTok posting integration in this codebase
  // (see .env.example for why that's a deliberate scope boundary).
  if (req.method === 'GET') {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers?.authorization !== `Bearer ${cronSecret}`) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }

    // Two independent autonomous jobs share this one daily cron (Vercel Hobby caps functions at 12,
    // so the news auto-publisher can't have its own): the social-content auto-pilot (only acts in
    // Auto-Pilot mode) and the news auto-publisher (only acts while its own toggle is Active).
    const agentMode = await readAgentMode();
    let contentResult: Record<string, unknown> = { skipped: true, reason: 'not-in-auto-pilot', mode: agentMode };
    if (isEngineConfigured() && agentFirebaseConfigured && agentMode === 'auto-pilot') {
      contentResult = await runAutoPilotCycle();
    }

    let publishResult: Record<string, unknown> = { skipped: 'not-configured' };
    try {
      publishResult = await runAutoPublishCycle({ trigger: 'cron' });
    } catch (err) {
      console.error('[auto-publish] cron cycle failed:', (err as Error)?.message ?? err);
      publishResult = { ok: false, error: 'auto-publish failed' };
    }

    res.status(200).json({ ok: true, content: contentResult, autoPublish: publishResult });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  if (!isAdminAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const { action } = req.body ?? {};

  try {
    if (action === 'score-lead') {
      const { query } = req.body ?? {};
      if (typeof query !== 'string' || !query.trim()) {
        res.status(400).json({ ok: false, error: 'missing query' });
        return;
      }
      const result = scoreLeadIntent(query);
      res.status(200).json({ ok: true, result });
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
      const result = await generateAndPushOne({ platform, topic, format: resolvedFormat }, strategicContext);
      res.status(200).json({ ok: true, skipped: result.skipped, id: result.id, reason: result.reason });
      return;
    }

    if (action === 'auto-publish-run') {
      // Dashboard "run now" → trigger:'force' (bypasses gates). External scheduler at
      // ?/action with force:false → trigger:'scheduler' (respects the configured hours).
      const trigger = req.body?.force ? 'force' : 'scheduler';
      const result = await runAutoPublishCycle({ trigger });
      res.status(200).json(result);
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
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (action === 'auto-publish-dispatch') {
      const { platform, caption, hashtags, imageUrl, newsTitle, newsLink, category, webhookUrl } = req.body ?? {};
      const result = await dispatchPublish(
        {
          platform: String(platform ?? ''),
          caption: String(caption ?? ''),
          hashtags: Array.isArray(hashtags) ? hashtags : [],
          imageUrl: String(imageUrl ?? ''),
          newsTitle: String(newsTitle ?? ''),
          newsLink: typeof newsLink === 'string' ? newsLink : undefined,
          category: typeof category === 'string' ? category : undefined,
        },
        typeof webhookUrl === 'string' ? webhookUrl : undefined
      );
      res.status(200).json(result);
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
        res.status(200).json({ ok: true, blocked: true, security });
        return;
      }
      const id = await pushQueueItem({
        kind: 'engagement',
        query,
        intent: scored.intent,
        intentScore: scored.score,
        intentReasons: scored.reasons,
        draftMessage,
        status: 'pending_approval',
        security,
        createdAt: Date.now(),
      });
      res.status(200).json({ ok: true, id, draftMessage, scored, security });
      return;
    }

    if (action === 'story-synthesize') {
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, error: 'GEMINI_API_KEY not configured' });
        return;
      }
      const { title, source, topic, articleText } = req.body ?? {};
      if (typeof articleText !== 'string' || articleText.trim().length < 40) {
        res.status(400).json({ ok: false, error: 'articleText (>= 40 chars) required' });
        return;
      }
      const slides = await synthesizeStorySlides({
        title: String(title ?? ''),
        source: String(source ?? ''),
        topic: String(topic ?? 'general'),
        articleText,
      });
      const security = sanitizeOutput(slides.map((s) => `${s.title}\n${s.narrativeText}`).join('\n\n'));
      if (!security.passed) {
        res.status(200).json({ ok: true, blocked: true, security });
        return;
      }
      res.status(200).json({ ok: true, slides });
      return;
    }

    res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (err) {
    const rateLimit = detectGeminiRateLimit(err);
    if (rateLimit) {
      res.status(429).json({ ok: false, status: 'rate_limited', message: 'הגעת למגבלת ה-API החינמית לשעה זו', retryAfterSeconds: rateLimit.retryAfterSeconds });
      return;
    }
    console.error('[api/agent-generate] error:', err);
    res.status(500).json({ ok: false, error: 'generation failed' });
  }
}
