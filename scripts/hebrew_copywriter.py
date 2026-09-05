#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
hebrew_copywriter.py — HebrewCopywriter tool module.

Responsible SOLELY for:
- Hebrew text drafting, formatting, and prompt sanitization.
- Producing a JSON payload with the final Hebrew copy.
- Producing a 100% English, HEAVILY SANITIZED image-generation prompt that
  mandates a blank canvas and is GUARANTEED to contain zero Hebrew characters.

NEVER embeds Hebrew into the image-generation prompt under any circumstances.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List

# Hebrew Unicode block: U+0590..U+05FF (plus some extended punctuation)
HEBREW_RE = re.compile(r"[\u0590-\u05FF\uFB1D-\uFB4F\u05B0-\u05C7]+")

# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

def sanitize_image_prompt(visual_description: str) -> str:
    """
    Take a visual description and return a 100% English image prompt that
    explicitly mandates a blank canvas area for text overlay.

    RAISES ValueError if the input contains ANY Hebrew characters.
    """
    if HEBREW_RE.search(visual_description):
        raise ValueError(
            "HebrewCopywriter sanitization failure: the visual description "
            "contains Hebrew characters. The image prompt MUST be 100% English "
            "with zero Hebrew — never pass Hebrew strings into the image API."
        )

    base = visual_description.strip()
    if not base:
        base = "minimal abstract background"

    # Mandate blank canvas + zero text, in English only.
    sanitized = (
        f"{base}. "
        "NO TEXT, NO WORDS, NO LETTERS, NO CHARACTERS OF ANY LANGUAGE. "
        "BLANK SPACE FOR TEXT OVERLAY in the center-upper region. "
        "Empty clean canvas area reserved for later Hebrew text overlay. "
        "The image MUST contain zero readable text of any kind."
    )
    # Final gate: assert the output is still Hebrew-free
    if HEBREW_RE.search(sanitized):
        raise RuntimeError("Internal error: sanitized prompt unexpectedly contains Hebrew")

    return sanitized


def generate_hebrew_copy(topic: str, *, title_hint: str | None = None,
                         subtitle_hint: str | None = None) -> Dict[str, Any]:
    """
    HebrewCopywriter core: produce a JSON payload of Hebrew text copy for a
    banner, given a topic or brief.

    Returns:
        {
            "topic": str,
            "title": str,            # main headline in Hebrew
            "subtitle": str | None,  # secondary line in Hebrew
            "lines": [str, ...],     # ordered lines for overlay
            "image_prompt_english": str,   # 100% English, sanitized
            "notes_hebrew": str      # internal notes (Hebrew) — never sent to image model
        }

    This is a PLACEHOLDER implementation with deterministic sample copy so the
    pipeline can be tested without an LLM. Replace the body with real LLM calls
    (Claude Code / Gemini) in production; the contract (Hebrew-only text fields,
    English-only sanitized prompt) stays the same.
    """
    # --- Deterministic sample copy (replace with real LLM call) ---
    title = title_hint or "כותרת בדיקה מהכאן"
    subtitle = subtitle_hint or "שורה משנה נקייה בעברית"
    lines: List[str] = [title]
    if subtitle:
        lines.append(subtitle)
    lines.append("טקסט עוזר קצר להראות שהשלב עובד")

    # Visual description in English only (caller supplies this)
    visual_description = (
        "clean dark minimal background with soft green geometric accent lines, "
        "smooth gradient, empty center-upper region"
    )

    image_prompt_english = sanitize_image_prompt(visual_description)

    return {
        "topic": topic,
        "title": title,
        "subtitle": subtitle,
        "lines": lines,
        "image_prompt_english": image_prompt_english,
        "notes_hebrew": "כתיבת עברית: שורות מוכנות להמשך. להריץ על רקע ריק.",
    }


def write_copy_json(payload: Dict[str, Any], output: Path) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    with open(output, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"[HebrewCopywriter] wrote copy JSON → {output}")
    return output


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: List[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="HebrewCopywriter: draft Hebrew banner copy + sanitize image prompt."
    )
    ap.add_argument("--topic", "-t", type=str, required=True,
                    help="Topic or brief for the banner (used as context for copy).")
    ap.add_argument("--title-hint", type=str, default=None,
                    help="Optional title suggestion in Hebrew.")
    ap.add_argument("--subtitle-hint", type=str, default=None,
                    help="Optional subtitle suggestion in Hebrew.")
    ap.add_argument("--output", "-o", type=Path, required=True,
                    help="Path to write the copy JSON (e.g. dist/copy_payload.json).")
    ap.add_argument("--prompt-only", action="store_true", default=False,
                    help="Print only the sanitized English image prompt to stdout.")
    args = ap.parse_args(argv)

    payload = generate_hebrew_copy(
        args.topic,
        title_hint=args.title_hint,
        subtitle_hint=args.subtitle_hint,
    )

    if args.prompt_only:
        print(payload["image_prompt_english"])
        return 0

    write_copy_json(payload, args.output)

    # Also print a compact summary for the orchestration layer
    print("[HebrewCopywriter] summary:")
    print(f"  title       : {payload['title']}")
    print(f"  subtitle    : {payload['subtitle'] or '(none)'}")
    print(f"  lines       : {len(payload['lines'])} line(s)")
    print(f"  image_prompt: {payload['image_prompt_english'][:120]}...")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
