import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, ExternalLink, Clock, BookOpen, ListChecks, Radar, Sparkles, BrainCircuit, Newspaper, Loader2, FileText, type LucideIcon } from 'lucide-react';
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
 * Expanded article overlay — an Apple-styled modal opened from a news card (homepage section
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
  // Page scroll lock is shared and reference-counted (see useBodyScrollLock) so an
  // overlay opened on top of another one cannot strand the page in a locked state.
  useBodyScrollLock(Boolean(item));

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
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
  // POST /api/news/analyze fetches the FULL article from the publisher and returns all three
  // sections. Until it lands (or if it fails) the summary and article fall back to the
  // deterministic teaser-based versions; the analysis has no fallback and is hidden on failure.
  const insights = useArticleInsights(item);
  const ai = insights.data;
  const bullets = ai?.executiveSummary.length ? ai.executiveSummary : executiveSummary(item);
  const paras = ai?.extendedArticle.length ? ai.extendedArticle : deepDive(item);
  const mins = readingTimeMin(ai ? `${ai.extendedArticle.join(' ')} ${ai.mrDanielAnalysis}` : item.summary || item.excerpt);

  return (
    <motion.article
      initial={{ y: 24, opacity: 0, scale: 0.985 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 16, opacity: 0, scale: 0.985 }}
      transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
      dir="rtl"
      className="pointer-events-auto relative flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0B0F17] text-right shadow-2xl sm:max-h-[88dvh] md:rounded-3xl"
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
          <NewsImage src={item.image} topic={item.topic} seed={item.id} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F17] via-[#0B0F17]/55 to-transparent" aria-hidden="true" />

          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${t.ring}`}>
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#76B900]/60 bg-[#76B900]/15 px-2.5 py-1 text-[11px] font-black text-[#B6F07A]">
                <Radar className="h-3.5 w-3.5" /> ניתוח חמ״ל · <span dir="ltr">MR. DANIEL Analysis</span>
              </span>
            </div>
            <h2
              dir="rtl"
              className="break-words text-right font-display text-xl font-black leading-tight text-white sm:text-2xl md:text-[26px] [text-shadow:0_2px_18px_rgba(0,0,0,0.85)]"
            >
              <RtlText>{item.title}</RtlText>
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

        <div dir="rtl" className="space-y-8 p-5 text-right pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:p-7">
          {/* Full-text status — tells the reader whether what follows came from the whole article. */}
          {(insights.isPending || ai) && (
            <p dir="rtl" className="-mb-4 flex items-center gap-2 text-right text-[11.5px] font-semibold text-zinc-500">
              {insights.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin text-[#9FE870]" aria-hidden="true" /> קורא את הכתבה המלאה מאתר המקור…</>
              ) : (
                <><FileText className="h-3.5 w-3.5 text-[#9FE870]" aria-hidden="true" /> {ai?.fullText ? 'נערך מתוך הטקסט המלא של הכתבה' : 'הכתבה המלאה לא הייתה זמינה — נערך מתוך תקציר המקור'}</>
              )}
            </p>
          )}

          {/* 01 — Executive summary */}
          <section dir="rtl" className="text-right" aria-busy={insights.isPending}>
            <SectionTitle index="01" icon={ListChecks}>תקציר מנהלים</SectionTitle>
            {/* Explicit RTL bullets: the marker is a flex sibling, so in a dir="rtl" row it sits on
                the RIGHT of the text and wrapped lines keep a clean hanging indent. The bullet is
                never part of the string itself (see `stripLeadingBullet`). */}
            <ul dir="rtl" className={`space-y-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-right transition-opacity sm:p-5 ${insights.isPending ? 'opacity-60' : ''}`}>
              {bullets.map((b, i) => (
                <li key={i} dir="rtl" className="flex gap-3 text-right text-[14.5px] leading-relaxed text-zinc-100">
                  <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1"><RtlText>{b}</RtlText></span>
                </li>
              ))}
            </ul>
          </section>

          {/* 02 — Extended article */}
          <section dir="rtl" className="text-right" aria-busy={insights.isPending}>
            <SectionTitle index="02" icon={Newspaper}>הכתבה המורחבת</SectionTitle>
            <div className={`space-y-4 border-r-2 border-white/10 pr-4 transition-opacity ${insights.isPending ? 'opacity-60' : ''}`}>
              {paras.map((p, i) => (
                <p key={i} dir="rtl" className="text-right text-[15px] leading-[1.85] text-zinc-300">
                  <RtlText>{p}</RtlText>
                </p>
              ))}
            </div>
          </section>

          {/* 03 — MR. DANIEL Analysis. Generated per article from the full text, never boilerplate:
              a skeleton while it loads, and the whole block disappears if generation fails. */}
          {(insights.isPending || ai?.mrDanielAnalysis) && (
            <section
              dir="rtl"
              className="relative overflow-hidden rounded-2xl border border-[#76B900]/35 bg-gradient-to-bl from-[#76B900]/[0.10] via-[#0B0F17] to-[#22d3ee]/[0.06] p-5 text-right shadow-[0_0_40px_-12px_rgba(118,185,0,0.45)] sm:p-6"
            >
              <Radar className="pointer-events-none absolute -left-6 -top-6 h-32 w-32 text-[#76B900]/[0.07]" aria-hidden="true" />
              <div className="relative mb-4 flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#76B900]/60 bg-[#76B900]/15 px-3.5 py-1.5 text-[12.5px] font-black tracking-wide text-[#B6F07A] shadow-[0_0_18px_-4px_rgba(118,185,0,0.6)]">
                  <span className="relative flex h-2 w-2" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#9FE870] opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#9FE870]" />
                  </span>
                  ניתוח חמ״ל · <span dir="ltr">MR. DANIEL Analysis</span>
                </span>
                <span className="font-mono text-[11px] font-bold text-zinc-500" dir="ltr">03</span>
              </div>

              {insights.isPending ? (
                <div className="relative space-y-2.5" aria-hidden="true">
                  {[96, 88, 92, 70].map((w, i) => (
                    <span key={i} className="block h-3 animate-pulse rounded bg-white/[0.08]" style={{ width: `${w}%` }} />
                  ))}
                </div>
              ) : (
                <div className="relative">
                  {ai?.headline && (
                    <p dir="rtl" className="mb-2.5 text-right font-display text-[16px] font-black leading-snug text-white">
                      <RtlText>{ai.headline}</RtlText>
                    </p>
                  )}
                  <p dir="rtl" className="text-right text-[15px] leading-[1.85] text-zinc-200">
                    <RtlText>{ai?.mrDanielAnalysis ?? ''}</RtlText>
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Source CTA */}
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            data-track-interest={`news-modal:${item.topic}:${item.title}`}
            dir="rtl"
            className="flex items-center justify-center gap-2 rounded-full border border-[#76B900]/50 bg-[#76B900]/12 px-5 py-3.5 text-center text-sm font-bold text-[#9FE870] transition-colors hover:border-[#76B900]/80 hover:bg-[#76B900]/20 hover:text-white"
          >
            לקריאת הכתבה המקורית באתר המקור
            <ExternalLink className="h-4 w-4" />
          </a>
          <p dir="rtl" className="-mt-4 text-center text-[11px] text-zinc-600">
            התקציר והניתוח נערכים אוטומטית מתוך הסיקור המקורי · העובדות המלאות באתר המקור.
          </p>
        </div>
      </div>
    </motion.article>
  );
}

function SectionTitle({ index, icon: Icon, children }: { index: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-right font-display text-sm font-black uppercase tracking-wider text-brand-400">
      <span className="font-mono text-[11px] font-bold text-zinc-600" dir="ltr">{index}</span>
      <Icon className="h-4 w-4" /> {children}
    </h3>
  );
}
