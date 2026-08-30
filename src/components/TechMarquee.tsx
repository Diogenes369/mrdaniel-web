import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ShieldHalf,
  Server,
  TerminalSquare,
  Grid3x3,
  KeyRound,
  Radar,
  ScanEye,
  Braces,
  Atom,
  Plug,
  CandlestickChart,
  type LucideIcon,
} from 'lucide-react';
import { prefersReducedMotion } from '../lib/gsap';

/**
 * "Arsenal" — infinite tech-stack marquee with hover/tap detail popovers.
 *
 * Loop: identical to the live news ticker (`.tech-marquee__*` / `.news-ticker__*` in index.css) —
 * two identical `__group`s inside `__track`, translate left by exactly one group width, loop → no
 * seam. Duration scales with item count.
 *
 * Popover: the marquee viewport is `overflow-x: clip`, so the detail card is rendered through a
 * portal to <body> with `position: fixed`, positioned from the hovered chip's rect — it can never
 * be clipped by the viewport or its edge mask. While a popover is open (`data-tt="open"`) the
 * marquee animation is paused so the anchor chip stays put.
 *
 * Pure CSS animation, `touch-action: pan-y` on the viewport — a vertical swipe over the band always
 * scrolls the page on mobile.
 */

interface Tech {
  name: string;
  icon: LucideIcon;
  detail: string;
}

const STACK: Tech[] = [
  {
    name: 'Fortinet',
    icon: ShieldHalf,
    detail: 'חומות אש ארגוניות (FortiGate), ניתוב VLAN, SSL-VPN וניהול איומים מאוחד (UTM).',
  },
  {
    name: 'Entra ID / AD',
    icon: KeyRound,
    detail: 'ניהול זהויות, היררכיית Domain Controllers, אוטומציית GPO ו-SSO היברידי.',
  },
  {
    name: 'Microsoft 365',
    icon: Grid3x3,
    detail: 'ניהול טננט ענן ארגוני, זרימת דואר ב-Exchange Online, אבטחת Defender ותאימות.',
  },
  {
    name: 'PowerShell',
    icon: TerminalSquare,
    detail: 'סקריפטי אוטומציה מתקדמים, הרצה מרחוק ב-WinRM, תזמור מערכות ומיפוי כונני NAS.',
  },
  {
    name: 'Windows Server',
    icon: Server,
    detail: 'תשתית דומיין ליבה, סנכרון PDC, ניהול DNS/DHCP והקשחת שרתים.',
  },
  {
    name: 'Cyber 2.0',
    icon: Radar,
    detail: 'הגנת קצה מבוססת מצבי הגנה, מניעת בידוד רשת וגישת Zero-Trust.',
  },
  {
    name: 'ESET PROTECT',
    icon: ScanEye,
    detail: 'זיהוי ותגובה בקצה מנוהלים בענן, מדיניות אנטי-תוכנה זדונית ומודיעין איומים יזום.',
  },
  {
    name: 'Python',
    icon: Braces,
    detail: 'אוטומציה בהתאמה אישית, צנרות RAG, סוכנים אוטונומיים ואינטגרציות MCP.',
  },
  {
    name: 'React',
    icon: Atom,
    detail: 'אפליקציות ווב מהירות, חוויית משתמש רספונסיבית ועיצוב Frontend מודרני.',
  },
  {
    name: 'Claude MCP',
    icon: Plug,
    detail: 'חיבור סוכני AI לכלים ולמערכות דרך פרוטוקול MCP — סטנדרטי, מאובטח וקל לתחזוקה.',
  },
  {
    name: 'MetaTrader 5',
    icon: CandlestickChart,
    detail: 'פיתוח בוטים (EA) בהתאמה אישית, הרצה אוטומטית ב-M1 וכתיבת אסטרטגיות שוק.',
  },
];

interface ActiveTip {
  tech: Tech;
  x: number; // viewport px — horizontal centre of the anchor chip
  y: number; // viewport px — top or bottom edge of the anchor chip
  placement: 'top' | 'bottom';
  pinned: boolean; // set on click/tap; ignores mouseleave until dismissed
}

const TIP_HALF_WIDTH = 150;

