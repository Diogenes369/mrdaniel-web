import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Code2,
  Copy,
  Download,
  Film,
  Image as ImageIcon,
  Languages,
  Layers,
  Link2,
  Loader2,
  Palette,
  Play,
  Sparkles,
  Subtitles,
  Trash2,
  Twitter,
  Wand2,
} from 'lucide-react';
import {
  EMPTY_X_POST,
  MIN_X_CHARS,
  clearXState,
  fetchXSubtitles,
  importXPost,
  isXUrl,
  loadXState,
  parseXRawText,
  pickPlaybackVariant,
  saveXState,
  synthesizeXDeck,
  xDeckCaption,
  type ImportedXPost,
} from '../lib/xImportApi';
import {
  buildSrt,
  buildVtt,
  cuesToTranscript,
  formatClock,
  normalizeCues,
  type SubtitleCue,
} from '../lib/xSubtitleFormat';
import { MAX_BURN_SECONDS, burnSubtitles, isBurnSupported, type BurnStage } from '../lib/xSubtitleBurner';
import type { TechTipDeck, TechTipSlide } from '../lib/techTipsApi';
import { exportTipDeckZip, renderSingleTipSlide, renderTipDeckImages, resolveTipBackgrounds, type TipStyle } from '../lib/techTipRenderer';
import PreviewErrorBoundary from './PreviewErrorBoundary';
import QuickPublishBar from './QuickPublishBar';

/**
 * X (Twitter) → Hebrew carousel + Hebrew-subtitled video.
 *
 * Four stages, each its own card: import a public X post (or paste it), transcribe and translate its
 * video into Hebrew cues, adapt the post + transcript into a Hebrew deck, then preview and export.
 *
 * The deck half is deliberately identical to the Threads importer's — same `TechTipDeck`, same
 * renderer, same ZIP export — so this tab adds a source and a video pipeline, not a second carousel
 * engine. The SUBTITLE half is what is new: the cue table is editable, every edit re-normalises
 * through the same repair pass the server output went through, and the burn runs in this tab (see
 * `lib/xSubtitleBurner.ts` for why it cannot run on the server).
 *
 * State is plain `useState` (dashboard convention — no TanStack Query), mirrored into
 * sessionStorage so an expensive import + transcription + adaptation survives a tab switch.
 */

/** Same reasoning as the Threads importer: a thread or a tutorial walking a reader through a tool is
 *  a technical deck, and every photographic style puts a stock photo behind its prompt card. */
const DECK_STYLE: TipStyle = 'creator';

const KIND_LABEL: Record<string, string> = {
  cover: 'שער',
  concept: 'רעיון',
  code: 'קוד',
  step: 'שלב',
  tool: 'כלים',
  takeaway: 'סיכום',
  cta: 'CTA',
};

const VIA_LABEL: Record<ImportedXPost['via'], string> = {
  syndication: 'נמשך ישירות מ-X',
  oembed: 'נמשך מתגית ההטמעה הציבורית',
  manual: 'הודבק ידנית',
  none: 'לא נמשך תוכן',
};

const THEME_LABEL: Record<string, string> = {
  ai: 'בינה מלאכותית',
  automation: 'אוטומציה',
  security: 'סייבר ואבטחה',
  code: 'פיתוח וקוד',
  data: 'נתונים',
  web3: 'Web3',
  general: 'טכנולוגיה',
};

/** Output shapes the burner offers. 'source' keeps the screencast as filmed; the rest letterbox it
 *  onto the deep-slate backdrop for the feed formats the account actually posts in. */
const BURN_ASPECTS = [
  { id: 'source', label: 'מקורי' },
  { id: '9:16', label: 'ריל 9:16' },
  { id: '4:5', label: 'פיד 4:5' },
  { id: '1:1', label: 'ריבוע 1:1' },
] as const;
type BurnAspect = (typeof BURN_ASPECTS)[number]['id'];

const PREVIEW_W = 340;
const PREVIEW_H = 425;

/** Download a blob under a Hebrew-safe filename. The character class keeps Hebrew letters and word
 *  characters and collapses everything else, so a title with an emoji or a slash still names a file. */
function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

