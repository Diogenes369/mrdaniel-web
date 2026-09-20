import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Newspaper,
  RefreshCw,
  Loader2,
  Copy,
  Check,
  Download,
  Linkedin,
  Instagram,
  ExternalLink,
  ImageIcon,
  AlertTriangle,
  Sparkles,
  Film,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Send,
  Clapperboard,
  Mic2,
  Camera,
  Video,
  Play,
  Layers,
} from 'lucide-react';
import {
  CATEGORY_LABEL,
  PLATFORM_LABEL,
  type ImageAspect,
  type NewsCategory,
  type NewsItem,
  type SocialPlatform,
} from '../lib/newsAgentTypes';
import { fetchNewsList } from '../lib/newsFeedClient';
import { composeNewsPost, synthesizeNewsPost, citationDomain, type ComposedPost } from '../lib/newsPostComposer';
import { renderNewsImage, type BgSource } from '../lib/newsImageComposer';
import { renderStoryForItem, rerenderDeck, type SlideFormat } from '../lib/instagramStoryRenderer';
import { applySlideEdits, canInsertContentSlide, insertContentSlide, type StoryPayload } from '../lib/storySlides';
import SlideEditorChat from './SlideEditorChat';
import PreviewErrorBoundary from './PreviewErrorBoundary';
import QuickPublishBar from './QuickPublishBar';
import GrowthScorePanel from './GrowthScorePanel';
import { deckToGrowthContent, reelToGrowthContent } from '../lib/growthPlaybook';
import { deckToCaption } from '../lib/socialPublish';
import { loadDeck, saveDeckMeta, saveDeckImages, clearDeck } from '../lib/deckPersistence';
import { synthesizeReel, reelToText } from '../lib/reelScriptApi';
import type { ReelScript } from '../lib/agentTypes';
import { resolveReelBeats } from '../lib/reelRenderService';
import { renderReelVideo, isReelVideoSupported } from '../lib/reelVideoEncoder';

const SLIDE_FORMATS: { id: SlideFormat; label: string }[] = [
  { id: '9:16', label: '9:16 · סטורי' },
  { id: '4:5', label: '4:5 · קרוסלה' },
  { id: '1:1', label: '1:1 · ריבוע' },
];
const PREVIEW_DIMS: Record<SlideFormat, { w: number; h: number }> = {
  '9:16': { w: 288, h: 512 },
  '4:5': { w: 340, h: 425 },
  '1:1': { w: 380, h: 380 },
};
import { SITE_ORIGIN } from '../lib/useDashboardRefresh';
import CarouselStudioModal from './CarouselStudioModal';
import type { ArticleInput } from '../lib/carouselBridge';
import { getAdminSecret, reportAuthFailure } from '../lib/adminSecret';
import { resolveArticleText } from '../lib/articleText';


const CATEGORIES: NewsCategory[] = ['cyber', 'cloud', 'ai', 'ai_models', 'devops', 'all'];
const PLATFORM_ICON: Record<SocialPlatform, typeof Linkedin> = { linkedin: Linkedin, instagram: Instagram };

const TOPIC_LABEL: Record<string, string> = {
  ai: 'AI',
  ai_models: 'מודלי AI',
  cyber: 'סייבר',
  cloud: 'ענן / IT',
  devops: 'DevOps',
  general: 'גאדג׳טים / טק',
};

const RELATIVE_TIME_HE = new Intl.RelativeTimeFormat('he', { numeric: 'auto' });

/** "לפני 15 דקות" style relative label for anything under a week old; falls back to an absolute
 * Jerusalem-time date/time (the feed runs on UTC ISO timestamps, and the operator is in Israel). */
