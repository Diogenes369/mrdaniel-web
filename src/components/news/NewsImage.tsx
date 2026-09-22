import { useMemo, useState } from 'react';
import type { NewsTopic } from '../../services/newsService';

/**
 * Feed lead image for a news card / modal. Sits `absolute inset-0` inside an aspect-ratio box.
 *
 * - `object-cover object-center` by default so subjects/faces stay centred, never edge-cropped.
 * - On load it measures the natural ratio: a portrait / tall image (ratio < ~0.92) switches to
 *   `object-contain` on a `bg-black/40` letterbox instead of cropping the subject out of frame.
 * - An image that loads but is below 400×300 (a blurry/tiny thumbnail the server-side enrichment
 *   couldn't upscale) is treated as a load failure.
 *
 * ## Why there is a painted fallback now
 *
 * This component used to `return null` on failure and rely on the caller's topic gradient showing
 * through. That gradient is `from-<topic>/40 via-transparent` over `bg-[#06080c]`, with a watermark
 * icon at 6% opacity — on a real screen that is a **black rectangle**, which is exactly the
 * "news item with no image" the homepage was showing. It fired on three real cases at once: a feed
 * that carried no image at all, a WordPress emoji sprite scraped as the lead photo (72×72, so it
 * loads fine and then fails the floor above — now also rejected server-side in
 * `src/server/newsFeed.ts`), and any hotlink-blocked origin.
 *
 * So the failure path now PAINTS something instead of nothing: a branded, per-topic gradient plate
 * with the site's mark and the topic label. It is drawn as inline SVG in a data URI — no network
 * request, nothing that can itself 404, no raster asset to ship — and it is deterministic per
 * topic, so the three cards in a row never come out identical by accident.
 */
const MIN_W = 400;
const MIN_H = 300;

/** Per-topic plate colours. Deliberately the same hues as the `TOPIC` table's `grad` in
 *  NewsCards.tsx, so a fallback plate reads as the same design system as a real photo's overlay. */
const PLATE: Record<NewsTopic, { from: string; to: string; accent: string }> = {
  ai: { from: '#1d0f33', to: '#06080c', accent: '#a78bfa' },
  ai_models: { from: '#2a0d2b', to: '#06080c', accent: '#e879f9' },
  ai_agents: { from: '#1d0f33', to: '#06080c', accent: '#a78bfa' },
  general: { from: '#14181f', to: '#06080c', accent: '#76B900' },
};

/**
 * The branded plate as a data URI.
 *
 * `encodeURIComponent` rather than base64: it keeps the markup readable in devtools and avoids
 * pulling in a btoa/unicode dance for the Hebrew label. The label is the topic name, never the
 * headline — a headline is already rendered as real text next to the image, and repeating it inside
 * the picture is what makes an auto-generated card look auto-generated.
 */
function platePng(topic: NewsTopic, seed: string): string {
  const p = PLATE[topic] ?? PLATE.general;
  // A stable per-item angle so adjacent cards differ without anything random re-rendering on every
  // paint. Hashing the item's own id keeps it identical across re-mounts.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const angle = 100 + (h % 60);
  const cx = 74 + (h % 13);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
<defs>
<linearGradient id="g" gradientTransform="rotate(${angle})">
<stop offset="0%" stop-color="${p.from}"/><stop offset="100%" stop-color="${p.to}"/>
</linearGradient>
<radialGradient id="glow" cx="${cx}%" cy="18%" r="70%">
<stop offset="0%" stop-color="${p.accent}" stop-opacity="0.22"/><stop offset="100%" stop-color="${p.accent}" stop-opacity="0"/>
</radialGradient>
<pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
<path d="M32 0H0V32" fill="none" stroke="${p.accent}" stroke-opacity="0.07" stroke-width="1"/>
</pattern>
</defs>
<rect width="640" height="360" fill="url(#g)"/>
<rect width="640" height="360" fill="url(#grid)"/>
<rect width="640" height="360" fill="url(#glow)"/>
<g opacity="0.92">
<circle cx="320" cy="150" r="34" fill="none" stroke="${p.accent}" stroke-opacity="0.55" stroke-width="2"/>
<circle cx="320" cy="150" r="5" fill="${p.accent}"/>
<path d="M320 116v-14M320 198v-14M286 150h-14M368 150h-14" stroke="${p.accent}" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round"/>
</g>
<text x="320" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#E8EDF4" fill-opacity="0.82">mrdaniel.co.il</text>
<text x="320" y="266" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="${p.accent}" fill-opacity="0.75">news</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\n/g, ''))}`;
}

export default function NewsImage({
  src,
  className = '',
  topic = 'general',
  seed = '',
}: {
  src?: string;
  className?: string;
  /** Drives the fallback plate's colours, so it matches the card's topic chip. */
  topic?: NewsTopic;
  /** Stable per-item string (the item id) so the plate's angle doesn't shift between renders. */
  seed?: string;
}) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>(src ? 'loading' : 'error');
  const [contain, setContain] = useState(false);
  // Hotlink-protected origins (TechTime answers 403 to a cross-site <img>) load fine through the
  // same-origin relay, which fetches with the publisher's own Referer. One retry through it before
  // painting the fallback plate.
  const [viaProxy, setViaProxy] = useState(false);
  const shown = src && viaProxy ? `/api/img-proxy?url=${encodeURIComponent(src)}` : src;

  const fallback = useMemo(() => platePng(topic, seed || src || topic), [topic, seed, src]);

  // No source, or the source failed / was too small: paint the branded plate. Never renders nothing,
  // which is what left a blank black well on the homepage.
  if (!src || status === 'error') {
    return (
      <img
        src={fallback}
        alt=""
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full object-cover object-center ${className}`}
      />
    );
  }

  return (
    <img
      src={shown}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={(e) => {
        const el = e.currentTarget;
        if (el.naturalWidth < MIN_W || el.naturalHeight < MIN_H) {
          setStatus('error');
          return;
        }
        const ratio = el.naturalWidth / Math.max(1, el.naturalHeight);
        setContain(ratio > 0 && ratio < 0.92);
        setStatus('ok');
      }}
      onError={() => {
        if (!viaProxy && src && /^https?:\/\//i.test(src)) setViaProxy(true);
        else setStatus('error');
      }}
      className={`absolute inset-0 h-full w-full ${
        contain ? 'object-contain bg-black/40' : 'object-cover object-center'
      } ${status === 'ok' ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300 ${className}`}
    />
  );
}

/** Exported for the tests: the plate is a self-contained data URI, so a card can never end up with
 *  an empty image well no matter what the feed served. */
export { platePng };
