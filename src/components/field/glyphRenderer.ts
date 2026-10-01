import { ATLAS_COLS, ATLAS_ROWS, FIRST_LETTER, GLYPHS, GLYPH_COUNT, WORDS_H, WORDS_W } from './glyphs';

/**
 * Raw WebGL2 renderer for the glyph field — deliberately not three.js / R3F: the whole effect is two
 * full-screen triangles, and a phone in an Instagram webview should not download a 3D engine to
 * draw letters.
 *
 *   Pass 1 (scene) runs once per CELL into a cols×rows texture: how bright the cell is, which kind
 *   of character it shows, whether a ripple is scrambling it, and whether it belongs to the
 *   glyph-built headline. All the story staging (noise → typed page → calm) lives here.
 *
 *   Pass 2 (glyphs) runs per pixel: find the cell, read pass 1, pick the glyph (density ramp for dim
 *   cells, a real letter from the words texture for bright ones) and sample it from an atlas that
 *   was rasterised at exactly the cell's device-pixel size, so every character lands pixel-aligned.
 *
 * Doing the scene per cell instead of per pixel is what makes this cheap: a 1440×900 screen is
 * ~15k cells, not 1.3M pixels of noise.
 */

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const COMMON = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}`;

const SCENE_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform vec2 uGrid;
uniform vec2 uCell;
uniform vec2 uView;
uniform float uTime;
uniform float uScroll;
uniform float uChaos;
uniform float uOrder;
uniform float uCalm;
uniform vec4 uLens;
uniform vec4 uRipple[4];
uniform vec4 uQuiet[8];
uniform int uQuietN;
uniform vec4 uMaskRect;
uniform float uMaskAmt;
out vec4 o;
${COMMON}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x);
  float b = mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x);
  float c = mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x);
  float d = mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}
float fbm(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}
void main() {
  vec2 cell = vec2(floor(gl_FragCoord.x), uGrid.y - 1.0 - floor(gl_FragCoord.y));
  vec2 px = (cell + 0.5) * uCell;
  float row = cell.y;
  float h = hash12(cell);

  // NOISE — patches of shouting text drifting across the screen, a few rows louder than the rest,
  // and loose characters everywhere. Domain-warped so the patches tear rather than blob. It lives
  // on a parallax layer that scrolls at 0.3× the page, so the background moves with the reader,
  // further away than the text.
  vec2 pp = vec2(px.x, px.y + uScroll * 0.3);
  float prow = floor(pp.y / uCell.y);
  vec3 q = vec3(pp * vec2(0.0036, 0.0062), uTime * 0.06);
  q.x += fbm(q * 1.6 + 4.0) * 0.9 - uTime * 0.03;
  float n = fbm(q);
  float loud = step(0.62, hash12(vec2(prow, 17.0)));
  float chaos = smoothstep(0.44, 0.72, n) * (0.62 + 0.38 * loud);
  chaos = max(chaos, step(0.955, hash12(vec2(cell.x, prow) + floor(uTime * 1.7 + h * 7.0))) * 0.42);
  chaos *= uChaos;

  // ORDER — a typed page: text on every other row, paragraphs of four lines and a short last
  // line, ragged at the inline end (the LEFT, this is Hebrew).
  float lineOn = 1.0 - mod(row, 2.0);
  float inPara = step(mod(row, 10.0), 7.0);
  float len = 0.42 + 0.52 * hash12(vec2(floor(row * 0.5), 3.0));
  len *= mix(1.0, 0.45, step(6.0, mod(row, 10.0)));
  float fromStart = (uView.x - px.x) / uView.x;
  float text = step(0.07, fromStart) * step(fromStart, 0.07 + 0.86 * len);
  float order = lineOn * inPara * text * 0.6;

  // Each cell snaps from noise to page at its own moment, so the change reads as characters
  // falling into place rather than a crossfade.
  float k = smoothstep(h - 0.05, h + 0.05, uOrder * 1.1 - 0.05);
  float L = mix(chaos, order, k);
  float mode = mix(1.0, 2.0, k);

  // CALM — a sparse lattice with a few drifting words left in it.
  float lattice = step(mod(cell.x, 4.0), 0.5) * step(mod(row, 3.0), 0.5) * 0.13;
  L = mix(L, max(lattice, L * 0.32), uCalm);

  // LENS — under the visitor's pointer the noise stops and turns into lines you can read.
  float d = distance(px, uLens.xy);
  float lensK = (1.0 - smoothstep(uLens.z * 0.55, uLens.z, d + (h - 0.5) * uLens.z * 0.3)) * uLens.w;
  L = mix(L, lineOn * 0.82, lensK);
  mode = mix(mode, 2.0, step(0.5, lensK));
  float hi = lensK * 0.35;

  // RIPPLES — a click sends a ring through the field that scrambles what it passes.
  float scramble = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 r = uRipple[i];
    if (r.w <= 0.0) continue;
    float radius = r.z * 980.0;
    float width = 30.0 + r.z * 70.0;
    float ring = exp(-pow((distance(px, r.xy) - radius) / width, 2.0)) * exp(-r.z * 2.4) * r.w;
    L = max(L, ring * 0.9);
    scramble = max(scramble, ring);
  }

  // QUIET — the field steps back behind every block of page text.
  float quiet = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uQuietN) break;
    vec4 z = uQuiet[i];
    vec2 dd = max(max(z.xy - px, px - z.zw), 0.0);
    quiet = max(quiet, 1.0 - smoothstep(0.0, 48.0, length(dd)));
  }
  // Down to blank, not to dots: a stray density mark between two words reads as a typo.
  L *= mix(1.0, 0.04, quiet);
  scramble *= 1.0 - quiet;

  // HEADLINE — the field steps back inside the headline's box; pass 2 draws the letters on their
  // own finer grid (a 9-row letter is too coarse for Hebrew letterforms, an 18-row one reads).
  if (uMaskAmt > 0.0 && px.x >= uMaskRect.x - 16.0 && px.x <= uMaskRect.z + 16.0 && px.y >= uMaskRect.y - 8.0 && px.y <= uMaskRect.w + 8.0) {
    L *= 1.0 - 0.85 * uMaskAmt;
    scramble *= 1.0 - uMaskAmt;
  }

  o = vec4(clamp(L, 0.0, 1.0), mode / 3.0, scramble, hi);
}`;

