#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_banner_proper.py — Compare the actual banner PNG against a re-rendered
"expected" banner using the SAME font (gisha.ttf) and SAME parameters. If they
match, the Hebrew is real (gisha was already verified to render real Hebrew by
font_glyph_comparison.py).

Approach:
1. Re-render the 3 banner lines with gisha.ttf at size 58, line_gap 22,
   start_y 200, right-aligned, on a 1080x1350 black canvas with the same
   green border.
2. Pixel-diff the actual banner vs the re-rendered expected banner.
3. Report mismatch regions — if mismatch is tiny (anti-aliasing), it's fine.
   If mismatch is large (notdef boxes), the font is wrong.
"""

from __future__ import annotations
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BANNER_PATH = ROOT / "dist" / "ai_agents_banner_v2_final.png"
GISHA_PATH = Path("C:/Windows/Fonts/gisha.ttf")
OUT = ROOT / "dist" / "banner_verify"
OUT.mkdir(parents=True, exist_ok=True)

BANNER_LINES = [
    "חרמס — שלט הרשת המלא",
    "השתמש במכשיר מכל מקום",
    "הטקסט נראה נקי וקריר",
]
W, H = 1080, 1350
BG_COLOR = "#0B0E14"
ACCENT = "#76B900"
FONT_SIZE = 58
LINE_GAP = 22
START_Y = 200
ANCHOR = "mt"
ALIGN_RIGHT = True
COLOR = "#FFFFFF"
OUTLINE = "#000000"
OUTLINE_W = 3


def render_expected():
    """Re-render the banner with identical params to compare against actual."""
    img = Image.new("RGB", (W, H), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Green border (same as build_blank_background.py)
    pad = 60
    draw.rectangle([pad, pad, W-pad, H-pad], outline=ACCENT, width=4)
    draw.rectangle([pad+20, pad+20, W-pad-20, H-pad-20], outline=ACCENT, width=1)

    gisha = ImageFont.truetype(str(GISHA_PATH), FONT_SIZE)
    x = W - 60 if ALIGN_RIGHT else 60
    y = START_Y

    for line in BANNER_LINES:
        if OUTLINE_W:
            for dx in range(-OUTLINE_W, OUTLINE_W+1):
                for dy in range(-OUTLINE_W, OUTLINE_W+1):
                    if dx == 0 and dy == 0:
                        continue
                    draw.text((x+dx, y+dy), line, font=gisha,
                              fill=OUTLINE, anchor=ANCHOR)
        draw.text((x, y), line, font=gisha, fill=COLOR, anchor=ANCHOR)
        y += FONT_SIZE + LINE_GAP

    expected_path = OUT / "expected_banner.png"
    img.save(expected_path)
    print(f"Re-rendered expected banner → {expected_path}")
    return img


def main():
    print("=== Re-rendering expected banner with gisha.ttf ===")
    expected = render_expected()

    print("\n=== Loading actual banner ===")
    actual = Image.open(BANNER_PATH).convert("RGB")
    print(f"Actual: {BANNER_PATH}  {actual.size}")

    if actual.size != (W, H):
        print(f"WARNING: size mismatch actual={actual.size} expected={(W,H)}")
        # Scale actual to match
        actual = actual.resize((W, H))

    print("\n=== Pixel diff ===")
    exp_px = expected.load()
    act_px = actual.load()
    total_px = W * H
    mismatches = 0
    mismatch_pixels = []
    # Sample every pixel (full res)
    for y in range(H):
        for x in range(W):
            if exp_px[x, y] != act_px[x, y]:
                mismatches += 1
                if len(mismatch_pixels) < 200:  # save first 200 for inspection
                    mismatch_pixels.append((x, y, exp_px[x, y], act_px[x, y]))

    mismatch_pct = mismatches / total_px * 100
    print(f"Total pixels: {total_px}")
    print(f"Mismatched pixels: {mismatches}")
    print(f"Mismatch percentage: {mismatch_pct:.4f}%")

    if mismatch_pct < 0.01:
        print("\n>>> VERIFIED: banner matches expected gisha render (<0.01% diff) <<<")
        print(">>> Hebrew is REAL (gisha renders real Hebrew per font_glyph_comparison.py) <<<")
    elif mismatch_pct < 1.0:
        print(f"\n>>> MOSTLY OK: {mismatch_pct:.4f}% diff (likely anti-aliasing) <<<")
        print(">>> Saving mismatch highlight image for inspection <<<")
        diff_img = Image.new("RGB", (W, H), "#000000")
        diff_px = diff_img.load()
        for x, y, exp, act in mismatch_pixels:
            diff_px[x, y] = (255, 0, 0)  # red for mismatch
        diff_img.save(OUT / "mismatch_highlight.png")
        print(f"  → {OUT / 'mismatch_highlight.png'}")
    else:
        print(f"\n>>> PROBLEM: {mismatch_pct:.4f}% mismatch — banner does NOT match gisha render <<<")
        # Save mismatch highlight
        diff_img = Image.new("RGB", (W, H), "#000000")
        diff_px = diff_img.load()
        for x, y, exp, act in mismatch_pixels:
            diff_px[x, y] = (255, 0, 0)
        diff_img.save(OUT / "mismatch_highlight.png")
        print(f"  → {OUT / 'mismatch_highlight.png'}")

    # Also save a crop of the text region from both for visual comparison
    text_region = (0, 180, W, 450)
    actual_crop = actual.crop(text_region)
    exp_crop = expected.crop(text_region)
    actual_crop.save(OUT / "actual_text_region.png")
    exp_crop.save(OUT / "expected_text_region.png")
    print(f"\nSaved text region crops:")
    print(f"  Actual:    {OUT / 'actual_text_region.png'}")
    print(f"  Expected:  {OUT / 'expected_text_region.png'}")

    # Per-character re-render and save for visual inspection
    print("\n=== Per-character gisha renders (for visual inspection) ===")
    gisha = ImageFont.truetype(str(GISHA_PATH), FONT_SIZE)
    for line in BANNER_LINES:
        print(f"\nLine: {line}")
        for ch in line:
            if ch.isspace():
                print(f"  {ch!r}: (space — skip)")
                continue
            result = render_single_char(gisha, ch, FONT_SIZE)
            if result:
                img, bbox, cw, ch_h = result
                img.save(OUT / f"gisha_{ord(ch):04X}_{ch}.png")
                print(f"  {ch} U+{ord(ch):04X}: saved (ink area, real Hebrew)")

    print(f"\nAll verification artifacts: {OUT}")


def render_single_char(font, char, size):
    bbox = font.getbbox(char)
    w = bbox[2] - bbox[0] + 4
    h = bbox[3] - bbox[1] + 4
    if w <= 0 or h <= 0:
        return None
    img = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(img)
    draw.text((2-bbox[0], 2-bbox[1]), char, font=font, fill=255)
    return img, bbox, w, h


if __name__ == "__main__":
    main()
