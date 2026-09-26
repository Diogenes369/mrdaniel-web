---
name: mrdaniel.co.il
description: Dark carbon workbench with one green signal — Hebrew-first site, dashboard and generated slide decks
colors:
  brand-green: "#76B900"
  brand-green-light: "#8FD400"
  brand-green-pale: "#9FE870"
  brand-green-deep: "#5C9200"
  signal-glow: "#00FF66"
  neon-cyan: "#22D3EE"
  electric-blue: "#38BDF8"
  carbon-950: "#08090C"
  carbon-900: "#121212"
  carbon-800: "#1E1E24"
  carbon-700: "#2A2D34"
  carbon-600: "#3A3D46"
  ink-bright: "#F1F5F9"
  ink-body: "#E2E8F0"
  ink-muted: "#CBD5E1"
  ink-faint: "#94A3B8"
  slide-slate: "#08090E"
  cream-paper: "#FAF6F0"
  terracotta: "#D96B52"
  cream-ink: "#1C1917"
typography:
  display:
    fontFamily: "Rubik, Heebo, 'Segoe UI', sans-serif"
    fontSize: "clamp(2.1rem, 6vw + 1rem, 5.25rem)"
    fontWeight: 700
    lineHeight: 1.08
  headline:
    fontFamily: "Rubik, Heebo, 'Segoe UI', sans-serif"
    fontSize: "clamp(2rem, 5vw + 1rem, 3.75rem)"
    fontWeight: 700
    lineHeight: 1.15
  title:
    fontFamily: "Rubik, Heebo, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.25rem, 2vw + 0.9rem, 1.875rem)"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Heebo, 'Segoe UI', Arial, sans-serif"
    fontSize: "clamp(0.95rem, 1.5vw + 0.7rem, 1.125rem)"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "'JetBrains Mono', Heebo, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.08em"
  slide-headline:
    fontFamily: "'Noto Sans Hebrew', Rubik, Assistant, Heebo, sans-serif"
    fontSize: "0.062W (interior) / 0.1W (cover)"
    fontWeight: 800
    lineHeight: 1.12
    fontVariation: "'wdth' 75"
  slide-body:
    fontFamily: "Assistant, Heebo, Rubik, sans-serif"
    fontSize: "0.038W"
    fontWeight: 400
    lineHeight: 1.6
  slide-note:
    fontFamily: "'Playpen Sans Hebrew', Assistant, Heebo, sans-serif"
    fontSize: "0.04W"
    fontWeight: 600
    lineHeight: 1.25
  slide-code:
    fontFamily: "'JetBrains Mono', Assistant, Heebo, monospace"
    fontSize: "0.026W"
    fontWeight: 500
rounded:
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  full: "9999px"
spacing:
  slide-pad: "0.085W"
  slide-gap: "0.028W"
  slide-card-pad: "0.038W"
components:
  button-primary:
    backgroundColor: "{colors.brand-green}"
    textColor: "{colors.carbon-950}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.brand-green-light}"
  button-glass:
    backgroundColor: "{colors.carbon-800}"
    textColor: "{colors.ink-bright}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
  button-ghost:
    textColor: "{colors.ink-bright}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
  dash-card:
    backgroundColor: "{colors.carbon-900}"
    rounded: "{rounded.lg}"
  slide-glass-card:
    rounded: "0.03W"
    padding: "{spacing.slide-card-pad}"
---

# Design System: mrdaniel.co.il

## Overview

**Creative North Star: "The Annotated Workbench"**

A practitioner's bench at night. The surfaces are dark carbon, cool and quiet; one green signal marks what is live, chosen or important; the real tools sit on the table (a terminal frame, a code block, a vector product mark, a click-path of actual menu labels); and in the margins there is a person's own handwriting pointing at the part that matters. Everything reads as made by one hands-on individual rather than assembled by a platform.

The system spans three surfaces that must read as one product: the public Hebrew site (`src/`), the operator dashboard (`dashboard/`) and the canvas-rendered carousels and 9:16 videos the dashboard exports (`dashboard/src/lib/*Renderer.ts`, `designAssets.ts`). The site and dashboard are dark-only, permanently. The slides add two alternate papers — the cream & terracotta study-notes family and the vintage showcase — but share the same type roles and hand-drawn marks.

