#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
render_hebrew_banner.py — Step B of the Hermes -> Claude Code visual pipeline.

Step A (Hermes): generates a clean, TEXT-FREE 3D/Claymorphism frame and saves it to
                 %LOCALAPPDATA%\\hermes\\cache\\images\\.
Step B (this):   overlays right-to-left Hebrew typography with Pillow, then optionally
                 hands the finished image to Telegram.

Never ask an image-generation model to render Hebrew — it produces gibberish. Hebrew is
composited here, where the bidi algorithm and a real Hebrew font are under our control.

WHY THE BIDI IMPORT IS A HARD ERROR
-----------------------------------
This script previously imported python-bidi / arabic-reshaper inside try/except and fell back
to a no-op when they were missing. They *were* missing, and Pillow on this machine has no Raqm
(harfbuzz/fribidi both absent), so nothing applied the bidi algorithm at all. Every render came
out reversed character-by-character — "אוטומציה חכמה לעסקים" printed as "המכח היצמוטוא" — and
because the fallback was silent, it looked like a success. A missing bidi library now aborts
loudly instead of shipping broken Hebrew.
"""

from __future__ import annotations

import argparse
import os
import sys
import unicodedata
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# --- Hard dependency: bidi. See the module docstring for why this is not optional. -------------
try:
    from bidi.algorithm import get_display
except ImportError as exc:  # pragma: no cover - environment guard
    sys.exit(
        "FATAL: python-bidi is not installed. Hebrew would render reversed.\n"
        "Fix:   python -m pip install python-bidi arabic-reshaper\n"
        f"({exc})"
    )

try:
    import arabic_reshaper  # noqa: F401  (presence-checked; only used for joined scripts)
except ImportError as exc:  # pragma: no cover - environment guard
    sys.exit(
        "FATAL: arabic-reshaper is not installed.\n"
        "Fix:   python -m pip install python-bidi arabic-reshaper\n"
        f"({exc})"
    )

REPO_FONTS = Path(__file__).resolve().parent / "fonts"

# Font roster, preferred first. All three are OFL, ship in scripts/fonts/, and were verified at
# 22/22 Hebrew glyph coverage by bitmap-vs-.notdef comparison (NOT by the old ink-density scan,
# which wrongly reported Consolas and Palatino as "heavy Hebrew").
FONTS: dict[str, Path] = {
    # Clean modern Hebrew sans first — these are the only faces approved for the sketchnote /
    # infographic system. Cursive and handwriting faces are illegible at slide sizes and are
    # deliberately NOT the default.
    "heebo": REPO_FONTS / "Heebo.ttf",                  # neutral geometric sans — default
    "assistant": REPO_FONTS / "Assistant.ttf",          # clean modern sans
    "rubik": REPO_FONTS / "Rubik.ttf",                  # slightly rounded, strong headlines
    "varela": REPO_FONTS / "VarelaRound-Regular.ttf",   # rounded, friendly
    "gveret": REPO_FONTS / "GveretLevin-Regular.ttf",   # handwriting — decorative only, avoid
    # System fallbacks, also verified 22/22:
    "guttman": Path("C:/Windows/Fonts/GHAIM.TTF"),      # Guttman-Haim
    "david": Path("C:/Windows/Fonts/david.ttf"),
    "gisha": Path("C:/Windows/Fonts/gisha.ttf"),
}
DEFAULT_FONT = "heebo"


def resolve_font(name: str, size: int) -> ImageFont.FreeTypeFont:
    """Load `name` from the roster, or treat it as a direct path to a .ttf/.otf."""
    candidate = FONTS.get(name)
    if candidate is None:
        candidate = Path(name)
    if not candidate.exists():
        known = ", ".join(k for k, p in FONTS.items() if p.exists())
        raise FileNotFoundError(f"Font not found: {candidate}\nAvailable: {known}")
    return ImageFont.truetype(str(candidate), size)


def clean_text(text: str) -> str:
    """
    Strips invisible Unicode formatting/control characters before layout and rendering.

    Hebrew copy arriving from the pipeline carries bidi marks — the site's sanitizeHebrewText wraps
    every embedded Latin run in RLM (U+200F) so mixed text reads correctly in HTML. Those marks are
    invisible directives, not glyphs: no font has one, so assert_glyph_coverage rightly refused to
    render ("no glyph for: '‏'"), and Pillow would draw .notdef boxes for them anyway.

    Removes the whole Cf (format) category — RLM/LRM/ALM, zero-width space/joiners, directional
    isolates and embeddings, BOM — plus C0/C1 controls, keeping newline and tab. Stripping happens
    BEFORE get_display() so the bidi algorithm runs on clean logical text.
    """
    out = []
    for ch in text or "":
        if ch == chr(10) or ch == chr(9):
            out.append(ch)
            continue
        category = unicodedata.category(ch)
        if category in ("Cf", "Cc", "Co", "Cs"):
            continue
        out.append(ch)
    # Collapse any double spaces left where a mark used to sit.
    return " ".join("".join(out).split(" ")).strip()


def assert_glyph_coverage(font: ImageFont.FreeTypeFont, text: str, font_name: str) -> None:
    """
    Abort if the font lacks a glyph for any character we are about to draw.

    A missing glyph renders as .notdef — the empty box / question mark that used to appear for
    final letters, geresh/gershayim or punctuation depending on the face. Pillow does not warn, so
    without this check a broken slide looks like a successful render.
    """
    probe = Image.new("L", (96, 128), 0)
    notdef = _mask(probe, font, "￿")
    blank = _mask(probe, font, " ")
    missing = sorted({c for c in text if not c.isspace() and _mask(probe, font, c) in (notdef, blank)})
    if missing:
        raise SystemExit(
            "FATAL: font " + repr(font_name) + " has no glyph for: "
            + " ".join(repr(c) for c in missing)
            + ". Pick another --font (heebo, assistant, rubik) rather than shipping empty boxes."
        )


def _mask(img: Image.Image, font: ImageFont.FreeTypeFont, ch: str) -> bytes:
    img.paste(0, (0, 0) + img.size)
    ImageDraw.Draw(img).text((6, 6), ch, font=font, fill=255)
    return img.tobytes()


def to_visual(text: str) -> str:
    """Logical-order Hebrew -> visual order, so Pillow (no Raqm here) lays it out correctly."""
    return get_display(text)


def wrap_line(text: str, font: ImageFont.FreeTypeFont, max_width: int, draw: ImageDraw.ImageDraw) -> list[str]:
    """
    Greedy word wrap in LOGICAL order, measured on the rendered visual form.

    Wrapping must happen before the bidi transform: reordering first and splitting after would
    cut the visual string at positions that do not correspond to word boundaries.
    """
    words = text.split()
    if not words:
        return []
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        trial = f"{current} {word}"
        if draw.textlength(to_visual(trial), font=font) <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def render_banner(
    image_path: Path,
    text_lines: list[str],
    output_path: Path,
    font_name: str = DEFAULT_FONT,
    font_size: int = 48,
    line_gap: int = 14,
    start_y: int = 140,
    margin: int = 56,
    align: str = "right",
    color: str = "#FFFFFF",
    outline_color: str | None = "#000000",
    outline_width: int = 3,
    max_width_pct: float = 0.82,
    max_lines: int = 0,
) -> Path:
    text_lines = [clean_text(line) for line in text_lines]
    text_lines = [line for line in text_lines if line]

    img = Image.open(image_path).convert("RGB")
    draw = ImageDraw.Draw(img)
    font = resolve_font(font_name, font_size)
    W, H = img.size

    max_width = int(W * max_width_pct) - margin
    # `rt` / `lt` anchor on the text edge. The old code used `mt` (horizontally CENTRED) at
    # x = W - 60, which pushed half of every line off the right edge of the canvas.
    if align == "right":
        x, anchor = W - margin, "rt"
    elif align == "center":
        x, anchor = W // 2, "mt"
    else:
        x, anchor = margin, "lt"

    assert_glyph_coverage(font, "".join(text_lines), font_name)

    # Auto-fit: the layout schema reserves a fixed band (header ~22%, footer banner ~18%), so the
    # text must shrink to fit rather than overflow across the artwork. Steps down 2px at a time to
    # a floor, then accepts whatever fits best.
    def wrap_all(f: ImageFont.FreeTypeFont) -> list[str]:
        out: list[str] = []
        for line in text_lines:
            out.extend(wrap_line(line, f, max_width, draw) or [""])
        return out

    wrapped = wrap_all(font)
    if max_lines > 0:
        size = font_size
        while len(wrapped) > max_lines and size > 18:
            size -= 2
            font = resolve_font(font_name, size)
            wrapped = wrap_all(font)
        if len(wrapped) > max_lines:
            wrapped = wrapped[:max_lines]
        font_size = size

    y = start_y
    for line in wrapped:
        visual = to_visual(line)
        if outline_color and outline_width:
            draw.text(
                (x, y), visual, font=font, fill=color, anchor=anchor,
                stroke_width=outline_width, stroke_fill=outline_color,
            )
        else:
            draw.text((x, y), visual, font=font, fill=color, anchor=anchor)
        y += font_size + line_gap

    if y > H:
        print(
            f"WARNING: text ends at y={y} but the canvas is {H}px tall — "
            "lower --font-size or --start-y, or shorten the copy.",
            file=sys.stderr,
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path)
    print(f"OK: wrote {output_path} (font: {font_name}, {len(wrapped)} line(s))")
    return output_path


# --- Step C: hand the finished image to Telegram ----------------------------------------------

def send_to_telegram(image_path: Path, caption: str = "", token: str | None = None,
                     chat_id: str | None = None) -> bool:
    """
    Publish the rendered image via the Telegram Bot API.

    Credentials come from the environment, falling back to Hermes's own .env so the pipeline
    reuses the bot that is already configured for Daniel rather than defining a second one:
      TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
    """
    import requests

    token = token or os.environ.get("TELEGRAM_BOT_TOKEN") or _from_hermes_env("TELEGRAM_BOT_TOKEN")
    chat_id = (
        chat_id
        or os.environ.get("TELEGRAM_CHAT_ID")
        or _from_hermes_env("TELEGRAM_CHAT_ID")
        or _hermes_telegram_dm()
    )
    if not token or not chat_id:
        print(
            "SKIP: Telegram not configured. Need TELEGRAM_BOT_TOKEN (found in Hermes's .env) and a "
            "chat id — set TELEGRAM_CHAT_ID, or let Hermes populate channel_directory.json.",
            file=sys.stderr,
        )
        return False

    with image_path.open("rb") as fh:
        resp = requests.post(
            f"https://api.telegram.org/bot{token}/sendPhoto",
            data={"chat_id": chat_id, "caption": caption[:1024]},
            files={"photo": fh},
            timeout=60,
        )
    if resp.ok and resp.json().get("ok"):
        print(f"OK: sent {image_path.name} to Telegram chat {chat_id}")
        return True
    print(f"FAIL: Telegram responded {resp.status_code}: {resp.text[:300]}", file=sys.stderr)
    return False


def _hermes_telegram_dm() -> str | None:
    """
    Daniel's Telegram DM id, straight from Hermes's own channel directory.

    Hermes maintains `channel_directory.json` as it discovers channels, so this is the
    authoritative chat id and means the pipeline needs no separately-configured TELEGRAM_CHAT_ID.
    Prefers a direct message over a group.
    """
    import json

    directory = Path(os.environ.get("LOCALAPPDATA", "")) / "hermes" / "channel_directory.json"
    if not directory.exists():
        return None
    try:
        entries = json.loads(directory.read_text(encoding="utf-8")).get("platforms", {}).get("telegram", [])
    except (OSError, ValueError):
        return None
    for wanted in ("dm", None):
        for entry in entries:
            if wanted is None or entry.get("type") == wanted:
                if entry.get("id"):
                    return str(entry["id"])
    return None


def _from_hermes_env(key: str) -> str | None:
    """Read one key out of Hermes's .env without importing it wholesale."""
    env = Path(os.environ.get("LOCALAPPDATA", "")) / "hermes" / ".env"
    if not env.exists():
        return None
    try:
        for raw in env.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw.strip()
            if line.startswith(f"{key}=") and not line.startswith("#"):
                return line.split("=", 1)[1].strip().strip("'\"") or None
    except OSError:
        return None
    return None


