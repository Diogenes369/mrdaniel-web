import { useId, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { lookupTerm } from '../data/glossary';

/**
 * Wraps a technical term with a subtle dotted underline + an "מה זה אומר?" info affordance. The
 * plain-Hebrew explanation shows on hover (desktop) and on click/tap (touch), and closes on blur
 * or Escape. If the term has no glossary entry it renders as plain text, so it's always safe to
 * wrap. Definitions live in src/data/glossary.ts.
 */
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
  const [open, setOpen] = useState(false);
  const id = useId();

  if (!entry) return <>{children ?? term}</>;

  return (
    <span className={`group/tt relative inline-block ${className}`}>
      <button
        type="button"
        aria-label={`מה זה אומר? ${term}`}
        aria-expanded={open}
        aria-describedby={id}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className="inline-flex items-baseline gap-0.5 border-b border-dotted border-brand-400/50 text-inherit transition-colors hover:border-brand-400 focus:outline-none focus-visible:border-brand-400"
      >
        {children ?? term}
        <Info className="w-3 h-3 shrink-0 translate-y-0.5 text-brand-400/70" aria-hidden="true" />
      </button>
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-white/15 bg-carbon-900 p-3 text-right text-xs font-normal leading-relaxed text-zinc-300 shadow-2xl transition-opacity duration-150 ${
          open
            ? 'opacity-100'
            : 'opacity-0 group-hover/tt:pointer-events-auto group-hover/tt:opacity-100'
        }`}
      >
        <strong className="mb-1 block text-brand-300">{entry.label}</strong>
        {entry.text}
      </span>
    </span>
  );
}
