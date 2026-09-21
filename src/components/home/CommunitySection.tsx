import type { ComponentType } from 'react';
import { Instagram, Linkedin, ArrowUpLeft } from 'lucide-react';
import PopHeadline from './PopHeadline';
import {
  INSTAGRAM_URL,
  THREADS_URL,
  TIKTOK_URL,
  X_URL,
  LINKEDIN_URL,
  SPOTIFY_URL,
  buildWhatsAppUrl,
  ThreadsIcon,
  TikTokIcon,
  XIcon,
  SpotifyIcon,
  WhatsAppIcon,
} from '../SocialLinks';
import { COMMUNITY_COPY, type ChannelId } from '../../data/siteCopy';
import { rtl } from '../../lib/rtl';

/**
 * Every public channel from the Linktree (linktr.ee/mrdaniel.ai) as one glass grid, so a visitor
 * who is not ready for a call still has a next step that keeps them in the funnel. Handles are
 * rendered in an LTR isolate (`dir="ltr"`) so "@mrdaniel.ai" never reorders inside the RTL card.
 */
interface Channel {
  id: ChannelId;
  name: string;
  handle: string;
  href: string;
  Icon: ComponentType<{ className?: string }>;
}

const CHANNELS: Channel[] = [
  { id: 'instagram', name: 'Instagram', handle: '@mrdaniel.ai', href: INSTAGRAM_URL, Icon: Instagram },
  { id: 'threads', name: 'Threads', handle: '@mrdaniel.ai', href: THREADS_URL, Icon: ThreadsIcon },
  { id: 'tiktok', name: 'TikTok', handle: '@mrdaniel.ai', href: TIKTOK_URL, Icon: TikTokIcon },
  { id: 'x', name: 'X', handle: '@mrdaniel_ai', href: X_URL, Icon: XIcon },
  { id: 'linkedin', name: 'LinkedIn', handle: 'Daniel Ben Baruch', href: LINKEDIN_URL, Icon: Linkedin },
  { id: 'spotify', name: 'Spotify', handle: 'MR. DANIEL', href: SPOTIFY_URL, Icon: SpotifyIcon },
  { id: 'whatsapp', name: 'WhatsApp', handle: '050-647-3039', href: buildWhatsAppUrl(), Icon: WhatsAppIcon },
];

export default function CommunitySection() {
  const c = COMMUNITY_COPY;
  return (
    <section id="community" className="relative py-20 md:py-28 overflow-x-clip cv-auto">
      <div className="container-wide relative z-10">
        <div className="mx-auto mb-10 max-w-3xl text-center md:mb-14">
          <span className="glass-chip mb-6">
            <span className="glass-chip__dot" aria-hidden="true" />
            {rtl(c.eyebrow)}
          </span>
          <PopHeadline lead={rtl(c.lead)} accent={rtl(c.accent)} />
          <p className="font-sans text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">{rtl(c.sub)}</p>
        </div>

        <ul className="mx-auto grid max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {CHANNELS.map(({ id, name, handle, href, Icon }) => (
            <li key={id} className={id === 'whatsapp' ? 'sm:col-span-2 lg:col-span-3' : undefined}>
              <a href={href} target="_blank" rel="noopener noreferrer" className="channel-card group h-full">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-300">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <strong className="text-base font-bold text-white">{name}</strong>
                    <span dir="ltr" className="truncate font-mono text-xs text-zinc-500">
                      {handle}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-sm leading-snug text-zinc-400">{rtl(c.channels[id])}</span>
                </span>
                <ArrowUpLeft className="h-4 w-4 shrink-0 text-zinc-500 transition-colors group-hover:text-brand-400" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
