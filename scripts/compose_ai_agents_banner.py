#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""compose_ai_agents_banner.py — Autonomous composition loop for ai_agents_banner_v2."""

from __future__ import annotations
import json
import sys
from pathlib import Path

sys.path.insert(0, Path(__file__).resolve().parent)
from render_hebrew_banner import render_banner

ROOT = Path(__file__).resolve().parent.parent

def main() -> int:
    copy_path = ROOT / "dist" / "copy_ai_agents_banner_v2.json"
    bg_path = ROOT / "dist" / "ai_agents_banner_v2_bg.png"
    out_path = ROOT / "dist" / "ai_agents_banner_v2_final.png"

    if not copy_path.exists():
        print(f"ERROR: copy JSON not found: {copy_path}", file=sys.stderr)
        return 1
    if not bg_path.exists():
        print(f"ERROR: background image not found: {bg_path}", file=sys.stderr)
        return 1

    payload = json.loads(copy_path.read_text(encoding="utf-8"))
    lines = payload["lines"]

    print(f"[compose] lines: {lines}")
    print(f"[compose] bg: {bg_path}")
    print(f"[compose] out: {out_path}")

    render_banner(
        image_path=bg_path,
        text_lines=lines,
        output_path=out_path,
        font_size=58,
        line_gap=20,
        start_y=180,
        anchor="mt",
        align_right=True,
        color="#FFFFFF",
        outline_color="#000000",
        outline_width=3,
    )
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
