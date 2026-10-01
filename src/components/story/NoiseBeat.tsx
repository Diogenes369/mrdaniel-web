import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import Depth from './Depth';
import ArticleModal from '../news/ArticleModal';
import { STORY_COPY } from '../../data/siteCopy';
import { useNewsFeed, formatRelativeTime, type NewsItem } from '../../services/newsService';
import { useModelCatalog } from '../../services/modelCatalogService';
import { rtl } from '../../lib/rtl';
import { useFieldBeat, useFieldQuiet } from '../field/fieldState';

/** Only launches: new models, tools and versions. The feed is already Hebrew + AI-only. */
const LAUNCH =
  /השיק|משיק|משיקה|השקה|השקת|חשפ|חושפ|גרסה|גרסת|מודל חדש|כלי חדש|קוד פתוח|זמין עכשיו|הכריז|מכריז|\b(?:GPT|Claude|Gemini|Llama|Grok|Muse|Mistral|DeepSeek|Qwen|Copilot|Cursor|Sora|Veo|Midjourney|o\d)\b/i;
const isLaunch = (item: NewsItem) => item.topic === 'ai_models' || LAUNCH.test(item.title);

const ROWS = 5;
const ROWS_EXPANDED = 14;
/** Fixed row height: skeleton → content is a swap, never a reflow. */
const ROW_H = 'min-h-[76px]';

/**
 * First beat of the story: name the overwhelm, then prove it with the real thing — the model and
 * tool launches of the last few days, straight from the news feed, and the newest model per lab.
 * (This is the model-updates console that used to sit in the hero, moved to where it is evidence.)
 */
export default function NoiseBeat() {
  const c = STORY_COPY.noise;
  const beat = useFieldBeat('noise');
  const quietText = useFieldQuiet();
  const quietLog = useFieldQuiet();
  const news = useNewsFeed();
  const { data: catalog } = useModelCatalog();
  const [active, setActive] = useState<NewsItem | null>(null);
  const [expanded, setExpanded] = useState(false);

  const launches = useMemo(() => {
    const ts = (iso: string) => {
      const t = new Date(iso).getTime();
      return Number.isNaN(t) ? -Infinity : t;
    };
    return [...(news.data ?? [])].filter(isLaunch).sort((a, b) => ts(b.publishedAt) - ts(a.publishedAt)).slice(0, ROWS_EXPANDED);
  }, [news.data]);
  const rows = expanded ? launches : launches.slice(0, ROWS);
  const frontier = (catalog?.frontier ?? []).slice(0, 4);

  return (
    <section id="story" ref={beat} className="story-beat">
      <div className="container-wide">
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-10">
          <Depth speed={0.06} className="lg:col-span-5">
            <div ref={quietText}>
              <h2 className="story-h2">{rtl(c.title)}</h2>
              <p className="story-body mt-6">{rtl(c.body)}</p>
            </div>
          </Depth>

          <Depth speed={0.16} className="lg:col-span-7 lg:pt-28">
            <div ref={quietLog} className="space-y-8">
              <div>
                <h3 className="story-h3">{rtl(c.modelsTitle)}</h3>
                <ul className="mt-3 grid grid-cols-2 gap-px bg-[var(--color-rule)] sm:grid-cols-4">
                  {frontier.map((m) => (
                    <li key={m.id} className="bg-ground px-3.5 py-3">
                      <span className="block text-[11px] text-ink-faint">{m.vendor}</span>
                      <bdi dir="ltr" className="block break-words font-type text-[14px] font-bold leading-snug text-ink-paper">
                        {m.name}
                      </bdi>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="glyph-frame">
                <div className="flex items-center justify-between gap-3 border-b border-dotted border-[var(--color-rule)] px-4 py-3">
                  <h3 className="story-h3 !m-0">{rtl(c.logTitle)}</h3>
                  <Link to="/news" className="story-link text-[13px]">
                    {rtl(c.allNews)}
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
                <ol
                  id="launch-log"
                  aria-busy={news.isLoading}
                  className={expanded ? 'max-h-[min(62dvh,520px)] overflow-y-auto overscroll-contain story-scroll' : ''}
                  {...(expanded ? { 'data-lenis-prevent': '' } : {})}
                >
                  {news.isLoading
                    ? Array.from({ length: ROWS }, (_, i) => (
                        <li key={i} className={`${ROW_H} border-b border-dotted border-[var(--color-rule)] px-4 py-3.5 last:border-b-0`} aria-hidden="true">
                          <span className="block h-2.5 w-28 skeleton-step bg-white/[0.07]" />
                          <span className="mt-2.5 block h-3.5 w-4/5 skeleton-step bg-white/[0.07]" />
                        </li>
                      ))
                    : rows.length === 0
                      ? <li className={`${ROW_H} flex items-center px-4 text-[15px] text-ink-muted`}>{rtl(c.empty)}</li>
                      : rows.map((item) => (
                          <li key={item.id} className="border-b border-dotted border-[var(--color-rule)] last:border-b-0">
                            <motion.button
                              type="button"
                              onClick={() => setActive(item)}
                              whileTap={{ scale: 0.992 }}
                              transition={{ type: 'spring', stiffness: 600, damping: 32 }}
                              className={`log-row ${ROW_H}`}
                            >
                              <span className="log-row__caret" aria-hidden="true" />
                              <span className="min-w-0 flex-1">
                                <span className="mb-1 flex items-center gap-2 text-[12px] text-ink-faint">
                                  <span className="shrink-0">{formatRelativeTime(item.publishedAt)}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="truncate">{item.source}</span>
                                </span>
                                <bdi dir="rtl" className="line-clamp-2 block font-sans text-[16px] font-bold leading-snug text-ink-paper">
                                  {item.title}
                                </bdi>
                              </span>
                            </motion.button>
                          </li>
                        ))}
                </ol>
                {launches.length > ROWS && (
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    aria-controls="launch-log"
                    className="story-link w-full justify-center border-t border-dotted border-[var(--color-rule)] py-3 text-[13px]"
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                    {rtl(expanded ? c.collapse : c.expand)}
                  </button>
                )}
              </div>
            </div>
          </Depth>
        </div>
      </div>
      <ArticleModal item={active} onClose={() => setActive(null)} />
    </section>
  );
}
