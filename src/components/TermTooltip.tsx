import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
import { lookupTerm } from '../data/glossary';

/**
 * Wraps a technical term with a subtle dotted underline + an "מה זה אומר?" info affordance.
 *
 * - Singleton: only ONE term is open at a time across the whole page (module-level store) —
 *   opening a new one closes any other.
 * - Desktop (>= md): a relative popover next to the term, on hover or click; closes on Escape,
 *   a click outside, or clicking the term again.
 * - Mobile (< md): the popover would clip at the screen edge, so instead the definition renders
 *   in a fixed, centered card over a dark backdrop (portaled to <body>), constrained to
 *   `w-[90vw] max-w-sm`, closed by tapping the backdrop, the X, or Escape (body scroll locked).
 *
 * Renders as plain text when the term has no glossary entry, so it's always safe to wrap.
 */

// ---- module-level singleton: the id of the currently open tooltip (or null) ----
let openId: string | null = null;
const listeners = new Set<() => void>();
function setOpenId(id: string | null) {
  if (openId === id) return;
  openId = id;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const getSnapshot = () => openId;

export default function TermTooltip({
  term,
  children,
  className = '',
}: {
  term: string;
  children?: ReactNode;
  className?: string;
}) {
  const entry = lookupTerm(term);
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const isOpen = current === id;

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Close this tooltip when it unmounts if it happened to be the open one.
  useEffect(
    () => () => {
      if (openId === id) setOpenId(null);
    },
    [id]
  );

  // Desktop: close on outside click / Escape.
  useEffect(() => {
    if (!isOpen || isMobile) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenId(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenId(null);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, isMobile]);

  // Mobile modal: lock body scroll + Escape to close.
  useEffect(() => {
    if (!isOpen || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenId(null);
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, isMobile]);

  if (!entry) return <>{children ?? term}</>;

  return (
    <span ref={rootRef} className={`group/tt relative inline-block ${className}`}>
      <button
        type="button"
        aria-label={`מה זה אומר? ${term}`}
        aria-expanded={isOpen}
        aria-describedby={isOpen ? id : undefined}
        onClick={() => setOpenId(isOpen ? null : id)}
        className="inline-flex items-baseline gap-0.5 border-b border-dotted border-brand-400/50 text-inherit transition-colors hover:border-brand-400 focus:outline-none focus-visible:border-brand-400"
      >
        {children ?? term}
        <Info className="w-3 h-3 shrink-0 translate-y-0.5 text-brand-400/70" aria-hidden="true" />
      </button>

      {/* Desktop popover — relative to the term. Hover always; click keeps it open. */}
      <span
        id={id}
        role="tooltip"
        className={`hidden md:block pointer-events-none absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-white/15 bg-carbon-900 p-3 text-right text-xs font-normal leading-relaxed text-zinc-300 shadow-2xl transition-opacity duration-150 ${
          isOpen
            ? 'opacity-100'
            : 'opacity-0 group-hover/tt:pointer-events-auto group-hover/tt:opacity-100'
        }`}
      >
        <strong className="mb-1 block text-brand-300">{entry.label}</strong>
        {entry.text}
      </span>

      {/* Mobile — fixed centered card over a dark backdrop, portaled to <body>. */}
      {isOpen &&
        isMobile &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm md:hidden"
            onClick={() => setOpenId(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${id}-t`}
              className="relative w-[90vw] max-w-sm rounded-2xl border border-white/15 bg-carbon-900 p-5 text-right shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setOpenId(null)}
                aria-label="סגירה"
                className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white transition-colors hover:border-brand-400/60 hover:text-brand-300"
              >
                <X className="w-4 h-4" />
              </button>
              <strong id={`${id}-t`} className="mb-2 block pl-10 text-base text-brand-300">
                {entry.label}
              </strong>
              <p className="text-sm leading-relaxed text-zinc-300">{entry.text}</p>
            </div>
          </div>,
          document.body
        )}
    </span>
  );
}
