/**
 * Site outro: a bold closing question above a compact circular "בואו נדבר" CTA that opens the lead
 * modal, framed by a slow rotating dashed ring.
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
      className="relative min-h-[92dvh] flex flex-col items-center justify-center py-40 md:py-64 border-t border-white/5 overflow-hidden text-center"
    >
      {/* ── Site outro: bold closing question, framing the CTA below it. Sized with `text-fluid-hero`
          (the exact token the Hero <h1> uses) so the closing headline visually matches the opening
          one; stays an <h2> for heading hierarchy. text-wrap:balance from the base rule. ── */}
      <h2 className="relative z-10 font-display font-black text-fluid-hero leading-[1.08] text-white max-w-[16ch] md:max-w-[22ch] mx-auto px-6 [text-shadow:0_2px_22px_rgba(0,0,0,0.9)]">
        מוכנים לקחת את המערכות שלכם לשלב הבא?
      </h2>

      {/* ── Compact CTA badge — a sleek, elegant button rather than the previous oversized circle. ── */}
      <button
        type="button"
        onClick={handleClick}
        aria-label="פתיחת טופס יצירת קשר"
        className="group relative z-10 mt-16 md:mt-24 grid place-items-center rounded-full cursor-pointer outline-none transition-transform duration-500 ease-out hover:scale-[1.05] focus-visible:scale-[1.05] focus-visible:ring-2 focus-visible:ring-brand-400/60"
        style={{ width: 'clamp(180px, 18vw, 240px)', aspectRatio: '1' }}
      >
        {/* Faint neutral fill so the badge reads as a surface, not just an outline; brightens on hover. */}
        <div
          className="absolute inset-[6%] rounded-full bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.07),transparent_72%)] opacity-70 transition-opacity duration-500 group-hover:opacity-100"
          aria-hidden="true"
        />

        {/* Static hairline ring + the slow (26s) rotating dashed ring — neutral cool-white strokes
            (the green was removed so the end of the site reads calm and un-decorated). */}
        <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(226,232,255,0.18)" strokeWidth="0.6" />
          <circle
            className="contact-portal-dial origin-center"
            cx="50"
            cy="50"
            r="43"
            fill="none"
            stroke="rgba(226,232,255,0.55)"
            strokeWidth="1.1"
            strokeDasharray="1.6 5"
          />
        </svg>

        <div className="relative z-10 flex flex-col items-center gap-2 px-4">
          <span className="font-display font-black text-xl md:text-2xl leading-none text-white [text-shadow:0_2px_14px_rgba(0,0,0,0.85)]">
            בואו נדבר
          </span>
          <span className="inline-flex items-center gap-2 font-sans text-[11px] md:text-xs font-medium tracking-[0.15em] text-zinc-400 transition-colors group-hover:text-brand-300">
            <span className="block h-px w-4 bg-brand-500 transition-[width] duration-500 group-hover:w-7" aria-hidden="true" />
            צור קשר
          </span>
        </div>
      </button>

      {/* ── Expanded closing statement. Balanced onto ~3 even lines on desktop via the
          `#contact-portal p` rule in index.css; scales down cleanly on mobile. ── */}
      <p className="relative z-10 mt-16 md:mt-24 font-sans text-base md:text-lg text-zinc-400 max-w-[34rem] md:max-w-[42rem] mx-auto leading-relaxed md:leading-[1.75] px-6 sm:px-8">
        מענה אישי, מקצועי וישיר תמיד — ללא בוטים וללא מוקדי שירות. זמין לייעוץ, אפיון פרויקטים, או סתם לשיחת פיתוח מעמיקה. מחכה למייל שלכם.
      </p>
    </section>
  );
}