HERMES_CACHE = Path(os.environ.get("LOCALAPPDATA", "")) / "hermes" / "cache" / "images"


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Overlay RTL Hebrew typography onto a clean Hermes frame, then optionally publish it."
    )
    ap.add_argument("--input", "-i", type=Path,
                    help=f"Base image (Hermes Step A output; cache: {HERMES_CACHE})")
    ap.add_argument("--output", "-o", type=Path, help="Final image path")
    ap.add_argument("--lines", "-l", nargs="+", help="Hebrew text lines (logical order)")
    ap.add_argument("--font", default=DEFAULT_FONT,
                    help=f"Roster name ({', '.join(FONTS)}) or a path to a .ttf. Default: {DEFAULT_FONT}")
    ap.add_argument("--font-size", type=int, default=48)
    ap.add_argument("--line-gap", type=int, default=14)
    ap.add_argument("--start-y", type=int, default=140)
    ap.add_argument("--margin", type=int, default=56)
    ap.add_argument("--align", choices=["right", "center", "left"], default="right")
    ap.add_argument("--max-width-pct", type=float, default=0.82, help="Wrap width as a fraction of canvas width")
    ap.add_argument("--max-lines", type=int, default=0, help="Shrink the font until the block fits N lines (0 = off)")
    ap.add_argument("--color", default="#FFFFFF")
    ap.add_argument("--outline", default="#000000", help='Outline colour, or "none" to disable')
    ap.add_argument("--outline-width", type=int, default=3)
    ap.add_argument("--send-telegram", action="store_true", help="Publish the result to Telegram")
    ap.add_argument("--caption", default="", help="Telegram caption (the Hebrew post copy)")
    ap.add_argument("--list-fonts", action="store_true", help="List available fonts and exit")
    args = ap.parse_args()

    # --list-fonts is an inspection mode, so the render args are validated here rather than
    # declared required= on the parser (which would make listing impossible on its own).
    if args.list_fonts:
        for name, path in FONTS.items():
            print(f"{name:<12} {'OK  ' if path.exists() else 'MISS'} {path}")
        return 0

    missing = [f for f, v in (("--input", args.input), ("--output", args.output), ("--lines", args.lines)) if not v]
    if missing:
        ap.error("the following arguments are required: " + ", ".join(missing))

    out = render_banner(
        args.input,
        args.lines,
        args.output,
        font_name=args.font,
        font_size=args.font_size,
        line_gap=args.line_gap,
        start_y=args.start_y,
        margin=args.margin,
        align=args.align,
        color=args.color,
        outline_color=None if args.outline.lower() == "none" else args.outline,
        outline_width=args.outline_width,
        max_width_pct=args.max_width_pct,
        max_lines=args.max_lines,
    )

    if args.send_telegram and not send_to_telegram(out, args.caption):
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
