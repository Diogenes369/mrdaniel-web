import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { GROK_COPY } from '../../data/siteCopy';
import { rtl } from '../../lib/rtl';
import { useFieldQuiet } from '../field/fieldState';

/** The deck itself: plain HTML in public/grok-deck (GSAP, its own glyph field, the bot). */
export const GROK_DECK_SRC = '/grok-deck/index.html';

/**
 * The Grok Bot deck in an iframe, so its full-screen stage, global styles and key handling never
 * touch the site. 16:9 from md up, 9:16 on phones, where the deck switches to its vertical layout by
 * itself. Until the frame nears the viewport it shows a still of the cover; inside the frame the
 * deck starts its opening only once it is actually on screen, and sleeps whenever it is scrolled away.
 */
export default function GrokDeckFrame({ eager = false, className = '' }: { eager?: boolean; className?: string }) {
  const c = GROK_COPY;
  const box = useRef<HTMLDivElement | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [mounted, setMounted] = useState(eager || typeof IntersectionObserver === 'undefined');
  const quiet = useFieldQuiet();
  const setBox = useCallback(
    (el: HTMLDivElement | null) => {
      box.current = el;
      return quiet(el);
    },
    [quiet]
  );

  useEffect(() => {
    const el = box.current;
    if (mounted || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMounted(true);
          io.disconnect();
        }
      },
      { rootMargin: '600px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mounted]);

  // Full screen on the frame itself; where that is refused (some in-app browsers), the deck opens
  // on its own in a new tab, where it fills the window anyway.
  const openFull = () => {
    const el = frame.current;
    const fallback = () => {
      window.open(GROK_DECK_SRC, '_blank', 'noopener');
    };
    if (!el || typeof el.requestFullscreen !== 'function') {
      fallback();
      return;
    }
    el.requestFullscreen().catch(fallback);
  };

  return (
    <div className={className}>
      <div ref={setBox} className="glyph-frame grok-frame">
        {mounted ? (
          <iframe
            ref={frame}
            src={GROK_DECK_SRC}
            title={rtl(c.frameTitle)}
            allow="fullscreen"
            allowFullScreen
            className="grok-frame__deck"
          />
        ) : (
          <picture>
            <source media="(max-width: 767px)" srcSet="/grok-deck/poster-portrait.jpg" />
            <img
              src="/grok-deck/poster-landscape.jpg"
              alt=""
              className="grok-frame__deck object-cover"
              loading="lazy"
              decoding="async"
            />
          </picture>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="font-type text-[12.5px] text-ink-faint">{rtl(c.howTo)}</p>
        <button type="button" onClick={openFull} className="story-link text-[14px]">
          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          {rtl(c.fullscreen)}
        </button>
      </div>
    </div>
  );
}
