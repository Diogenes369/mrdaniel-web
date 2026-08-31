interface SectionBackdropProps {
  /** Ambient tint: 'a' green, 'b' blue. Alternate down the page. */
  tone?: 'a' | 'b';
}

/**
 * Contained section background decoration — no skew, no clip-path, no bleed.
 *
 * Sits `absolute inset-0` at `z-0` (behind `z-10` content) fully INSIDE its section, which itself
 * carries a solid near-black fill (`bg-carbon-950`) and `overflow-hidden`. Because nothing here
 * extends past the section box, it can never paint over a neighbouring section's cards or let the
 * (lighter) document root peek through at a seam — the earlier bleeding/overlapping panel is what
 * caused the white cuts and broken card borders.
 *
 * The "angled" character is a single raked light gradient (`.section-sheen-*`); `.angle-grid` adds
 * a whisper-faint, edge-masked mesh. Decorative only: `aria-hidden`, `pointer-events-none`.
 */
export default function SectionBackdrop({ tone = 'a' }: SectionBackdropProps) {
  return (
    <div aria-hidden="true" className="section-backdrop pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className={`absolute inset-0 ${tone === 'a' ? 'section-sheen-a' : 'section-sheen-b'}`} />
      <div className="absolute inset-0 angle-grid" />
    </div>
  );
}
