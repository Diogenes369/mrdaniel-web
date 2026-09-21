import { classifyGeminiError, engineConfigReason, generateSocialContent, generateVideoScript, draftEngagementMessage, scoreLeadIntent, isEngineConfigured, generateImageGenerationPrompt, synthesizeStorySlides, synthesizeNewsPost, editSlideDeck, analyzeTrendRadar, generateEngagementReplies, synthesizeCarouselDeck, synthesizeStoryCarousel, synthesizeReelScript, synthesizeSpeech, synthesizeTechTipDeck } from '../src/agent/SocialAgentEngine.js';
import { toFigmaSlides } from '../src/agent/storyCarousel.js';
import { listTemplates, DEFAULT_TEMPLATE_ID } from '../src/agent/figmaTemplates.js';

/** Valid contentKind values, echoed by list-templates so Hermes can discover them. */
const CAROUSEL_KINDS = ['news', 'thread', 'comparison'];
import { importUrlContent } from '../src/server/contentImport.js';
import { optimizeForGrowth, flattenGrowthResult, GROWTH_OPS, type GrowthOp } from '../src/server/igGrowthStrategy.js';
import { importThreadContent, parseThreadRawText, isThreadsUrl, type ImportedThread, type ThreadPost } from '../src/server/threadsThreadFetcher.js';
import { buildThreadDeck, detectTool } from '../src/server/agents/threadsThreadAgent.js';
import { buildImageCarouselDeck } from '../src/server/agents/imageTranslatorAgent.js';
import { isHiggsfieldAction } from '../src/server/openHiggsfieldActions.js';
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
  { platform: 'linkedin', topic: 'איך בוחרים מודל שפה למשימה: Grok, Claude, Gemini או GPT', format: 'post' },
  { platform: 'linkedin', topic: 'מודל מקומי מול מודל בענן: מתי מודל קטן מספיק', format: 'post' },
  { platform: 'instagram', topic: 'סוכן AI ראשון: 5 החלטות שקובעות אם הוא יעבוד', format: 'carousel' },
  { platform: 'instagram', topic: '3 טעויות שכולם עושים כשהם כותבים פרומפט לסוכן AI', format: 'carousel' },
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
    // Image/video generation over the OpenHiggsfield catalog (38 models). Dynamically imported so
    // the catalog and its mapper never load for the 20-odd Gemini actions that share this function,
    // the same way news.ts defers its analyze branch. See src/server/openHiggsfieldActions.ts and
    // docs/openhiggsfield-bridge.md.
    if (isHiggsfieldAction(action)) {
      const { handleHiggsfieldAction } = await import('../src/server/openHiggsfieldActions.js');
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
      const { slides, hookOptions } = await synthesizeStorySlides({
        title: String(title ?? ''),
        source: String(source ?? ''),
        topic: String(topic ?? 'general'),
        articleText,
      });
      const security = sanitizeOutput(
        [...slides.map((s) => `${s.title}\n${s.narrativeText}`), ...hookOptions.map((h) => `${h.line}\n${h.visual}`)].join('\n\n')
      );
      if (!security.passed) {
        res.status(200).json({ ok: true, blocked: true, security });
        return;
      }
      // `hookOptions` is additive: older dashboard builds read `slides` only and ignore it.
      res.status(200).json({ ok: true, slides, hookOptions });
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
      const flat = `${reel.hook}\n${(reel.hookOptions ?? []).map((h) => `${h.line}\n${h.visual}`).join('\n')}\n${reel.scenes.map((s) => `${s.onScreenText}\n${s.voiceover}`).join('\n')}\n${reel.cta}`;
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
      // Tech Tips decks wear real tool logos too — same scored detector as the Threads agent. Each
      // slide's own copy wins, the topic is the fallback, so a "Vercel + Next.js" deck shows both.
      const deckTool = detectTool(`${topic}
${typeof notes === 'string' ? notes : ''}`);
      for (const slide of deck.slides) {
        slide.tool = detectTool(`${slide.title} ${slide.body} ${slide.bullets.join(' ')} ${slide.code}`) ?? deckTool;
      }
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
      // Threads → carousel, step 2. Runs through the dedicated agent
      // (src/server/agents/threadsThreadAgent.ts), which assigns the theme, the topic badge, the
      // step indicators, the prompt boxes and the CTA guide on top of the engine's Hebrew
      // adaptation.
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', message: 'GEMINI_API_KEY לא מוגדר כראוי בסביבת הריצה של האתר.', detail: engineConfigReason() ?? undefined });
        return;
      }
      const { thread, posts, author, sourceUrl, notes } = req.body ?? {};
      // The dashboard now sends the whole imported thread (posts + per-post images); builds before
      // 2026-09-12 sent the loose fields. Both shapes are accepted so a stale dashboard tab that a
      // live-ops operator left open keeps working against the new deployment.
      const src = (thread && typeof thread === 'object' ? thread : { posts, author, url: sourceUrl }) as Partial<ImportedThread>;
      const cleanPosts = (Array.isArray(src.posts) ? src.posts : [])
        .map((p: unknown) => String(p ?? '').trim())
        .filter(Boolean)
        .slice(0, 30);
      if (cleanPosts.join('\n').length < 40) {
        rejectThinInput(res, 'posts (>= 40 chars total) required', 'טקסט השרשור קצר מדי לעיבוד AI (נדרשים לפחות 40 תווים) — הדביקו את הטקסט המלא');
        return;
      }
      // Images must already be same-origin-proxied by the fetcher. Re-checking here rather than
      // trusting the body means a crafted request cannot plant an arbitrary URL in a slide that the
      // renderer would then fetch on the operator's behalf.
      const proxied = (v: unknown): string[] =>
        (Array.isArray(v) ? v : [])
          .map((u: unknown) => String(u ?? ''))
          .filter((u) => u.startsWith('https://mrdaniel.co.il/api/img-proxy?url='))
          .slice(0, 4);
      const items: ThreadPost[] = Array.isArray(src.items) && src.items.length === cleanPosts.length
        ? cleanPosts.map((text, i) => ({ text, images: proxied((src.items as ThreadPost[])[i]?.images) }))
        : cleanPosts.map((text) => ({ text, images: [] }));
      const normalized: ImportedThread = {
        ok: true,
        url: typeof src.url === 'string' ? src.url.slice(0, 300) : '',
        author: typeof src.author === 'string' ? src.author.slice(0, 60) : '',
        posts: cleanPosts,
        items,
        images: [...new Set(items.flatMap((p) => p.images))].slice(0, 20),
        replyCount: Math.max(0, cleanPosts.length - 1),
        text: cleanPosts.join('\n\n'),
        via: typeof src.via === 'string' ? (src.via as ImportedThread['via']) : 'manual',
      };
      const result = await buildThreadDeck({
        thread: normalized,
        notes: typeof notes === 'string' ? notes.slice(0, 600) : undefined,
      });
      // Same carve-out as tech-tip-deck: the guard's heuristics flag ordinary source code as a
      // leak, so only the Hebrew prose is checked. The prompt box rides with the code exemption —
      // it is a verbatim quote of a model instruction, not generated prose.
      const prose = result.deck.slides.map((s) => `${s.title}\n${s.body}\n${s.bullets.join('\n')}`).join('\n\n');
      const security = sanitizeOutput(prose);
      if (!security.passed) {
        res.status(200).json({ ok: true, blocked: true, security });
        return;
      }
      res.status(200).json({
        ok: true,
        deck: result.deck,
        topic: result.topic,
        synthesized: result.synthesized,
        fallbackReason: result.fallbackReason,
      });
      return;
    }

    if (action === 'parse-x-post') {
      // X (Twitter) → carousel + Hebrew-subtitled video, step 1. Same soft contract as
      // `parse-thread`: a deleted, protected or rate-limited post answers 200 with ok:false + a
      // Hebrew note, and the dashboard switches to the manual-paste path rather than showing an
      // error. `rawText` alone (no fetch at all) is a first-class input.
      //
      // Dynamically imported so the X fetcher, its cheerio use and the subtitle module never load
      // for the twenty-odd Hebrew content actions that share this function.
      const { url, rawText } = req.body ?? {};
      const pastedText = typeof rawText === 'string' ? rawText.trim() : '';
      const rawTarget = typeof url === 'string' ? url.trim() : '';

      if (!pastedText && !rawTarget) {
        rejectThinInput(res, 'url or rawText required', 'לא הועברה כתובת מקור ולא טקסט גולמי לייבוא');
        return;
      }

      const { importXPost, parseXRawText, isXUrl } = await import('../src/server/xPostFetcher.js');
      const post = pastedText
        ? parseXRawText(pastedText, rawTarget)
        : isXUrl(rawTarget)
          ? await importXPost(rawTarget)
          : null;

      if (!post) {
        rejectThinInput(res, 'valid x.com / twitter.com post url required', 'הכתובת אינה קישור תקין לפוסט ב-X / Twitter');
        return;
      }

      const security = sanitizeOutput(post.text.slice(0, 6000));
      if (!security.passed) {
        res.status(200).json({ ok: true, blocked: true, security });
        return;
      }
      res.status(200).json({ ok: true, post });
      return;
    }

    if (action === 'x-subtitles') {
      // X → Hebrew subtitles, step 2 (optional). Gemini reads the mp4 directly — transcription,
      // translation and cue timing in one call — because every alternative (FFmpeg on the function,
      // a hosted ASR vendor) is either a paid dependency or does not fit the Hobby runtime. See the
      // header of src/server/xSubtitles.ts for the full reasoning.
      //
      // Only `videoUrl` is taken from the body, and it is re-validated against video.twimg.com here
      // rather than trusted: an unchecked URL would make this endpoint fetch an arbitrary host on
      // the operator's behalf and hand the bytes to the model.
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', message: 'GEMINI_API_KEY לא מוגדר כראוי בסביבת הריצה של האתר.', detail: engineConfigReason() ?? undefined });
        return;
      }
      const { videoUrl, durationMs, width, height, notes } = req.body ?? {};
      const { isXVideoUrl } = await import('../src/server/xPostFetcher.js');
      if (typeof videoUrl !== 'string' || !isXVideoUrl(videoUrl)) {
        res.status(400).json({ ok: false, error: 'valid video.twimg.com mp4 url required', message: 'לא התקבלה כתובת וידאו תקינה מהפוסט ב-X.' });
        return;
      }
      const { transcribeXVideo, buildSrt, buildVtt, MAX_VIDEO_SECONDS } = await import('../src/server/xSubtitles.js');
      const clipMs = Math.max(0, Math.round(Number(durationMs) || 0));
      if (clipMs > MAX_VIDEO_SECONDS * 1000) {
        res.status(400).json({
          ok: false,
          error: `video too long: ${Math.round(clipMs / 1000)}s`,
          message: `הסרטון ארוך מדי לתמלול (${Math.round(clipMs / 60000)} דקות). המגבלה היא ${MAX_VIDEO_SECONDS / 60} דקות.`,
        });
        return;
      }
      const track = await transcribeXVideo({
        variant: {
          url: videoUrl,
          bitrate: 0,
          width: Math.max(0, Math.round(Number(width) || 0)),
          height: Math.max(0, Math.round(Number(height) || 0)),
        },
        durationMs: clipMs,
        notes: typeof notes === 'string' ? notes.slice(0, 400) : undefined,
      });
      // The transcript is someone else's speech about to be burned onto a video this account
      // publishes, so it goes through the same guard every other generated Hebrew string does.
      const security = sanitizeOutput(track.transcript.slice(0, 8000));
      if (!security.passed) {
        res.status(200).json({ ok: true, blocked: true, security });
        return;
      }
      res.status(200).json({
        ok: true,
        track,
        srt: buildSrt(track.cues),
        vtt: buildVtt(track.cues),
      });
      return;
    }

    if (action === 'x-post-deck') {
      // X → carousel, step 3. Runs through the dedicated agent (src/server/agents/xPostAgent.ts),
      // which folds the video's Hebrew transcript in as deck source material and then reuses the
      // Threads agent's layout pass for the theme, badges, step indicators and CTA.
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', message: 'GEMINI_API_KEY לא מוגדר כראוי בסביבת הריצה של האתר.', detail: engineConfigReason() ?? undefined });
        return;
      }
      const { post, transcript, notes } = req.body ?? {};
      const src = (post && typeof post === 'object' ? post : {}) as Record<string, unknown>;
      const cleanPosts = (Array.isArray(src.posts) ? src.posts : [])
        .map((p: unknown) => String(p ?? '').trim())
        .filter(Boolean)
        .slice(0, 30);
      const cleanTranscript = typeof transcript === 'string' ? transcript.slice(0, 20000).trim() : '';
      // A video post legitimately carries almost no written text — the transcript is its content —
      // so the floor is applied to the two sources combined, not to the post text alone.
      if (`${cleanPosts.join('\n')}\n${cleanTranscript}`.trim().length < 40) {
        rejectThinInput(res, 'posts or transcript (>= 40 chars total) required', 'אין מספיק טקסט מקור לעיבוד AI (נדרשים לפחות 40 תווים) — הדביקו את טקסט הפוסט או הפיקו קודם כתוביות');
        return;
      }
      // Images must already be same-origin-proxied by the fetcher. Re-checking here rather than
      // trusting the body means a crafted request cannot plant an arbitrary URL in a slide that the
      // renderer would then fetch on the operator's behalf.
      const proxied = (v: unknown): string[] =>
        (Array.isArray(v) ? v : [])
          .map((u: unknown) => String(u ?? ''))
          .filter((u) => u.startsWith('https://mrdaniel.co.il/api/img-proxy?url='))
          .slice(0, 4);
      const items = Array.isArray(src.items) && src.items.length === cleanPosts.length
        ? cleanPosts.map((text, i) => ({ text, images: proxied((src.items as { images?: unknown }[])[i]?.images) }))
        : cleanPosts.map((text) => ({ text, images: [] as string[] }));
      const { buildXDeck } = await import('../src/server/agents/xPostAgent.js');
      const result = await buildXDeck({
        post: {
          ok: true,
          url: typeof src.url === 'string' ? src.url.slice(0, 300) : '',
          id: typeof src.id === 'string' ? src.id.slice(0, 25) : '',
          author: typeof src.author === 'string' ? src.author.slice(0, 60) : '',
          authorName: typeof src.authorName === 'string' ? src.authorName.slice(0, 60) : '',
          posts: cleanPosts,
          items,
          images: [...new Set(items.flatMap((p) => p.images))].slice(0, 20),
          replyCount: Math.max(0, cleanPosts.length - 1),
          text: cleanPosts.join('\n\n'),
          via: 'manual',
        },
        transcript: cleanTranscript || undefined,
        notes: typeof notes === 'string' ? notes.slice(0, 600) : undefined,
      });
      // Same carve-out as thread-deck: the guard's heuristics flag ordinary source code as a leak,
      // so only the Hebrew prose is checked.
      const prose = result.deck.slides.map((s) => `${s.title}\n${s.body}\n${s.bullets.join('\n')}`).join('\n\n');
      const security = sanitizeOutput(prose);
      if (!security.passed) {
        res.status(200).json({ ok: true, blocked: true, security });
        return;
      }
      res.status(200).json({
        ok: true,
        deck: result.deck,
        topic: result.topic,
        synthesized: result.synthesized,
        fallbackReason: result.fallbackReason,
        transcriptSegments: result.transcriptSegments,
      });
      return;
    }

    if (action === 'image-carousel-deck') {
      // Direct carousel image upload → translated, rebranded carousel. Replaces the old
      // parse-instagram/instagram-deck pair: there is no URL to fetch and no caption to translate —
      // the operator uploads the carousel's own slide images directly, and the dedicated agent
      // (src/server/agents/imageTranslatorAgent.ts) reads and translates every frame via Gemini
      // vision in one call, then assigns the theme, topic badge and CTA guide.
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', message: 'GEMINI_API_KEY לא מוגדר כראוי בסביבת הריצה של האתר.', detail: engineConfigReason() ?? undefined });
        return;
      }
      const { frames: rawFrames, notes, visualPreset } = req.body ?? {};
      // Base64 payloads only — never a URL, so this route cannot be turned into an SSRF proxy. A
      // 6 MB per-frame ceiling (base64, ~4.5 MB decoded) mirrors the old fetcher's own limit on a
      // single carousel frame; the dashboard already downsizes before upload, so a legitimate
      // carousel export never comes close.
      const frames: { mimeType: string; data: string }[] = (Array.isArray(rawFrames) ? rawFrames : [])
        .slice(0, 20)
        .map((f: unknown) => {
          const rec = (f && typeof f === 'object' ? f : {}) as { mimeType?: unknown; data?: unknown };
          const mimeType = String(rec.mimeType ?? '').toLowerCase();
          const data = String(rec.data ?? '').replace(/^data:[^;]+;base64,/, '');
          return { mimeType, data };
        })
        .filter((f) => /^image\/(jpeg|jpg|png|webp|gif)$/.test(f.mimeType) && f.data.length > 100 && f.data.length < 6_000_000);

      if (frames.length < 2) {
        rejectThinInput(
          res,
          'at least 2 carousel frame images required',
          'העלו לפחות שתי תמונות שקופיות מהקרוסלה (jpg / png / webp)'
        );
        return;
      }

      const preset: 'creator' | 'cream-skill' | 'cream-workflow' | 'cream-prompt-library' | 'auto-detect' =
        visualPreset === 'cream-skill' ||
        visualPreset === 'cream-workflow' ||
        visualPreset === 'cream-prompt-library' ||
        visualPreset === 'auto-detect'
          ? visualPreset
          : 'creator';

      const result = await buildImageCarouselDeck({
        frames,
        notes: typeof notes === 'string' ? notes.slice(0, 600) : undefined,
        visualPreset: preset,
      });
      // Same carve-out as thread-deck / instagram-deck: the guard's heuristics flag ordinary source
      // code as a leak, so only the Hebrew prose is checked. Prompt-library slides carry their
      // visible copy in `promptCards`, not `title`/`body`, so those are folded in too.
      const prose = result.deck.slides
        .map((s) => `${s.title}\n${s.body}\n${s.bullets.join('\n')}\n${(s.promptCards ?? []).map((c) => `${c.body}\n${c.whyIUseThis}`).join('\n')}`)
        .join('\n\n');
      const security = sanitizeOutput(prose);
      if (!security.passed) {
        res.status(200).json({ ok: true, blocked: true, security });
        return;
      }
      res.status(200).json({
        ok: true,
        deck: result.deck,
        topic: result.topic,
        synthesized: result.synthesized,
        fallbackReason: result.fallbackReason,
        resolvedPreset: result.resolvedPreset,
      });
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

    // Discovery for external callers (Hermes): which templates exist, before choosing one.
    // Deliberately needs no Gemini key — it is a registry read, not a generation.
    if (action === 'list-templates') {
      res.status(200).json({ ok: true, templates: listTemplates(), default: DEFAULT_TEMPLATE_ID, contentKinds: CAROUSEL_KINDS });
      return;
    }

    // The tight Title/Subtitle/Body format wired to the Figma template. Separate action from
    // 'carousel-studio' because the slide shape differs and the dashboard reads them differently.
    if (action === 'story-carousel') {
      const NL = String.fromCharCode(10);
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', message: 'GEMINI_API_KEY לא מוגדר כראוי בסביבת הריצה של האתר.', detail: engineConfigReason() ?? undefined });
        return;
      }
      const { title, source, topic, brief, slideCount, templateId, contentKind } = req.body ?? {};
      if (typeof brief !== 'string' || brief.trim().length < 40) {
        rejectThinInput(res, 'brief (>= 40 chars) required', 'הבריף קצר מדי לבניית קרוסלה (נדרשים לפחות 40 תווים)');
        return;
      }
      // An unregistered templateId is the caller's mistake, not a server fault, and Hermes needs to
      // be able to tell those apart — so it answers 400 with the valid ids rather than a 500.
      let storyDeck;
      try {
        storyDeck = await synthesizeStoryCarousel({
          title: String(title ?? ''),
          source: String(source ?? ''),
          topic: String(topic ?? 'general'),
          brief,
          slideCount: Number(slideCount) || undefined,
          templateId: templateId ? String(templateId) : undefined,
          contentKind: CAROUSEL_KINDS.includes(String(contentKind)) ? (String(contentKind) as 'news' | 'thread' | 'comparison') : undefined,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/unknown figma template/.test(msg)) {
          res.status(400).json({ ok: false, code: 'unknown_template', error: msg, templates: listTemplates() });
          return;
        }
        throw err;
      }
      const storySecurity = sanitizeOutput(
        storyDeck.slides.map((s) => [s.title, s.subtitle, ...s.bodyLines].filter(Boolean).join(NL)).join(NL + NL)
      );
      if (!storySecurity.passed) {
        res.status(200).json({ ok: true, blocked: true, security: storySecurity });
        return;
      }
      res.status(200).json({ ok: true, templateId: storyDeck.templateId, contentKind: storyDeck.contentKind, deck: storyDeck.slides, warnings: storyDeck.warnings, figmaPlan: storyDeck.figmaPlan, figmaSlides: toFigmaSlides(storyDeck) });
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

    // ── Grok (xAI) — X-optimized carousels + threads. See src/server/agents/grokCarouselAgent.ts.
    //    Dynamically imported so the 20-odd Gemini/Groq actions never load the xAI path.
    if (action === 'grok-status') {
      const { isXaiConfigured, xaiModel } = await import('../src/server/xaiClient.js');
      const { X_RANKING_WEIGHTS, X_RANKING_ADJUSTMENTS, X_ALGORITHM_SOURCE } = await import('../src/server/xAlgorithm.js');
      res.status(200).json({ ok: true, configured: isXaiConfigured(), model: xaiModel(), weights: X_RANKING_WEIGHTS, adjustments: X_RANKING_ADJUSTMENTS, source: X_ALGORITHM_SOURCE });
      return;
    }

    if (action === 'x-score') {
      const { scoreXThread } = await import('../src/server/xAlgorithm.js');
      const posts = Array.isArray(req.body?.posts) ? req.body.posts : [];
      res.status(200).json({
        ok: true,
        report: scoreXThread({
          posts: posts.map((p: any) => ({ text: String(p?.text ?? ''), mediaSlides: Array.isArray(p?.mediaSlides) ? p.mediaSlides.map(Number) : [] })),
          hasVideo: Boolean(req.body?.hasVideo),
        }),
      });
      return;
    }

    if (action === 'grok-carousel') {
      const { runGrokCarouselAgent } = await import('../src/server/agents/grokCarouselAgent.js');
      const { describeXaiError } = await import('../src/server/xaiClient.js');
      const { title, source, topic, brief, takeaways } = req.body ?? {};
      if (typeof brief !== 'string' || brief.trim().length < 40) {
        rejectThinInput(res, 'brief (>= 40 chars) required', 'הבריף קצר מדי לבניית קרוסלה (נדרשים לפחות 40 תווים)');
        return;
      }
      try {
        const result = await runGrokCarouselAgent({
          title: String(title ?? ''),
          source: String(source ?? ''),
          topic: String(topic ?? 'ai'),
          brief,
          takeaways: Array.isArray(takeaways) ? takeaways.map((t: unknown) => String(t)) : [],
        });
        if (!result.verification.securityPassed) {
          res.status(200).json({ ok: true, blocked: true, verification: result.verification });
          return;
        }
        res.status(200).json({ ok: true, ...result });
      } catch (err) {
        const e = describeXaiError(err);
        res.status(e.status).json({ ok: false, code: e.code, error: e.message, message: e.message });
      }
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

    if (action === 'growth-optimize') {
      // IG Growth Strategy Engine — the dashboard Growth panel's one-click refines over content
      // that already exists (see src/server/igGrowthStrategy.ts). Folded in here, not a new
      // function: the Hobby plan is at its 12-function ceiling.
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', message: 'GEMINI_API_KEY לא מוגדר כראוי בסביבת הריצה של האתר.', detail: engineConfigReason() ?? undefined });
        return;
      }
      const { op, kind, topic, title, hook, body, trigger } = req.body ?? {};
      if (!(GROWTH_OPS as readonly string[]).includes(op)) {
        res.status(400).json({ ok: false, error: 'invalid op — expected hooks | cheat-sheet | pack' });
        return;
      }
      if (typeof body !== 'string' || body.trim().length < 40) {
        rejectThinInput(res, 'body (>= 40 chars) required', 'התוכן קצר מדי לאופטימיזציית צמיחה (נדרשים לפחות 40 תווים)');
        return;
      }
      const result = await optimizeForGrowth({
        op: op as GrowthOp,
        kind: typeof kind === 'string' ? kind : 'carousel',
        topic: typeof topic === 'string' ? topic : 'general',
        title: typeof title === 'string' ? title : '',
        hook: typeof hook === 'string' ? hook : '',
        body,
        trigger:
          trigger && typeof trigger === 'object'
            ? {
                keyword: typeof trigger.keyword === 'string' ? trigger.keyword : undefined,
                deliverable: typeof trigger.deliverable === 'string' ? trigger.deliverable : undefined,
              }
            : undefined,
      });
      const security = sanitizeOutput(flattenGrowthResult(result));
      if (!security.passed) {
        res.status(200).json({ ok: true, blocked: true, security });
        return;
      }
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (action === 'screenshot-to-code') {
      // Screenshot / design mock -> a React + Tailwind component. The vision prompt is ported from
      // abi/screenshot-to-code; the agent module explains exactly what was kept and what was
      // dropped. Folded in here rather than given its own route for the same reason as every other
      // action on this endpoint: the Hobby plan is at its 12-function ceiling.
      //
      // Dynamically imported, like the Higgsfield branch, so the screenshot prompt corpus never
      // loads for the twenty-odd Hebrew content actions that share this function.
      if (!isEngineConfigured()) {
        res.status(503).json({ ok: false, code: 'not_configured', error: 'GEMINI_API_KEY not configured', message: 'GEMINI_API_KEY לא מוגדר כראוי בסביבת הריצה של האתר.', detail: engineConfigReason() ?? undefined });
        return;
      }
      const { images, instructions, componentName, variant } = req.body ?? {};
      if (!Array.isArray(images) || images.length === 0) {
        res.status(400).json({ ok: false, error: 'missing images', message: 'לא צורפה תמונת מסך. העלו או הדביקו צילום מסך אחד לפחות.' });
        return;
      }
      const {
        generateComponentFromScreenshot,
        validateScreenshotImage,
        MAX_SCREENSHOTS,
      } = await import('../src/server/agents/screenshotCodeAgent.js');
      if (images.length > MAX_SCREENSHOTS) {
        res.status(400).json({ ok: false, error: 'too many images', message: `אפשר לשלוח עד ${MAX_SCREENSHOTS} צילומי מסך בבקשה אחת.` });
        return;
      }
      // Every frame is checked before the call, and one bad frame fails the request rather than
      // being silently dropped: a component generated from 2 of the 3 screenshots the operator
      // uploaded looks like a model failure, not like the upload problem it actually is.
      const checked = images.map((img: unknown) => validateScreenshotImage(img));
      const bad = checked.findIndex((c) => !c.ok);
      if (bad >= 0) {
        const reason = (checked[bad] as { ok: false; reason: string }).reason;
        res.status(400).json({ ok: false, error: `image ${bad + 1}: ${reason}`, message: `תמונה ${bad + 1} נדחתה: ${reason}` });
        return;
      }
      const result = await generateComponentFromScreenshot({
        images: checked.map((c) => (c as { ok: true; image: { mimeType: string; data: string } }).image),
        instructions: typeof instructions === 'string' ? instructions : undefined,
        componentName: typeof componentName === 'string' ? componentName : undefined,
        variant: variant === 'jsx' ? 'jsx' : 'tsx',
      });
      // Deliberately NOT run through sanitizeOutput(): that guard exists for Hebrew copy about to
      // be published to a social account, and its prompt-injection and unverified-claim patterns
      // fire on ordinary source code (a numeric literal reads as an unverified stat). Nothing here
      // is published anywhere — the operator copies the file into their own editor.
      res.status(200).json({ ok: true, ...result });
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

    if (failure.retryAfterSeconds) res.setHeader('Retry-After', String(failure.retryAfterSeconds));

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
      ...(failure.retryAfterSeconds ? { retryAfterSeconds: failure.retryAfterSeconds } : {}),
      detail,
    });
  }
}
