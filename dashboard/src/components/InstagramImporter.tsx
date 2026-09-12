import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Instagram,
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
  Link2,
  ClipboardPaste,
  Trash2,
  Languages,
  Layers,
  Palette,
  ScanText,
} from 'lucide-react';
import {
  importInstagramPost,
  parseInstagramRawText,
  synthesizeInstagramDeck,
  instagramDeckCaption,
  isInstagramUrl,
  saveInstagramState,
  loadInstagramState,
  clearInstagramState,
  captionWithoutHashtags,
  MIN_CAPTION_CHARS,
  EMPTY_POST,
  type ImportedInstagramPost,
  type InstagramVisualPreset,
} from '../lib/instagramImportApi';
import type { TechTipDeck } from '../lib/techTipsApi';
import { renderTipDeckImages, exportTipDeckZip, resolveTipBackgrounds } from '../lib/techTipRenderer';
import { renderTipDeckVideo, isMotionSupported } from '../lib/motionStudioService';
import PreviewErrorBoundary from './PreviewErrorBoundary';
import QuickPublishBar from './QuickPublishBar';

/**
 * The three visual presets this tab offers — no photographic styles: an Instagram post walking a
 * reader through a tool or an automation is a technical deck, and a searched stock photo behind an
 * install box or a node diagram is the single loudest "assembled, not made" tell there is.
 *
 * `creator` (the original dark preset) fetches nothing at all — the slide is painted on the deep
 * slate backdrop lit by the tool's own colours. `cream-skill` and `cream-workflow` are the warm
 * paper family: same zero-stock rule, different palette and composition (see designAssets.ts /
 * techTipRenderer.ts's `drawCreamSlide`). All three share one exception the renderer makes on its
 * own: an image the POST published is evidence, not stock, and still renders.
 */
const PRESET_OPTIONS: { id: InstagramVisualPreset; label: string; hint: string }[] = [
  { id: 'creator', label: 'קריאייטור (כהה)', hint: 'רקע סלייט כהה עם זוהר בצבעי הכלי — בלי סטוק' },
  { id: 'cream-skill', label: 'קרם וטרקוטה', hint: 'כרטיס מיומנות בהיר: פקודה, תיאור קצר וקופסת התקנה כהה' },
  { id: 'cream-workflow', label: 'דיאגרמת תהליך', hint: 'כרטיס בהיר עם שרשרת צמתי אוטומציה מחוברים' },
];

const KIND_LABEL: Record<string, string> = {
  cover: 'שער',
  concept: 'רעיון',
  code: 'קוד',
  step: 'שלב',
  tool: 'כלים',
  takeaway: 'סיכום',
  cta: 'CTA',
};

const VIA_LABEL: Record<ImportedInstagramPost['via'], string> = {
  direct: 'נמשך ישירות מאינסטגרם',
  meta: 'נמשך מתגיות המטא של הפוסט',
  jina: 'נמשך דרך קורא חיצוני',
  manual: 'הודבק ידנית',
  none: 'לא נמשך תוכן',
};

const PREVIEW_W = 340;
const PREVIEW_H = 425;

/** Hebrew label for the subject family the agent assigned — the operator sees what it decided. */
const THEME_LABEL: Record<string, string> = {
  ai: 'בינה מלאכותית',
  automation: 'אוטומציה',
  security: 'סייבר ואבטחה',
  code: 'פיתוח וקוד',
  data: 'נתונים',
  web3: 'Web3',
  general: 'טכנולוגיה',
};

/**
 * Instagram → Hebrew carousel.
 *
 * Three stages, each its own card: import a public Instagram post, carousel or reel (or paste its
 * caption), adapt it into Hebrew with the translation agent, then preview and export. The deck it
 * produces is a TechTipDeck, so rendering, the 9:16 reel and the ZIP export are the exact same code
 * paths the Tech Tips studio uses — this tab adds a source, not a second pipeline.
 *
 * State is plain `useState` (dashboard convention — no TanStack Query), mirrored into
 * sessionStorage so an expensive import + adaptation survives a tab switch or a hot reload.
 */
