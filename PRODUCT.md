# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary — people learning AI (public site + social), since 2026-10-01 by decision.** Beginners, enthusiasts and career-changers in Israel who want to learn AI but feel overwhelmed by the pace — a new model or tool every week, everyone online claiming it is the best — and do not know whom to trust or where to start. Their job on the site: recognise their own overwhelm, trust that one real person will walk them through it in plain Hebrew, and take the first step (the free beginner guide). They are also the audience of the generated social content (Instagram / X / Threads carousels and reels).

**Secondary — prospective clients (public site).** Small-business owners, freelancers and private individuals who are not technical and are considering hiring Daniel Ben Baruch to build them an AI agent. Served further down the homepage and on `/ai`; it no longer leads the homepage. No enterprises, no corporate buyers.

**Operator — Daniel himself (admin dashboard).** A single, authenticated operator running a live-ops tool: turning news, Threads/X/Instagram posts and URLs into Hebrew carousels, reels, subtitled videos and emails, checking analytics and leads. Daily, repetitive, speed-sensitive work, done on desktop against the production API.

## Product Purpose

The public site exists to put order into the AI mess for people learning it: Daniel tries the new tools and models on real work, drops what does not hold up, and explains what is left in plain Hebrew, step by step — from the first install to building like a developer. The news feed, model lab and guides are that work made visible. Success = a first-time visitor recognises the problem, trusts the person, and starts (downloads the beginner guide or walks the path). Agent-building for clients remains a real, secondary offer.

The dashboard exists so one person can produce a steady stream of accurate, on-brand Hebrew content without the content ever fully stopping (every generator falls back to a deterministic local builder).

## Positioning

A named individual, not an agency or a course platform: one person who cuts through the noise and walks you through it. He tries every new model on real tasks, explains it in plain Hebrew, and builds agents that run every day. The homepage story, in order: it's not you, it's the pace → I filter it for you → the path from understanding to building like a developer → start with the free guide. The three pillars (building AI agents, the model lab, the AI news + guides hub) continue below the story.

## Operating Context

- Hebrew-first, RTL, Israeli audience; embedded Latin terms (model and tool names, URLs) must stay correctly ordered inside RTL lines.
- Much traffic arrives on mobile from Instagram / Facebook / X in-app webviews.
- Hero has one call to action (into the scroll story, which ends on the free beginner guide); news lives in the ticker and the story's launch log, not a competing button.
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
- **Site voice:** a knowledgeable friend talking eye to eye — warm, direct, plain Israeli Hebrew; no buzzwords, no acronyms needing a glossary (LLM, RAG, MCP, "agentic") unless the copy is explaining that very term, no rhetorical questions, nothing that sounds machine-written. "AI" and "סוכן AI" are the only assumed terms. Copy lives in `src/data/siteCopy.ts` and siblings.
- **Generated-content voice (learners):** senior Israeli practitioner explaining to someone entering the field, glossing terms on first use; banned AI-cliché phrases enforced in code (`src/agent/expertVoice.ts`). The two voices differ on purpose; do not align one to the other without asking.
- Never machine-translated; never engagement bait; no links or comment triggers painted onto slides.
- Existing assets: `public/logo.png`, `public/favicon.svg`, `public/og-image.png`.

## Evidence on Hand

- Two free guides: `public/guides/ai-learning-guide-2026.pdf`, `public/guides/ai-business-automations-2026.pdf` (with cover `.webp`s).
- About copy with Daniel's real background (systems administration → AI) in `src/data/siteCopy.ts`.
- JARVIS assistant page and live AI news / model-update feeds.
- **Absent, must not be fabricated:** client testimonials, client counts or logos, case studies, time/money-saved figures, benchmarks, pricing, guarantees. Earlier unsourced figures were deliberately removed.

## Product Principles

1. **One clear next step.** Every public surface leads the visitor to one next step — on the homepage, starting to learn (the beginner guide); on `/ai`, talking to Daniel about an agent. Secondary paths never compete with it.
2. **Plain before clever.** If a first-time visitor needs a glossary, the copy is wrong.
3. **Only true things.** No invented numbers, clients or promises — on the site or in generated content.
4. **A person, not a platform.** Trust comes from Daniel being real, reachable and hands-on.
5. **Content never stops, quality never slips.** Operator tools degrade gracefully but never publish fabricated or broken Hebrew.

## Accessibility & Inclusion

- Public site declares WCAG 2.1 conformance (accessibility statement at `/accessibility`), in line with Israeli accessibility requirements.
- Correct RTL and bidi handling is an accessibility requirement, not polish: mis-ordered Latin runs make Hebrew lines unreadable.
- Must work in Instagram / Facebook in-app webviews on mobile (no section-level sticky / pinned scroll).