Density is moderate on the site (one idea per section, plain Hebrew for non-technical clients) and high in the dashboard (an operator's live tool). Slides are the loudest surface: one claim per slide, set big.

**Key Characteristics:**
- Dark carbon ground, one saturated green (`brand-green`) as the signal; cyan only as a secondary data/tech accent.
- Hebrew-first, RTL everywhere; Latin product names stay Latin and correctly ordered inside RTL lines.
- Slide headlines in bold **condensed** Hebrew, balanced across lines; body in a calm humanist sans.
- Human marks — handwritten notes, doodle arrows, marker swipes, scribbled circles — used sparingly, always pointing at real content.
- Real technical artefacts (terminal frames, highlighted code, vector tool marks) instead of stock imagery.

## Colors

One hue does the talking; everything else is carbon and ink.

### Primary
- **Workbench Green** (`brand-green`): the signal. Primary buttons, live indicators, active tabs, the accent line of a slide headline, progress rails, the handwritten note on slate slides. Its lighter steps (`brand-green-light`, `brand-green-pale`) are hover and highlight states; `brand-green-deep` is pressed and the "on light" variant.
- **Live Glow** (`signal-glow`): only as light — a glow halo on a live dot or an ambient bloom — never as a text or fill colour.

### Secondary
- **Neon Cyan** (`neon-cyan`) and **Electric Blue** (`electric-blue`): data callouts, tech-accent icons, the cyan theme of a deck. They support the green; they never replace it on the same element.

### Tertiary
- **Terracotta** (`terracotta`) on **Cream Paper** (`cream-paper`) with **Warm Ink** (`cream-ink`): the study-notes slide family only. Not used on the site or dashboard UI. Per-tool accents (`TOOL_STYLE` in `designAssets.ts`, e.g. Claude's orange) tint a slide that is about that tool.

### Neutral
- **Carbon 950** (`carbon-950`): page ground for site and dashboard. **Slide Slate** (`slide-slate`) is the slightly cooler slide ground, so ambient glows read as light.
- **Carbon 900–600**: surface ramp — cards, raised panels, borders, dividers, in that order.
- **Ink** (`ink-bright` → `ink-faint`): the brightened zinc ramp; headings and body use the top two, labels and fine print the lower two. Relative ordering is load-bearing.

### Named Rules
**The One Signal Rule.** Green marks what is live, chosen or important. If everything on a screen is green, nothing is; a slide carries at most one accent-coloured headline line, one marker swipe or one note.

**The Solid Ink Rule.** Text is set in solid colour. No gradient fills across glyphs — emphasis comes from the condensed weight, size and one accent colour.

## Typography

**Site/dashboard display:** Rubik (with Heebo, then system Hebrew)
**Site/dashboard body:** Heebo
**Slide headline:** Noto Sans Hebrew, condensed (`wdth` 75), weight 800–900 (with Rubik)
**Slide body:** Assistant (with Heebo)
**Handwritten notes:** Playpen Sans Hebrew 600
**Mono / labels / code:** JetBrains Mono — Latin and digits only; Hebrew in a mono element falls to the brand sans.

**Character:** a sturdy geometric display over a clean humanist body. On slides the headline narrows to a condensed cut so a Hebrew claim sits in two confident lines at poster size, while a marker hand supplies the one human voice.

### Hierarchy
- **Display** (700, `clamp(2.1rem, 6vw + 1rem, 5.25rem)`, 1.08): the site hero only.
- **Headline** (700, `clamp(2rem, 5vw + 1rem, 3.75rem)`, 1.15): section headings.
- **Title** (700, `clamp(1.25rem, 2vw + 0.9rem, 1.875rem)`, 1.25): card and sub-section titles.
- **Body** (400, `clamp(0.95rem, 1.5vw + 0.7rem, 1.125rem)`, 1.65): paragraphs, `text-wrap: pretty`, around 65–75ch.
- **Label** (600, 0.75rem, 0.08em tracking): mono chrome — Latin handles, counters, status. Never Hebrew prose.
- **Slide cover** (condensed 900, starts at 0.1 × canvas width, 1.08): the loudest type in any deck.
- **Slide title** (condensed 800, starts at 0.062W, 0.048W on code-heavy slides, 1.12).
- **Slide body** (Assistant 400, 0.038W → 0.022W auto-fit, 1.6).
- **Slide note** (Playpen 600, 0.04W → 0.026W, ≤ 2 lines, tilted −1° to −3°).

### Named Rules
**The Condensed Voice Rule.** Every Hebrew headline on a slide is set in the condensed headline role (`setHeadline`); Rubik is the fallback, not an alternative. Numerals, slash commands and quote glyphs keep the regular display face.

**The Balanced Headline Rule.** A headline is auto-fitted for size, then re-broken at the same line count with even line lengths (`wrapRtlBalanced`; on the web, `text-wrap: balance`). No headline ends on a stranded stub.

**The No Widow Rule.** A paragraph never ends on a single word alone: `wrapRtl` pulls the previous line's last word down whenever that keeps the line count (web: `text-wrap: pretty`). Every slide renderer wraps through it.

**The One Hand Rule.** The handwriting face appears only in margin notes. Never for a headline, body or button.

## Layout

The site is a single fluid column with generous section spacing, a fluid `clamp()` type scale instead of breakpoint jumps, and a hard horizontal lock (`overflow-x: clip`). Mobile is first-class: `100dvh` not `100vh`, no section-level `position: sticky` or GSAP pinning (they break in Instagram/Facebook webviews), horizontal rails use native `overflow-x: auto` with `touch-action: pan-x`. All text is right-aligned RTL.

Slides are laid out in proportion to canvas width (`metricsFor(W)`), so a 1080×1350 carousel slide and a 1080×1920 reel frame have the same optical margins: outer pad 0.085W, block gap 0.028W, card padding 0.038W. Chrome bar at the top, progress rail and brand badge at the bottom; content region between. A slide that carries a note reserves a 0.15W band at the bottom of the content region **before** layout, so copy auto-fits above it and the note can never overlap text.

## Elevation & Depth

Depth is tonal first: carbon steps (950 → 900 → 800) separate ground, card and raised panel, with a 1px hairline (`rgba(255,255,255,0.08)`) and a top-edge highlight on cards. Shadows are deep and soft, used for modal/overlay lift (`0 30px 80px rgba(0,0,0,0.9)`). Green glows are reserved for live and selected state. On slides, depth comes from ambient radial glows in the slide's accent behind the content and from glass cards (`rgba(255,255,255,0.05)` fill, `0.10` line).

### Named Rules
**The Glow Means Live Rule.** A green glow says "active, selected or live". It is never decoration on a static element.

## Shapes

Soft, consistent rounding: pills (`rounded-full`) for buttons, chips and status badges; 1rem cards; 1.5rem hero panels. Slides use width-relative radii (0.018W–0.03W). Terminal frames carry window dots, a label and a copy glyph. Hand-drawn marks (underline, circle, arrow, marker swipe) are the one irregular shape language — seeded jitter, so the same slide renders the same stroke on every export.

## Components

### Buttons
Confident pills, one per decision.
- **Shape:** fully rounded (9999px), bold, `px-6 py-3`.
- **Primary:** Workbench Green fill with near-black text; hover lightens to `brand-green-light`.
- **Glass / Ghost:** carbon or transparent with a 15% white hairline; hover tints the border green.
- **Focus:** 2px `brand-green-light` ring at 60%. Disabled: 50% opacity.
- The site hero carries exactly one primary button.

### Cards / Containers
- **Dashboard `.dash-card`:** carbon-900 with a faint top-down light gradient, 1px white/8% border, 1rem radius, masked top-edge highlight.
- **Slide glass card:** translucent white fill and hairline over the slate, radius 0.03W, padding 0.038W; a short paragraph card still claims ≥ 50% of the space it is given so a slide never looks unfinished.

### Terminal frame (signature)
The container for code and prompts on slides: dark fill `rgba(11,13,18,0.92)`, title bar with window dots, language label, copy glyph. Code is syntax-highlighted per token and never passes through the Hebrew sanitizer. A Hebrew prompt inside it is set in the body face, not mono.

### Handwritten note (signature)
The personal mark of the system. A ≤ 6-word Hebrew aside (`TechTipSlide.note`) in Playpen Sans Hebrew, in the slide's accent colour, tilted a couple of degrees, balanced over at most two lines, in the bottom-left margin, with a doodle arrow curving up and right into the content it annotates. At most three per deck, never on the cover or closing card, never on consecutive slides (`capDeckNotes`). It points at what is on the slide; it never adds a fact, a number or a claimed personal result.

### Hand-drawn marks
`scribbleUnderline` under a cover's closing line, `markerHighlight` behind the last line of alternating titles, `scribbleCircle` around a step number, `doodleArrow` toward a prompt card or from a note. One mark per slide.

### Navigation
Dashboard: a tab rail of pills, active tab in green with a glow. Site: a compact RTL header with a single emphasized action; the news ticker sits above it.

## Do's and Don'ts

### Do:
- **Do** set every Hebrew slide headline with `setHeadline` (condensed 800/900) and re-break it with `wrapRtlBalanced` after auto-fit.
- **Do** wrap every Hebrew paragraph through `wrapRtl` so widow control applies, and run Hebrew through `sanitizeHebrewText` before measuring.
- **Do** make the closing line of a multi-line headline the accent colour, unless a marker swipe already sits under it.
- **Do** warm every new face/weight in `ensureDeckFonts()` before the first slide is drawn.
- **Do** reserve layout space for a note before laying out the content.
- **Do** keep Latin product names, menu labels and handles Latin (LTR runs inside RTL lines).

### Don't:
- **Don't** fill text with a gradient.
- **Don't** set Hebrew prose in JetBrains Mono or Orbitron; those faces have no Hebrew.
- **Don't** use the handwriting face outside margin notes, or put a note on more than three slides.
- **Don't** paint a URL, "link in bio" or "comment X" onto a slide; the link lives in the caption.
- **Don't** put a stock photo behind a prompt, code or workflow slide.
- **Don't** add a light theme to the site or dashboard; they are dark-only by decision.
- **Don't** invent numbers, clients or results in any visual, including a handwritten note.
