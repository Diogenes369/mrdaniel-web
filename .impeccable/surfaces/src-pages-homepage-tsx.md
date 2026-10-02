---
version: 1
slug: "src-pages-homepage-tsx"
primary_target: "src/pages/HomePage.tsx"
related_targets: ["src/components/Hero.tsx"]
---

# Homepage (`/`) — surface brief

**Mode:** Persuade. **Audience (decided 2026-10-01):** people learning AI come first — beginners,
career-changers, the overwhelmed. Agent-building for clients stays on the page as a secondary
offer, further down. **Job:** recognise their own overwhelm, trust that one real person will walk
them through it in plain Hebrew, and start. **Action:** the hero's one button scrolls into the story;
the story ends on the free beginner guide (`/g/ai-learning-guide-2026`).
**Constraints from the brief:** no generic AI imagery (brains, node graphs), no 01/02/03 section
numbering, no pill or fully rounded buttons, the ROI / agent-savings slider is removed, physics-based
motion, warm eye-to-eye Hebrew. Mobile webviews: no section-level sticky or pin.

## Direction contract

THESIS: The AI world as the visitor actually experiences it — a shouting wall of real words — and a
person who turns it into a readable page, line by line. Refuses the category default: course-card
grids under a gradient promise, and the "glowing brain" hero.

OWN-WORLD: User-adopted challenger "Live ASCII Render", translated. One green ink (brand-400 glyph
ink, brand-500 fills) over warm carbon, tone made by glyph density (blank → · → : → real letters).
Two type voices (amended after the finish review): the MACHINE speaks monospace — Cousine for the
field, captions, labels, jargon terms, buttons; PEOPLE speak proportional Hebrew — Noto Sans Hebrew
condensed 900 for display (the same face the field rebuilds out of glyphs), Heebo for prose. Hebrew
in a monospace cell splits words apart, which breaks the plain-Hebrew promise. The glyphs are Hebrew letters and
real AI words from the live feed, never `$`/`@` art. Frames are dotted hairlines; buttons are sharp
rectangles that fill with glyph density on hover. Translations, named: no invented status metrics
(the world's "SIGNAL 87%" chrome shows only real counts or nothing); no bracketed numbering; one
human hand (Playpen Sans Hebrew margin note + doodle arrow) speaks over the machine grid.

STORY: It's not you, it's the pace → I filter it for you → the route from understanding to building
like a developer, step by step → start with the free beginner guide.

FIRST VIEWPORT: Full-bleed live glyph field streaming real headlines. Right column (RTL start), ~7/12
wide: lead line "הבינה המלאכותית מתקדמת מהר, אבל אתם לא חייבים להישאר מאחור" in the site headline face (Rubik Lines, since 2026-10-01), accent line "בואו נעשה בה סדר" built from glyphs that assemble
out of the noise — on every screen where the letters get at least 9 glyph rows (two lines from sm
up, three on phones so the letters are big enough to read; solid green where the gate fails:
short laptops, landscape phones, no WebGL), 25-word sub, one sharp primary button at the column's
foot (never full width: it must clear the phone's floating accessibility button). The pointer is a
lens: around it the noise stops and becomes readable words. A handwritten note points into the
noise (desktop only — a phone's first viewport has no free margin). (The caption that stated what the background is made of was removed on 2026-10-02 at the
user's request.) One human hand = one voice: at most two
notes on the page (hero, and the path beat on every screen).

FORM: Challenger adopted by the user (medium-native-ascii-live-scene-render), declined in the roll
in favour of my position-4 grounded candidate; seed key 12abbf4f. Signature interaction: the
cursor-lens and the scroll that sorts the noise into a typed page. Motion grammar: cell-snapped
glyph motion, spring-damped pointer and layers, typing reveals, click ripples through the field.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Open decisions
- The remaining homepage sections (offers, terms, process, services, marquee, contact) still wear the
  old neon/glass look; they move into this world in the next pass.
- PRODUCT.md still names clients as the primary audience; update it to learners-first.
- DESIGN.md (site half) is rewritten from the built world at finish; dashboard/slide rules stay.
