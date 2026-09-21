import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ImagePlus,
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
  Copy,
  Check,
  Trash2,
  X,
  GripVertical,
  Palette,
  Wand as WandSparkle,
} from 'lucide-react';
import {
  readCarouselFrames,
  synthesizeImageCarouselDeck,
  imageCarouselDeckCaption,
  MIN_FRAMES,
  MAX_FRAMES,
  type CarouselFrame,
  type ImageCarouselVisualPreset,
} from '../lib/imageCarouselApi';
import type { TechTipDeck } from '../lib/techTipsApi';
import { renderTipDeckImages, exportTipDeckZip, resolveTipBackgrounds, type TipStyle } from '../lib/techTipRenderer';
import { renderOverlayDeck } from '../lib/imageOverlayRenderer';
import { renderTipDeckVideo, isMotionSupported } from '../lib/motionStudioService';
import PreviewErrorBoundary from './PreviewErrorBoundary';
import QuickPublishBar from './QuickPublishBar';

const PRESET_OPTIONS: { id: ImageCarouselVisualPreset; label: string; hint: string }[] = [
  { id: 'auto-detect', label: 'זיהוי אוטומטי', hint: 'ה-AI בוחר את העיצוב המתאים ביותר לפי התמונות שהועלו' },
  { id: 'creator', label: 'עריכה במקום', hint: 'שומר על התמונה המקורית לגמרי — מוחק כל טקסט מודפס ומצייר את התרגום העברי באותו מקום בדיוק' },
  { id: 'cream-skill', label: 'קרם וטרקוטה', hint: 'כרטיס מיומנות בהיר: פקודה, תיאור קצר וקופסת התקנה כהה' },
  { id: 'cream-workflow', label: 'דיאגרמת תהליך', hint: 'כרטיס בהיר עם שרשרת צמתי אוטומציה מחוברים' },
  { id: 'cream-prompt-library', label: 'ספריית פרומפטים', hint: 'קורא כרטיסי פרומפט ממוספרים המודפסים ישירות על השקופיות' },
];

const PRESET_LABEL: Record<Exclude<ImageCarouselVisualPreset, 'auto-detect'>, string> = {
  creator: 'עריכה במקום',
  'cream-skill': 'קרם וטרקוטה',
  'cream-workflow': 'דיאגרמת תהליך',
  'cream-prompt-library': 'ספריית פרומפטים',
};

const KIND_LABEL: Record<string, string> = {
  cover: 'שער',
  concept: 'רעיון',
  code: 'קוד',
  step: 'שלב',
  tool: 'כלים',
  takeaway: 'סיכום',
  cta: 'CTA',
};

const THEME_LABEL: Record<string, string> = {
  ai: 'בינה מלאכותית',
  automation: 'אוטומציה',
  security: 'בטיחות AI',
  code: 'פיתוח וקוד',
  data: 'נתונים',
  web3: 'Web3',
  general: 'טכנולוגיה',
};

const PREVIEW_W = 340;
const PREVIEW_H = 425;

/**
 * Direct carousel image translator & rebrander.
 *
 * Replaces the old link-based Instagram importer: instead of fetching a public post, the operator
 * drags in the carousel's own slide images directly, in reading order. One server round-trip reads
 * and translates every frame's printed text via Gemini vision (`imageCarouselApi.ts` →
 * `src/server/agents/imageTranslatorAgent.ts`), and the deck it returns keeps a strict
 * one-slide-per-uploaded-frame mapping — the source's own image is reattached as each slide's
 * `sourceImage`, client-side.
 *
 * Two different renderers turn that into pixels, chosen by `resolvedPreset`:
 * - 'creator' ("עריכה במקום"): `imageOverlayRenderer.ts` erases every on-image text block Gemini
 *   located and paints the Hebrew translation back into the exact same spot, at the frame's own
 *   native resolution — every pixel of the original artwork survives untouched.
 * - every other preset (cream-skill / cream-workflow / cream-prompt-library): the shared
 *   `techTipRenderer.ts` TechTipDeck pipeline every other studio tab uses — a fresh templated card
 *   design, dimmed source image as texture, not an in-place edit.
 */
