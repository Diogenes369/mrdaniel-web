#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
compose_slide.py — Pass 2 of the two-pass carousel pipeline.

Pass 1 (Hermes) draws ONLY artwork: paper ground, hand-drawn ink containers, robots, gauges,
screens. No text, no numerals, nothing typographic.
Pass 2 (this) composites every glyph — headline, card copy, numbered circles, footer summary —
with Pillow under explicit bounding boxes.

Why a dedicated compositor rather than chained render_hebrew_banner calls: the previous approach
placed one text block at a guessed y-offset per pass, which is what produced the reported faults —
headline overflowing the top boundary, card copy landing on the artwork instead of inside the
boxes, and numerals appearing twice (once drawn by the image model, once overlaid). Here every
element is assigned a rectangle up front and is auto-fitted INSIDE it, so text can never leave its
zone, and the numbers exist in exactly one place: drawn here.

Input is a JSON layout spec on stdin or via --spec. See LAYOUT_SPEC_EXAMPLE at the bottom.
"""

from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

try:
    from bidi.algorithm import get_display
except ImportError as exc:  # pragma: no cover
    sys.exit(f"FATAL: python-bidi is not installed — Hebrew would render reversed. ({exc})")

FONT_DIR = Path(__file__).resolve().parent / "fonts"

FONTS = {
    "opensans": FONT_DIR / "OpenSans.ttf",   # default — full Hebrew, verified 27/27
    "heebo": FONT_DIR / "Heebo.ttf",
    "assistant": FONT_DIR / "Assistant.ttf",
    "rubik": FONT_DIR / "Rubik.ttf",
}
DEFAULT_FONT = "opensans"

# Exact output dimensions per platform preset. Hermes' frame is normalised to these before any
# typography is placed, so the safe-zone fractions below mean the same thing on every preset.
PRESETS = {
    "portrait": (1080, 1350),   # 4:5 — Instagram / LinkedIn carousel
    "story": (1080, 1920),      # 9:16 — Stories / TikTok / Reels
    "square": (1080, 1080),     # 1:1
}
DEFAULT_PRESET = "portrait"


def fit_canvas(img: Image.Image, preset: str) -> Image.Image:
    """
    Normalises Hermes' frame to the preset's exact pixel size.

    Cover-crops from the centre rather than stretching, so the artwork keeps its proportions —
    a squashed robot is far more obvious than a slightly tighter crop.
    """
    target_w, target_h = PRESETS.get(preset, PRESETS[DEFAULT_PRESET])
    if img.size == (target_w, target_h):
        return img
    src_w, src_h = img.size
    scale = max(target_w / src_w, target_h / src_h)
    resized = img.resize((max(1, round(src_w * scale)), max(1, round(src_h * scale))), Image.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))

# Site brand palette (src/index.css --color-brand-*). "brand" is the default scheme.
PALETTES = {
    "brand": {
        "ink": "#0B0F17", "accent": "#76B900", "accent2": "#5C9200",
        "highlight": "#9FE870", "onAccent": "#0B0F17",
    },
    "sketchnote": {
        "ink": "#1A1A1A", "accent": "#E85A2A", "accent2": "#2E9E8F",
        "highlight": "#F5C542", "onAccent": "#FFFFFF",
    },
    "carbon": {
        "ink": "#F4F4F5", "accent": "#00FF66", "accent2": "#22D3EE",
        "highlight": "#9FE870", "onAccent": "#0B0F17",
    },
}


def clean_text(text: str) -> str:
    """Strips invisible bidi/format marks (RLM, ZWSP, isolates, BOM) — see render_hebrew_banner."""
    out = [c for c in (text or "") if unicodedata.category(c) not in ("Cf", "Cc", "Co", "Cs")]
    return " ".join("".join(out).split()).strip()


def load_font(name: str, size: int) -> ImageFont.FreeTypeFont:
    path = FONTS.get(name) or Path(name)
    if not path.exists():
        raise SystemExit(f"FATAL: font not found: {path}. Available: {', '.join(FONTS)}")
    return ImageFont.truetype(str(path), size)


def assert_coverage(font: ImageFont.FreeTypeFont, text: str, name: str) -> None:
    probe = Image.new("L", (96, 128), 0)

    def mask(ch: str) -> bytes:
        probe.paste(0, (0, 0) + probe.size)
        ImageDraw.Draw(probe).text((6, 6), ch, font=font, fill=255)
        return probe.tobytes()

    notdef, blank = mask("￿"), mask(" ")
    missing = sorted({c for c in text if not c.isspace() and mask(c) in (notdef, blank)})
    if missing:
        raise SystemExit(
            "FATAL: font " + repr(name) + " has no glyph for: "
            + " ".join(repr(c) for c in missing)
        )


def wrap(text: str, font: ImageFont.FreeTypeFont, max_w: int, draw: ImageDraw.ImageDraw) -> list[str]:
    words = text.split()
    if not words:
        return []
    lines, cur = [], words[0]
    for w in words[1:]:
        trial = f"{cur} {w}"
        if draw.textlength(get_display(trial), font=font) <= max_w:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


def fit_block(
    text: str, draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int],
    font_name: str, max_size: int, min_size: int = 14, line_gap_ratio: float = 0.24,
) -> tuple[ImageFont.FreeTypeFont, list[str], int]:
    """
    Largest font size at which `text` wraps to fit entirely inside `box`.

    Both axes are checked. This is the guarantee that text cannot overflow its band — the previous
    renderer only capped line COUNT, so a long line at a fixed size still spilled past the top
    boundary.
    """
    x0, y0, x1, y1 = box
    max_w, max_h = x1 - x0, y1 - y0
    size = max_size
    while size >= min_size:
        font = load_font(font_name, size)
        lines = wrap(text, font, max_w, draw)
        line_h = size + int(size * line_gap_ratio)
        if lines and len(lines) * line_h <= max_h and all(
            draw.textlength(get_display(l), font=font) <= max_w for l in lines
        ):
            return font, lines, line_h
        size -= 2
    font = load_font(font_name, min_size)
    line_h = min_size + int(min_size * line_gap_ratio)
    lines = wrap(text, font, max_w, draw)
    keep = max(1, max_h // line_h)
    return font, lines[:keep], line_h


def draw_text_plate(
    img: Image.Image, box: tuple[int, int, int, int], fill: str, opacity: int = 232,
) -> None:
    """
    Lays a translucent paper plate behind a text block.

    Pass 1 is instructed to leave the lower part of each card empty, but the image model does not
    honour that reliably — it fills the whole card and the copy then lands on a robot or a gauge.
    This makes legibility deterministic instead of dependent on the model complying: the plate is
    drawn on the composite, under the type, so text always has clean ground beneath it.
    """
    x0, y0, x1, y1 = box
    if x1 <= x0 or y1 <= y0:
        return
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    rgb = tuple(int(fill.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
    ImageDraw.Draw(overlay).rounded_rectangle(
        [x0, y0, x1, y1], radius=max(8, (y1 - y0) // 8), fill=rgb + (opacity,)
    )
    img.alpha_composite(overlay) if img.mode == "RGBA" else img.paste(
        Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"), (0, 0)
    )


def draw_block(
    draw: ImageDraw.ImageDraw, text: str, box: tuple[int, int, int, int], font_name: str,
    max_size: int, color: str, align: str = "right", valign: str = "top",
) -> None:
    text = clean_text(text)
    if not text:
        return
    font, lines, line_h = fit_block(text, draw, box, font_name, max_size)
    assert_coverage(font, text, font_name)
    x0, y0, x1, y1 = box
    total_h = len(lines) * line_h
    y = y0 if valign == "top" else y0 + (y1 - y0 - total_h) // 2
    for line in lines:
        visual = get_display(line)
        if align == "right":
            draw.text((x1, y), visual, font=font, fill=color, anchor="rt")
        elif align == "center":
            draw.text(((x0 + x1) // 2, y), visual, font=font, fill=color, anchor="mt")
        else:
            draw.text((x0, y), visual, font=font, fill=color, anchor="lt")
        y += line_h


def draw_number_badge(
    draw: ImageDraw.ImageDraw, n: int, center: tuple[int, int], radius: int,
    fill: str, text_color: str, font_name: str,
) -> None:
    """Numbered step circle. Drawn HERE and only here — Pass 1 is forbidden from drawing numerals,
    which is what caused numbers to appear twice."""
    cx, cy = center
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=fill)
    font = load_font(font_name, int(radius * 1.15))
    draw.text((cx, cy), str(n), font=font, fill=text_color, anchor="mm")


def compose(spec: dict) -> Path:
    src = Path(spec["input"])
    out = Path(spec["output"])
    font_name = spec.get("font", DEFAULT_FONT)
    palette = PALETTES.get(spec.get("palette", "brand"), PALETTES["brand"])
    colors = {**palette, **(spec.get("colors") or {})}

    # QA retry passes fontScale < 1 to shrink every band's ceiling, giving the fitter more room.
    scale = float(spec.get("fontScale", 1.0) or 1.0)

    img = fit_canvas(Image.open(src).convert("RGB"), spec.get("preset", DEFAULT_PRESET))
    draw = ImageDraw.Draw(img)
    W, H = img.size
    margin = int(spec.get("margin", W * 0.085))

    # --- header band: top 22%, text auto-fitted inside it ---
    if spec.get("headline"):
        draw_block(
            draw, spec["headline"],
            (margin, int(H * 0.045), W - margin, int(H * 0.225)),
            font_name, int(W * 0.082 * scale), colors["ink"], align="right", valign="top",
        )

    # --- cards: each gets an explicit rect; badge and copy both live inside it ---
    for card in spec.get("cards", []):
        bx = card["box"]  # [x0,y0,x1,y1] as 0..1 fractions of the canvas
        x0, y0, x1, y1 = int(bx[0] * W), int(bx[1] * H), int(bx[2] * W), int(bx[3] * H)
        pad = int((x1 - x0) * 0.07)
        text_box = (x0 + pad, y0 + pad, x1 - pad, y1 - pad)
        if card.get("number"):
            r = int(min(x1 - x0, y1 - y0) * 0.11)
            draw_number_badge(
                draw, card["number"], (x1 - pad - r, y0 + pad + r), r,
                colors["accent"], colors["onAccent"], font_name,
            )
            text_box = (x0 + pad, y0 + pad + int(r * 2.4), x1 - pad, y1 - pad)
        if card.get("text"):
            # Measure first so the plate hugs the actual text, then re-acquire the draw handle:
            # the plate composites a new surface into `img`.
            cf, clines, clh = fit_block(
                clean_text(card["text"]), draw, text_box, font_name, int(W * 0.05 * scale)
            )
            block_h = len(clines) * clh
            tx0, ty0, tx1, ty1 = text_box
            cy = ty0 + (ty1 - ty0 - block_h) // 2
            pad_x, pad_y = int(W * 0.018), int(W * 0.014)
            draw_text_plate(
                img,
                (tx0 - pad_x, cy - pad_y, tx1 + pad_x, cy + block_h + pad_y),
                spec.get("plateColor") or "#F8F6EF",
            )
            draw = ImageDraw.Draw(img)
            draw_block(
                draw, card["text"], text_box, font_name,
                int(W * 0.05 * scale), card.get("color") or colors["ink"],
                align=card.get("align", "right"), valign="middle",
            )

    # --- footer banner: bottom band, high contrast on the accent fill ---
    footer = spec.get("footer")
    if footer:
        fb = spec.get("footerBox", [0.07, 0.78, 0.93, 0.90])
        x0, y0, x1, y1 = int(fb[0] * W), int(fb[1] * H), int(fb[2] * W), int(fb[3] * H)
        if spec.get("drawFooterBox", False):
            draw.rounded_rectangle([x0, y0, x1, y1], radius=int((y1 - y0) * 0.22), fill=colors["accent"])
        pad = int((x1 - x0) * 0.05)
        draw_block(
            draw, footer, (x0 + pad, y0 + pad, x1 - pad, y1 - pad), font_name,
            int(W * 0.045 * scale), spec.get("footerColor") or colors["onAccent"],
            align="center", valign="middle",
        )

    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    print(f"OK: composed {out} {img.size} ({font_name}, palette={spec.get('palette', 'brand')}, preset={spec.get('preset', DEFAULT_PRESET)})")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Composite Hebrew typography onto a text-free slide.")
    ap.add_argument("--spec", type=Path, help="JSON layout spec (default: read stdin)")
    ap.add_argument("--list-fonts", action="store_true")
    args = ap.parse_args()

    if args.list_fonts:
        for name, path in FONTS.items():
            print(f"{name:<12} {'OK  ' if path.exists() else 'MISS'} {path}")
        return 0

    raw = args.spec.read_text(encoding="utf-8") if args.spec else sys.stdin.read()
    compose(json.loads(raw))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
