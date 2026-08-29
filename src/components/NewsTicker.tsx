import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNewsFeed } from '../services/newsService';
import { prefersReducedMotion } from '../lib/gsap';

// Live headline marquee. Two placements share the same internals:
//   • placement="top"    — site-wide bar mounted in App.tsx, ABOVE the header, DESKTOP ONLY
//                          (`hidden md:block`). It carries `id="news-ticker-bar"` so Header can
//                          measure it and glue its own `top` to the bar's bottom edge.
//   • placement="inline" — MOBILE ONLY (`md:hidden`) card rendered back inside the homepage news
//                          section (CyberNewsGrid), where the ticker originally lived.
//
// The seamless marquee CSS lives in src/index.css (`.news-ticker*`): two identical `__group`s
// inside `__track`, the track translates left by exactly one group width and loops → no blank
// frames. The scroll duration there is deliberately slow so headlines are comfortable to read.

interface TickerRow {
  id: string;
  title: string;
  stamp: string;
  href: string;
}

// Shown while the feed is loading, empty, or errored — the ticker is never blank.
const FALLBACK_TICKER: TickerRow[] = [
  { id: 'fb-ai', title: 'סוכני AI בארגונים — מגמת האוטומציה שמשנה תהליכים עסקיים', stamp: 'עדכני', href: '/ai' },
  { id: 'fb-cy', title: 'אבטחת סייבר לעסקים קטנים ובינוניים: Zero-Trust כברירת מחדל', stamp: 'עדכני', href: '/cyber' },
  { id: 'fb-web', title: 'פיתוח Full-Stack מודרני — מהירות, נגישות וארכיטקטורה נקייה', stamp: 'עדכני', href: '/digital' },
  { id: 'fb-jarvis', title: 'מערכת JARVIS — ארכיטקטורת AI ארגונית אוטונומית מקצה לקצה', stamp: 'עדכני', href: '/jarvis' },
  { id: 'fb-data', title: 'ארכיטקטורת דאטה נכונה = החלטות מהירות ומוצר טוב יותר', stamp: 'עדכני', href: '/architecture' },
  { id: 'fb-mkt', title: 'קמפיינים דיגיטליים מבוססי דאטה — יותר לידים, פחות בזבוז', stamp: 'עדכני', href: '/digital' },
  { id: 'fb-cap', title: 'סקירת יכולות: מ-MVP ליזם ועד פלטפורמה ארגונית מלאה', stamp: 'עדכני', href: '/capabilities' },
];

