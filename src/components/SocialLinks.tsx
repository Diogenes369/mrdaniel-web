import { Instagram, Linkedin, Mail } from 'lucide-react';

export const INSTAGRAM_URL = 'https://www.instagram.com/daniel.benbaruch?igsi=MTc3ODd5aWlsbTdtaA%3D%3D&utm_source=qr';
export const LINKEDIN_URL = 'https://www.linkedin.com/in/daniel-ben-baruch?utm_source=share_via&utm_content=profile&utm_medium=member_ios';
export const TIKTOK_URL = 'https://www.tiktok.com/@glasswing_project?_r=1&_t=ZS-99CfiH4Iz0G';
export const CONTACT_EMAIL = 'daniel@mrdaniel.co.il';

// The one official WhatsApp Business number for the site — every direct-contact link (header CTA,
// lead form, agent qualifier, this bar) points here.
export const WHATSAPP_NUMBER = '972506473039';

/** Builds a wa.me link, optionally pre-filling the chat with `message` (Hebrew or mixed content —
 * WhatsApp renders plain text natively with correct RTL, no sanitization needed here). */
export function buildWhatsAppUrl(message?: string): string {
  return message ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}` : `https://wa.me/${WHATSAPP_NUMBER}`;
}

// lucide-react ships no WhatsApp/TikTok glyphs (only general-purpose icons, not brand marks) — these
// are the standard public brand glyph paths, inlined as `currentColor` SVGs so they inherit the same
// sizing/color classes as the lucide icons alongside them.
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12.004 2.003c-5.514 0-9.997 4.483-9.997 9.997 0 1.763.462 3.483 1.34 4.997L2 22l5.117-1.334a9.96 9.96 0 0 0 4.887 1.264h.004c5.514 0 9.997-4.483 9.997-9.997 0-2.67-1.04-5.18-2.928-7.067a9.933 9.933 0 0 0-7.073-2.863zm0 18.174h-.003a8.16 8.16 0 0 1-4.163-1.14l-.299-.177-3.037.792.811-2.96-.194-.304a8.163 8.163 0 0 1-1.253-4.365c0-4.508 3.669-8.177 8.181-8.177a8.13 8.13 0 0 1 5.786 2.398 8.13 8.13 0 0 1 2.394 5.786c0 4.508-3.67 8.177-8.223 8.177z" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.6 5.82s.51.5 0 0A4.278 4.278 0 0 1 15.54 3h-3.09v12.4a2.592 2.592 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z" />
    </svg>
  );
}

const DEFAULT_ICON_CLASS =
  'w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300 hover:text-brand-400 hover:border-brand-500/40 hover:shadow-[0_0_16px_rgba(0,255,102,0.35)] transition-all';

// No native browser focus ring on any variant, ever (that default ring reads as a stray white
// outline against this dark theme) — replaced with a branded green ring, and only via
// `focus-visible` so it never flashes on an ordinary mouse click, only on real keyboard focus.
const FOCUS_SAFE_CLASS = 'outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-0';

export type SocialChannel = 'instagram' | 'linkedin' | 'tiktok' | 'whatsapp' | 'mail';

const ALL_CHANNELS: SocialChannel[] = ['instagram', 'linkedin', 'tiktok', 'whatsapp', 'mail'];

interface SocialLinksProps {
  className?: string;
  iconClassName?: string;
  glyphClassName?: string;
  /** Which channels to render, in order — defaults to all 5. The header keeps a smaller
   * (Instagram/LinkedIn/mail) subset; TikTok and WhatsApp stay exclusive to the footer and the
   * bottom-of-page social bar. */
  channels?: SocialChannel[];
}

export default function SocialLinks({ className = '', iconClassName, glyphClassName = 'w-4 h-4', channels = ALL_CHANNELS }: SocialLinksProps) {
  const cls = `${iconClassName ?? DEFAULT_ICON_CLASS} ${FOCUS_SAFE_CLASS}`;
  const show = (c: SocialChannel) => channels.includes(c);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {show('instagram') && (
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="אינסטגרם" title="אינסטגרם" className={cls}>
          <Instagram className={glyphClassName} />
        </a>
      )}
      {show('linkedin') && (
        <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer" aria-label="לינקדאין" title="לינקדאין" className={cls}>
          <Linkedin className={glyphClassName} />
        </a>
      )}
      {show('tiktok') && (
        <a href={TIKTOK_URL} target="_blank" rel="noopener noreferrer" aria-label="טיקטוק" title="טיקטוק" className={cls}>
          <TikTokIcon className={glyphClassName} />
        </a>
      )}
      {show('whatsapp') && (
        <a href={buildWhatsAppUrl()} target="_blank" rel="noopener noreferrer" aria-label="וואטסאפ" title="וואטסאפ" className={cls}>
          <WhatsAppIcon className={glyphClassName} />
        </a>
      )}
      {show('mail') && (
        <a href={`mailto:${CONTACT_EMAIL}`} aria-label="שליחת מייל" title="שליחת מייל" className={cls}>
          <Mail className={glyphClassName} />
        </a>
      )}
    </div>
  );
}
