interface SectionBackdropProps {
  /** Ambient tint: 'a' green, 'b' blue-with-green-undertone. Alternate down the page. */
  tone?: 'a' | 'b';
  /** Diagonal rise of the panel's top/bottom edges, in px (both edges stay parallel). */
  cut?: number;
}

/**
 * The angled background plane for a homepage section — the "integrated diagonal cut", replacing
 * the old standalone <AngledDivider> strips (which drew a visible line across the page).
 *
 * A single translucent glass panel, clipped to a shallow parallelogram and bled ~48px past the
 * section top and bottom, so each section's panel OVERLAPS its neighbours' in the seam and they
 * interlock on a soft diagonal. Nothing here is a hard edge: the panel fill is ~0.014 white, the
 * mesh is radial-masked to fade before its bounds, and the whole thing sits at `-z-10` behind the
 * content — a line can never run through text.
 *
 * Decorative only: `aria-hidden`, `pointer-events-none`, GPU-composited (`transform-gpu`), no
 * scroll listener. The host <section> must be `relative isolate` (keeps `-z-10` inside it) and
 * must allow vertical overflow (`overflow-x-clip`, never `overflow-hidden`).
 */
export default function SectionBackdrop({ tone = 'a', cut = 28 }: SectionBackdropProps) {
  return (
    <div
      aria-hidden="true"
      className="section-backdrop pointer-events-none absolute inset-x-0 -inset-y-12 -z-10 transform-gpu"
      style={{ clipPath: `polygon(0 ${cut}px, 100% 0, 100% calc(100% - ${cut}px), 0 100%)` }}
    >
      <div className="absolute inset-0 bg-white/[0.014]" />
      <div className={`absolute inset-0 ${tone === 'a' ? 'backdrop-glow-a' : 'backdrop-glow-b'}`} />
      <div className="absolute inset-0 angle-grid" />
      {/* Lit leading edge — a soft highlight riding the clipped diagonal at the panel's top. */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/[0.05] to-transparent" />
    </div>
  );
}
