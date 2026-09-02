import { useEffect } from 'react';
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
 * Expanded article overlay — an Apple/cyber-styled modal opened from a card in the News Command
 * Center. Branded hi-res header image + gradient, executive-summary bullets, deep-dive body, a
 * topic-keyed "technical impact" analysis, and a prominent source-link CTA (opens in a new tab).
 * The enrichment is derived client-side in `lib/newsAnalysis.ts` (no LLM on the public page).
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

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto p-0 sm:p-6 md:p-10"
          style={{ background: 'rgba(3,5,8,0.78)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          role="dialog"
          aria-modal="true"
          aria-label={item.title}
        >
          <ModalBody item={item} onClose={onClose} />
        </motion.div>
      )}
    </AnimatePresence>
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
      initial={{ y: 30, opacity: 0, scale: 0.985 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 20, opacity: 0, scale: 0.985 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="relative my-0 w-full max-w-3xl overflow-hidden border border-white/12 bg-[#06080c] shadow-[0_40px_120px_rgba(0,0,0,0.7)] sm:rounded-3xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* sticky close — 44px touch target */}
      <button
        type="button"
        onClick={onClose}
        aria-label="סגירה"
        className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-20 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/50 text-zinc-200 backdrop-blur-md transition-colors hover:bg-black/80 hover:text-white"
      >
        <X className="h-5 w-5" />
      </button>

      {/* branded hi-res header image + overlay gradient */}
      <header className="relative aspect-[16/9] w-full overflow-hidden sm:aspect-[2/1]">
        <div className={`absolute inset-0 bg-gradient-to-bl ${t.grad} via-transparent to-transparent`} aria-hidden="true" />
        <Icon className="pointer-events-none absolute -bottom-6 -left-4 h-40 w-40 text-white/[0.06]" aria-hidden="true" />
        <NewsImage src={item.image} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#06080c] via-[#06080c]/55 to-transparent" aria-hidden="true" />

        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${t.ring}`}>
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#76B900]/45 bg-[#76B900]/12 px-2.5 py-1 text-[11px] font-bold text-[#9FE870]">
              <Radar className="h-3.5 w-3.5" /> ניתוח חמ״ל · MR. DANIEL Analysis
            </span>
          </div>
          <h2 dir="auto" className="font-display text-xl font-black leading-tight text-white sm:text-2xl md:text-[26px] [text-shadow:0_2px_18px_rgba(0,0,0,0.85)]">
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
    </motion.article>
  );
}
