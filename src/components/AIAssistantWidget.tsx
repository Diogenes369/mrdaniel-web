import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { panelMotion } from '../lib/modalMotion';
import { Terminal, X } from 'lucide-react';
import IntakeChat from './chat/IntakeChat';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

// Firebase (~200KB gzipped) is dynamically imported, not statically — same reasoning as App.tsx's
// own `loadTracker`, kept out of this widget's bundle until a visitor actually opens the chat.
import { loadTracker } from '../lib/loadTracker';

/**
 * The floating chat: a launcher in the corner and, behind it, the chat agent (2026-10-07) in a
 * drawer. The conversation is the one on /chat (lib/intakeChat.ts), so a visitor can start here and
 * continue on the full page. On /chat itself the launcher stays out of the way: the page is the chat.
 *
 * It used to be its own assistant with canned answers (one promoted a paid guide from a store that
 * no longer exists), a keyword trap that popped a form open, and error replies that showed a
 * private address. The agent replaced all of it.
 */
export default function AIAssistantWidget() {
  const { pathname } = useLocation();
  const onChatPage = pathname === '/chat';
  const [isOpen, setIsOpen] = useState(false);
  // Hide-on-scroll-down for the floating launcher (see the launcher markup below).
  const [tucked, setTucked] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - last;
      if (Math.abs(dy) < 6) return;
      setTucked(dy > 0 && y > 140);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (isOpen) loadTracker().then((t) => t.trackChatOpen());
  }, [isOpen]);

  useEffect(() => {
    const handleOpenAi = () => setIsOpen(true);
    window.addEventListener('open-ai-chat', handleOpenAi);
    return () => window.removeEventListener('open-ai-chat', handleOpenAi);
  }, []);

  // Navigating to /chat (the drawer's expand button) closes the drawer: the page takes over.
  useEffect(() => {
    if (onChatPage) setIsOpen(false);
  }, [onChatPage]);

  // Shared, reference-counted — see useBodyScrollLock for why a local save/restore of
  // body.style.overflow permanently locked the page when overlays overlapped.
  useBodyScrollLock(isOpen);

  if (onChatPage) return null;

  return (
    <>
      {/* Floating launcher — square since 2026-10-01 (the redesign bans round buttons). It tucks out
          of the way while the visitor scrolls DOWN (reading), so it never sits on the text being
          read, and springs back on any scroll up, near the top, or when it takes keyboard focus. */}
      <motion.div
        className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-[calc(1.5rem+env(safe-area-inset-left))] z-40 flex items-center gap-3"
        animate={tucked && !isOpen ? { x: -96, opacity: 0 } : { x: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        style={{ pointerEvents: tucked && !isOpen ? 'none' : undefined }}
        onFocusCapture={() => setTucked(false)}
      >
        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(!isOpen)}
          className="relative w-11 h-11 md:w-12 md:h-12 rounded-none bg-[#0D0E12] border border-brand-400/35 hover:border-brand-400/70 flex items-center justify-center cursor-pointer transition-colors duration-300"
          aria-label={isOpen ? 'סגירת הצ׳אט' : 'שיחה עם הסוכן של דניאל'}
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <X className="w-5 h-5 text-brand-400" strokeWidth={2} />
          ) : (
            <>
              <Terminal className="w-5 h-5 text-brand-400" strokeWidth={1.75} />
              {/* A static "available" mark; the pinging pulse was removed with the redesign. */}
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-brand-400" />
            </>
          )}
        </motion.button>
      </motion.div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            {...panelMotion}
            className="chat-drawer fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-50 md:left-6 md:right-auto md:w-[440px]"
            dir="rtl"
          >
            <IntakeChat variant="drawer" onClose={() => setIsOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