/** "27/08 · 14:32" — publication date + exact time, shown next to every headline. */
function stampFor(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

export default function NewsTicker({ placement = 'top' }: { placement?: 'top' | 'inline' }) {
  const navigate = useNavigate();
  const { data: allItems } = useNewsFeed();
  const reduced = prefersReducedMotion();

  // Every item from the feed — no slicing/truncation, so the loop shows the full updated set —
  // sorted STRICT newest-first by publication date/time, so the absolute newest headline is the
  // first one visible when the marquee starts (applies to both placements: desktop top bar and
  // mobile in-section ticker).
  const rows: TickerRow[] = useMemo(() => {
    const ts = (iso: string) => {
      const t = new Date(iso).getTime();
      return Number.isNaN(t) ? -Infinity : t;
    };
    const mapped = [...(allItems ?? [])]
      .sort((a, b) => ts(b.publishedAt) - ts(a.publishedAt))
      .map((i) => ({
        id: i.id,
        title: i.title,
        stamp: stampFor(i.publishedAt),
        href: i.link,
      }));
    return mapped.length >= 4 ? mapped : FALLBACK_TICKER;
  }, [allItems]);

  const openRow = (href: string) => {
    if (href.startsWith('/')) navigate(href);
    else window.open(href, '_blank', 'noopener,noreferrer');
  };

  // BiDi-safe row. The marquee viewport is dir="ltr" (so the CSS translateX loop stays
  // predictable), so every row re-establishes its own context:
  //   • button  dir="rtl" + isolate — orders bullet → headline → stamp right-to-left and walls
  //     the row off from its neighbours in the LTR track (no cross-item scrambling).
  //   • title   dir="auto" + plaintext — base direction follows the content, so Hebrew headlines
  //     read RTL with English brand names / acronyms / numbers sitting correctly inline, and a
  //     rare English-first headline reads LTR.
  //   • stamp   dir="ltr" — "27.08 · 19:24" never flips; rendered as a subtle pill badge.
  const Item = ({ row }: { row: TickerRow }) => (
    <button
      type="button"
      onClick={() => openRow(row.href)}
      dir="rtl"
      className="group inline-flex items-center gap-2.5 leading-none text-[13px] md:text-sm text-zinc-300 hover:text-brand-300 transition-colors [unicode-bidi:isolate]"
    >
      <span className="text-brand-500 select-none" aria-hidden="true">•</span>
      <span dir="auto" className="whitespace-nowrap [unicode-bidi:plaintext]">
        {row.title}
      </span>
      {row.stamp && (
        <span
          dir="ltr"
          className="shrink-0 whitespace-nowrap rounded-full border border-brand-500/25 bg-brand-500/10 px-2 py-0.5 text-[10px] md:text-[11px] font-mono text-brand-300/90 group-hover:border-brand-400/40 [unicode-bidi:isolate]"
        >
          {row.stamp}
        </span>
      )}
    </button>
  );

  const isTop = placement === 'top';

  // Scale the loop time with how many headlines are in it (~6s per headline) so adding more feed
  // items keeps the on-screen reading pace comfortable instead of speeding the marquee up. The
  // CSS keyframe carries a static fallback duration.
  const animationDuration = `${Math.max(60, rows.length * 6)}s`;

  const wrapperClass = isTop
    ? 'news-ticker relative z-30 hidden md:block w-full border-b border-white/10 bg-carbon-950/95 backdrop-blur-sm pt-safe overflow-hidden'
    : 'news-ticker relative md:hidden mb-8 rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden';

  return (
    <div id={isTop ? 'news-ticker-bar' : undefined} className={wrapperClass}>
      {/* LIVE tag (RTL start = right) + gradient mask so items dissolve out from behind it */}
      <div className="absolute right-0 inset-y-0 z-20 flex items-center gap-2 pr-3 sm:pr-4 pl-10 bg-gradient-to-l from-carbon-950 via-carbon-950 to-transparent">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-400" />
        </span>
        <span className="text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-widest text-brand-300">
          Live
        </span>
      </div>
      {/* left fade */}
      <div className="pointer-events-none absolute left-0 inset-y-0 z-10 w-10 bg-gradient-to-r from-carbon-950 to-transparent" />

      {reduced ? (
        <div className="flex gap-7 overflow-hidden whitespace-nowrap py-2 pr-24 pl-4" dir="rtl">
          {rows.slice(0, 6).map((row) => (
            <span
              key={row.id}
              dir="rtl"
              className="inline-flex items-center gap-2.5 text-[13px] md:text-sm text-zinc-300 [unicode-bidi:isolate]"
            >
              <span className="text-brand-500 select-none" aria-hidden="true">•</span>
              <span dir="auto" className="truncate [unicode-bidi:plaintext]">{row.title}</span>
              {row.stamp && (
                <span
                  dir="ltr"
                  className="shrink-0 rounded-full border border-brand-500/25 bg-brand-500/10 px-2 py-0.5 text-[10px] md:text-[11px] font-mono text-brand-300/90 [unicode-bidi:isolate]"
                >
                  {row.stamp}
                </span>
              )}
            </span>
          ))}
        </div>
      ) : (
        <div className="news-ticker__viewport py-2" dir="ltr">
          <div className="news-ticker__track" style={{ animationDuration }}>
            {[0, 1].map((dup) => (
              <div className="news-ticker__group" key={dup} aria-hidden={dup === 1}>
                {rows.map((row) => (
                  <Item key={`${dup}-${row.id}`} row={row} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
