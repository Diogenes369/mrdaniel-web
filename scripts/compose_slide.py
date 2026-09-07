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

from PIL import Image, ImageDraw, ImageFilter, ImageFont

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

# Visual styles. `scrim` decides how much the background is darkened/lightened behind text, and
# `ink` is the text colour that pairs with it. A photographic background needs a real scrim; a
# drawn sketchnote on cream paper needs none.
STYLES = {
    "sketchnote": {"ink": "#1A1A1A", "scrim": None, "accent": "#E85A2A"},
    "photoreal": {"ink": "#FFFFFF", "scrim": ("dark", 0.55), "accent": "#9FE870"},
    "dark-minimal": {"ink": "#F4F4F5", "scrim": ("dark", 0.72), "accent": "#00FF66"},
    "enterprise": {"ink": "#0B0F17", "scrim": ("light", 0.60), "accent": "#76B900"},
}
DEFAULT_STYLE = "sketchnote"


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


def apply_scrim(img: Image.Image, mode: str, strength: float) -> Image.Image:
    """
    Non-intrusive legibility wash over a photographic background.

    A vertical gradient rather than a flat tint: strongest in the header band and the footer band
    where the Hebrew sits, and nearly clear across the middle so the photograph still reads. This
    is what lets a real photo back the slide without fighting the type.
    """
    w, h = img.size
    base = (0, 0, 0) if mode == "dark" else (255, 255, 255)
    grad = Image.new("L", (1, h))
    px = grad.load()
    for y in range(h):
        t = y / max(1, h - 1)
        # Full strength across the top ~26% and bottom ~24%, easing through the middle.
        if t < 0.26:
            a = 1.0
        elif t > 0.76:
            a = 1.0
        else:
            mid = abs((t - 0.51) / 0.25)
            a = 0.34 + 0.42 * mid
        px[0, y] = int(255 * strength * a)
    mask = grad.resize((w, h))
    wash = Image.new("RGB", (w, h), base)
    return Image.composite(wash, img, mask.point(lambda v: v))


def mean_luminance(img: Image.Image, box: tuple[int, int, int, int]) -> float:
    """Average perceived brightness of a region, 0..1 — drives automatic text colour."""
    x0, y0, x1, y1 = (max(0, box[0]), max(0, box[1]), min(img.width, box[2]), min(img.height, box[3]))
    if x1 <= x0 or y1 <= y0:
        return 1.0
    crop = img.crop((x0, y0, x1, y1)).convert("L").resize((32, 32))
    return sum(crop.getdata()) / (32 * 32 * 255)


