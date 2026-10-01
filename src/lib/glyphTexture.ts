/**
 * The glyph-density fill that sharp buttons and active states wear — the same material as the
 * background field, at button scale. Generated once on the client (a canvas tile of real Hebrew
 * letters and density marks) and published as the `--glyph-tex` custom property, so CSS can use it
 * like any other background image. Until it exists the fill is plain green, which is a finished look.
 */
let started = false;

const MARKS = 'אבגדהוזחטיכלמנסעפצקרשת+=:-';

export function ensureGlyphTexture() {
  if (started || typeof document === 'undefined') return;
  started = true;
  const draw = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = 7;
    const ch = 11;
    const cols = 14;
    const rows = 4;
    const c = document.createElement('canvas');
    c.width = cols * cw * dpr;
    c.height = rows * ch * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.font = '700 9px Cousine, "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const r = rand();
        if (r < 0.18) continue;
        ctx.fillStyle = `rgba(214, 255, 140, ${0.18 + r * 0.3})`;
        ctx.fillText(MARKS[Math.floor(rand() * MARKS.length)], x * cw + cw / 2, y * ch + ch * 0.55);
      }
    }
    document.documentElement.style.setProperty('--glyph-tex', `url(${c.toDataURL('image/png')})`);
    document.documentElement.style.setProperty('--glyph-tex-size', `${cols * cw}px ${rows * ch}px`);
  };
  const fonts = document.fonts;
  if (fonts?.load) {
    Promise.race([fonts.load('700 9px Cousine', 'אב'), new Promise((r) => window.setTimeout(r, 2500))])
      .catch(() => undefined)
      .then(draw);
  } else {
    draw();
  }
}
