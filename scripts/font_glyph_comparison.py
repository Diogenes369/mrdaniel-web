#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
font_glyph_comparison.py — Compare Hebrew glyph rendering between David (known
good Hebrew font) and candidate fonts. Deterministically detects whether each
font renders real Hebrew letters or fallback artifacts.
"""

from __future__ import annotations
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONT_DIR = Path("C:/Windows/Fonts")
TEST_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ", "ק", "ר", "ש", "ת"]
OUT = Path("dist") / "glyph_comparisons"
OUT.mkdir(parents=True, exist_ok=True)

DAVID_PATH = FONT_DIR / "david.ttf"

def render_glyph(font: ImageFont.FreeTypeFont, char: str, size: int = 80):
    bbox = font.getbbox(char)
    w = bbox[2] - bbox[0] + 4
    h = bbox[3] - bbox[1] + 4
    if w <= 0 or h <= 0:
        return None
    img = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(img)
    draw.text((2 - bbox[0], 2 - bbox[1]), char, font=font, fill=255)
    return img, bbox, w, h

def analyze_glyph(img: Image.Image, bbox, w, h, char):
    px = img.load()
    ink = sum(1 for y in range(h) for x in range(w) if px[x, y] > 128)
    ink_ratio = ink / (w * h) if w * h > 0 else 0.0
    
    # Detect rectangular outline (box/notdef pattern):
    # Check if there's a clear rectangular border
    has_top_border = any(px[x, 0] > 128 for x in range(w))
    has_bottom_border = any(px[x, h-1] > 128 for x in range(w))
    has_left_border = any(px[0, y] > 128 for y in range(h))
    has_right_border = any(px[w-1, y] > 128 for y in range(h))
    
    border_score = sum([has_top_border, has_bottom_border, has_left_border, has_right_border])
    
    # Detect question mark (vertical stem + curved top):
    # Check for a vertical line in the right portion of the glyph
    right_third = w * 2 // 3
    has_vertical_stem = False
    for x in range(right_third, w):
        col_ink = sum(1 for y in range(h) if px[x, y] > 128)
        if col_ink > h * 0.6:  # tall vertical line
            has_vertical_stem = True
            break
    
    # Count connected components roughly (ink runs)
    # Real Hebrew has multiple disconnected ink regions
    components = 0
    visited = set()
    for y in range(h):
        for x in range(w):
            if px[x, y] > 128 and (x, y) not in visited:
                components += 1
                # flood fill this component
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
        "char": char,
        "char_code": f"U+{ord(char):04X}",
        "ink": ink,
        "ink_ratio": round(ink_ratio, 4),
        "bbox": (bbox[0], bbox[1], bbox[2], bbox[3]),
        "width": w,
        "height": h,
        "border_score": border_score,  # 0-4, 4 = full rectangular outline
        "has_vertical_stem": has_vertical_stem,
        "components": components,
    }


def main():
    print("=" * 70)
    print("Hebrew glyph rendering comparison: David (known good) vs candidates")
    print("=" * 70)
    
    # Load David as reference
    david_font = ImageFont.truetype(str(DAVID_PATH), 80)
    print(f"\nReference font: DAVID (size 80)")
    print(f"David path: {DAVID_PATH.exists()}")
    
    # Render each Hebrew letter with David and each candidate
    ref_results = {}
    for char in TEST_LETTERS:
        result = render_glyph(david_font, char, 80)
        if result:
            img, bbox, w, h = result
            analysis = analyze_glyph(img, bbox, w, h, char)
            ref_results[char] = analysis
            # Save David glyph preview
            preview_path = OUT / f"david_{ord(char):04X}.png"
            img.save(preview_path)
    
    print("\n--- DAVID (reference) glyph analysis ---")
    print(f"{'char':>5s} {'ink':>6s} {'ratio':>6s} {'border':>6s} {'vert_stem':>9s} {'components':>10s}")
    for char in TEST_LETTERS:
        if char in ref_results:
            r = ref_results[char]
            print(f"{char:>5s} {r['ink']:6d} {r['ink_ratio']:6.4f} {r['border_score']:6d} {str(r['has_vertical_stem']):>9s} {r['components']:10d}")
    
    # Now test candidate fonts
    candidates = ["gisha.ttf", "arial.ttf", "segoeui.ttf", "consolaz.ttf", "javatext.ttf", "davidbd.ttf", "arialbd.ttf", "cambriai.ttf", "candara.ttf"]
    
    for cand_name in candidates:
        cand_path = FONT_DIR / cand_name
        if not cand_path.exists():
            print(f"\nSKIP {cand_name}: not found")
            continue
        
        print(f"\n{'='*60}")
        print(f"Candidate: {cand_name}")
        print(f"{'='*60}")
        
        try:
            cand_font = ImageFont.truetype(str(cand_path), 80)
        except Exception as exc:
            print(f"  FAILED to load: {exc}")
            continue
        
        print(f"{'char':>5s} {'ref_ink':>8s} {'cand_ink':>8s} {'ink_match':>9s} {'border':>6s} {'vert_stem':>9s} {'comp_match':>10s} {'verdict':>12s}")
        print("-" * 75)
        
        match_count = 0
        total = 0
        
        for char in TEST_LETTERS:
            if char not in ref_results:
                continue
            
            result = render_glyph(cand_font, char, 80)
            if result is None:
                print(f"{char:>5s} {'N/A':>8s} {'N/A':>8s} {'N/A':>9s} {'N/A':>6s} {'N/A':>9s} {'N/A':>10s} {'NO_GLYPH':>12s}")
                continue
            
            img, bbox, w, h = result
            analysis = analyze_glyph(img, bbox, w, h, char)
            ref = ref_results[char]
            
            # Compare ink (should be similar if same character)
            ink_diff = abs(analysis["ink"] - ref["ink"])
            ink_match = "SIMILAR" if ink_diff < ref["ink"] * 0.3 else "DIFFERENT"
            
            # Compare border score
            border_match = "SIMILAR" if analysis["border_score"] == ref["border_score"] else f"DIFF({analysis['border_score']} vs {ref['border_score']})"
            
            # Compare component count
            comp_diff = abs(analysis["components"] - ref["components"])
            comp_match = "SIMILAR" if comp_diff <= 2 else f"DIFF({analysis['components']} vs {ref['components']})"
            
            # Overall verdict
            if analysis["border_score"] >= 4 and ref["border_score"] < 4:
                verdict = "BOX/NOTDEF"
            elif analysis["has_vertical_stem"] and not ref["has_vertical_stem"]:
                verdict = "QUESTION MARK?"
            elif ink_diff < ref["ink"] * 0.3 and comp_diff <= 2:
                verdict = "REAL_HEBREW"
                match_count += 1
            else:
                verdict = "DIFFERENT"
            
            total += 1
            
            print(f"{char:>5s} {ref['ink']:8d} {analysis['ink']:8d} {ink_match:>9s} {analysis['border_score']:6d} {str(analysis['has_vertical_stem']):>9s} {comp_match:>10s} {verdict:>12s}")
            
            # Save candidate glyph preview
            preview_path = OUT / f"{cand_name.replace('.ttf', '')}_{{ord(char):04X}}.png"
            img.save(preview_path)
        
        print(f"\n  Real Hebrew match: {match_count}/{total} letters")
        if match_count == total:
            print(f"  >>> {cand_name} renders REAL Hebrew (matches David) <<<")
        elif match_count > total // 2:
            print(f"  >>> {cand_name} renders MOSTLY real Hebrew <<<")
        else:
            print(f"  >>> {cand_name} DOES NOT render real Hebrew — AVOID <<<")
    
    print("\n" + "=" * 70)
    print("Previews saved to:", OUT)
    print("=" * 70)

if __name__ == "__main__":
    main()
