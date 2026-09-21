import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Sparkles, BrainCircuit, Eye, MessageSquare, Zap, Cpu, Plug, Database, Braces, Atom, X, type LucideIcon } from 'lucide-react';
import { prefersReducedMotion } from '../lib/gsap';
import PopHeadline from './home/PopHeadline';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

/**
 * "Arsenal" — infinite tech-stack marquee with detail popovers.
 *
 * Loop: the exact news-ticker model (`.tech-marquee__*` / `.news-ticker__*` in index.css) — two
 * identical `__group`s inside `__track`, a CSS keyframe translates the track left by exactly one
 * group width (`translateX(0 → -50%)`, `linear`) and loops. The gap between the two groups equals
 * the in-group gap, so the reset point is seamless — no gap, no jump. Duration scales with the
 * item count for a consistent per-item speed on every device.
 *
 * Detail popover:
 *   - Desktop (>= 768px): hover / focus shows a small card positioned next to the badge, portaled
 *     to <body> so `overflow-x: clip` on the viewport can't clip it. Click pins it.
 *   - Mobile (< 768px): tap opens a CENTERED modal (`fixed inset-0`, dark blurred backdrop, X
 *     button, tap-backdrop / Esc to dismiss, body scroll locked). No attempt to anchor near the
 *     moving badge.
 *
 * `touch-action: pan-y` on the track + `overflow-x: clip` viewport → a vertical swipe over the
 * band always scrolls the page on Android / iOS.
 */

interface Tech {
  name: string;
  icon: LucideIcon;
  detail: string;
}

const STACK: Tech[] = [
  { name: 'Grok', icon: Sparkles, detail: 'המודל של xAI: חד, עדכני ומחובר לזרם של X. משמש אצלי לניסוח קרוסלות ושרשורים.' },
  { name: 'Claude', icon: BrainCircuit, detail: 'מודל חזק לכתיבה ארוכה, לקוד ולעבודה עם כלים. בסיס טוב לסוכנים שמריצים משימות מרובות צעדים.' },
  { name: 'Gemini', icon: Eye, detail: 'מודל רב-מודלי של Google: קורא תמונות, וידאו ואודיו. משמש לתמלול, לקריאת שקפים ולהקראה.' },
  { name: 'GPT', icon: MessageSquare, detail: 'משפחת המודלים של OpenAI, כולל gpt-oss הפתוח שרץ אצלי דרך Groq לטקסט מהיר.' },
  { name: 'Groq', icon: Zap, detail: 'תשתית Inference מהירה במיוחד למודלים פתוחים. כאן רץ רוב הטקסט באתר.' },
  { name: 'Ollama', icon: Cpu, detail: 'הרצת מודלים מקומיים על המחשב, בלי שהמידע יוצא החוצה. טוב למבנה, JSON ותרגום.' },
  { name: 'Claude MCP', icon: Plug, detail: 'חיבור סוכני AI לכלים ולמערכות דרך פרוטוקול MCP: סטנדרטי וקל לתחזוקה.' },
  { name: 'RAG', icon: Database, detail: 'שליפה מתוך המסמכים שלכם לפני שהמודל עונה, כדי שהתשובה תישען על מקור ולא על ניחוש.' },
  { name: 'Python', icon: Braces, detail: 'אוטומציה בהתאמה אישית, צנרות RAG, סוכנים אוטונומיים ואינטגרציות MCP.' },
  { name: 'React Three Fiber', icon: Atom, detail: 'ממשקים תלת-ממדיים בדפדפן, כמו חדר הבקרה שמציג את הסוכנים שלי בזמן אמת.' },
];

interface Anchor {
  x: number; // viewport px — horizontal centre of the badge
  y: number; // viewport px — top or bottom edge of the badge
  placement: 'top' | 'bottom';
}

const POP_HALF_WIDTH = 150;

/**
 * Glass pill, ultra-minimal. The previous chip was a heavy card — 1.3rem extra-bold text, a solid
 * `bg-white/[0.05]` block, a brand-tinted border and a permanent double drop-shadow — which read as
 * eleven competing buttons rather than one calm band. This is a hairline-bordered, blurred pill
 * that is nearly invisible at rest and lights brand-green only on hover/focus. No resting glow, no
 * scale bounce: the only motion in the band is the scroll itself.
 */
const CHIP_CLASS =
  'tech-pill group inline-flex items-center gap-2.5 rounded-full border border-white/10 backdrop-blur-md ' +
  'px-5 py-2.5 md:px-6 md:py-3 font-mono text-[0.8rem] md:text-[0.9rem] font-medium tracking-wide ' +
  'whitespace-nowrap text-zinc-300 transition-all duration-300 ' +
  'hover:border-[#00FF66]/50 hover:text-[#00FF66] hover:shadow-[0_0_15px_rgba(0,255,102,0.2)] ' +
  'focus-visible:outline-none focus-visible:border-[#00FF66]/50 ' +
  'focus-visible:text-[#00FF66] focus-visible:shadow-[0_0_15px_rgba(0,255,102,0.2)]';

