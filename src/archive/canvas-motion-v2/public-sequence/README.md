# motion=2d scroll sequence frames

`ScrollSequenceCanvas.tsx` scrubs this background image sequence 1:1 with page scroll (smoothed —
GSAP `scrub: 0.7` + an index damp + adjacent-frame crossfade, so it glides rather than snapping).

## Current set

- **141 frames**, `frame_001.webp` … `frame_141.webp`, 1600×898, WebP q82, ~5.6 MB total.
- Converted from the PNG render sequence with `sharp` (lanczos3 resize, flattened onto `#080910`).
- `manifest.json` (`{ "count": 141, "width": 1600, "height": 898 }`) is what the component reads to
  set the frame count dynamically — the `totalFrames` prop in `src/App.tsx` is only a fallback.

## Replacing / extending

- Keep the naming: zero-padded 3-digit, 1-based (`frame_001.webp`).
- Re-generate `manifest.json` with the new `count` (and update the `totalFrames` fallback in
  `src/App.tsx` to match).
- Any missing frame renders a procedural placeholder for that index, so partial sets are fine.
- Format: WebP, ~1600px wide is a good balance (all frames preload up front — keep each lean).
