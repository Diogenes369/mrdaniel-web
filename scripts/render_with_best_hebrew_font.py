#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
render_with_best_hebrew_font.py — One-pass banner renderer that:
1. Scans all .ttf in C:/Windows/Fonts for Hebrew glyph coverage
2. Picks the best Hebrew-capable font by re-rendering at the requested size
3. Renders the Hebrew text lines onto the base image
4. Writes the final composed image to --output

This guarantees the final banner uses a font with real Hebrew glyph coverage,
eliminating the hollow-square-font bug from earlier runs.
"""

from __future__ import annotations
import argparse
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

TEST_STRING = "אבגדה זית טקסט חרמס"
FONT_DIR = Path("C:/Windows/Fonts")

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


def scan_hebrew_fonts() -> list[tuple[str, float]]:
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
    results.sort(key=lambda r: r[1], reverse=True)
    return results


def pick_best_font(candidates: list[tuple[str, float]],
                   size: int, n: int = 10) -> Path | None:
    best: Path | None = None
    best_ratio = 0.0
    for name, _ in candidates[:n]:
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
        if ratio > best_ratio:
            best_ratio = ratio
            best = p
    return best


def render_banner(
    image_path: Path,
    text_lines: list[str],
    output_path: Path,
    *,
    font: ImageFont.FreeTypeFont,
    font_size: int,
    line_gap: int = 20,
    start_y: int = 180,
    anchor: str = "mt",
    align_right: bool = True,
    color: str = "#FFFFFF",
    outline_color: str = "#000000",
    outline_width: int = 3,
) -> None:
    img = Image.open(image_path).convert("RGB")
    draw = ImageDraw.Draw(img)
    W, H = img.size
    x = W - 60 if align_right else 60
    y = start_y

    for line in text_lines:
        display = reshape_hebrew(line) if any("\u0590" <= c <= "\u05FF" for c in line) else line
        if outline_width:
            for dx in range(-outline_width, outline_width + 1):
                for dy in range(-outline_width, outline_width + 1):
                    if dx == 0 and dy == 0:
                        continue
                    draw.text((x + dx, y + dy), display, font=font,
                              fill=outline_color, anchor=anchor)
        draw.text((x, y), display, font=font, fill=color, anchor=anchor)
        y += font_size + line_gap

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path)
    print(f"OK: wrote {output_path} (best font: {font.getname()})")


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Render Hebrew banner with auto-discovered best Hebrew font."
    )
    ap.add_argument("--input", "-i", type=Path, required=True, help="Base image path")
    ap.add_argument("--output", "-o", type=Path, required=True, help="Final image path")
    ap.add_argument("--lines", "-l", nargs="+", required=True, help="Hebrew text lines")
    ap.add_argument("--font-size", type=int, default=58, help="Font size in px")
    ap.add_argument("--line-gap", type=int, default=20, help="Gap between lines")
    ap.add_argument("--start-y", type=int, default=180, help="Top Y offset")
    ap.add_argument("--align-right", action="store_true", default=True, help="Right-align (default)")
    ap.add_argument("--align-left", action="store_true", default=False, help="Left-align instead")
    ap.add_argument("--color", default="#FFFFFF", help="Text color")
    ap.add_argument("--outline", default="#000000", help="Outline color")
    ap.add_argument("--outline-width", type=int, default=3, help="Outline width")
    ap.add_argument("--scan-only", action="store_true", default=False,
                    help="Run font scan and print top 10, then exit")
    args = ap.parse_args()

    align_right = args.align_right and not args.align_left

    print("=== Scanning Hebrew fonts (all .ttf in C:/Windows/Fonts) ===")
    results = scan_hebrew_fonts()
    print(f"Scanned {len(results)} fonts with detectable Hebrew ink coverage.")

    if args.scan_only:
        print("\nTop 10 Hebrew fonts:")
        for name, ratio in results[:10]:
            print(f"  {name:40s} {ratio:.4f}")
        return 0

    print(f"\n=== Selecting best Hebrew font at size={args.font_size} ===")
    best_path = pick_best_font(results, args.font_size, n=10)
    if best_path is None:
        print("ERROR: could not find any Hebrew-capable font. Aborting.",
              file=sys.stderr)
        return 1

    print(f"Best font: {best_path.name}")

    try:
        font = ImageFont.truetype(str(best_path), args.font_size)
    except Exception as exc:
        print(f"ERROR: failed to load best font {best_path}: {exc}", file=sys.stderr)
        return 1

    render_banner(
        image_path=args.input,
        text_lines=args.lines,
        output_path=args.output,
        font=font,
        font_size=args.font_size,
        line_gap=args.line_gap,
        start_y=args.start_y,
        align_right=align_right,
        color=args.color,
        outline_color=args.outline,
        outline_width=args.outline_width,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
