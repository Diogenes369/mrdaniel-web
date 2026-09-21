import { ArrowUpLeft, Heart, MessageCircle, Repeat2, RefreshCw } from 'lucide-react';
import PopHeadline from './PopHeadline';
import { XIcon } from '../SocialLinks';
import { useXFeed, type XFeedPost } from '../../services/xFeedService';
import { rtl } from '../../lib/rtl';

/**
 * Live @mrdaniel_ai feed — the latest AI takes, straight from X, so the homepage always reflects
 * what was posted today. Data: /api/news?action=x-feed (src/server/xFeed.ts), polled every 5 min.
 *
 * Post text arrives in whatever language it was written, so each body is `dir="auto"` and the
 * browser picks the base direction per post instead of the page's RTL forcing English backwards.
 * When the feed is empty (X's free endpoint rate-limited and no snapshot yet) the section still
 * renders a single follow card rather than disappearing, so the layout never jumps.
 */

const RELATIVE = new Intl.RelativeTimeFormat('he', { numeric: 'auto' });

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const min = Math.round((t - Date.now()) / 60_000);
  if (Math.abs(min) < 60) return RELATIVE.format(min, 'minute');
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return RELATIVE.format(hr, 'hour');
  const day = Math.round(hr / 24);
  if (Math.abs(day) < 30) return RELATIVE.format(day, 'day');
  return new Date(t).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function compact(n?: number): string | null {
  if (!n) return null;
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n);
}

function PostCard({ post, handle }: { post: XFeedPost; handle: string }) {
  const metrics = [
    { Icon: MessageCircle, v: compact(post.replies), label: 'תגובות' },
    { Icon: Repeat2, v: compact(post.reposts), label: 'ריפוסטים' },
    { Icon: Heart, v: compact(post.likes), label: 'לייקים' },
  ].filter((m) => m.v);
  return (
    <a href={post.url} target="_blank" rel="noopener noreferrer" className="glass-panel glass-panel--info group flex h-full flex-col rounded-2xl p-5 transition-colors hover:border-brand-500/40">
      <header className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-500/30 bg-brand-500/10 text-brand-300">
          <XIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-sm text-white">MR. DANIEL</strong>
          <span dir="ltr" className="block font-mono text-xs text-zinc-500">@{handle}</span>
        </span>
        <time dateTime={post.createdAt} className="shrink-0 text-xs text-zinc-500">{relativeTime(post.createdAt)}</time>
      </header>
      <p dir="auto" className="mb-4 line-clamp-6 flex-1 whitespace-pre-line text-[15px] leading-relaxed text-zinc-200">
        {post.text}
      </p>
      {post.images[0] && (
        <img
          src={post.images[0]}
          alt=""
          loading="lazy"
          decoding="async"
          className="mb-4 aspect-video w-full rounded-xl border border-white/10 object-cover"
        />
      )}
      <footer className="flex items-center gap-4 text-xs text-zinc-500">
        {metrics.map(({ Icon, v, label }) => (
          <span key={label} className="inline-flex items-center gap-1" aria-label={`${v} ${label}`}>
            <Icon className="h-3.5 w-3.5" />
            {v}
          </span>
        ))}
        <span className="ms-auto inline-flex items-center gap-1 text-zinc-400 transition-colors group-hover:text-brand-400">
          לפוסט ב-X
          <ArrowUpLeft className="h-3.5 w-3.5" />
        </span>
      </footer>
    </a>
  );
}

export default function XFeedSection() {
  const { data, isLoading, isFetching } = useXFeed();
  const handle = data?.handle ?? 'mrdaniel_ai';
  const profileUrl = data?.profileUrl ?? 'https://x.com/mrdaniel_ai';
  const posts = data?.posts ?? [];

  return (
    <section id="x-feed" className="relative py-20 md:py-28 overflow-x-clip cv-auto">
      <div className="container-wide relative z-10">
        <div className="mx-auto mb-10 max-w-3xl text-center md:mb-14">
          <span className="glass-chip mb-6">
            <span className="glass-chip__dot" aria-hidden="true" />
            {rtl('בשידור חי מ-X')}
          </span>
          <PopHeadline lead={rtl('התובנות האחרונות')} accent={rtl('שלי על AI')} />
          <p className="font-sans text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
            {rtl('מה שפרסמתי ב-X בימים האחרונים: מודלים חדשים, סוכנים וכלים, בלי פילטר.')}
          </p>
        </div>

        {isLoading ? (
          <ul className="mx-auto grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="glass-panel glass-panel--info h-56 animate-pulse rounded-2xl" />
            ))}
          </ul>
        ) : posts.length ? (
          <ul className="mx-auto grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {posts.slice(0, 6).map((p) => (
              <li key={p.id}>
                <PostCard post={p} handle={handle} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="glass-panel glass-panel--marketing mx-auto max-w-xl rounded-2xl p-8 text-center">
            <XIcon className="mx-auto mb-4 h-8 w-8 text-brand-300" />
            <p className="mb-5 text-zinc-300">{rtl('הפוסטים האחרונים שלי ב-X, ישר מהמקור.')}</p>
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-3">
          <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="channel-card !inline-flex !w-auto gap-2 px-5">
            <XIcon className="h-4 w-4 text-brand-300" />
            <span className="font-bold text-white">{rtl('עקבו ב-X')}</span>
            <span dir="ltr" className="font-mono text-xs text-zinc-500">@{handle}</span>
          </a>
          {isFetching && !isLoading && <RefreshCw className="h-4 w-4 animate-spin text-zinc-500" aria-label="מתעדכן" />}
        </div>
      </div>
    </section>
  );
}
