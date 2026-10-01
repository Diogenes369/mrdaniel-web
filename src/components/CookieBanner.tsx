import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import GlyphButton from './ui/GlyphButton';
import { useFieldQuiet } from './field/fieldState';

// Key and values unchanged: the tracker and returning visitors read them.
const STORAGE_KEY = 'cyber_cookie_consent';

/**
 * Cookie notice, rewritten 2026-10-01 in the glyph world: plain Hebrew that says what the cookies
 * do, a sharp frame, one primary action. The old "PROTOCOL :: DATA_PACKETS_REQUIRED / ENCRYPTION:
 * AES-256" chrome was exactly the robot costume the redesign removes (and the AES badge claimed
 * something nobody had verified).
 */
export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const quiet = useFieldQuiet();

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      return; // localStorage inaccessible (private browsing etc.) — nothing to persist, skip the banner
    }
    const id = window.setTimeout(() => setVisible(true), 900);
    return () => window.clearTimeout(id);
  }, []);

  const close = (value: 'accepted' | 'rejected') => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* private browsing — nothing we can do, just close */
    }
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={quiet}
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 240 }}
          role="dialog"
          aria-live="polite"
          aria-label="הודעה על עוגיות"
          className="glyph-frame fixed inset-x-4 bottom-4 z-50 !bg-ground p-5 font-type sm:inset-x-auto sm:bottom-28 sm:left-6 sm:w-[24rem]"
        >
          <p className="poster text-[1.35rem] text-ink-paper">עוגיות, בקצרה</p>
          <p className="mt-2 font-sans text-[15px] leading-relaxed text-ink-muted">
            האתר משתמש בעוגיות כדי להבין אילו עמודים עוזרים ולתקן תקלות. אפשר גם לסרב.{' '}
            <Link to="/privacy" className="story-link text-[13px]">
              מדיניות הפרטיות
            </Link>
          </p>
          <div className="mt-5 flex items-center gap-5">
            <GlyphButton onClick={() => close('accepted')} className="!min-h-11 !px-6 !text-[14px]">
              אישור
            </GlyphButton>
            <button type="button" onClick={() => close('rejected')} className="story-link text-[14px]">
              בלי עוגיות
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
