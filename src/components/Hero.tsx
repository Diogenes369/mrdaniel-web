import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowDown, ArrowLeft, ChevronLeft, BookOpen, Cpu, AtSign } from 'lucide-react';
import WebButton from './WebButton';
import SocialLinks from './SocialLinks';
import ArticleModal from './news/ArticleModal';
import { HERO_COPY, HERO_CONSOLE_COPY } from '../data/siteCopy';
import { CREATOR_GUIDES } from '../data/creatorContent';
import { useNewsFeed, formatRelativeTime, type NewsItem } from '../services/newsService';
import { useCreatorPosts } from '../services/creatorFeedService';
import { smoothScrollTo } from '../hooks/useLenis';
import { rtl } from '../lib/rtl';

const HERO_ICON_CLASS =
  'w-10 h-10 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-zinc-300 hover:text-brand-400 hover:border-brand-500/40 transition-colors';

const EASE = [0.16, 1, 0.3, 1] as const;

/** The homepage section the single hero CTA leads to. */
const AGENTS_ANCHOR = '#offer-ai-agents';

/**
 * Hero (split layout since 2026-09-23). The right-hand column (RTL start) carries one warm promise
 * and exactly ONE button, which scrolls to the AI agents section — the news button was removed
 * because the ticker above the header already carries the news, and a second CTA split the first
 * click. The left-hand column is the "tips & model updates" console below.
 *
 * Mobile: one column, console under the CTA, so the promise and the button own the first viewport.
 * No sticky/pin anywhere (webview rule, AGENTS.md).
 */
export default function Hero() {
  const c = HERO_COPY;

  const goToAgents = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    e.preventDefault();
    smoothScrollTo(AGENTS_ANCHOR);
  };

  return (
    <section id="hero" className="relative min-h-[100dvh] flex items-center pt-28 pb-16 overflow-hidden">
      <div className="hero-grid" aria-hidden="true" />
      <div className="container-wide relative z-10">
        <div className="mx-auto grid max-w-[1400px] items-center gap-12 px-4 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, ease: EASE }}
            className="text-center lg:text-right"
          >
            <h1 className="font-display text-fluid-hero font-black text-white mb-7 [text-shadow:0_2px_18px_rgba(0,0,0,0.85),0_6px_44px_rgba(0,0,0,0.75)]">
              {rtl(c.h1Lead)}
              <br />
              <span className="neon-text">{rtl(c.h1Accent)}</span>
            </h1>

            <p className="text-base md:text-xl text-zinc-300 font-light max-w-2xl mx-auto lg:mx-0 leading-relaxed mb-10 [text-shadow:0_2px_14px_rgba(0,0,0,0.9)]">
              {rtl(c.sub)}
            </p>

            <div className="flex justify-center lg:justify-start">
              {/* A real anchor, so it still works if the smooth-scroll layer is off. */}
              <WebButton variant="primary" magnetic href={AGENTS_ANCHOR} onClick={goToAgents} className="cta-sheen w-full sm:w-auto !px-9">
                {rtl(c.ctaPrimary)}
                <ArrowDown className="w-5 h-5" />
              </WebButton>
            </div>

            <SocialLinks
              className="mt-9 justify-center lg:justify-start"
              iconClassName={HERO_ICON_CLASS}
              channels={['instagram', 'threads', 'tiktok', 'x', 'linkedin']}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, delay: 0.25, ease: EASE }}
          >
            <TipsConsole />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ─── Tips & model-updates console ────────────────────────────────────────────────────────────

type Kind = 'guide' | 'post' | 'model';
type Filter = 'all' | 'tips' | 'models';

interface ConsoleRow {
  id: string;
  kind: Kind;
  title: string;
  meta: string;
  /** Model updates open the article modal; guides and posts are links. */
  item?: NewsItem;
  href?: string;
  external?: boolean;
}

const CONSOLE_ROWS = 4;

/**
 * Only NEW models, tools and releases — not general AI news (that is the ticker's job). The feed
 * is already Hebrew + AI-only (sanitizeAndKeep); this narrows it to launches. `ai_models` items
 * qualify on their topic; anything else needs a launch verb or a known model/tool name in the
 * headline.
 */
const LAUNCH = /השיק|משיק|משיקה|השקה|השקת|חשפ|חושפ|גרסה|גרסת|מודל חדש|כלי חדש|קוד פתוח|זמין עכשיו|הכריז|מכריז|\b(?:GPT|Claude|Gemini|Llama|Grok|Mistral|DeepSeek|Qwen|Copilot|Cursor|Sora|Veo|Midjourney|o\d)\b/i;

function isModelUpdate(item: NewsItem): boolean {
  return item.topic === 'ai_models' || LAUNCH.test(item.title);
}

const KIND_ICON = { guide: BookOpen, post: AtSign, model: Cpu } as const;

