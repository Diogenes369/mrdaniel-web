import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, ExternalLink, Clock, BookOpen, ListChecks, Sparkles, BrainCircuit, Newspaper, FileText, type LucideIcon } from 'lucide-react';
import { formatRelativeTime, readingTimeMin, type NewsItem, type NewsTopic } from '../../services/newsService';
import { executiveSummary, deepDive, sourceDomain } from '../../lib/newsAnalysis';
import { useArticleInsights } from '../../services/newsInsightsService';
import NewsImage from './NewsImage';
import RtlText from './RtlText';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

const TOPIC: Record<NewsTopic, { label: string; icon: LucideIcon; ring: string; grad: string }> = {
  ai: { label: 'בינה מלאכותית ואוטומציה', icon: Sparkles, ring: 'text-violet-300 border-violet-400/40 bg-violet-500/10', grad: 'from-violet-600/40' },
  ai_models: { label: 'מודלי AI וחידושים', icon: BrainCircuit, ring: 'text-fuchsia-300 border-fuchsia-400/40 bg-fuchsia-500/10', grad: 'from-fuchsia-600/40' },
  ai_agents: { label: 'בינה מלאכותית ואוטומציה', icon: Sparkles, ring: 'text-violet-300 border-violet-400/40 bg-violet-500/10', grad: 'from-violet-600/40' },
  general: { label: 'חדשות שוק וטכנולוגיה', icon: Newspaper, ring: 'text-zinc-300 border-white/20 bg-white/5', grad: 'from-zinc-500/30' },
};

/**
 * Article overlay (redesigned 2026-09-23): as large as the viewport allows, laid out so the whole
 * summary and article are visible at once, and INSTANT — everything in it is either on the feed
 * item or precomputed in the background (src/server/articlePrecompute.ts) and already sitting in
 * memory from the idle prefetch. Opening it performs no request.
 *
 *   Desktop (lg+): ~95vw × 95dvh, two columns — media/title/source on one side, summary + article
 *   on the other. Type is sized with `clamp()` against the viewport HEIGHT, so a shorter screen
 *   gets smaller text rather than a scrollbar. The text column can still scroll as a safety net
 *   for an unusually long story; the layout is built so it normally doesn't need to.
 *   Mobile: full screen, a short image strip, one column. A phone cannot fit ~300 words without
 *   scrolling at a readable size, so there the target is "no wasted space", not "no scroll".
 *
 * The "ניתוח חמ״ל · MR. DANIEL Analysis" section was removed (2026-09-23), along with the per-click
 * analysis request that fed it.
 *
 * Portalled to <body> so no transformed ancestor can turn `position: fixed` into `absolute`.
 * Close: X, Escape, or a backdrop click. Focus moves into the dialog and back to the opener.
 */
