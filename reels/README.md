# reels/ — hybrid 3D reel pipeline (local)

Blender renders the 3D world, the browser draws every Hebrew letter, FFmpeg and HyperFrames put
them together with the voiceover. Runs on the operator's machine only; Vercel cannot run Blender.

```
scene spec (JSON) ─┬─► Blender CLI + bpy template  → PNG frames → FFmpeg bloom → plate.mp4
                   ├─► voice: ElevenLabs | Gemini   → voice.(mp3|wav) + word timings
                   └─► HyperFrames composition      → headline, captions, note, end card over
                                                      the plate, with the voice → reels/out/*.mp4
```

## Run

```bash
npm run reel -- reels/scenes/sample-agent.json            # full quality
npm run reel -- reels/scenes/sample-agent.json --draft    # half-res plate, for timing checks
npm run reel -- <spec> --plate-frames <dir>               # reuse rendered frames, skip Blender
npm run reel -- <spec> --voice gemini|elevenlabs|auto     # default auto: ElevenLabs when configured
npm run reel -- <spec> --no-render                        # stop at the HyperFrames project (preview it)
```

Requirements: Blender 5.x (`winget install BlenderFoundation.Blender`, or set `BLENDER_PATH`),
FFmpeg/ffprobe on PATH, `GEMINI_API_KEY` in the root `.env`. First run downloads the pinned
HyperFrames CLI (`hyperframes@0.8.48`) and the fonts (cached in `reels/.cache/`).

A 15 s plate at 1080×1920 renders in a few minutes on the RTX 3070 (Eevee, 24 samples).

## Why the split is where it is

- **No text in Blender.** Blender's text objects cannot shape or order Hebrew (its HarfBuzz/FriBiDi
  work covers the UI only). Every letter is HTML in the HyperFrames layer, set in the DESIGN.md
  type roles: condensed Noto Sans Hebrew, Assistant, and Playpen Sans Hebrew for the one note.
- **No glow in Blender.** Blender 5.x moved the compositor to node groups and dropped Eevee's bloom
  toggle; the bloom is an FFmpeg filter (`lib/media.ts → encodePlate`) that survives API changes.
- **Templates are Python, not .blend files**, so a scene change is a reviewable diff.
- **The lower third of every plate stays calm**; that is where the captions sit.

## Voice

| Provider | When | Word timings |
|---|---|---|
| ElevenLabs (`eleven_v3`, `language_code: he`) | `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` set | **Real**, from `/with-timestamps` character alignment |
| Gemini TTS (`gemini-3.8-flash-tts`, then `-lite`) | fallback | **Estimated** from the waveform (silencedetect + letter weighting) |

To switch to ElevenLabs, add to the root `.env`:

```
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...        # a Hebrew-capable voice from your ElevenLabs voice library
# ELEVENLABS_MODEL=eleven_v3   # optional override
```

The free ElevenLabs plan is non-commercial; branded reels need a paid plan. Optional Gemini
overrides: `REEL_GEMINI_TTS_MODEL` (comma-separated fallback list), `REEL_GEMINI_VOICE` (default `Kore`).

## Scene spec

```jsonc
{
  "slug": "sample-agent",          // output file name
  "durationSec": 15, "fps": 30,
  "template": "signal_core",       // reels/blender/<template>.py
  "seed": 7,
  "voice": { "text": "…", "offsetSec": 0.6 },
  "headline": ["line 1", "line 2 (accent)"],
  "note": { "text": "handwritten aside", "atWord": "word it appears on" },
  "endCard": { "title": "…", "line": "…", "handle": "@…" }
}
```

Copy rules are the brand's (PRODUCT.md, DESIGN.md): no invented numbers or results, the note only
points at what is being said, one green accent.

## Adding a template

A template is `reels/blender/<name>.py` that accepts `--out --frames --fps --scale --samples
--seed` after `--` and writes `frame_####.png` into `--out`. Keep text out of it and the lower
third quiet.