def soft_halo(
    img: Image.Image, lines: list[str], font: ImageFont.FreeTypeFont, positions: list[tuple[int, int]],
    anchor: str, canvas_color: str, radius: int = 7, opacity: int = 120,
) -> None:
    """
    Boxless edge legibility: a blurred copy of the glyphs themselves, in the canvas colour, laid
    under the crisp text.

    This replaces the translucent plate that used to sit behind card copy. A plate reads as a UI
    chip pasted onto the artwork; a halo is invisible as a shape — it only lifts the letterforms
    off whatever line work happens to be behind them. Because it is the glyph silhouette rather
    than a rectangle, there is no edge, no corner and no frame anywhere in the output.

    Applied only where it is needed (card copy over artwork), never to the headline sitting on
    clean paper.
    """
    if not lines:
        return
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    rgb = tuple(int(canvas_color.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
    for line, pos in zip(lines, positions):
        ld.text(pos, line, font=font, fill=rgb + (opacity,), anchor=anchor,
                stroke_width=radius, stroke_fill=rgb + (opacity,))
    blurred = layer.filter(ImageFilter.GaussianBlur(radius))
    img.paste(Image.alpha_composite(img.convert("RGBA"), blurred).convert("RGB"), (0, 0))


def draw_accent_rule(
    img: Image.Image, box: tuple[int, int, int, int], color: str, width_frac: float = 0.28,
) -> None:
    """
    Soft accent underline beneath the headline.

    Deliberately understated: a short, slightly tapered hairline right-aligned under the last line
    of RTL type. An earlier version alternated the y by a pixel to look hand-drawn and instead read
    as a broken dashed line, so it is now a clean single stroke with a soft alpha falloff at the
    tail — closer to a marker stroke lifting off the paper than to a UI divider.
    """
    x0, y0, x1, y1 = box
    span = max(40, int((x1 - x0) * width_frac))
    start_x = max(x0, x1 - span)
    thickness = max(3, (y1 - y0) // 40)
    rgb = tuple(int(color.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))

    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    steps = 48
    for i in range(steps):
        seg_x0 = start_x + int(span * i / steps)
        seg_x1 = start_x + int(span * (i + 1) / steps) + 1
        # Full strength at the right (where RTL text begins), fading out to the left.
        alpha = int(235 * (1 - (i / steps) ** 2.2))
        ld.rectangle([seg_x0, y1, seg_x1, y1 + thickness], fill=rgb + (alpha,))
    img.paste(Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB"), (0, 0))


def draw_block(
    draw: ImageDraw.ImageDraw, text: str, box: tuple[int, int, int, int], font_name: str,
    max_size: int, color: str, align: str = "right", valign: str = "top",
    img: Image.Image | None = None, halo: str | None = None, line_gap_ratio: float = 0.34,
) -> tuple[int, int] | None:
    """
    Lays a text block inside `box`. Returns (bottom_y, right_x) so callers can position an accent
    rule under it.

    `line_gap_ratio` defaults higher than typographic minimum: editorial social layouts breathe,
    and cramped leading was part of what made earlier slides feel like a form rather than a poster.
    `halo` (a canvas colour) turns on the boxless soft halo for copy sitting over artwork.
    """
    text = clean_text(text)
    if not text:
        return None
    font, lines, line_h = fit_block(text, draw, box, font_name, max_size, line_gap_ratio=line_gap_ratio)
    assert_coverage(font, text, font_name)
    x0, y0, x1, y1 = box
    total_h = len(lines) * line_h
    y = y0 if valign == "top" else y0 + (y1 - y0 - total_h) // 2

    visual = [get_display(l) for l in lines]
    if align == "right":
        anchor, positions = "rt", [(x1, y + i * line_h) for i in range(len(lines))]
    elif align == "center":
        anchor, positions = "mt", [((x0 + x1) // 2, y + i * line_h) for i in range(len(lines))]
    else:
        anchor, positions = "lt", [(x0, y + i * line_h) for i in range(len(lines))]

    if halo and img is not None:
        soft_halo(img, visual, font, positions, anchor, halo)
        draw = ImageDraw.Draw(img)

    for line, pos in zip(visual, positions):
        draw.text(pos, line, font=font, fill=color, anchor=anchor)

    widest = max((draw.textlength(l, font=font) for l in visual), default=0)
    return (y + total_h, x1 if align == "right" else x0 + int(widest))


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
    style = STYLES.get(spec.get("style", DEFAULT_STYLE), STYLES[DEFAULT_STYLE])
    # Style ink/accent override the palette's; an explicit spec["colors"] still wins over both.
    colors = {**palette, "ink": style["ink"], "accent": style["accent"], **(spec.get("colors") or {})}

    # QA retry passes fontScale < 1 to shrink every band's ceiling, giving the fitter more room.
    scale = float(spec.get("fontScale", 1.0) or 1.0)
    img = fit_canvas(Image.open(src).convert("RGB"), spec.get("preset", DEFAULT_PRESET))

    # Photographic styles get a gradient scrim so the Hebrew stays legible over any image.
    if style["scrim"]:
        img = apply_scrim(img, style["scrim"][0], style["scrim"][1])
    draw = ImageDraw.Draw(img)
    W, H = img.size
    margin = int(spec.get("margin", W * 0.085))

    # --- header band: top 22%, text auto-fitted inside it ---
    if spec.get("headline"):
        head_box = (margin, int(H * 0.05), W - margin, int(H * 0.215))
        # Automatic contrast: a light band takes charcoal, a dark band takes near-white, whatever
        # the background happens to be. Keeps the ratio comfortable without hand-tuning per style.
        head_ink = colors["ink"] if spec.get("colors", {}).get("ink") else (
            "#0B0F17" if mean_luminance(img, head_box) > 0.55 else "#FFFFFF"
        )
        end = draw_block(
            draw, spec["headline"], head_box, font_name,
            int(W * 0.088 * scale), head_ink, align="right", valign="top",
            line_gap_ratio=0.30,
        )
        # Thin accent rule directly under the headline — a hairline, never a container.
        if end and spec.get("accentRule", True):
            bottom, right = end
            draw_accent_rule(img, (margin, head_box[1], right, bottom + int(H * 0.012)),
                             colors["accent"])
            draw = ImageDraw.Draw(img)

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
            # No plate. A boxless halo in the canvas colour lifts the glyphs off any linework
            # behind them; it is the glyph silhouette blurred, so it has no edge or corner.
            light_bg = mean_luminance(img, text_box) > 0.55
            card_ink = card.get("color") or ("#0B0F17" if light_bg else "#FFFFFF")
            draw_block(
                draw, card["text"], text_box, font_name,
                int(W * 0.05 * scale), card_ink,
                align=card.get("align", "right"), valign="middle",
                img=img, halo=spec.get("canvasColor") or ("#F8F6EF" if light_bg else "#0B0F17"),
            )
            draw = ImageDraw.Draw(img)

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
            align="center", valign="middle", line_gap_ratio=0.30,
        )

    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    print(f"OK: composed {out} {img.size} ({font_name}, palette={spec.get('palette', 'brand')}, preset={spec.get('preset', DEFAULT_PRESET)}, style={spec.get('style', DEFAULT_STYLE)})")
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