function TipsConsole() {
  const navigate = useNavigate();
  const news = useNewsFeed();
  const posts = useCreatorPosts();
  const [filter, setFilter] = useState<Filter>('all');
  const [active, setActive] = useState<NewsItem | null>(null);
  const k = HERO_CONSOLE_COPY;

  const { tips, models } = useMemo(() => {
    const ts = (iso: string) => {
      const t = new Date(iso).getTime();
      return Number.isNaN(t) ? -Infinity : t;
    };
    const models: ConsoleRow[] = [...(news.data ?? [])]
      .filter(isModelUpdate)
      .sort((a, b) => ts(b.publishedAt) - ts(a.publishedAt))
      .slice(0, CONSOLE_ROWS)
      .map((i) => ({ id: `m-${i.id}`, kind: 'model', title: i.title, meta: `${i.source} · ${formatRelativeTime(i.publishedAt)}`, item: i }));

    // Posts first (newest content), then the guides as the evergreen floor.
    const tips: ConsoleRow[] = [
      ...(posts.data ?? []).map((p) => ({
        id: `p-${p.id}`,
        kind: 'post' as const,
        title: p.text.replace(/\s+/g, ' ').trim(),
        meta: `@mrdaniel_ai · ${p.createdAt ? formatRelativeTime(p.createdAt) : 'X'}`,
        href: p.url,
        external: true,
      })),
      ...CREATOR_GUIDES.map((g) => ({ id: `g-${g.slug}`, kind: 'guide' as const, title: g.title, meta: g.blurb, href: `/g/${g.slug}` })),
    ];
    return { tips, models };
  }, [news.data, posts.data]);

  // "All" interleaves the two streams (tip, model, tip, model…) so neither buries the other.
  const rows = useMemo(() => {
    if (filter === 'tips') return tips.slice(0, CONSOLE_ROWS);
    if (filter === 'models') return models.slice(0, CONSOLE_ROWS);
    const out: ConsoleRow[] = [];
    for (let i = 0; out.length < CONSOLE_ROWS && (i < tips.length || i < models.length); i++) {
      if (tips[i]) out.push(tips[i]);
      if (models[i] && out.length < CONSOLE_ROWS) out.push(models[i]);
    }
    return out;
  }, [filter, tips, models]);

  // Guides are local, so only the models tab can be genuinely "loading".
  const loading = filter === 'models' && news.isLoading;

  const open = (row: ConsoleRow) => {
    if (row.item) setActive(row.item);
    else if (row.href && row.external) window.open(row.href, '_blank', 'noopener,noreferrer');
    else if (row.href) navigate(row.href);
  };

  return (
    <div className="signal-console glass-panel glass-panel--flagship relative overflow-hidden rounded-3xl" dir="rtl">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" />
          </span>
          <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-brand-300" dir="ltr">
            {k.label}
          </span>
        </div>
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-brand-500/60" />
        </div>
      </div>

      <div className="px-5 pb-5 pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold text-white">{rtl(k.title)}</h2>
          <div role="tablist" aria-label={k.title} className="flex gap-1 rounded-full border border-white/10 bg-black/30 p-1">
            {(['all', 'tips', 'models'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 ${
                  filter === f ? 'bg-brand-500 text-black' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {k.filters[f]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <ul className="space-y-2.5" aria-busy="true" aria-label={k.loading}>
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="space-y-2 rounded-2xl border border-white/[0.06] bg-black/25 p-4">
                <span className="block h-2.5 w-24 animate-pulse rounded bg-white/[0.08]" />
                <span className="block h-3.5 w-full animate-pulse rounded bg-white/[0.08]" />
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <p className="rounded-2xl border border-white/[0.06] bg-black/25 p-4 text-sm text-zinc-400">{rtl(k.empty)}</p>
        ) : (
          <ol className="space-y-2.5" key={filter}>
            {rows.map((row, i) => {
              const Icon = KIND_ICON[row.kind];
              return (
                <li key={row.id} className="signal-row" style={{ animationDelay: `${0.15 + i * 0.08}s` }}>
                  <button
                    type="button"
                    onClick={() => open(row)}
                    className="group flex w-full items-start gap-3 rounded-2xl border border-white/[0.06] bg-black/25 p-4 text-right transition-colors hover:border-brand-500/40 hover:bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
                  >
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${row.kind === 'model' ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300' : 'border-brand-500/30 bg-brand-500/10 text-brand-300'}`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="mb-1 flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-500">
                        <span className="font-bold text-zinc-300">{k.kind[row.kind]}</span>
                        <span aria-hidden="true">·</span>
                        <span className="line-clamp-1">{row.meta}</span>
                      </span>
                      <bdi dir="rtl" className="line-clamp-2 block text-[15px] font-semibold leading-snug text-zinc-100 group-hover:text-white">
                        {row.title}
                      </bdi>
                    </span>
                    <ChevronLeft className="mt-2 h-4 w-4 shrink-0 text-zinc-600 transition-transform group-hover:-translate-x-0.5 group-hover:text-brand-400" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        <button
          type="button"
          onClick={() => navigate('/magazines')}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-brand-300 hover:text-brand-200 focus-visible:outline-none focus-visible:underline"
        >
          {rtl(k.cta)}
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <span className="signal-console__scan" aria-hidden="true" />
      <ArticleModal item={active} onClose={() => setActive(null)} />
    </div>
  );
}
