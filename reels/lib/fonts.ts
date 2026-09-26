/**
 * The DESIGN.md type roles as local webfonts for the HyperFrames composition.
 *
 * HyperFrames requires an in-file `@font-face` pointing at a shipped file for every named family
 * (lint `font_family_without_font_face`) — a render must not depend on a CDN answering mid-frame.
 * So the Google Fonts CSS is fetched once, only the `hebrew` and `latin` subsets are kept, the
 * woff2 files are cached in reels/.cache/fonts and copied into the project's assets/fonts.
 *
 * Noto Sans Hebrew is requested WITH its width axis: the condensed headline role (`font-stretch:
 * 75%`) has nothing to select without it — the same reason dashboard/index.html loads `wdth`.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const FAMILIES = [
  'Noto+Sans+Hebrew:wdth,wght@62.5..100,400..900',
  'Assistant:wght@400..800',
  'Playpen+Sans+Hebrew:wght@400..700',
];
// A modern UA, or Google serves TTF without unicode-range subsets.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const KEEP_SUBSETS = new Set(['hebrew', 'latin']);

export async function prepareFonts(cacheDir: string, projectAssetsDir: string): Promise<string> {
  const url = `https://fonts.googleapis.com/css2?${FAMILIES.map((f) => `family=${f}`).join('&')}&display=block`;
  const cssCache = path.join(cacheDir, 'fonts', 'fonts.css');
  fs.mkdirSync(path.dirname(cssCache), { recursive: true });
  let css: string;
  if (fs.existsSync(cssCache)) css = fs.readFileSync(cssCache, 'utf8');
  else {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`Google Fonts CSS ${res.status}`);
    css = await res.text();
    fs.writeFileSync(cssCache, css);
  }

  const outFonts = path.join(projectAssetsDir, 'fonts');
  fs.mkdirSync(outFonts, { recursive: true });
  const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*{[^}]*})/g)];
  const kept: string[] = [];
  for (const [, subset, block] of blocks) {
    if (!KEEP_SUBSETS.has(subset)) continue;
    const src = /url\((https:[^)]+)\)/.exec(block)?.[1];
    if (!src) continue;
    const name = `${crypto.createHash('sha1').update(src).digest('hex').slice(0, 12)}.woff2`;
    const cached = path.join(cacheDir, 'fonts', name);
    if (!fs.existsSync(cached)) {
      const r = await fetch(src);
      if (!r.ok) throw new Error(`font download ${r.status}: ${src}`);
      fs.writeFileSync(cached, Buffer.from(await r.arrayBuffer()));
    }
    fs.copyFileSync(cached, path.join(outFonts, name));
    kept.push(block.replace(src, `assets/fonts/${name}`));
  }
  if (!kept.length) throw new Error('no hebrew/latin @font-face blocks found in the Google Fonts CSS');
  return kept.join('\n');
}