function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMin = Math.round((d.getTime() - Date.now()) / 60_000);
  if (Math.abs(diffMin) < 60) return RELATIVE_TIME_HE.format(diffMin, 'minute');
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return RELATIVE_TIME_HE.format(diffHr, 'hour');
  const diffDay = Math.round(diffHr / 24);
  if (Math.abs(diffDay) < 7) return RELATIVE_TIME_HE.format(diffDay, 'day');
  return d.toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NewsContentAgent() {
  const [category, setCategory] = useState<NewsCategory>('cyber');
  const [platform, setPlatform] = useState<SocialPlatform>('linkedin');
  const [aspect, setAspect] = useState<ImageAspect>('1:1');
  const [headline, setHeadline] = useState(true);

  const [item, setItem] = useState<NewsItem | null>(null);
  const [list, setList] = useState<NewsItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingNews, setLoadingNews] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);

  const [post, setPost] = useState<ComposedPost | null>(null);
  const [posting, setPosting] = useState(false);
  const postSeq = useRef(0);
  const [copied, setCopied] = useState(false);
  const [altCopied, setAltCopied] = useState(false);
  // Hermes carousel studio — opened with the selected article; null = closed.
  const [carouselArticle, setCarouselArticle] = useState<ArticleInput | null>(null);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<BgSource | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const renderSeq = useRef(0);

  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ ok: boolean; message?: string; status?: string; provider?: string } | null>(null);

  // Reel Generator — article-grounded reel script (hook + scenes + CTA), independent of the
  // post/story workspaces above. Not persisted (cheap to regenerate; the Story deck is the one
  // that needs persistence since it also renders images).
  const [showReelPanel, setShowReelPanel] = useState(false);
  const [reelScript, setReelScript] = useState<ReelScript | null>(null);
  const [reelItemId, setReelItemId] = useState<string | null>(null);
  const [reelLoading, setReelLoading] = useState(false);
  const [reelSynthesized, setReelSynthesized] = useState(false);
  const [reelFallbackReason, setReelFallbackReason] = useState<string | null>(null);
  const [reelCopied, setReelCopied] = useState(false);
  // Minted per generation so the Growth panel starts clean for a regenerated script but keeps its
  // state through hook swaps and added scenes (the reel has no persisted id of its own).
  const [reelStamp, setReelStamp] = useState(0);

  // Reel VIDEO render (Step B/C) — assembles the current reelScript into a real 9:16 MP4 in the
  // browser (Pexels stills + Ken-Burns + burned-in Hebrew captions + Gemini TTS voiceover, muxed
  // via WebCodecs). Independent of the script state above so re-generating the script doesn't
  // silently invalidate an already-rendered video the operator is looking at.
  const [videoRendering, setVideoRendering] = useState(false);
  const [videoStage, setVideoStage] = useState<'assets' | 'video' | 'audio' | 'mux' | null>(null);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoHasAudio, setVideoHasAudio] = useState(false);
  const videoSupported = useRef(isReelVideoSupported()).current;

  // Instagram Story / Carousel slides — generated on demand from the selected article,
  // independent of the post-platform toggle above. The generated deck is PERSISTED to
  // sessionStorage and restored here on mount: it must survive the 4-minute feed poll, an
  // `isGenerating` toggle, an error-boundary reset or a hot reload, and is only ever wiped by
  // the explicit "נקה / צור חדש" button (`handleClearDeck`).
  const [restored] = useState(() => loadDeck());
  const restoredPostText = useRef(restored?.meta.postText ?? '').current;
  const [storyPayload, setStoryPayload] = useState<StoryPayload | null>(restored?.meta.payload ?? null);
  const [storyImages, setStoryImages] = useState<string[]>(restored?.images ?? []);
  const [storyRendering, setStoryRendering] = useState(false);
  const [storyError, setStoryError] = useState<string | null>(null);
  const [storyActive, setStoryActive] = useState(restored?.meta.activeIndex ?? 0);
  const [slideFormat, setSlideFormat] = useState<SlideFormat>(restored?.meta.format ?? '9:16');
  const storySeq = useRef(0);
  // Growth-optimised carousel caption from the Growth panel ('' = none yet / panel unmounted).
  const [growthCaption, setGrowthCaption] = useState('');
  // A restored deck whose images didn't fit the storage quota needs a one-time re-render.
  const needsImageRestore = useRef(!!restored && restored.images.length === 0);

  const fetchNews = useCallback(
    async (opts: { autoSelectLatest?: boolean; background?: boolean } = {}) => {
      const { autoSelectLatest = false, background = false } = opts;
      if (!background) setLoadingNews(true);
      setNewsError(null);
      try {
        const items = await fetchNewsList(category);
        setList(items);
        if (items.length === 0) {
          // A background poll that comes back empty must NOT nuke the workspace / selection.
          if (!background) {
            setNewsError('לא נמצאו כתבות בקטגוריה הזו כרגע.');
            setItem(null);
          }
          return;
        }
        const stillSelected = !!item && items.some((i) => i.id === item.id);
        if (autoSelectLatest) {
          setItem(items[0]);
        } else if (stillSelected) {
          /* keep the operator's current selection exactly as-is */
        } else if (background) {
          /* the selected article rotated off the live feed — keep showing it anyway rather
             than yanking the workspace out from under an in-progress carousel */
        } else {
          // Foreground refresh / category switch with no valid selection — restore the last
          // pinned article across reloads, else fall back to the newest.
          let savedArticle: NewsItem | undefined;
          try {
            const savedId = window.sessionStorage.getItem('nca:articleId');
            if (savedId) savedArticle = items.find((i) => i.id === savedId);
          } catch {
            /* sessionStorage unavailable */
          }
          setItem(savedArticle ?? items[0]);
        }
      } catch {
        if (!background) {
          setNewsError('משיכת הפיד נכשלה — בדקו חיבור ל-mrdaniel.co.il/api/news.');
          setList([]);
          setItem(null);
        }
      } finally {
        if (!background) setLoadingNews(false);
      }
    },
    [category, item?.id]
  );

  // Persist the active article + slide index so a crash/remount/reload keeps the workspace.
  useEffect(() => {
    try {
      if (item?.id) window.sessionStorage.setItem('nca:articleId', item.id);
    } catch {
      /* ignore */
    }
  }, [item?.id]);

  // ─── Nothing is fetched until the operator asks ─────────────────────────────────────────────
  //
  // This used to do two things automatically: fetch on mount, and then re-poll `/api/news` every
  // 4 minutes for as long as the tab stayed open. An admin who left the dashboard open overnight
  // was firing ~360 unattended requests at the shared Vercel function per tab, none of which
  // anyone was reading. Both are gone.
  //
  // What replaces them: the operator presses "רענן" (already in the toolbar below) for the first
  // load. After that first explicit load, a CATEGORY SWITCH still refetches — the chips are a
  // direct user action and a picker that keeps showing the previous category's stories is simply
  // broken — but an untouched tab now makes no requests at all.
  const loadedOnce = useRef(false);
  useEffect(() => {
    if (!loadedOnce.current) return;
    void fetchNews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  /** The operator-initiated load. Marks the tab as "live" so later category switches refetch. */
  const loadNews = useCallback(
    (opts?: { autoSelectLatest?: boolean }) => {
      loadedOnce.current = true;
      return fetchNews(opts);
    },
    [fetchNews]
  );

  // ─── On-demand generation (token-saving) ────────────────────────────────────────────────────
  // Selecting / browsing a news item costs NOTHING — it only shows the article's own title,
  // summary and source. Post synthesis (Gemini) and the branded-image render fire ONLY when the
  // "צור פוסט ותמונה" button is pressed. Outputs are cached per (item + platform) for the post
  // and per (item + aspect + headline) for the image, so returning to an already-generated
  // combination — or pressing the button again — never re-hits the APIs.
  const postCache = useRef<Map<string, ComposedPost>>(new Map());
  const imageCache = useRef<Map<string, { url: string; source: BgSource }>>(new Map());
  const postKeyFor = (it: NewsItem, p: SocialPlatform) => `${it.id}::${p}`;
  const imgKeyFor = (it: NewsItem, a: ImageAspect, h: boolean) => `${it.id}::${a}::${h ? 'H' : 'x'}`;

  // Selection / param change → restore any cached output for that exact combo, else clear. No API.
  useEffect(() => {
    postSeq.current++;
    renderSeq.current++;
    setPosting(false);
    setRendering(false);
    setRenderError(null);
    if (!item) {
      setPost(null);
      setImageUrl(null);
      setImageSource(null);
      return;
    }
    const pc = postCache.current.get(postKeyFor(item, platform));
    setPost(pc ?? null);
    const ic = imageCache.current.get(imgKeyFor(item, aspect, headline));
    setImageUrl(ic?.url ?? null);
    setImageSource(ic?.source ?? null);
  }, [item, platform, aspect, headline]);

  const generateContent = useCallback(() => {
    if (!item) return;
    const it = item;

    // post — instant deterministic draft, then swap in the LLM synthesis (cached)
    const pKey = postKeyFor(it, platform);
    const pSeq = ++postSeq.current;
    const cachedPost = postCache.current.get(pKey);
    if (cachedPost) {
      setPost(cachedPost);
      setPosting(false);
    } else {
      setPost(composeNewsPost(it, platform));
      setPosting(true);
      void (async () => {
        try {
          const synth = await synthesizeNewsPost(it, platform, { apiBase: SITE_ORIGIN, adminSecret: getAdminSecret() });
          if (pSeq === postSeq.current) {
            setPost(synth);
            postCache.current.set(pKey, synth);
          }
        } catch (err) {
          // Keep the deterministic draft already on screen, but re-stamp it with WHY the AI path
          // was skipped. Swallowing the error here made an AI post and a base-template post look
          // identical apart from a grey "תבנית בסיס" label, so a stale admin secret or an exhausted
          // Gemini quota read as "the AI just wrote it this way".
          if (pSeq === postSeq.current) {
            const reason = (err as Error)?.message || 'סינתזת ה-AI לא זמינה';
            console.warn('[news-post] LLM synthesis unavailable, keeping base template:', reason);
            setPost(composeNewsPost(it, platform, reason));
          }
        } finally {
          if (pSeq === postSeq.current) setPosting(false);
        }
      })();
    }

    // branded image (cached)
    const iKey = imgKeyFor(it, aspect, headline);
    const rSeq = ++renderSeq.current;
    const cachedImg = imageCache.current.get(iKey);
    if (cachedImg) {
      setImageUrl(cachedImg.url);
      setImageSource(cachedImg.source);
      setRendering(false);
      setRenderError(null);
    } else {
      setRendering(true);
      setRenderError(null);
      renderNewsImage(it, { aspect, headline })
        .then(({ dataUrl, imageSource: src }) => {
          if (rSeq === renderSeq.current) {
            setImageUrl(dataUrl);
            setImageSource(src);
            imageCache.current.set(iKey, { url: dataUrl, source: src });
          }
        })
        .catch(() => {
          if (rSeq === renderSeq.current) setRenderError('רינדור התמונה נכשל.');
        })
        .finally(() => {
          if (rSeq === renderSeq.current) setRendering(false);
        });
    }
  }, [item, platform, aspect, headline]);

  const publishToSocial = useCallback(async () => {
    if (!post || !item) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await fetch(`${SITE_ORIGIN}/api/agent-generate`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(getAdminSecret() ? { 'x-admin-secret': getAdminSecret() } : {}),
        },
        body: JSON.stringify({
          action: 'publish-social',
          platform,
          caption: post.fullText,
          hashtags: post.hashtags ?? [],
          mediaUrls: imageUrl ? [imageUrl] : [],
          publishId: `${item.id}::${platform}::${Date.now()}`,
          sourceTitle: item.title,
          sourceLink: item.link,
          category: item.category,
        }),
      });
      if (res.status === 401) reportAuthFailure('agent-generate');
      const json = (await res.json()) as { ok?: boolean; message?: string; status?: string; provider?: string };
      setPublishResult({ ok: Boolean(json?.ok), message: json?.message ?? (json?.ok ? 'נשלח לפרסום / תזמון' : 'השליחה נכשלה'), status: json?.status, provider: json?.provider });
    } catch {
      setPublishResult({ ok: false, message: 'שגיאת רשת בפרסום' });
    } finally {
      setPublishing(false);
    }
  }, [post, item, platform, imageUrl]);

  const generateReel = useCallback(async () => {
    if (!item) return;
    setReelLoading(true);
    try {
      const { reel, synthesized, fallbackReason } = await synthesizeReel(item);
      setReelScript(reel);
      setReelItemId(item.id);
      setReelStamp(Date.now());
      setReelSynthesized(synthesized);
      setReelFallbackReason(fallbackReason ?? null);
    } finally {
      setReelLoading(false);
    }
  }, [item]);

  const copyReel = useCallback(async () => {
    if (!reelScript) return;
    try {
      await navigator.clipboard.writeText(reelToText(reelScript, item?.title));
      setReelCopied(true);
      window.setTimeout(() => setReelCopied(false), 2000);
    } catch {
      /* clipboard blocked — text is still visible for manual copy */
    }
  }, [reelScript, item?.title]);

  const downloadReel = useCallback(() => {
    if (!reelScript) return;
    const slug = (item?.title || 'reel').replace(/[^\w֐-׿]+/g, '-').slice(0, 40) || 'reel';
    const blob = new Blob([reelToText(reelScript, item?.title)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mrdaniel-reel-${slug}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [reelScript, item?.title]);

  const generateReelVideo = useCallback(async () => {
    if (!reelScript || !videoSupported) return;
    setVideoRendering(true);
    setVideoError(null);
    setVideoProgress(0);
    setVideoStage('assets');
    try {
      const beats = await resolveReelBeats(reelScript, (fraction) => setVideoProgress(Math.round(fraction * 35)));
      const { blob, hasAudio } = await renderReelVideo(beats, (pct, stage) => {
        setVideoStage(stage);
        setVideoProgress(35 + Math.round(pct * 0.65));
      });
      setVideoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setVideoBlob(blob);
      setVideoHasAudio(hasAudio);
      setVideoProgress(100);
    } catch (err) {
      setVideoError((err as Error).message || 'רינדור הסרטון נכשל');
    } finally {
      setVideoRendering(false);
      setVideoStage(null);
    }
  }, [reelScript, videoSupported]);

  const downloadReelVideo = useCallback(() => {
    if (!videoBlob) return;
    const slug = (item?.title || 'reel').replace(/[^\w֐-׿]+/g, '-').slice(0, 40) || 'reel';
    const url = URL.createObjectURL(videoBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mrdaniel-reel-${slug}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [videoBlob, item?.title]);

  // Release the video object URL on unmount / when a fresh render replaces it — object URLs
  // otherwise leak for the life of the tab.
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  // A fresh script invalidates any video rendered from the PREVIOUS script — clear the stale
  // preview rather than let it silently keep showing next to a different script/scenes.
  useEffect(() => {
    setVideoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setVideoBlob(null);
    setVideoError(null);
    setVideoProgress(0);
  }, [reelScript]);

  // NOTE: a generated deck is deliberately NOT auto-cleared when the selected article changes.
  // Wiping it on any `item` change (including the silent swaps a background feed poll can cause)
  // is exactly the "carousel got purged" bug. The deck persists until the operator presses
  // "רענון שקפים" (rebuilds it from the current article) or "נקה / צור חדש" (`handleClearDeck`).
  // A small hint below flags when the visible deck belongs to a different article than the one
  // now selected.

  // One-time image restore: a deck came back from sessionStorage but its rendered PNGs were too
  // large to persist — re-render them from the saved payload so the carousel is fully visible.
  useEffect(() => {
    if (!needsImageRestore.current || !storyPayload) return;
    needsImageRestore.current = false;
    const seq = ++storySeq.current;
    setStoryRendering(true);
    void (async () => {
      try {
        const deck = await rerenderDeck(storyPayload, slideFormat);
        if (seq === storySeq.current) {
          setStoryPayload(deck.payload);
          setStoryImages(deck.images);
        }
      } catch {
        if (seq === storySeq.current) setStoryError('שחזור התצוגה נכשל — לחצו "רענון שקפים".');
      } finally {
        if (seq === storySeq.current) setStoryRendering(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the deck on every change so a background event / remount can restore it. Split in two:
  // the lightweight meta writes on every nav, the heavy PNG blob only when the images actually change.
  useEffect(() => {
    if (!storyPayload) return;
    saveDeckMeta({
      payload: storyPayload,
      postText: (post?.fullText || restoredPostText || deckToCaption(storyPayload)).trim(),
      articleId: storyPayload.newsId || item?.id || '',
      format: slideFormat,
      activeIndex: storyActive,
      savedAt: Date.now(),
    });
  }, [storyPayload, storyActive, slideFormat, post?.fullText, item?.id]);

  useEffect(() => {
    if (!storyPayload || storyImages.length === 0) return;
    saveDeckImages(storyPayload.newsId || item?.id || '', slideFormat, storyImages);
  }, [storyImages, storyPayload, slideFormat, item?.id]);

  // Explicit, operator-only reset — the ONLY path that clears the generated deck.
  const handleClearDeck = useCallback(() => {
    storySeq.current++;
    needsImageRestore.current = false;
    setStoryPayload(null);
    setStoryImages([]);
    setStoryError(null);
    setStoryActive(0);
    clearDeck();
  }, []);

  // (Branded-image rendering moved into `generateContent` above — no longer auto-runs on select.)

  const copyAlt = async () => {
    if (!post?.altText) return;
    try {
      await navigator.clipboard.writeText(post.altText);
      setAltCopied(true);
      window.setTimeout(() => setAltCopied(false), 2000);
    } catch {
      /* clipboard blocked — the text is visible for manual copy */
    }
  };

  const copyText = async () => {
    if (!post) return;
    try {
      await navigator.clipboard.writeText(post.fullText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the text is visible for manual copy */
    }
  };

  const downloadImage = () => {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    const slug = (item?.slug || 'news-post').slice(0, 40);
    a.download = `mrdaniel-${slug}-${aspect.replace(':', 'x')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Build + render the full branded story/carousel set for the selected article. Maps the
  // headline, category (kicker) and synthesised narrative through the shared story engine, and
  // stamps the same clean bare-domain source attribution the post text uses. Falls back to the
  // deterministic article-grounded builder inside renderStoryForItem when the AI call is down.
  const generateStorySlides = useCallback(
    async (format: SlideFormat) => {
      if (!item) return;
      const seq = ++storySeq.current;
      setStoryRendering(true);
      setStoryError(null);
      setStoryActive(0);
      try {
        const { payload, images } = await renderStoryForItem({ ...item, source: citationDomain(item) }, format);
        if (seq === storySeq.current) {
          setStoryPayload(payload);
          setStoryImages(images);
        }
      } catch {
        if (seq === storySeq.current) setStoryError('רינדור שקפי הסטורי נכשל — נסו שוב.');
      } finally {
        if (seq === storySeq.current) setStoryRendering(false);
      }
    },
    [item]
  );

  // Re-render the deck when the aspect ratio changes, but only if one was already generated.
  useEffect(() => {
    if (storyPayload && !storyRendering) void generateStorySlides(slideFormat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideFormat]);

  // AI Slide Editor chat → apply an edited deck and live re-render on the same background.
  const applyStoryEdit = useCallback(
    async (edited: StoryPayload) => {
      const seq = ++storySeq.current;
      setStoryRendering(true);
      setStoryError(null);
      try {
        const deck = await rerenderDeck(edited, slideFormat);
        if (seq === storySeq.current) {
          setStoryPayload(deck.payload);
          setStoryImages(deck.images);
        }
      } catch {
        if (seq === storySeq.current) setStoryError('הרינדור מחדש נכשל — נסו שוב.');
      } finally {
        if (seq === storySeq.current) setStoryRendering(false);
      }
    },
    [slideFormat]
  );

  // ─── Organic Growth panel adapters ─────────────────────────────────────────────────────────
  // The carousel's base caption: the synthesised post when there is one, else the deck's own copy.
  const deckCaption = storyPayload ? (post?.fullText || restoredPostText || deckToCaption(storyPayload)).trim() : '';
  const deckGrowthContent = useMemo(() => (storyPayload ? deckToGrowthContent(storyPayload, deckCaption) : null), [storyPayload, deckCaption]);
  const reelGrowthContent = useMemo(
    () =>
      reelScript
        ? reelToGrowthContent(reelScript, { key: `${reelItemId ?? 'reel'}:${reelStamp}`, title: item?.title ?? '', topic: item?.topic ?? 'general' })
        : null,
    [reelScript, reelItemId, reelStamp, item?.title, item?.topic]
  );

  // Growth panel → put a hook on the cover and re-render on the same background.
  const applyCoverHook = useCallback(
    (line: string) => {
      if (!storyPayload) return;
      const n = storyPayload.slides.findIndex((s) => s.kind === 'cover') + 1;
      if (n > 0) return applyStoryEdit(applySlideEdits(storyPayload, [{ n, kind: 'cover', text: line }]));
    },
    [storyPayload, applyStoryEdit]
  );
  const addCheatSheetSlide = useCallback(
    (text: string) => (storyPayload ? applyStoryEdit(insertContentSlide(storyPayload, text)) : undefined),
    [storyPayload, applyStoryEdit]
  );
  const applyReelHook = useCallback((line: string) => setReelScript((r) => (r ? { ...r, hook: line } : r)), []);
  // The recap scene goes in before the closing scene, which the reel prompt writes to loop back to
  // the hook. 7 scenes is the ceiling synthesizeReelScript itself enforces.
  const addReelRecapScene = useCallback(
    (text: string, label: string) =>
      setReelScript((r) => {
        if (!r || r.scenes.length >= 7) return r;
        const scenes = [...r.scenes];
        scenes.splice(Math.max(1, scenes.length - 1), 0, {
          onScreenText: label,
          voiceover: text,
          mediaPrompt: 'IT professional reviewing a checklist on a tablet at a modern workstation, natural light, shallow depth of field, 35mm, photorealistic, 8k',
        });
        return { ...r, scenes };
      }),
    []
  );

  const downloadAllStorySlides = async () => {
    if (!storyImages.length) return;
    const slug = (item?.slug || 'story').slice(0, 40);
    for (let i = 0; i < storyImages.length; i++) {
      const a = document.createElement('a');
      a.href = storyImages[i];
      a.download = `mrdaniel-story-${slug}-${i + 1}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // small stagger so the browser doesn't drop the rapid-fire downloads
      await new Promise((r) => setTimeout(r, 350));
    }
  };

  return (
    <div className="space-y-5">
      {/* Action bar — category selector + fetch */}
      <div className="dash-card p-6">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
          <Newspaper className="w-3.5 h-3.5" />
          משיכת חדשות אחרונות מהפיד החי
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-4 py-2 rounded-full text-sm font-bold cursor-pointer transition-colors ${
                category === c ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/10'
              }`}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => loadNews()}
            disabled={loadingNews}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-zinc-200 text-sm font-bold cursor-pointer disabled:opacity-50 hover:bg-white/10"
          >
            {loadingNews ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {list.length ? 'רענון רשימת הכתבות' : 'טען את רשימת הכתבות'}
          </button>
          <button
            onClick={() => loadNews({ autoSelectLatest: true })}
            disabled={loadingNews}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 text-black text-sm font-bold cursor-pointer disabled:opacity-50"
          >
            בחר את הכתבה האחרונה
          </button>
        </div>

        {newsError && (
          <p className="mt-3 text-xs text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> {newsError}
          </p>
        )}

        {/* Manual content picker — every candidate article; click to select, "תצוגה" to preview raw text. */}
        {list.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono mb-2">
              <span>{list.length} כתבות · {CATEGORY_LABEL[category]}</span>
              <span>לחצו על כתבה כדי לבחור אותה למחולל</span>
            </div>
            <div className="max-h-[340px] overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
              {list.map((n) => {
                const selected = n.id === item?.id;
                return (
                  <div key={n.id} className={selected ? 'bg-brand-500/10' : 'hover:bg-white/[0.03]'}>
                    <button
                      onClick={() => setItem(n)}
                      className="w-full text-right px-3 py-2.5 cursor-pointer flex flex-col gap-1"
                    >
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono">
                        <span className={`px-1.5 py-0.5 rounded ${selected ? 'bg-brand-500 text-black' : 'bg-white/5 text-brand-300'}`}>
                          {TOPIC_LABEL[n.topic] ?? n.topic}
                        </span>
                        <span>{n.source}</span>
                        <span>·</span>
                        <span>{timeLabel(n.publishedAt)}</span>
                        {n.image && <span className="text-brand-400/70">· תמונה ✓</span>}
                      </div>
                      <span className={`text-[13px] font-bold leading-snug ${selected ? 'text-white' : 'text-zinc-200'}`}>
                        {n.title}
                      </span>
                    </button>
                    <div className="px-3 pb-2 -mt-0.5 flex items-center gap-3">
                      <button
                        onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
                        className="text-[10px] text-sky-400 hover:text-sky-300 cursor-pointer"
                      >
                        {expandedId === n.id ? 'הסתר תצוגה' : 'תצוגת טקסט גולמי'}
                      </button>
                      <a
                        href={n.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300"
                      >
                        <ExternalLink className="w-3 h-3" /> מקור
                      </a>
                    </div>
                    {expandedId === n.id && (
                      <p className="px-3 pb-3 text-[11px] text-zinc-400 leading-relaxed whitespace-pre-wrap">
                        {n.summary || n.excerpt || '(אין טקסט מלא בפיד לכתבה זו)'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {item && (
          <div className="mt-4 p-3 rounded-lg bg-black/30 border border-brand-500/20">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 font-mono mb-1">
              <span className="text-brand-400 font-bold">נבחר למחולל:</span>
              <span>{item.source}</span>
              <span>·</span>
              <span>{TOPIC_LABEL[item.topic] ?? item.topic}</span>
              <span>·</span>
              {imageSource === 'original' ? (
                <span className="text-brand-400">תמונת המקור מהכתבה ✓</span>
              ) : imageSource === 'stock' ? (
                <span className="text-amber-400/90">תמונת סטוק (לא נמצאה תמונת מקור)</span>
              ) : imageSource === 'none' ? (
                <span className="text-zinc-500">רקע גרפי בלבד</span>
              ) : item.image ? (
                <span className="text-brand-400/70">תמונת מקור זמינה</span>
              ) : (
                <span className="text-zinc-500">אין תמונה בפיד</span>
              )}
            </div>
            <p className="text-sm text-zinc-200 font-bold leading-snug">{item.title}</p>
          </div>
        )}
      </div>

      {item && (
        <>
          {/* Shared controls */}
          <div className="dash-card p-6 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-zinc-500 uppercase">פלטפורמה</span>
              {(['linkedin', 'instagram'] as SocialPlatform[]).map((p) => {
                const Icon = PLATFORM_ICON[p];
                return (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                      platform === p ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {PLATFORM_LABEL[p]}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-zinc-500 uppercase">יחס תמונה</span>
              {(['1:1', '4:5'] as ImageAspect[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setAspect(a)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer font-mono ${
                    aspect === a ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
              <input type="checkbox" checked={headline} onChange={(e) => setHeadline(e.target.checked)} className="accent-brand-500 w-4 h-4" />
              כותרת על התמונה
            </label>

            {/* Explicit, on-demand generation — the ONLY thing that fires Gemini / the image API.
                Selecting a news item above does nothing but show its title/summary/source. */}
            <button
              onClick={generateContent}
              disabled={posting || rendering}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 text-black text-sm font-bold cursor-pointer disabled:opacity-50"
            >
              {posting || rendering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {post || imageUrl ? 'רענון תוכן' : 'צור פוסט ותמונה'}
            </button>
            {/* Hermes decides concept + palette + composition on its own from the article; the
                whole run happens on the local carousel-bridge (Hermes and Pillow are local-only). */}
            <button
              onClick={() => {
                if (!item) return;
                const it = item;
                // Resolve the full article body first — handing Hermes the RSS teaser produced
                // slides built from one sentence. resolveArticleText caches and never throws.
                void resolveArticleText(it).then(({ text }) =>
                  setCarouselArticle({
                    title: it.title,
                    source: it.source,
                    topic: it.topic,
                    link: it.link,
                    articleText: text,
                  })
                );
              }}
              disabled={!item}
              title="Hermes בוחר קונספט ויזואלי ומייצר שקופיות נקיות, ואז מרונדרת עליהן עברית"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-brand-500/40 text-brand-300 text-sm font-bold cursor-pointer disabled:opacity-50 hover:bg-brand-500/10"
            >
              <Layers className="w-4 h-4" />
              צור קרוסלה ויזואלית
            </button>
            <button
              onClick={publishToSocial}
              disabled={publishing || !post || !item}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-zinc-200 text-sm font-bold cursor-pointer disabled:opacity-50 hover:bg-white/10"
            >
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              פרסם / שלח לפרסום
            </button>
            <button
              onClick={() => setShowReelPanel((v) => !v)}
              disabled={!item}
              title="מציג/מסתיר את מחולל תסריטי הרילס"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold cursor-pointer disabled:opacity-50 ${
                showReelPanel ? 'bg-brand-500 text-black' : 'bg-white/5 border border-white/10 text-zinc-200 hover:bg-white/10'
              }`}
            >
              <Clapperboard className="w-4 h-4" />
              תסריט לרילס
            </button>
          </div>

          {/* Side-by-side workspaces */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Copy workspace */}
            <div className="dash-card p-6 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
                  <Newspaper className="w-3.5 h-3.5" /> טקסט מוכן לפרסום
                  {posting ? (
                    <span className="flex items-center gap-1 text-[10px] text-zinc-500 normal-case tracking-normal">
                      <Loader2 className="w-3 h-3 animate-spin" /> מנסח…
                    </span>
                  ) : post?.synthesized ? (
                    <span className="flex items-center gap-1 text-[10px] text-brand-400 normal-case tracking-normal">
                      <Sparkles className="w-3 h-3" /> ניסוח AI מותאם
                    </span>
                  ) : post ? (
                    <span
                      className={`text-[10px] normal-case tracking-normal ${
                        post.fallbackReason ? 'text-amber-400/80' : 'text-zinc-500'
                      }`}
                      title={post.fallbackReason}
                    >
                      תבנית בסיס{post.fallbackReason ? ` — ${post.fallbackReason}` : ''}
                    </span>
                  ) : null}
                </span>
                <button
                  onClick={copyText}
                  disabled={!post}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'הועתק ✓' : 'העתק טקסט'}
                </button>
              </div>
              {post ? (
                <textarea
                  readOnly
                  value={post.fullText}
                  dir="rtl"
                  rows={24}
                  className="w-full flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 leading-relaxed resize-y min-h-[420px]"
                />
              ) : (
                <div className="w-full flex-1 grid place-items-center bg-black/40 border border-dashed border-white/10 rounded-lg px-6 text-center min-h-[420px]">
                  <p className="text-xs text-zinc-500 leading-relaxed max-w-sm">
                    הכתבה נבחרה. לחצו <span className="text-brand-400 font-bold">"צור פוסט ותמונה"</span> למעלה כדי לנסח פוסט
                    ולרנדר תמונה ממותגת — גלישה בין כתבות לא מפעילה שום קריאת AI ולא מבזבזת טוקנים.
                  </p>
                </div>
              )}
              {post && (
                <div className="mt-3">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {post.hashtags.map((tag) => (
                      <span key={tag} className="text-[11px] text-brand-400 font-mono bg-brand-500/10 border border-brand-500/20 rounded px-1.5 py-0.5">
                        {tag}
                      </span>
                    ))}
                  </div>
                  {post.altText && (
                    <div className="mb-2 rounded-lg border border-sky-400/25 bg-sky-500/[0.06] p-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-sky-300">
                          ALT · תיאור תמונה לנגישות ו-SEO
                        </span>
                        <button
                          onClick={copyAlt}
                          className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-sky-300 hover:bg-sky-500/15"
                        >
                          {altCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {altCopied ? 'הועתק ✓' : 'העתק'}
                        </button>
                      </div>
                      <p dir="rtl" className="text-[11px] leading-relaxed text-zinc-300">
                        {post.altText}
                      </p>
                    </div>
                  )}
                  <p className="text-[11px] text-zinc-500 bg-black/30 border border-brand-500/20 rounded-lg p-2 leading-relaxed">
                    <span className="text-brand-400 font-bold">קריאה לפעולה (קבועה): </span>
                    {post.footer}
                  </p>
                  <QuickPublishBar text={post.fullText} image={imageUrl ?? undefined} className="mt-3" />
                  {publishResult && (
                    <p className={`mt-2 text-[11px] ${publishResult.ok ? 'text-brand-400' : 'text-amber-400'}`}>
                      {publishResult.message} {publishResult.status ? `· ${publishResult.status}` : ''} {publishResult.provider ? `· ${publishResult.provider}` : ''}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Image workspace */}
            <div className="dash-card p-6 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
                  <ImageIcon className="w-3.5 h-3.5" /> תמונה ממותגת
                </span>
                <button
                  onClick={downloadImage}
                  disabled={!imageUrl || rendering}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" /> הורד תמונה (PNG)
                </button>
              </div>
              <div className="flex-1 flex items-center justify-center rounded-lg bg-black/40 border border-white/10 p-3 min-h-[280px]">
                {rendering ? (
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
                ) : renderError ? (
                  <p className="text-xs text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> {renderError}
                  </p>
                ) : imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="תצוגה מקדימה של התמונה הממותגת"
                    className="max-h-[520px] w-auto max-w-full rounded-md shadow-lg"
                  />
                ) : (
                  <p className="text-xs text-zinc-600 text-center px-4 leading-relaxed">
                    לחצו "צור פוסט ותמונה" כדי לרנדר את התמונה הממותגת
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Story / Carousel slides — PERSISTED. Deliberately mounted OUTSIDE the `{item && …}`
          gate so it stays alive through background feed polls, `storyRendering` toggles, an
          error-boundary reset, or `item` momentarily going null. Only "נקה / צור חדש" clears it. */}
      {(item || storyPayload) && (
          <PreviewErrorBoundary
            label="תצוגת הקרוסלה"
            resetKeys={[storyPayload?.createdAt, slideFormat, storyImages.length]}
            onReset={() => {
              // An error-boundary reset is crash-recovery, not a user action — but a deck that
              // crashed the renderer must not be restored on the next mount, so wipe storage too.
              handleClearDeck();
            }}
          >
          <div className="dash-card p-6">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
                <Film className="w-3.5 h-3.5" /> שקפים / קרוסלה מבוססת AI
                {storyRendering ? (
                  <span className="flex items-center gap-1 text-[10px] text-zinc-500 normal-case tracking-normal">
                    <Loader2 className="w-3 h-3 animate-spin" /> מרנדר…
                  </span>
                ) : storyPayload ? (
                  <span className="text-[10px] normal-case tracking-normal">
                    {storyPayload.synthesized ? (
                      <span className="text-brand-400">טקסט AI מהכתבה · {storyImages.length} שקופיות</span>
                    ) : (
                      <span className="text-amber-400/80">
                        גיבוי מקומי · {storyImages.length} שקופיות
                        {storyPayload.fallbackReason ? ` — ${storyPayload.fallbackReason}` : ''}
                      </span>
                    )}
                  </span>
                ) : null}
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1">
                  {SLIDE_FORMATS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setSlideFormat(f.id)}
                      disabled={storyRendering}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer font-mono disabled:opacity-50 ${
                        slideFormat === f.id ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => generateStorySlides(slideFormat)}
                  disabled={storyRendering || !item}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {storyRendering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5" />}
                  {storyPayload ? 'רענון שקפים' : 'צור שקפים / קרוסלה מבוססת AI'}
                </button>
                {storyPayload && (
                  <button
                    onClick={handleClearDeck}
                    disabled={storyRendering}
                    title="מוחק את הקרוסלה השמורה ומאפס — הפעולה היחידה שמנקה את התצוגה"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300 text-xs font-bold cursor-pointer disabled:opacity-50 hover:bg-white/10 hover:text-white"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> נקה / צור חדש
                  </button>
                )}
                {storyImages.length > 0 && (
                  <button
                    onClick={downloadAllStorySlides}
                    disabled={storyRendering}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-200 text-xs font-bold cursor-pointer disabled:opacity-50 hover:bg-white/10"
                  >
                    <Download className="w-3.5 h-3.5" /> הורד את כל השקופיות (PNG)
                  </button>
                )}
              </div>
            </div>

            {storyError && (
              <p className="text-xs text-amber-400 flex items-center gap-1.5 mb-3">
                <AlertTriangle className="w-3.5 h-3.5" /> {storyError}
              </p>
            )}

            {storyPayload && item && storyPayload.newsId && storyPayload.newsId !== item.id && (
              <p className="text-[11px] text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 mb-3 leading-relaxed">
                הקרוסלה שמוצגת נוצרה מכתבה אחרת ({storyPayload.newsTitle}). היא נשמרת כמו שהיא — לחצו
                "רענון שקפים" כדי לבנות אותה מהכתבה הנבחרת עכשיו, או "נקה / צור חדש" כדי להתחיל מאפס.
              </p>
            )}

            {storyPayload && storyImages.length > 0 ? (
              <>
                <div className="flex items-center gap-1.5 flex-wrap mb-4">
                  {(storyPayload.slides ?? []).map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setStoryActive(i)}
                      disabled={!storyImages[i]}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-40 ${
                        storyActive === i ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                      }`}
                    >
                      {i + 1}. {s?.kind === 'cover' ? 'שער' : s?.kind === 'cta' ? 'סיום' : s?.heading || `שקופית ${i + 1}`}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => setStoryActive((a) => Math.max(0, a - 1))}
                    disabled={storyActive === 0}
                    className="p-2 rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div
                    className="relative rounded-2xl overflow-hidden border border-white/10 bg-black"
                    style={{
                      width: (PREVIEW_DIMS[slideFormat] ?? PREVIEW_DIMS['9:16']).w,
                      height: (PREVIEW_DIMS[slideFormat] ?? PREVIEW_DIMS['9:16']).h,
                    }}
                  >
                    {storyImages[Math.min(storyActive, storyImages.length - 1)] ? (
                      <img
                        src={storyImages[Math.min(storyActive, storyImages.length - 1)]}
                        alt={`שקופית ${storyActive + 1}`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-zinc-700">
                        <Film className="w-6 h-6" />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setStoryActive((a) => Math.min(storyImages.length - 1, a + 1))}
                    disabled={storyActive >= storyImages.length - 1}
                    className="p-2 rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                </div>

                <p className="text-[11px] text-zinc-600 text-center mt-3">
                  {slideFormat} · {storyImages.length} שקופיות · שקופית {Math.min(storyActive, storyImages.length - 1) + 1} · שער → פסקאות תוכן → CTA (mrdaniel.co.il)
                </p>

                <QuickPublishBar
                  text={growthCaption || deckCaption}
                  image={storyImages[Math.min(storyActive, storyImages.length - 1)]}
                  label="פרסום מהיר · קרוסלה"
                  className="mt-3 justify-center"
                />

                {deckGrowthContent && (
                  <GrowthScorePanel
                    key={deckGrowthContent.contentKey}
                    content={deckGrowthContent}
                    busy={storyRendering}
                    onApplyHook={applyCoverHook}
                    onAddCheatSheet={addCheatSheetSlide}
                    canAddCheatSheet={canInsertContentSlide(storyPayload)}
                    onCaptionChange={setGrowthCaption}
                    className="mt-4"
                  />
                )}

                <div className="mt-4">
                  <SlideEditorChat
                    payload={storyPayload}
                    format={slideFormat}
                    busy={storyRendering}
                    onApply={applyStoryEdit}
                  />
                </div>
              </>
            ) : storyRendering ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
              </div>
            ) : (
              <p className="text-xs text-zinc-600 leading-relaxed">
                כפתור אחד יפרק את הכתבה הנבחרת ל-4–5 שקופיות ממותגות (שער → 2–3 שקופיות תוכן/עובדות → CTA עם הכתובת mrdaniel.co.il) — עם אותו טקסט מסונתז וייחוס מקור נקי כמו הפוסט, בלי בולטים, עם יישור כותרות אוטומטי ובידוד כיווניות לדומיין. בחרו יחס: 9:16 לסטורי/ריל, או 4:5 / 1:1 לקרוסלה בלינקדאין/אינסטגרם.
              </p>
            )}
          </div>
          </PreviewErrorBoundary>
      )}

      {/* Reel Generator — article-grounded hook/scenes/CTA script, toggled independently of the
          post + story workspaces above. Not persisted: cheap to regenerate on demand. */}
      {showReelPanel && item && (
        <PreviewErrorBoundary label="תסריט הרילס" resetKeys={[reelItemId, reelScript?.hook]}>
          <div className="dash-card p-6">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
                <Clapperboard className="w-3.5 h-3.5" /> תסריט לרילס
                {reelLoading ? (
                  <span className="flex items-center gap-1 text-[10px] text-zinc-500 normal-case tracking-normal">
                    <Loader2 className="w-3 h-3 animate-spin" /> כותב תסריט…
                  </span>
                ) : reelScript ? (
                  <span className="text-[10px] normal-case tracking-normal">
                    {reelSynthesized ? (
                      <span className="text-brand-400">טקסט AI מהכתבה · {reelScript.scenes.length} סצנות</span>
                    ) : (
                      <span className="text-amber-400/80">
                        גיבוי מקומי · {reelScript.scenes.length} סצנות{reelFallbackReason ? ` — ${reelFallbackReason}` : ''}
                      </span>
                    )}
                  </span>
                ) : null}
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={generateReel}
                  disabled={reelLoading || !item}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {reelLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clapperboard className="w-3.5 h-3.5" />}
                  {reelScript ? 'רענון תסריט' : 'צור תסריט לרילס'}
                </button>
                {reelScript && (
                  <>
                    <button
                      onClick={copyReel}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-200 text-xs font-bold cursor-pointer hover:bg-white/10"
                    >
                      {reelCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {reelCopied ? 'הועתק ✓' : 'העתק תסריט'}
                    </button>
                    <button
                      onClick={downloadReel}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-200 text-xs font-bold cursor-pointer hover:bg-white/10"
                    >
                      <Download className="w-3.5 h-3.5" /> הורדה (TXT)
                    </button>
                    {videoSupported ? (
                      <button
                        onClick={generateReelVideo}
                        disabled={videoRendering}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-200 text-xs font-bold cursor-pointer disabled:opacity-50 hover:bg-white/10"
                        title="בונה סרטון MP4 אמיתי מהתסריט: תמונות Pexels + קריינות AI + כתוביות עבריות צרובות"
                      >
                        {videoRendering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
                        {videoBlob ? 'רענון סרטון' : 'הפק סרטון'}
                      </button>
                    ) : (
                      <span className="text-[11px] text-zinc-600" title="דורש WebCodecs — Chrome/Edge עדכני">
                        הפקת וידאו אינה נתמכת בדפדפן זה
                      </span>
                    )}
                    {videoBlob && (
                      <button
                        onClick={downloadReelVideo}
                        disabled={videoRendering}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" /> הורד סרטון מוכן (MP4)
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {reelScript && item && reelItemId && reelItemId !== item.id && (
              <p className="text-[11px] text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 mb-3 leading-relaxed">
                התסריט שמוצג נוצר מכתבה אחרת. לחצו "רענון תסריט" כדי לבנות אותו מהכתבה הנבחרת עכשיו.
              </p>
            )}

            {reelScript ? (
              <div className="space-y-4">
                {/* Hook */}
                <div className="rounded-xl border border-brand-500/25 bg-brand-500/[0.06] px-4 py-3">
                  <span className="block text-[10px] font-mono uppercase tracking-wider text-brand-400 mb-1">
                    HOOK · 1–2 שניות ראשונות
                  </span>
                  <p className="text-sm md:text-base font-bold text-white leading-relaxed">{reelScript.hook}</p>
                </div>

                {/* Scenes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {reelScript.scenes.map((scene, i) => (
                    <div key={i} className="rounded-xl border border-white/10 bg-black/30 p-4 flex flex-col gap-2.5">
                      <span className="inline-flex items-center gap-1.5 w-fit rounded-full bg-white/5 border border-white/10 px-2.5 py-1 text-[10px] font-mono font-bold text-zinc-400">
                        סצנה {i + 1} / {reelScript.scenes.length}
                      </span>
                      <p className="text-sm font-bold text-zinc-100 leading-snug">{scene.onScreenText}</p>
                      <p className="flex items-start gap-1.5 text-xs text-zinc-300 leading-relaxed">
                        <Mic2 className="w-3.5 h-3.5 shrink-0 text-brand-400 mt-0.5" />
                        <span>{scene.voiceover}</span>
                      </p>
                      {scene.mediaPrompt && (
                        <p className="flex items-start gap-1.5 text-[11px] text-zinc-500 leading-relaxed font-mono" dir="ltr">
                          <Camera className="w-3.5 h-3.5 shrink-0 text-zinc-500 mt-0.5" />
                          <span className="text-right" dir="ltr">
                            {scene.mediaPrompt}
                          </span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">CTA</span>
                  <p className="text-sm text-zinc-200 leading-relaxed">{reelScript.cta}</p>
                </div>

                {/* Organic Growth — first-3-seconds hook options, recap scene, Comment-to-DM + SEO */}
                {reelGrowthContent && (
                  <GrowthScorePanel
                    key={reelGrowthContent.contentKey}
                    content={reelGrowthContent}
                    busy={videoRendering}
                    onApplyHook={applyReelHook}
                    onAddCheatSheet={addReelRecapScene}
                    canAddCheatSheet={reelScript.scenes.length < 7}
                  />
                )}

                {/* Video render — Step B/C: real MP4, encoded client-side (Pexels stills +
                    Ken-Burns + burned-in Hebrew captions + Gemini TTS, WebCodecs -> mp4-muxer). */}
                {(videoRendering || videoUrl || videoError) && (
                  <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-3">
                      <Clapperboard className="w-3.5 h-3.5" /> סרטון רילס (MP4)
                    </div>

                    {videoRendering && (
                      <div>
                        <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full bg-brand-500 transition-all duration-200"
                            style={{ width: `${videoProgress}%` }}
                          />
                        </div>
                        <p className="mt-2 text-[11px] text-zinc-500">
                          {videoStage === 'assets' && 'שולף תמונות מ-Pexels ומקליט קריינות…'}
                          {videoStage === 'video' && 'מרנדר פריימים…'}
                          {videoStage === 'audio' && 'ממזג פס קול…'}
                          {videoStage === 'mux' && 'סוגר קובץ MP4…'}
                          {!videoStage && 'מכין…'}
                          {' '}· {videoProgress}%
                        </p>
                      </div>
                    )}

                    {videoError && (
                      <p className="text-xs text-amber-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> {videoError}
                      </p>
                    )}

                    {videoUrl && !videoRendering && (
                      <div className="flex flex-col items-center gap-3">
                        <video
                          src={videoUrl}
                          controls
                          playsInline
                          className="rounded-lg border border-white/10 bg-black max-h-[480px]"
                          style={{ aspectRatio: '9 / 16' }}
                        />
                        <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                          <Play className="w-3.5 h-3.5" /> תצוגה מקדימה · {videoHasAudio ? 'עם קריינות AI' : 'ללא קריינות (לא זמינה כרגע) — כתוביות בלבד'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : reelLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
              </div>
            ) : (
              <p className="text-xs text-zinc-600 leading-relaxed">
                כפתור אחד יפרק את הכתבה הנבחרת לתסריט רילס קצר: hook פותח-גלילה, 3–6 סצנות (טקסט על המסך + קריינות + פרומפט ויזואלי לג'נרטור תמונה/וידאו), ו-CTA לאינסטגרם. ניתן להעתיק או להוריד את התסריט המלא כטקסט.
              </p>
            )}
          </div>
        </PreviewErrorBoundary>
      )}

      {!item && !storyPayload && !loadingNews && !newsError && (
        <div className="dash-card p-10 text-center text-zinc-500 text-sm">
          בחרו קטגוריה ולחצו "משוך חדשות אחרונות" — המערכת תיצור פוסט מלא (טקסט + תמונה ממותגת + חתימת אתר) מהכתבה העדכנית ביותר.
        </div>
      )}

      <CarouselStudioModal article={carouselArticle} onClose={() => setCarouselArticle(null)} />
    </div>
  );
}
