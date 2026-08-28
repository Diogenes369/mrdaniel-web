# Archived — Canvas / motion-v2 background engine

Cold storage for the experimental `?motion=2d` background system. **Nothing here is imported by
the live app.** `src/archive/` is excluded from `tsconfig.json` and is not reachable from any
entry point, so it is never type-checked or bundled.

The site's standard background is the R3F scene (`src/three/Scene3D.tsx`, `.scene3d-layer`), which
is what `App.tsx` now mounts unconditionally.

## What's here

| File (archived path) | Original path | What it was |
|---|---|---|
| `motion/fieldEngine.ts` | `src/motion/fieldEngine.ts` | Framework-agnostic Canvas2D particle field engine — hand-projected pseudo-3D sphere/DNA/rings/wave/vortex formations, scroll-driven morphing state machine, additive-glow pass, Z-flow disassembly transition, per-ring spring physics. |
| `motion/MotionField.tsx` | `src/motion/MotionField.tsx` | React wrapper that owns the `<canvas>` ref + lifecycle for `fieldEngine`, wired to the a11y "stop animations" store. |
| `motion/StarfieldLayer.tsx` | `src/motion/StarfieldLayer.tsx` | Minimal R3F `<Canvas>` with two drei `<Sparkles>` layers — the cosmic starfield that sat behind the particle field. |
| `motion/ScrollSequenceCanvas.tsx` | `src/motion/ScrollSequenceCanvas.tsx` | Alternative background: a scroll-scrubbed WebP image sequence (GSAP ScrollTrigger, DPR-aware, cover-fit, adjacent-frame crossfade, procedural placeholder frames). |
| `motion/scrollSequenceFrames.ts` | `src/motion/scrollSequenceFrames.ts` | Frame preloader (`Promise.all` + `img.decode()`), manifest loader, cover-fit + procedural-placeholder helpers for `ScrollSequenceCanvas`. |
| `components/Cursor.tsx` | `src/components/Cursor.tsx` | Contextual custom cursor (frosted bubble with a label pulled from `data-cursor` attributes). Fine-pointer only. |
| `lib/motionFlag.ts` | `src/lib/motionFlag.ts` | `isMotionV2Enabled()` — the `?motion=2d` / `?motion=off` URL + `localStorage` routing, incl. the "mobile defaults ON" logic. |
| `public-sequence/` (141× `frame_NNN.webp` + `manifest.json` + `README.md`) | `public/sequence/` | The rendered frame set for `ScrollSequenceCanvas` (converted from a GIF via `sharp`, 1600×898, ~5.6 MB total). |

## Still-live shared dependencies (were NOT archived)

These stay in the tree because other, non-motion-v2 code uses them:

- `src/hooks/usePointer.ts` — also used by `src/three/Scene3D.tsx` / `SceneObjects.tsx`.
- `src/hooks/useDeviceTier.ts` — also used by the 3D scene.
- `src/lib/gsap.ts`, `src/lib/a11yStore.ts` (`useA11yStopMotion`).
- `src/components/WordRotator.tsx` + its `.word-rotator*` CSS in `index.css` — renders on the
  homepage independently of any flag; left untouched.
- `src/components/mobile/ScrollLockRail.tsx` — mobile scroll-lock carousels; independent.

## To restore

1. Move each file/dir back to its **Original path** from the table above
   (`public-sequence/` → `public/sequence/`).
2. Delete `"exclude": ["src/archive"]` from `tsconfig.json` (or move the files out of `src/archive`).
3. In `src/App.tsx`: re-add the lazy imports and the `isMotionV2Enabled()` check that chose
   between `<Scene3D />` and `<StarfieldLayer /> + <MotionField />` (or `<ScrollSequenceCanvas />`),
   re-add `<Cursor />`, the `document.documentElement.classList.toggle('motion-v2', …)` effect, and
   the conditional root `bg-[#020204]`.
4. Restore the `html.motion-v2 …` / `.motion-field-layer` / `.starfield-layer` /
   `.scroll-sequence-layer` / `.motion-cursor` CSS blocks in `src/index.css` (they lived just after
   the `.gpu` rule; recover from git history — the commit that added this archive).
5. Optional: re-add the `data-field-form` / `data-field-guard` / `data-field-target` / `data-cursor`
   attributes the engine reads (Hero, OfferSection + `homeOffers.ts` `fieldForm`, CyberNewsGrid,
   ContactPortal button). Without them the field still runs but falls back to a synthetic
   scroll-cycle instead of section-anchored morphing.
6. Fix relative imports inside the moved files (they assume their original directory depth).
