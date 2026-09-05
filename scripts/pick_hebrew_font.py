#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pick_hebrew_font.py — Auto-select the best Hebrew-capable TTF from the scan
results by rendering a Hebrew test string with each candidate and measuring
ink coverage. Returns the font with the best Hebrew coverage.

Usage:
    python scripts/pick_hebrew_font.py --size 58
    → prints the best font path + name + ink ratio
"""

from __future__ import annotations
import argparse
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

TEST_STRING = "אבגדה זית טקסט חרמס"
FONT_DIR = Path("C:/Windows/Fonts")
SCAN_RESULTS = Path(__file__).resolve().parent / "scan_results.json"


def run_scan() -> list[tuple[str, float]]:
    """Scan all .ttf and return (name, ink_ratio) for ones with real Hebrew."""
    results: list[tuple[str, float]] = []
    for ttf in sorted(FONT_DIR.glob("*.ttf")):
        try:
            font = ImageFont.truetype(str(ttf), 48)
        except Exception:
            continue
        try:
            bbox = font.getbbox(TEST_STRING)
        except (OSError, Exception):
            continue
        w = bbox[2] - bbox[0] + 8
        h = bbox[3] - bbox[1] + 8
        if w <= 0 or h <= 0:
            continue
        img = Image.new("RGB", (w, h), "#000000")
        draw = ImageDraw.Draw(img)
        draw.text((4 - bbox[0], 4 - bbox[1]), TEST_STRING, font=font, fill="#FFFFFF")
        px = img.load()
        ink = sum(1 for y in range(h) for x in range(w) if px[x, y] != (0, 0, 0))
        ratio = ink / (w * h) if w * h > 0 else 0.0
        if ratio > 0.001:
            results.append((ttf.name, ratio))
    return sorted(results, key=lambda r: r[1], reverse=True)


def pick_best(candidates: list[tuple[str, float]], size: int,
              n: int = 5) -> Path | None:
    """
    Among the top-N scanned candidates, render a larger test and pick the one
    with highest ink ratio at the requested size. Avoid fonts that are clearly
    non-Hebrew (tiny coverage even at large size).
    """
    top = candidates[:n]
    best: Path | None = None
    best_ratio = 0.0
    for name, _scan_ratio in top:
        p = FONT_DIR / name
        if not p.exists():
            continue
        try:
            font = ImageFont.truetype(str(p), size)
        except Exception:
            continue
        try:
            bbox = font.getbbox(TEST_STRING)
        except (OSError, Exception):
            continue
        w = bbox[2] - bbox[0] + 8
        h = bbox[3] - bbox[1] + 8
        if w <= 0 or h <= 0:
            continue
        img = Image.new("RGB", (w, h), "#000000")
        draw = ImageDraw.Draw(img)
        draw.text((4 - bbox[0], 4 - bbox[1]), TEST_STRING, font=font, fill="#FFFFFF")
        px = img.load()
        ink = sum(1 for y in range(h) for x in range(w) if px[x, y] != (0, 0, 0))
        ratio = ink / (w * h) if w * h > 0 else 0.0
        print(f"  candidate {name:35s} size={size} ink_ratio={ratio:.4f}")
        if ratio > best_ratio:
            best_ratio = ratio
            best = p
    return best


def main() -> int:
    ap = argparse.ArgumentParser(description="Pick the best Hebrew-capable font from the system scan.")
    ap.add_argument("--size", type=int, default=58, help="Test font size for final selection")
    ap.add_argument("--n", type=int, default=10, help="How many top scan candidates to test")
    ap.add_argument("--scan-only", action="store_true", default=False,
                    help="Run font scan and write results to scan_results.json, then exit")
    args = ap.parse_args()

    print("=== Running Hebrew font scan (all .ttf in C:/Windows/Fonts) ===")
    results = run_scan()
    n_total = len(results)
    print(f"Scanned {n_total} fonts with detectable Hebrew ink coverage.")

    if args.scan_only:
        from json import dump
        out = {name: ratio for name, ratio in results}
        SCAN_RESULTS.write_text(
            __import__("json").dumps(out, indent=2), encoding="utf-8"
        )
        print(f"Wrote scan results → {SCAN_RESULTS}")
        print("\nTop 10 Hebrew fonts:")
        for name, ratio in results[:10]:
            print(f"  {name:40s} {ratio:.4f}")
        return 0

    print(f"\n=== Selecting best Hebrew font at size={args.size} (testing top {args.n}) ===")
    best: Path | None = None
    best_ratio = 0.0
    for name, _scan_ratio in results[:args.n]:
        p = FONT_DIR / name
        if not p.exists():
            continue
        try:
            font = ImageFont.truetype(str(p), args.size)
        except Exception:
            continue
        try:
            bbox = font.getbbox(TEST_STRING)
        except (OSError, Exception):
            continue
        w = bbox[2] - bbox[0] + 8
        h = bbox[3] - bbox[1] + 8
        if w <= 0 or h <= 0:
            continue
        img = Image.new("RGB", (w, h), "#000000")
        draw = ImageDraw.Draw(img)
        draw.text((4 - bbox[0], 4 - bbox[1]), TEST_STRING, font=font, fill="#FFFFFF")
        px = img.load()
        ink = sum(1 for y in range(h) for x in range(w) if px[x, y] != (0, 0, 0))
        ratio = ink / (w * h) if w * h > 0 else 0.0
        print(f"  candidate {name:35s} size={args.size} ink_ratio={ratio:.4f}")
        if ratio > best_ratio:
            best_ratio = ratio
            best = p

    if best is None:
        print("ERROR: could not find any Hebrew-capable font. Aborting.",
              file=sys.stderr)
        return 1

    print(f"\nBEST: {best.name} → {best}")
    print(f"     ink_ratio={best_ratio:.4f} at size={args.size}")
    print(f"\nTo render the final banner, pass --font {best} (or rely on auto-pick).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
