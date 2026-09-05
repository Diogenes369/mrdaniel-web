#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
font_diag.py — Diagnose why javatext.ttf shows high ink in scan but question
marks in the actual banner render. Compare raw vs reshaped Hebrew.
"""

from __future__ import annotations
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONT_PATH = Path("C:/Windows/Fonts/javatext.ttf")
TEST_RAW = "אבגדה זית טקסט חרמס"
BANNER_LINE = "חרמס — שלט הרשת המלא"

HAVE_ARABIC = False
HAVE_BIDI = False
try:
    import arabic_reshaper
    HAVE_ARABIC = True
except ImportError:
    pass
try:
    from bidi.algorithm import get_display
    HAVE_BIDI = True
except ImportError:
    pass


def reshape_hebrew(text: str) -> str:
    if HAVE_ARABIC:
        text = arabic_reshaper.reshape(text)
    if HAVE_BIDI:
        text = get_display(text)
    return text


def render_and_count(font: ImageFont.FreeTypeFont, text: str,
                     label: str) -> None:
    bbox = font.getbbox(text)
    w = bbox[2] - bbox[0] + 8
    h = bbox[3] - bbox[1] + 8
    if w <= 0 or h <= 0:
        print(f"  {label}: bbox has zero area, skipping")
        return
    img = Image.new("RGB", (w, h), "#000000")
    draw = ImageDraw.Draw(img)
    draw.text((4 - bbox[0], 4 - bbox[1]), text, font=font, fill="#FFFFFF")
    px = img.load()
    ink = sum(1 for y in range(h) for x in range(w) if px[x, y] != (0, 0, 0))
    ratio = ink / (w * h) if w * h > 0 else 0.0
    print(f"  {label}:")
    print(f"    bbox=({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]})  w={w} h={h}")
    print(f"    ink={ink}  total={w*h}  ratio={ratio:.4f}")
    # Save a mini preview
    preview = Path("dist") / f"diag_{label.replace(' ', '_').replace('/', '_')}.png"
    img.save(preview)
    print(f"    preview → {preview}")


def main() -> int:
    print(f"Font: {FONT_PATH.name} ({FONT_PATH})")
    print(f"Has arabic_reshaper: {HAVE_ARABIC}")
    print(f"Has bidi.get_display: {HAVE_BIDI}")
    print()

    font = ImageFont.truetype(str(FONT_PATH), 58)

    print(f"Test string (raw):  {TEST_RAW}")
    render_and_count(font, TEST_RAW, "raw_test")

    reshaped_test = reshape_hebrew(TEST_RAW)
    print(f"Test string (reshaped): {reshaped_test!r}")
    render_and_count(font, reshaped_test, "reshaped_test")

    print()
    print(f"Banner line (raw):  {BANNER_LINE}")
    render_and_count(font, BANNER_LINE, "raw_banner")

    reshaped_banner = reshape_hebrew(BANNER_LINE)
    print(f"Banner line (reshaped): {reshaped_banner!r}")
    render_and_count(font, reshaped_banner, "reshaped_banner")

    print()
    print("Character-by-character glyph check for BANNER line (raw):")
    for ch in BANNER_LINE:
        try:
            bbox = font.getbbox(ch)
            w = bbox[2] - bbox[0]
            h = bbox[3] - bbox[1]
            has_glyph = w > 0 and h > 0
        except Exception:
            has_glyph = False
        print(f"  U+{ord(ch):04X} {ch!r:6s}  glyph_bbox={(bbox[0],bbox[1],bbox[2],bbox[3]) if has_glyph else 'N/A'}  has_glyph={has_glyph}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
