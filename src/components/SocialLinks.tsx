import { Instagram, Linkedin, Mail } from 'lucide-react';

export const INSTAGRAM_URL = 'https://www.instagram.com/mrdaniel.ai/';
export const LINKEDIN_URL = 'https://www.linkedin.com/in/daniel-ben-baruch?utm_source=share_via&utm_content=profile&utm_medium=member_ios';
// Source of truth for every public channel is the Linktree (linktr.ee/mrdaniel.ai), audited
// 2026-09-21. TikTok previously pointed at an unrelated @glasswing_project account; the Linktree
// lists @mrdaniel.ai, which matches the handle on every other network.
export const TIKTOK_URL = 'https://www.tiktok.com/@mrdaniel.ai';
export const X_URL = 'https://x.com/mrdaniel_ai';
export const THREADS_URL = 'https://www.threads.com/@mrdaniel.ai';
export const SPOTIFY_URL = 'https://open.spotify.com/user/312rrywayqttviksa5i5gxdtryhm';
export const LINKTREE_URL = 'https://linktr.ee/mrdaniel.ai';
export const CONTACT_EMAIL = 'daniel@mrdaniel.co.il';

/** Every public profile, for schema.org `sameAs` (index.html mirrors this list statically). */
export const SAME_AS_URLS = [INSTAGRAM_URL, THREADS_URL, TIKTOK_URL, X_URL, 'https://www.linkedin.com/in/daniel-ben-baruch', SPOTIFY_URL, LINKTREE_URL];

// No phone or WhatsApp link anywhere on the site (owner decision, 2026-10-07): the number that used
// to be here was a personal line. Visitors write by email, through a form (every form gets an
// automatic reply by email, see /api/leads) or on the social networks above.

// lucide-react ships no TikTok/X/Threads/Spotify glyphs (only general-purpose icons, not brand
// marks) — these are the standard public brand glyph paths, inlined as `currentColor` SVGs so they
// inherit the same sizing/color classes as the lucide icons alongside them.
export function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.6 5.82s.51.5 0 0A4.278 4.278 0 0 1 15.54 3h-3.09v12.4a2.592 2.592 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z" />
    </svg>
  );
}

export function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

export function ThreadsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z" />
    </svg>
  );
}

export function SpotifyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

const DEFAULT_ICON_CLASS =
  'w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300 hover:text-brand-400 hover:border-brand-500/40 transition-all';

// No native browser focus ring on any variant, ever (that default ring reads as a stray white
// outline against this dark theme) — replaced with a branded green ring, and only via
// `focus-visible` so it never flashes on an ordinary mouse click, only on real keyboard focus.
const FOCUS_SAFE_CLASS = 'outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-0';

export type SocialChannel = 'instagram' | 'threads' | 'tiktok' | 'x' | 'linkedin' | 'mail';

const ALL_CHANNELS: SocialChannel[] = ['instagram', 'threads', 'tiktok', 'x', 'linkedin', 'mail'];

interface SocialLinksProps {
  className?: string;
  iconClassName?: string;
  glyphClassName?: string;
  /** Which channels to render, in order — defaults to all 6. The header keeps a smaller
   * (Instagram/LinkedIn/mail) subset; TikTok stays exclusive to the footer and the bottom-of-page
   * social bar. */
  channels?: SocialChannel[];
}

export default function SocialLinks({ className = '', iconClassName, glyphClassName = 'w-4 h-4', channels = ALL_CHANNELS }: SocialLinksProps) {
  const cls = `${iconClassName ?? DEFAULT_ICON_CLASS} ${FOCUS_SAFE_CLASS}`;
  const show = (c: SocialChannel) => channels.includes(c);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {show('instagram') && (
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="אינסטגרם" title="אינסטגרם" className={cls}>
          <Instagram className={glyphClassName} />
        </a>
      )}
      {show('threads') && (
        <a href={THREADS_URL} target="_blank" rel="noopener noreferrer" aria-label="Threads" title="Threads" className={cls}>
          <ThreadsIcon className={glyphClassName} />
        </a>
      )}
      {show('linkedin') && (
        <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer" aria-label="לינקדאין" title="לינקדאין" className={cls}>
          <Linkedin className={glyphClassName} />
        </a>
      )}
      {show('tiktok') && (
        <a href={TIKTOK_URL} target="_blank" rel="noopener noreferrer" aria-label="טיקטוק" title="טיקטוק" className={cls}>
          <TikTokIcon className={glyphClassName} />
        </a>
      )}
      {show('x') && (
        <a href={X_URL} target="_blank" rel="noopener noreferrer" aria-label="X (טוויטר)" title="X" className={cls}>
          <XIcon className={glyphClassName} />
        </a>
      )}
      {show('mail') && (
        <a href={`mailto:${CONTACT_EMAIL}`} aria-label="שליחת מייל" title="שליחת מייל" className={cls}>
          <Mail className={glyphClassName} />
        </a>
      )}
    </div>
  );
}
