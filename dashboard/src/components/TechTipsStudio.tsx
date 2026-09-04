import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GraduationCap,
  Loader2,
  Sparkles,
  Download,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Code2,
  Film,
  Image as ImageIcon,
  Wand2,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import {
  TIP_PRESETS,
  fetchTipFeed,
  synthesizeTechTipDeck,
  tipDeckCaption,
  type TechTipDeck,
  type TipTopic,
} from '../lib/techTipsApi';
import { renderTipDeckImages, exportTipDeckZip, resolveTipBackgrounds } from '../lib/techTipRenderer';
import { renderTipDeckVideo, isMotionSupported } from '../lib/motionStudioService';
import PreviewErrorBoundary from './PreviewErrorBoundary';
import QuickPublishBar from './QuickPublishBar';

const KIND_LABEL: Record<string, string> = {
  cover: 'שער',
  concept: 'רעיון',
  code: 'קוד',
  step: 'שלב',
  tool: 'כלים',
  takeaway: 'סיכום',
  cta: 'CTA',
};

const PREVIEW_W = 340;
const PREVIEW_H = 425;

export default function TechTipsStudio() {
  const [feed, setFeed] = useState<TipTopic[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(TIP_PRESETS[0].id);
  const [customTopic, setCustomTopic] = useState('');
  const [notes, setNotes] = useState('');

  const [deck, setDeck] = useState<TechTipDeck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [images, setImages] = useState<string[]>([]);
  const [renderProgress, setRenderProgress] = useState<{ done: number; total: number } | null>(null);
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  const [useAiBg, setUseAiBg] = useState(false);
  const [bgProgress, setBgProgress] = useState<{ done: number; total: number } | null>(null);
  const [backgrounds, setBackgrounds] = useState<(HTMLImageElement | null)[]>([]);

  const [videoBusy, setVideoBusy] = useState(false);
  const [videoPct, setVideoPct] = useState(0);
  const [videoStage, setVideoStage] = useState<'video' | 'audio' | 'mux' | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [withMusic, setWithMusic] = useState(true);
  const motionSupported = useMemo(() => isMotionSupported(), []);

  const allTopics = useMemo(() => [...TIP_PRESETS, ...feed], [feed]);
  const selected = useMemo(() => allTopics.find((t) => t.id === selectedId), [allTopics, selectedId]);

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    try {
      setFeed(await fetchTipFeed(8));
    } finally {
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const resetOutputs = () => {
    setImages([]);
    setActive(0);
    setBackgrounds([]);
    setVideoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setVideoBlob(null);
    setVideoError(null);
    setVideoPct(0);
  };

  const generate = useCallback(async () => {
    const topic = customTopic.trim() || selected?.topic || '';
    if (topic.trim().length < 8) {
      setError('בחרו נושא מהרשימה או כתבו נושא משלכם (לפחות 8 תווים).');
      return;
    }
    setBusy(true);
    setError(null);
    resetOutputs();
    try {
      const d = await synthesizeTechTipDeck(topic, notes.trim() || undefined);
      setDeck(d);

      let bgs: (HTMLImageElement | null)[] = [];
      if (useAiBg) {
        setBgProgress({ done: 0, total: d.slides.length });
        bgs = await resolveTipBackgrounds(d, 1080, 1350, (done, total) => setBgProgress({ done, total }));
        setBackgrounds(bgs);
        setBgProgress(null);
      }

      setRenderProgress({ done: 0, total: d.slides.length });
      const imgs = await renderTipDeckImages(d, { backgrounds: bgs }, (done, total) => setRenderProgress({ done, total }));
      setImages(imgs);
    } catch (e) {
      setError((e as Error).message || 'יצירת הדק נכשלה.');
    } finally {
      setRenderProgress(null);
      setBgProgress(null);
      setBusy(false);
    }
  }, [customTopic, selected, notes, useAiBg]);

  const exportZip = useCallback(async () => {
    if (!deck || !images.length) return;
    await exportTipDeckZip(deck, images, tipDeckCaption(deck));
  }, [deck, images]);

  const makeVideo = useCallback(async () => {
    if (!deck || !motionSupported) return;
    setVideoBusy(true);
    setVideoError(null);
    setVideoPct(0);
    try {
      // The reel is 9:16, so backgrounds resolved for the 4:5 carousel are re-fetched at the
      // vertical aspect only when AI backdrops are on.
      let bgs = backgrounds;
      if (useAiBg) {
        setVideoStage(null);
        bgs = await resolveTipBackgrounds(deck, 1080, 1920);
      }
      const { blob } = await renderTipDeckVideo(deck, { backgrounds: bgs, music: withMusic }, (pct, stage) => {
        setVideoPct(pct);
        setVideoStage(stage);
      });
      setVideoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setVideoBlob(blob);
    } catch (e) {
      setVideoError((e as Error).message || 'רינדור הסרטון נכשל');
    } finally {
      setVideoBusy(false);
      setVideoStage(null);
    }
  }, [deck, motionSupported, backgrounds, useAiBg, withMusic]);

  const downloadVideo = useCallback(() => {
    if (!videoBlob || !deck) return;
    const slug = (deck.title || 'tips').replace(/[^\w֐-׿]+/g, '-').slice(0, 40) || 'tips';
    const url = URL.createObjectURL(videoBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mrdaniel-tips-${slug}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [videoBlob, deck]);

  const copyCaption = useCallback(async () => {
    if (!deck) return;
    try {
      await navigator.clipboard.writeText(tipDeckCaption(deck));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — caption is visible below */
    }
  }, [deck]);

  const activeSlide = deck?.slides[Math.min(active, deck.slides.length - 1)];

  return (
    <div className="space-y-5">
      {/* 1 · topic picker */}
      <div className="dash-card p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
            <GraduationCap className="w-3.5 h-3.5" /> בחירת נושא למדריך
          </span>
          <button
            onClick={loadFeed}
            disabled={feedLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300 text-xs font-bold cursor-pointer disabled:opacity-50 hover:bg-white/10"
          >
            {feedLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            רענן פיד טיפים
          </button>
        </div>

        <p className="text-[11px] text-zinc-500 mb-2">נושאים קבועים</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
          {TIP_PRESETS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setSelectedId(t.id);
                setCustomTopic('');
              }}
              className={`text-right px-3 py-2 rounded-lg border text-xs cursor-pointer ${
                selectedId === t.id && !customTopic
                  ? 'bg-brand-500 text-black border-brand-500 font-bold'
                  : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {feed.length > 0 && (
          <>
            <p className="text-[11px] text-zinc-500 mb-2">מהפיד החי (AI / ענן — מהזרם המסונן של האתר)</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {feed.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedId(t.id);
                    setCustomTopic('');
                  }}
                  className={`text-right px-3 py-1.5 rounded-lg border text-[11px] cursor-pointer max-w-full truncate ${
                    selectedId === t.id && !customTopic
                      ? 'bg-brand-500 text-black border-brand-500 font-bold'
                      : 'bg-white/5 text-zinc-400 border-white/10 hover:bg-white/10'
                  }`}
                  title={t.label}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}

        <input
          value={customTopic}
          onChange={(e) => setCustomTopic(e.target.value)}
          placeholder="…או כתבו נושא משלכם: 'איך לחבר Claude ל-CRM ב-30 שורות'"
          dir="rtl"
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 mb-2"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="הערות אופציונליות: זווית, קהל יעד, שפת קוד מועדפת…"
          dir="rtl"
          rows={2}
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 resize-y mb-3"
        />

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={generate}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 text-black text-sm font-bold cursor-pointer disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            צור מדריך (10–12 שקופיות)
          </button>
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input type="checkbox" checked={useAiBg} onChange={(e) => setUseAiBg(e.target.checked)} className="accent-brand-500 w-4 h-4" />
            <Wand2 className="w-3.5 h-3.5 text-brand-400" />
            רקעי AI (Pollinations · חינמי, מוסיף זמן)
          </label>
        </div>

        {bgProgress && (
          <p className="mt-3 text-[11px] text-sky-400/90">מייצר רקעי AI… {bgProgress.done}/{bgProgress.total}</p>
        )}
        {renderProgress && (
          <p className="mt-2 text-[11px] text-sky-400/90">מרנדר שקופיות… {renderProgress.done}/{renderProgress.total}</p>
        )}
        {error && (
          <p className="mt-3 text-xs text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </p>
        )}
      </div>

      {/* 2 · deck preview + exports */}
      {deck && (
        <PreviewErrorBoundary label="תצוגת המדריך" resetKeys={[deck.createdAt, images.length, active]} onReset={() => setActive(0)}>
          <div className="dash-card p-6">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
                <GraduationCap className="w-3.5 h-3.5" /> {deck.slides.length} שקופיות ·{' '}
                <span className={deck.synthesized ? 'text-brand-400 normal-case' : 'text-amber-400/80 normal-case'}>
                  {deck.synthesized ? 'טקסט AI' : `גיבוי מקומי${deck.fallbackReason ? ` — ${deck.fallbackReason}` : ''}`}
                </span>
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={copyCaption}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-200 text-xs font-bold cursor-pointer hover:bg-white/10"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'הועתק ✓' : 'העתק כיתוב'}
                </button>
                <button
                  onClick={exportZip}
                  disabled={!images.length || busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  <ImageIcon className="w-3.5 h-3.5" /> קרוסלה (ZIP · PNG)
                </button>
                {motionSupported ? (
                  <button
                    onClick={makeVideo}
                    disabled={videoBusy || busy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-200 text-xs font-bold cursor-pointer disabled:opacity-50 hover:bg-white/10"
                  >
                    {videoBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5" />}
                    {videoBlob ? 'רענון סרטון' : 'הפק ריל 9:16'}
                  </button>
                ) : (
                  <span className="text-[11px] text-zinc-600">הפקת וידאו לא נתמכת בדפדפן זה</span>
                )}
                {videoBlob && (
                  <button
                    onClick={downloadVideo}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> הורד ריל (MP4)
                  </button>
                )}
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer">
                  <input type="checkbox" checked={withMusic} onChange={(e) => setWithMusic(e.target.checked)} className="accent-brand-500 w-3.5 h-3.5" />
                  פס קול
                </label>
              </div>
            </div>

            {/* slide rail */}
            <div className="flex items-center gap-1.5 flex-wrap mb-4">
              {deck.slides.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                    active === i ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                  }`}
                >
                  {i + 1}. {KIND_LABEL[s.kind] ?? s.kind}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActive((a) => Math.max(0, a - 1))}
                  disabled={active === 0}
                  className="p-2 rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div
                  className="relative rounded-2xl overflow-hidden border border-white/10 bg-black shrink-0"
                  style={{ width: PREVIEW_W, height: PREVIEW_H }}
                >
                  {images[Math.min(active, images.length - 1)] ? (
                    <img src={images[Math.min(active, images.length - 1)]} alt={`שקופית ${active + 1}`} className="w-full h-full object-contain" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-700">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setActive((a) => Math.min(deck.slides.length - 1, a + 1))}
                  disabled={active >= deck.slides.length - 1}
                  className="p-2 rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>

              {/* active slide source */}
              {activeSlide && (
                <div className="min-w-0 space-y-3">
                  <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
                    <span className="text-brand-400 font-bold uppercase">{KIND_LABEL[activeSlide.kind] ?? activeSlide.kind}</span>
                    {activeSlide.stepNumber > 0 && <span>· שלב {activeSlide.stepNumber}</span>}
                    {activeSlide.codeLang && <span>· {activeSlide.codeLang}</span>}
                  </div>
                  <p className="text-base font-bold text-white leading-snug">{activeSlide.title}</p>
                  {activeSlide.body && <p className="text-sm text-zinc-300 leading-relaxed">{activeSlide.body}</p>}
                  {activeSlide.bullets.length > 0 && (
                    <ul className="space-y-1.5">
                      {activeSlide.bullets.map((bl, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                          <Check className="w-3.5 h-3.5 shrink-0 text-brand-400 mt-1" />
                          <span>{bl}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {activeSlide.code && (
                    <pre
                      dir="ltr"
                      className="text-[11px] leading-relaxed font-mono text-zinc-300 bg-black/50 border border-white/10 rounded-lg p-3 overflow-x-auto"
                    >
                      <code className="flex items-start gap-1.5">
                        <Code2 className="w-3.5 h-3.5 shrink-0 text-cyan-400 mt-0.5" />
                        <span>{activeSlide.code}</span>
                      </code>
                    </pre>
                  )}
                </div>
              )}
            </div>

            {/* motion output */}
            {(videoBusy || videoUrl || videoError) && (
              <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-3">
                  <Film className="w-3.5 h-3.5" /> ריל 9:16 (MP4)
                </div>
                {videoBusy && (
                  <>
                    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full bg-brand-500 transition-all duration-200" style={{ width: `${videoPct}%` }} />
                    </div>
                    <p className="mt-2 text-[11px] text-zinc-500">
                      {videoStage === 'video' && 'מרנדר פריימים…'}
                      {videoStage === 'audio' && 'ממזג פס קול…'}
                      {videoStage === 'mux' && 'סוגר קובץ MP4…'}
                      {!videoStage && 'מכין נכסים…'} · {videoPct}%
                    </p>
                  </>
                )}
                {videoError && (
                  <p className="text-xs text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> {videoError}
                  </p>
                )}
                {videoUrl && !videoBusy && (
                  <div className="flex flex-col items-center gap-2">
                    <video src={videoUrl} controls playsInline className="rounded-lg border border-white/10 bg-black max-h-[460px]" style={{ aspectRatio: '9 / 16' }} />
                    <p className="text-[11px] text-zinc-500">תצוגה מקדימה · {withMusic ? 'עם פס קול אמביינטי' : 'ללא פס קול'}</p>
                  </div>
                )}
              </div>
            )}

            <QuickPublishBar text={tipDeckCaption(deck)} image={images[Math.min(active, images.length - 1)]} label="פרסום מהיר · מדריך" className="mt-5 justify-center" />

            <details className="mt-4">
              <summary className="text-[11px] text-zinc-500 cursor-pointer font-mono">כיתוב + האשטגים</summary>
              <pre className="mt-2 text-[11px] text-zinc-300 bg-black/40 border border-white/10 rounded-lg p-3 whitespace-pre-wrap leading-relaxed" dir="rtl">
                {tipDeckCaption(deck)}
              </pre>
            </details>
          </div>
        </PreviewErrorBoundary>
      )}

      {!deck && !busy && (
        <div className="dash-card p-10 text-center text-zinc-500 text-sm leading-relaxed">
          בחרו נושא מהמדף או מהפיד החי — והסטודיו יפיק מדריך של 10–12 שקופיות בעברית עם קטעי קוד אמיתיים, שלבים וכלים,
          בעיצוב סייבר כהה. פלט כפול: קרוסלה (PNG · ZIP) לאינסטגרם, וריל 9:16 מונפש עם פס קול.
        </div>
      )}
    </div>
  );
}