export default function ArticleModal({ item, onClose }: { item: NewsItem | null; onClose: () => void }) {
  useBodyScrollLock(Boolean(item));

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md sm:p-[2.5dvh_2.5vw]"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          data-lenis-prevent
          role="dialog"
          aria-modal="true"
          aria-label={item.title}
        >
          <ModalBody item={item} onClose={onClose} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function ModalBody({ item, onClose }: { item: NewsItem; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });
    return () => opener?.focus({ preventScroll: true });
  }, []);

  const t = TOPIC[item.topic] ?? TOPIC.general;
  const Icon = t.icon;
  const domain = sourceDomain(item.link);
  // Precomputed in the background; undefined only if the agent has not reached this story yet.
  const ai = useArticleInsights(item);
  const bullets = ai?.executiveSummary.length ? ai.executiveSummary : executiveSummary(item);
  const paras = ai?.extendedArticle.length ? ai.extendedArticle : deepDive(item);
  const mins = readingTimeMin(ai ? ai.extendedArticle.join(' ') : item.summary || item.excerpt);
  const note = !ai ? 'נערך מתוך תקציר המקור' : ai.fullText ? 'נערך מתוך הטקסט המלא של הכתבה' : 'הכתבה המלאה לא הייתה זמינה — נערך מתוך תקציר המקור';

  return (
    <motion.article
      initial={{ y: 18, opacity: 0, scale: 0.99 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 12, opacity: 0, scale: 0.99 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      dir="rtl"
      className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#0B0F17] text-right shadow-2xl sm:h-[95dvh] sm:w-[95vw] sm:max-w-[1640px] sm:rounded-3xl sm:border sm:border-white/10 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="סגירה"
        className="absolute left-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white transition-colors hover:bg-black/90 sm:left-4 sm:top-4"
      >
        <X className="h-5 w-5" />
      </button>

      {/* ── Media + identity column ─────────────────────────────────────────────────────── */}
      <header className="relative flex shrink-0 flex-col lg:min-h-0 lg:border-l lg:border-white/10">
        <div className="relative h-[24dvh] w-full shrink-0 overflow-hidden sm:h-[30dvh] lg:h-auto lg:min-h-0 lg:flex-1">
          <div className={`absolute inset-0 bg-gradient-to-bl ${t.grad} via-transparent to-transparent`} aria-hidden="true" />
          <Icon className="pointer-events-none absolute -bottom-6 -left-4 h-40 w-40 text-white/[0.06]" aria-hidden="true" />
          <NewsImage key={item.image || ai?.image || 'none'} src={item.image || ai?.image} topic={item.topic} seed={item.id} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F17] via-[#0B0F17]/30 to-transparent" aria-hidden="true" />
        </div>

        <div className="relative -mt-10 px-5 pb-4 sm:px-7 lg:mt-0 lg:px-8 lg:pb-7 lg:pt-5">
          <span className={`mb-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${t.ring}`}>
            <Icon className="h-3.5 w-3.5" /> {t.label}
          </span>
          <h2 className="break-words font-display font-black leading-tight text-white [font-size:clamp(1.15rem,1rem+1.1dvh,2rem)] [text-shadow:0_2px_18px_rgba(0,0,0,0.85)]">
            <RtlText>{item.title}</RtlText>
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-400">
            <span dir="ltr" className="font-bold text-zinc-300">{item.source}</span>
            {domain && (
              <>
                <span aria-hidden="true">·</span>
                <span dir="ltr" className="font-mono text-zinc-500">{domain}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatRelativeTime(item.publishedAt)}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{mins} דק׳ קריאה</span>
          </div>

          {/* Source CTA — in this column on desktop so it never needs a scroll to reach. */}
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            data-track-interest={`news-modal:${item.topic}:${item.title}`}
            className="mt-5 hidden items-center justify-center gap-2 rounded-full border border-[#76B900]/50 bg-[#76B900]/12 px-5 py-3 text-sm font-bold text-[#9FE870] transition-colors hover:border-[#76B900]/80 hover:bg-[#76B900]/20 hover:text-white lg:flex"
          >
            לקריאת הכתבה המקורית באתר המקור
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </header>

      {/* ── Text column ────────────────────────────────────────────────────────────────── */}
      <div
        data-lenis-prevent
        onWheel={(e) => e.stopPropagation()}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.22)_transparent] sm:px-7 lg:flex lg:flex-col lg:px-10 lg:py-[4dvh]"
      >
        <p className="mb-4 flex items-center gap-2 text-[11.5px] font-semibold text-zinc-500">
          <FileText className="h-3.5 w-3.5 text-[#9FE870]" aria-hidden="true" /> {note}
        </p>

        <section className="mb-[2.5dvh]">
          <SectionTitle index="01" icon={ListChecks}>תקציר</SectionTitle>
          <ul className="space-y-[1.1dvh] rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5">
            {bullets.map((b, i) => (
              <li key={i} className="flex gap-3 leading-relaxed text-zinc-100 [font-size:clamp(0.9rem,0.72rem+0.62dvh,1.08rem)]">
                <span className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                <span className="min-w-0 flex-1"><RtlText>{b}</RtlText></span>
              </li>
            ))}
          </ul>
        </section>

        <section className="lg:flex-1">
          <SectionTitle index="02" icon={Newspaper}>הכתבה</SectionTitle>
          <div className="space-y-[1.4dvh] border-r-2 border-white/10 pr-4">
            {paras.map((p, i) => (
              <p key={i} className="leading-[1.8] text-zinc-300 [font-size:clamp(0.92rem,0.74rem+0.62dvh,1.1rem)]">
                <RtlText>{p}</RtlText>
              </p>
            ))}
          </div>
        </section>

        {/* Mobile / tablet source CTA — at the end of the text, where a phone reader arrives. */}
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          data-track-interest={`news-modal:${item.topic}:${item.title}`}
          className="mt-6 flex items-center justify-center gap-2 rounded-full border border-[#76B900]/50 bg-[#76B900]/12 px-5 py-3.5 text-sm font-bold text-[#9FE870] lg:hidden"
        >
          לקריאת הכתבה המקורית באתר המקור
          <ExternalLink className="h-4 w-4" />
        </a>
        <p className="mt-4 text-center text-[11px] text-zinc-600 lg:mt-auto lg:pt-4">
          התקציר נערך אוטומטית מתוך הסיקור המקורי · העובדות המלאות באתר המקור.
        </p>
      </div>
    </motion.article>
  );
}

function SectionTitle({ index, icon: Icon, children }: { index: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <h3 className="mb-[1.2dvh] flex items-center gap-2 font-display text-sm font-black uppercase tracking-wider text-brand-400">
      <span className="font-mono text-[11px] font-bold text-zinc-600" dir="ltr">{index}</span>
      <Icon className="h-4 w-4" /> {children}
    </h3>
  );
}
