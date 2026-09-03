import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, ExternalLink, Clock, BookOpen, ListChecks, Radar, ShieldAlert, Sparkles, Cloud, Newspaper, type LucideIcon } from 'lucide-react';
import { formatRelativeTime, readingTimeMin, type NewsItem, type NewsTopic } from '../../services/newsService';
import { executiveSummary, deepDive, technicalImpact, sourceDomain } from '../../lib/newsAnalysis';
import NewsImage from './NewsImage';

const TOPIC: Record<NewsTopic, { label: string; icon: LucideIcon; ring: string; grad: string }> = {
  cyber: { label: 'סייבר ואבטחת מידע', icon: ShieldAlert, ring: 'text-rose-300 border-rose-400/40 bg-rose-500/10', grad: 'from-rose-600/40' },
  ai: { label: 'בינה מלאכותית ואוטומציה', icon: Sparkles, ring: 'text-violet-300 border-violet-400/40 bg-violet-500/10', grad: 'from-violet-600/40' },
  cloud: { label: 'פיתוח ותשתיות', icon: Cloud, ring: 'text-sky-300 border-sky-400/40 bg-sky-500/10', grad: 'from-sky-600/40' },
  general: { label: 'חדשות שוק וטכנולוגיה', icon: Newspaper, ring: 'text-zinc-300 border-white/20 bg-white/5', grad: 'from-zinc-500/30' },
};

/**
 * Expanded article overlay — an Apple/cyber-styled modal opened from a news card (homepage section
 * or /news).
 *
 * ROOT-CAUSE POSITIONING FIX: rendered through a React portal into `document.body`. The news
 * sections live inside ancestors that carry `transform` / `will-change` (Framer Motion, the
 * DepthSection 3D plane, GSAP), and any transformed ancestor turns `position: fixed` into
 * `position: absolute` relative to itself — which is why the modal used to open offset down the
 * page. Portaling to `<body>` (no transform) makes `fixed` strictly viewport-relative again.
 *
 * Fixed full-viewport backdrop, the card is viewport-CENTERED and capped so the image + title are
 * visible immediately; the body scrolls inside (Lenis-exempt). Close via the top-right X, Escape,
 * or a backdrop click. `body` scroll is locked while open.
 */
export default function ArticleModal({ item, onClose }: { item: NewsItem | null; onClose: () => void }) {
  useEffect(() => {
    if (!item) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [item, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-4 md:p-6"
          // Close only when the click lands on the backdrop itself, never on the card.
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          // Lenis (desktop smooth-scroll) hijacks `wheel` globally and scrolls `window`; opt the
          // whole overlay out so native overflow scroll works inside the modal.
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
  const t = TOPIC[item.topic] ?? TOPIC.general;
  const Icon = t.icon;
  const domain = sourceDomain(item.link);
  const bullets = executiveSummary(item);
  const paras = deepDive(item);
  const impact = technicalImpact(item);
  const mins = readingTimeMin(item.summary || item.excerpt);

  return (
    <motion.article
      initial={{ y: 24, opacity: 0, scale: 0.985 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 16, opacity: 0, scale: 0.985 }}
      transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-auto relative flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0B0F17] shadow-2xl sm:max-h-[88dvh] md:rounded-3xl"
    >
      {/* Prominent sticky close — pinned to the card frame, above the scrolling body. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="סגירה"
        className="absolute right-4 top-4 z-[10000] flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/60 text-white transition-all hover:bg-black/90"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Scrollable inner body — native wheel + touch scroll, Lenis-exempt, contained so it never
          bleeds to the backdrop/page. `body { overflow:hidden }` locks the page behind. */}
      <div
        data-lenis-prevent
        onWheel={(e) => e.stopPropagation()}
        className="pointer-events-auto min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.22)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20"
      >
        {/* branded hi-res header image + overlay gradient */}
        <header className="relative aspect-[16/9] w-full overflow-hidden sm:aspect-[2/1]">
          <div className={`absolute inset-0 bg-gradient-to-bl ${t.grad} via-transparent to-transparent`} aria-hidden="true" />
          <Icon className="pointer-events-none absolute -bottom-6 -left-4 h-40 w-40 text-white/[0.06]" aria-hidden="true" />
          <NewsImage src={item.image} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F17] via-[#0B0F17]/55 to-transparent" aria-hidden="true" />

          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${t.ring}`}>
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#76B900]/45 bg-[#76B900]/12 px-2.5 py-1 text-[11px] font-bold text-[#9FE870]">
                <Radar className="h-3.5 w-3.5" /> ניתוח חמ״ל · MR. DANIEL Analysis
              </span>
            </div>
            <h2 dir="auto" className="break-words font-display text-xl font-black leading-tight text-white sm:text-2xl md:text-[26px] [text-shadow:0_2px_18px_rgba(0,0,0,0.85)]">
              {item.title}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400" dir="rtl">
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
          </div>
        </header>

        <div className="space-y-8 p-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:p-7">
          {/* Executive summary */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-black uppercase tracking-wider text-brand-400">
              <ListChecks className="h-4 w-4" /> תקציר מנהלים
            </h3>
            <ul className="space-y-2.5">
              {bullets.map((b, i) => (
                <li key={i} dir="auto" className="flex gap-2.5 text-[14px] leading-relaxed text-zinc-200">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Deep dive */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-black uppercase tracking-wider text-brand-400">
              <Newspaper className="h-4 w-4" /> הכתבה המורחבת
            </h3>
            <div className="space-y-3.5">
              {paras.map((p, i) => (
                <p key={i} dir="auto" className="text-[14px] leading-relaxed text-zinc-300">
                  {p}
                </p>
              ))}
            </div>
          </section>

          {/* Technical impact */}
          <section className="rounded-2xl border border-[#22d3ee]/20 bg-[#22d3ee]/[0.04] p-4 sm:p-5">
            <h3 className="mb-1 flex items-center gap-2 font-display text-sm font-black uppercase tracking-wider text-[#67e8f9]">
              <Radar className="h-4 w-4" /> ניתוח טכנולוגי ומשמעויות
            </h3>
            <p className="mb-3 text-[13px] font-semibold text-zinc-300">{impact.headline}</p>
            <ul className="space-y-2.5">
              {impact.points.map((p, i) => (
                <li key={i} dir="auto" className="flex gap-2.5 text-[13.5px] leading-relaxed text-zinc-300">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#22d3ee]" aria-hidden="true" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Source CTA */}
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            data-track-interest={`news-modal:${item.topic}:${item.title}`}
            className="flex items-center justify-center gap-2 rounded-full border border-[#76B900]/50 bg-[#76B900]/12 px-5 py-3.5 text-center text-sm font-bold text-[#9FE870] transition-colors hover:border-[#76B900]/80 hover:bg-[#76B900]/20 hover:text-white"
          >
            לקריאת הכתבה המקורית באתר המקור
            <ExternalLink className="h-4 w-4" />
          </a>
          <p className="-mt-4 text-center text-[11px] text-zinc-600">
            התקציר והניתוח נערכים אוטומטית מתוך הסיקור המקורי · העובדות המלאות באתר המקור.
          </p>
        </div>
      </div>
    </motion.article>
  );
}