const GLYPH_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uScene;
uniform sampler2D uAtlas;
uniform sampler2D uAtlasSmall;
uniform sampler2D uWords;
uniform sampler2D uMask;
uniform vec4 uMaskRectDev;
uniform float uMaskAmt;
uniform float uMaskLod;
uniform vec2 uSubDev;
uniform vec2 uCellDev;
uniform vec2 uViewDev;
uniform vec2 uGrid;
uniform vec2 uAtlasGrid;
uniform float uTime;
uniform float uFlow;
uniform float uScrollRows;
uniform float uVel;
uniform float uDim;
uniform float uWordsRows;
uniform vec3 uInk;
uniform vec3 uInkHi;
uniform vec3 uGround;
out vec4 o;
${COMMON}
void main() {
  float yTop = uViewDev.y - gl_FragCoord.y;
  vec2 p = vec2(gl_FragCoord.x, yTop);

  // HEADLINE — letters built from the fill word on a half-size grid, each sub-cell snapping in at
  // its own moment while the headline assembles. A faint ink wash under the glyphs keeps every
  // letter reading as one shape rather than a scatter of characters.
  if (uMaskAmt > 0.0 && p.x >= uMaskRectDev.x && p.x <= uMaskRectDev.z && p.y >= uMaskRectDev.y && p.y <= uMaskRectDev.w) {
    vec2 sc = floor(p / uSubDev);
    vec2 muv = ((sc + 0.5) * uSubDev - uMaskRectDev.xy) / (uMaskRectDev.zw - uMaskRectDev.xy);
    float m = textureLod(uMask, muv, uMaskLod).r;
    float hs = hash12(sc + 3.7);
    float a = smoothstep(hs * 0.8, hs * 0.8 + 0.2, uMaskAmt);
    if (m > 0.42 && a > 0.5) {
      int fg = int(texelFetch(uWords, ivec2(int(mod(sc.x, ${WORDS_W}.0)), int(uWordsRows - 1.0)), 0).r * 255.0 + 0.5);
      vec2 inSub = (p - sc * uSubDev) / uSubDev;
      vec2 fslot = vec2(float(fg % ${ATLAS_COLS}), float(fg / ${ATLAS_COLS}));
      float al = texture(uAtlasSmall, (fslot + inSub) / uAtlasGrid).r;
      vec3 wash = mix(uGround, uInk, 0.16);
      o = vec4(mix(wash, uInkHi, al), 1.0);
      return;
    }
  }

  vec2 c = floor(vec2(gl_FragCoord.x, yTop) / uCellDev);
  if (c.x >= uGrid.x || c.y >= uGrid.y) { o = vec4(uGround, 1.0); return; }
  vec2 inCell = (vec2(gl_FragCoord.x, yTop) - c * uCellDev) / uCellDev;
  vec4 s = texelFetch(uScene, ivec2(c.x, uGrid.y - 1.0 - c.y), 0);
  float L = s.r;
  int mode = int(s.g * 3.0 + 0.5);
  float h = hash12(c);

  int g = 0;
  if (L < 0.07) g = 0;
  else if (L < 0.17) g = 1;
  else if (L < 0.27) g = 2;
  else if (L < 0.38) g = h < 0.5 ? 3 : 4;
  else if (mode == 0) g = h < 0.5 ? 5 : 6;
  else {
    float textRows = uWordsRows - 1.0;
    float wr;
    float off;
    if (mode == 3) {
      wr = textRows;
      off = 0.0;
    } else {
      float rowW = mode == 1 ? c.y + uScrollRows : c.y;
      wr = mod(rowW * 7.0 + 3.0, textRows);
      float r = hash12(vec2(rowW, 9.0));
      float speed = (r < 0.5 ? -1.0 : 1.0) * (1.2 + 6.0 * fract(r * 7.13));
      // A fast scroll shoves every row sideways, each by its own amount, and the springs in the
      // controller let it settle back when the scrolling stops.
      off = mode == 1 ? floor(uFlow * speed + uVel * 0.006 * (r - 0.5) * 2.0) : floor(c.y * 13.0);
    }
    float x = mod(c.x + off, ${WORDS_W}.0);
    g = int(texelFetch(uWords, ivec2(int(x), int(wr)), 0).r * 255.0 + 0.5);
  }
  if (s.b > 0.22) {
    g = ${FIRST_LETTER} + int(hash12(c + floor(uTime * 26.0)) * ${GLYPH_COUNT - FIRST_LETTER}.0);
  }
  if (g == 0) { o = vec4(uGround, 1.0); return; }

  vec2 slot = vec2(float(g % ${ATLAS_COLS}), float(g / ${ATLAS_COLS}));
  float a = texture(uAtlas, (slot + inCell) / uAtlasGrid).r;
  float b = (0.28 + 0.72 * smoothstep(0.1, 1.0, L)) * mix(uDim, 1.0, s.a);
  vec3 ink = mix(uInk, uInkHi, s.a);
  o = vec4(mix(uGround, ink, a * b), 1.0);
}`;

export interface FrameInput {
  time: number;
  flow: number;
  /** window.scrollY, CSS px. */
  scroll: number;
  /** Smoothed scroll velocity, CSS px per second. */
  vel: number;
  chaos: number;
  order: number;
  calm: number;
  dim: number;
  /** x, y (viewport CSS px), radius (px), strength 0..1 */
  lens: [number, number, number, number];
  /** 4 × (x, y, age seconds, strength) */
  ripples: Float32Array;
  /** 8 × (x0, y0, x1, y1) viewport CSS px */
  quiet: Float32Array;
  quietN: number;
  maskRect: [number, number, number, number];
  maskAmt: number;
}

type Uniforms = Record<string, WebGLUniformLocation | null>;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const FIELD_INK = '#8FD400';
export const FIELD_INK_HI = '#C8F46E';
export const FIELD_GROUND = '#0A0B09';

export class GlyphRenderer {
  private gl: WebGL2RenderingContext;
  private scene!: WebGLProgram;
  private glyph!: WebGLProgram;
  private su: Uniforms = {};
  private gu: Uniforms = {};
  private vao: WebGLVertexArrayObject | null = null;
  private sceneTex: WebGLTexture | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private atlasTex: WebGLTexture | null = null;
  private atlasSmallTex: WebGLTexture | null = null;
  private subDev: [number, number] = [0, 0];
  private dpr = 1;
  private wordsTex: WebGLTexture | null = null;
  private maskTex: WebGLTexture | null = null;
  private maskSize: [number, number] = [0, 0];
  private cols = 0;
  private rows = 0;
  private cellDev: [number, number] = [0, 0];
  private cellCss: [number, number] = [0, 0];
  private viewCss: [number, number] = [0, 0];
  private viewDev: [number, number] = [0, 0];

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  static create(canvas: HTMLCanvasElement): GlyphRenderer | null {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    });
    if (!gl) return null;
    const r = new GlyphRenderer(gl);
    try {
      r.init();
    } catch (err) {
      console.warn('[GlyphField] WebGL2 init failed — the page keeps its plain ground.', err);
      return null;
    }
    return r;
  }

  private compile(fragSrc: string): WebGLProgram {
    const gl = this.gl;
    const make = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader');
      return sh;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, make(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, make(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    return p;
  }

  private locate(p: WebGLProgram, names: string[]): Uniforms {
    const out: Uniforms = {};
    for (const n of names) out[n] = this.gl.getUniformLocation(p, n);
    return out;
  }

  private init() {
    const gl = this.gl;
    this.scene = this.compile(SCENE_FRAG);
    this.glyph = this.compile(GLYPH_FRAG);
    this.su = this.locate(this.scene, [
      'uGrid', 'uCell', 'uView', 'uTime', 'uScroll', 'uChaos', 'uOrder', 'uCalm', 'uLens', 'uRipple', 'uQuiet',
      'uQuietN', 'uMaskRect', 'uMaskAmt',
    ]);
    this.gu = this.locate(this.glyph, [
      'uScene', 'uAtlas', 'uAtlasSmall', 'uWords', 'uMask', 'uMaskRectDev', 'uMaskAmt', 'uMaskLod', 'uSubDev',
      'uCellDev', 'uViewDev', 'uGrid', 'uAtlasGrid', 'uTime', 'uFlow', 'uScrollRows', 'uVel', 'uDim', 'uWordsRows', 'uInk', 'uInkHi', 'uGround',
    ]);
    this.vao = gl.createVertexArray();
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    // A 1×1 black mask so the sampler is always bound to something valid.
    this.maskTex = this.makeTex(gl.LINEAR, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
    this.maskSize = [1, 1];
  }

  private makeTex(min: number, mag: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  /** CSS size of the drawing surface, device pixel ratio, and the cell size in CSS px. */
  resize(cssW: number, cssH: number, dpr: number, cell: [number, number]) {
    const gl = this.gl;
    const cw = Math.max(4, Math.round(cell[0] * dpr));
    const ch = Math.max(7, Math.round(cell[1] * dpr));
    const devW = Math.max(1, Math.round(cssW * dpr));
    const devH = Math.max(1, Math.round(cssH * dpr));
    const canvas = gl.canvas as HTMLCanvasElement;
    if (canvas.width !== devW || canvas.height !== devH) {
      canvas.width = devW;
      canvas.height = devH;
    }
    const cellChanged = cw !== this.cellDev[0] || ch !== this.cellDev[1];
    this.cellDev = [cw, ch];
    // Half a cell, but never under ~6×10 device px: below that a glyph is a scanline, not a letter.
    this.subDev = [Math.max(6, Math.round(cw / 2)), Math.max(10, Math.round(ch / 2))];
    this.dpr = dpr;
    this.cellCss = [cw / dpr, ch / dpr];
    this.viewCss = [cssW, cssH];
    this.viewDev = [devW, devH];
    const cols = Math.ceil(devW / cw);
    const rows = Math.ceil(devH / ch);
    if (cols !== this.cols || rows !== this.rows || !this.sceneTex) {
      this.cols = cols;
      this.rows = rows;
      if (this.sceneTex) gl.deleteTexture(this.sceneTex);
      if (this.fbo) gl.deleteFramebuffer(this.fbo);
      this.sceneTex = this.makeTex(gl.NEAREST, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    if (cellChanged) this.buildAtlas();
    return { cellCss: this.cellCss };
  }

  /** Rasterise every glyph at exactly one cell's device-pixel size, and again at the headline's
   * half-size sub-cell. Re-run after fonts load. */
  buildAtlas() {
    const gl = this.gl;
    if (!this.cellDev[0] || !this.cellDev[1]) return;
    if (this.atlasTex) gl.deleteTexture(this.atlasTex);
    if (this.atlasSmallTex) gl.deleteTexture(this.atlasSmallTex);
    this.atlasTex = this.rasterAtlas(this.cellDev[0], this.cellDev[1]);
    this.atlasSmallTex = this.rasterAtlas(this.subDev[0], this.subDev[1]);
  }

  private rasterAtlas(cw: number, ch: number): WebGLTexture | null {
    const gl = this.gl;
    const c = document.createElement('canvas');
    c.width = ATLAS_COLS * cw;
    c.height = ATLAS_ROWS * ch;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.max(4, Math.round(ch * 0.8))}px Cousine, "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    [...GLYPHS].forEach((g, i) => {
      if (i === 0) return;
      ctx.fillText(g, (i % ATLAS_COLS) * cw + cw / 2, Math.floor(i / ATLAS_COLS) * ch + ch * 0.55);
    });
    const t = this.makeTex(gl.NEAREST, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, c);
    return t;
  }

  setWords(data: Uint8Array) {
    const gl = this.gl;
    if (!this.wordsTex) this.wordsTex = this.makeTex(gl.NEAREST, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, this.wordsTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, WORDS_W, WORDS_H, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  }

  setMask(canvas: HTMLCanvasElement) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.maskSize = [canvas.width, canvas.height];
  }

  get cell(): [number, number] {
    return this.cellCss;
  }

  /** CSS size of one headline sub-cell. */
  get subCell(): [number, number] {
    return [this.subDev[0] / this.dpr, this.subDev[1] / this.dpr];
  }

  render(f: FrameInput) {
    const gl = this.gl;
    if (!this.sceneTex || !this.atlasTex || !this.atlasSmallTex || !this.wordsTex) return;
    gl.bindVertexArray(this.vao);

    // Pass 1 — one fragment per cell.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.cols, this.rows);
    gl.useProgram(this.scene);
    const s = this.su;
    gl.uniform2f(s.uGrid, this.cols, this.rows);
    gl.uniform2f(s.uCell, this.cellCss[0], this.cellCss[1]);
    gl.uniform2f(s.uView, this.viewCss[0], this.viewCss[1]);
    gl.uniform1f(s.uTime, f.time);
    gl.uniform1f(s.uScroll, f.scroll);
    gl.uniform1f(s.uChaos, f.chaos);
    gl.uniform1f(s.uOrder, f.order);
    gl.uniform1f(s.uCalm, f.calm);
    gl.uniform4f(s.uLens, f.lens[0], f.lens[1], f.lens[2], f.lens[3]);
    gl.uniform4fv(s.uRipple, f.ripples);
    gl.uniform4fv(s.uQuiet, f.quiet);
    gl.uniform1i(s.uQuietN, f.quietN);
    gl.uniform4f(s.uMaskRect, f.maskRect[0], f.maskRect[1], f.maskRect[2], f.maskRect[3]);
    gl.uniform1f(s.uMaskAmt, f.maskAmt);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Pass 2 — glyphs to the screen.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.viewDev[0], this.viewDev[1]);
    gl.useProgram(this.glyph);
    const g = this.gu;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.uniform1i(g.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.uniform1i(g.uAtlas, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.wordsTex);
    gl.uniform1i(g.uWords, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasSmallTex);
    gl.uniform1i(g.uAtlasSmall, 3);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.uniform1i(g.uMask, 4);
    const d = this.dpr;
    gl.uniform4f(g.uMaskRectDev, f.maskRect[0] * d, f.maskRect[1] * d, f.maskRect[2] * d, f.maskRect[3] * d);
    gl.uniform1f(g.uMaskAmt, f.maskAmt);
    // Sample the mask at about one sub-cell, so a sub-cell reads "how much of me is letter".
    const subInMask = (this.subDev[1] / d) * (this.maskSize[1] / Math.max(1, f.maskRect[3] - f.maskRect[1]));
    gl.uniform1f(g.uMaskLod, Math.max(0, Math.log2(Math.max(1, subInMask * 0.6))));
    gl.uniform2f(g.uSubDev, this.subDev[0], this.subDev[1]);
    gl.uniform2f(g.uCellDev, this.cellDev[0], this.cellDev[1]);
    gl.uniform2f(g.uViewDev, this.viewDev[0], this.viewDev[1]);
    gl.uniform2f(g.uGrid, this.cols, this.rows);
    gl.uniform2f(g.uAtlasGrid, ATLAS_COLS, ATLAS_ROWS);
    gl.uniform1f(g.uTime, f.time);
    gl.uniform1f(g.uFlow, f.flow);
    gl.uniform1f(g.uScrollRows, Math.floor((f.scroll * 0.3) / this.cellCss[1]));
    gl.uniform1f(g.uVel, f.vel);
    gl.uniform1f(g.uDim, f.dim);
    gl.uniform1f(g.uWordsRows, WORDS_H);
    gl.uniform3fv(g.uInk, hexToRgb(FIELD_INK));
    gl.uniform3fv(g.uInkHi, hexToRgb(FIELD_INK_HI));
    gl.uniform3fv(g.uGround, hexToRgb(FIELD_GROUND));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    for (const t of [this.sceneTex, this.atlasTex, this.atlasSmallTex, this.wordsTex, this.maskTex]) if (t) gl.deleteTexture(t);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    if (this.vao) gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.scene);
    gl.deleteProgram(this.glyph);
  }
}
