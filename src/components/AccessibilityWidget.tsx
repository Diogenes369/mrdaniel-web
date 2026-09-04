import { useEffect, useRef, useState, type ComponentType } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Accessibility,
  X,
  Type,
  Minus,
  Plus,
  Contrast,
  Eye,
  PaintBucket,
  Languages,
  Link2,
  PauseCircle,
  MousePointer2,
  RotateCcw,
} from 'lucide-react';
import {
  getA11yPrefs,
  setA11yPrefs,
  resetA11yPrefs,
  subscribeA11y,
  TEXT_SCALES,
  type A11yPrefs,
  type A11yLang,
  type A11yContrast,
} from '../lib/a11yStore';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

const STRINGS: Record<A11yLang, {
  title: string;
  subtitle: string;
  openLabel: string;
  closeLabel: string;
  langHe: string;
  langEn: string;
  textSize: string;
  decrease: string;
  increase: string;
  contrast: string;
  contrastHigh: string;
  contrastInvert: string;
  contrastMono: string;
  readableFont: string;
  readableFontDesc: string;
  highlightLinks: string;
  highlightLinksDesc: string;
  stopAnimations: string;
  stopAnimationsDesc: string;
  largeCursor: string;
  largeCursorDesc: string;
  resetAll: string;
  footerNote: string;
}> = {
  he: {
    title: 'נגישות',
    subtitle: 'התאמת תצוגה אישית',
    openLabel: 'פתיחת תפריט נגישות',
    closeLabel: 'סגירת תפריט נגישות',
    langHe: 'עברית',
    langEn: 'English',
    textSize: 'גודל טקסט',
    decrease: 'הקטנת טקסט',
    increase: 'הגדלת טקסט',
    contrast: 'מצבי ניגודיות',
    contrastHigh: 'ניגודיות גבוהה',
    contrastInvert: 'ניגודיות הפוכה',
    contrastMono: 'גווני אפור',
    readableFont: 'פונט קריא',
    readableFontDesc: 'גופן ברור וקריא במיוחד לכל הטקסט באתר',
    highlightLinks: 'הדגשת קישורים',
    highlightLinksDesc: 'מסגרת וקו תחתון בולטים לכל קישור וכפתור',
    stopAnimations: 'עצירת אנימציות',
    stopAnimationsDesc: 'עצירת תנועה, מעברים ורקע תלת-ממדי',
    largeCursor: 'סמן מוגדל',
    largeCursorDesc: 'סמן עכבר גדול ובולט יותר',
    resetAll: 'איפוס כל ההגדרות',
    footerNote: 'ההגדרות נשמרות אוטומטית בדפדפן שלך',
  },
  en: {
    title: 'Accessibility',
    subtitle: 'Personal display settings',
    openLabel: 'Open accessibility menu',
    closeLabel: 'Close accessibility menu',
    langHe: 'עברית',
    langEn: 'English',
    textSize: 'Text size',
    decrease: 'Decrease text size',
    increase: 'Increase text size',
    contrast: 'Contrast modes',
    contrastHigh: 'High contrast',
    contrastInvert: 'Inverted contrast',
    contrastMono: 'Grayscale',
    readableFont: 'Readable font',
    readableFontDesc: 'A clear, highly-legible font for all site text',
    highlightLinks: 'Highlight links',
    highlightLinksDesc: 'A strong outline and underline on every link and button',
    stopAnimations: 'Stop animations',
    stopAnimationsDesc: 'Pauses motion, transitions and the 3D background',
    largeCursor: 'Large cursor',
    largeCursorDesc: 'A bigger, high-visibility mouse cursor',
    resetAll: 'Reset all settings',
    footerNote: 'Settings are saved automatically in your browser',
  },
};

