---
name: mrdaniel.co.il
description: Hebrew-first AI hub — the public site is a live field of real AI headlines typed into order; the dashboard and generated slide decks are the annotated workbench behind it
colors:
  brand-green: "#76B900"
  brand-green-light: "#8FD400"
  brand-green-pale: "#9FE870"
  brand-green-deep: "#5C9200"
  field-ink-hi: "#C8F46E"
  ground: "#0A0B09"
  ink-paper: "#E6ECDD"
  ink-paper-muted: "#B2BCA5"
  ink-paper-faint: "#8A957D"
  rule: "rgba(143, 212, 0, 0.3)"
  hand-ink: "#EFE6CF"
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
  site-display:
    fontFamily: "'Noto Sans Hebrew', Rubik, Heebo, sans-serif"
    fontSize: "min(clamp(6.6rem, 1.6rem + 10vw, 11rem), 17.5vh)"
    fontWeight: 900
    lineHeight: 0.98
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 75"
  site-lead:
    fontFamily: "'Rubik Lines', 'Noto Sans Hebrew', Rubik, Heebo, sans-serif"
    fontSize: "clamp(1.55rem, 0.95rem + 1.7vw, 2.55rem)"
    fontWeight: 400
    lineHeight: 1.22
    letterSpacing: "0"
  site-headline:
    fontFamily: "'Rubik Lines', 'Noto Sans Hebrew', Rubik, Heebo, sans-serif"
    fontSize: "clamp(2rem, 1rem + 2.6vw, 3.5rem)"
    fontWeight: 400
    lineHeight: 1.14
    letterSpacing: "0"
  site-title:
    fontFamily: "'Noto Sans Hebrew', Rubik, Heebo, sans-serif"
    fontSize: "clamp(1.6rem, 1.15rem + 1.3vw, 2.3rem)"
    fontWeight: 900
    lineHeight: 1.1
    fontVariation: "'wdth' 75"
  site-body:
    fontFamily: "Heebo, 'Segoe UI', Arial, sans-serif"
    fontSize: "clamp(1.05rem, 0.98rem + 0.35vw, 1.22rem)"
    fontWeight: 400
    lineHeight: 1.75
  site-machine:
    fontFamily: "Cousine, 'Courier New', Heebo, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  site-button:
    fontFamily: "Cousine, 'Courier New', Heebo, monospace"
    fontSize: "1rem"
    fontWeight: 700
    letterSpacing: "0.01em"
  site-hand:
    fontFamily: "'Playpen Sans Hebrew', Heebo, cursive"
    fontSize: "clamp(1.15rem, 0.9rem + 0.7vw, 1.5rem)"
    fontWeight: 600
    lineHeight: 1.3
  workbench-display:
    fontFamily: "Rubik, Heebo, 'Segoe UI', sans-serif"
    fontSize: "clamp(2.1rem, 6vw + 1rem, 5.25rem)"
    fontWeight: 700
    lineHeight: 1.08
  workbench-headline:
    fontFamily: "Rubik, Heebo, 'Segoe UI', sans-serif"
    fontSize: "clamp(2rem, 5vw + 1rem, 3.75rem)"
    fontWeight: 700
    lineHeight: 1.15
  workbench-title:
    fontFamily: "Rubik, Heebo, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.25rem, 2vw + 0.9rem, 1.875rem)"
    fontWeight: 700
    lineHeight: 1.25
  workbench-body:
    fontFamily: "Heebo, 'Segoe UI', Arial, sans-serif"
    fontSize: "clamp(0.95rem, 1.5vw + 0.7rem, 1.125rem)"
    fontWeight: 400
    lineHeight: 1.65
  workbench-label:
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
  none: "0px"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  full: "9999px"
spacing:
  site-gutter: "clamp(1rem, 4vw, 3rem)"
  site-container: "1760px"
  site-beat: "clamp(6rem, 15vh, 11rem)"
  site-beat-last: "clamp(7rem, 20vh, 14rem)"
  site-measure: "34rem"
  slide-pad: "0.085W"
  slide-gap: "0.028W"
  slide-card-pad: "0.038W"
