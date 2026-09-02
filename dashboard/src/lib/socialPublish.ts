import type { CSSProperties } from 'react';
import type { StoryPayload } from './storySlides';

/**
 * Quick-Publish targets. Clicking a button copies the caption/text to the clipboard and opens the
 * platform in a new tab — LinkedIn/TikTok/Threads go to their composer; Instagram opens the
 * official profile (@mrdaniel.ai), from which the operator starts the post (more reliable than the
 * desktop-only /create flow, especially on mobile). Threads also pre-fills the composer via its
 * `?text=` intent param (best-effort — Threads truncates very long text, hence the clipboard copy).
 */
/** The one official Instagram profile for the brand — @mrdaniel.ai. Every Instagram link in the
 *  dashboard (Quick-Publish bar, IG Growth Agent) points here. */
export const INSTAGRAM_PROFILE_URL = 'https://www.instagram.com/mrdaniel.ai/';

/** Threads (Meta's text-first platform) web composer. */
export const THREADS_COMPOSER_URL = 'https://www.threads.net/intent/post';

/** Threads composer URL with the post text pre-filled via the `?text=` intent param. */
export function buildThreadsIntentUrl(text?: string): string {
  const t = (text || '').trim();
  return t ? `${THREADS_COMPOSER_URL}?text=${encodeURIComponent(t.slice(0, 500))}` : THREADS_COMPOSER_URL;
}

export type SocialPlatform = 'instagram' | 'linkedin' | 'tiktok' | 'threads';

export interface SocialTarget {
  id: SocialPlatform;
  label: string;
  url: string;
  /** inline style for the button (official-ish brand colour). */
  style: CSSProperties;
  /** optional builder for a text-prefilled composer URL — overrides `url` when the caller has
   *  text to pass (currently only Threads supports a web intent param). */
  intent?: (text: string) => string;
}

export const SOCIAL_TARGETS: SocialTarget[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    url: INSTAGRAM_PROFILE_URL,
    style: { background: 'linear-gradient(90deg,#F58529 0%,#DD2A7B 45%,#8134AF 75%,#515BD4 100%)', color: '#fff' },
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    url: 'https://www.linkedin.com/feed/?shareActive=true',
    style: { background: '#0A66C2', color: '#fff' },
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    url: 'https://www.tiktok.com/tiktokstudio/upload',
    style: { background: '#000', color: '#fff', border: '1px solid #25F4EE' },
  },
  {
    id: 'threads',
    label: 'Threads',
    url: THREADS_COMPOSER_URL,
    intent: buildThreadsIntentUrl,
    style: { background: '#000', color: '#fff', border: '1px solid #3a3a3a' },
  },
];

/** Build a ready-to-paste caption from a rendered carousel/story deck (cover → content → CTA). */
export function deckToCaption(payload: StoryPayload | null | undefined): string {
  if (!payload || !Array.isArray(payload.slides)) return '';
  const parts: string[] = [];
  for (const s of payload.slides) {
    if (!s) continue;
    if (s.kind === 'cover') {
      if (s.headline?.trim()) parts.push(s.headline.trim());
    } else if (s.kind === 'cta') {
      const body = (s.narrativeText || s.body || '').trim();
      if (body) parts.push(body);
      parts.push(s.linkLabel || 'mrdaniel.co.il');
    } else {
      const body = (s.narrativeText || s.body || '').trim();
      if (body) parts.push(body);
    }
  }
  return parts.filter(Boolean).join('\n\n').trim();
}

/**
 * Copy `text` to the clipboard (best-effort) then open `url` in a new tab. Returns whether the
 * copy succeeded. Never throws — the tab still opens even if clipboard access is blocked.
 */
export async function copyAndOpen(url: string, text: string): Promise<boolean> {
  let copied = false;
  try {
    if (text && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch {
    copied = false;
  }
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    /* popup blocked — nothing more we can do */
  }
  return copied;
}
