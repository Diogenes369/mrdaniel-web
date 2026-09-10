import { classifyGeminiError, engineConfigReason, generateSocialContent, generateVideoScript, draftEngagementMessage, scoreLeadIntent, isEngineConfigured, generateImageGenerationPrompt, synthesizeStorySlides, synthesizeNewsPost, editSlideDeck, analyzeTrendRadar, generateEngagementReplies, synthesizeCarouselDeck, synthesizeReelScript, synthesizeSpeech, synthesizeTechTipDeck, synthesizeThreadDeck } from '../src/agent/SocialAgentEngine.js';
import { importUrlContent } from '../src/server/contentImport.js';
import { importThreadContent, parseThreadRawText, isThreadsUrl } from '../src/server/threadsImport.js';
import { sanitizeOutput } from '../src/agent/AgentSecurityGuard.js';
import { buildMediaFrames } from '../src/agent/MediaTemplateRenderer.js';
import { pushQueueItem, readAgentMode, readAgentWebhooks, readStrategicContext, writeAutoPilotRunTimestamp, agentFirebaseConfigured } from '../src/agent/firebaseServer.js';
import { runAutoPublishCycle, dispatchPublish } from '../src/server/autoPublish.js';
import { generateEmailCampaign, isCopywriterConfigured } from '../src/server/emailCopywriter.js';
import { dispatchAgentNotifications } from '../src/agent/NotificationDispatcher.js';
import { notifyNewContent, isWhatsAppBridgeConfigured } from '../src/agent/WhatsAppDispatcher.js';
import { publishSocialPost } from '../src/services/socialPublisherService.js';
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

/**
 * Reject a request whose input is too thin to synthesise from.
 *
 * These 400s used to carry an English `error` only, so the dashboard could not tell them apart from
 * any other 400 and the operator's fallback badge read "שרת ה-AI החזיר שגיאה 400". The client's
 * describeAiError() prefers `message` when present and branches on `code`, so both are sent: the
 * badge then says exactly what was missing, which is the one failure the operator can fix on the
 * spot (paste more source text) rather than retry or re-key.
 */
