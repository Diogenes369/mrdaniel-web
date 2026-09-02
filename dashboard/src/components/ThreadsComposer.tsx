import { useMemo, useState } from 'react';
import { AtSign, Copy, Check, ExternalLink, ListOrdered, Square, Download } from 'lucide-react';
import { buildThreadsIntentUrl, copyAndOpen } from '../lib/socialPublish';
import { toThreadsSinglePost, toThreadsThread, THREADS_LIMIT } from '../lib/threadsFormatter';
import { downloadBrandedImage, THREADS_IMAGE_FILENAME } from '../lib/brandedImageDownload';

interface Props {
  /** the brand-synthesised caption / post text to reshape for Threads */
  text: string;
  /** the currently-active rendered branded preview image (data: URL or fetchable URL) — the
   *  publish flow silently downloads it for manual attachment, and an explicit button is shown. */
  image?: string;
  className?: string;
}

const THREADS_BTN_STYLE = { background: '#000', color: '#fff', border: '1px solid #3a3a3a' } as const;

/**
 * "Threads" output panel — reshapes the generated caption into a single ≤500-char post or a
 * numbered 3–5 post thread, with per-post copy + "copy & open Threads" (pre-fills the composer via
 * the `?text=` intent for the single post). Rendered collapsed inside QuickPublishBar so every
 * workspace (News Agent, Story Studio, Content Repurposer) gets it.
 */
export default function ThreadsComposer({ text, image, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'single' | 'thread'>('single');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const clean = (text || '').trim();
  const single = useMemo(() => toThreadsSinglePost(clean), [clean]);
  const thread = useMemo(() => toThreadsThread(clean), [clean]);

  if (!clean) return null;

  const flashCopied = (key: string) => {
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 2000);
  };
  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      flashCopied(key);
    } catch {
      /* clipboard blocked — text is visible for manual copy */
    }
  };
  /** Copy the caption + open Threads pre-filled, and — when a branded image is available — silently
   *  download the high-res PNG for manual attachment (Threads' web composer has no file intent). */
  const openThreads = async (key: string, value: string, prefill: boolean) => {
    const ok = await copyAndOpen(prefill ? buildThreadsIntentUrl(value) : 'https://www.threads.net/', value);
    if (image) downloadBrandedImage(image, THREADS_IMAGE_FILENAME);
    if (ok) flashCopied(key);
  };

  return (
    <div className={`w-full ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-500 hover:text-zinc-300 cursor-pointer"
      >
        <AtSign className="w-3.5 h-3.5" />
        {open ? 'הסתר עיצוב ל-Threads' : 'עיצוב ל-Threads (פוסט / שרשור)'}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-white/10 bg-black/30 p-3">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMode('single')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                  mode === 'single' ? 'bg-white text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                }`}
              >
                <Square className="w-3 h-3" /> פוסט בודד
              </button>
              <button
                onClick={() => setMode('thread')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                  mode === 'thread' ? 'bg-white text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                }`}
              >
                <ListOrdered className="w-3 h-3" /> שרשור ({thread.count})
              </button>
            </div>
            {image && (
              <button
                onClick={() => {
                  downloadBrandedImage(image, THREADS_IMAGE_FILENAME);
                  flashCopied('img');
                }}
                title="הורדת התמונה הממותגת הפעילה לצירוף ידני ב-Threads"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-zinc-200 text-[11px] font-bold cursor-pointer hover:bg-white/10"
              >
                {copiedKey === 'img' ? <Check className="w-3 h-3 text-brand-400" /> : <Download className="w-3 h-3" />}
                {copiedKey === 'img' ? 'ירד ✓' : 'הורד תמונה ממותגת (PNG)'}
              </button>
            )}
          </div>

          {mode === 'single' ? (
            <div className="rounded-lg border border-white/10 bg-black/40 p-3">
              <p className="text-[13px] text-zinc-200 leading-relaxed whitespace-pre-wrap">{single.text}</p>
              <div className="flex items-center justify-between gap-2 mt-2">
                <span className={`text-[10px] font-mono ${single.overLimit ? 'text-amber-400' : 'text-zinc-600'}`}>
                  {single.chars}/{THREADS_LIMIT}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => copy('single', single.text)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-zinc-200 text-[11px] font-bold cursor-pointer hover:bg-white/10"
                  >
                    {copiedKey === 'single' ? <Check className="w-3 h-3 text-brand-400" /> : <Copy className="w-3 h-3" />}
                    {copiedKey === 'single' ? 'הועתק ✓' : 'העתק'}
                  </button>
                  <button
                    onClick={() => openThreads('single-open', single.text, true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
                    style={THREADS_BTN_STYLE}
                  >
                    <ExternalLink className="w-3 h-3" /> העתק ופתח ב-Threads
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {thread.posts.map((p, i) => (
                <div key={i} className="rounded-lg border border-white/10 bg-black/40 p-3">
                  <p className="text-[13px] text-zinc-200 leading-relaxed whitespace-pre-wrap">{p}</p>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <span className={`text-[10px] font-mono ${p.length > THREADS_LIMIT ? 'text-amber-400' : 'text-zinc-600'}`}>
                      {p.length}/{THREADS_LIMIT}
                    </span>
                    <button
                      onClick={() => copy(`t-${i}`, p)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-zinc-200 text-[11px] font-bold cursor-pointer hover:bg-white/10"
                    >
                      {copiedKey === `t-${i}` ? <Check className="w-3 h-3 text-brand-400" /> : <Copy className="w-3 h-3" />}
                      {copiedKey === `t-${i}` ? 'הועתק ✓' : `העתק ${i + 1}`}
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[10px] text-zinc-600">העתיקו פוסט־פוסט לפי הסדר; הראשון פותח את השרשור.</span>
                <button
                  onClick={() => openThreads('thread-open', thread.posts[0] ?? single.text, true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
                  style={THREADS_BTN_STYLE}
                >
                  <ExternalLink className="w-3 h-3" /> פתח Threads עם הפוסט הראשון
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
