import { type ReactNode } from 'react';
import { Mail, Send, type LucideIcon } from 'lucide-react';
import WebButton from '../WebButton';
import SocialLinks, { CONTACT_EMAIL } from '../SocialLinks';
import SiteBot from '../bots/SiteBot';
import type { BotShape, BotTone } from '../bots/botShapes';
import { useFieldQuiet } from '../field/fieldState';

/**
 * The shared blocks of the inner pages (About, AI, JARVIS, News). Moved into the glyph world on
 * 2026-10-06, so every page that uses them changed at once: the site's headline voice (Rubik Lines)
 * and a typing caret instead of the gradient underline and the icon in front of every heading,
 * dotted frames with square corners instead of glowing rounded cards, no 01/02/03 index numbers
 * (the brief bans them), and the live layer's arrivals (src/lib/liveLayer.ts). Every page hero has
 * one of the Grok Bot crew standing in its open side; which one is picked from the title, so a page
 * always gets the same bot.
 */
const HERO_BOTS: [BotShape, BotTone][] = [
  ['circle', 'ink'],
  ['triangle', 'fill'],
  ['square', 'hi'],
  ['diamond', 'pale'],
  ['flower', 'deep'],
  ['star', 'hi'],
  ['heart', 'pale'],
];
function botFor(title: string): [BotShape, BotTone] {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  return HERO_BOTS[h % HERO_BOTS.length];
}

