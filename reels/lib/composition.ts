/**
 * Builds the HyperFrames composition (index.html) that lays the Hebrew layer over the 3D plate.
 *
 * Everything with letters in it lives here, in the browser, because the browser is the only layer
 * in this pipeline that shapes and orders Hebrew correctly (Blender's text objects cannot — see
 * reels/blender/signal_core.py). The type roles and colours are DESIGN.md's: condensed Noto Sans
 * Hebrew for headline and captions, Assistant for the supporting line, Playpen Sans Hebrew for the
 * one handwritten note, green (#76B900) as the only accent.
 *
 * The caption DOM is generated here, statically, rather than by a script at load: HyperFrames' lint
 * and Studio see real elements, and the timeline script only animates what is already there.
 */
import type { WordTiming } from './voice.js';

export interface ReelSpec {
  slug: string;
  durationSec: number;
  fps: number;
  template: string;
  seed?: number;
  voice: { text: string; offsetSec: number };
  headline: [string, string];
  note?: { text: string; atWord: string };
  endCard: { title: string; line: string; handle?: string };
}

interface Chunk {
  words: WordTiming[];
  start: number;
  end: number;
}

const ACCENT = '#76B900';
const MAX_CHUNK_WORDS = 3;
const MAX_CHUNK_CHARS = 16;

