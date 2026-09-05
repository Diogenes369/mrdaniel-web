#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scan_hebrew_fonts.py — Scan every .ttf in C:/Windows/Fonts, render a Hebrew
test string onto a tiny bitmap, count ink pixels, report fonts with real
Hebrew glyph coverage.
"""

from __future__ import annotations
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

TEST_STRING = "אבגדה זית טקסט"
FONT_DIR = Path("C:/Windows/Fonts")

results = []

for ttf in sorted(FONT_DIR.glob("*.ttf")):
    try:
        font = ImageFont.truetype(str(ttf), 48)
    except Exception:
        continue
    # Render onto a tiny canvas
    try:
        bbox = font.getbbox(TEST_STRING)
    except OSError:
        # Broken/font-reference font (e.g. "invalid reference") — skip
        continue
    except Exception:
        continue
    w = bbox[2] - bbox[0] + 8
    h = bbox[3] - bbox[1] + 8
    if w <= 0 or h <= 0:
        continue
    img = Image.new("RGB", (w, h), "#000000")
    draw = ImageDraw.Draw(img)
    draw.text((4 - bbox[0], 4 - bbox[1]), TEST_STRING, font=font, fill="#FFFFFF")
    # Count non-black pixels (ink)
    px = img.load()
    ink = sum(1 for y in range(h) for x in range(w) if px[x, y] != (0, 0, 0))
    ink_ratio = ink / (w * h)
    results.append((ttf.name, ink, w * h, ink_ratio))

results.sort(key=lambda r: r[3], reverse=True)

print("=== Hebrew font ink coverage (top 25) ===")
print(f"{'font':40s} {'ink_px':>8s} {'total_px':>10s} {'ratio':>7s}")
print("-" * 70)
for name, ink, total, ratio in results[:25]:
    flag = " <== HEAVY HEBREW" if ratio > 0.02 else ""
    print(f"{name:40s} {ink:8d} {total:10d} {ratio:7.4f}{flag}")

print("\n=== Fonts with ZERO Hebrew coverage (avoid these) ===")
zero = [r for r in results if r[3] <= 0.0001]
for name, ink, total, ratio in zero[:15]:
    print(f"  {name}")
print(f"  ... total {len(zero)} fonts with near-zero Hebrew coverage")
