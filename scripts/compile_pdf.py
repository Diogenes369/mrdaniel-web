#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
compile_pdf.py — bundle composited slides into one LinkedIn-ready PDF document.

LinkedIn renders a multi-page PDF as a native swipeable carousel, which is the highest-reach post
format there. Pillow writes the PDF directly, so this adds no dependency: the slides are already
RGB rasters at the preset's exact pixel size.

Usage:
    python scripts/compile_pdf.py --out deck.pdf slide_00.png slide_01.png ...
    python scripts/compile_pdf.py --out deck.pdf --dir carousel-bridge/output/<jobId>
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

# LinkedIn renders document posts at 72 dpi; the slides are already sized in pixels, so this only
# affects the declared page size, not the raster.
DPI = 72


def collect(dir_path: Path) -> list[Path]:
    """Composited slides in order. Only slide_*.png — frame_*.png are the pre-typography artwork."""
    return sorted(dir_path.glob("slide_*.png"))


def compile_pdf(images: list[Path], out: Path) -> Path:
    if not images:
        raise SystemExit("FATAL: no slides to compile")
    missing = [p for p in images if not p.exists()]
    if missing:
        raise SystemExit("FATAL: missing slide(s): " + ", ".join(str(m) for m in missing))

    pages = [Image.open(p).convert("RGB") for p in images]
    out.parent.mkdir(parents=True, exist_ok=True)
    pages[0].save(
        out, "PDF", resolution=DPI, save_all=True,
        append_images=pages[1:] if len(pages) > 1 else [],
    )
    print(f"OK: wrote {out} ({len(pages)} page(s), {pages[0].size[0]}x{pages[0].size[1]})")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Compile composited slides into a LinkedIn PDF.")
    ap.add_argument("slides", nargs="*", type=Path, help="Slide PNGs in order")
    ap.add_argument("--dir", type=Path, help="Job directory — picks up slide_*.png in order")
    ap.add_argument("--out", type=Path, required=True, help="Output PDF path")
    args = ap.parse_args()

    images = args.slides or (collect(args.dir) if args.dir else [])
    if not images:
        raise SystemExit("FATAL: pass slide paths or --dir containing slide_*.png")
    compile_pdf(images, args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
