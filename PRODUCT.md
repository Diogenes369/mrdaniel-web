# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary — prospective clients (public site, `mrdaniel.co.il`).** Small-business owners, freelancers and private individuals in Israel who are not technical and are considering hiring Daniel Ben Baruch to build them an AI agent. Their job on the site: understand in plain Hebrew what an agent could do for them, trust that the person behind it is real and competent, and take one step toward talking to him. No enterprises, no corporate buyers.

**Secondary — people learning AI (public site + social).** Beginners, enthusiasts and career-changers who come for AI news, model explanations and free guides. They are also the audience of the generated social content (Instagram / X / Threads carousels and reels). This audience is served, but it does not outrank the client path on the site.

**Operator — Daniel himself (admin dashboard).** A single, authenticated operator running a live-ops tool: turning news, Threads/X/Instagram posts and URLs into Hebrew carousels, reels, subtitled videos and emails, checking analytics and leads. Daily, repetitive, speed-sensitive work, done on desktop against the production API.

## Product Purpose

The public site exists to win agent-building work: it presents Daniel as the person who builds AI agents that do real, repetitive work (answer customers, book meetings, prepare documents) while the client approves. The news feed, model lab and guides demonstrate current, hands-on knowledge and bring in reach. Success = a non-technical visitor understands the offer on first read and makes contact.

The dashboard exists so one person can produce a steady stream of accurate, on-brand Hebrew content without the content ever fully stopping (every generator falls back to a deterministic local builder).

## Positioning

A named individual, not an agency: the visitor talks to Daniel directly. He builds agents that run every day, tries every new model on real tasks and explains it in plain Hebrew. Three pillars, always in this order: (1) building AI agents, (2) the model lab — new models tried and explained, (3) the AI news + practical guides hub.

## Operating Context

- Hebrew-first, RTL, Israeli audience; embedded Latin terms (model and tool names, URLs) must stay correctly ordered inside RTL lines.
- Much traffic arrives on mobile from Instagram / Facebook / X in-app webviews.
- Hero has one call to action (to the agents offer); news lives in the ticker, not a competing button.
- Social output is 1080×1350 carousels and 1080×1920 videos, exported from the dashboard and posted manually.
- Dashboard: desktop, logged-in operator, always against production data.

## Capabilities and Constraints

- Public site routes: `/` (home), `/ai` (plain-language client guide to agents), `/news` + `/news/:slug`, `/magazines` ("לומדים AI", currently a coming-soon page with two free guides), `/g/:guideId` + `/download` (guide PDFs), `/jarvis` (Daniel's Hebrew personal assistant), `/about`, legal pages.
- **AI-only since 2026-09-21.** No cyber / enterprise content anywhere on the site (guarded by `npm run test:copy`).
- News surfaces serve one sanitized stream: Hebrew only, AI / cloud-infra topics only (`/api/news` default).
- Dashboard tabs are production tools: content agents, Carousel Studio, Tech Tips & Motion Studio, Threads / X / Instagram importers, Grok · X studio, growth panel, analytics, leads.
- Free-tier AI providers only (Groq text, Gemini multimodal); the user refuses paid AI usage. Vercel Hobby: 12 serverless functions, daily cron.
- **Undecided:** the guides/magazines section content beyond the two existing PDFs; X write features (locked until developer keys exist).

## Brand Commitments

- Name: Daniel Ben Baruch (דניאל בן ברוך); domain `mrdaniel.co.il` is the only brand on generated output. Handles: @mrdaniel_ai (X), @mrdaniel.ai (Instagram / Linktree).
- **Site voice (clients):** an experienced IT person talking to a client across the table — warm, direct, plain Israeli Hebrew; no buzzwords, no acronyms needing a glossary (LLM, RAG, MCP, "agentic"), no rhetorical questions. "AI" and "סוכן AI" are the only assumed terms. Copy lives in `src/data/siteCopy.ts` and siblings.
- **Generated-content voice (learners):** senior Israeli practitioner explaining to someone entering the field, glossing terms on first use; banned AI-cliché phrases enforced in code (`src/agent/expertVoice.ts`). The two voices differ on purpose; do not align one to the other without asking.
- Never machine-translated; never engagement bait; no links or comment triggers painted onto slides.
- Existing assets: `public/logo.png`, `public/favicon.svg`, `public/og-image.png`.

## Evidence on Hand

- Two free guides: `public/guides/ai-learning-guide-2026.pdf`, `public/guides/ai-business-automations-2026.pdf` (with cover `.webp`s).
- About copy with Daniel's real background (systems administration → AI) in `src/data/siteCopy.ts`.
- JARVIS assistant page and live AI news / model-update feeds.
- **Absent, must not be fabricated:** client testimonials, client counts or logos, case studies, time/money-saved figures, benchmarks, pricing, guarantees. Earlier unsourced figures were deliberately removed.

## Product Principles

1. **One clear next step.** Every public surface leads a non-technical visitor toward talking to Daniel; secondary paths (news, guides) never compete with it.
2. **Plain before clever.** If a first-time visitor needs a glossary, the copy is wrong.
3. **Only true things.** No invented numbers, clients or promises — on the site or in generated content.
4. **A person, not a platform.** Trust comes from Daniel being real, reachable and hands-on.
5. **Content never stops, quality never slips.** Operator tools degrade gracefully but never publish fabricated or broken Hebrew.

## Accessibility & Inclusion

- Public site declares WCAG 2.1 conformance (accessibility statement at `/accessibility`), in line with Israeli accessibility requirements.
- Correct RTL and bidi handling is an accessibility requirement, not polish: mis-ordered Latin runs make Hebrew lines unreadable.
- Must work in Instagram / Facebook in-app webviews on mobile (no section-level sticky / pinned scroll).
