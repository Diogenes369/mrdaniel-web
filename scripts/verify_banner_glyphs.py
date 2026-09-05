#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_banner_glyphs.py — Confirm the latest banner render uses real Hebrew
glyphs (not notdef boxes) by comparing each character's pixel signature
against the David reference.

Reproducible check: render each character from the banner text with gisha.ttf,
measure its ink count, component count, and bbox, then compare against the
David reference signatures from the glyph comparison run. Real Hebrew glyphs
have varied ink counts (200-750 per char) and varied component counts (1-2).
Notdef boxes (like javatext) have uniform ink counts (~1999) and no variation.
"""

from __future__ import annotations
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONT_DIR = Path("C:/Windows/Fonts")
DAVID_PATH = FONT_DIR / "david.ttf"
GISHA_PATH = FONT_DIR / "gisha.ttf"

OUT = Path("dist") / "glyph_verification"
OUT.mkdir(parents=True, exist_ok=True)

BANNER_LINES = [
    "חרמס — שלט הרשת המלא",
    "השתמש במכשיר מכל מקום",
    "הטקסט נראה נקי וקריר",
]

SIZE = 58


def render_char(font: ImageFont.FreeTypeFont, char: str, size: int = SIZE):
    """Render a single character onto a minimal canvas."""
    bbox = font.getbbox(char)
    w = bbox[2] - bbox[0] + 4
    h = bbox[3] - bbox[1] + 4
    if w <= 0 or h <= 0:
        return None
    img = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(img)
    draw.text((2 - bbox[0], 2 - bbox[1]), char, font=font, fill=255)
    return img, bbox, w, h


def analyze_glyph(img: Image.Image):
    """Extract pixel signature from a single-character glyph image."""
    px = img.load()
    w, h = img.size
    ink = sum(1 for y in range(h) for x in range(w) if px[x, y] > 128)
    ink_ratio = ink / (w * h) if w * h > 0 else 0.0

    # Count connected ink components (real Hebrew = 1-2, notdef = 1 big blob
    # or 4 walls = 1 shell)
    visited = set()
    components = 0
    for y in range(h):
        for x in range(w):
            if px[x, y] > 128 and (x, y) not in visited:
                components += 1
                stack = [(x, y)]
                while stack:
                    cx, cy = stack.pop()
                    if (cx, cy) in visited:
                        continue
                    if cx < 0 or cx >= w or cy < 0 or cy >= h:
                        continue
                    if px[cx, cy] <= 128:
                        continue
                    visited.add((cx, cy))
                    for nx, ny in [(cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)]:
                        if 0 <= nx < w and 0 <= ny < h and px[nx, ny] > 128:
                            stack.append((nx, ny))

    return {
        "ink": ink,
        "ink_ratio": round(ink_ratio, 4),
        "components": components,
        "width": w,
        "height": h,
    }


def david_reference():
    """Build the David reference signatures for all banner characters."""
    font = ImageFont.truetype(str(DAVID_PATH), SIZE)
    ref = {}
    for line in BANNER_LINES:
        for ch in line:
            if ch in ref:
                continue
            result = render_char(font, ch, SIZE)
            if result:
                img, bbox, w, h = result
                ref[ch] = analyze_glyph(img)
                # Save David glyph preview
                p = OUT / f"david_{ord(ch):04X}.png"
                img.save(p)
    return ref


def gisha_test():
    """Render each banner character with gisha and compare to David ref."""
    font = ImageFont.truetype(str(GISHA_PATH), SIZE)
    ref = david_reference()
    print("=" * 70)
    print("Glyph verification: gisha.ttf vs David reference")
    print("=" * 70)
    print(f"\nReference signatures (David, size {SIZE}):")
    print(f"{'char':>5s} {'ink':>6s} {'components':>10s} {'ratio':>6s}")
    print("-" * 35)
    for ch in sorted(ref.keys()):
        r = ref[ch]
        print(f"{ch:>5s} {r['ink']:6d} {r['components']:10d} {r['ink_ratio']:6.4f}")

    print(f"\n{'='*70}")
    print("Gisha render + comparison:")
    print(f"{'char':>5s} {'ink':>6s} {'comp':>5s} {'vDavid':>6s} {'verdict':>12s}")
    print("-" * 40)

    real_count = 0
    total = 0
    for line in BANNER_LINES:
        for ch in line:
            if ch.isspace():
                continue
            result = render_char(font, ch, SIZE)
            if result is None:
                print(f"{ch:>5s}  NO_GLYPH")
                continue
            img, bbox, w, h = result
            sig = analyze_glyph(img)
            ref_sig = ref.get(ch)
            if ref_sig:
                ink_diff = abs(sig["ink"] - ref_sig["ink"])
                ink_ratio_diff = abs(sig["ink_ratio"] - ref_sig["ink_ratio"])
                comp_match = sig["components"] == ref_sig["components"]
                # Real Hebrew: ink within 40% of David, components match
                is_real = (ink_diff < ref_sig["ink"] * 0.4 and comp_match)
                if is_real:
                    real_count += 1
                verdict = "REAL_HEBREW" if is_real else "DIFFERENT"
                total += 1
                print(f"{ch:>5s} {sig['ink']:6d} {sig['components']:5d} {str(comp_match):>6s} {verdict:>12s}")
                # Save gisha glyph preview
                p = OUT / f"gisha_{ord(ch):04X}.png"
                img.save(p)
            else:
                print(f"{ch:>5s} {sig['ink']:6d} {sig['components']:5d}  (no David ref)")

    print(f"\n{'='*70}")
    print(f"Result: {real_count}/{total} characters match David reference (real Hebrew)")
    if real_count == total:
        print(">>> CONFIRMED: gisha.ttf renders REAL Hebrew glyphs <<<")
    elif real_count >= total * 0.8:
        print(f">>> gisha.ttf renders {real_count}/{total} real Hebrew (mostly good) <<<")
    else:
        print(f">>> WARNING: gisha.ttf renders only {real_count}/{total} real Hebrew — investigate <<<")
    print(f"Previews: {OUT}")


if __name__ == "__main__":
    gisha_test()
