import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ClipboardPaste,
  Code2,
  Copy,
  Download,
  FileCode2,
  ImagePlus,
  Loader2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  componentFileName,
  componentImportLine,
  generateComponentFromScreenshots,
  readScreenshots,
  screenshotFilesFromClipboard,
  MAX_SCREENSHOTS,
  type Screenshot,
  type ScreenshotCodeResult,
  type ScreenshotVariant,
} from '../lib/screenshotCodeApi';
import { highlightCode, TOKEN_PALETTE } from '../lib/syntaxHighlight';

/**
 * "מסך לקוד" — upload or paste a screenshot / design mock, get back a React + Tailwind component.
 *
 * The prompt strategy is ported from abi/screenshot-to-code (see
 * `src/server/agents/screenshotCodeAgent.ts` for what was kept and what was replaced); this panel is
 * only the operator surface for it. Paste is the primary input path, not the drop zone: the real
 * workflow is Win+Shift+S then Ctrl+V, and an operator who has to save the capture to disk first
 * will use the tool half as often.
 */

/** Past this, per-token spans stop being worth the DOM and the code renders as plain text. A
 *  generated component is normally 150-400 lines, so this only trips on an outlier. */
const MAX_HIGHLIGHT_LINES = 800;

function prettyBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
}

/** Read-only code view with line numbers. Uses the studio's existing canvas highlighter, so this
 *  adds no syntax-highlighting dependency to the dashboard bundle. */
function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const lines = useMemo(() => code.split('\n'), [code]);
  const tokens = useMemo(
    () => (lines.length <= MAX_HIGHLIGHT_LINES ? highlightCode(code, lang) : null),
    [code, lang, lines.length]
  );

  return (
    <div dir="ltr" className="max-h-[32rem] overflow-auto rounded-xl border border-white/10 bg-black/40 text-[12.5px] leading-[1.55] font-mono">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className="align-top">
              <td className="select-none w-12 pe-3 ps-3 text-end text-zinc-600 tabular-nums sticky start-0 bg-black/40">{i + 1}</td>
              <td className="pe-4 py-px whitespace-pre-wrap break-words text-zinc-200">
                {tokens
                  ? (tokens[i] ?? []).map((t, j) => (
                      <span key={j} style={{ color: TOKEN_PALETTE[t.color] }}>
                        {t.text}
                      </span>
                    ))
                  : line}
                {line === '' ? ' ' : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Copy-to-clipboard button that confirms in place for two seconds. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => setCopied(true));
      }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-200 text-xs font-bold cursor-pointer hover:bg-white/10"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'הועתק' : label}
    </button>
  );
}