export default function TechMarquee() {
  const reduced = prefersReducedMotion();

  const [active, setActive] = useState<Tech | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [pinned, setPinned] = useState(false);
  const pinnedRef = useRef(false);
  pinnedRef.current = pinned;

  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  // Page scroll lock is shared and reference-counted (see useBodyScrollLock) so an
  // overlay opened on top of another one cannot strand the page in a locked state.
  useBodyScrollLock(Boolean(active) && isMobile);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // ~5s of travel per item, matching the news ticker's "scale the loop with its contents" rule.
  const animationDuration = `${Math.max(48, STACK.length * 5)}s`;

  const close = useCallback(() => {
    pinnedRef.current = false;
    setActive(null);
    setAnchor(null);
    setPinned(false);
  }, []);

  const open = useCallback((el: HTMLElement, tech: Tech, pin: boolean) => {
    if (window.matchMedia('(max-width: 767px)').matches) {
      setActive(tech);
      setAnchor(null);
      setPinned(true); // mobile is always a pinned modal
      return;
    }
    const r = el.getBoundingClientRect();
    const placement: 'top' | 'bottom' = r.top > 168 ? 'top' : 'bottom';
    setAnchor({
      x: Math.min(Math.max(r.left + r.width / 2, POP_HALF_WIDTH + 10), window.innerWidth - POP_HALF_WIDTH - 10),
      y: placement === 'top' ? r.top : r.bottom,
      placement,
    });
    setActive(tech);
    setPinned(pin);
  }, []);

  // Desktop: dismiss a pinned popover on outside pointer / Escape / scroll / resize (scroll or
  // resize desyncs the fixed-position anchor from the badge).
  useEffect(() => {
    if (!active || isMobile) return;
    const onPointer = (e: PointerEvent) => {
      if (!(e.target as HTMLElement)?.closest?.('[data-tech-chip]')) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close);
      window.removeEventListener('resize', close);
    };
  }, [active, isMobile, close]);

  // Mobile modal: lock body scroll + Escape to close.
  useEffect(() => {
    if (!active || !isMobile) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [active, isMobile, close]);

  const Chip = ({ tech, dup }: { tech: Tech; dup: number }) => {
    const Icon = tech.icon;
    return (
      <button
        type="button"
        data-tech-chip
        aria-label={`${tech.name} — ${tech.detail}`}
        onMouseEnter={(e) => !isMobile && !pinnedRef.current && open(e.currentTarget, tech, false)}
        onMouseLeave={() => !isMobile && !pinnedRef.current && close()}
        onFocus={(e) => !isMobile && open(e.currentTarget, tech, false)}
        onBlur={() => !isMobile && !pinnedRef.current && close()}
        onClick={(e) => {
          if (active?.name === tech.name && pinned) close();
          else open(e.currentTarget, tech, true);
        }}
        className={CHIP_CLASS}
      >
        <Icon
          className="h-4 w-4 shrink-0 text-zinc-500 transition-colors duration-300 group-hover:text-[#00FF66] group-focus-visible:text-[#00FF66]"
          aria-hidden="true"
          strokeWidth={1.75}
        />
        {tech.name}
        {dup === 1 && <span className="sr-only"> (עותק)</span>}
      </button>
    );
  };

  return (
    <section className="relative py-20 md:py-28 overflow-x-clip cv-auto">
      <div className="container-wide relative z-10 mb-10 text-center md:mb-14">
        <PopHeadline lead="הסטאק" accent="שמפעיל את כל זה" className="mb-3 md:mb-4" />
        <p className="font-mono text-[11px] md:text-xs font-bold uppercase tracking-[0.3em] text-zinc-500">
          Infrastructure · Security · AI · Automation
        </p>
      </div>

      {reduced ? (
        <div className="container-wide flex flex-wrap justify-center gap-3">
          {STACK.map((tech) => (
            <Chip key={tech.name} tech={tech} dup={0} />
          ))}
        </div>
      ) : (
        <div
          className="tech-marquee tech-marquee__viewport"
          data-tt={active ? 'open' : undefined}
          dir="ltr"
          aria-label="רשימת טכנולוגיות בשימוש"
        >
          <div className="tech-marquee__track" style={{ animationDuration }}>
            {[0, 1].map((dup) => (
              <div className="tech-marquee__group" key={dup} aria-hidden={dup === 1}>
                {STACK.map((tech) => (
                  <Chip key={`${dup}-${tech.name}`} tech={tech} dup={dup} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Portal — escapes `overflow-x: clip` + the edge mask entirely. */}
      {createPortal(
        <AnimatePresence>
          {active && isMobile && (
            <motion.div
              key="tech-modal"
              className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={close}
              dir="rtl"
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label={active.name}
                initial={{ opacity: 0, scale: 0.92, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.12 } }}
                transition={{ type: 'spring', damping: 24, stiffness: 240 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-[90vw] sm:max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border border-brand-500/25 bg-carbon-900 p-6 pt-14 text-right shadow-[0_30px_80px_rgba(0,0,0,0.8)]"
              >
                <button
                  type="button"
                  onClick={close}
                  aria-label="סגירה"
                  className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white transition-colors hover:border-brand-400/60 hover:text-brand-300"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-300">
                    <active.icon className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <strong className="font-display text-lg font-extrabold text-white">{active.name}</strong>
                </div>
                <p className="text-[15px] leading-relaxed text-zinc-300">{active.detail}</p>
              </motion.div>
            </motion.div>
          )}

          {active && !isMobile && anchor && (
            <motion.div
              key="tech-pop"
              role="tooltip"
              initial={{ opacity: 0, scale: 0.94, y: anchor.placement === 'top' ? 6 : -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.1 } }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              dir="rtl"
              className="pointer-events-none fixed z-[95] w-[300px] max-w-[calc(100vw-24px)] rounded-2xl border border-brand-500/25 bg-carbon-900/95 backdrop-blur-md p-4 text-right shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
              style={{
                left: anchor.x,
                top: anchor.placement === 'top' ? anchor.y - 12 : anchor.y + 12,
                transform: `translateX(-50%) translateY(${anchor.placement === 'top' ? '-100%' : '0'})`,
              }}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <active.icon className="w-4 h-4 text-brand-400 shrink-0" aria-hidden="true" />
                <strong className="font-display text-sm font-bold text-brand-300">{active.name}</strong>
              </div>
              <p className="text-[13px] leading-relaxed text-zinc-300">{active.detail}</p>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </section>
  );
}
