import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentId, AgentState, StudioDeck, StudioLogLine, StudioSlide } from './carouselStudioTypes';
import { freshAgents } from './carouselStudioTypes';
import { researchSource, synthesizeStudioDeck, deckCaption, type ResearchInput } from './web3CarouselApi';
import { directDeck, renderStudioDeck } from './web3CarouselRenderer';

/**
 * Orchestrator for the 4-agent Carousel Studio pipeline. Runs the agents sequentially, streaming a
 * per-agent status + a live log the dashboard renders as the "Multi-Agent Live Execution Feed".
 * The deck payload survives background re-renders via sessionStorage (images are re-rendered from
 * the payload on restore — data URLs for a 12-slide 1080×1350 deck blow past the quota).
 */

const DECK_KEY = 'cstudio:deck_v1';

function ss(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

interface Persisted {
  deck: StudioDeck;
  savedAt: number;
}

function saveDeck(deck: StudioDeck) {
  try {
    ss()?.setItem(DECK_KEY, JSON.stringify({ deck, savedAt: Date.now() } satisfies Persisted));
  } catch {
    /* quota — non-fatal, deck just won't persist */
  }
}
function loadDeck(): StudioDeck | null {
  try {
    const raw = ss()?.getItem(DECK_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Persisted;
    return p?.deck?.slides?.length ? p.deck : null;
  } catch {
    return null;
  }
}

export type StudioRunInput = ResearchInput;

export function useCarouselStudio() {
  const [agents, setAgents] = useState<AgentState[]>(freshAgents);
  const [log, setLog] = useState<StudioLogLine[]>([]);
  const [deck, setDeck] = useState<StudioDeck | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [renderProgress, setRenderProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const runSeq = useRef(0);

  // Restore a previous deck + re-render its images on mount.
  useEffect(() => {
    const restored = loadDeck();
    if (!restored) return;
    setDeck(restored);
    setAgents((prev) => prev.map((a) => ({ ...a, phase: 'done', detail: 'שוחזר מהפעלה קודמת' })));
    renderStudioDeck(restored)
      .then(setImages)
      .catch(() => setImages([]));
  }, []);

  const patchAgent = useCallback((id: AgentId, patch: Partial<AgentState>) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);

  const pushLog = useCallback((agent: AgentId, text: string) => {
    setLog((prev) => [...prev.slice(-60), { t: Date.now(), agent, text }]);
  }, []);

  const run = useCallback(
    async (input: StudioRunInput) => {
      const seq = ++runSeq.current;
      setBusy(true);
      setError(null);
      setNotice(null);
      setImages([]);
      setRenderProgress(null);
      setAgents(freshAgents());
      setLog([]);

      const stale = () => runSeq.current !== seq;

      try {
        // ── Agent 1 · Scraper & Researcher ────────────────────────────────────────────────
        patchAgent('scraper', { phase: 'running', detail: 'מחלץ תוכן מהמקור…', startedAt: Date.now() });
        pushLog('scraper', input.mode === 'url' ? `סורק את הקישור: ${input.url}` : input.mode === 'preset' ? `טוען תדריך: ${input.preset?.label}` : 'מנתח טקסט חופשי');
        const { brief, notice: researchNotice } = await researchSource(input);
        if (stale()) return;
        if (researchNotice) {
          setNotice(researchNotice);
          pushLog('scraper', researchNotice);
        }
        pushLog('scraper', `חולצו ${brief.hooks.length} hooks מועמדים ו-${brief.takeaways.length} תובנות מפתח`);
        pushLog('scraper', `נושא ויזואלי: ${brief.theme}`);
        patchAgent('scraper', { phase: 'done', detail: `${brief.body.length} תווים · ${brief.takeaways.length} תובנות`, endedAt: Date.now() });

        // ── Agent 2 · Copywriter & Hook Architect ────────────────────────────────────────
        patchAgent('copywriter', { phase: 'running', detail: 'כותב תסריט קרוסלה בעברית…', startedAt: Date.now() });
        pushLog('copywriter', 'מנסח Hook, שקפי ערך ו-CTA — 10 עד 14 שקופיות');
        let built = await synthesizeStudioDeck(brief, input.topic);
        if (stale()) return;
        if (!built.synthesized) {
          const msg = `מנוע ה-AI לא זמין (${built.fallbackReason}) — נבנתה קרוסלה דטרמיניסטית מקומית.`;
          setNotice(msg);
          pushLog('copywriter', msg);
        }
        pushLog('copywriter', `נוצרו ${built.slides.length} שקופיות · ${built.slides.filter((s) => s.role === 'value').length} שקפי ערך`);
        patchAgent('copywriter', {
          phase: 'done',
          detail: `${built.slides.length} שקופיות · ${built.synthesized ? 'טקסט AI' : 'גיבוי מקומי'}`,
          endedAt: Date.now(),
        });

        // ── Agent 3 · WEB3 Creative Director ─────────────────────────────────────────────
        patchAgent('director', { phase: 'running', detail: 'מקצה layout, גוונים והילות ניאון…', startedAt: Date.now() });
        built = directDeck(built);
        const layoutCounts = built.slides.reduce<Record<string, number>>((acc, s) => {
          acc[s.layout] = (acc[s.layout] ?? 0) + 1;
          return acc;
        }, {});
        pushLog('director', `פריסות: ${Object.entries(layoutCounts).map(([k, v]) => `${k}×${v}`).join(' · ')}`);
        pushLog('director', 'פלטת WEB3: אובסידיאן #06080D · ירוק חשמלי #00FF66 · ציאן #00F0FF · כסף מתכתי');
        patchAgent('director', { phase: 'done', detail: `${Object.keys(layoutCounts).length} סוגי פריסה`, endedAt: Date.now() });
        if (stale()) return;
        setDeck(built);
        saveDeck(built);

        // ── Agent 4 · Compositor & Export Engine ─────────────────────────────────────────
        patchAgent('compositor', { phase: 'running', detail: 'מרנדר PNG 1080×1350…', startedAt: Date.now() });
        setRenderProgress({ done: 0, total: built.slides.length });
        const imgs = await renderStudioDeck(built, (done, total) => {
          if (!stale()) setRenderProgress({ done, total });
        });
        if (stale()) return;
        setImages(imgs);
        setRenderProgress(null);
        pushLog('compositor', `${imgs.length} שקופיות רונדרו · מוכן לייצוא ZIP`);
        patchAgent('compositor', { phase: 'done', detail: `${imgs.length} שקופיות · 4K PNG`, endedAt: Date.now() });
      } catch (e) {
        if (stale()) return;
        const msg = (e as Error).message || 'הפייפליין נכשל.';
        setError(msg);
        setAgents((prev) => prev.map((a) => (a.phase === 'running' ? { ...a, phase: 'error', detail: msg } : a)));
      } finally {
        if (!stale()) setBusy(false);
      }
    },
    [patchAgent, pushLog]
  );

  /** Inline edit to one slide → re-render just the deck (cheap enough to re-render all slides). */
  const updateSlide = useCallback(
    async (index: number, patch: Partial<StudioSlide>) => {
      if (!deck) return;
      const slides = deck.slides.map((s, i) => (i === index ? { ...s, ...patch } : s));
      const next: StudioDeck = { ...deck, slides, caption: deckCaption(deck.title, slides) };
      setDeck(next);
      saveDeck(next);
      setRenderProgress({ done: 0, total: slides.length });
      try {
        const imgs = await renderStudioDeck(next, (done, total) => setRenderProgress({ done, total }));
        setImages(imgs);
      } finally {
        setRenderProgress(null);
      }
    },
    [deck]
  );

  const reset = useCallback(() => {
    runSeq.current++;
    setDeck(null);
    setImages([]);
    setError(null);
    setNotice(null);
    setRenderProgress(null);
    setAgents(freshAgents());
    setLog([]);
    setBusy(false);
    try {
      ss()?.removeItem(DECK_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return { agents, log, deck, images, busy, renderProgress, error, notice, run, updateSlide, reset };
}
