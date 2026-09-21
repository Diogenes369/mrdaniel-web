import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';

const STORAGE_KEY = 'cyber_cookie_consent';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

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

  const handleAccept = () => {
    confetti({
      particleCount: 70,
      spread: 60,
      startVelocity: 32,
      origin: { x: 0.12, y: 0.92 },
      colors: ['#76B900', '#00FF66', '#9FE870'],
      scalar: 0.85,
      disableForReducedMotion: true,
    });
    close('accepted');
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 50, scale: 0.95 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: 30, scale: 0.95 }}
          transition={{ type: 'spring', damping: 24, stiffness: 220 }}
          role="dialog"
          aria-live="polite"
          aria-label="הודעת פרטיות ועוגיות"
          className="fixed bottom-28 left-4 md:left-6 z-50 max-w-md w-[calc(100%-2rem)] md:w-[calc(100%-3rem)] bg-[#0D0E12] border border-emerald-500/20 shadow-[0_0_30px_rgba(0,0,0,0.8)] rounded-2xl p-5"
        >
          <div className="flex items-center gap-2.5 mb-3">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-400 shadow-[0_0_8px_rgba(0,255,102,0.8)]" />
            </span>
            <span className="font-tech font-semibold text-xs tracking-widest text-brand-400 uppercase" dir="ltr">
              PROTOCOL :: DATA_PACKETS_REQUIRED
            </span>
          </div>

          <p className="text-zinc-300 text-sm leading-relaxed mb-4">
            אנחנו משתמשים בעוגיות (Cookies) כדי לייעל את ארכיטקטורת האתר, לאבחן תנועה ולמנוע כשלים במטריצה. אל דאגה, סוכני ה-AI שלנו לא אוכלים פירורים.
          </p>

          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="font-tech text-xs tracking-wider text-zinc-300 border border-white/10 rounded-full px-2.5 py-1" dir="ltr">
              ENCRYPTION: AES-256
            </span>
            <span className="font-tech text-xs tracking-wider text-brand-400 border border-brand-500/30 rounded-full px-2.5 py-1 flex items-center gap-1.5" dir="ltr">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
              STATUS: ACTIVE
            </span>
          </div>

          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleAccept}
              className="flex-1 bg-brand-500 text-black font-bold text-sm rounded-xl py-2.5 shadow-[0_0_16px_rgba(0,255,102,0.35)] hover:shadow-[0_0_26px_rgba(0,255,102,0.55)] transition-shadow cursor-pointer"
            >
              אשר פרוטוקול
            </motion.button>
            <button
              onClick={() => close('rejected')}
              className="text-zinc-500 hover:text-zinc-300 text-sm font-medium transition-colors px-3 py-2.5 cursor-pointer"
            >
              מנע מעקב
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
