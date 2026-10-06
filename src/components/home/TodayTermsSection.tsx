import { useMemo, useState } from 'react';
import { BookOpenText, ArrowLeft } from 'lucide-react';
import Depth from '../story/Depth';
import SiteBot from '../bots/SiteBot';
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

  // Glyph world since 2026-10-06: each term is a dotted frame with the term in the machine's voice,
  // how often it came up today as a plain machine line, the meaning in Heebo, and the story it came
  // from as a link. A bot reads along in the open side.
  return (
    <section id={id} className={compact ? 'relative py-10' : 'story-beat'} dir="rtl">
      <div className="container-wide">
        {compact ? (
          <h2 className="mb-6 flex items-center gap-2 font-display text-xl font-black text-white md:text-2xl">
            <BookOpenText className="h-6 w-6 text-brand-400" aria-hidden="true" />
            מילים שמופיעות בחדשות היום
          </h2>
        ) : (
          <div className="grid grid-cols-1 items-end gap-8 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-8">
              <h2 className="story-h2">
                מילון AI <span className="text-brand-400">מהחדשות של היום</span>
              </h2>
              <p className="story-body mt-6" data-live="rise">
                המונחים שחוזרים בכותרות של היום, כל אחד במשפט פשוט. מתעדכן לבד עם החדשות.
              </p>
            </div>
            <div className="flex lg:col-span-4 lg:justify-end">
              <Depth speed={0.18}>
                <SiteBot shape="flower" tone="deep" mood="focus" size={120} className="offer-beat__bot" />
              </Depth>
            </div>
          </div>
        )}

        <ul className={`terms-grid ${compact ? 'terms-grid--compact' : 'mt-12 md:mt-16'}`} data-live="stagger">
          {hits.map(({ term, count, firstId }) => {
            const story = byId.get(firstId);
            return (
              <li key={term.id} className="glyph-frame term-card">
                <div className="term-card__head">
                  <h3 className="term-card__term">{term.label}</h3>
                  <span className="term-card__count">{count === 1 ? 'בכתבה אחת' : `ב-${count} כתבות`}</span>
                </div>
                <p className="term-card__text">{term.text}</p>
                {story && (
                  <button type="button" onClick={() => setActive(story)} className="term-card__story group">
                    <ArrowLeft className="mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
                    <span className="line-clamp-2">
                      <span className="term-card__where">איפה ראינו את זה: </span>
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
