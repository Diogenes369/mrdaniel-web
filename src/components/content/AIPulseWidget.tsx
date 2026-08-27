import { useNavigate } from 'react-router-dom';
import { Flame, Rss, Sparkles, ArrowLeft } from 'lucide-react';
import { useNewsFeed } from '../../services/newsService';

// A hand-picked, honestly-described real tool — not a fabricated "trending now" metric. Update
// this entry manually as the pick changes; there's no live "popularity" data source to drive it.
const TOOL_OF_THE_WEEK = {
  name: 'Claude Code',
  vendor: 'Anthropic',
  description:
    'סוכן קידוד אגנטי הרץ מהטרמינל — מבצע משימות פיתוח מורכבות מקצה לקצה (חיפוש וניתוח קוד, עריכה, הרצת בדיקות, קומיטים), עם תמיכה מובנית בפרוטוקול MCP לחיבור כלים וארגונים חיצוניים.',
  link: 'https://claude.com/claude-code',
};

/** "Breaking AI News" here is genuinely live — it's the site's existing RSS aggregation pipeline
 * (Geektime, אנשים ומחשבים, Techtime, Israel Defense) filtered to items already classified as
 * `topic === 'ai'`, not a separate fabricated feed. */
export default function AIPulseWidget() {
  const navigate = useNavigate();
  const { data: allItems, isLoading, isError } = useNewsFeed();
  const aiItems = (allItems ?? []).filter((item) => item.topic === 'ai').slice(0, 4);
  const [breaking, ...rest] = aiItems;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-16">
      <div className="bg-gradient-to-br from-brand-500/10 to-transparent border border-brand-500/30 rounded-2xl p-6 flex flex-col">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold text-brand-400 uppercase tracking-widest mb-4 w-fit">
          <Sparkles className="w-3 h-3" />
          Tool of the Week
        </span>
        <h3 className="font-display font-bold text-xl text-white mb-1">{TOOL_OF_THE_WEEK.name}</h3>
        <p className="text-zinc-500 text-xs font-mono mb-3" dir="ltr">
          {TOOL_OF_THE_WEEK.vendor}
        </p>
        <p className="text-zinc-300 text-sm leading-relaxed flex-grow mb-4">{TOOL_OF_THE_WEEK.description}</p>
        <a
          href={TOOL_OF_THE_WEEK.link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-400 hover:text-brand-300 transition-colors"
        >
          למידע נוסף
          <ArrowLeft className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="lg:col-span-2 bg-[#0D0E12]/80 border border-white/10 rounded-2xl p-6 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold text-brand-400 uppercase tracking-widest">
            <Flame className="w-3 h-3" />
            Breaking AI News
          </span>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-400" />
          </span>
        </div>

        {isLoading && <p className="text-zinc-500 text-sm">טוען עדכונים...</p>}
        {isError && <p className="text-zinc-500 text-sm">לא ניתן לטעון עדכונים כרגע.</p>}
        {!isLoading && !isError && !breaking && <p className="text-zinc-500 text-sm">אין כרגע כתבות AI זמינות.</p>}

        {breaking && (
          <a href={breaking.link} target="_blank" rel="noopener noreferrer" className="group block mb-3">
            <h3
              dir="auto"
              className="font-display font-bold text-lg text-white group-hover:text-brand-300 transition-colors leading-snug mb-1.5 line-clamp-2"
            >
              {breaking.title}
            </h3>
            <p dir="auto" className="text-zinc-400 text-sm leading-relaxed line-clamp-2">
              {breaking.excerpt}
            </p>
          </a>
        )}

        {rest.length > 0 && (
          <ul className="space-y-2 mt-1 border-t border-white/10 pt-3">
            {rest.map((item) => (
              <li key={item.id}>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  dir="auto"
                  className="text-sm text-zinc-400 hover:text-brand-400 transition-colors line-clamp-1 block"
                >
                  {item.title}
                </a>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => navigate('/news')}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-brand-400 transition-colors mt-4 w-fit"
        >
          <Rss className="w-3.5 h-3.5" />
          לכל עדכוני הסייבר והטכנולוגיה
        </button>
      </div>
    </div>
  );
}
