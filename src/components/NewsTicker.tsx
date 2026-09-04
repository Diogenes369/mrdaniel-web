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

// The ticker is a "what's new TODAY" strip: it shows only items published within the last 24h.
// If that window is thin (a quiet news day, or the feed just cold-started), it falls back to the
// newest items overall so the marquee is never sparse — a short group would leave a visible gap
// mid-scroll in the seamless loop.
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_TODAY_ITEMS = 5;
const FALLBACK_ITEM_COUNT = 8;

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

  // TODAY only: sort the feed strict newest-first, keep the items from the last 24h. If that's
  // fewer than MIN_TODAY_ITEMS, widen to the newest items overall so the loop stays full. Never
  // truncate the "today" set — the marquee shows every fresh headline.
  const rows: TickerRow[] = useMemo(() => {
    const ts = (iso: string) => {
      const t = new Date(iso).getTime();
      return Number.isNaN(t) ? -Infinity : t;
    };
    const now = Date.now();
    const sorted = [...(allItems ?? [])].sort((a, b) => ts(b.publishedAt) - ts(a.publishedAt));
    const todays = sorted.filter((i) => {
      const t = ts(i.publishedAt);
      return t <= now + 60_000 && now - t <= DAY_MS;
    });
    const chosen = todays.length >= MIN_TODAY_ITEMS ? todays : sorted.slice(0, FALLBACK_ITEM_COUNT);
    const mapped = chosen.map((i) => ({
      id: i.id,
      title: i.title,
      stamp: stampFor(i.publishedAt),
      href: i.link,
    }));
    return mapped.length >= 4 ? mapped : FALLBACK_TICKER;
  }, [allItems]);

  // Each seamless-loop `__group` must be at least as wide as the viewport, or a gap opens between
  // the two groups mid-scroll. On a thin news day (few "today" items) tile the set until there are
  // enough rows to guarantee that.
  const marqueeRows: TickerRow[] = useMemo(() => {
    if (rows.length === 0 || rows.length >= 10) return rows;
    const out: TickerRow[] = [];
    while (out.length < 10) out.push(...rows);
    return out;
  }, [rows]);

  const openRow = (href: string) => {
    if (href.startsWith('/')) navigate(href);
    else window.open(href, '_blank', 'noopener,noreferrer');
  };

  // BiDi-safe row. The marquee viewport is dir="ltr" (so the CSS translateX loop stays
  // predictable), so every row re-establishes its own context:
  //   • button  dir="rtl" + isolate — orders bullet → headline → stamp right-to-left and walls
  //     the row off from its neighbours in the LTR track (no cross-item scrambling).
  //   • title   dir="rtl" + isolate — the feed is Hebrew-only, but many headlines OPEN with an
  //     English product name ("OpenAI …", "GPT-6 …"). A per-content `dir="auto"` there would
  //     resolve those rows to LTR and flip the whole line to the left. Forcing RTL keeps every
  //     row aligned; embedded English / acronyms / numbers still sit correctly inline (isolated).
  //   • stamp   dir="ltr" — "27.08 · 19:24" never flips; rendered as a subtle pill badge.
  const Item = ({ row }: { row: TickerRow }) => (
    <button
      type="button"
      onClick={() => openRow(row.href)}
      dir="rtl"
      className="group inline-flex items-center gap-2.5 leading-none text-[13px] md:text-sm text-zinc-300 hover:text-brand-300 transition-colors [unicode-bidi:isolate]"
    >
      <span className="text-brand-500 select-none" aria-hidden="true">•</span>
      <bdi dir="rtl" className="whitespace-nowrap [unicode-bidi:isolate]">
        {row.title}
      </bdi>
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
  const animationDuration = `${Math.max(60, marqueeRows.length * 6)}s`;

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
              <bdi dir="rtl" className="truncate [unicode-bidi:isolate]">{row.title}</bdi>
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
                {marqueeRows.map((row, i) => (
                  <Item key={`${dup}-${i}-${row.id}`} row={row} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