function ToggleRow({
  icon: Icon,
  label,
  description,
  active,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full flex items-center gap-3 rounded-xl border p-3 text-start transition-colors cursor-pointer ${
        active ? 'bg-white/10 border-white/30' : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'
      }`}
    >
      <span className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${active ? 'bg-white text-black' : 'bg-white/10 text-zinc-300'}`}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="block text-xs text-zinc-400 mt-0.5 leading-snug">{description}</span>
      </span>
      <span
        role="switch"
        aria-checked={active}
        aria-hidden="true"
        className={`shrink-0 w-9 h-5 rounded-full p-0.5 transition-colors ${active ? 'bg-white' : 'bg-white/15'}`}
      >
        <span
          className="block w-4 h-4 rounded-full bg-black transition-transform"
          style={{ transform: active ? 'translateX(-16px)' : 'translateX(0)' }}
        />
      </span>
    </button>
  );
}

export default function AccessibilityWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [prefs, setPrefs] = useState<A11yPrefs>(() => getA11yPrefs());
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => subscribeA11y(setPrefs), []);

  const t = STRINGS[prefs.lang];
  const isRtl = prefs.lang === 'he';

  // Lock background scroll while the panel is open, matching the AI chat widget's drawer.
  // Shared, reference-counted — see useBodyScrollLock for why a local
  // save/restore of body.style.overflow permanently locked the page when overlays
  // overlapped.
  useBodyScrollLock(isOpen);

  // Escape closes the panel and returns focus to the trigger; Tab is trapped inside the panel
  // while it's open, matching the "Full ARIA compliance with keyboard navigation" requirement.
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    const focusId = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('button, [href], input')?.focus();
    }, 50);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(focusId);
    };
  }, [isOpen]);

  const scaleIndex = TEXT_SCALES.indexOf(prefs.textScale);
  const setTextScale = (dir: 1 | -1) => {
    const next = TEXT_SCALES[Math.min(TEXT_SCALES.length - 1, Math.max(0, scaleIndex + dir))];
    setA11yPrefs({ textScale: next });
  };
  const setContrast = (mode: A11yContrast) => {
    setA11yPrefs({ contrast: prefs.contrast === mode ? 'none' : mode });
  };

  const CONTRAST_MODES: { mode: A11yContrast; label: string }[] = [
    { mode: 'high', label: t.contrastHigh },
    { mode: 'invert', label: t.contrastInvert },
    { mode: 'mono', label: t.contrastMono },
  ];

  return (
    <>
      {/* Full-viewport color overlay for grayscale/invert contrast modes — see index.css for why
          this is used instead of a `filter` on a shared ancestor. */}
      <div className="a11y-color-overlay" aria-hidden="true" />

      {/* Floating trigger — stacked directly above the AI chat widget's launcher button. */}
      <motion.button
        ref={triggerRef}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="a11y-panel"
        aria-label={isOpen ? t.closeLabel : t.openLabel}
        title={isOpen ? t.closeLabel : t.openLabel}
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-[calc(1.5rem+env(safe-area-inset-left))] z-40 w-11 h-11 md:w-12 md:h-12 rounded-full bg-[#0D0E12] border border-white/25 hover:border-white/50 flex items-center justify-center cursor-pointer transition-all duration-300"
      >
        {isOpen ? (
          <X className="w-5 h-5 text-white" strokeWidth={2} />
        ) : (
          <Accessibility className="w-5 h-5 text-white" strokeWidth={1.75} />
        )}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="a11y-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="a11y-panel-title"
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.96 }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            dir={isRtl ? 'rtl' : 'ltr'}
            className="fixed bottom-[calc(10rem+env(safe-area-inset-bottom))] left-3 md:left-6 right-3 md:right-auto z-[70] md:w-[400px] max-h-[80dvh] flex flex-col bg-[#0b0c10] border border-white/15 rounded-3xl shadow-[0_30px_80px_rgba(0,0,0,0.9)] overflow-hidden"
          >
            {/* Header + language switcher */}
            <div className="p-4 md:p-5 bg-[#0D0E12] border-b border-white/10 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <Accessibility className="w-4 h-4 text-white" />
                  </span>
                  <div>
                    <h2 id="a11y-panel-title" className="font-display font-semibold text-sm text-white">
                      {t.title}
                    </h2>
                    <p className="text-zinc-500 text-xs mt-0.5">{t.subtitle}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    triggerRef.current?.focus();
                  }}
                  aria-label={t.closeLabel}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div role="radiogroup" aria-label="Language / שפה" className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
                <button
                  type="button"
                  role="radio"
                  aria-checked={prefs.lang === 'he'}
                  onClick={() => setA11yPrefs({ lang: 'he' })}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    prefs.lang === 'he' ? 'bg-white text-black' : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  <Languages size={13} /> {t.langHe}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={prefs.lang === 'en'}
                  onClick={() => setA11yPrefs({ lang: 'en' })}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    prefs.lang === 'en' ? 'bg-white text-black' : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  <Languages size={13} /> {t.langEn}
                </button>
              </div>
            </div>

            {/* Scrollable settings body */}
            <div className="flex-1 min-h-0 overflow-y-auto momentum-scroll p-4 md:p-5 space-y-5">
              {/* Text size */}
              <div>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                  <Type size={13} /> {t.textSize}
                </span>
                <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-xl p-1.5">
                  <button
                    type="button"
                    onClick={() => setTextScale(-1)}
                    disabled={scaleIndex === 0}
                    aria-label={t.decrease}
                    className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white cursor-pointer transition-colors"
                  >
                    <Minus size={15} />
                  </button>
                  <span className="flex-1 text-center text-sm font-mono text-white" aria-live="polite">
                    {prefs.textScale}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setTextScale(1)}
                    disabled={scaleIndex === TEXT_SCALES.length - 1}
                    aria-label={t.increase}
                    className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white cursor-pointer transition-colors"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              {/* Contrast modes */}
              <div>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                  <Contrast size={13} /> {t.contrast}
                </span>
                <div role="radiogroup" aria-label={t.contrast} className="grid grid-cols-3 gap-2">
                  {CONTRAST_MODES.map(({ mode, label }) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={prefs.contrast === mode}
                      onClick={() => setContrast(mode)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition-colors cursor-pointer ${
                        prefs.contrast === mode
                          ? 'bg-white text-black border-white'
                          : 'bg-white/[0.03] border-white/10 text-zinc-300 hover:bg-white/[0.06]'
                      }`}
                    >
                      {mode === 'high' && <Eye size={16} />}
                      {mode === 'invert' && <Contrast size={16} />}
                      {mode === 'mono' && <PaintBucket size={16} />}
                      <span className="text-[11px] leading-tight font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggle rows */}
              <div className="space-y-2">
                <ToggleRow
                  icon={Type}
                  label={t.readableFont}
                  description={t.readableFontDesc}
                  active={prefs.readableFont}
                  onClick={() => setA11yPrefs({ readableFont: !prefs.readableFont })}
                />
                <ToggleRow
                  icon={Link2}
                  label={t.highlightLinks}
                  description={t.highlightLinksDesc}
                  active={prefs.highlightLinks}
                  onClick={() => setA11yPrefs({ highlightLinks: !prefs.highlightLinks })}
                />
                <ToggleRow
                  icon={PauseCircle}
                  label={t.stopAnimations}
                  description={t.stopAnimationsDesc}
                  active={prefs.stopAnimations}
                  onClick={() => setA11yPrefs({ stopAnimations: !prefs.stopAnimations })}
                />
                <ToggleRow
                  icon={MousePointer2}
                  label={t.largeCursor}
                  description={t.largeCursorDesc}
                  active={prefs.largeCursor}
                  onClick={() => setA11yPrefs({ largeCursor: !prefs.largeCursor })}
                />
              </div>
            </div>

            {/* Footer: reset */}
            <div className="p-3 md:p-4 bg-zinc-950 border-t border-white/10 shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => resetA11yPrefs()}
                className="w-full py-2.5 bg-white/10 hover:bg-white/15 text-white font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw size={14} /> {t.resetAll}
              </button>
              <p className="text-center text-[11px] text-zinc-500 mt-2">{t.footerNote}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