export default function ScreenshotToCode() {
  const [shots, setShots] = useState<Screenshot[]>([]);
  const [variant, setVariant] = useState<ScreenshotVariant>('tsx');
  const [componentName, setComponentName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScreenshotCodeResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pasteHint, setPasteHint] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (files: ArrayLike<File>) => {
    setError(null);
    const room = MAX_SCREENSHOTS - shots.length;
    if (room <= 0) {
      setError(`הגעתם לתקרה של ${MAX_SCREENSHOTS} צילומי מסך בבקשה אחת.`);
      return;
    }
    const added = await readScreenshots(files, room);
    if (!added.length) {
      setError('לא זוהתה תמונה תקינה בקבצים שנבחרו.');
      return;
    }
    setShots((prev) => [...prev, ...added].slice(0, MAX_SCREENSHOTS));
  }, [shots.length]);

  // Paste is the primary input path. Bound to the window rather than to a focused element so
  // Ctrl+V works the moment the tab is open, without the operator hunting for a click target.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = screenshotFilesFromClipboard(e);
      if (!files.length) return;
      e.preventDefault();
      setPasteHint(true);
      setTimeout(() => setPasteHint(false), 1200);
      void addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  const generate = async () => {
    if (!shots.length || busy) return;
    setBusy(true);
    setError(null);
    const res = await generateComponentFromScreenshots({
      screenshots: shots,
      instructions,
      componentName,
      variant,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.retryable ? `${res.error} (אפשר לנסות שוב)` : res.error);
      return;
    }
    setResult(res.result);
  };

  const download = () => {
    if (!result) return;
    const blob = new Blob([result.code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = componentFileName(result);
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalBytes = shots.reduce((sum, s) => sum + s.bytes, 0);

  return (
    <div className="space-y-5">
      {/* 1 · input */}
      <div className="dash-card p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
            <ImagePlus className="w-3.5 h-3.5" /> צילום מסך / מוקאפ עיצוב → קומפוננטת React + Tailwind
          </span>
          {shots.length > 0 && (
            <button
              onClick={() => {
                setShots([]);
                setResult(null);
                setError(null);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300 text-xs font-bold cursor-pointer hover:bg-white/10"
            >
              <Trash2 className="w-3.5 h-3.5" /> נקה / התחל מחדש
            </button>
          )}
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer?.files?.length) void addFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors ${
            dragOver || pasteHint ? 'border-brand-500 bg-brand-500/10' : 'border-white/15 bg-black/20 hover:border-white/25'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <ClipboardPaste className="w-6 h-6 text-zinc-400" />
          <p className="text-zinc-200 text-sm font-bold">הדביקו צילום מסך (Ctrl+V), גררו לכאן, או לחצו לבחירת קובץ</p>
          <p className="text-zinc-500 text-xs">
            PNG / JPEG / WebP · עד {MAX_SCREENSHOTS} מסכים בבקשה אחת · כמה מסכים של אותו מוצר יאוחדו לקומפוננטה אחת עם ניווט פנימי
          </p>
        </div>

        {shots.length > 0 && (
          <>
            <div className="flex flex-wrap gap-3 mt-4">
              {shots.map((s, i) => (
                <div key={s.id} className="relative group">
                  <img
                    src={s.dataUrl}
                    alt={`צילום מסך ${i + 1}: ${s.name}`}
                    className="h-28 w-auto max-w-[14rem] object-cover rounded-lg border border-white/10 bg-black/30"
                  />
                  <span className="absolute top-1 start-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-mono text-zinc-300">
                    {i + 1} · {prettyBytes(s.bytes)}
                  </span>
                  <button
                    onClick={() => setShots((prev) => prev.filter((p) => p.id !== s.id))}
                    aria-label={`הסר צילום מסך ${i + 1}`}
                    className="absolute top-1 end-1 p-1 rounded bg-black/70 text-zinc-300 opacity-0 group-hover:opacity-100 cursor-pointer hover:text-red-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-zinc-500 text-[11px] mt-2 font-mono">
              {shots.length} מסכים · {prettyBytes(totalBytes)} יישלחו למודל
            </p>
          </>
        )}
      </div>

      {/* 2 · options */}
      <div className="dash-card p-6 space-y-4">
        <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
          <Code2 className="w-3.5 h-3.5" /> הגדרות פלט
        </span>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-zinc-400 text-xs mb-1.5">שפת הקומפוננטה</label>
            <div className="flex gap-2">
              {(['tsx', 'jsx'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVariant(v)}
                  className={`px-4 py-2 rounded-lg border text-xs font-bold cursor-pointer transition-colors ${
                    variant === v
                      ? 'border-brand-500 bg-brand-500/15 text-white'
                      : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  {v === 'tsx' ? 'TypeScript (.tsx)' : 'JavaScript (.jsx)'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="stc-name" className="block text-zinc-400 text-xs mb-1.5">
              שם הקומפוננטה (אופציונלי)
            </label>
            <input
              id="stc-name"
              dir="ltr"
              value={componentName}
              onChange={(e) => setComponentName(e.target.value)}
              placeholder="PricingSection"
              className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-zinc-100 text-sm font-mono outline-none focus:border-brand-500"
            />
          </div>
        </div>

        <div>
          <label htmlFor="stc-notes" className="block text-zinc-400 text-xs mb-1.5">
            הנחיות נוספות (אופציונלי)
          </label>
          <textarea
            id="stc-notes"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            placeholder="למשל: להפוך את הסרגל הצדדי לנפתח/נסגר, להשתמש בירוק המותגי, לשמור על RTL"
            className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-zinc-100 text-sm outline-none focus:border-brand-500 resize-y"
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => void generate()}
            disabled={!shots.length || busy}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 text-black text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {busy ? 'מנתח את המסך ובונה קומפוננטה…' : 'המר לקוד React + Tailwind'}
          </button>
          {busy && <span className="text-zinc-500 text-xs">הקריאה הזו יכולה לקחת עד דקה וחצי — אל תסגרו את הטאב.</span>}
        </div>

        {error && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* 3 · output */}
      {result && (
        <div className="dash-card p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
              <FileCode2 className="w-3.5 h-3.5" /> {componentFileName(result)}
              {result.model && <span className="text-zinc-600">· {result.model}</span>}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <CopyButton text={componentImportLine(result)} label="העתק שורת import" />
              <CopyButton text={result.code} label="העתק קוד" />
              <button
                onClick={download}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-200 text-xs font-bold cursor-pointer hover:bg-white/10"
              >
                <Download className="w-3.5 h-3.5" /> הורד קובץ
              </button>
            </div>
          </div>

          {result.summary && <p className="text-zinc-300 text-sm leading-relaxed">{result.summary}</p>}

          {result.recovered && (
            <p className="text-amber-300/90 text-xs">
              המודל החזיר קוד גולמי במקום מבנה JSON — הקוד עצמו תקין, אבל התקציר ורשימת התמונות עשויים להיות חסרים.
            </p>
          )}

          {result.placeholders.length > 0 && (
            <div>
              <p className="text-zinc-400 text-xs mb-1.5">תמונות placeholder שצריך להחליף בנכסים אמיתיים:</p>
              <ul dir="ltr" className="space-y-1">
                {result.placeholders.map((url) => (
                  <li key={url} className="text-[11px] font-mono text-zinc-500 break-all">
                    {url}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <CodeBlock code={result.code} lang={result.variant === 'tsx' ? 'ts' : 'js'} />
        </div>
      )}
    </div>
  );
}
