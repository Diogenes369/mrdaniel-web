import { useMemo, useState } from 'react';
import { BookOpenText, ArrowLeft } from 'lucide-react';
import PopHeadline from './PopHeadline';
import ArticleModal from '../news/ArticleModal';
import { useNewsFeed, type NewsItem } from '../../services/newsService';
import { termsInStories } from '../../data/aiTerms';

/**
 * "מילון AI מהחדשות של היום" — the AI terms that appear in today's headlines, each explained in one
 * plain sentence and linked to the story it came from (2026-09-23).
 *
 * Autonomous and free: it reads the news feed the page already loaded (react-query dedupes the
 * request with the ticker and the hero console), matches it against the hand-written dictionary in
 * src/data/aiTerms.ts, and re-ranks every time the feed refreshes. No model call, no new endpoint.
 *
 * Window: stories from the last 48 hours; on a thin news day it widens to the newest 60 stories so
 * the strip is never empty for a reason unrelated to the terms. It renders nothing at all while the
 * feed loads or when fewer than 3 terms matched — a half-empty dictionary reads as broken, and the
 * section sits below the fold, so appearing late costs no layout shift in view.
 */
const WINDOW_MS = 48 * 60 * 60 * 1000;
const MIN_TERMS = 3;

export default function TodayTermsSection({ id = 'ai-terms', compact = false }: { id?: string; compact?: boolean }) {
  const { data } = useNewsFeed();
  const [active, setActive] = useState<NewsItem | null>(null);

  const { hits, byId } = useMemo(() => {
    const items = data ?? [];
    const now = Date.now();
    const recent = items.filter((i) => {
      const t = new Date(i.publishedAt).getTime();
      return Number.isFinite(t) && now - t <= WINDOW_MS;
    });
    const pool = recent.length >= 15 ? recent : [...items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 60);
    const stories = pool.map((i) => ({ id: i.id, text: `${i.title}\n${i.summary || i.excerpt || ''}` }));
    return { hits: termsInStories(stories, compact ? 4 : 6), byId: new Map(items.map((i) => [i.id, i])) };
  }, [data, compact]);

  if (hits.length < MIN_TERMS) return null;

  return (
    <section id={id} className={`relative ${compact ? 'py-10' : 'py-20 md:py-28'} overflow-x-clip cv-auto`} dir="rtl">
      <div className="container-wide relative z-10">
        {compact ? (
          <h2 className="mb-6 flex items-center gap-2 font-display text-xl font-black text-white md:text-2xl">
            <BookOpenText className="h-6 w-6 text-brand-400" aria-hidden="true" />
            מילים שמופיעות בחדשות היום
          </h2>
        ) : (
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <PopHeadline lead="מילון AI" accent="מהחדשות של היום" />
            <p className="font-sans text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
              המונחים שחוזרים בכותרות של היום, כל אחד במשפט פשוט. מתעדכן לבד עם החדשות.
            </p>
          </div>
        )}

        <ul className={`mx-auto grid max-w-[1400px] grid-cols-1 gap-4 sm:grid-cols-2 ${compact ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} md:gap-5`}>
          {hits.map(({ term, count, firstId }) => {
            const story = byId.get(firstId);
            return (
              <li key={term.id} className="glass-panel glass-panel--info flex h-full flex-col rounded-2xl p-5">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h3 className="font-display text-lg font-extrabold text-white">{term.label}</h3>
                  <span className="shrink-0 rounded-full border border-brand-500/30 bg-brand-500/10 px-2.5 py-0.5 text-[11px] font-bold text-brand-300">
                    {count === 1 ? 'בכתבה אחת' : `ב-${count} כתבות`}
                  </span>
                </div>
                <p className="mb-4 flex-grow text-[15px] leading-relaxed text-zinc-300">{term.text}</p>
                {story && (
                  <button
                    type="button"
                    onClick={() => setActive(story)}
                    className="group inline-flex items-start gap-1.5 text-right text-sm text-zinc-400 hover:text-brand-300 focus-visible:outline-none focus-visible:underline"
                  >
                    <ArrowLeft className="mt-0.5 h-4 w-4 shrink-0 text-brand-400 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
                    <span className="line-clamp-2">
                      <span className="font-bold text-zinc-300">איפה ראינו את זה: </span>
                      <bdi dir="rtl">{story.title}</bdi>
                    </span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <ArticleModal item={active} onClose={() => setActive(null)} />
    </section>
  );
}
