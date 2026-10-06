/* The glyph field from the site (src/components/field/), ported for the deck.
 *
 * Same two-pass WebGL2 renderer, same alphabet, same springs. The site drives it by scroll beats;
 * the deck drives it per slide: every slide names a stage (how loud the noise is, how sorted, how
 * calm, how dim), the field springs to it, and a slide change shoves the rows sideways and sends a
 * ripple from the bot. The pointer is a lens that calms the noise into readable words; with no
 * pointer around, the lens follows the bot.
 *
 * Every word in the field is a real name or term from the article and the Grok Bot pages — the
 * site's Real Words Rule. Nothing here is an invented slogan.
 */
(function () {
  'use strict';

  const RAMP = ' .:-=+*';
  const HEBREW = 'אבגדהוזחטיכךלמםנןסעפףצץקרשת';
  const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const PUNCT = ",'\"/%&#@()_";
  const GLYPHS = RAMP + HEBREW + LATIN + PUNCT;
  const GLYPH_COUNT = [...GLYPHS].length;
  const FIRST_LETTER = RAMP.length;
  const ATLAS_COLS = 16;
  const ATLAS_ROWS = Math.ceil(GLYPH_COUNT / ATLAS_COLS);
  const INDEX = new Map([...GLYPHS].map((ch, i) => [ch, i]));
  const WORDS_W = 256;
  const WORDS_TEXT_ROWS = 47;
  const WORDS_H = WORDS_TEXT_ROWS + 1;

  const TERMS = [
    'Grok Bot', 'Grok', 'Grok 4.6', 'Grok 4.7', 'Grok Build', 'grok-build-0.1', 'grok-4.6', 'Grok 4.1 Fast',
    'SuperGrok', 'SuperGrok Heavy', 'Cursor', 'SpaceXAI', 'xAI', 'Main Bot', 'Team Bots', 'Marketplace',
    'Gmail', 'Outlook', 'Slack', 'Notion', 'GitHub', 'Drive', '1Password', 'iOS', 'Mac', 'Windows', 'Linux',
    'PASS', 'FAIL', 'MAX_ATTEMPTS', 'reviewer.md', 'routine', 'plugins', 'API', 'tokens', '500K', '200K',
    'סוכנים', 'בוט', 'צוות', 'שגרה', 'צ׳קליסט', 'בודק', 'לולאה', 'אישור', 'טיוטה', 'מחשב משלו', 'חלון הקשר',
    'טוקנים', 'בריף', 'קובץ קול', 'משימה', 'גמור', 'בוט ראשי', 'טיוטות', 'שגרות',
    // the site's own seed: the AI noise a learner meets every week
    'ChatGPT', 'Claude', 'Gemini', 'Llama', 'DeepSeek', 'Qwen', 'Mistral', 'Copilot', 'Perplexity', 'NotebookLM',
    'n8n', 'MCP', 'RAG', 'LLM', 'prompt', 'agents', 'סוכני AI', 'פרומפט', 'מודל שפה', 'וייב קודינג', 'מודל חדש',
  ];

  const NIQQUD = /[֑-ׇ]/g;
  const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;
  function normalize(s) {
    return s.replace(NIQQUD, '').replace(INVISIBLE, '').replace(/[‐-―−]/g, '-')
      .replace(/[׳‘’`]/g, "'").replace(/[״“”]/g, '"').replace(/\s+/g, ' ').trim();
  }
  const LTR_RUN = /[A-Za-z0-9]+(?:[ .\-:/_'+]+[A-Za-z0-9]+)*/g;
  // Logical (typed) order → visual left-to-right order for one RTL line, so "Claude" never comes out "edualC".
  function toVisual(logical) {
    const runs = [];
    let last = 0;
    for (const m of logical.matchAll(LTR_RUN)) {
      const at = m.index || 0;
      if (at > last) runs.push({ text: logical.slice(last, at), ltr: false });
      runs.push({ text: m[0], ltr: true });
      last = at + m[0].length;
    }
    if (last < logical.length) runs.push({ text: logical.slice(last), ltr: false });
    return runs.reverse().map((r) => (r.ltr ? r.text : [...r.text].reverse().join('').replace(/[()]/g, (p) => (p === '(' ? ')' : '(')))).join('');
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function encodeRow(visual, out, row) {
    const chars = [...visual];
    for (let x = 0; x < WORDS_W; x++) {
      const ch = chars.length ? chars[x % chars.length] : ' ';
      out[row * WORDS_W + x] = INDEX.get(ch) || 0;
    }
  }
  function buildWordsTexture(phrases, fill) {
    const out = new Uint8Array(WORDS_W * WORDS_H);
    const pool = phrases.map(normalize).filter((p) => p.length > 1);
    const rand = mulberry32(0x5eed + pool.length);
    for (let row = 0; row < WORDS_TEXT_ROWS; row++) {
      let line = '';
      while ([...line].length < WORDS_W + 24) line += pool[Math.floor(rand() * pool.length)] + '   ';
      encodeRow(toVisual(line), out, row);
    }
    const word = normalize(fill || 'Grok');
    encodeRow(toVisual(word.repeat(Math.ceil(WORDS_W / Math.max(1, word.length)))), out, WORDS_H - 1);
    return out;
  }

  // ── shaders: verbatim from glyphRenderer.ts ───────────────────────────────────────────────────
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
  vec2 pp = vec2(px.x, px.y + uScroll * 0.3);
  float prow = floor(pp.y / uCell.y);
  vec3 q = vec3(pp * vec2(0.0036, 0.0062), uTime * 0.06);
  q.x += fbm(q * 1.6 + 4.0) * 0.9 - uTime * 0.03;
  float n = fbm(q);
  float loud = step(0.62, hash12(vec2(prow, 17.0)));
  float chaos = smoothstep(0.44, 0.72, n) * (0.62 + 0.38 * loud);
  chaos = max(chaos, step(0.955, hash12(vec2(cell.x, prow) + floor(uTime * 1.7 + h * 7.0))) * 0.42);
  chaos *= uChaos;
  float lineOn = 1.0 - mod(row, 2.0);
  float inPara = step(mod(row, 10.0), 7.0);
  float len = 0.42 + 0.52 * hash12(vec2(floor(row * 0.5), 3.0));
  len *= mix(1.0, 0.45, step(6.0, mod(row, 10.0)));
  float fromStart = (uView.x - px.x) / uView.x;
  float text = step(0.07, fromStart) * step(fromStart, 0.07 + 0.86 * len);
  float order = lineOn * inPara * text * 0.6;
  float k = smoothstep(h - 0.05, h + 0.05, uOrder * 1.1 - 0.05);
  float L = mix(chaos, order, k);
  float mode = mix(1.0, 2.0, k);
  float lattice = step(mod(cell.x, 4.0), 0.5) * step(mod(row, 3.0), 0.5) * 0.13;
  L = mix(L, max(lattice, L * 0.32), uCalm);
  float d = distance(px, uLens.xy);
  float lensK = (1.0 - smoothstep(uLens.z * 0.55, uLens.z, d + (h - 0.5) * uLens.z * 0.3)) * uLens.w;
  L = mix(L, lineOn * 0.82, lensK);
  mode = mix(mode, 2.0, step(0.5, lensK));
  float hi = lensK * 0.35;
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
  float quiet = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uQuietN) break;
    vec4 z = uQuiet[i];
    vec2 dd = max(max(z.xy - px, px - z.zw), 0.0);
    quiet = max(quiet, 1.0 - smoothstep(0.0, 48.0, length(dd)));
  }
  L *= mix(1.0, 0.04, quiet);
  scramble *= 1.0 - quiet;
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

  const INK = [143 / 255, 212 / 255, 0];
  const INK_HI = [200 / 255, 244 / 255, 110 / 255];
  const GROUND = [10 / 255, 11 / 255, 9 / 255];

  // ── renderer ─────────────────────────────────────────────────────────────────────────────────
  function Renderer(gl) {
    this.gl = gl;
    this.cols = 0; this.rows = 0;
    this.cellDev = [0, 0]; this.cellCss = [0, 0]; this.subDev = [0, 0];
    this.viewCss = [0, 0]; this.viewDev = [0, 0]; this.dpr = 1;
    this.maskSize = [1, 1];
  }
  Renderer.create = function (canvas) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
    if (!gl) return null;
    const r = new Renderer(gl);
    try { r.init(); } catch (err) { console.warn('[field] WebGL2 init failed, the deck keeps its plain ground.', err); return null; }
    return r;
  };
  Renderer.prototype.compile = function (frag) {
    const gl = this.gl;
    const make = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader');
      return sh;
    };
    const p = gl.createProgram();
    gl.attachShader(p, make(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, make(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    return p;
  };
  Renderer.prototype.locate = function (p, names) {
    const out = {};
    for (const n of names) out[n] = this.gl.getUniformLocation(p, n);
    return out;
  };
  Renderer.prototype.init = function () {
    const gl = this.gl;
    this.scene = this.compile(SCENE_FRAG);
    this.glyph = this.compile(GLYPH_FRAG);
    this.su = this.locate(this.scene, ['uGrid', 'uCell', 'uView', 'uTime', 'uScroll', 'uChaos', 'uOrder', 'uCalm', 'uLens', 'uRipple', 'uQuiet', 'uQuietN', 'uMaskRect', 'uMaskAmt']);
    this.gu = this.locate(this.glyph, ['uScene', 'uAtlas', 'uAtlasSmall', 'uWords', 'uMask', 'uMaskRectDev', 'uMaskAmt', 'uMaskLod', 'uSubDev', 'uCellDev', 'uViewDev', 'uGrid', 'uAtlasGrid', 'uTime', 'uFlow', 'uScrollRows', 'uVel', 'uDim', 'uWordsRows', 'uInk', 'uInkHi', 'uGround']);
    this.vao = gl.createVertexArray();
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.maskTex = this.makeTex(gl.LINEAR, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
  };
  Renderer.prototype.makeTex = function (min, mag) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  Renderer.prototype.resize = function (cssW, cssH, dpr, cell) {
    const gl = this.gl;
    const cw = Math.max(4, Math.round(cell[0] * dpr));
    const ch = Math.max(7, Math.round(cell[1] * dpr));
    const devW = Math.max(1, Math.round(cssW * dpr));
    const devH = Math.max(1, Math.round(cssH * dpr));
    const canvas = gl.canvas;
    if (canvas.width !== devW || canvas.height !== devH) { canvas.width = devW; canvas.height = devH; }
    const cellChanged = cw !== this.cellDev[0] || ch !== this.cellDev[1];
    this.cellDev = [cw, ch];
    this.subDev = [Math.max(6, Math.round(cw / 2)), Math.max(10, Math.round(ch / 2))];
    this.dpr = dpr;
    this.cellCss = [cw / dpr, ch / dpr];
    this.viewCss = [cssW, cssH];
    this.viewDev = [devW, devH];
    const cols = Math.ceil(devW / cw);
    const rows = Math.ceil(devH / ch);
    if (cols !== this.cols || rows !== this.rows || !this.sceneTex) {
      this.cols = cols; this.rows = rows;
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
  };
  Renderer.prototype.buildAtlas = function () {
    const gl = this.gl;
    if (!this.cellDev[0] || !this.cellDev[1]) return;
    if (this.atlasTex) gl.deleteTexture(this.atlasTex);
    if (this.atlasSmallTex) gl.deleteTexture(this.atlasSmallTex);
    this.atlasTex = this.rasterAtlas(this.cellDev[0], this.cellDev[1]);
    this.atlasSmallTex = this.rasterAtlas(this.subDev[0], this.subDev[1]);
  };
  Renderer.prototype.rasterAtlas = function (cw, ch) {
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
  };
  Renderer.prototype.setWords = function (data) {
    const gl = this.gl;
    if (!this.wordsTex) this.wordsTex = this.makeTex(gl.NEAREST, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, this.wordsTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, WORDS_W, WORDS_H, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  };
  Renderer.prototype.setMask = function (canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.maskSize = [canvas.width, canvas.height];
  };
  Renderer.prototype.render = function (f) {
    const gl = this.gl;
    if (!this.sceneTex || !this.atlasTex || !this.atlasSmallTex || !this.wordsTex) return;
    gl.bindVertexArray(this.vao);
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

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.viewDev[0], this.viewDev[1]);
    gl.useProgram(this.glyph);
    const g = this.gu;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex); gl.uniform1i(g.uScene, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.atlasTex); gl.uniform1i(g.uAtlas, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.wordsTex); gl.uniform1i(g.uWords, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.atlasSmallTex); gl.uniform1i(g.uAtlasSmall, 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.maskTex); gl.uniform1i(g.uMask, 4);
    const d = this.dpr;
    gl.uniform4f(g.uMaskRectDev, f.maskRect[0] * d, f.maskRect[1] * d, f.maskRect[2] * d, f.maskRect[3] * d);
    gl.uniform1f(g.uMaskAmt, f.maskAmt);
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
    gl.uniform3fv(g.uInk, INK);
    gl.uniform3fv(g.uInkHi, INK_HI);
    gl.uniform3fv(g.uGround, GROUND);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  };
  Renderer.prototype.dispose = function () {
    const gl = this.gl;
    for (const t of [this.sceneTex, this.atlasTex, this.atlasSmallTex, this.wordsTex, this.maskTex]) if (t) gl.deleteTexture(t);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    if (this.vao) gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.scene);
    gl.deleteProgram(this.glyph);
  };

  // ── controller ───────────────────────────────────────────────────────────────────────────────
  const spring = (x) => ({ x: x, v: 0 });
  function stepSpring(s, target, k, zeta, dt) {
    const c = 2 * Math.sqrt(k) * zeta;
    s.v += (k * (target - s.x) - c * s.v) * dt;
    s.x += s.v * dt;
  }
  const KEYS = ['chaos', 'order', 'calm', 'lens', 'dim'];
  const STRETCH = { '62.5%': 'extra-condensed', '75%': 'condensed', '87.5%': 'semi-condensed' };
  // Below this many glyph rows a letter stops reading and the headline stays solid ink. Latin holds at
  // 8, which keeps the cover's "Grok Bot" in glyphs in the homepage frame on a phone (~8.8 rows).
  // Hebrew needs 9: its letters part on thin gaps (ה/ח, the arms of ש), and "משימה אחת" at 8.8 rows
  // read as texture.
  const minRowsFor = (text) => (/[א-ת]/.test(text) ? 9 : 8);

  const Field = {
    ok: false,
    stage: { chaos: 0.45, order: 0.15, calm: 0.72, lens: 0.55, dim: 0.4 },
    reduce: false,
    getScale: () => 1,
    lensProvider: null,
    quietProvider: null,
    onHeadline: null,
  };

  let renderer = null;
  let canvasEl = null;
  let layerEl = null;
  let viewW = 0, viewH = 0;
  let time = 0, flow = 0, lastDraw = 0, touch = false;
  let scroll = spring(0), scrollTarget = 0, vel = spring(0);
  const st = { chaos: spring(1), order: spring(0), calm: spring(0), lens: spring(0), dim: spring(0) };
  const lensX = spring(0), lensY = spring(0), lensOn = spring(0);
  let lensR = 150;
  const ptr = { x: -1e4, y: -1e4, last: -1e9, inside: true, touch: false };
  let rippleList = [];
  const ripples = new Float32Array(16);
  const quiet = new Float32Array(32);
  let words = { fill: 'Grok', dirty: true };
  let mask = { el: null, on: false, start: 0, out: 0, rect: [0, 0, 0, 0], builtKey: '', dirty: true, amt: 0 };

  const cellFor = (w) => { const k = Field.cellScale || 1; return w < 768 ? [5 * k, 9 * k] : [7 * k, 12 * k]; };

  function applySize() {
    if (!renderer) return;
    const w = layerEl.clientWidth || window.innerWidth;
    const h = layerEl.clientHeight || window.innerHeight;
    if (w === viewW && h === viewH) return;
    viewW = w; viewH = h;
    renderer.resize(w, h, Math.min(2, window.devicePixelRatio || 1), cellFor(w));
    mask.dirty = true;
  }

  function buildMask() {
    const el = mask.el;
    if (!renderer || !el) return false;
    const cs = getComputedStyle(el);
    const lay = el.getBoundingClientRect();
    const scale = lay.width / Math.max(1, el.offsetWidth) || Field.getScale();
    const fontPx = (parseFloat(cs.fontSize) || 0) * scale;
    const rows = (fontPx * 0.68) / (renderer.subDev[1] / renderer.dpr);
    if (rows < minRowsFor(el.textContent || '')) return false;
    const box = el.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return false;
    const c = document.createElement('canvas');
    c.width = Math.ceil(box.width);
    c.height = Math.ceil(box.height);
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineJoin = 'round';
    ctx.lineWidth = fontPx * 0.035;
    ctx.font = `${cs.fontWeight} ${STRETCH[cs.fontStretch] || ''} ${fontPx}px ${cs.fontFamily}`;
    // Each word is drawn where the page laid it out, in the element's own direction: a Latin name
    // set dir="ltr" ("MR. DANIEL") keeps its full stop after the R instead of before the M.
    const ltr = cs.direction === 'ltr';
    ctx.direction = ltr ? 'ltr' : 'rtl';
    ctx.textAlign = ltr ? 'left' : 'right';
    ctx.textBaseline = 'alphabetic';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent || '';
      for (const m of text.matchAll(/\S+/g)) {
        const at = m.index || 0;
        range.setStart(node, at);
        range.setEnd(node, at + m[0].length);
        const r = range.getBoundingClientRect();
        if (r.width < 1) continue;
        const ascent = ctx.measureText(m[0]).fontBoundingBoxAscent || fontPx * 0.9;
        const x = ltr ? r.left - box.left : r.right - box.left;
        ctx.strokeText(m[0], x, r.top - box.top + ascent);
        ctx.fillText(m[0], x, r.top - box.top + ascent);
      }
    }
    renderer.setMask(c);
    mask.builtKey = `${Math.round(box.width)}x${Math.round(box.height)}`;
    return true;
  }

  function refreshMask(now) {
    if (!mask.el) return;
    const b = mask.el.getBoundingClientRect();
    const key = `${Math.round(b.width)}x${Math.round(b.height)}`;
    if (key !== mask.builtKey) mask.dirty = true;
    if (!mask.dirty) return;
    mask.dirty = false;
    const ok = buildMask();
    if (ok && !mask.on) mask.start = now + 280;
    if (ok !== mask.on) {
      mask.on = ok;
      if (Field.onHeadline) Field.onHeadline(mask.el, ok);
    }
  }

  Field.init = function (canvas, layer, opts) {
    canvasEl = canvas; layerEl = layer;
    touch = !!(opts && opts.touch);
    Field.reduce = !!(opts && opts.reduce);
    renderer = Renderer.create(canvas);
    if (!renderer) return false;
    Field.ok = true;
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) ptr.inside = false; });
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); renderer = null; Field.ok = false; });
    canvas.addEventListener('webglcontextrestored', () => {
      renderer = Renderer.create(canvas);
      if (!renderer) return;
      Field.ok = true; viewW = viewH = 0; words.dirty = true; mask.dirty = true; mask.on = false;
      applySize();
    });
    applySize();
    lensX.x = window.innerWidth * 0.3; lensY.x = window.innerHeight * 0.45;
    return true;
  };
  function onMove(e) {
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.last = performance.now();
    ptr.touch = e.pointerType !== 'mouse'; ptr.inside = true;
  }
  Field.fontsReady = function () {
    if (!renderer) return;
    renderer.buildAtlas();
    mask.dirty = true;
  };
  Field.setStage = function (s) { Object.assign(Field.stage, s); };
  Field.setWordsFill = function (fill) { if (fill && fill !== words.fill) { words.fill = fill; words.dirty = true; } };
  Field.setMask = function (el) {
    if (el === mask.el) return;
    if (mask.el && mask.on && Field.onHeadline) Field.onHeadline(mask.el, false);
    mask.el = el || null;
    mask.on = false;
    mask.dirty = true;
    mask.builtKey = '';
  };
  Field.ripple = function (x, y) {
    if (!Field.ok) return;
    rippleList.push({ x: x, y: y, at: performance.now() });
    if (rippleList.length > 4) rippleList.shift();
  };
  // A slide change: the noise layer scrolls like a page turning, and every row gets shoved.
  Field.kick = function (dir) {
    scrollTarget += 340 * dir;
    vel.v += 26000 * dir;
  };
  Field.frame = function (now, dt) {
    if (!renderer) return;
    if (touch && now - lastDraw < 31) return;
    const fdt = Math.min(0.05, Math.max(0.001, lastDraw ? (now - lastDraw) / 1000 : dt));
    lastDraw = now;
    applySize();
    if (words.dirty) { words.dirty = false; renderer.setWords(buildWordsTexture(TERMS, words.fill)); }
    refreshMask(now);

    const moving = !Field.reduce;
    if (moving) {
      time += fdt;
      flow += fdt * (1 + Math.min(4, Math.abs(vel.x) / 700));
    }
    for (let i = 0; i < 2; i++) {
      for (const k of KEYS) stepSpring(st[k], Field.stage[k], 34, 1, fdt / 2);
      stepSpring(scroll, scrollTarget, 30, 0.9, fdt / 2);
      stepSpring(vel, 0, 40, 0.75, fdt / 2);
    }

    // Lens: the hand when there is one, otherwise the bot.
    const idleMs = now - ptr.last;
    const handActive = ptr.touch ? idleMs < 1400 : ptr.inside && idleMs < 2600;
    let tx, ty, tOn;
    if (handActive) { tx = ptr.x; ty = ptr.y; tOn = 1; }
    else {
      const p = Field.lensProvider ? Field.lensProvider() : null;
      if (p) { tx = p.x; ty = p.y; tOn = p.on == null ? 0.8 : p.on; }
      else {
        const w = window.innerWidth, h = window.innerHeight, t = moving ? time : 0;
        tx = w * 0.26 + Math.sin(t * 0.31) * w * 0.12; ty = h * 0.48 + Math.sin(t * 0.47 + 1.3) * h * 0.14; tOn = 0.7;
      }
    }
    for (let i = 0; i < 2; i++) {
      stepSpring(lensX, tx, 90, 0.72, fdt / 2);
      stepSpring(lensY, ty, 90, 0.72, fdt / 2);
      stepSpring(lensOn, tOn, 26, 1, fdt / 2);
    }
    const speed = Math.hypot(lensX.v, lensY.v);
    const baseR = window.innerWidth < 768 ? 104 : 160;
    lensR += (baseR + Math.min(90, speed * 0.05) - lensR) * (1 - Math.exp(-6 * fdt));

    ripples.fill(0);
    rippleList = rippleList.filter((r) => now - r.at < 1700);
    rippleList.forEach((r, i) => ripples.set([r.x, r.y, (now - r.at) / 1000, 1], i * 4));

    let qn = 0;
    const rects = Field.quietProvider ? Field.quietProvider() : [];
    for (const r of rects) {
      if (qn >= 8) break;
      if (r.bottom < -60 || r.top > viewH + 60 || r.width < 1) continue;
      quiet.set([r.left, r.top, r.right, r.bottom], qn * 4);
      qn++;
    }

    let maskRect = [0, 0, 0, 0];
    let maskAmt = 0;
    if (mask.on && mask.el) {
      const r = mask.el.getBoundingClientRect();
      maskRect = [r.left, r.top, r.right, r.bottom];
      const p = Field.reduce ? 1 : Math.min(1, Math.max(0, (now - mask.start) / 1500));
      maskAmt = 1 - Math.pow(1 - p, 3);
    }

    renderer.render({
      time: time, flow: flow, scroll: scroll.x, vel: vel.x,
      chaos: st.chaos.x, order: Math.min(1, Math.max(0, st.order.x)), calm: Math.min(1, Math.max(0, st.calm.x)),
      dim: Math.max(0, st.dim.x),
      lens: [lensX.x, lensY.x, lensR, Math.max(0, lensOn.x * st.lens.x)],
      ripples: ripples, quiet: quiet, quietN: qn, maskRect: maskRect, maskAmt: maskAmt,
    });
    if (!layerEl.hasAttribute('data-ready')) layerEl.setAttribute('data-ready', '');
  };

  window.GlyphField = Field;
})();