function slugify(raw: string, fallback: string): string {
  return (raw || '').replace(/[^\w֐-׿]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || fallback;
}

export default function XImporter() {
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [post, setPost] = useState<ImportedXPost>(EMPTY_X_POST);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // ── subtitles ──
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [sourceLanguage, setSourceLanguage] = useState('');
  const [subsBusy, setSubsBusy] = useState(false);
  const [subsError, setSubsError] = useState<string | null>(null);
  const [subsNotes, setSubsNotes] = useState('');
  const [editingCue, setEditingCue] = useState<number | null>(null);

  // ── burn ──
  const [burnAspect, setBurnAspect] = useState<BurnAspect>('source');
  const [burnAudio, setBurnAudio] = useState(true);
  const [burning, setBurning] = useState(false);
  const [burnPct, setBurnPct] = useState(0);
  const [burnStage, setBurnStage] = useState<BurnStage | null>(null);
  const [burnUrl, setBurnUrl] = useState<string | null>(null);
  const [burnBlob, setBurnBlob] = useState<Blob | null>(null);
  const [burnError, setBurnError] = useState<string | null>(null);
  const burnSupported = useMemo(() => isBurnSupported(), []);

  // ── deck ──
  const [notes, setNotes] = useState('');
  const [deck, setDeck] = useState<TechTipDeck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [renderProgress, setRenderProgress] = useState<{ done: number; total: number } | null>(null);
  const [bgProgress, setBgProgress] = useState<{ done: number; total: number } | null>(null);
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  const backgroundsRef = useRef<(HTMLImageElement | null)[]>([]);
  const [slideRendering, setSlideRendering] = useState(false);

  const video = post.video;
  const playback = useMemo(() => pickPlaybackVariant(video), [video]);
  const transcript = useMemo(() => cuesToTranscript(cues), [cues]);
  const srt = useMemo(() => buildSrt(cues), [cues]);
  // A blob URL rather than a data URL: a long track exceeds what some browsers accept in a
  // `<track src>` data URI, and this is revoked with the component.
  const vttUrl = useMemo(() => {
    if (!cues.length) return null;
    return URL.createObjectURL(new Blob([buildVtt(cues)], { type: 'text/vtt' }));
  }, [cues]);
  useEffect(() => () => { if (vttUrl) URL.revokeObjectURL(vttUrl); }, [vttUrl]);

  // Restore a previous session once, before the first paint that could overwrite it.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = loadXState();
    if (!saved) return;
    setPost(saved.post);
    setDeck(saved.deck);
    setCues(saved.cues);
    setSourceLanguage(saved.sourceLanguage);
    setUrl(saved.url);
    setNotes(saved.notes);
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    if (!post.posts.length && !deck && !cues.length) return;
    saveXState({ post, deck, cues, sourceLanguage, url, notes, savedAt: Date.now() });
  }, [post, deck, cues, sourceLanguage, url, notes]);

  useEffect(() => () => { if (burnUrl) URL.revokeObjectURL(burnUrl); }, [burnUrl]);

  const resetBurn = useCallback(() => {
    setBurnUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setBurnBlob(null);
    setBurnError(null);
    setBurnPct(0);
  }, []);

  const resetOutputs = useCallback(() => {
    setImages([]);
    setActive(0);
  }, []);

  /** Stage 1 — pull the post off X. A gated post is not an error: the paste box opens. */
  const runImport = useCallback(async () => {
    const target = url.trim();
    if (!isXUrl(target)) {
      setImportError('הדביקו קישור לפוסט ב-X (x.com/username/status/…).');
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      const imported = await importXPost(target);
      setPost(imported);
      setRawText(imported.text);
      setCues([]);
      setSourceLanguage('');
      resetBurn();
      if (!imported.ok || imported.posts.length === 0) {
        setShowPaste(true);
        setImportError(imported.note ?? 'לא הצלחנו לקרוא את הפוסט — הדביקו את הטקסט ידנית.');
      } else if (imported.note) {
        setImportError(imported.note);
      }
    } catch (e) {
      setShowPaste(true);
      setImportError((e as Error).message || 'ייבוא הפוסט נכשל — הדביקו את הטקסט ידנית.');
    } finally {
      setImporting(false);
    }
  }, [url, resetBurn]);

  /** Stage 1b — the manual path. Parsed locally, no round-trip. A pasted post keeps whatever video
   *  a previous import found, so the operator can fix thin text without losing the clip. */
  const applyPaste = useCallback(() => {
    const parsed = parseXRawText(rawText, url);
    setPost((prev) => ({ ...parsed, video: parsed.video ?? prev.video }));
    setImportError(parsed.ok ? null : (parsed.note ?? 'לא נמצא טקסט שמיש בהדבקה.'));
  }, [rawText, url]);

  /** Stage 2 — transcribe the clip and translate it to Hebrew cues. */
  const runSubtitles = useCallback(async () => {
    if (!video) return;
    setSubsBusy(true);
    setSubsError(null);
    resetBurn();
    try {
      const result = await fetchXSubtitles(video, subsNotes);
      setCues(result.cues);
      setSourceLanguage(result.sourceLanguage);
      if (!result.cues.length) setSubsError('לא זוהה דיבור בסרטון — אין כתוביות להפיק.');
    } catch (e) {
      setSubsError((e as Error).message || 'תמלול הסרטון נכשל.');
    } finally {
      setSubsBusy(false);
    }
  }, [video, subsNotes, resetBurn]);

  /** Patch one cue, then re-run the same repair pass the server output went through, so a
   *  hand-typed overlap or an over-long line is fixed the moment it is typed. */
  const updateCue = useCallback(
    (index: number, patch: Partial<SubtitleCue>) => {
      setCues((prev) => {
        const next = prev.map((c, i) => (i === index ? { ...c, ...patch } : c));
        return normalizeCues(next, video?.durationMs ?? 0);
      });
      resetBurn();
    },
    [video, resetBurn]
  );

  const removeCue = useCallback(
    (index: number) => {
      setCues((prev) => normalizeCues(prev.filter((_c, i) => i !== index), video?.durationMs ?? 0));
      setEditingCue(null);
      resetBurn();
    },
    [video, resetBurn]
  );

  /** Stage 2b — burn the cues into the picture, in this tab. */
  const runBurn = useCallback(async () => {
    if (!playback || !cues.length) return;
    setBurning(true);
    setBurnError(null);
    setBurnPct(0);
    try {
      const result = await burnSubtitles(
        playback.url,
        cues,
        { aspect: burnAspect, audio: burnAudio },
        (pct, stage) => {
          setBurnPct(pct);
          setBurnStage(stage);
        }
      );
      setBurnUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(result.blob);
      });
      setBurnBlob(result.blob);
    } catch (e) {
      setBurnError((e as Error).message || 'צריבת הכתוביות נכשלה.');
    } finally {
      setBurning(false);
      setBurnStage(null);
    }
  }, [playback, cues, burnAspect, burnAudio]);

  const renderDeck = useCallback(async (d: TechTipDeck) => {
    setBgProgress({ done: 0, total: d.slides.length });
    const bgs = await resolveTipBackgrounds(d, 1080, 1350, (done, total) => setBgProgress({ done, total }), DECK_STYLE);
    backgroundsRef.current = bgs;
    setBgProgress(null);
    setRenderProgress({ done: 0, total: d.slides.length });
    const imgs = await renderTipDeckImages(d, { backgrounds: bgs }, (done, total) => setRenderProgress({ done, total }));
    setImages(imgs);
  }, []);

  /** Stage 3 — adapt post + transcript into a Hebrew deck, then render. */
  const generate = useCallback(async () => {
    const source = post.posts.length ? post : parseXRawText(rawText, url);
    const sourceChars = `${source.text} ${transcript}`.trim().length;
    if (sourceChars < MIN_X_CHARS) {
      setShowPaste(true);
      setError(
        `אין מספיק טקסט מקור (${sourceChars} תווים, נדרשים ${MIN_X_CHARS}) — הדביקו את טקסט הפוסט או הפיקו קודם כתוביות לסרטון.`
      );
      return;
    }
    if (!post.posts.length) setPost(source);
    setBusy(true);
    setError(null);
    resetOutputs();
    try {
      const d = await synthesizeXDeck(source, transcript, notes);
      setDeck(d);
      await renderDeck(d);
    } catch (e) {
      setError((e as Error).message || 'יצירת הקרוסלה נכשלה.');
    } finally {
      setRenderProgress(null);
      setBgProgress(null);
      setBusy(false);
    }
  }, [post, rawText, url, transcript, notes, resetOutputs, renderDeck]);

  const updateActiveSlide = useCallback((patch: Partial<TechTipSlide>) => {
    setDeck((d) => {
      if (!d) return d;
      return { ...d, slides: d.slides.map((s, i) => (i === active ? { ...s, ...patch } : s)) };
    });
  }, [active]);

  const activeSlide = deck?.slides[Math.min(active, deck.slides.length - 1)];

  // Debounced live-preview repaint: an edit to the active slide repaints only that slide's canvas.
  useEffect(() => {
    if (!deck || !activeSlide) return;
    const idx = Math.min(active, deck.slides.length - 1);
    const handle = window.setTimeout(() => {
      setSlideRendering(true);
      renderSingleTipSlide(deck, idx, { background: backgroundsRef.current[idx] ?? null, style: DECK_STYLE })
        .then((dataUrl) => {
          setImages((prev) => {
            const next = [...prev];
            next[idx] = dataUrl;
            return next;
          });
        })
        .catch(() => {})
        .finally(() => setSlideRendering(false));
    }, 250);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, deck, activeSlide?.title, activeSlide?.body, activeSlide?.code, activeSlide?.promptBox, activeSlide?.badge, activeSlide?.kicker, activeSlide?.stepNumber]);

  const caption = useMemo(() => (deck ? xDeckCaption(deck) : ''), [deck]);

  const exportZip = useCallback(async () => {
    if (!deck || !images.length) return;
    await exportTipDeckZip(deck, images, caption);
  }, [deck, images, caption]);

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
    clearXState();
    setPost(EMPTY_X_POST);
    setDeck(null);
    setCues([]);
    setSourceLanguage('');
    setRawText('');
    setUrl('');
    setNotes('');
    setSubsNotes('');
    setImportError(null);
    setSubsError(null);
    setError(null);
    resetBurn();
    resetOutputs();
  }, [resetBurn, resetOutputs]);

  const clipTooLongToBurn = (video?.durationMs ?? 0) > MAX_BURN_SECONDS * 1000;

  return (
    <div className="space-y-5">
      {/* 1 · import */}
      <div className="dash-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-zinc-400">
            <Twitter className="w-3.5 h-3.5" /> ייבוא פוסט מ-X / Twitter
          </span>
          {(post.posts.length > 0 || deck) && (
            <button
              onClick={clearAll}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-white/10"
            >
              <Trash2 className="w-3.5 h-3.5" /> נקה / התחל מחדש
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[18rem] flex-1">
            <Link2 className="absolute right-3 top-1/2 w-4 h-4 -translate-y-1/2 text-zinc-600" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !importing && void runImport()}
              placeholder="https://x.com/username/status/1234567890"
              dir="ltr"
              className="w-full rounded-lg border border-white/15 bg-black/40 py-2 pr-9 pl-3 text-sm text-zinc-200 placeholder:text-zinc-600"
            />
          </div>
          <button
            onClick={() => void runImport()}
            disabled={importing || !url.trim()}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-black disabled:opacity-40"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            משוך תוכן
          </button>
          <button
            onClick={() => setShowPaste((v) => !v)}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-white/10"
          >
            <ClipboardPaste className="w-3.5 h-3.5" /> {showPaste ? 'סגור הדבקה ידנית' : 'הדבקה ידנית'}
          </button>
        </div>

        {importError && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {importError}
          </p>
        )}

        {post.replyCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-xs font-bold text-brand-300">
            <Layers className="w-3.5 h-3.5 shrink-0" />
            זוהה שרשור ({post.replyCount} פוסטים נוספים של אותו מחבר מעל הקישור)
            {post.images.length > 0 && <span className="font-normal text-brand-200/70">· {post.images.length} תמונות מהמקור</span>}
          </div>
        )}

        {showPaste && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
            <label className="mb-1.5 block text-[12px] font-bold text-zinc-300">
              הדביקו את טקסט הפוסט (פוסט לכל פסקה, או שורות ממוספרות "1/", "2/")
            </label>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={8}
              dir="auto"
              placeholder={'1/ This new Gemini workflow replaced 3 tools for me…\n\n2/ Here is the exact prompt…'}
              className="w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
            />
            <button
              onClick={applyPaste}
              disabled={rawText.trim().length < 20}
              className="mt-2 flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-zinc-100 disabled:opacity-40"
            >
              <Check className="w-3.5 h-3.5" /> השתמש בטקסט הזה
            </button>
          </div>
        )}

        {post.posts.length > 0 && (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[11px] text-zinc-500">
              <span className="rounded-full border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-brand-300">
                {post.posts.length} פוסטים
              </span>
              <span>{VIA_LABEL[post.via]}</span>
              {post.author && <span dir="ltr">· {post.author}</span>}
              {post.images.length > 0 && <span>· {post.images.length} תמונות</span>}
              {video && (
                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-sky-300">
                  <Film className="mb-0.5 ml-1 inline w-3 h-3" />
                  סרטון · {formatClock(video.durationMs)} · {video.variants.length} רזולוציות
                </span>
              )}
            </div>
            <ol className="max-h-64 space-y-2 overflow-y-auto pl-1">
              {post.posts.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-zinc-300">
                  <span className="mt-0.5 shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">{i + 1}</span>
                  <span dir="auto" className="whitespace-pre-wrap">{p}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* 2 · video → Hebrew subtitles */}
      {video && (
        <PreviewErrorBoundary label="עיבוד הסרטון" resetKeys={[video.variants[0]?.url ?? '', cues.length]}>
          <div className="dash-card p-6">
            <span className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-zinc-400">
              <Subtitles className="w-3.5 h-3.5" /> סרטון → כתוביות בעברית
            </span>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
              {/* source player, with the live Hebrew track attached */}
              <div className="space-y-2">
                {playback && (
                  <video
                    key={playback.url}
                    src={playback.url}
                    poster={video.poster || undefined}
                    controls
                    playsInline
                    crossOrigin="anonymous"
                    className="w-full rounded-lg border border-white/10 bg-black"
                  >
                    {vttUrl && <track kind="subtitles" srcLang="he" label="עברית" src={vttUrl} default />}
                  </video>
                )}
                <p className="font-mono text-[11px] text-zinc-500" dir="ltr">
                  {playback ? `${playback.width}×${playback.height}` : '—'} · {formatClock(video.durationMs)}
                  {sourceLanguage && ` · source: ${sourceLanguage}`}
                </p>
              </div>

              <div className="min-w-0 space-y-3">
                <textarea
                  value={subsNotes}
                  onChange={(e) => setSubsNotes(e.target.value)}
                  placeholder="הנחיות תמלול אופציונליות: מונחים מקצועיים, שמות כלים, איך לתרגם ביטוי חוזר…"
                  dir="rtl"
                  rows={2}
                  className="w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => void runSubtitles()}
                    disabled={subsBusy || video.kind === 'animated_gif'}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-black disabled:opacity-40"
                  >
                    {subsBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                    {cues.length ? 'תמלל מחדש' : 'תמלל ותרגם לעברית'}
                  </button>
                  {cues.length > 0 && (
                    <>
                      <button
                        onClick={() => downloadBlob(new Blob([srt], { type: 'text/plain;charset=utf-8' }), `mrdaniel-x-${slugify(post.id, 'subs')}.he.srt`)}
                        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-white/10"
                      >
                        <Download className="w-3.5 h-3.5" /> SRT
                      </button>
                      <button
                        onClick={() => downloadBlob(new Blob([buildVtt(cues)], { type: 'text/vtt;charset=utf-8' }), `mrdaniel-x-${slugify(post.id, 'subs')}.he.vtt`)}
                        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-white/10"
                      >
                        <Download className="w-3.5 h-3.5" /> VTT
                      </button>
                    </>
                  )}
                </div>
                {video.kind === 'animated_gif' && (
                  <p className="text-[11px] text-zinc-500">הפוסט מכיל GIF מונפש ללא פס קול — אין מה לתמלל.</p>
                )}
                {subsBusy && (
                  <p className="text-[11px] text-sky-400/90">
                    מתמלל ומתרגם את הסרטון… זה יכול לקחת עד כדקה לכל 2 דקות וידאו.
                  </p>
                )}
                {subsError && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" /> {subsError}
                  </p>
                )}

                {/* cue table — every line editable, re-normalised on each edit */}
                {cues.length > 0 && (
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-black/30">
                    <table className="w-full text-[12px]">
                      <tbody>
                        {cues.map((cue, i) => (
                          <tr key={i} className="border-b border-white/5 last:border-0 align-top">
                            <td className="w-20 px-2 py-1.5 font-mono text-[10px] text-zinc-500" dir="ltr">
                              {formatClock(cue.startMs)}–{formatClock(cue.endMs)}
                            </td>
                            <td className="px-2 py-1.5">
                              {editingCue === i ? (
                                <textarea
                                  autoFocus
                                  value={cue.text.split('\n').join(' ')}
                                  onChange={(e) => updateCue(i, { text: e.target.value })}
                                  onBlur={() => setEditingCue(null)}
                                  dir="rtl"
                                  rows={2}
                                  className="w-full resize-y rounded border border-brand-500/40 bg-black/50 px-2 py-1 text-[12px] text-zinc-100"
                                />
                              ) : (
                                <button
                                  onClick={() => setEditingCue(i)}
                                  dir="rtl"
                                  className="w-full cursor-text whitespace-pre-wrap text-right leading-snug text-zinc-200 hover:text-white"
                                  title={cue.source ?? undefined}
                                >
                                  {cue.text}
                                </button>
                              )}
                            </td>
                            <td className="w-8 px-1 py-1.5">
                              <button
                                onClick={() => removeCue(i)}
                                title="מחק כתובית"
                                className="cursor-pointer text-zinc-600 hover:text-red-400"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* burn-in */}
            {cues.length > 0 && (
              <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                    <Film className="w-3.5 h-3.5" /> צריבת כתוביות לסרטון (MP4)
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {BURN_ASPECTS.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => { setBurnAspect(a.id); resetBurn(); }}
                        className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                          burnAspect === a.id ? 'bg-brand-500 text-black' : 'border border-white/10 bg-white/5 text-zinc-400'
                        }`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-400">
                    <input type="checkbox" checked={burnAudio} onChange={(e) => { setBurnAudio(e.target.checked); resetBurn(); }} className="w-3.5 h-3.5 accent-brand-500" />
                    שמור פס קול מקורי
                  </label>
                  {burnSupported && !clipTooLongToBurn ? (
                    <button
                      onClick={() => void runBurn()}
                      disabled={burning}
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-black disabled:opacity-50"
                    >
                      {burning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      {burnBlob ? 'צרוב מחדש' : 'צרוב כתוביות'}
                    </button>
                  ) : (
                    <span className="text-[11px] text-zinc-600">
                      {clipTooLongToBurn
                        ? `הסרטון ארוך מ-${MAX_BURN_SECONDS / 60} דקות — הורידו SRT וצרבו בעורך`
                        : 'צריבה בדפדפן לא נתמכת כאן — הורידו SRT'}
                    </span>
                  )}
                  {burnBlob && (
                    <button
                      onClick={() => downloadBlob(burnBlob, `mrdaniel-x-${slugify(post.id, 'video')}-he.mp4`)}
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-black"
                    >
                      <Download className="w-3.5 h-3.5" /> הורד MP4
                    </button>
                  )}
                </div>

                {burning && (
                  <>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-brand-500 transition-all duration-200" style={{ width: `${burnPct}%` }} />
                    </div>
                    <p className="mt-2 text-[11px] text-zinc-500">
                      {burnStage === 'download' && 'מוריד את הסרטון…'}
                      {burnStage === 'video' && 'צורב פריימים בזמן אמת — השאירו את הלשונית בחזית…'}
                      {burnStage === 'audio' && 'ממזג פס קול…'}
                      {burnStage === 'mux' && 'סוגר קובץ MP4…'}
                      {' · '}{burnPct}%
                    </p>
                  </>
                )}
                {burnError && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" /> {burnError}
                  </p>
                )}
                {burnUrl && !burning && (
                  <div className="flex flex-col items-center gap-2">
                    <video src={burnUrl} controls playsInline className="max-h-[420px] rounded-lg border border-white/10 bg-black" />
                    <p className="text-[11px] text-zinc-500">
                      כתוביות צרובות · {BURN_ASPECTS.find((a) => a.id === burnAspect)?.label} · {burnAudio ? 'עם פס קול' : 'ללא פס קול'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </PreviewErrorBoundary>
      )}

      {/* 3 · adapt */}
      <div className="dash-card p-6">
        <span className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-zinc-400">
          <Languages className="w-3.5 h-3.5" /> תרגום והתאמה לקרוסלה בעברית
        </span>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="הנחיות אופציונליות: זווית, קהל יעד, מה להדגיש או להשמיט…"
          dir="rtl"
          rows={2}
          className="mb-3 w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200"
        />

        <button
          onClick={() => void generate()}
          disabled={busy || `${post.text} ${transcript}`.trim().length < MIN_X_CHARS}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-black disabled:opacity-40"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          צור קרוסלה בעברית (10–12 שקופיות)
        </button>

        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-500">
          <Wand2 className="w-3.5 h-3.5 shrink-0 text-brand-400" />
          {transcript
            ? `תמלול הסרטון (${transcript.split(/\s+/).filter(Boolean).length} מילים) ייכנס לקרוסלה כהסבר שלב-אחר-שלב לצד טקסט הפוסט.`
            : 'עיצוב קריאייטור: רקע סלייט עמוק, כרטיסי זכוכית, מסגרות טרמינל לפרומפטים — אפס תמונות סטוק. הפיקו כתוביות קודם כדי שהקרוסלה תתבסס גם על מה שנאמר בסרטון.'}
        </p>
        {bgProgress && <p className="mt-3 text-[11px] text-sky-400/90">מכין נכסים לשקופיות… {bgProgress.done}/{bgProgress.total}</p>}
        {renderProgress && <p className="mt-2 text-[11px] text-sky-400/90">מרנדר שקופיות… {renderProgress.done}/{renderProgress.total}</p>}
        {error && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </p>
        )}
      </div>

      {/* 4 · preview + export */}
      {deck && (
        <PreviewErrorBoundary label="תצוגת הקרוסלה" resetKeys={[deck.createdAt, images.length, active]} onReset={() => setActive(0)}>
          <div className="dash-card p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <span className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-wider text-zinc-400">
                <Twitter className="w-3.5 h-3.5" /> {deck.slides.length} שקופיות ·{' '}
                <span className={deck.synthesized ? 'normal-case text-brand-400' : 'normal-case text-amber-400/80'}>
                  {deck.synthesized ? 'תורגם והותאם ע"י AI' : `גיבוי מקומי${deck.fallbackReason ? ` — ${deck.fallbackReason}` : ''}`}
                </span>
                {deck.topic && (
                  <span
                    className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 normal-case text-zinc-300"
                    title={deck.topic.signals.join(' · ') || 'לא זוהו אותות נושא'}
                  >
                    <Palette className="w-3 h-3 text-brand-400" />
                    {THEME_LABEL[deck.topic.theme] ?? deck.topic.theme}
                    <span dir="ltr" className="text-zinc-500">{deck.topic.badge}</span>
                    {deck.topic.guideSlug && <span dir="ltr" className="text-brand-400/80">/g/{deck.topic.guideSlug}</span>}
                  </span>
                )}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={copyCaption}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-white/10"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'הועתק ✓' : 'העתק כיתוב'}
                </button>
                <button
                  onClick={() => void exportZip()}
                  disabled={!images.length || busy}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-black disabled:opacity-50"
                >
                  <ImageIcon className="w-3.5 h-3.5" /> קרוסלה (ZIP · PNG)
                </button>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              {deck.slides.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${
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
                <div className="relative shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black" style={{ width: PREVIEW_W, height: PREVIEW_H }}>
                  {images[Math.min(active, images.length - 1)] ? (
                    <img src={images[Math.min(active, images.length - 1)]} alt={`שקופית ${active + 1}`} className="h-full w-full object-contain" />
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
                    {activeSlide.codeLang && <span>· {activeSlide.codeLang}</span>}
                    {slideRendering && <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <label className="flex min-w-[8rem] flex-1 flex-col gap-1">
                      <span className="text-[10px] font-bold text-zinc-500" dir="ltr">Badge (LTR)</span>
                      <input
                        value={activeSlide.badge ?? ''}
                        onChange={(e) => updateActiveSlide({ badge: e.target.value })}
                        dir="ltr"
                        placeholder="Gemini AI"
                        className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600"
                      />
                    </label>
                    <label className="flex min-w-[8rem] flex-1 flex-col gap-1">
                      <span className="text-[10px] font-bold text-zinc-500">קטגוריה (kicker)</span>
                      <input
                        value={activeSlide.kicker}
                        onChange={(e) => updateActiveSlide({ kicker: e.target.value })}
                        dir="rtl"
                        className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-zinc-200"
                      />
                    </label>
                  </div>

                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-zinc-500">כותרת ראשית</span>
                    <textarea
                      value={activeSlide.title}
                      onChange={(e) => updateActiveSlide({ title: e.target.value })}
                      dir="auto"
                      rows={2}
                      className="w-full resize-y rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm font-bold leading-snug text-white"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-zinc-500">תיאור / תת-כותרת</span>
                    <textarea
                      value={activeSlide.body}
                      onChange={(e) => updateActiveSlide({ body: e.target.value })}
                      dir="auto"
                      rows={3}
                      className="w-full resize-y rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm leading-relaxed text-zinc-300"
                    />
                  </label>

                  {activeSlide.bullets.length > 0 && (
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-zinc-500">נקודות (שורה לנקודה)</span>
                      <textarea
                        value={activeSlide.bullets.join('\n')}
                        onChange={(e) => updateActiveSlide({ bullets: e.target.value.split('\n') })}
                        dir="auto"
                        rows={Math.min(6, activeSlide.bullets.length + 1)}
                        className="w-full resize-y rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm leading-relaxed text-zinc-300"
                      />
                    </label>
                  )}

                  {(activeSlide.code || !activeSlide.promptBox) && (
                    <label className="flex flex-col gap-1">
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500">
                        <Code2 className="w-3 h-3 text-cyan-400" /> קטע קוד
                      </span>
                      <textarea
                        value={activeSlide.code}
                        onChange={(e) => updateActiveSlide({ code: e.target.value })}
                        dir="ltr"
                        rows={5}
                        placeholder="(ריק — אין קוד בשקופית זו)"
                        className="w-full resize-y overflow-x-auto rounded-lg border border-white/10 bg-black/50 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-300 placeholder:text-zinc-600"
                      />
                    </label>
                  )}
                  {activeSlide.promptBox !== undefined && (
                    <label className="flex flex-col gap-1">
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500">
                        <Code2 className="w-3 h-3 text-brand-400" /> פרומפט
                      </span>
                      <textarea
                        value={activeSlide.promptBox ?? ''}
                        onChange={(e) => updateActiveSlide({ promptBox: e.target.value })}
                        dir="auto"
                        rows={4}
                        className="w-full resize-y rounded-lg border border-white/10 bg-black/50 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-300"
                      />
                    </label>
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
                    className={`cursor-pointer overflow-hidden rounded-lg border transition-colors ${
                      active === i ? 'border-brand-500' : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <img src={img} alt={`תצוגה מקדימה ${i + 1}`} className="block w-full" />
                  </button>
                ))}
              </div>
            )}

            <QuickPublishBar
              text={caption}
              image={images[Math.min(active, images.length - 1)]}
              label="פרסום מהיר · קרוסלה מ-X"
              className="mt-5 justify-center"
            />

            <details className="mt-4">
              <summary className="cursor-pointer font-mono text-[11px] text-zinc-500">כיתוב + האשטגים</summary>
              <pre dir="rtl" className="mt-2 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-zinc-300">
                {caption}
              </pre>
            </details>

            {transcript && (
              <details className="mt-3">
                <summary className="cursor-pointer font-mono text-[11px] text-zinc-500">תמלול הסרטון בעברית</summary>
                <p dir="rtl" className="mt-2 rounded-lg border border-white/10 bg-black/40 p-3 text-[12px] leading-relaxed text-zinc-300">
                  {transcript}
                </p>
              </details>
            )}
          </div>
        </PreviewErrorBoundary>
      )}

      {!deck && !busy && (
        <div className="dash-card p-10 text-center text-sm leading-relaxed text-zinc-500">
          הדביקו קישור לפוסט ב-X — המערכת תמשוך את הטקסט, התמונות והסרטון. אם יש סרטון, אפשר לתמלל אותו,
          לתרגם את הדיבור לעברית, לערוך את הכתוביות ולצרוב אותן לתוך ה-MP4 (או להוריד SRT/VTT). במקביל
          נבנית קרוסלת לימוד של 10–12 שקופיות בעברית — גם על בסיס מה שנאמר בסרטון, לא רק טקסט הפוסט.
        </div>
      )}
    </div>
  );
}
