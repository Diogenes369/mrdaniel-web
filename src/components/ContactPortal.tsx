/**
 * Circular contact "portal" — replicated from a live-verified section of latitudeform.com (their
 * "Let's talk" CTA: a dashed ring rotating around a circular button, with a dense particle halo
 * converging on it as you scroll near it), adapted to this site's brand tokens and Hebrew copy.
 *
 * The particle convergence itself isn't drawn here — it's the motion=2d engine's 'contact'
 * formation (fieldEngine.ts), which targets whatever carries `data-field-target` below. This
 * component only needs to exist, be marked, and be positioned; the field does the rest as the
 * visitor scrolls into view (see pickFormation()'s scroll-driven blend). On the default background
 * (Scene3D, no flag), this renders as a plain static circular CTA with no field to react to it.
 */
export default function ContactPortal() {
  const handleClick = () => {
    window.dispatchEvent(
      new CustomEvent('open-lead-modal', { detail: { subject: 'יצירת קשר', sourceSection: 'Contact Portal' } })
    );
  };

  return (
    <section
      id="contact-portal"
      data-field-form="contact"
      className="relative min-h-[70dvh] flex flex-col items-center justify-center py-20 md:py-28 border-t border-white/5 overflow-hidden"
    >
      <button
        type="button"
        onClick={handleClick}
        data-field-target
        data-cursor="לחצו לפנייה"
        aria-label="פתיחת טופס יצירת קשר"
        className="group relative grid place-items-center rounded-full cursor-pointer outline-none transition-transform duration-700 ease-out hover:scale-[1.035] focus-visible:scale-[1.035] focus-visible:ring-2 focus-visible:ring-brand-400/60"
        style={{ width: 'clamp(260px, 32vw, 420px)', aspectRatio: '1' }}
      >
        {/* Static hairline ring + the slow (26s — matches the reference exactly) rotating dashed
            ring, same "the ring echoes the world" idea as the reference's own CTA. */}
        <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="49" fill="none" stroke="rgba(0,255,102,0.28)" strokeWidth="0.4" />
          <circle
            className="contact-portal-dial origin-center"
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="rgba(0,255,102,0.75)"
            strokeWidth="0.7"
            strokeDasharray="1.4 6"
          />
        </svg>

        {/* Soft fill glow, brightens on hover — same recipe the reference's own .fill uses. */}
        <div
          className="absolute inset-0 rounded-full opacity-60 transition-opacity duration-700 group-hover:opacity-100"
          style={{ background: 'radial-gradient(circle at 50% 62%, rgba(0,255,102,0.16), transparent 70%)' }}
          aria-hidden="true"
        />

        <div className="relative z-10 text-center px-6">
          <span className="block font-display font-black text-3xl md:text-5xl text-white mb-3 [text-shadow:0_2px_18px_rgba(0,0,0,0.85)]">
            בואו נדבר
          </span>
          <span className="inline-flex items-center gap-3 font-sans text-sm font-medium tracking-wide text-zinc-300 transition-colors group-hover:text-white">
            <span className="block h-px w-6 bg-brand-500 transition-[width] duration-500 group-hover:w-10" aria-hidden="true" />
            צור קשר
          </span>
        </div>
      </button>

      <p className="relative z-10 font-sans text-sm md:text-base text-zinc-400 mt-9 max-w-sm mx-auto text-center leading-relaxed px-6">
        מענה אישי תוך 24 שעות — לא בוט, לא מוקד שירות. ספרו לי מה אתם בונים ונמצא יחד את הדרך הנכונה.
      </p>
    </section>
  );
}
