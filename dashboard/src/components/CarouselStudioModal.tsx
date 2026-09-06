import { useCallback, useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  X, ChevronLeft, ChevronRight, Download, Copy, Check, Sparkles,
  AlertTriangle, Loader2, Send, Image as ImageIcon, Upload, Link2, Trash2,
  Palette, Type, LayoutGrid, ShieldCheck, Instagram, Newspaper, KeyRound,
} from 'lucide-react';
import {
  startCarousel, fetchJob, adjustCarousel, checkBridge, slideUrl, bridgeBase, STATUS_LABEL,
  fileToDataUrl, MAX_REFERENCE_BYTES, REFERENCE_ACCEPT, PALETTES, FONTS, TEMPLATES,
  bridgeToken, setBridgeToken,
  type ArticleInput, type CarouselJob, type BridgeHealth, type SlideCopy,
} from '../lib/carouselBridge';

/**
 * "Generate Designed Carousel with Hermes" — the visual slider modal.
 *
 * Hermes picks the concept, palette and per-slide composition on its own from the article; Daniel
 * only types an instruction if he wants to steer it. Slides come back already rendered with the
 * Hebrew handwriting overlay (Gveret Levin via scripts/render_hebrew_banner.py).
 *
 * The whole pipeline runs on the local carousel-bridge because Hermes and Pillow only exist on
 * this machine, so the modal opens with an explicit bridge-status gate rather than failing
 * mid-generation.
 */
