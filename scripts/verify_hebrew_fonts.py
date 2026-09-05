#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""verify_hebrew_fonts.py — render Hebrew test strings with known-good font
candidates, save previews, and report which actually show real Hebrew glyphs."""

from __future__ import annotations
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONT_DIR = Path("C:/Windows/Fonts")
TEST_STRING = "אבגדה זית טקסט חרמס"

CANDIDATES = [
    "david.ttf",
    "gisha.ttf",
    "arial.ttf",
    "segoeui.ttf",
    "cambria.ttf",
    "consolaz.ttf",
    "javatext.ttf",
]

OUT = Path("dist") / "font_previews"
OUT.mkdir(parents=True, exist_ok=True)

for name in CANDIDATES:
    p = FONT_DIR / name
    if not p.exists():
        print(f"SKIP {name}: not found")
        continue
    try:
        font = ImageFont.truetype(str(p), 58)
    except Exception as exc:
        print(f"SKIP {name}: load failed ({exc})")
        continue

    bbox = font.getbbox(TEST_STRING)
    w = bbox[2] - bbox[0] + 8
    h = bbox[3] - bbox[1] + 8
    if w <= 0 or h <= 0:
        print(f"SKIP {name}: zero bbox")
        continue

    img = Image.new("RGB", (w, h), "#000000")
    draw = ImageDraw.Draw(img)
    draw.text((4 - bbox[0], 4 - bbox[1]), TEST_STRING, font=font, fill="#FFFFFF")
    preview = OUT / f"{name.replace('.ttf', '')}_hebrew_test.png"
    img.save(preview)

    px = img.load()
    ink = sum(1 for y in range(h) for x in range(w) if px[x, y] != (0, 0, 0))
    ratio = ink / (w * h) if w * h > 0 else 0.0
    print(f"RENDERED {name:25s} → {preview.name}  ink={ink:6d}  ratio={ratio:.4f}  size={w}x{h}")

print("\nPreviews saved to:", OUT)
print("Now run vision_analyze on each preview to confirm real Hebrew glyphs.")
