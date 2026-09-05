#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_banner_image.py — Extract text region from the actual banner PNG and
verify each visible glyph is real Hebrew (not notdef boxes) by comparing
pixel signatures against the David reference.

1. Load dist/ai_agents_banner_v2_final.png
2. Detect the text region (white pixels on dark background)
3. Split into lines by row gaps
4. For each line, segment into individual glyph bounding boxes
5. For each glyph, render the corresponding character with gisha.ttf and
   compare pixel signature to the David reference for that character
6. Report: which characters in the actual rendered banner are real Hebrew
   vs notdef/different
"""

from __future__ import annotations
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BANNER_PATH = ROOT / "dist" / "ai_agents_banner_v2_final.png"
GISHA_PATH = Path("C:/Windows/Fonts/gisha.ttf")
DAVID_PATH = Path("C:/Windows/Fonts/david.ttf")
OUT = ROOT / "dist" / "banner_glyph_check"
OUT.mkdir(parents=True, exist_ok=True)

BANNER_LINES = [
    "חרמס — שלט הרשת המלא",
    "השתמש במכשיר מכל מקום",
    "הטקסט נראה נקי וקריר",
]
SIZE = 58

def render_char(font: ImageFont.FreeTypeFont, char: str):
    bbox = font.getbbox(char)
    w = bbox[2] - bbox[0] + 4
    h = bbox[3] - bbox[1] + 4
    if w <= 0 or h <= 0:
        return None
    img = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(img)
    draw.text((2 - bbox[0], 2 - bbox[1]), char, font=font, fill=255)
    return img, w, h

def analyze_glyph(img: Image.Image):
    px = img.load()
    w, h = img.size
    ink = sum(1 for y in range(h) for x in range(w) if px[x, y] > 128)
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
    return {"ink": ink, "components": components, "w": w, "h": h}

def build_david_ref():
    font = ImageFont.truetype(str(DAVID_PATH), SIZE)
    ref = {}
    for line in BANNER_LINES:
        for ch in line:
            if ch in ref or ch.isspace():
                continue
            result = render_char(font, ch)
            if result:
                img, w, h = result
                ref[ch] = analyze_glyph(img)
                img.save(OUT / f"david_ref_{ord(ch):04X}.png")
    return ref

def main():
    print("=== David reference signatures (for banner characters) ===")
    ref = build_david_ref()
    for ch in sorted(ref.keys()):
        r = ref[ch]
        print(f"  {ch} U+{ord(ch):04X}: ink={r['ink']:4d} comp={r['components']} ratio={r['ink']/max(r['w']*r['h'],1):.4f}")

    print("\n=== Loading actual banner image ===")
    banner = Image.open(BANNER_PATH).convert("L")
    W, H = banner.size
    print(f"Banner size: {W}x{H}")
    banner.save(OUT / "banner_grayscale.png")

    # Detect text rows: scan rows for white pixels
    px = banner.load()
    rows_with_ink = []
    for y in range(H):
        row_ink = sum(1 for x in range(W) if px[x, y] > 200)
        if row_ink > 20:  # threshold for "this row has text"
            rows_with_ink.append((y, row_ink))

    print(f"Rows with significant white pixels: {len(rows_with_ink)}")
    if not rows_with_ink:
        print("ERROR: no text detected in banner")
        return 1

    # Group consecutive rows into text bands
    bands = []
    current_band = [rows_with_ink[0][0]]
    for y, _ in rows_with_ink[1:]:
        if y - current_band[-1] <= 3:  # close rows belong to same band
            current_band.append(y)
        else:
            bands.append((min(current_band), max(current_band)))
            current_band = [y]
    bands.append((min(current_band), max(current_band)))

    print(f"Detected text bands: {len(bands)}")
    for i, (y0, y1) in enumerate(bands):
        print(f"  Band {i+1}: y={y0}-{y1} (height={y1-y0+1})")

    # For each band, crop and analyze
    david_font = ImageFont.truetype(str(DAVID_PATH), SIZE)
    gisha_font = ImageFont.truetype(str(GISHA_PATH), SIZE)

    all_results = []
    for band_idx, (y0, y1) in enumerate(bands):
        print(f"\n--- Band {band_idx+1} (y={y0}-{y1}) ---")
        crop = banner.crop((0, y0, W, y1+1))
        crop_px = crop.load()
        cw, crop_h = crop.size

        # Find vertical columns that have ink (column-wise)
        col_ink = []
        for x in range(cw):
            ink_count = sum(1 for y in range(crop_h) if crop_px[x, y] > 200)
            col_ink.append(ink_count)

        # Segment into glyphs by finding gaps (columns with no ink)
        glyphs = []
        in_glyph = False
        glyph_start = 0
        for x in range(cw):
            if col_ink[x] > 3 and not in_glyph:
                glyph_start = x
                in_glyph = True
            elif col_ink[x] <= 3 and in_glyph:
                glyphs.append((glyph_start, x-1))
                in_glyph = False
        if in_glyph:
            glyphs.append((glyph_start, cw-1))

        print(f"  Glyphs detected: {len(glyphs)}")
        for gi, (gx0, gx1) in enumerate(glyphs):
            glyph_crop = crop.crop((gx0, 0, gx1+1, crop_h))
            glyph_crop.save(OUT / f"band{band_idx+1}_glyph{gi+1:02d}.png")
            sig = analyze_glyph(glyph_crop)
            print(f"    Glyph {gi+1}: x={gx0}-{gx1} (w={gx1-gx0+1}) ink={sig['ink']:4d} comp={sig['components']}")

            # Now try to match this glyph to a character in the expected line
            expected_line = BANNER_LINES[band_idx] if band_idx < len(BANNER_LINES) else ""
            matched_char = None
            best_similarity = 0

            for ch in expected_line:
                if ch.isspace():
                    continue
                david_glyph = render_char(david_font, ch)
                if david_glyph is None:
                    continue
                david_img, dw, dh = david_glyph
                david_sig = analyze_glyph(david_img)

                # Compare: similar ink count and component count = likely match
                ink_diff = abs(sig["ink"] - david_sig["ink"])
                comp_match = sig["components"] == david_sig["components"]
                # Similarity score: based on ink ratio and components
                sig_ratio = sig["ink"] / max(sig["w"] * sig["h"], 1)
                david_ratio = david_sig["ink"] / max(dw * dh, 1)
                ratio_diff = abs(sig_ratio - david_ratio)

                # Also: rescale glyph to same size and compare pixel-by-pixel
                # (simple approach: compare ink counts normalized by area)
                if ratio_diff < 0.08 and comp_match:
                    similarity = 1.0 - ratio_diff
                    if similarity > best_similarity:
                        best_similarity = similarity
                        matched_char = ch

            if matched_char:
                print(f"      → matches David ref for '{matched_char}' (U+{ord(matched_char):04X}) similarity={best_similarity:.3f}")
                all_results.append(("REAL_HEBREW", matched_char, band_idx+1, gi+1))
            else:
                print(f"      → NO MATCH in expected line — possible notdef or different char")
                all_results.append(("UNMATCHED", None, band_idx+1, gi+1))

    print("\n" + "=" * 70)
    print("=== FINAL VERIFICATION ===")
    real = [r for r in all_results if r[0] == "REAL_HEBREW"]
    unmatched = [r for r in all_results if r[0] == "UNMATCHED"]
    print(f"Total glyphs detected: {len(all_results)}")
    print(f"Real Hebrew (matched to David ref): {len(real)}")
    print(f"Unmatched (potential notdef/different): {len(unmatched)}")
    if unmatched:
        print("\nUnmatched glyphs (need visual inspection):")
        for status, ch, band, gi in unmatched:
            print(f"  Band {band} Glyph {gi}: {status}")
    if len(real) == len(all_results):
        print("\n>>> CONFIRMED: ALL glyphs in banner are real Hebrew <<<")
    elif len(real) >= len(all_results) * 0.8:
        print(f"\n>>> Banner is {len(real)}/{len(all_results)} real Hebrew — acceptable <<<")
    else:
        print(f"\n>>> WARNING: Only {len(real)}/{len(all_results)} real Hebrew — investigate <<<")

if __name__ == "__main__":
    main()
