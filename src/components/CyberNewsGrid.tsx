import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Rss, ArrowLeft, RefreshCw } from 'lucide-react';
import WebButton from './WebButton';
import NewsCard from './NewsCard';
import { useNewsFeed } from '../services/newsService';

const PREVIEW_COUNT = 6;

// Mobile (< md): horizontal snap-scroll slider, one card "peeking" the next. Desktop (>= md): grid
// — 2 columns at md, 3 columns (x2 rows, for PREVIEW_COUNT=6) from lg up.
const TRACK_CLASS =
  'flex gap-5 overflow-x-auto snap-x snap-mandatory scrollbar-none momentum-scroll -mx-4 px-4 pb-2 md:mx-0 md:px-0 md:pb-0 md:overflow-visible md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6';

const ITEM_CLASS = 'snap-center shrink-0 w-[85%] sm:w-[60%] md:w-auto md:shrink md:snap-align-none flex flex-col h-full';

export default function CyberNewsGrid() {
  const navigate = useNavigate();
  const { data: allItems, isLoading, isError, refetch, isFetching } = useNewsFeed();
  const items = allItems?.slice(0, PREVIEW_COUNT);

  return (
    <section id="news" data-field-form="wave" className="py-12 md:py-20 border-t border-white/5 relative overflow-hidden cv-auto">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-12 md:mb-16 relative z-10">
          <motion.h2
            className="font-display text-fluid-h2 font-black text-white mb-6"
          >
            חדשות <span className="text-brand-500">סייבר וטכנולוגיה</span>
          </motion.h2>
          <motion.p
            className="font-sans text-zinc-300 text-base md:text-lg max-w-2xl mx-auto leading-relaxed [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]"
          >
            ריכוז אוטומטי של הכתבות הטריות ביותר מגיקטיים, אנשים ומחשבים, Techtime ו-Israel Defense — כל התוכן בעברית, ישירות לכאן.
          </motion.p>
        </div>

        {isLoading && (
          <div className={TRACK_CLASS}>
            {Array.from({ length: PREVIEW_COUNT }).map((_, idx) => (
              <div key={idx} className={ITEM_CLASS}>
                <div className="h-64 w-full rounded-2xl bg-white/[0.03] border border-white/5 animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {isError && !isLoading && (
          <div className="max-w-md mx-auto text-center relative z-10">
            <p className="text-zinc-400 mb-5">לא הצלחנו לטעון את הפיד כרגע. נסו שוב בעוד רגע.</p>
            <WebButton variant="glass" onClick={() => refetch()}>
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              ניסיון נוסף
            </WebButton>
          </div>
        )}

        {!isLoading && !isError && items && items.length > 0 && (
          <>
            <div className={`${TRACK_CLASS} relative z-10 max-w-6xl md:mx-auto mb-10 md:mb-12`}>
              {items.map((item, idx) => (
                <div key={item.id} className={ITEM_CLASS}>
                  <motion.div
                    className="h-full"
                  >
                    <NewsCard item={item} />
                  </motion.div>
                </div>
              ))}
            </div>

            <div className="text-center relative z-10">
              <WebButton variant="primary" onClick={() => navigate('/news')} className="!px-8">
                להציג עוד חדשות
                <ArrowLeft className="w-4 h-4" />
              </WebButton>
            </div>
          </>
        )}

        {!isLoading && !isError && items && items.length === 0 && (
          <div className="max-w-md mx-auto text-center relative z-10 text-zinc-400">
            <Rss className="w-8 h-8 mx-auto mb-4 text-zinc-600" />
            אין כרגע כתבות זמינות להצגה.
          </div>
        )}
      </div>
    </section>
  );
}