components:
  glyph-button-primary:
    backgroundColor: "{colors.brand-green}"
    textColor: "{colors.ground}"
    typography: "{typography.site-button}"
    rounded: "{rounded.none}"
    padding: "0 1.6rem"
    height: "3.25rem"
  glyph-button-primary-hover:
    backgroundColor: "{colors.brand-green-light}"
  glyph-button-line:
    textColor: "{colors.brand-green-light}"
    typography: "{typography.site-button}"
    rounded: "{rounded.none}"
    padding: "0 1.6rem"
    height: "3.25rem"
  glyph-button-line-hover:
    backgroundColor: "{colors.brand-green-light}"
    textColor: "{colors.ground}"
  glyph-frame:
    backgroundColor: "{colors.ground}"
    rounded: "{rounded.none}"
  story-link:
    textColor: "{colors.brand-green-light}"
    typography: "{typography.site-machine}"
  story-link-hover:
    textColor: "{colors.field-ink-hi}"
  hand-note:
    textColor: "{colors.hand-ink}"
    typography: "{typography.site-hand}"
  dash-button-primary:
    backgroundColor: "{colors.brand-green}"
    textColor: "{colors.carbon-950}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
  dash-button-primary-hover:
    backgroundColor: "{colors.brand-green-light}"
  dash-card:
    backgroundColor: "{colors.carbon-900}"
    rounded: "{rounded.lg}"
  slide-glass-card:
    rounded: "0.03W"
    padding: "{spacing.slide-card-pad}"
---

# Design System: mrdaniel.co.il

## Overview

**Creative North Star: "The Sorted Noise"**

The public site is the AI world as a learner actually meets it: a full-bleed wall of real words, and one person typing it into a readable page. Behind every page runs a live WebGL2 field rendered as typewriter characters; its brightest cells are letters taken from the week's real AI headlines and tool names, its tone is made by glyph density (blank → `.` → `:` → `-` → `=` → `+` → `*`), and it is drawn in a single green ink on warm carbon. Over it, the page speaks in two voices: the machine in monospace (the field, captions, labels, jargon terms, buttons) and people in proportional Hebrew (Heebo for prose, a condensed poster face for the glyph-built promise and titles), while every main headline carries the site's one terminal voice, Rubik Lines. As the visitor scrolls, the field calms and sorts; under the pointer it stops and becomes readable words; a click ripples through it. One handwritten note, never more than two per page, speaks over the machine grid.

The system spans three surfaces. The **public site** (`src/`) is The Sorted Noise; its homepage hero and story beats (`Hero`, `NoiseBeat`, `OrderBeat`, `PathBeat`, `StartBeat`), the shared `GlyphButton`, the header, the cookie notice and the background field are built in it. The **operator dashboard** (`dashboard/`) and the **canvas-rendered carousels and 9:16 videos** (`dashboard/src/lib/*Renderer.ts`, `designAssets.ts`) remain **"The Annotated Workbench"**: dark carbon, one green signal, real tools on the table, a person's handwriting in the margin. The two share the green hue, condensed Noto Sans Hebrew headlines, the Playpen hand and the no-invented-facts stance, so they read as one product.

