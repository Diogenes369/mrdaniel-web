import { useState } from 'react';
import { Rocket, Check, AtSign } from 'lucide-react';
import { SOCIAL_TARGETS, copyAndOpen, type SocialPlatform, type SocialTarget } from '../lib/socialPublish';
import { downloadBrandedImage, THREADS_IMAGE_FILENAME } from '../lib/brandedImageDownload';
import ThreadsComposer from './ThreadsComposer';

interface Props {
  /** The caption / post text copied to the clipboard when a button is clicked. */
  text: string;
  /** The currently-active rendered branded preview image (data: URL). When present, publishing to
   *  Threads also silently downloads it (PNG) for manual attachment. */
  image?: string;
  /** Optional heading override. */
  label?: string;
  className?: string;
}

/**
 * "פרסום מהיר" bar — shown alongside every generated carousel / story / post. Each button copies
 * the caption to the clipboard AND opens that platform's web creation flow in a new tab. For
 * Threads it also pre-fills the composer (`?text=`) and downloads the branded card PNG.
 */
export default function QuickPublishBar({ text, image, label = 'פרסום מהיר', className = '' }: Props) {
  const [copiedFor, setCopiedFor] = useState<SocialPlatform | null>(null);
  const clean = (text || '').trim();

  const go = async (t: SocialTarget) => {
    // Threads accepts a `?text=` intent param → pre-fill the composer; others just open + clipboard.
    const url = t.intent && clean ? t.intent(clean) : t.url;
    const ok = await copyAndOpen(url, clean);
    // Threads has no file-attach intent → hand the operator the branded PNG to attach manually.
    if (t.id === 'threads' && image) downloadBrandedImage(image, THREADS_IMAGE_FILENAME);
    if (ok) {
      setCopiedFor(t.id);
      window.setTimeout(() => setCopiedFor((c) => (c === t.id ? null : c)), 2200);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-500">
        <Rocket className="w-3.5 h-3.5" /> {label}
      </span>
      {SOCIAL_TARGETS.map((t) => (
        <button
          key={t.id}
          onClick={() => void go(t)}
          disabled={!clean}
          title={`העתקת הטקסט + פתיחת ${t.label} בלשונית חדשה`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-40 transition-transform active:scale-95"
          style={t.style}
        >
          {copiedFor === t.id ? <Check className="w-3.5 h-3.5" /> : t.id === 'threads' ? <AtSign className="w-3.5 h-3.5" /> : null}
          {copiedFor === t.id ? 'הועתק ✓' : t.label}
        </button>
      ))}
      {!clean && <span className="text-[10px] text-zinc-600">— צרו תוכן כדי להפעיל</span>}
      {clean && <ThreadsComposer text={clean} image={image} className="mt-1" />}
    </div>
  );
}
