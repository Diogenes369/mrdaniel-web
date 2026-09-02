import { useState } from 'react';

/**
 * Feed lead image for a news card / modal. Sits `absolute inset-0` inside an aspect-ratio box; the
 * caller renders a topic-gradient + watermark BEHIND it, which shows through when the image is
 * missing or fails to load (this component renders nothing in that case).
 *
 * - `object-cover object-center` by default so subjects/faces stay centred, never edge-cropped.
 * - On load it measures the natural ratio: a portrait / tall image (ratio < ~0.92) switches to
 *   `object-contain` on a `bg-black/40` letterbox instead of cropping the subject out of frame.
 */
export default function NewsImage({ src, className = '' }: { src?: string; className?: string }) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>(src ? 'loading' : 'error');
  const [contain, setContain] = useState(false);

  if (!src || status === 'error') return null;

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={(e) => {
        const el = e.currentTarget;
        const ratio = el.naturalWidth / Math.max(1, el.naturalHeight);
        setContain(ratio > 0 && ratio < 0.92);
        setStatus('ok');
      }}
      onError={() => setStatus('error')}
      className={`absolute inset-0 h-full w-full ${
        contain ? 'object-contain bg-black/40' : 'object-cover object-center'
      } ${status === 'ok' ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300 ${className}`}
    />
  );
}
