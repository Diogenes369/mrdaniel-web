#!/usr/bin/env python3
"""Bundle a finished carousel job into one downloadable ZIP.

Called by carousel-bridge at publish time. Node has no stdlib zip and this repo pulls in no zip
dependency, so the bundling happens here — the same shell-out pattern the bridge already uses for
compose_slide.py and compile_pdf.py.

Only final artefacts go in: the composited slides, the LinkedIn PDF, and a caption file. The raw
Hermes frames (frame_NN.png) and the compositor specs (spec_NN.json) are intermediates and are
deliberately excluded — a published bundle is what the recipient should see, not the workshop.
"""
from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path


def build(job_dir: Path, out_path: Path, caption: str, title: str) -> int:
    slides = sorted(job_dir.glob("slide_*.png"))
    if not slides:
        print(f"FATAL: no slide_*.png in {job_dir}", file=sys.stderr)
        return 2

    pdfs = sorted(job_dir.glob("carousel-*.pdf"))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    # Written to a temp name and moved into place so a reader can never observe a half-written ZIP.
    tmp = out_path.with_suffix(".zip.part")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        for i, slide in enumerate(slides, start=1):
            z.write(slide, f"slides/slide-{i:02d}.png")
        for pdf in pdfs:
            z.write(pdf, f"{pdf.name}")
        if caption.strip():
            z.writestr("caption.txt", caption)
        z.writestr(
            "manifest.json",
            json.dumps(
                {"title": title, "slides": len(slides), "pdf": bool(pdfs)},
                ensure_ascii=False,
                indent=2,
            ),
        )
    tmp.replace(out_path)
    print(json.dumps({"ok": True, "slides": len(slides), "pdf": bool(pdfs), "zip": str(out_path)}))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", type=Path, required=True, help="Job directory holding slide_*.png")
    ap.add_argument("--out", type=Path, required=True, help="Output .zip path")
    ap.add_argument("--caption", default="", help="Caption text to include as caption.txt")
    ap.add_argument("--title", default="", help="Guide title recorded in manifest.json")
    args = ap.parse_args()

    if not args.dir.is_dir():
        print(f"FATAL: not a directory: {args.dir}", file=sys.stderr)
        return 2
    return build(args.dir, args.out, args.caption, args.title)


if __name__ == "__main__":
    raise SystemExit(main())
