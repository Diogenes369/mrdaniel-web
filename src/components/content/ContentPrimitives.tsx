import { type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Mail, MessageCircle, type LucideIcon } from 'lucide-react';
import WebButton from '../WebButton';
import SocialLinks, { CONTACT_EMAIL, buildWhatsAppUrl } from '../SocialLinks';

export function PageHero({
  title,
  subtitle,
  metaChips = [],
}: {
  /** No longer rendered (the small pill above the title was removed site-wide) — kept optional so
   * existing call sites that still pass a badge don't need to be touched. */
  badgeIcon?: LucideIcon;
  badgeLabel?: string;
  title: string;
  subtitle: string;
  metaChips?: { icon: LucideIcon; label: string }[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="pt-14 md:pt-20 pb-8"
    >
      <h1 className="font-display font-black text-4xl md:text-6xl leading-[1.12] text-white mb-4">{title}</h1>
      <p className={`text-lg md:text-xl text-brand-400 font-semibold leading-relaxed max-w-3xl ${metaChips.length ? 'mb-6' : 'mb-2'}`}>{subtitle}</p>
      {metaChips.length > 0 && (
        <div className="flex items-center gap-3 text-sm text-zinc-400 flex-wrap pb-6 border-b border-white/10">
          {metaChips.map((chip) => (
            <span key={chip.label} className="inline-flex items-center gap-2 bg-white/[0.03] border border-white/10 px-3 py-1.5 rounded-lg">
              <chip.icon className="w-3.5 h-3.5 text-brand-400" />
              {chip.label}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Deprecated / ignored. Previously made the heading `position: sticky` on mobile; that was
   *  removed globally — `position: sticky` on section-level elements misbehaves in in-app
   *  (Instagram/Facebook/TikTok) webviews and can leave a heading pinned over the next section.
   *  Kept in the type only so existing `sticky` call sites don't need editing. */
  sticky?: boolean;
}) {
  return (
    <div className="mb-8">
      <h2 className="flex items-center gap-3 font-display font-black text-2xl md:text-3xl text-white mb-2">
        <Icon className="w-6 h-6 text-brand-400 shrink-0" />
        {title}
      </h2>
      {/* Description stays a comfortable measure even inside a wide `.container-wide` page. */}
      <p className="text-zinc-400 text-base md:text-lg max-w-3xl">{description}</p>
    </div>
  );
}

/** `badgeIcon`/`badgeLabel` are no longer rendered (the small pill above the title was removed
 * site-wide) — kept optional so existing call sites that still pass one don't need to be touched. */
export function InfoBox({ title, children }: { badgeIcon?: LucideIcon; badgeLabel?: string; title?: string; children: ReactNode }) {
  return (
    <div className="bg-carbon-900/60 border border-white/10 border-r-4 border-r-brand-500 rounded-2xl p-6 md:p-10 mb-16">
      {title && <h2 className="font-display font-black text-xl md:text-2xl text-white mb-4">{title}</h2>}
      {/* Prose measure so a wide page doesn't stretch these paragraphs past a readable line length. */}
      <div className="space-y-4 text-base md:text-lg text-zinc-300 leading-[1.85] max-w-4xl">{children}</div>
    </div>
  );
}

export interface ServiceItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function ServiceGrid({ items }: { items: ServiceItem[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 md:gap-6 mb-16">
      {items.map((item) => (
        <motion.div
          key={item.title}
          className="bg-carbon-fiber border border-white/10 rounded-2xl p-6 hover:border-brand-500/40 transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-brand-400 mb-4">
            <item.icon className="w-6 h-6" />
          </div>
          <h3 className="font-display font-bold text-lg text-white mb-2 leading-snug">{item.title}</h3>
          <p className="text-zinc-400 text-base leading-relaxed">{item.description}</p>
        </motion.div>
      ))}
    </div>
  );
}

/** One card in `InteractiveServiceGrid` — `featured` renders it full-width with larger type and an
 * icon-beside-text layout (used for the first item only, to establish visual hierarchy); the rest
 * render as a standard 2-col grid card. The oversized, near-invisible index number in the corner
 * plus the hover-triggered border/glow/icon-fill are what make this read as "interactive" versus
 * the plain ServiceGrid above — all pure CSS/motion hover, so touch devices still get a clean
 * static card with no broken hover-only affordance. */
function InteractiveServiceCard({ item, index, featured = false }: { item: ServiceItem; index: number; featured?: boolean }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-carbon-fiber p-6 md:p-8 transition-colors hover:border-brand-500/50 hover:shadow-[0_0_30px_rgba(118,185,0,0.12)] ${
        featured ? 'md:flex md:items-center md:gap-8' : ''
      }`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-2 -top-6 font-display font-black text-white/[0.04] group-hover:text-brand-500/10 transition-colors select-none leading-none"
        style={{ fontSize: featured ? '9rem' : '6rem' }}
      >
        {String(index + 1).padStart(2, '0')}
      </span>
      <div
        className={`relative z-10 shrink-0 w-14 h-14 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-brand-400 mb-4 md:mb-0 group-hover:bg-brand-500/15 group-hover:border-brand-500/40 group-hover:text-brand-300 transition-colors ${
          featured ? 'md:w-16 md:h-16' : ''
        }`}
      >
        <item.icon className={featured ? 'w-7 h-7' : 'w-6 h-6'} />
      </div>
      <div className="relative z-10">
        <h3 className={`font-display font-bold text-white mb-2 leading-snug ${featured ? 'text-xl md:text-2xl' : 'text-lg'}`}>{item.title}</h3>
        <p className={`text-zinc-400 leading-relaxed ${featured ? 'text-base md:text-lg' : 'text-base'}`}>{item.description}</p>
      </div>
    </motion.div>
  );
}

/** Sleeker alternative to `ServiceGrid` for pages that want stronger visual hierarchy — the first
 * item is promoted to a full-width featured card, the rest sit in a 2-col grid beneath it. Same
 * `ServiceItem[]` shape, so any page can swap between the two without touching its data. */
export function InteractiveServiceGrid({ items }: { items: ServiceItem[] }) {
  if (items.length === 0) return null;
  const [featured, ...rest] = items;
  return (
    <div className="mb-16 space-y-5">
      <InteractiveServiceCard item={featured} index={0} featured />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 md:gap-6">
        {rest.map((item, i) => (
          <InteractiveServiceCard key={item.title} item={item} index={i + 1} />
        ))}
      </div>
    </div>
  );
}

export function SpecTable({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 mb-16">
      <table className="w-full text-right text-base">
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.label} className={idx !== rows.length - 1 ? 'border-b border-white/10' : ''}>
              <th className="p-4 md:p-5 bg-white/[0.03] text-brand-400 font-bold w-1/3 align-top">{row.label}</th>
              <td className="p-4 md:p-5 text-zinc-300 leading-relaxed">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface AudienceItem {
  tag: string;
  title: string;
  description: string;
}

export function AudienceGrid({ items }: { items: AudienceItem[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 md:gap-6 mb-16">
      {items.map((item) => (
        <div key={item.title} className="bg-carbon-900/60 border border-white/10 rounded-2xl p-6 hover:border-brand-500/30 transition-colors">
          <div className="font-mono text-xs font-bold text-brand-400 mb-2 uppercase tracking-wide">{item.tag}</div>
          <h3 className="font-display font-bold text-lg text-white mb-2">{item.title}</h3>
          <p className="text-zinc-400 text-base leading-relaxed">{item.description}</p>
        </div>
      ))}
    </div>
  );
}

export interface TocEntry {
  badge: string;
  title: string;
  description: string;
  wide?: boolean;
}

export function TocGrid({ items }: { items: TocEntry[] }) {
  return (
    <div className="bg-carbon-800/80 border border-white/10 rounded-2xl p-6 md:p-8 mb-16">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item) => (
          <div
            key={item.title}
            className={`flex gap-4 p-4 bg-black/35 border border-white/5 rounded-xl ${item.wide ? 'sm:col-span-2 bg-brand-500/5 border-brand-500/20' : ''}`}
          >
            <span className={`shrink-0 h-fit font-bold text-sm px-2.5 py-1 rounded-md ${item.wide ? 'bg-brand-500 text-black' : 'bg-brand-500/15 text-brand-400'}`}>
              {item.badge}
            </span>
            <div>
              <strong className="block text-white text-base mb-1">{item.title}</strong>
              <span className="block text-zinc-400 text-sm leading-relaxed">{item.description}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Minimalist, high-converting bottom CTA — replaces the old two-card/four-button `DualCta` layout
 * with one clean panel: a direct mailto button, a direct WhatsApp button (both pre-filled with
 * page-specific context), and the full social bar underneath. `mailSubject`/`whatsappMessage` let
 * each page keep its own contextual copy without needing separate card content.
 */
export function UnifiedCta({ mailSubject, whatsappMessage }: { mailSubject: string; whatsappMessage: string }) {
  return (
    <div className="bg-carbon-900/60 border border-white/10 rounded-2xl p-8 md:p-10 mb-8 text-center">
      <p className="text-zinc-400 text-base md:text-lg mb-7 max-w-xl mx-auto">הדרך המהירה ביותר להתחיל — פנייה ישירה במייל או ב-WhatsApp, בלי טפסים מיותרים.</p>
      <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
        <WebButton variant="primary" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(mailSubject)}`}>
          <Mail className="w-4 h-4" />
          פנייה ישירה במייל
        </WebButton>
        <WebButton variant="glass" href={buildWhatsAppUrl(whatsappMessage)} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="w-4 h-4" />
          פנייה ישירה ב-WhatsApp
        </WebButton>
      </div>
      <div className="flex flex-col items-center gap-3 pt-7 border-t border-white/10">
        <span className="text-xs font-mono font-bold text-zinc-500 uppercase tracking-widest">או דרך הרשתות החברתיות</span>
        <SocialLinks />
      </div>
    </div>
  );
}