export default function ImageCarouselUploader() {
  const [frames, setFrames] = useState<CarouselFrame[]>([]);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [dragOverDrop, setDragOverDrop] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [notes, setNotes] = useState('');
  const [visualPreset, setVisualPreset] = useState<ImageCarouselVisualPreset>('auto-detect');
  const [resolvedPreset, setResolvedPreset] = useState<Exclude<ImageCarouselVisualPreset, 'auto-detect'>>('creator');
  const [deck, setDeck] = useState<TechTipDeck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [images, setImages] = useState<string[]>([]);
  const [renderProgress, setRenderProgress] = useState<{ done: number; total: number } | null>(null);
  const [bgProgress, setBgProgress] = useState<{ done: number; total: number } | null>(null);
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const [redesigning, setRedesigning] = useState(false);

  const [videoBusy, setVideoBusy] = useState(false);
  const [videoPct, setVideoPct] = useState(0);
  const [videoStage, setVideoStage] = useState<'video' | 'audio' | 'mux' | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [withMusic, setWithMusic] = useState(true);
  const motionSupported = useMemo(() => isMotionSupported(), []);

  const resetOutputs = useCallback(() => {
    setImages([]);
    setActive(0);
    setVideoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setVideoBlob(null);
    setVideoError(null);
    setVideoPct(0);
  }, []);

  // ─── upload & reorder ────────────────────────────────────────────────────────────────────

  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setReading(true);
    setReadError(null);
    try {
      const read = await readCarouselFrames(files);
      if (!read.length) {
        setReadError('לא ניתן היה לקרוא אף תמונה מהקבצים שנבחרו.');
        return;
      }
      setFrames((prev) => [...prev, ...read].slice(0, MAX_FRAMES));
      if (read.length < files.length) {
        setReadError(`${files.length - read.length} קבצים לא זוהו כתמונות תקינות ולא נוספו.`);
      }
    } finally {
      setReading(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverDrop(false);
      if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const removeFrame = useCallback((id: string) => {
    setFrames((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearFrames = useCallback(() => {
    setFrames([]);
    setDeck(null);
    setReadError(null);
    setError(null);
    resetOutputs();
  }, [resetOutputs]);

  const moveFrame = useCallback((from: number, to: number) => {
    setFrames((prev) => {
      if (to < 0 || to >= prev.length || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const renderDeck = useCallback(async (d: TechTipDeck, style: TipStyle) => {
    if (style === 'creator') {
      // Direct on-image overlay: erase every detected English block and paint the Hebrew
      // translation back into the exact same spot, at the frame's own native resolution — no
      // template, no dimmed background, no card chrome. See imageOverlayRenderer.ts.
      setRenderProgress({ done: 0, total: d.slides.length });
      const imgs = await renderOverlayDeck(
        d.slides.map((s) => s.sourceImage),
        d.slides.map((s) => s.overlayBoxes),
        (done, total) => setRenderProgress({ done, total })
      );
      setImages(imgs);
      return;
    }
    // Every slide already carries its own uploaded frame as `sourceImage`, so this pass never
    // fetches stock — it only prepares the images already in memory for the canvas.
    setBgProgress({ done: 0, total: d.slides.length });
    const bgs = await resolveTipBackgrounds(d, 1080, 1350, (done, total) => setBgProgress({ done, total }), style);
    setBgProgress(null);
    setRenderProgress({ done: 0, total: d.slides.length });
    const imgs = await renderTipDeckImages(d, { backgrounds: bgs, style }, (done, total) => setRenderProgress({ done, total }));
    setImages(imgs);
  }, []);

  const generate = useCallback(async () => {
    if (frames.length < MIN_FRAMES) {
      setError(`נדרשות לפחות ${MIN_FRAMES} תמונות שקופיות ליצירת קרוסלה.`);
      return;
    }
    setBusy(true);
    setError(null);
    resetOutputs();
    try {
      const { deck: d, resolvedPreset: rp } = await synthesizeImageCarouselDeck(frames, notes, visualPreset);
      setDeck(d);
      setResolvedPreset(rp);
      await renderDeck(d, rp);
    } catch (e) {
      setError((e as Error).message || 'יצירת הקרוסלה נכשלה.');
    } finally {
      setRenderProgress(null);
      setBgProgress(null);
      setBusy(false);
    }
  }, [frames, notes, visualPreset, resetOutputs, renderDeck]);

  const redesign = useCallback(async () => {
    if (!deck) return;
    setRedesigning(true);
    setError(null);
    try {
      await renderDeck(deck, resolvedPreset);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'עיצוב מחדש נכשל');
    } finally {
      setRedesigning(false);
      setBgProgress(null);
      setRenderProgress(null);
    }
  }, [deck, resolvedPreset, renderDeck]);

  const caption = useMemo(() => (deck ? imageCarouselDeckCaption(deck) : ''), [deck]);

  const exportZip = useCallback(async () => {
    if (!deck || !images.length) return;
    await exportTipDeckZip(deck, images, caption);
  }, [deck, images, caption]);

  const makeVideo = useCallback(async () => {
    if (!deck || !motionSupported) return;
    setVideoBusy(true);
    setVideoError(null);
    setVideoPct(0);
    try {
      const bgs = await resolveTipBackgrounds(deck, 1080, 1920, undefined, resolvedPreset);
      const { blob } = await renderTipDeckVideo(deck, { backgrounds: bgs, music: withMusic, style: resolvedPreset }, (pct, stage) => {
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
  }, [deck, motionSupported, withMusic, resolvedPreset]);

  const downloadVideo = useCallback(() => {
    if (!videoBlob || !deck) return;
    const slug = (deck.title || 'carousel').replace(/[^\w֐-׿]+/g, '-').slice(0, 40) || 'carousel';
    const objectUrl = URL.createObjectURL(videoBlob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `mrdaniel-image-carousel-${slug}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }, [videoBlob, deck]);

  const copyCaption = useCallback(async () => {
    if (!deck) return;
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the caption is visible below */
    }
  }, [deck, caption]);

  const activeSlide = deck?.slides[Math.min(active, deck.slides.length - 1)];

  return (
    <div className="space-y-5">
      {/* 1 · upload */}
      <div className="dash-card p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
            <ImagePlus className="w-3.5 h-3.5" /> העלאת תמונות שקופיות הקרוסלה, לפי סדר
          </span>
          {frames.length > 0 && (
            <button
              onClick={clearFrames}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300 text-xs font-bold cursor-pointer hover:bg-white/10"
            >
              <Trash2 className="w-3.5 h-3.5" /> נקה / התחל מחדש
            </button>
          )}
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverDrop(true);
          }}
          onDragLeave={() => setDragOverDrop(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors ${
            dragOverDrop ? 'border-brand-500 bg-brand-500/10' : 'border-white/15 bg-black/20 hover:border-white/25'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          {reading ? <Loader2 className="w-6 h-6 animate-spin text-brand-400" /> : <ImagePlus className="w-6 h-6 text-zinc-500" />}
          <p className="text-sm font-bold text-zinc-200">גררו לכאן את תמונות השקופיות, או לחצו לבחירה</p>
          <p className="text-[11px] text-zinc-500">jpg · png · webp — עד {MAX_FRAMES} שקופיות, בסדר הקרוסלה המקורי</p>
        </div>

        {readError && (
          <p className="mt-3 text-xs text-amber-400 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {readError}
          </p>
        )}

        {frames.length > 0 && (
          <>
            <p className="mt-4 mb-2 text-[11px] text-zinc-500">
              {frames.length} שקופיות · גררו לשינוי סדר, או השתמשו בחצים
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {frames.map((f, i) => (
                <div
                  key={f.id}
                  draggable
                  onDragStart={() => {
                    dragIndex.current = i;
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex.current !== null) moveFrame(dragIndex.current, i);
                    dragIndex.current = null;
                  }}
                  className="group relative overflow-hidden rounded-lg border border-white/10 bg-black/40 cursor-grab active:cursor-grabbing"
                >
                  <img src={f.dataUrl} alt={`שקופית ${i + 1}`} className="block w-full aspect-[4/5] object-cover" />
                  <span className="absolute top-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-mono text-zinc-200">
                    {i + 1}
                  </span>
                  <GripVertical className="absolute top-1 left-1 w-3.5 h-3.5 text-white/40" />
                  <button
                    onClick={() => removeFrame(f.id)}
                    title="הסר שקופית"
                    className="absolute bottom-1 left-1 flex items-center justify-center rounded bg-black/70 p-1 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer hover:text-red-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <div className="absolute bottom-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => moveFrame(i, i - 1)}
                      disabled={i === 0}
                      className="rounded bg-black/70 p-1 text-zinc-300 cursor-pointer disabled:opacity-30 hover:text-white"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => moveFrame(i, i + 1)}
                      disabled={i === frames.length - 1}
                      className="rounded bg-black/70 p-1 text-zinc-300 cursor-pointer disabled:opacity-30 hover:text-white"
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 2 · translate & brand */}
      <div className="dash-card p-6">
        <span className="mb-4 flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
          <WandSparkle className="w-3.5 h-3.5" /> תרגום, מיתוג ועיצוב
        </span>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="הנחיות אופציונליות: זווית, קהל יעד, מה להדגיש או להשמיט…"
          dir="rtl"
          rows={2}
          className="mb-3 w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200"
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void generate()}
            disabled={busy || frames.length < MIN_FRAMES}
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-black cursor-pointer disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            תרגמו ומתגו את הקרוסלה
          </button>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <Palette className="w-3.5 h-3.5 text-brand-400" />
            עיצוב
            <select
              value={visualPreset}
              onChange={(e) => setVisualPreset(e.target.value as ImageCarouselVisualPreset)}
              className="cursor-pointer rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white"
            >
              {PRESET_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-500">
          <Wand2 className="w-3.5 h-3.5 shrink-0 text-brand-400" />
          {PRESET_OPTIONS.find((p) => p.id === visualPreset)?.hint}
        </p>
        {frames.length > 0 && frames.length < MIN_FRAMES && (
          <p className="mt-2 text-[11px] text-amber-400">נדרשות לפחות {MIN_FRAMES} תמונות ליצירת קרוסלה.</p>
        )}
        {bgProgress && (
          <p className="mt-3 text-[11px] text-sky-400/90">מכין נכסים לשקופיות… {bgProgress.done}/{bgProgress.total}</p>
        )}
        {renderProgress && (
          <p className="mt-2 text-[11px] text-sky-400/90">מרנדר שקופיות… {renderProgress.done}/{renderProgress.total}</p>
        )}
        {error && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </p>
        )}
      </div>

      {/* 3 · preview + export */}
      {deck && (
        <PreviewErrorBoundary label="תצוגת הקרוסלה" resetKeys={[deck.createdAt, images.length, active]} onReset={() => setActive(0)}>
          <div className="dash-card p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <span className="flex flex-wrap items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
                <ImagePlus className="w-3.5 h-3.5" /> {deck.slides.length} שקופיות ·{' '}
                <span className={deck.synthesized ? 'text-brand-400 normal-case' : 'text-amber-400/80 normal-case'}>
                  {deck.synthesized ? 'תורגם ומותג ע"י AI' : `טיוטה${deck.fallbackReason ? ` — ${deck.fallbackReason}` : ''}`}
                </span>
                {visualPreset === 'auto-detect' && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 normal-case text-zinc-300">
                    זוהה: {PRESET_LABEL[resolvedPreset]}
                  </span>
                )}
                {deck.topic && (
                  <span
                    className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 normal-case text-zinc-300"
                    title={deck.topic.signals.join(' · ') || 'לא זוהו אותות נושא'}
                  >
                    <Palette className="w-3 h-3 text-brand-400" />
                    {THEME_LABEL[deck.topic.theme] ?? deck.topic.theme}
                    {deck.topic.guideSlug && (
                      <span dir="ltr" className="text-brand-400/80">/g/{deck.topic.guideSlug}</span>
                    )}
                  </span>
                )}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={copyCaption}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-200 cursor-pointer hover:bg-white/10"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'הועתק ✓' : 'העתק כיתוב'}
                </button>
                <button
                  onClick={() => void redesign()}
                  disabled={redesigning || busy}
                  title="מרנדר מחדש באותו עיצוב — הטקסט נשאר כפי שהוא"
                  className="flex items-center gap-1.5 rounded-lg border border-brand-500/50 px-3 py-1.5 text-xs font-bold text-brand-400 cursor-pointer hover:bg-brand-500/10 disabled:opacity-40"
                >
                  {redesigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  רענון עיצוב
                </button>
                <button
                  onClick={() => void exportZip()}
                  disabled={!images.length || busy}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-black cursor-pointer disabled:opacity-50"
                >
                  <ImageIcon className="w-3.5 h-3.5" /> קרוסלה (ZIP · PNG)
                </button>
                {resolvedPreset === 'creator' ? (
                  <span className="text-[11px] text-zinc-600" title="עריכה במקום שומרת על התמונה המקורית ברזולוציה שלה — ריל 9:16 לא נתמך עבורה כרגע">
                    ריל 9:16 לא נתמך בעיצוב "עריכה במקום"
                  </span>
                ) : motionSupported ? (
                  <button
                    onClick={() => void makeVideo()}
                    disabled={videoBusy || busy}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-200 cursor-pointer hover:bg-white/10 disabled:opacity-50"
                  >
                    {videoBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5" />}
                    {videoBlob ? 'רענון סרטון' : 'הפק ריל 9:16'}
                  </button>
                ) : (
                  <span className="text-[11px] text-zinc-600">הפקת וידאו לא נתמכת בדפדפן זה</span>
                )}
                {videoBlob && resolvedPreset !== 'creator' && (
                  <button
                    onClick={downloadVideo}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-black cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> הורד ריל (MP4)
                  </button>
                )}
                {resolvedPreset !== 'creator' && (
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-400">
                    <input type="checkbox" checked={withMusic} onChange={(e) => setWithMusic(e.target.checked)} className="accent-brand-500 w-3.5 h-3.5" />
                    פס קול
                  </label>
                )}
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              {deck.slides.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold cursor-pointer ${
                    active === i ? 'bg-brand-500 text-black' : 'border border-white/10 bg-white/5 text-zinc-400'
                  }`}
                >
                  {i + 1}. {KIND_LABEL[s.kind] ?? s.kind}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActive((a) => Math.max(0, a - 1))}
                  disabled={active === 0}
                  className="cursor-pointer rounded-full border border-white/10 bg-white/5 p-2 text-zinc-400 hover:text-white disabled:opacity-30"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div
                  className="relative shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black"
                  style={{ width: PREVIEW_W, height: PREVIEW_H }}
                >
                  {images[Math.min(active, images.length - 1)] ? (
                    <img
                      src={images[Math.min(active, images.length - 1)]}
                      alt={`שקופית ${active + 1}`}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-700">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setActive((a) => Math.min(deck.slides.length - 1, a + 1))}
                  disabled={active >= deck.slides.length - 1}
                  className="cursor-pointer rounded-full border border-white/10 bg-white/5 p-2 text-zinc-400 hover:text-white disabled:opacity-30"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>

              {activeSlide && (
                <div className="min-w-0 space-y-3">
                  <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                    <span className="font-bold uppercase text-brand-400">{KIND_LABEL[activeSlide.kind] ?? activeSlide.kind}</span>
                    {activeSlide.stepNumber > 0 && <span>· שלב {activeSlide.stepNumber}</span>}
                    {activeSlide.codeLang && <span>· {activeSlide.codeLang}</span>}
                  </div>
                  {activeSlide.badge && <p dir="ltr" className="text-xs font-bold text-brand-400">{activeSlide.badge}</p>}
                  <p className="text-base font-bold leading-snug text-white">{activeSlide.title}</p>
                  {activeSlide.body && <p className="text-sm leading-relaxed text-zinc-300">{activeSlide.body}</p>}
                  {(activeSlide.promptCards?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      {activeSlide.promptCards!.map((c, i) => (
                        <div key={i} className="rounded-lg border border-white/10 bg-black/30 p-2.5">
                          <p className="mb-1 font-mono text-[11px] text-brand-400">#{c.index}</p>
                          <p className="text-sm leading-relaxed text-zinc-300">{c.body}</p>
                          {c.whyIUseThis && (
                            <p className="mt-1.5 text-[12px] leading-relaxed text-amber-200/80">
                              למה אני משתמש בזה: {c.whyIUseThis}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {activeSlide.bullets.length > 0 && (
                    <ul className="space-y-1.5">
                      {activeSlide.bullets.map((bl, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                          <Check className="mt-1 w-3.5 h-3.5 shrink-0 text-brand-400" />
                          <span>{bl}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {activeSlide.code && (
                    <pre
                      dir="ltr"
                      className="overflow-x-auto rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-zinc-300"
                    >
                      <code className="flex items-start gap-1.5">
                        <Code2 className="mt-0.5 w-3.5 h-3.5 shrink-0 text-cyan-400" />
                        <span>{activeSlide.code}</span>
                      </code>
                    </pre>
                  )}
                </div>
              )}
            </div>

            {images.length > 0 && (
              <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActive(i)}
                    className={`overflow-hidden rounded-lg border cursor-pointer transition-colors ${
                      active === i ? 'border-brand-500' : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <img src={img} alt={`תצוגה מקדימה ${i + 1}`} className="block w-full" />
                  </button>
                ))}
              </div>
            )}

            {(videoBusy || videoUrl || videoError) && (
              <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                  <Film className="w-3.5 h-3.5" /> ריל 9:16 (MP4)
                </div>
                {videoBusy && (
                  <>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
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
                  <p className="flex items-center gap-1.5 text-xs text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" /> {videoError}
                  </p>
                )}
                {videoUrl && !videoBusy && (
                  <div className="flex flex-col items-center gap-2">
                    <video
                      src={videoUrl}
                      controls
                      playsInline
                      className="max-h-[460px] rounded-lg border border-white/10 bg-black"
                      style={{ aspectRatio: '9 / 16' }}
                    />
                    <p className="text-[11px] text-zinc-500">תצוגה מקדימה · {withMusic ? 'עם פס קול אמביינטי' : 'ללא פס קול'}</p>
                  </div>
                )}
              </div>
            )}

            <QuickPublishBar
              text={caption}
              image={images[Math.min(active, images.length - 1)]}
              label="פרסום מהיר · קרוסלה מתורגמת"
              className="mt-5 justify-center"
            />

            <details className="mt-4">
              <summary className="cursor-pointer font-mono text-[11px] text-zinc-500">כיתוב + האשטגים</summary>
              <pre
                dir="rtl"
                className="mt-2 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-zinc-300"
              >
                {caption}
              </pre>
            </details>
          </div>
        </PreviewErrorBoundary>
      )}

      {!deck && !busy && (
        <div className="dash-card p-10 text-center text-sm leading-relaxed text-zinc-500">
          העלו את תמונות השקופיות של קרוסלה — בדיוק כפי שפורסמה, בסדר הנכון. המערכת תקרא את כל הטקסט
          המודפס על כל שקופית, תתרגם ותתאים אותו לעברית ישראלית טבעית, תשמור על מבנה הקרוסלה המקורי
          ותמתג אותו ל-@mrdaniel.co.il — בלי קישור או שם מקור זר. פלט כפול: קרוסלה (PNG · ZIP) וריל 9:16.
        </div>
      )}
    </div>
  );
}