export default function CarouselStudioModal({
  article,
  onClose,
}: {
  article: ArticleInput | null;
  onClose: () => void;
}) {
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [job, setJob] = useState<CarouselJob | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [slideCount, setSlideCount] = useState(4);
  const [instruction, setInstruction] = useState('');
  // Design reference: a screenshot Hermes studies for palette, typography and framing.
  const [reference, setReference] = useState<{ dataUrl: string; name: string } | null>(null);
  // Source URL: when set, the bridge extracts the page/post content and uses it as the copy source.
  const [sourceUrl, setSourceUrl] = useState('');
  // Pre-render editor: reviewed copy per slide, plus brand/typography controls.
  const [slideCopy, setSlideCopy] = useState<SlideCopy[]>([]);
  const [editing, setEditing] = useState(false);
  const [font, setFont] = useState<string>('opensans');
  const [palette, setPalette] = useState<string>('brand');
  const [template, setTemplate] = useState<number>(2);
  const [skipQa, setSkipQa] = useState(false);
  // 'rebrand' translates a source post 1:1 into unbranded Hebrew; 'article' synthesises new copy.
  const [mode, setMode] = useState<'article' | 'rebrand'>('article');
  // Bridge token lives in localStorage, never in the bundle. Editable here so the operator
  // never has to open a browser console to authenticate.
  const [tokenDraft, setTokenDraft] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [hasToken, setHasToken] = useState(() => Boolean(bridgeToken()));
  const [copied, setCopied] = useState(false);
  const [zipping, setZipping] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!article) return;
    void checkBridge().then(setHealth);
  }, [article]);

  // Poll while a job is in flight. Image generation is ~90s per slide, so this is a long poll.
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await fetchJob(jobId);
        if (cancelled) return;
        setJob(next);
        if (next.status === 'done' || next.status === 'error') {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'polling failed');
      }
    };
    void tick();
    pollRef.current = window.setInterval(tick, 3000);
    return () => {
      cancelled = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [jobId]);

  useEffect(() => {
    if (!article) {
      setJob(null);
      setJobId(null);
      setError(null);
      setActive(0);
      setInstruction('');
    }
  }, [article]);

  const begin = useCallback(async (override = '') => {
    if (!article) return;
    setStarting(true);
    setError(null);
    setJob(null);
    try {
      setJobId(await startCarousel(article, slideCount, {
        override,
        referenceImage: reference?.dataUrl,
        sourceUrl: sourceUrl.trim(),
        slideCopy: slideCopy.length ? slideCopy : undefined,
        font,
        palette,
        skipQa,
        mode,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'failed to start';
      setError(
        /x-bridge-token/i.test(msg)
          ? 'הגשר דחה את הבקשה: טוקן חסר או שגוי. הדביקו את BRIDGE_TOKEN מתוך carousel-bridge/.env בשדה שלמעלה.'
          : msg
      );
      if (/x-bridge-token/i.test(msg)) setHasToken(false);
    } finally {
      setStarting(false);
    }
  }, [article, slideCount, reference, sourceUrl, slideCopy, font, palette, skipQa, mode]);

  /** Seeds one editable entry per slide so copy can be reviewed before any image is generated. */
  const openEditor = useCallback(() => {
    if (!article) return;
    setSlideCopy(
      Array.from({ length: slideCount }, (_, i) => ({
        headline: i === 0 ? article.title : '',
        cards: Array.from({ length: template }, () => ''),
        footer: '',
      }))
    );
    setEditing(true);
  }, [article, slideCount, template]);

  const patchSlide = useCallback((i: number, patch: Partial<SlideCopy>) => {
    setSlideCopy((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }, []);

  const saveToken = useCallback(() => {
    const value = tokenDraft.trim();
    if (!value) return;
    setBridgeToken(value);
    setHasToken(true);
    setTokenSaved(true);
    setError(null);
    setTokenDraft('');
    window.setTimeout(() => setTokenSaved(false), 2000);
    void checkBridge().then(setHealth);
  }, [tokenDraft]);

  const pickReference = useCallback(async (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_REFERENCE_BYTES) {
      setError(`התמונה ${(file.size / 1e6).toFixed(1)}MB — המקסימום הוא 8MB`);
      return;
    }
    try {
      setError(null);
      setReference({ dataUrl: await fileToDataUrl(file), name: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not read the file');
    }
  }, []);

  const sendAdjustment = useCallback(async () => {
    if (!jobId || instruction.trim().length < 3) return;
    setStarting(true);
    setError(null);
    try {
      const next = await adjustCarousel(jobId, instruction.trim());
      setInstruction('');
      setJob(null);
      setActive(0);
      setJobId(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'adjustment failed');
    } finally {
      setStarting(false);
    }
  }, [jobId, instruction]);

  const postText = job?.post
    ? [job.post.body, (job.post.hashtags || []).join(' ')].filter(Boolean).join('\n\n')
    : '';

  const copyPost = async () => {
    if (!postText) return;
    try {
      await navigator.clipboard.writeText(postText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the text is visible for manual copy */
    }
  };

  const downloadZip = async () => {
    if (!job?.slides?.length) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      await Promise.all(
        job.slides.map(async (s) => {
          // Verify each response is really an image before zipping it. This previously bundled
          // whatever came back — when the bridge's auth gate 401'd the file route, the ZIP
          // silently contained four 52-byte JSON error bodies named slide_NN.png.
          const res = await fetch(slideUrl(s.url));
          if (!res.ok) throw new Error(`שקופית ${s.index + 1}: השרת החזיר ${res.status}`);
          const blob = await res.blob();
          if (!blob.type.startsWith('image/')) {
            throw new Error(`שקופית ${s.index + 1}: התקבל ${blob.type || 'תוכן לא מזוהה'} במקום תמונה`);
          }
          zip.file(`slide_${String(s.index + 1).padStart(2, '0')}.png`, blob);
        })
      );
      if (postText) zip.file('post.txt', postText);
      if (job.post?.altText) zip.file('alt.txt', job.post.altText);
      const out = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url;
      a.download = `carousel-${job.id}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'zip failed');
    } finally {
      setZipping(false);
    }
  };

  if (!article) return null;

  const busy = Boolean(job && job.status !== 'done' && job.status !== 'error') || starting;
  const slides = job?.slides ?? [];
  const current = slides[active];

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      dir="rtl"
    >
      <div className="relative flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0B0F17] text-right shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-400" />
            <h2 className="font-bold text-white">קרוסלה מעוצבת עם Hermes</h2>
          </div>
          <button onClick={onClose} aria-label="סגירה" className="cursor-pointer rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <p className="mb-4 line-clamp-2 text-sm text-zinc-400">{article.title}</p>

          {health && !health.ok && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[13px] text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-bold">הגשר המקומי לא רץ</p>
                <p className="mt-1 leading-relaxed text-amber-200/80">
                  Hermes ו-Pillow קיימים רק במחשב הזה. הריצו מתיקיית הפרויקט:
                  <code className="mx-1 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px]">node carousel-bridge/index.js</code>
                  ואז רעננו. כתובת: <span className="font-mono">{bridgeBase()}</span>
                </p>
              </div>
            </div>
          )}

          {health?.ok && health.adminSecret === false && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[13px] text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                הגשר רץ אך <span className="font-mono">ADMIN_API_SECRET</span> לא מוגדר — שלב הקופי יחזיר 401.
                הפעילו מחדש עם המשתנה מוגדר.
              </p>
            </div>
          )}

          {health?.ok && health.tokenRequired && !hasToken && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[12px] font-bold text-amber-200">
                <KeyRound className="h-3.5 w-3.5" /> נדרש טוקן גישה לגשר
              </p>
              <p className="mb-2 text-[11px] leading-relaxed text-amber-200/80">
                הגשר דורש אימות (הוא מריץ Hermes על המחשב שלכם והמנהרה פתוחה לאינטרנט).
                הדביקו את הערך של <span className="font-mono">BRIDGE_TOKEN</span> מתוך
                <span className="font-mono"> carousel-bridge/.env</span>. הוא נשמר בדפדפן הזה בלבד ולא נכלל בקוד האתר.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={tokenDraft}
                  onChange={(e) => setTokenDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveToken()}
                  placeholder="BRIDGE_TOKEN"
                  dir="ltr"
                  className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 font-mono text-[12px] text-white placeholder:text-zinc-600"
                />
                <button
                  onClick={saveToken}
                  disabled={tokenDraft.trim().length < 8}
                  className="cursor-pointer rounded-lg bg-brand-500 px-3 py-2 text-[12px] font-bold text-black disabled:opacity-40"
                >
                  {tokenSaved ? 'נשמר ✓' : 'שמירה'}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-[13px] text-rose-200">{error}</div>
          )}

          {!job && !starting && (
            <div className="mb-4 space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
              {/* Design reference — Hermes opens the file and mirrors its palette, type and framing. */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-zinc-300">
                  <Upload className="h-3.5 w-3.5 text-brand-400" />
                  צילום מסך כהשראה לעיצוב (אופציונלי)
                </label>
                {reference ? (
                  <div className="flex items-center gap-3 rounded-lg border border-brand-500/30 bg-brand-500/[0.06] p-2">
                    <img src={reference.dataUrl} alt="" className="h-14 w-14 rounded object-cover" />
                    <span className="flex-1 truncate text-[12px] text-zinc-300">{reference.name}</span>
                    <button
                      onClick={() => setReference(null)}
                      aria-label="הסרת ההשראה"
                      className="cursor-pointer rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-rose-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <input
                    type="file"
                    accept={REFERENCE_ACCEPT}
                    onChange={(e) => void pickReference(e.target.files?.[0] ?? null)}
                    className="w-full cursor-pointer rounded-lg border border-white/15 bg-black/40 p-2 text-[12px] text-zinc-400 file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-brand-500/20 file:px-3 file:py-1 file:text-[12px] file:font-bold file:text-brand-300"
                  />
                )}
                <p className="mt-1 text-[10px] text-zinc-500">
                  Hermes ינתח פלטה, טיפוגרפיה ומבנה מהתמונה ויחיל אותם על השקופיות. עד 8MB · PNG/JPEG/WebP.
                </p>
              </div>

              {/* Source URL — the bridge extracts the real content and uses it as the copy source. */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-zinc-300">
                  <Link2 className="h-3.5 w-3.5 text-brand-400" />
                  קישור לפוסט או לכתבה (אופציונלי)
                </label>
                <input
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://www.instagram.com/p/... או קישור לכתבה"
                  dir="ltr"
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-[12px] text-white placeholder:text-zinc-600"
                />
                <p className="mt-1 text-[10px] text-zinc-500">
                  אם מוזן, התוכן יישלף מהקישור וישמש כמקור לקופי במקום תקציר הכתבה שנבחרה.
                </p>
              </div>
            </div>
          )}

          {/* Mode: synthesise from an article, or translate an existing post 1:1. */}
          {!job && !starting && (
            <div className="mb-4 grid grid-cols-2 gap-2">
              {([
                { id: 'article', label: 'כתבה → קרוסלה', hint: 'ניסוח חדש מתוך כתבה', Icon: Newspaper },
                { id: 'rebrand', label: 'מיתוג מחדש לפוסט', hint: 'תרגום 1:1 והסרת מיתוג זר', Icon: Instagram },
              ] as const).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`cursor-pointer rounded-lg border p-2.5 text-right ${
                    mode === m.id
                      ? 'border-brand-500/60 bg-brand-500/10 text-white'
                      : 'border-white/10 text-zinc-400 hover:bg-white/5'
                  }`}
                >
                  <span className="mb-0.5 flex items-center gap-1.5 text-[12px] font-bold">
                    <m.Icon className="h-3.5 w-3.5" /> {m.label}
                  </span>
                  <span className="text-[10px] opacity-80">{m.hint}</span>
                </button>
              ))}
            </div>
          )}

          {!job && !starting && mode === 'rebrand' && (
            <div className="mb-4 rounded-lg border border-sky-400/25 bg-sky-500/[0.06] p-3 text-[11px] leading-relaxed text-zinc-300">
              <p className="mb-1 font-bold text-sky-300">מצב מיתוג מחדש</p>
              הטקסט מתורגם 1:1 לעברית — כל שלב, מספר וסדר נשמרים — וכל המיתוג הזר (שמות משתמש, לוגואים,
              "לינק בביו", קרדיטים, האשטגים של המקור) מוסר.
              {health?.instagramOEmbed ? (
                <span className="mt-1 block text-brand-300">
                  oEmbed מוגדר — קישורי אינסטגרם ציבוריים נקראים אוטומטית.
                </span>
              ) : (
                <span className="mt-1 block text-amber-200">
                  אינסטגרם חוסמת שליפת תוכן מקישור. העתיקו והדביקו את כיתוב הפוסט ישירות לתיבת הטקסט,
                  או הגדירו INSTAGRAM_OEMBED_TOKEN בגשר לקריאה אוטומטית של פוסטים ציבוריים.
                </span>
              )}
            </div>
          )}

          {/* Brand, typography and layout controls. */}
          {!job && !starting && (
            <div className="mb-4 grid gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-zinc-300">
                  <Palette className="h-3.5 w-3.5 text-brand-400" /> פלטת מותג
                </label>
                <div className="space-y-1">
                  {PALETTES.map((pal) => (
                    <button
                      key={pal.id}
                      onClick={() => setPalette(pal.id)}
                      className={`flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] ${
                        palette === pal.id
                          ? 'border-brand-500/60 bg-brand-500/10 text-white'
                          : 'border-white/10 text-zinc-400 hover:bg-white/5'
                      }`}
                    >
                      <span className="flex gap-0.5">
                        {pal.swatch.map((c) => (
                          <span key={c} className="h-3.5 w-3.5 rounded-sm border border-white/20" style={{ background: c }} />
                        ))}
                      </span>
                      {pal.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-zinc-300">
                  <Type className="h-3.5 w-3.5 text-brand-400" /> גופן
                </label>
                <select
                  value={font}
                  onChange={(e) => setFont(e.target.value)}
                  className="w-full cursor-pointer rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-[12px] text-white"
                >
                  {FONTS.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={!skipQa}
                    onChange={(e) => setSkipQa(!e.target.checked)}
                    className="accent-brand-500"
                  />
                  בדיקת QA ויזואלית
                </label>
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-zinc-300">
                  <LayoutGrid className="h-3.5 w-3.5 text-brand-400" /> פריסת שקופית
                </label>
                <div className="grid grid-cols-2 gap-1">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTemplate(t.id)}
                      title={t.hint}
                      className={`cursor-pointer rounded-lg border p-1.5 text-[10px] leading-tight ${
                        template === t.id
                          ? 'border-brand-500/60 bg-brand-500/10 text-white'
                          : 'border-white/10 text-zinc-400 hover:bg-white/5'
                      }`}
                    >
                      <span className="mb-1 flex justify-center gap-0.5">
                        {Array.from({ length: t.id }).map((_, i) => (
                          <span key={i} className="h-4 w-2.5 rounded-[2px] border border-current opacity-70" />
                        ))}
                      </span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Pre-render slide editor — review and edit every line before any image is generated. */}
          {!job && !starting && editing && (
            <div className="mb-4 space-y-3">
              {slideCopy.map((sl, i) => (
                <div key={i} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <p className="mb-2 text-[11px] font-bold text-brand-400">שקופית {i + 1}</p>
                  <input
                    value={sl.headline}
                    onChange={(e) => patchSlide(i, { headline: e.target.value })}
                    placeholder="כותרת ראשית"
                    dir="rtl"
                    className="mb-1.5 w-full rounded border border-white/15 bg-black/40 px-2 py-1.5 text-[12px] text-white placeholder:text-zinc-600"
                  />
                  {sl.cards.map((c, ci) => (
                    <input
                      key={ci}
                      value={c}
                      onChange={(e) =>
                        patchSlide(i, { cards: sl.cards.map((v, vi) => (vi === ci ? e.target.value : v)) })
                      }
                      placeholder={`תוכן כרטיס ${ci + 1}`}
                      dir="rtl"
                      className="mb-1.5 w-full rounded border border-white/15 bg-black/40 px-2 py-1.5 text-[12px] text-white placeholder:text-zinc-600"
                    />
                  ))}
                  <input
                    value={sl.footer}
                    onChange={(e) => patchSlide(i, { footer: e.target.value })}
                    placeholder="שורת סיכום בבאנר התחתון"
                    dir="rtl"
                    className="w-full rounded border border-white/15 bg-black/40 px-2 py-1.5 text-[12px] text-white placeholder:text-zinc-600"
                  />
                </div>
              ))}
            </div>
          )}

          {!job && !starting && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-[13px] text-zinc-400">
                מספר שקופיות
                <select
                  value={slideCount}
                  onChange={(e) => setSlideCount(Number(e.target.value))}
                  className="mr-2 cursor-pointer rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-white"
                >
                  {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <button
                onClick={() => void begin()}
                disabled={!health?.ok}
                className="flex cursor-pointer items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ImageIcon className="h-4 w-4" />
                {mode === 'rebrand' ? 'תרגם ומתג מחדש' : 'צור קרוסלה ויזואלית'}
              </button>
              <button
                onClick={editing ? () => setEditing(false) : openEditor}
                className="cursor-pointer rounded-lg border border-white/15 px-3 py-2 text-sm font-bold text-zinc-200 hover:bg-white/5"
              >
                {editing ? 'סגירת העורך' : 'עריכת טקסטים לפני רינדור'}
              </button>
              <span className="text-[11px] text-zinc-500">Hermes בוחר קונספט והרכב; הטקסט תמיד שלכם</span>
            </div>
          )}

          {busy && (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="h-7 w-7 animate-spin text-brand-400" />
              <p className="text-sm font-bold text-zinc-200">{job ? STATUS_LABEL[job.status] : 'מתחיל'}…</p>
              {job?.progress?.total ? (
                <>
                  <div className="h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all duration-500"
                      style={{ width: `${Math.round((job.progress.done / job.progress.total) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    {job.progress.done}/{job.progress.total} שקופיות · כ-90 שניות לשקופית
                  </p>
                </>
              ) : null}
              {job?.concept && <p className="max-w-md text-center text-[12px] text-zinc-400">{job.concept}</p>}
            </div>
          )}

          {job?.status === 'done' && current && (
            <>
              <div className="relative mb-3 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                <img src={slideUrl(current.url)} alt={current.headline || `שקופית ${active + 1}`} className="mx-auto max-h-[46dvh] w-auto" />
                {slides.length > 1 && (
                  <>
                    <button
                      onClick={() => setActive((i) => (i - 1 + slides.length) % slides.length)}
                      aria-label="הקודם"
                      className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-black/70 p-2 text-white hover:bg-black"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => setActive((i) => (i + 1) % slides.length)}
                      aria-label="הבא"
                      className="absolute left-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-black/70 p-2 text-white hover:bg-black"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                  </>
                )}
              </div>

              {current?.qa && !current.qa.skipped && (
                <div
                  className={`mb-2 flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] ${
                    current.qa.pass
                      ? 'border-brand-500/30 bg-brand-500/10 text-brand-300'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                  }`}
                >
                  <ShieldCheck className="h-3 w-3" />
                  {current.qa.pass ? 'QA ויזואלי: עבר' : `QA ויזואלי: ${current.qa.note || 'נמצאו חריגות'}`}
                  {job.qaRetries ? ` · ${job.qaRetries} תיקון` : ''}
                </div>
              )}

              {job.rebrand && (
                <div className="mb-2 rounded border border-sky-400/25 bg-sky-500/[0.06] p-2 text-[10px] text-zinc-300">
                  <span className="font-bold text-sky-300">מיתוג שהוסר: </span>
                  {job.rebrand.removed.length ? job.rebrand.removed.join(' · ') : 'לא נמצא מיתוג זר'}
                  <span className="opacity-70"> · {job.rebrand.sourceChars} תווי מקור</span>
                </div>
              )}

              {(job.usedReference || job.imported || job.typography) && (
                <div className="mb-3 flex flex-wrap gap-1.5 text-[10px]">
                  {job.usedReference && (
                    <span className="rounded border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-brand-300">
                      עוצב לפי צילום ההשראה
                    </span>
                  )}
                  {job.imported && (
                    <span className="rounded border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-sky-300">
                      מקור: {job.imported.source || 'קישור'} · {job.imported.chars} תווים
                    </span>
                  )}
                  {job.typography && (
                    <span className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-zinc-400">
                      {job.typography}
                    </span>
                  )}
                  {job.layout && (
                    <span className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-zinc-400">
                      {job.layout}
                    </span>
                  )}
                </div>
              )}

              <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
                {slides.map((s, i) => (
                  <button
                    key={s.index}
                    onClick={() => setActive(i)}
                    aria-label={`שקופית ${i + 1}`}
                    className={`h-14 w-9 cursor-pointer overflow-hidden rounded border transition-all ${
                      i === active ? 'border-brand-500 ring-1 ring-brand-500/50' : 'border-white/15 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={slideUrl(s.url)} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  onClick={() => void downloadZip()}
                  disabled={zipping}
                  className="flex cursor-pointer items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
                >
                  {zipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  הורדת כל השקופיות (ZIP)
                </button>
                <button
                  onClick={() => void copyPost()}
                  disabled={!postText}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm font-bold text-zinc-200 hover:bg-white/5 disabled:opacity-40"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'הועתק ✓' : 'העתק טקסט לפוסט'}
                </button>
              </div>

              {postText && (
                <textarea
                  readOnly
                  dir="rtl"
                  rows={7}
                  value={postText}
                  className="mb-3 w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[13px] leading-relaxed text-zinc-200"
                />
              )}
              {job.post?.altText && (
                <p className="mb-4 rounded-lg border border-sky-400/25 bg-sky-500/[0.06] p-2 text-[11px] leading-relaxed text-zinc-300">
                  <span className="font-bold text-sky-300">ALT: </span>{job.post.altText}
                </p>
              )}

              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <p className="mb-2 text-[12px] font-bold text-zinc-300">רוצים לכוון את Hermes אחרת?</p>
                <div className="flex gap-2">
                  <input
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void sendAdjustment()}
                    placeholder="למשל: פלטה כחולה קרירה, פחות דמויות, יותר מרחב ריק למעלה"
                    dir="rtl"
                    className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-[13px] text-white placeholder:text-zinc-600"
                  />
                  <button
                    onClick={() => void sendAdjustment()}
                    disabled={instruction.trim().length < 3}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand-500/50 px-3 py-2 text-[13px] font-bold text-brand-400 hover:bg-brand-500/10 disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" /> עדכן
                  </button>
                </div>
              </div>
            </>
          )}

          {job?.status === 'error' && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-[13px] text-rose-200">
              <p className="font-bold">הייצור נכשל</p>
              <p className="mt-1 font-mono text-[11px] leading-relaxed">{job.error}</p>
              <button onClick={() => void begin()} className="mt-2 cursor-pointer rounded-lg border border-white/20 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-white/10">
                נסו שוב
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
