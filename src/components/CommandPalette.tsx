import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';
import { searchEntries, type SearchEntry } from '../lib/searchIndex';
import { scrollToAndHighlight } from '../lib/searchHighlight';

/** Geektime-style "AI Terminal" command palette — open via the header's search icon or
 * Ctrl/Cmd+K, navigate with arrow keys + Enter or a click. Backed by the curated content index in
 * `lib/searchIndex.ts` (fuzzy substring-token matching), and on selection: closes immediately,
 * navigates cross-route if needed, then smooth-scrolls to and highlights the exact match via
 * `lib/searchHighlight.ts`. */
export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  const selectEntry = (entry: SearchEntry) => {
    setIsOpen(false);
    if (!entry.targetSelector) {
      navigate(entry.route);
      return;
    }
    if (entry.route !== location.pathname) {
      navigate(entry.route);
      // Give the new route's DOM a moment to mount before scrolling to a selector within it —
      // same margin the existing RouteScrollManager uses for hash navigation, just slightly
      // larger since a full page swap involves more mounting work than a same-page hash jump.
      window.setTimeout(() => scrollToAndHighlight(entry.targetSelector!), 150);
    } else {
      scrollToAndHighlight(entry.targetSelector);
    }
  };

  const filtered = useMemo(() => searchEntries(query), [query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, isOpen]);

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  useEffect(() => {
    const open = () => setIsOpen(true);
    window.addEventListener('open-command-palette', open);

    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('open-command-palette', open);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[activeIndex]) selectEntry(filtered[activeIndex]);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-start justify-center pt-[14vh] px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/90"
          />

          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            className="relative w-full max-w-lg bg-[#0D0E12] border border-white/15 shadow-[0_30px_80px_rgba(0,0,0,0.9)] rounded-2xl overflow-hidden"
            dir="rtl"
          >
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10">
              <Search className="w-4 h-4 text-zinc-500 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="חיפוש חכם... סוכנים, RAG, LLM, JARVIS..."
                className="flex-1 bg-transparent text-white placeholder-zinc-500 text-sm focus:outline-none"
              />
              <kbd className="hidden sm:inline text-[10px] font-mono text-zinc-500 border border-white/10 rounded px-1.5 py-0.5" dir="ltr">
                ESC
              </kbd>
            </div>

            <div className="max-h-[50vh] overflow-y-auto momentum-scroll p-2">
              {filtered.length === 0 ? (
                <p className="text-center text-zinc-500 text-sm py-8">לא נמצאו תוצאות</p>
              ) : (
                filtered.map((entry, i) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => selectEntry(entry)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-right transition-colors cursor-pointer ${
                      i === activeIndex ? 'bg-brand-500/15 text-white' : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    <entry.icon className={`w-4 h-4 shrink-0 mt-0.5 ${i === activeIndex ? 'text-brand-400' : 'text-zinc-500'}`} />
                    <span className="flex flex-col items-start min-w-0">
                      <span className="text-sm font-medium">{entry.title}</span>
                      <span className="text-xs text-zinc-500 truncate max-w-full">{entry.snippet}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
