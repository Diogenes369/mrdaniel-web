/**
 * The brand, as the site actually defines it — one place the render pipeline can read.
 *
 * Every value here is copied from the real source rather than invented, because a generated
 * carousel that is off-brand is worse than no carousel: it looks like someone else's template with
 * our words in it, which is exactly what the first renders looked like on the white and yellow
 * variants of a third-party template.
 *
 * Sources, so this can be re-checked when the site changes:
 *   colours + fonts  src/index.css (the :root token block)
 *   logo             public/logo.png, referenced by src/components/Logo.tsx and structuredData.ts
 *   voice + audience src/agent/expertVoice.ts
 *   offering         BRAND_KNOWLEDGE_BASE in src/agent/SocialAgentEngine.ts
 *
 * The two facts that constrain layout hardest:
 *   1. The site is DARK ONLY, permanently — index.css says a light variant was tried and rolled
 *      back. A light slide is off-brand, not a style choice, so templates filter to dark frames.
 *   2. Heebo carries the Hebrew. It is the site's body face AND the Figma fallback, which is why
 *      substituted text still looks like us rather than like a fallback.
 */

/** Dark surface ramp. carbon950 is the site background. */
export const BRAND_COLORS = {
  carbon950: '#08090C',
  carbon900: '#121212',
  carbon800: '#1E1E24',
  /** NVIDIA-green ramp: one hue, only shade varies. brand500 is the primary. */
  brand500: '#76B900',
  brand400: '#8FD400',
  brand300: '#9FE870',
  glow: '#00FF66',
  /** Secondary accents — highlights and data callouts, never a replacement for the green. */
  electricBlue: '#38BDF8',
  neonCyan: '#22D3EE',
  textPrimary: '#F1F5F9',
  textMuted: '#CBD5E1',
} as const;

/**
 * Type. Heebo is the body face and the only one of these with full Hebrew coverage that the
 * pipeline can rely on; Rubik is the display face. Orbitron and JetBrains Mono are deliberately
 * Latin-only on the site and must never be chosen for Hebrew — index.css says so explicitly.
 */
export const BRAND_FONTS = {
  sans: 'Heebo',
  display: 'Rubik',
  /** What a Figma node gets when its own font cannot render Hebrew. */
  figmaFallback: { family: 'Heebo', style: 'Bold' },
} as const;

/** How the byline block is filled on every rendered slide. */
export const BRAND_META = {
  name: 'דניאל בן ברוך',
  handle: '@mrdaniel',
  site: 'mrdaniel.co.il',
  /**
   * Pure Hebrew on purpose. A mixed-script tag ("#חדשות_AI") put Latin, Hebrew and neutral
   * underscores in one token, and the bidi ordering inside it rendered as "AI_ו_רבייס#". A tag is
   * brand furniture, not content — there is no reason to fight bidi for it.
   */
  hashtag: '#בינה_מלאכותית',
  year: '20\n26',
  /** public/logo.png. Not yet placed on slides — see the note in figmaTemplates' logo handling. */
  logoPath: 'public/logo.png',
} as const;

/** The byline as the template's two-line handle block wants it. */
export const brandHandleBlock = (): string => `${BRAND_META.name}\n${BRAND_META.handle}`;

/**
 * Hex to Figma's 0..1 RGB. Figma's plugin API takes components as floats, not bytes, and passing
 * 0..255 silently clamps every channel to 1 — a white slide that looks like a render bug.
 */
export function hexToFigmaRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`not a hex colour: ${hex}`);
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

/**
 * Is this background dark enough to be on-brand?
 *
 * Relative luminance, not a hex allowlist, so it keeps working when a template ships a shade the
 * registry has not seen. The 0.2 threshold accepts the template's #000000 and #1b1c1e and rejects
 * its white, yellow and pink variants.
 */
export function isOnBrandDark(rgb: { r: number; g: number; b: number }): boolean {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b < 0.2;
}
