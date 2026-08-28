import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNewsFeed } from '../services/newsService';
import { prefersReducedMotion } from '../lib/gsap';

// Site-wide live headline ticker. Rendered once at the very top of the app shell (App.tsx),
// ABOVE the navigation header and in normal document flow — it scrolls away with the page and
// is deliberately NOT part of the sticky/compact header (the header measures this bar's height
// and glues itself to its bottom edge until it scrolls past, then docks to the top).
//
// The seamless marquee CSS lives in src/index.css (`.news-ticker*`): two identical `__group`s
// inside `__track`, track translates left by exactly one group width and loops → no blank frames.

const TICKER_COUNT = 14;

interface TickerRow {
  id: string;
  title: string;
  dateLabel: string;
  href: string;
}

// Shown while the feed is loading, empty, or errored — the ticker is never blank.
const FALLBACK_TICKER: TickerRow[] = [
  { id: 'fb-ai', title: 'סוכני AI בארגונים — מגמת האוטומציה שמשנה תהליכים עסקיים', dateLabel: 'עדכני', href: '/ai' },
  { id: 'fb-cy', title: 'אבטחת סייבר לעסקים קטנים ובינוניים: Zero-Trust כברירת מחדל', dateLabel: 'עדכני', href: '/cyber' },
  { id: 'fb-web', title: 'פיתוח Full-Stack מודרני — מהירות, נגישות וארכיטקטורה נקייה', dateLabel: 'עדכני', href: '/digital' },
  { id: 'fb-data', title: 'ארכיטקטורת דאטה נכונה = החלטות מהירות ומוצר טוב יותר', dateLabel: 'עדכני', href: '/architecture' },
  { id: 'fb-mkt', title: 'קמפיינים דיגיטליים מבוססי דאטה — יותר לידים, פחות בזבוז', dateLabel: 'עדכני', href: '/digital' },
  { id: 'fb-cap', title: 'סקירת יכולות: מ-MVP ליזם ועד פלטפורמה ארגונית מלאה', dateLabel: 'עדכני', href: '/capabilities' },
];

function formatTickerDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

export default function NewsTicker() {
  const navigate = useNavigate();
  const { data: allItems } = useNewsFeed();
  const reduced = prefersReducedMotion();

  const rows: TickerRow[] = useMemo(() => {
    const mapped = (allItems ?? []).slice(0, TICKER_COUNT).map((i) => ({
      id: i.id,
      title: i.title,
      dateLabel: formatTickerDate(i.publishedAt),
      href: i.link,
    }));
    return mapped.length >= 4 ? mapped : FALLBACK_TICKER;
  }, [allItems]);

  const openRow = (href: string) => {
    if (href.startsWith('/')) navigate(href);
    else window.open(href, '_blank', 'noopener,noreferrer');
  };

  const Item = ({ row }: { row: TickerRow }) => (
    <button
      type="button"
      onClick={() => openRow(row.href)}
      className="group inline-flex items-center gap-2 text-[13px] text-zinc-400 hover:text-brand-300 transition-colors"
    >
      <span className="text-brand-500">•</span>
      <span>{row.title}</span>
      {row.dateLabel && (
        <span className="text-[11px] font-mono text-zinc-600 group-hover:text-brand-500/70" dir="ltr">
          {row.dateLabel}
        </span>
      )}
    </button>
  );

  return (
    <div
      id="news-ticker-bar"
      className="news-ticker relative z-30 w-full border-b border-white/10 bg-carbon-950/95 backdrop-blur-sm pt-safe overflow-hidden"
    >
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
        <div className="flex gap-8 overflow-hidden whitespace-nowrap py-2 pr-24 pl-4">
          {rows.slice(0, 5).map((row) => (
            <span key={row.id} className="inline-flex items-center gap-2 text-[13px] text-zinc-400 truncate">
              <span className="text-brand-500">•</span>
              {row.title}
              {row.dateLabel && (
                <span className="text-[11px] font-mono text-zinc-600" dir="ltr">
                  {row.dateLabel}
                </span>
              )}
            </span>
          ))}
        </div>
      ) : (
        <div className="news-ticker__viewport py-2" dir="ltr">
          <div className="news-ticker__track">
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
