import { useId } from 'react';

/**
 * Asymmetric angled section divider — replaces the flat `border-t` seams between homepage
 * sections with a sleek diagonal cut: a faint glass wedge, a neon brand-green edge line with a
 * soft glow bloom, and a whisper of the cyber grid texture along the blade.
 *
 * Deliberately implemented as a STANDALONE decorative strip between sections rather than a
 * `clip-path` on the section containers themselves — clipping a scroll-section's own box is
 * exactly the kind of ancestor-effect that broke `position: sticky` / ScrollTrigger offsets on
 * Android in an earlier iteration. This strip is inert: `pointer-events-none`, `aria-hidden`,
 * pure SVG (crisp at any DPR, ~zero cost), and it never wraps or masks section content.
 *
 * `flip` mirrors the diagonal so consecutive dividers alternate direction (asymmetry, not a
 * repeating zig-zag pattern).
 */
export default function AngledDivider({ flip = false }: { flip?: boolean }) {
  // Gradient/filter ids must be unique per instance or later SVGs silently reuse the first one's defs.
  const uid = useId().replace(/[:]/g, '');
  const edgeId = `adiv-edge-${uid}`;
  const meshId = `adiv-mesh-${uid}`;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none relative z-[5] -my-px h-14 w-full select-none overflow-hidden md:h-20 lg:h-24 ${
        flip ? '[transform:scaleX(-1)]' : ''
      }`}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 10" preserveAspectRatio="none">
        <defs>
          <linearGradient id={edgeId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="rgba(118,185,0,0)" />
            <stop offset="0.28" stopColor="rgba(118,185,0,0.55)" />
            <stop offset="0.62" stopColor="rgba(0,255,102,0.75)" />
            <stop offset="0.9" stopColor="rgba(56,189,248,0.35)" />
            <stop offset="1" stopColor="rgba(56,189,248,0)" />
          </linearGradient>
          <pattern id={meshId} width="2.2" height="2.2" patternUnits="userSpaceOnUse">
            <path d="M0 0H2.2M0 0V2.2" stroke="rgba(118,185,0,0.10)" strokeWidth="0.06" />
          </pattern>
        </defs>

        {/* Glass wedge under the blade — reads as the next section's plane sliding in at an angle. */}
        <polygon points="0,10 100,1.5 100,10" fill="rgba(255,255,255,0.028)" />
        {/* Faint cyber-grid texture, confined to the wedge so it hugs the diagonal. */}
        <polygon points="0,10 100,1.5 100,10" fill={`url(#${meshId})`} opacity="0.55" />

        {/* Soft glow bloom behind the edge (wide, translucent pass under the crisp line). */}
        <line x1="0" y1="10" x2="100" y2="1.5" stroke={`url(#${edgeId})`} strokeWidth="1.1" opacity="0.28" />
        {/* The crisp neon blade itself. */}
        <line x1="0" y1="10" x2="100" y2="1.5" stroke={`url(#${edgeId})`} strokeWidth="0.22" />
      </svg>

      {/* Ambient radial wash so the diagonal blends into the page's corner-glow atmosphere. */}
      <div
        className="absolute inset-y-0 left-[18%] w-[46%] bg-[radial-gradient(ellipse_60%_100%_at_50%_100%,rgba(118,185,0,0.10),transparent_70%)]"
      />
    </div>
  );
}