function rejectThinInput(res: any, what: string, message: string) {
  res.status(400).json({ ok: false, code: 'source_too_short', error: what, message });
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
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', message: 'GEMINI_API_KEY לא מוגדר כראוי בסביבת הריצה של האתר.', detail: engineConfigReason() ?? undefined });
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
        res.status(200).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', detail: engineConfigReason() ?? undefined });
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

    if (action === 'publish-social') {
      const { platform, caption, hashtags, mediaUrls, publishId, scheduledAt, sourceTitle, sourceLink, category } = req.body ?? {};
      const allowed = ['tiktok', 'instagram', 'linkedin'] as const;
      const rawPlatform = typeof platform === 'string' ? platform.toLowerCase() : 'instagram';
      const resolvedPlatform = allowed.includes(rawPlatform as (typeof allowed)[number]) ? (rawPlatform as Platform) : 'instagram';
      const result = await publishSocialPost({
        platform: resolvedPlatform,
        caption: String(caption ?? ''),
        hashtags: Array.isArray(hashtags) ? hashtags : [],
        mediaUrls: Array.isArray(mediaUrls) ? mediaUrls : [],
        publishId: typeof publishId === 'string' ? publishId : undefined,
        scheduledAt: typeof scheduledAt === 'string' ? scheduledAt : undefined,
        sourceTitle: typeof sourceTitle === 'string' ? sourceTitle : undefined,
        sourceLink: typeof sourceLink === 'string' ? sourceLink : undefined,
        category: typeof category === 'string' ? category : undefined,
      });
      res.status(result.ok ? 200 : 502).json(result);
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
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', message: 'GEMINI_API_KEY לא מוגדר כראוי בסביבת הריצה של האתר.', detail: engineConfigReason() ?? undefined });
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
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', message: 'GEMINI_API_KEY לא מוגדר כראוי בסביבת הריצה של האתר.', detail: engineConfigReason() ?? undefined });
        return;
      }
      const { title, source, topic, articleText } = req.body ?? {};
      if (typeof articleText !== 'string' || articleText.trim().length < 40) {
        rejectThinInput(res, 'articleText (>= 40 chars) required', 'טקסט הכתבה קצר מדי לסינתוז AI (נדרשים לפחות 40 תווים) — הדביקו את גוף הכתבה המלא');
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

    if (action === 'reel-script-synthesize') {
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', message: 'GEMINI_API_KEY לא מוגדר כראוי בסביבת הריצה של האתר.', detail: engineConfigReason() ?? undefined });
        return;
      }
      const { title, source, topic, articleText } = req.body ?? {};
      if (typeof articleText !== 'string' || articleText.trim().length < 40) {
        rejectThinInput(res, 'articleText (>= 40 chars) required', 'טקסט הכתבה קצר מדי לתסריט AI (נדרשים לפחות 40 תווים) — הדביקו את גוף הכתבה המלא');
        return;
      }
      const reel = await synthesizeReelScript({
        title: String(title ?? ''),
        source: String(source ?? ''),
        topic: String(topic ?? 'general'),
        articleText,
      });
      const flat = `${reel.hook}\n${reel.scenes.map((s) => `${s.onScreenText}\n${s.voiceover}`).join('\n')}\n${reel.cta}`;
      const security = sanitizeOutput(flat);
      if (!security.passed) {
        res.status(200).json({ ok: true, blocked: true, security });
        return;
      }
      res.status(200).json({ ok: true, reel });
      return;
    }

    if (action === 'reel-tts') {
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', message: 'GEMINI_API_KEY לא מוגדר כראוי בסביבת הריצה של האתר.', detail: engineConfigReason() ?? undefined });
        return;
      }
      const { text, voiceName } = req.body ?? {};
      if (typeof text !== 'string' || !text.trim()) {
        rejectThinInput(res, 'text required', 'לא הועבר טקסט להקראה');
        return;
      }
      const speech = await synthesizeSpeech(text, typeof voiceName === 'string' && voiceName.trim() ? voiceName : undefined);
      res.status(200).json({ ok: true, audioBase64: speech.audioBase64, mimeType: speech.mimeType });
      return;
    }

    if (action === 'tech-tip-deck') {
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', message: 'GEMINI_API_KEY לא מוגדר כראוי בסביבת הריצה של האתר.', detail: engineConfigReason() ?? undefined });
        return;
      }
      const { topic, notes } = req.body ?? {};
      if (typeof topic !== 'string' || topic.trim().length < 8) {
        rejectThinInput(res, 'topic (>= 8 chars) required', 'הנושא קצר מדי לבניית דק (נדרשים לפחות 8 תווים)');
        return;
      }
      const deck = await synthesizeTechTipDeck({ topic, notes: typeof notes === 'string' ? notes : undefined });
      // Code is excluded from the output guard on purpose: sanitizeOutput's heuristics flag ordinary
      // source (URLs, key-like identifiers) as leaks. The Hebrew prose is what gets checked.
      const prose = deck.slides.map((s) => `${s.title}\n${s.body}\n${s.bullets.join('\n')}`).join('\n\n');
      const security = sanitizeOutput(prose);
      if (!security.passed) {
        res.status(200).json({ ok: true, blocked: true, security });
        return;
      }
      res.status(200).json({ ok: true, deck });
      return;
    }

    if (action === 'parse-thread') {
      // Threads → carousel, step 1. Deliberately never fails on a blocked/gated post: it answers
      // 200 with ok:false + a note, and the dashboard switches to the manual-paste path. `rawText`
      // alone (no fetch at all) is a first-class input, used when the operator pastes the thread.
      const { url, rawText } = req.body ?? {};
      const pastedText = typeof rawText === 'string' ? rawText.trim() : '';
      const rawTarget = typeof url === 'string' ? url.trim() : '';

      if (!pastedText && !rawTarget) {
        rejectThinInput(res, 'url or rawText required', 'לא הועברה כתובת מקור ולא טקסט גולמי לייבוא');
        return;
      }

      const thread = pastedText
        ? parseThreadRawText(pastedText, rawTarget)
        : isThreadsUrl(rawTarget)
          ? await importThreadContent(rawTarget)
          : null;

      if (!thread) {
        rejectThinInput(res, 'valid threads.net / threads.com post url required', 'הכתובת אינה קישור תקין לפוסט ב-Threads');
        return;
      }

      const security = sanitizeOutput(thread.text.slice(0, 6000));
      if (!security.passed) {
        res.status(200).json({ ok: true, blocked: true, security });
        return;
      }
      res.status(200).json({ ok: true, thread });
      return;
    }

    if (action === 'thread-deck') {
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', message: 'GEMINI_API_KEY לא מוגדר כראוי בסביבת הריצה של האתר.', detail: engineConfigReason() ?? undefined });
        return;
      }
      const { posts, author, sourceUrl, notes } = req.body ?? {};
      const cleanPosts = (Array.isArray(posts) ? posts : []).map((p: unknown) => String(p ?? '').trim()).filter(Boolean);
      if (cleanPosts.join('\n').length < 40) {
        rejectThinInput(res, 'posts (>= 40 chars total) required', 'טקסט השרשור קצר מדי לעיבוד AI (נדרשים לפחות 40 תווים) — הדביקו את הטקסט המלא');
        return;
      }
      const deck = await synthesizeThreadDeck({
        posts: cleanPosts.slice(0, 30),
        author: typeof author === 'string' ? author.slice(0, 60) : undefined,
        sourceUrl: typeof sourceUrl === 'string' ? sourceUrl.slice(0, 300) : undefined,
        notes: typeof notes === 'string' ? notes.slice(0, 600) : undefined,
      });
      // Same carve-out as tech-tip-deck: the guard's heuristics flag ordinary source code as a
      // leak, so only the Hebrew prose is checked.
      const prose = deck.slides.map((s) => `${s.title}\n${s.body}\n${s.bullets.join('\n')}`).join('\n\n');
      const security = sanitizeOutput(prose);
      if (!security.passed) {
        res.status(200).json({ ok: true, blocked: true, security });
        return;
      }
      res.status(200).json({ ok: true, deck });
      return;
    }

    if (action === 'post-synthesize') {
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', message: 'GEMINI_API_KEY לא מוגדר כראוי בסביבת הריצה של האתר.', detail: engineConfigReason() ?? undefined });
        return;
      }
      const { title, source, topic, platform, articleText, variant } = req.body ?? {};
      if (typeof articleText !== 'string' || articleText.trim().length < 40) {
        rejectThinInput(res, 'articleText (>= 40 chars) required', 'טקסט הכתבה קצר מדי לניסוח פוסט (נדרשים לפחות 40 תווים) — הדביקו את גוף הכתבה המלא');
        return;
      }
      const post = await synthesizeNewsPost({
        title: String(title ?? ''),
        source: String(source ?? ''),
        topic: String(topic ?? 'general'),
        platform: platform === 'instagram' ? 'instagram' : 'linkedin',
        variant: variant === 'whatsapp' ? 'whatsapp' : 'linkedin',
        articleText,
      });
      const security = sanitizeOutput(`${post.body}\n\n${post.hashtags.join(' ')}`);
      if (!security.passed) {
        res.status(200).json({ ok: true, blocked: true, security });
        return;
      }
      res.status(200).json({ ok: true, post });
      return;
    }

    if (action === 'import-url') {
      const { url } = req.body ?? {};
      if (typeof url !== 'string' || !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}/i.test(url.trim())) {
        rejectThinInput(res, 'valid url required', 'הכתובת שהוזנה אינה כתובת אתר תקינה');
        return;
      }
      const imported = await importUrlContent(url.trim());
      const security = sanitizeOutput(`${imported.title}\n${imported.body}`.slice(0, 4000));
      if (!security.passed) {
        res.status(200).json({ ok: true, blocked: true, security });
        return;
      }
      res.status(200).json({ ok: true, imported });
      return;
    }

    if (action === 'carousel-studio') {
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', message: 'GEMINI_API_KEY לא מוגדר כראוי בסביבת הריצה של האתר.', detail: engineConfigReason() ?? undefined });
        return;
      }
      const { title, source, topic, brief, takeaways } = req.body ?? {};
      if (typeof brief !== 'string' || brief.trim().length < 40) {
        rejectThinInput(res, 'brief (>= 40 chars) required', 'הבריף קצר מדי לבניית קרוסלה (נדרשים לפחות 40 תווים)');
        return;
      }
      const deck = await synthesizeCarouselDeck({
        title: String(title ?? ''),
        source: String(source ?? ''),
        topic: String(topic ?? 'general'),
        brief,
        takeaways: Array.isArray(takeaways) ? takeaways.map((t: unknown) => String(t)) : [],
      });
      const security = sanitizeOutput(
        deck.map((s) => `${s.headline}\n${s.subhead}\n${s.body}\n${s.quote}\n${s.bullets.join('\n')}\n${s.bulletsLeft.join('\n')}`).join('\n\n')
      );
      if (!security.passed) {
        res.status(200).json({ ok: true, blocked: true, security });
        return;
      }
      res.status(200).json({ ok: true, deck });
      return;
    }

    if (action === 'slides-edit') {
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', message: 'GEMINI_API_KEY לא מוגדר כראוי בסביבת הריצה של האתר.', detail: engineConfigReason() ?? undefined });
        return;
      }
      const { instruction, slides } = req.body ?? {};
      if (typeof instruction !== 'string' || instruction.trim().length < 3) {
        res.status(400).json({ ok: false, error: 'instruction (>= 3 chars) required' });
        return;
      }
      if (!Array.isArray(slides) || slides.length < 2) {
        rejectThinInput(res, 'slides array (>= 2) required', 'אין מספיק שקופיות לעריכה (נדרשות לפחות 2)');
        return;
      }
      const edited = await editSlideDeck({ instruction, slides });
      const security = sanitizeOutput(edited.map((s) => s.text).join('\n\n'));
      if (!security.passed) {
        res.status(200).json({ ok: true, blocked: true, security });
        return;
      }
      res.status(200).json({ ok: true, slides: edited });
      return;
    }

    if (action === 'trend-radar') {
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', message: 'GEMINI_API_KEY לא מוגדר כראוי בסביבת הריצה של האתר.', detail: engineConfigReason() ?? undefined });
        return;
      }
      const { items } = req.body ?? {};
      if (!Array.isArray(items) || items.length < 3) {
        rejectThinInput(res, 'items array (>= 3) required', 'אין מספיק פריטי מקור לניתוח מגמות (נדרשים לפחות 3)');
        return;
      }
      const radar = await analyzeTrendRadar({
        // Compact + capped: title/source/category only, no summaries or URLs — a large payload
        // was triggering transient Gemini 500s. analyzeTrendRadar caps again at its own limit.
        items: items.slice(0, 15).map((i: any) => ({
          title: String(i?.title ?? '').slice(0, 180),
          source: String(i?.source ?? '').slice(0, 60),
          category: String(i?.category ?? i?.topic ?? 'general').slice(0, 24),
        })),
      });
      const flat = JSON.stringify(radar);
      const security = sanitizeOutput(flat.slice(0, 6000));
      if (!security.passed) {
        res.status(200).json({ ok: true, blocked: true, security });
        return;
      }
      res.status(200).json({ ok: true, radar });
      return;
    }

    if (action === 'engagement-replies') {
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', message: 'GEMINI_API_KEY לא מוגדר כראוי בסביבת הריצה של האתר.', detail: engineConfigReason() ?? undefined });
        return;
      }
      const { postText, sourceUrl, lang } = req.body ?? {};
      if (typeof postText !== 'string' || postText.trim().length < 20) {
        rejectThinInput(res, 'postText (>= 20 chars) required', 'טקסט הפוסט קצר מדי לניסוח תגובות (נדרשים לפחות 20 תווים)');
        return;
      }
      const replies = await generateEngagementReplies({
        postText,
        sourceUrl: typeof sourceUrl === 'string' ? sourceUrl : undefined,
        lang: typeof lang === 'string' ? lang : undefined,
      });
      const security = sanitizeOutput(replies.map((r) => r.text).join('\n\n'));
      if (!security.passed) {
        res.status(200).json({ ok: true, blocked: true, security });
        return;
      }
      res.status(200).json({ ok: true, replies });
      return;
    }

    res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (err) {
    // Every failure below this endpoint used to collapse into the same opaque 500, so the
    // dashboard could only ever say "שרת ה-AI החזיר שגיאה 500" - which does not tell the operator
    // whether to retry, re-key, or paste the text by hand. classifyGeminiError() maps the cause to
    // a real status plus a stable `code` the dashboard can branch on and a Hebrew `message` it can
    // show verbatim. `detail` keeps the underlying text for the server log and for debugging.
    const failure = classifyGeminiError(err);
    const detail = (err as Error)?.message?.slice(0, 400);

    console.error(`[api/agent-generate] action=${action ?? 'unknown'} code=${failure.code} status=${failure.status}:`, err);

    if (failure.code === 'rate_limited') {
      // Unchanged shape - the dashboard clients already special-case this exact response.
      res.status(429).json({
        ok: false,
        status: 'rate_limited',
        code: failure.code,
        message: failure.message,
        retryAfterSeconds: failure.retryAfterSeconds,
      });
      return;
    }

    res.status(failure.status).json({
      ok: false,
      code: failure.code,
      error: failure.code,
      message: failure.message,
      retryable: failure.retryable,
      detail,
    });
  }
}