export function PageHero({
  title,
  subtitle,
  metaChips = [],
  bot,
}: {
  /** No longer rendered (the small pill above the title was removed site-wide) — kept optional so
   * existing call sites that still pass a badge don't need to be touched. */
  badgeIcon?: LucideIcon;
  badgeLabel?: string;
  title: string;
  subtitle: string;
  metaChips?: { icon: LucideIcon; label: string }[];
  /** Which of the crew hosts the page; picked from the title when not given. */
  bot?: [BotShape, BotTone];
}) {
  const quiet = useFieldQuiet();
  const [shape, tone] = bot ?? botFor(title);
  return (
    <div className="grid grid-cols-1 items-end gap-8 pb-8 pt-14 md:pt-20 lg:grid-cols-12 lg:gap-10">
      <div ref={quiet} className="lg:col-span-9">
        <h1 className="page-hero__title">{title}</h1>
        <div className="mt-5 flex items-center gap-2" aria-hidden="true">
          <span className="story-statusbar__live" />
          <span className="h-px w-24 border-t border-dotted border-[var(--color-rule)]" />
        </div>
        <p className={`page-hero__sub ${metaChips.length ? 'mb-6' : 'mb-2'}`} data-live="wipe">
          {subtitle}
        </p>
        {metaChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-dotted border-[var(--color-rule)] pb-6" data-live="stagger">
            {metaChips.map((chip) => (
              <span key={chip.label} className="inline-flex items-center gap-2 font-type text-[12.5px] font-bold text-ink-faint">
                <chip.icon className="h-3.5 w-3.5 text-brand-400" aria-hidden="true" />
                {chip.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex lg:col-span-3 lg:justify-end">
        <SiteBot shape={shape} tone={tone} mood="happy" size={118} className="offer-beat__bot" />
      </div>
    </div>
  );
}

export function SectionHeading({
  title,
  description,
}: {
  /** No longer drawn (2026-10-06): headings speak in type, not in icons. Kept for call sites. */
  icon?: LucideIcon;
  title: string;
  description: string;
  /** Deprecated / ignored. Previously made the heading `position: sticky` on mobile; that was
   *  removed globally — `position: sticky` on section-level elements misbehaves in in-app
   *  (Instagram/Facebook/TikTok) webviews and can leave a heading pinned over the next section.
   *  Kept in the type only so existing `sticky` call sites don't need editing. */
  sticky?: boolean;
}) {
  return (
    <div className="mb-9">
      <h2 className="story-h2">{title}</h2>
      <div className="mt-4 flex items-center gap-2" aria-hidden="true">
        <span className="story-statusbar__live" />
        <span className="h-px w-20 border-t border-dotted border-[var(--color-rule)]" />
      </div>
      {/* Description stays a comfortable measure even inside a wide `.container-wide` page. */}
      <p className="story-body mt-5 max-w-3xl" data-live="rise">
        {description}
      </p>
    </div>
  );
}

/** `badgeIcon`/`badgeLabel` are no longer rendered (the small pill above the title was removed
 * site-wide) — kept optional so existing call sites that still pass one don't need to be touched. */
export function InfoBox({ title, children }: { badgeIcon?: LucideIcon; badgeLabel?: string; title?: string; children: ReactNode }) {
  return (
    <div className="glyph-frame mb-16 p-5 sm:p-6 lg:p-10" data-live="frame">
      {title && <h2 className="story-h2 mb-5 !text-[clamp(1.5rem,1rem+1.6vw,2.4rem)]">{title}</h2>}
      {/* Prose measure so a wide page doesn't stretch these paragraphs past a readable line length. */}
      <div className="max-w-4xl space-y-4 text-base leading-[1.85] text-ink-muted md:text-lg">{children}</div>
    </div>
  );
}

export interface ServiceItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

function Cell({ item, big = false }: { item: ServiceItem; big?: boolean }) {
  return (
    <div className={`glyph-frame frame-cell ${big ? 'frame-cell--big' : ''}`}>
      <span className="frame-cell__icon" aria-hidden="true">
        <item.icon className={big ? 'h-6 w-6' : 'h-5 w-5'} />
      </span>
      <div className="min-w-0">
        <h3 className="frame-cell__title">{item.title}</h3>
        <p className="frame-cell__text">{item.description}</p>
      </div>
    </div>
  );
}

export function ServiceGrid({ items }: { items: ServiceItem[] }) {
  return (
    <div className="mb-16 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3" data-live="stagger">
      {items.map((item) => (
        <Cell key={item.title} item={item} />
      ))}
    </div>
  );
}

/** The first item leads, full width and larger; the rest sit in a grid beneath it. Same
 * `ServiceItem[]` shape as ServiceGrid, so any page can swap between the two. */
export function InteractiveServiceGrid({ items }: { items: ServiceItem[] }) {
  if (items.length === 0) return null;
  const [featured, ...rest] = items;
  return (
    <div className="mb-16 space-y-4 md:space-y-5">
      <div data-live="frame">
        <Cell item={featured} big />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3" data-live="stagger">
        {rest.map((item) => (
          <Cell key={item.title} item={item} />
        ))}
      </div>
    </div>
  );
}

export function SpecTable({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <div className="glyph-frame mb-16 overflow-x-auto" data-live="frame">
      <table className="w-full text-right text-base">
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.label} className={idx !== rows.length - 1 ? 'border-b border-dotted border-[var(--color-rule)]' : ''}>
              <th className="w-1/3 p-4 align-top font-type text-[14px] font-bold text-brand-400 md:p-5">{row.label}</th>
              <td className="p-4 leading-relaxed text-ink-muted md:p-5">{row.value}</td>
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
    <div className="mb-16 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-5 xl:grid-cols-3" data-live="stagger">
      {items.map((item) => (
        <div key={item.title} className="glyph-frame frame-cell frame-cell--stack">
          <p className="font-type text-[12px] font-bold text-brand-400">{item.tag}</p>
          <h3 className="frame-cell__title mt-1.5">{item.title}</h3>
          <p className="frame-cell__text">{item.description}</p>
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
    <div className="glyph-frame mb-16 p-4 sm:p-5 lg:p-6" data-live="frame">
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2" data-live="stagger">
        {items.map((item) => (
          <div key={item.title} className={`flex gap-4 border-b border-dotted border-[var(--color-rule)] px-1 py-4 ${item.wide ? 'sm:col-span-2' : ''}`}>
            <span className={`h-fit shrink-0 px-2 py-1 font-type text-[12px] font-bold ${item.wide ? 'bg-brand-400 text-ground' : 'border border-dotted border-[var(--color-rule)] text-brand-400'}`}>
              {item.badge}
            </span>
            <div>
              <strong className="mb-1 block text-base text-ink-paper">{item.title}</strong>
              <span className="block text-sm leading-relaxed text-ink-muted">{item.description}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The bottom call to action: one frame with a direct mailto (pre-filled with the page's subject),
 * the lead form (its answer arrives by email, /api/leads sends the reply) and the social bar
 * underneath. There is no phone or WhatsApp link (owner decision, 2026-10-07): `mailSubject` and
 * `leadMessage` let each page keep its own contextual copy in both email routes.
 */
export function UnifiedCta({ mailSubject, leadMessage }: { mailSubject: string; leadMessage: string }) {
  const openLeadForm = () =>
    window.dispatchEvent(
      new CustomEvent('open-lead-modal', { detail: { subject: mailSubject, prefillMessage: leadMessage, sourceSection: 'Unified CTA' } })
    );
  return (
    <div className="glyph-frame mb-8 p-6 text-center sm:p-8 lg:p-10" data-live="frame">
      <p className="story-body mx-auto mb-7 max-w-xl">הדרך המהירה ביותר להתחיל: מייל ישיר, או כמה פרטים בטופס. התשובה מגיעה אליכם למייל.</p>
      <div className="mb-8 flex flex-wrap items-center justify-center gap-4">
        <WebButton variant="primary" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(mailSubject)}`}>
          <Mail className="h-4 w-4" />
          פנייה ישירה במייל
        </WebButton>
        <WebButton variant="glass" onClick={openLeadForm}>
          <Send className="h-4 w-4" />
          השארת פרטים
        </WebButton>
      </div>
      <div className="flex flex-col items-center gap-3 border-t border-dotted border-[var(--color-rule)] pt-7">
        <span className="font-type text-xs font-bold text-ink-faint">או דרך הרשתות החברתיות</span>
        <SocialLinks />
      </div>
    </div>
  );
}
