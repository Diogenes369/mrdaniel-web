import { useEffect, useMemo, useRef, useState } from 'react';
import { useNewsFeed } from '../../services/newsService';
import { getA11yPrefs, subscribeA11y } from '../../lib/a11yStore';
import { isTouchFirst } from '../../lib/perfMode';
import { setFieldPhrases } from './fieldState';
import { selectFieldTitles } from './glyphs';
import { startField } from './fieldController';

/**
 * The site's background since 2026-10-01: a live scene rendered as typewriter characters, made of
 * the real AI headlines the site is already serving and the names of real tools. It replaces the
 * R3F wireframe scene (src/three/, since deleted), whose floating bodies were exactly the "generic AI" look the
 * redesign brief banned.
 *
 * Mounted once in App.tsx behind the same gate the old scene had (no reduced motion, no Save-Data,
 * no weak hardware); everyone else gets the plain carbon ground, which is a complete page.
 */
export default function GlyphField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const news = useNewsFeed();

  // The words the field is made of: this week's real headlines. The feed is already Hebrew-only and
  // AI-only (sanitizeAndKeep on the server), so nothing here needs filtering beyond length.
  const titles = useMemo(() => selectFieldTitles((news.data ?? []).map((n) => n.title)), [news.data]);
  useEffect(() => {
    setFieldPhrases(titles);
  }, [titles]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stopped = getA11yPrefs().stopAnimations;
    const unsub = subscribeA11y((p) => {
      stopped = p.stopAnimations;
    });
    const root = document.documentElement;
    const stop = startField(canvas, {
      touch: isTouchFirst(),
      isStopped: () => stopped,
      onReady: () => setReady(true),
      // CSS turns the DOM headline transparent while the field draws it, and back on the way out —
      // the real text never leaves the page, so selection, search and screen readers keep it.
      onHeadlineLive: (live) => {
        if (live) root.dataset.glyphHeadline = 'live';
        else delete root.dataset.glyphHeadline;
      },
    });
    return () => {
      unsub();
      stop();
    };
  }, []);

  return (
    <div className="glyph-field-layer" data-ready={ready ? '' : undefined} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
