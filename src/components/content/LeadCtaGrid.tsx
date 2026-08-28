import type { LucideIcon } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import WebButton from '../WebButton';

export interface LeadCta {
  icon: LucideIcon;
  title: string;
  sub: string;
  /** Prefilled into the lead modal's subject line. */
  subject: string;
  /** Button label. */
  action: string;
  /** Highlight the middle / primary option. */
  featured?: boolean;
}

/**
 * A row of specialized, high-intent conversion prompts — replaces a single generic "contact me"
 * button. Each card dispatches the site-wide `open-lead-modal` event with its own subject so the
 * lead arrives already qualified by which offer the visitor chose.
 */
export default function LeadCtaGrid({ items, sourceSection }: { items: LeadCta[]; sourceSection: string }) {
  const open = (subject: string) =>
    window.dispatchEvent(new CustomEvent('open-lead-modal', { detail: { subject, sourceSection } }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 mb-8">
      {items.map((it) => (
        <div
          key={it.title}
          className={`flex h-full flex-col rounded-2xl border p-6 ${
            it.featured
              ? 'border-brand-500/50 bg-brand-500/[0.06]'
              : 'border-white/10 bg-carbon-900/60'
          }`}
        >
          <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-brand-400">
            <it.icon className="w-5 h-5" />
          </span>
          <h3 className="font-display text-lg font-bold text-white mb-1.5">{it.title}</h3>
          <p className="text-sm leading-relaxed text-zinc-400 flex-grow mb-5">{it.sub}</p>
          <WebButton
            variant={it.featured ? 'primary' : 'glass'}
            onClick={() => open(it.subject)}
            className="w-full justify-center"
          >
            {it.action}
            <ArrowLeft className="w-4 h-4" />
          </WebButton>
        </div>
      ))}
    </div>
  );
}
