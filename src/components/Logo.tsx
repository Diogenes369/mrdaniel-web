import { useState } from 'react';
import { LOGO_ALT } from '../lib/brand';

interface LogoProps {
  /** Classes for the outer lockup — layout, margin, hover/transition, drop-shadow. */
  className?: string;
  /** Sizing classes for the logo image, e.g. "h-8 md:h-10". */
  iconClassName?: string;
  /** Sizing classes for the stylized text fallback, used only if the image fails to load. */
  textClassName?: string;
}

// Local asset (public/logo.png) served from this domain — no third-party host, no CORS/broken-link
// risk. Still guarded with a stylized text fallback in case the image ever fails to load (e.g. a
// bad deploy), so the brand mark never disappears entirely.
export default function Logo({ className = '', iconClassName = 'h-9', textClassName = 'text-base md:text-lg' }: LogoProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <span className={`inline-flex items-center ${className}`}>
      {!imgError ? (
        <img
          src="/logo.png"
          alt={LOGO_ALT}
          className={`${iconClassName} w-auto max-w-[220px] object-contain`}
          loading="eager"
          decoding="async"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className={`font-tech font-bold tracking-wide whitespace-nowrap ${textClassName}`}>
          <span className="text-white">דניאל</span> <span className="text-brand-400">בן ברוך</span>
        </span>
      )}
    </span>
  );
}
