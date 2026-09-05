#!/usr/bin/env python3
"""build_blank_background.py — Step A helper: clean minimal background, zero text."""

from __future__ import annotations
import argparse
from pathlib import Path
from PIL import Image, ImageDraw

def build_background(
    output: Path,
    width: int = 1080,
    height: int = 1350,
    color: str = "#0B0E14",
    accent_color: str = "#76B900",
) -> Path:
    img = Image.new("RGB", (width, height), color)
    draw = ImageDraw.Draw(img)

    # Subtle corner accent — no letters, no text, purely geometric.
    pad = 60
    draw.rectangle([pad, pad, width - pad, height - pad], outline=accent_color, width=4)
    draw.rectangle([pad + 20, pad + 20, width - pad - 20, height - pad - 20],
                   outline=accent_color, width=1)

    output.parent.mkdir(parents=True, exist_ok=True)
    img.save(output)
    print(f"OK: wrote {output} ({width}x{height})")
    return output

def main():
    ap = argparse.ArgumentParser(description="Generate a clean minimal blank background (no text).")
    ap.add_argument("--output", "-o", type=Path, required=True, help="Output path")
    ap.add_argument("--width", type=int, default=1080, help="Width px")
    ap.add_argument("--height", type=int, default=1350, help="Height px")
    ap.add_argument("--color", default="#0B0E14", help="Background color")
    ap.add_argument("--accent", default="#76B900", help="Accent color")
    args = ap.parse_args()
    build_background(args.output, args.width, args.height, args.color, args.accent)

if __name__ == "__main__":
    main()