export default function TechMarquee() {
  const reduced = prefersReducedMotion();
  const [tip, setTip] = useState<ActiveTip | null>(null);
  const pinnedRef = useRef(false);
  pinnedRef.current = tip?.pinned ?? false;

  // ~5s of travel per item, matching the news ticker's "scale the loop with its contents" rule.
  const animationDuration = `${Math.max(48, STACK.length * 5)}s`;

  const openTip = useCallback((el: HTMLElement, tech: Tech, pinned: boolean) => {
    const r = el.getBoundingClientRect();
    const placement: 'top' | 'bottom' = r.top > 168 ? 'top' : 'bottom';
    setTip({
      tech,
      x: Math.min(Math.max(r.left + r.width / 2, TIP_HALF_WIDTH + 10), window.innerWidth - TIP_HALF_WIDTH - 10),
      y: placement === 'top' ? r.top : r.bottom,
      placement,
      pinned,
    });
  }, []);

  const closeTip = useCallback(() => {
    pinnedRef.current = false;
    setTip(null);
  }, []);

  // Dismiss a pinned tip on outside pointer / Escape / scroll / resize (a scroll or resize would
  // desync the fixed-position anchor from the chip).
  useEffect(() => {
    if (!tip) return;
    const onPointer = (e: PointerEvent) => {
      if (!(e.target as HTMLElement)?.closest?.('[data-tech-chip]')) closeTip();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeTip();
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', closeTip, { passive: true });
    window.addEventListener('resize', closeTip);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', closeTip);
      window.removeEventListener('resize', closeTip);
    };
  }, [tip, closeTip]);

  const Chip = ({ tech, dup }: { tech: Tech; dup: number }) => {
    const Icon = tech.icon;
    return (
      <button
        type="button"
        data-tech-chip
        aria-label={`${tech.name} — ${tech.detail}`}
        onMouseEnter={(e) => !pinnedRef.current && openTip(e.currentTarget, tech, false)}
        onMouseLeave={() => !pinnedRef.current && setTip(null)}
        onFocus={(e) => openTip(e.currentTarget, tech, false)}
        onBlur={() => !pinnedRef.current && setTip(null)}
        onClick={(e) => {
          const isSame = tip?.tech.name === tech.name && tip.pinned;
          if (isSame) closeTip();
          else openTip(e.currentTarget, tech, true);
        }}
        className="inline-flex items-center gap-2.5 rounded-xl border border-brand-500/20 bg-white/[0.04] backdrop-blur-md px-4 py-2.5 md:px-5 md:py-3 text-[1.05rem] md:text-[1.3rem] font-bold tracking-tight text-white shadow-[0_1px_12px_rgba(0,0,0,0.35)] transition-all duration-200 hover:scale-[1.06] hover:border-brand-400/50 hover:bg-white/[0.08] focus-visible:scale-[1.06] focus-visible:outline-none focus-visible:border-brand-400/70 focus-visible:ring-2 focus-visible:ring-brand-400/40"
      >
        <Icon className="w-5 h-5 md:w-[22px] md:h-[22px] text-brand-400 shrink-0" aria-hidden="true" strokeWidth={2.2} />
        {tech.name}
        <span className="sr-only">{dup === 1 ? ' (עותק)' : ''}</span>
      </button>
    );
  };

  return (
    <section className="relative py-14 md:py-20 border-t border-white/5 overflow-x-clip cv-auto">
      <div className="container-wide relative z-10">
        <p className="text-center text-xs md:text-sm font-mono font-bold uppercase tracking-[0.25em] text-zinc-500 mb-8">
          הארסנל הטכנולוגי — Infrastructure · Security · AI · Automation
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
          data-tt={tip ? 'open' : undefined}
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

      {/* Portal popover — escapes `overflow-x: clip` + the edge mask entirely. */}
      {createPortal(
        <AnimatePresence>
          {tip && (
            <motion.div
              key={tip.tech.name}
              role="tooltip"
              initial={{ opacity: 0, scale: 0.94, y: tip.placement === 'top' ? 6 : -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.1 } }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              dir="rtl"
              className="pointer-events-none fixed z-[95] w-[300px] max-w-[calc(100vw-24px)] rounded-2xl border border-brand-500/25 bg-carbon-900/95 backdrop-blur-md p-4 text-right shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
              style={{
                left: tip.x,
                top: tip.placement === 'top' ? tip.y - 12 : tip.y + 12,
                transform: `translateX(-50%) translateY(${tip.placement === 'top' ? '-100%' : '0'})`,
              }}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <tip.tech.icon className="w-4 h-4 text-brand-400 shrink-0" aria-hidden="true" />
                <strong className="font-display text-sm font-bold text-brand-300">{tip.tech.name}</strong>
              </div>
              <p className="text-[13px] leading-relaxed text-zinc-300">{tip.tech.detail}</p>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </section>
  );
}