export default function InstagramImporter() {
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [post, setPost] = useState<ImportedInstagramPost>(EMPTY_POST);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [notes, setNotes] = useState('');
  const [useSlideText, setUseSlideText] = useState(true);
  const [visualPreset, setVisualPreset] = useState<InstagramVisualPreset>('creator');
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

  // Restore a previous session's import/deck once, before the first paint that could overwrite it.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = loadInstagramState();
    if (!saved) return;
    setPost(saved.post);
    setDeck(saved.deck);
    setUrl(saved.url);
    setNotes(saved.notes);
    if (saved.visualPreset) setVisualPreset(saved.visualPreset);
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    if (!post.text && !deck) return;
    saveInstagramState({ post, deck, url, notes, visualPreset, savedAt: Date.now() });
  }, [post, deck, url, notes, visualPreset]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

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

  /** Stage 1 — pull the post off Instagram. A private/gated post is not an error: the paste box opens. */
  const runImport = useCallback(async () => {
    const target = url.trim();
    if (!isInstagramUrl(target)) {
      setImportError('הדביקו קישור לפוסט באינסטגרם (instagram.com/p/… או /reel/…).');
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      const imported = await importInstagramPost(target);
      setPost(imported);
      setRawText(imported.caption);
      // `ok:false` also covers a thin extraction — a gated post whose OG shell yielded a few
      // characters. That would otherwise pass as success and only surface later as a silent
      // local-mode deck, so the paste box opens here instead, with the server's note explaining why.
      if (!imported.ok || !imported.text.trim()) {
        setShowPaste(true);
        setImportError(imported.note ?? 'לא הצלחנו לקרוא את הפוסט — הדביקו את הכיתוב ידנית.');
      } else if (imported.note) {
        setImportError(imported.note);
      }
    } catch (e) {
      setShowPaste(true);
      setImportError((e as Error).message || 'ייבוא הפוסט נכשל — הדביקו את הכיתוב ידנית.');
    } finally {
      setImporting(false);
    }
  }, [url]);

  /** Stage 1b — the manual path. Parsed locally, no round-trip. */
  const applyPaste = useCallback(() => {
    const parsed = parseInstagramRawText(rawText, url);
    setPost(parsed);
    setImportError(parsed.ok ? null : (parsed.note ?? 'לא נמצא טקסט שמיש בהדבקה.'));
  }, [rawText, url]);

  const renderDeck = useCallback(async (d: TechTipDeck) => {
    // Still called in creator mode even though it fetches no stock: this is the pass that loads the
    // post's OWN carousel frames onto the slides they came from.
    setBgProgress({ done: 0, total: d.slides.length });
    const bgs = await resolveTipBackgrounds(d, 1080, 1350, (done, total) => setBgProgress({ done, total }), visualPreset);
    setBgProgress(null);
    setRenderProgress({ done: 0, total: d.slides.length });
    const imgs = await renderTipDeckImages(d, { backgrounds: bgs, style: visualPreset }, (done, total) => setRenderProgress({ done, total }));
    setImages(imgs);
  }, [visualPreset]);

  /** Stage 2 — translate & adapt, then render. */
  const generate = useCallback(async () => {
    const source = post.text.trim() ? post : parseInstagramRawText(rawText, url);
    const sourceChars = captionWithoutHashtags(source.caption || source.text).trim().length;
    if (sourceChars < MIN_CAPTION_CHARS) {
      // Same floor the server and the client lib use, so the operator is told what is missing
      // rather than watching the run come back as an unexplained local-mode deck.
      setShowPaste(true);
      setError(
        `אין מספיק טקסט מקור (${sourceChars} תווים, נדרשים ${MIN_CAPTION_CHARS}) — הדביקו את כיתוב הפוסט המלא בתיבה למטה.`
      );
      return;
    }
    if (!post.text.trim()) setPost(source);
    setBusy(true);
    setError(null);
    resetOutputs();
    try {
      const d = await synthesizeInstagramDeck(source, notes, { useSlideText, visualPreset });
      setDeck(d);
      await renderDeck(d);
    } catch (e) {
      setError((e as Error).message || 'יצירת הקרוסלה נכשלה.');
    } finally {
      setRenderProgress(null);
      setBgProgress(null);
      setBusy(false);
    }
  }, [post, rawText, url, notes, useSlideText, visualPreset, resetOutputs, renderDeck]);

  /** Swap backgrounds and re-render — the adapted copy is untouched. */
  const redesign = useCallback(async () => {
    if (!deck) return;
    setRedesigning(true);
    setError(null);
    try {
      await renderDeck(deck);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'עיצוב מחדש נכשל');
    } finally {
      setRedesigning(false);
      setBgProgress(null);
      setRenderProgress(null);
    }
  }, [deck, renderDeck]);

  const caption = useMemo(() => (deck ? instagramDeckCaption(deck) : ''), [deck]);

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
      // The reel is 9:16, so the post's own frames are re-fetched at the vertical aspect.
      setVideoStage(null);
      const bgs = await resolveTipBackgrounds(deck, 1080, 1920, undefined, visualPreset);
      const { blob } = await renderTipDeckVideo(deck, { backgrounds: bgs, music: withMusic, style: visualPreset }, (pct, stage) => {
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
  }, [deck, motionSupported, withMusic, visualPreset]);

  const downloadVideo = useCallback(() => {
    if (!videoBlob || !deck) return;
    const slug = (deck.title || 'instagram').replace(/[^\w֐-׿]+/g, '-').slice(0, 40) || 'instagram';
    const objectUrl = URL.createObjectURL(videoBlob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `mrdaniel-ig-${slug}.mp4`;
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

  /** Explicit wipe — the only thing that clears the persisted session state. */
  const clearAll = useCallback(() => {
    clearInstagramState();
    setPost(EMPTY_POST);
    setDeck(null);
    setRawText('');
    setUrl('');
    setNotes('');
    setVisualPreset('creator');
    setImportError(null);
    setError(null);
    resetOutputs();
  }, [resetOutputs]);

  const activeSlide = deck?.slides[Math.min(active, deck.slides.length - 1)];
  const sourceChars = captionWithoutHashtags(post.caption || post.text).trim().length;
  const ocrFrames = post.slides.filter((s) => s.text.trim().length > 12).length;

  return (
    <div className="space-y-5">
      {/* 1 · import */}
      <div className="dash-card p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
            <Instagram className="w-3.5 h-3.5" /> ייבוא פוסט / קרוסלה מאינסטגרם
          </span>
          {(post.text.length > 0 || deck) && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300 text-xs font-bold cursor-pointer hover:bg-white/10"
            >
              <Trash2 className="w-3.5 h-3.5" /> נקה / התחל מחדש
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[18rem] flex-1">
            <Link2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !importing && void runImport()}
              placeholder="https://www.instagram.com/p/ABC123/"
              dir="ltr"
              className="w-full rounded-lg border border-white/15 bg-black/40 py-2 pr-9 pl-3 text-sm text-zinc-200 placeholder:text-zinc-600"
            />
          </div>
          <button
            onClick={() => void runImport()}
            disabled={importing || !url.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-black cursor-pointer disabled:opacity-40"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            משוך תוכן
          </button>
          <button
            onClick={() => setShowPaste((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs font-bold text-zinc-300 cursor-pointer hover:bg-white/10"
          >
            <ClipboardPaste className="w-3.5 h-3.5" /> {showPaste ? 'סגור הדבקה ידנית' : 'הדבקה ידנית'}
          </button>
        </div>

        {importError && (
          <p className="mt-3 text-xs text-amber-400 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {importError}
          </p>
        )}

        {/* Carousel detection. The operator learns what they are about to generate before spending
            a run on it — and whether the frames' own text was recovered. */}
        {post.slides.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-xs font-bold text-brand-300">
            <Layers className="w-3.5 h-3.5 shrink-0" />
            {post.isCarousel ? `זוהתה קרוסלה בת ${post.slides.length} שקופיות` : 'זוהה פוסט בודד'}
            {ocrFrames > 0 && (
              <span className="font-normal text-brand-200/70">· טקסט נקרא מ-{ocrFrames} שקופיות</span>
            )}
            {post.images.length > 0 && (
              <span className="font-normal text-brand-200/70">· {post.images.length} תמונות מהמקור</span>
            )}
          </div>
        )}

        {showPaste && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
            <label className="mb-1.5 block text-[12px] font-bold text-zinc-300">
              הדביקו את כיתוב הפוסט (כל פסקה תהפוך לשקופית)
            </label>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={8}
              dir="auto"
              placeholder={'GLM-5.2 is open weights under MIT…\n\nThe catch is memory…'}
              className="w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
            />
            <button
              onClick={applyPaste}
              disabled={rawText.trim().length < 20}
              className="mt-2 flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-zinc-100 cursor-pointer disabled:opacity-40"
            >
              <Check className="w-3.5 h-3.5" /> השתמש בטקסט הזה
            </button>
          </div>
        )}

        {/* extracted caption — the operator sees exactly what will be adapted */}
        {post.lines.length > 0 && (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-mono text-zinc-500">
              <span className="rounded-full border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-brand-300">
                {sourceChars} תווים בכיתוב
              </span>
              <span>{VIA_LABEL[post.via]}</span>
              {post.author && <span dir="ltr">· {post.author}</span>}
              {post.hashtags.length > 0 && <span>· {post.hashtags.length} האשטגים</span>}
            </div>
            <ol className="space-y-2 max-h-64 overflow-y-auto pl-1">
              {post.lines.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-zinc-300">
                  <span className="mt-0.5 shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
                    {i + 1}
                  </span>
                  <span dir="auto" className="whitespace-pre-wrap">{line}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* the carousel's own frames + the text read off them */}
        {post.slides.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer font-mono text-[11px] text-zinc-500">
              שקופיות המקור ({post.slides.length}) — תמונות וטקסט שנקרא מהן
            </summary>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {post.slides.map((s, i) => (
                <div key={i} className="flex gap-2 rounded-lg border border-white/10 bg-black/40 p-2">
                  {s.image ? (
                    <img
                      src={s.image}
                      alt={`שקופית מקור ${i + 1}`}
                      loading="lazy"
                      className="h-20 w-20 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded bg-white/5 text-zinc-700">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  )}
                  <p dir="ltr" className="min-w-0 flex-1 text-[10px] leading-relaxed text-zinc-500 line-clamp-5">
                    {s.text || '(לא נקרא טקסט מהתמונה)'}
                  </p>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* 2 · adapt */}
      <div className="dash-card p-6">
        <span className="mb-4 flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
          <Languages className="w-3.5 h-3.5" /> תרגום והתאמה לעברית ישראלית
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
            disabled={busy || (sourceChars < MIN_CAPTION_CHARS && rawText.trim().length < MIN_CAPTION_CHARS)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-black cursor-pointer disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            צור קרוסלה בעברית (10–12 שקופיות)
          </button>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <Palette className="w-3.5 h-3.5 text-brand-400" />
            עיצוב
            <select
              value={visualPreset}
              onChange={(e) => setVisualPreset(e.target.value as InstagramVisualPreset)}
              className="cursor-pointer rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white"
            >
              {PRESET_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          {/* The frames' OCR is read for STRUCTURE only (see the agent), but a post whose graphics
              are pure decoration produces noise — so the operator can switch that channel off. */}
          {ocrFrames > 0 && (
            <label
              className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-400"
              title="קורא את הטקסט שמודפס על שקופיות המקור כדי לשחזר את מבנה הקרוסלה. הכיתוב תמיד מנצח בסתירה."
            >
              <input
                type="checkbox"
                checked={useSlideText}
                onChange={(e) => setUseSlideText(e.target.checked)}
                className="accent-brand-500 w-3.5 h-3.5"
              />
              <ScanText className="w-3.5 h-3.5 text-brand-400" />
              השתמש בטקסט מהשקופיות ({ocrFrames})
            </label>
          )}
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-500">
          <Wand2 className="w-3.5 h-3.5 shrink-0 text-brand-400" />
          {PRESET_OPTIONS.find((p) => p.id === visualPreset)?.hint} — אפס תמונות סטוק.
        </p>
        {bgProgress && (
          <p className="mt-3 text-[11px] text-sky-400/90">
            מכין נכסים לשקופיות… {bgProgress.done}/{bgProgress.total}
          </p>
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
                <Instagram className="w-3.5 h-3.5" /> {deck.slides.length} שקופיות ·{' '}
                <span className={deck.synthesized ? 'text-brand-400 normal-case' : 'text-amber-400/80 normal-case'}>
                  {deck.synthesized ? 'תורגם והותאם ע"י AI' : `גיבוי מקומי${deck.fallbackReason ? ` — ${deck.fallbackReason}` : ''}`}
                </span>
                {/* What the agent decided the post was about — the theme drives the accent colour,
                    the badge on every slide and which guide the CTA promotes. */}
                {deck.topic && (
                  <span
                    className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 normal-case text-zinc-300"
                    title={deck.topic.signals.join(' · ') || 'לא זוהו אותות נושא'}
                  >
                    <Palette className="w-3 h-3 text-brand-400" />
                    {THEME_LABEL[deck.topic.theme] ?? deck.topic.theme}
                    <span dir="ltr" className="text-zinc-500">
                      {deck.topic.badge}
                    </span>
                    {deck.topic.guideSlug && (
                      <span dir="ltr" className="text-brand-400/80">
                        /g/{deck.topic.guideSlug}
                      </span>
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
                  title="מחליף רקעים ומרנדר מחדש — הטקסט נשאר כפי שהוא"
                  className="flex items-center gap-1.5 rounded-lg border border-brand-500/50 px-3 py-1.5 text-xs font-bold text-brand-400 cursor-pointer hover:bg-brand-500/10 disabled:opacity-40"
                >
                  {redesigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  עיצוב מחדש
                </button>
                <select
                  value={visualPreset}
                  onChange={(e) => setVisualPreset(e.target.value as InstagramVisualPreset)}
                  title="שינוי הסגנון דורש 'עיצוב מחדש'. אם הדק סונתז תחת סגנון אחר, כותרות-משנה ודיאגרמות תהליך יופיעו רק אחרי יצירה מחדש."
                  className="cursor-pointer rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white"
                >
                  {PRESET_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => void exportZip()}
                  disabled={!images.length || busy}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-black cursor-pointer disabled:opacity-50"
                >
                  <ImageIcon className="w-3.5 h-3.5" /> קרוסלה (ZIP · PNG)
                </button>
                {motionSupported ? (
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
                {videoBlob && (
                  <button
                    onClick={downloadVideo}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-black cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> הורד ריל (MP4)
                  </button>
                )}
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-400">
                  <input type="checkbox" checked={withMusic} onChange={(e) => setWithMusic(e.target.checked)} className="accent-brand-500 w-3.5 h-3.5" />
                  פס קול
                </label>
              </div>
            </div>

            {/* slide rail */}
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
                  <p className="text-base font-bold leading-snug text-white">{activeSlide.title}</p>
                  {activeSlide.body && <p className="text-sm leading-relaxed text-zinc-300">{activeSlide.body}</p>}
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

            {/* bento contact sheet — every rendered slide at a glance */}
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

            {/* motion output */}
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
              label="פרסום מהיר · קרוסלה מאינסטגרם"
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
          הדביקו קישור לפוסט או לקרוסלה באינסטגרם — המערכת תמשוך את הכיתוב, את שקופיות המקור ואת הטקסט
          שמודפס עליהן, תתרגם ותתאים אותם לעברית ישראלית טבעית, ותבנה קרוסלת לימוד של 10–12 שקופיות
          בעיצוב סייבר כהה. אם הפוסט חסום, הדביקו את הכיתוב ידנית — התוצאה זהה. פלט כפול: קרוסלה
          (PNG · ZIP) וריל 9:16.
        </div>
      )}
    </div>
  );
}