**Known gap.** Since 2026-10-06 the lower homepage sections (the three pillars, today's AI words, the process line, the services catalogue), the inner-page primitives (`ContentPrimitives`: page hero, section heading, frames, CTA), the cookie notice, the footer and the 404 page are in The Sorted Noise too; since 2026-10-07 so are the header and the /jarvis page. Still pending: the AI page's agent cards and the magazines hero. Their old neon/glass/pill look is not current site guidance; the harmony layer (below) keeps them in step until they move.

**Key Characteristics:**
- One green ink on warm carbon (`ground`); tone made by glyph density, not by gradients or glow.
- The background is made of real words — live AI headlines and tool names — never `$`/`@` ASCII art and never generic AI imagery.
- Two type voices: monospace Cousine for the machine, proportional Hebrew (Noto Sans Hebrew condensed 900 + Heebo) for people; every h1/h2 in Rubik Lines.
- Sharp geometry: square-cornered buttons with corner registration ticks, dotted hairline frames, no pills.
- Physics-based motion: springs for every meaningful move; the few CSS animations are stepped like a typewriter.
- Hebrew-first, RTL everywhere; Latin product names stay Latin and correctly ordered inside RTL lines.

## Colors

Site: one green ink on warm carbon, with a green-tinted paper ramp for text. Dashboard and slides: one green signal on cool carbon.

### Primary
- **Field Green** (`brand-green-light`): the site's ink. The glyph field, the glyph-built hero accent line, links, carets, button outlines and corner ticks, the hover fill of buttons. On the dashboard and slides the same value is the hover/highlight step of Workbench Green.
- **Workbench Green** (`brand-green`): fills — the primary button at rest on the site; the signal (primary buttons, live state, active tabs, the accent line of a slide headline) on the dashboard and slides. `brand-green-pale` and `brand-green-deep` are dashboard/slide highlight and pressed/on-light steps.
- **Lit Glyph** (`field-ink-hi`): the brightest letters in the field, link hover, and the 2px focus outline on site controls.
- **Live Glow** (`signal-glow`): dashboard only, as light (a halo on a live dot), never as a text or fill colour.

### Secondary
- **Neon Cyan** (`neon-cyan`) and **Electric Blue** (`electric-blue`): dashboard data callouts and the cyan deck theme only. Not part of the site.

### Tertiary
- **Terracotta** (`terracotta`) on **Cream Paper** (`cream-paper`) with **Warm Ink** (`cream-ink`): the study-notes slide family only. Per-tool accents (`TOOL_STYLE` in `designAssets.ts`) tint a slide that is about that tool.
- **Hand Ink** (`hand-ink`): a warm paper white for the site's handwritten note, so the one human voice is visibly not the machine's green.

### Neutral
- **Warm Carbon** (`ground`): the site ground and the field's background; frames sit on it at 78% so the field shows faintly through.
- **Paper Ink ramp** (`ink-paper` → `ink-paper-muted` → `ink-paper-faint`): site text, tinted from the green hue rather than grey. Paper for headlines and the hero sub, muted for prose, faint for captions, metadata and inactive steps. Contrast on `ground` is about 16:1, 10:1 and 6.3:1.
- **Dotted Rule** (`rule`): every site frame, divider, leader and tread is a 1px dotted line in this colour.
- **Carbon 950–600** and **Ink** (`ink-bright` → `ink-faint`): the dashboard's ground, surface ramp and text ramp. **Slide Slate** (`slide-slate`) is the slide ground.

### Named Rules
**The One Ink Rule.** The site has one hue. Green is ink and fill; there is no secondary site accent, no cyan, no neon glow. Emphasis comes from density, weight and size.

**The One Signal Rule.** On the dashboard and slides, green marks what is live, chosen or important. A slide carries at most one accent-coloured headline line, one marker swipe or one note.

**The Solid Ink Rule.** Text is set in solid colour. No gradient fills across glyphs, on any surface.

**The Real Words Rule.** Every glyph that reads as a word in the field comes from a real headline or a real tool name. Nothing in the background is an invented slogan.

## Typography

**Site headlines (every h1/h2, site-wide, since 2026-10-01):** Rubik Lines 400 — terminal-style scanline letters, Hebrew and Latin, echoing the logo's inline linework (with condensed Noto Sans Hebrew, then Rubik)
**Site display (the glyph-built hero line) and titles:** Noto Sans Hebrew, condensed (`wdth` 75), 900 (with Rubik, then Heebo)
**Site prose:** Heebo
**Site machine voice:** Cousine, 700 for buttons and terms (with Courier New, then Heebo)
**Handwritten notes (site and slides):** Playpen Sans Hebrew 600
**Dashboard display / body / labels:** Rubik / Heebo / JetBrains Mono
**Slide headline / body / code:** Noto Sans Hebrew condensed 800–900 / Assistant / JetBrains Mono

**Character:** on the site, scanline headlines give every page its terminal voice, a tall condensed poster face carries the glyph-built promise and the titles, and a typewriter mono speaks for the machine; Heebo keeps the prose plain and eye-to-eye. On slides the same condensed face sets every headline, Assistant carries the body, and the Playpen hand supplies the one human aside.

### Hierarchy
- **Site display** (900 condensed, `min(clamp(6.6rem, 1.6rem + 10vw, 11rem), 17.5vh)`, 0.98, nowrap): the hero's promise line only. Built out of glyphs by the field where each letter gets at least 9 glyph rows (two lines from `sm` up, three on phones); solid Field Green otherwise. A ring mark of Latin capitals (below) needs only 7 rows, a dot-matrix display's height.
- **Site lead** (Rubik Lines 400, `clamp(1.55rem, 0.95rem + 1.7vw, 2.55rem)`, 1.22, max 22ch): the hero's first line, in paper ink.
- **Site headline** (Rubik Lines 400, `clamp(2rem, 1rem + 2.6vw, 3.5rem)`, 1.14, balanced): every section heading on every page. A global unlayered `h1, h2` rule applies the face, so it beats `font-display` / `font-black` utilities; `.headline-plain` opts a long informational title back into the condensed display face.
- **Site title** (900 condensed, `clamp(1.6rem, 1.15rem + 1.3vw, 2.3rem)`, 1.1): stair steps and card titles.
- **Site body** (Heebo 400, `clamp(1.05rem, 0.98rem + 0.35vw, 1.22rem)`, 1.75, `text-wrap: pretty`, max 34rem).
- **Site block heading** (Heebo 700, 0.95rem, 1.4, muted): the heading of a panel inside a beat.
- **Site machine** (Cousine, 12–14px): captions, metadata, file names, model names, links; jargon terms at 700, 1rem.
- **Hand** (Playpen 600, `clamp(1.15rem, 0.9rem + 0.7vw, 1.5rem)`, 1.3, max 14ch, tilted about −2.5° to 2°).
- **Slide cover** (condensed 900, from 0.1W, 1.08); **slide title** (condensed 800, from 0.062W, 0.048W on code-heavy slides, 1.12); **slide body** (Assistant 400, 0.038W → 0.022W auto-fit, 1.6); **slide note** (Playpen 600, 0.04W → 0.026W, ≤ 2 lines, −1° to −3°).
- **Dashboard** keeps the Rubik/Heebo `clamp()` scale in the `workbench-*` tokens and JetBrains Mono labels for Latin chrome.

### Named Rules
**The Headline Voice Rule.** Every main headline (h1, h2) on the site is set in Rubik Lines — the one terminal-style face, Hebrew and Latin alike. Never fake it with a monospace or a glitch effect on another face; never set prose in it.

**The Two Voices Rule.** The machine speaks monospace; people speak proportional Hebrew. Hebrew paragraphs are never set in Cousine: a monospace cell gives י ו ן a full-width slot and the words fall apart. Cousine carries the machine's short lines only: captions, metadata, terms, links and button labels.

**The Condensed Voice Rule.** Every Hebrew headline, on the site and on every slide, is set in condensed Noto Sans Hebrew (`font-stretch: 75%`; on canvas, `setHeadline` with the stretch in the `font` shorthand). Rubik is the fallback, not an alternative.

**The Balanced Headline Rule.** A headline is auto-fitted for size, then re-broken at the same line count with even line lengths (`wrapRtlBalanced`; on the web, `text-wrap: balance`). No headline ends on a stranded stub.

**The No Widow Rule.** A paragraph never ends on a single word alone: `wrapRtl` on canvas, `text-wrap: pretty` on the web.

**The One Hand Rule.** The handwriting face appears only in margin notes. Never for a headline, body or button. On the site, at most two notes per page.

## Layout

**Site.** A fixed, full-viewport glyph field (`100lvh`, so the mobile URL bar never resizes it) sits behind a wide container (max 1760px, gutter `clamp(1rem, 4vw, 3rem)`) on a 12-column grid from `lg`. The hero is `100dvh` (minus the ticker from `md`): the human column takes the right ~7/12 (RTL start), the left side is left open for the noise and the pointer lens, and a dotted-rule mono caption sits at the hero's foot. Story beats breathe on `clamp(6rem, 15vh, 11rem)` vertical padding and set prose at a 34rem measure. Order is shown by layout, not numbers: the path is a staircase whose steps indent one tread further each (1.1rem per step on phones, `min(6vw, 5.5rem)` from `md`). Field cells are 7×12 CSS px from 768px up and 5×9 below. The field steps back (goes quiet) behind every text block it would otherwise run through, and behind the header row. The header is fixed, not sticky, and glued under the desktop news ticker, so the ticker scrolls away and only the header row stays. Mobile: no section-level sticky or pinning (they break in Instagram/Facebook webviews), `100dvh` not `100vh`, the hero button is never full-width so it clears the floating accessibility button, and the hero hand note is desktop-only.

**Dashboard.** A dense single-page operator tool: a tab rail, `.dash-card` panels, everything right-aligned RTL.

**Slides.** Laid out in proportion to canvas width (`metricsFor(W)`), so a 1080×1350 carousel and a 1080×1920 reel frame share optical margins: outer pad 0.085W, block gap 0.028W, card padding 0.038W. Chrome bar on top, progress rail and brand badge at the bottom. A slide carrying a note reserves a 0.15W band at the bottom of the content region **before** layout.

## Elevation & Depth

The site is flat. Depth comes from parallax and the field, not from shadows: text blocks drift at different spring-smoothed speeds (`Depth`, 0.04–0.34), the field sits at the back, and frames lift off it only by a denser ground (`ground` at 78%) inside a dotted rule. There are no shadows and no glows on site elements; the line button's 1px outline is drawn as an inset box-shadow, which is a stroke, not elevation.

The dashboard is tonal: carbon steps (950 → 900 → 800) separate ground, card and raised panel, with a 1px white/8% hairline; modals lift on `0 30px 80px rgba(0,0,0,0.9)`. Slides take depth from ambient radial glows in the slide's accent and from glass cards.

### Named Rules
**The Density Not Glow Rule.** On the site, brightness is made by more and brighter glyphs, never by blur, glow or bloom.

**The Glow Means Live Rule.** On the dashboard, a green glow says "active, selected or live". It is never decoration on a static element.

## Shapes

Site: sharp. Every control and frame has square corners (0px). Frames are 1px dotted hairlines; dividers, leaders between a term and its meaning, and stair treads are the same dotted rule. Buttons carry four 7px registration ticks just outside their corners. Carets are solid green blocks (7–8px wide) that blink in steps. The hand-drawn arrow is the one curved, irregular stroke.

Dashboard: soft rounding, pills (9999px) for buttons, chips and the tab rail, 1rem cards. Slides: width-relative radii (0.018W–0.03W); terminal frames with window dots; hand-drawn marks with seeded jitter so the same slide renders the same stroke on every export.

## Components

### Buttons (site: GlyphButton)
A sharp rectangle that fills with type.
- **Shape:** square corners (0px), min-height 3.25rem, `0 1.6rem` padding, Cousine 700 1rem; four registration ticks at the corners.
- **Primary:** Workbench Green fill under a tile of real Hebrew letters and density marks (`--glyph-tex`, generated once in Cousine), ground-coloured label. Hover: fill lightens to Field Green and the texture types across in 7 steps; ticks spring 5px outward.
- **Line:** transparent with a 1px Field Green outline and green label; on hover a Field Green fill springs in from the right (the reading start) and the label turns ground-coloured.
- **Press:** sinks 2px on a stiff spring and sends a ripple through the glyph field from the pointer (from the centre on keyboard activation).
- **Focus:** 2px `field-ink-hi` outline, 5px offset.
- **Sizes:** compact (min-height 2.6rem, `0 1rem`, 0.875rem) for the header action; mini (min-height 2.25rem, `0 0.95rem`, 0.875rem) for approval buttons inside a conversation turn.
- Exactly one primary button per decision; the hero's never runs full width.

### Links (site)
Cousine 700 in Field Green, dotted underline 6px below; hover goes to Lit Glyph with a solid underline.

### Frames (site: glyph-frame)
Dotted rule, `ground` at 78%, square corners, no padding of its own; rows inside are split by dotted dividers. Used for the headline log, the jargon decoder, the guide file card and the cookie notice.

### The crew (signature, since 2026-10-06)
The Grok Bot deck's characters live on the site too (`src/components/bots/SiteBot.tsx`, outlines in `botShapes.ts`, ported from `public/grok-deck/js/bots.js`): a geometric head (circle, triangle, square, diamond, flower, star, heart...) in one of the five greens, two slanted dark eyes with a glint, the letter skin, and a `.:-=-:.` shadow. One bot hosts each section or page, standing in the open side of the grid; `BotCrew` lines up five of them (the Grok section, the /grok hero, the footer).
- **Alive, cheaply:** a slow breath on the HTML wrapper (composited, paused off screen); blinks from one shared timer, only for the 150 ms of a blink; the eyes follow a mouse pointer (one shared listener writing two CSS variables per visible bot), and on touch they look the way the page scrolls; a hop with squash and stretch when the bot first comes into view and when tapped.
- **Moods** are eye shapes only: idle, happy (closed arcs), focus, sleepy, surprised, sad. No mouths, no speech bubbles, no sound on the site (sound belongs to the deck).
- **Never** more than one bot per section (a crew row counts as one), never in front of text, and under reduced motion they stand still with their eyes open.

### Glyph field (signature)
A two-pass WebGL2 renderer: a per-cell scene pass, then a per-pixel glyph pass from an atlas of Hebrew, Latin, digits and a little punctuation. Ink `brand-green-light`, highlights `field-ink-hi`, ground `ground`. The story drives five sprung parameters (chaos, order, calm, lens, dim); the pointer is a lens that calms the noise into readable words; clicks ripple. It fades in over 1.2s once the page is idle and is never needed to read anything.

### The glyph-ring mark and the headline handoff (signature, since 2026-10-07)
A short Latin mark inside a ring (the J.A.R.V.I.S mark on /jarvis, `data-glyph-ring`): the field draws the ring into its mask first, then clears the band the name runs through, so the ring breaks where the name crosses it. The ring is a true circle (a mark, not a control). Masks are drawn in the element's own CSS direction, so an LTR mark keeps its punctuation at the right end.
- **One mark at a time.** The field draws a single headline; a page may hand it from one element to another (/jarvis hands it from the hero mark to the parts-sheet ring while that ring is at least 35% on screen). The new element assembles out of the noise again; only the element being drawn carries `data-glyph-live` and goes transparent, the other keeps its solid look.
- **Solid fallback.** Where the letters would get fewer than 7 glyph rows (a 1x screen in a narrow or short window, the mark shrinks below 860px of height to keep the hero exchange in the first screen), and under reduced motion where the field does not mount, the mark is solid Field Green in a CSS ring broken the same way. It is a finished look, not a loading state.

### Conversation (since 2026-10-07)
A page told as an exchange (/jarvis): a dotted frame with a Cousine bar that labels the exchange as an example (`דוגמה`), because it is an illustration, not a transcript. Request turns sit on the reading start behind a dotted rule, tagged `אתם`; the other side's turns are indented on phones and stand on the far side from 768px, tagged in Cousine (green for the agent). Completed steps are drawn check lines in Field Green, and the exchange ends on a blinking block caret. A turn that asks for approval carries miniature GlyphButtons (one primary, one line). No bubbles. An FAQ in this pattern makes the questions request turns inside disclosure buttons; an answer is tagged with whoever actually speaks it (on /jarvis, `דניאל`).

### Jargon decoder
Rows of `term` (Cousine 700, faint, green on hover) → dotted leader → plain-Hebrew meaning (Heebo 500, paper). Stacks on phones; the leader appears from `md`.

### Stairs
The path, typed one indent further per step with a dotted start border and tread. A blinking block caret marks the step on the reading line and springs to the next as the visitor scrolls. No step numbers.

### Handwritten note (signature, site and slides)
A short Hebrew aside in Playpen Sans Hebrew with a doodle arrow that draws itself in on a soft spring. On the site it is `hand-ink`, tilted a couple of degrees, and the field goes quiet behind it while the arrow stays out in the noise it points at. On slides (`TechTipSlide.note`) it is ≤ 6 words in the slide's accent, in the bottom-left margin, at most three per deck, never on the cover, closing card or consecutive slides (`capDeckNotes`). It comments on what is there; it never adds a fact, a number or a claimed result.

### Dashboard card and buttons
`.dash-card`: carbon-900 with a faint top-down light gradient, 1px white/8% border, 1rem radius. Dashboard buttons stay Workbench Green pills (`px-6 py-3`); a tab rail of pills with the active tab in green.

### Terminal frame (slides)
Dark fill `rgba(11,13,18,0.92)`, title bar with window dots, language label, copy glyph. Code is syntax-highlighted per token and never passes through the Hebrew sanitizer; a Hebrew prompt inside is set in the body face.

### Hand-drawn marks (slides)
`scribbleUnderline`, `markerHighlight`, `scribbleCircle`, `doodleArrow`. One mark per slide.

### Navigation (site: Header, since 2026-10-07)
One line of chrome over the field, which goes quiet behind it.
- **States:** transparent at the top of a page; once scrolled, a carbon bar (`ground` at 90%) with a dotted bottom rule and a shorter row. It steps away while the visitor reads down and returns on the first scroll up, never while its menu or panel is open or a keyboard focus is inside it.
- **Top level:** the logo, the six section links (Heebo 500, muted; paper on hover; the current page in Field Green), a search prompt (a dotted field with a Cousine `Ctrl K` / `⌘K` hint) that opens the command palette, and one action: a compact line GlyphButton, `סוכן התאמה אישי`, shortened to `סוכן התאמה` on narrower bars.
- **The cursor:** a 2px Field Green bar under the links springs to the hovered or focused link and rests under the current page.
- **More panel:** everything else (random page, terminal mode, Instagram/LinkedIn/mail) sits one click away behind a square icon button, in a dotted frame of rows with drawn icons and Cousine hints. Keeping the row to what a visitor reaches for is the point.
- **Phones and tablets (below 1024px):** a full-screen menu portalled to `<body>` (a dialog): the sections in the condensed poster face at the site-headline size on dotted treads, the current page in green with a blinking block caret, a search row, the action as a full-width primary GlyphButton, two dotted utility buttons, social icons and one crew bot.
- **Reading progress:** a 2px green bar at the very top that fills from the right, the reading start.

Dashboard: the pill tab rail.

## Motion (site)

- **Desktop scene layer** (`src/lib/sceneMotion.ts`, GSAP + ScrollTrigger + SplitText, mounted per route): section h2s rise line by line out of a mask (`expo.out`, 1.15s, stagger 0.09, once); each top-level section's content tilts up out of depth on entry (y 110 → 0, rotateX 7° → 0, opacity 0.2 → 1, `scrub: 1`), and the outgoing section recedes (y −56, scale 0.965, opacity 0.32, `scrub: 1`); scroll velocity bends sections (`skewY`, clamped ±2.2°, `quickTo` 0.55s) and they spring back at rest. Desktop with a fine pointer and no reduced-motion preference only; nothing pins.
- **Field** reacts to scroll: the noise lives on a 0.3× parallax layer and fast scrolling shoves each row of words sideways by its own amount.
- **Element physics** stay in motion/react springs: button press/hover, depth layers (`Depth`), the stair caret, the title rule drawing out.
- **Live layer, every device** (`src/lib/liveLayer.ts`, 2026-10-06): elements opt in with `data-live` (`rise`, `wipe` and `frame` revealed right to left through a moving mask edge, `stagger` for lists, `decode` for short machine labels); on phones every section h2 rises too. IntersectionObserver and CSS transitions only, set up before paint, nothing pinned or scrubbed, so it is safe in Instagram/Facebook webviews. Never put a clip-path on an observed element: Chrome reports a fully clipped element as not intersecting, so it would never arrive.
- **Mobile / webviews:** native scroll, `Depth` parallax and the live layer; no scrubbed or pinned scenes.

## Site-wide harmony layer

`src/index.css` ends with an unlayered SITE-WIDE HARMONY block that maps every pre-redesign primitive into this world so older pages need no rewrite: radius tokens are 0 (and `.rounded-full` is mapped to 0, `.keep-round` is the escape hatch for a true non-control circle), `.glass-panel*` become dotted-hairline frames with no blur or glow, `.neon-text` is solid Field Green, `.text-pop` loses its bloom, status chips use a square caret, and the retired cyan tokens alias to greens. `WebButton` renders `GlyphButton`.

## Do's and Don'ts

### Do:
- **Do** build new site surfaces on the glyph field, in one green ink on `ground`, with dotted-rule frames and square corners.
- **Do** set site headlines in condensed Noto Sans Hebrew 900 and site prose in Heebo; keep Cousine for captions, labels, terms, links and buttons.
- **Do** use `GlyphButton` for every site action, and only one primary per decision.
- **Do** move things on springs (motion/react, or the field's own spring step); keep CSS animation stepped (`steps()`), like a caret or typing.
- **Do** show order through layout (indents, position, a caret), not numbers.
- **Do** let the field go quiet behind any text it would cross (`useFieldQuiet`).
- **Do** set every Hebrew slide headline with `setHeadline` (condensed 800/900) and re-break it with `wrapRtlBalanced` after auto-fit.
- **Do** wrap every Hebrew paragraph through `wrapRtl` on canvas, and run Hebrew through `sanitizeHebrewText` before measuring.
- **Do** make the closing line of a multi-line slide headline the accent colour, unless a marker swipe already sits under it.
- **Do** warm every new face/weight in `ensureDeckFonts()` (slides) or `index.html`'s font link (site) before it is first drawn.
- **Do** reserve layout space for a slide note before laying out the content.
- **Do** keep Latin product names, menu labels and handles Latin (LTR runs inside RTL lines).

### Don't:
- **Don't** use pill or rounded buttons on the site; site controls are square-cornered (0px).
- **Don't** use generic AI imagery on the site: no brains, node graphs, circuit glows or sparkles.
- **Don't** number sections or steps 01/02/03, or wrap them in brackets.
- **Don't** add invented metrics or status chrome ("SIGNAL 87%", fake uptime, fake counts); show a real count or nothing.
- **Don't** add a second site accent (cyan, blue, neon) or glow decoration to the site.
- **Don't** set Hebrew paragraphs in a monospace face (Cousine, JetBrains Mono, Orbitron).
- **Don't** draw ASCII art from `$`/`@` symbols; the field's letters are real words.
- **Don't** fill text with a gradient.
- **Don't** use the handwriting face outside margin notes, put more than two notes on a site page, or put a note on more than three slides.
- **Don't** paint a URL, "link in bio" or "comment X" onto a slide; the link lives in the caption.
- **Don't** put a stock photo behind a prompt, code or workflow slide.
- **Don't** add a light theme to the site or dashboard; they are dark-only by decision.
- **Don't** invent numbers, clients or results in any visual, including a handwritten note.
- **Don't** treat the legacy neon/glass/pill sections (the AI page's agent cards, the magazines hero) as site guidance; they are pending migration.
