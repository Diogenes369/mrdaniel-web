# render_hebrew_banner.py — Two-step Hebrew image composition

## Why this exists

Image generation models (Gemini / DALL-E / Imagen and similar) **cannot** render
Hebrew text reliably — the output is corrupted glyphs and reversed characters.
This helper enforces a two-step pipeline so every Hebrew graphic asset is crisp,
legible, and never asks an image-generation model to bake Hebrew into the image.

## Pipeline

1. **Step A — Visuals only**: generate the base image with the illustration /
   background / layout you want, with a clean text-safe region reserved. Do **not**
   include any Hebrew text in the prompt's target image. Only English text inside
   the generated image if it's strictly necessary (and even then, keep it minimal).

2. **Step B — Python text overlay**: call this script to render the exact Hebrew
   text onto the base image using a local clean Hebrew font (Rubik, Heebo,
   Assistant, or any other .ttf with good Hebrew coverage). The script renders
   native RTL text through Pillow — the string is passed through as-is, never
   reversed or fiddled with, because the font engine handles right-to-left glyph
   ordering.

## Quick start

```bash
pip install Pillow

# Place a Hebrew-capable font somewhere the repo can read, e.g.:
# scripts/fonts/Rubik-Regular.ttf
# scripts/fonts/Heebo-Regular.ttf

python scripts/render_hebrew_banner.py \
  --input assets/base_01.png \
  --output dist/banner_final.png \
  --lines \
    "שורת כותרת ראשונה" \
    "שורת כותרת שנייה" \
    "טקסט עוזר קצר" \
  --font-path scripts/fonts/Rubik-Regular.ttf \
  --positions "40,120,48  48,200,28  56,252,22" \
  --anchor lt \
  --padding "20,20,20,20" \
  --outline "#000000" --outline-width 2
```

## Position syntax

`--positions` is a whitespace-separated list of `x,y,size` triples, one per line.
Same count as `--lines`. Example with three lines:

```
--positions "40,120,48  48,200,28  56,252,22"
```

- `x`, `y`: top-left origin of the text (in image pixels, before padding).
- `size`: font size in pixels for that line.

Every line can carry a different size — useful for a title + sub-line + caption
stack where you want the title bigger than the rest.

## Anchors

Default anchor is `lt` (left-top). For right-aligned Hebrew paragraphs use `--anchor rt`
(right-top). Other Pillow anchors work too; pass the exact anchor string you need.

## Legibility helpers

- `--outline '#000000' --outline-width 2` — draws a black outline around each glyph
  so Hebrew stays readable even over a busy or dark background.
- `--shadow` — adds a single drop-shadow copy of the text before the main fill.
  Use `--shadow-offset '3,3'` for a slightly stronger read.

## Hebrew strings

Pass Hebrew as a native UTF-8 Python string. **Never** reverse or flip the string
before passing it to this script. The font renders the glyphs in correct RTL visual
order; manual reversal produces garbage.

Mixed English inside a Hebrew line (e.g. a brand name or URL) is passed verbatim.
If the caller needs LTR isolation for that snippet, wrap it before calling the
script — this script treats each line as a single font-renderable string.

## Image content rule

**NO HEBREW TEXT IN THE GENERATED IMAGE.** All Hebrew that the recipient sees
appears from the Python overlay step. The base image from Step A must be free of
Hebrew — illustrations, backgrounds, English labels only. If you must put words on
the final image, those words are added by this overlay script, not by the image
generation model.

## Font recommendations

Good free Hebrew-capable fonts (check license for your use case):

- Rubik (Google Fonts) — clean, modern, excellent Hebrew coverage.
- Heebo (Google Fonts) — neutral Hebrew, similar metrics to Arial-family Hebrew.
- Assistant (Google Fonts) — friendly Hebrew, good for educational / explainer
  banners.

Drop the `.ttf` into `scripts/fonts/` (or any path you reference with `--font-path`).

## Output

The script writes the composited image to `--output`, preserving the base image's
dimensions (plus any padding you requested). Use `--debug` to draw green anchor
boxes around each line for layout tuning; never ship with `--debug` enabled.

## Integrating into a Telegram publish flow

Typical sequence for a Hebrew graphic asset sent via Telegram:

1. Generate base image Step A (no Hebrew).
2. Overlay Hebrew via this script Step B.
3. Attach the final image to the Telegram message.
4. Send the Hebrew caption / description as the message text itself — clean,
   natural UTF-8 Hebrew, English terms inside code blocks or on dedicated lines.

This keeps the image crisp and the caption RTL-safe, and never asks an image
model to render Hebrew.