/** Caption chunks of ≤ 3 words / ≤ 16 letters, breaking after punctuation — times are absolute. */
export function chunkWords(words: WordTiming[], offset: number, hardEnd: number): Chunk[] {
  const chunks: Chunk[] = [];
  let cur: WordTiming[] = [];
  const flush = () => {
    if (cur.length) chunks.push({ words: cur, start: 0, end: 0 });
    cur = [];
  };
  for (const w of words) {
    const chars = cur.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length;
    if (cur.length && (cur.length >= MAX_CHUNK_WORDS || chars > MAX_CHUNK_CHARS)) flush();
    cur.push({ ...w, start: w.start + offset, end: w.end + offset });
    if (/[.,!?;:—]$/.test(w.text)) flush();
  }
  flush();
  chunks.forEach((c, i) => {
    c.start = Math.max(0, c.words[0].start - 0.06);
    const next = chunks[i + 1];
    c.end = Math.min(next ? next.words[0].start - 0.06 : c.words[c.words.length - 1].end + 0.45, hardEnd);
  });
  return chunks;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Captions drop commas and full stops — on screen they are noise — but keep ? and ! (they are tone). */
const captionWord = (s: string) => s.replace(/[.,;:]+$/, '');

export function buildComposition(opts: {
  spec: ReelSpec;
  fontCss: string;
  plateFile: string;
  voiceFile: string;
  voiceDurationSec: number;
  words: WordTiming[];
}): string {
  const { spec, fontCss, words } = opts;
  const D = spec.durationSec;
  const offset = spec.voice.offsetSec;
  const voiceEnd = offset + opts.voiceDurationSec;
  // The end card starts after the last word, but never later than 1.4s before the end.
  const endFrom = +Math.min(Math.max(voiceEnd + 0.25, D - 2.2), D - 1.4).toFixed(2);
  const chunks = chunkWords(words, offset, endFrom - 0.1);

  let note: { text: string; in: number; out: number } | null = null;
  if (spec.note) {
    const hitChunk = chunks.find((c) => c.words.some((w) => w.text.includes(spec.note!.atWord)));
    const hit = hitChunk?.words.find((w) => w.text.includes(spec.note!.atWord));
    if (hit && hitChunk) note = { text: spec.note.text, in: +(hit.start - 0.05).toFixed(2), out: +Math.min(hitChunk.end + 1.2, endFrom - 0.15).toFixed(2) };
  }

  const headlineOut = +Math.min(4.6, (chunks[2]?.start ?? 4.2)).toFixed(2);
  const timeline = {
    accent: ACCENT,
    headline: { in: 0.3, out: headlineOut },
    chunks: chunks.map((c) => ({ start: +c.start.toFixed(3), end: +c.end.toFixed(3), words: c.words.map((w) => +w.start.toFixed(3)) })),
    note,
    endFrom,
    duration: D,
  };

  const captionHtml = chunks
    .map(
      (c, ci) =>
        // The words sit in ONE inline line box inside the flex container: as direct flex children
        // every word became its own flex item and the spaces between them were dropped
        // ("סוכןAIהוא" in the first sample).
        `        <div class="cap" id="cap-${ci}"><span class="cap-line">${c.words
          .map((w, wi) => `<span class="w" id="w-${ci}-${wi}">${esc(captionWord(w.text))}</span>`)
          .join(' ')}</span></div>`
    )
    .join('\n');

  return `<!doctype html>
<html lang="he" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>${esc(spec.slug)}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
${fontCss}
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: #08090e; }
      /* direction: rtl lives on #root, never as <html dir="rtl">: HyperFrames lint
         html_dir_attribute_breaks_render — that attribute renders a fully black video while
         preview and snapshots look correct. */
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; direction: rtl; font-family: 'Assistant', sans-serif; }
      #plate { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .scrim-top { position: absolute; inset: 0 0 auto 0; height: 560px; background: linear-gradient(to bottom, rgba(8,9,14,0.82), rgba(8,9,14,0)); }
      .scrim-bottom { position: absolute; inset: auto 0 0 0; height: 900px; background: linear-gradient(to top, rgba(8,9,14,0.92) 30%, rgba(8,9,14,0)); }

      /* Headline: the condensed 900 cut, closing line in the accent (DESIGN.md → Solid Ink Rule). */
      #headline { position: absolute; top: 170px; right: 84px; left: 84px; }
      .hl-line { display: block; font-family: 'Noto Sans Hebrew', sans-serif; font-stretch: 75%; font-weight: 900; font-size: 150px; line-height: 1.12; color: #ffffff; text-wrap: balance; }
      .hl-line.accent { color: ${ACCENT}; }

      /* Captions: one chunk on screen at a time, spoken word in the accent. */
      #captions { position: absolute; left: 70px; right: 70px; top: 1330px; height: 260px; }
      .cap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; opacity: 0;
             font-family: 'Noto Sans Hebrew', sans-serif; font-stretch: 75%; font-weight: 800; font-size: 104px; line-height: 1.05; color: #ffffff;
             text-shadow: 0 6px 28px rgba(0,0,0,0.55); text-wrap: balance; }
      .cap-line { display: block; max-width: 100%; }
      .w { color: #ffffff; }

      /* The handwritten note: rotation on the static wrapper, motion on the inner element, so no
         CSS transform ever meets a GSAP tween on the same node. */
      #note-wrap { position: absolute; left: 92px; top: 1110px; width: 560px; height: 220px; transform: rotate(-3deg); }
      #note { position: absolute; inset: 0; opacity: 0; font-family: 'Playpen Sans Hebrew', sans-serif; font-weight: 600; font-size: 58px; color: ${ACCENT}; text-align: left; }
      #note-arrow { position: absolute; left: 380px; top: 70px; width: 200px; height: 170px; overflow: visible; }
      #note-arrow path { fill: none; stroke: ${ACCENT}; stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 420; stroke-dashoffset: 420; }

      /* End card */
      #end-dim { position: absolute; inset: 0; background: #08090e; opacity: 0; }
      #end { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px; opacity: 0; text-align: center; }
      #end-title { font-family: 'Noto Sans Hebrew', sans-serif; font-stretch: 75%; font-weight: 900; font-size: 132px; line-height: 1; color: #ffffff; }
      #end-rule { width: 132px; height: 10px; border-radius: 5px; background: ${ACCENT}; }
      #end-line { font-family: 'Assistant', sans-serif; font-weight: 600; font-size: 46px; color: #e2e8f0; max-width: 860px; text-wrap: balance; }
      #end-handle { font-family: 'Assistant', sans-serif; font-weight: 700; font-size: 34px; color: #94a3b8; direction: ltr; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${D}" data-width="1080" data-height="1920">
      <video id="plate" class="clip" src="assets/${opts.plateFile}" data-start="0" data-duration="${D}" data-track-index="0" muted playsinline></video>
      <div class="scrim-top"></div>
      <div class="scrim-bottom"></div>

      <div id="headline">
        <div id="headline-inner">
          <span class="hl-line">${esc(spec.headline[0])}</span>
          <span class="hl-line accent">${esc(spec.headline[1])}</span>
        </div>
      </div>

      <div id="captions">
${captionHtml}
      </div>
${
  note
    ? `
      <div id="note-wrap">
        <div id="note">
          <div id="note-text">${esc(note.text)}</div>
          <svg id="note-arrow" viewBox="0 0 200 170"><path d="M 8 20 C 90 10, 160 50, 176 150 M 150 128 L 177 152 L 192 118" /></svg>
        </div>
      </div>`
    : ''
}
      <div id="end-dim"></div>
      <div id="end">
        <div id="end-title">${esc(spec.endCard.title)}</div>
        <div id="end-rule"></div>
        <div id="end-line">${esc(spec.endCard.line)}</div>
        ${spec.endCard.handle ? `<div id="end-handle">${esc(spec.endCard.handle)}</div>` : ''}
      </div>

      <audio id="vo" src="assets/${opts.voiceFile}" data-start="${offset}" data-duration="${opts.voiceDurationSec.toFixed(3)}" data-track-index="10" data-volume="1"></audio>
    </div>
    <script>
      const R = ${JSON.stringify(timeline)};
      const tl = gsap.timeline({ paused: true });

      tl.fromTo('.hl-line', { y: 56, opacity: 0 }, { y: 0, opacity: 1, duration: 0.75, ease: 'power3.out', stagger: 0.12 }, R.headline.in);
      tl.to('#headline-inner', { y: -30, opacity: 0, duration: 0.45, ease: 'power2.in' }, R.headline.out);

      R.chunks.forEach((c, ci) => {
        const el = '#cap-' + ci;
        tl.fromTo(el, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.16, ease: 'power2.out' }, c.start);
        c.words.forEach((t, wi) => {
          const next = c.words[wi + 1] ?? c.end;
          tl.set('#w-' + ci + '-' + wi, { color: R.accent }, t);
          tl.set('#w-' + ci + '-' + wi, { color: '#ffffff' }, next);
        });
        tl.to(el, { opacity: 0, duration: 0.1, ease: 'power1.in' }, Math.max(c.start + 0.2, c.end - 0.1));
      });

      if (R.note) {
        tl.fromTo('#note', { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'power2.out' }, R.note.in);
        tl.to('#note-arrow path', { strokeDashoffset: 0, duration: 0.55, ease: 'power2.inOut' }, R.note.in + 0.15);
        tl.to('#note', { opacity: 0, duration: 0.3, ease: 'power1.in' }, R.note.out);
      }

      tl.to('#end-dim', { opacity: 0.62, duration: 0.6, ease: 'power2.out' }, R.endFrom);
      tl.fromTo('#end', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out' }, R.endFrom + 0.1);

      window.__timelines['main'] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
}
