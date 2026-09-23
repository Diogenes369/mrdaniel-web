import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowDown, ChevronLeft, Cpu, Radio } from 'lucide-react';
import WebButton from './WebButton';
import SocialLinks from './SocialLinks';
import { HERO_COPY, HERO_CONSOLE_COPY } from '../data/siteCopy';
import { useNewsFeed, formatRelativeTime, type NewsItem } from '../services/newsService';
import { useModelCatalog } from '../services/modelCatalogService';
import { smoothScrollTo } from '../hooks/useLenis';
import { rtl } from '../lib/rtl';

// Static on purpose: the site-wide NewsTicker already imports ArticleModal, so it is in the main
// chunk either way and a lazy() here would only add a Suspense boundary and lose its exit animation.
import ArticleModal from './news/ArticleModal';

const HERO_ICON_CLASS =
  'w-10 h-10 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-zinc-300 hover:text-brand-400 hover:border-brand-500/40 transition-colors';

const EASE = [0.16, 1, 0.3, 1] as const;

/** The homepage section the single hero CTA leads to. */
const AGENTS_ANCHOR = '#offer-ai-agents';

/**
 * Hero (split layout since 2026-09-23). The right-hand column (RTL start) carries one warm promise
 * and exactly ONE button, which scrolls to the AI agents section. The left-hand column is the
 * model-updates console below.
 *
 * First-paint rules (2026-09-23 performance pass): nothing in the first viewport starts at
 * `opacity: 0`. The entrance is a transform-only nudge, so the headline — the page's LCP element —
 * is painted on the first frame instead of after a 1.1 s fade, and the console is never hidden
 * behind a delayed entrance.
 *
 * Mobile: one column, console under the CTA. No sticky/pin anywhere (webview rule, AGENTS.md).
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
            initial={{ y: 14 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.9, ease: EASE }}
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

          <ModelConsole />
        </div>
      </div>
    </section>
  );
}

// ─── Model-updates console ───────────────────────────────────────────────────────────────────

/**
 * Model updates ONLY (2026-09-23). Guides and posts were removed from here by decision — the one
 * way to the guides is the "לומדים AI" nav link.
 *
 * Two layers, chosen so the console is complete on the first frame and never shifts:
 *   1. "Current models" — the newest model per lab from ModelUpdateAgent. The query's
 *      `placeholderData` is the verified seed, so this row has real content before any fetch.
 *   2. "Latest launches" — model/tool release headlines filtered from /api/news. Until the feed
 *      answers, FIXED-HEIGHT skeleton rows hold exactly the space the real rows take (each row is
 *      a fixed height with a 2-line clamp), so nothing below moves when the data lands.
 */
const RELEASE_ROWS = 3;
/** Row height is fixed so skeleton → content is a swap, not a reflow. */
const ROW_H = 'h-[84px]';

/** Only NEW models, tools and releases — the feed is already Hebrew + AI-only (sanitizeAndKeep). */
const LAUNCH = /השיק|משיק|משיקה|השקה|השקת|חשפ|חושפ|גרסה|גרסת|מודל חדש|כלי חדש|קוד פתוח|זמין עכשיו|הכריז|מכריז|\b(?:GPT|Claude|Gemini|Llama|Grok|Muse|Mistral|DeepSeek|Qwen|Copilot|Cursor|Sora|Veo|Midjourney|o\d)\b/i;

function isModelUpdate(item: NewsItem): boolean {
  return item.topic === 'ai_models' || LAUNCH.test(item.title);
}

function ModelConsole() {
  const news = useNewsFeed();
  const { data: catalog } = useModelCatalog();
  const [active, setActive] = useState<NewsItem | null>(null);
  const k = HERO_CONSOLE_COPY;

  const releases = useMemo(() => {
    const ts = (iso: string) => {
      const t = new Date(iso).getTime();
      return Number.isNaN(t) ? -Infinity : t;
    };
    return [...(news.data ?? [])].filter(isModelUpdate).sort((a, b) => ts(b.publishedAt) - ts(a.publishedAt)).slice(0, RELEASE_ROWS);
  }, [news.data]);

  const frontier = (catalog?.frontier ?? []).slice(0, 4);

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
        <h2 className="mb-3 font-display text-lg font-extrabold text-white">{rtl(k.title)}</h2>

        {/* 1 — Current models: real content on the first frame (seed placeholder). */}
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-zinc-500">
          <Cpu className="h-3.5 w-3.5 text-brand-400" aria-hidden="true" />
          {k.currentLabel}
        </p>
        <ul className="mb-5 grid grid-cols-2 gap-2">
          {frontier.map((m) => (
            <li key={m.id} className="h-[58px] rounded-xl border border-white/[0.07] bg-black/25 px-3 py-2">
              <span className="block text-[10px] font-bold text-zinc-500">{m.vendor}</span>
              <bdi dir="ltr" className="block truncate font-display text-sm font-extrabold text-white">
                {m.name}
              </bdi>
            </li>
          ))}
        </ul>

        {/* 2 — Latest launches from the feed. */}
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-zinc-500">
          <Radio className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
          {k.releasesLabel}
        </p>
        <ol className="space-y-2" aria-busy={news.isLoading}>
          {news.isLoading
            ? Array.from({ length: RELEASE_ROWS }, (_, i) => (
                <li key={i} className={`${ROW_H} space-y-2 rounded-2xl border border-white/[0.06] bg-black/25 p-3.5`} aria-hidden="true">
                  <span className="block h-2.5 w-24 animate-pulse rounded bg-white/[0.08]" />
                  <span className="block h-3.5 w-full animate-pulse rounded bg-white/[0.08]" />
                  <span className="block h-3.5 w-2/3 animate-pulse rounded bg-white/[0.08]" />
                </li>
              ))
            : releases.length === 0
              ? (
                  <li className={`${ROW_H} flex items-center rounded-2xl border border-white/[0.06] bg-black/25 p-3.5 text-sm text-zinc-400`}>
                    {rtl(k.empty)}
                  </li>
                )
              : releases.map((item) => (
                  <li key={item.id} className={ROW_H}>
                    <button
                      type="button"
                      onClick={() => setActive(item)}
                      className="group flex h-full w-full items-start gap-3 rounded-2xl border border-white/[0.06] bg-black/25 p-3.5 text-right transition-colors hover:border-brand-500/40 hover:bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="mb-1 flex items-center gap-x-2 text-[11px] text-zinc-500">
                          <span className="truncate font-bold text-zinc-300">{item.source}</span>
                          <span aria-hidden="true">·</span>
                          <span className="shrink-0">{formatRelativeTime(item.publishedAt)}</span>
                        </span>
                        <bdi dir="rtl" className="line-clamp-2 block text-[14px] font-semibold leading-snug text-zinc-100 group-hover:text-white">
                          {item.title}
                        </bdi>
                      </span>
                      <ChevronLeft className="mt-5 h-4 w-4 shrink-0 text-zinc-600 transition-transform group-hover:-translate-x-0.5 group-hover:text-brand-400" aria-hidden="true" />
                    </button>
                  </li>
                ))}
        </ol>
      </div>

      <span className="signal-console__scan" aria-hidden="true" />
      <ArticleModal item={active} onClose={() => setActive(null)} />
    </div>
  );
}
