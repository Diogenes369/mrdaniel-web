# AGENTS.md — shared context for AI coding agents

Cross-agent brief for this repo (Hermes Agent, Claude Code, Cursor, etc.). Read this first.
The deep reference is **`DOCUMENTATION.md`** (Hebrew, ~360 lines) — consult it for anything not covered here.

---

## What this is

`mrdaniel.co.il` — the marketing site + admin dashboard for Daniel Ben Baruch (IT / AI-agents / cyber / Web3 consultant).
**One repo, two independent Vite apps, two separate Vercel projects:**

| Part | Dir | Vercel project | URL |
|---|---|---|---|
| Marketing site (React 19 + R3F) | `/src` | `my-website` | `https://mrdaniel.co.il` |
| Admin dashboard (analytics + content agents) | `/dashboard` | `dashboard` | `https://dashboard-snowy-psi-94.vercel.app` |
| Serverless functions | `/api` | ships with `my-website` | `mrdaniel.co.il/api/*` |
| Local dev server (Express, shared server code) | `server.ts` | local only | `localhost:3000` |

- The **dashboard always talks to the production API** (`mrdaniel.co.il/api/*`) — it's a live-ops tool. Override with `VITE_SITE_ORIGIN` / `VITE_AGENT_API_BASE`.
- Database: **Firebase Realtime Database (RTDB)**, not Firestore. Server code uses the client SDK, not `firebase-admin` (`src/agent/firebaseServer.ts`).

---

## Commands

Run from the **repo root** for the site, from **`dashboard/`** for the dashboard. Windows host — the default shell is **PowerShell**; a Git Bash is also available.

| Task | Site (root) | Dashboard (`cd dashboard`) |
|---|---|---|
| Install | `npm install` | `npm install` |
| Dev | `npm run dev` (Express, :3000) · `npm run dev:all` (site + dashboard) | `npm run dev` (:5174) |
| Typecheck | `npx tsc --noEmit` | `npx tsc --noEmit` |
| Prod build | `npm run build` | `npm run build` |
| Deploy (prod) | `npm run deploy` | `npm run deploy:dashboard` |
| Deploy both | `npm run deploy:all` | — |

**Always** run `npx tsc --noEmit` **and** `npm run build` for every project you touched before calling a change done. `tsc` covers `src`, `api`, `server.ts`, `netlify` at root; `src` in the dashboard.

Deploy uses the Vercel CLI (`vercel --prod`). Both projects are already linked (`.vercel/project.json`). **Do not deploy without the user explicitly asking.**

---

## Hard constraints

- **Vercel Hobby: max 12 serverless functions per deployment.** We are exactly at the limit — every new endpoint is folded into an existing function. Examples: the email engine lives inside `api/leads.ts`; the autonomous publisher and all content-agent actions live inside `api/agent-generate.ts`.
- **Cron: daily only.** `0 8 * * *` is allowed; `0 6-22 * * *` is rejected. One shared daily cron (`vercel.json`) drives both the auto-pilot and the news auto-publisher.
- Adding a new `api/*.ts` file also needs a matching `rewrites` entry in `vercel.json`.

---

## Conventions

- **All user-facing + generated content is Hebrew, RTL.** `dir="rtl"`, right-aligned text, RLM/LTR-isolate handling for embedded Latin/URLs (`src/agent/hebrewTextSanitizer.ts`, mirrored in `dashboard/src/lib/hebrewTextSanitizer.ts` — keep the two in sync). Never machine-translate; write natural Israeli Hebrew.
- **Generated copy must not invent facts** — no fabricated numbers, client counts, or guaranteed-result claims. The only brand on generated output is `mrdaniel.co.il` (strip original-author credits / social-network noise).
- **Tailwind v4**, config-less — brand tokens are in `@theme` blocks in each app's `index.css`. Brand ramp is NVIDIA-green (`--color-brand-500: #76b900`), carbon/obsidian darks. Match the existing token names.
- **Site**: react-router v7, `@tanstack/react-query` v5, `motion` + GSAP + Lenis, R3F background (`Scene3D`, lazy). Mobile: no section-level `position: sticky` / GSAP `pin` (breaks in IG/FB webviews); `min-h-screen` → `100dvh`; horizontal rails use native `overflow-x: auto` + `touch-action: pan-x`.
- **Dashboard**: **no react-query** — Firebase `onValue` + `useState`. Auth-gated (`LoginGate`, Firebase Auth). Every tab wrapped in `ErrorBoundary`; canvas/preview subtrees also in `PreviewErrorBoundary`. Shared card style: `.dash-card`.
- Match the surrounding file's comment density and idiom. Comments in this codebase explain *why*, often at length.

---

## The content-agent API (`/api/agent-generate.ts`)

Single POST endpoint, **action-dispatched** (`{ action, ...params }`). Auth: `x-admin-secret` header vs `ADMIN_API_SECRET` env (fails **open** only when the env is unset). Gemini-backed (`GEMINI_API_KEY`) via `src/agent/SocialAgentEngine.ts`; every AI action runs its output through `sanitizeOutput` (`AgentSecurityGuard`) and returns a structured `429` on Gemini free-tier rate-limit.

Client libs in `dashboard/src/lib/*Api.ts` follow one rule: **never throw** — on 429/503/network/thin output they fall back to a deterministic local builder so content generation never fully stops.

Actions incl.: `generate-content`, `draft-engagement`, `story-synthesize`, `post-synthesize`, `import-url`, `slides-edit`, `trend-radar`, `engagement-replies`, `growth-optimize`, `carousel-studio`, `reel-script-synthesize`, `reel-tts`, `tech-tip-deck`, `email-generate`, `auto-publish-run`.

### IG Growth Strategy Engine (organic, white-hat)
- **Prompts** — `HOOK_RETENTION_RULES` + `SAVE_SHARE_RULES` in `SocialAgentEngine.ts` feed the story deck, Carousel Studio, reel and auto-pilot prompts. `story-synthesize` and `reel-script-synthesize` also return `hookOptions` (3 first-3-seconds openers: `line` + `visual` pattern interrupt + `pattern`), additive to the old response shape.
- **`growth-optimize`** (`src/server/igGrowthStrategy.ts`) — `op: hooks | cheat-sheet | pack` over already-generated content. `pack` = Comment-to-DM lead magnet shaped for ManyChat (single bidi-free keyword + trigger variants, rotating public replies, DM text) + ≤5 blended hashtags (3 Israeli-niche Hebrew anchors + 2 high-volume English) + Instagram-search keywords.
- **Dashboard** — `GrowthScorePanel.tsx` under the carousel/reel previews (News agent, Story Studio, Repurposer). Scoring is local and explainable (`growthScore.ts`); the AI runs only on the one-click refines. `growthPlaybook.ts` mirrors the server banks/templates for the offline fallback — keep the two in sync. The Engagement Trigger is **off by default**: turn it on only once a ManyChat flow exists for the keyword.
- **No black-hat**: no engagement bait ("תייגו", "תגיבו כן"), no promise without a real deliverable, the SEO keyword line is visible text below the fold (U+2800 spacer lines), never hidden text.

### Carousel Studio (dashboard tab "סטודיו קרוסלות WEB3")
4-agent pipeline (`dashboard/src/components/CarouselStudio.tsx` + `lib/useCarouselStudio.ts`):
Scraper/Researcher → Copywriter (`carousel-studio` action → `synthesizeCarouselDeck`) → Creative Director (`directDeck`) → Compositor (canvas render 1080×1350 + JSZip). Two render themes sharing one `StudioSlide` model: `web3CarouselRenderer.ts` (obsidian/neon) and `notesCarouselRenderer.ts` (light "study-notes"). `exportStudioZip` → `01_Hook.png … NN_CTA.png`.

### Tech Tips & Motion Studio (dashboard tab "טיפים ומדריכים")
The brand's flagship educational format — a **10–12 slide Hebrew teaching deck** on practical AI
tips, code tricks, model integration and dev tools. One `TechTipDeck` feeds **two outputs**:

- `dashboard/src/lib/techTipsApi.ts` — `TIP_PRESETS` (curated shelf) + `fetchTipFeed()` (live
  AI/cloud headlines off `/api/news`) + `synthesizeTechTipDeck()` (action `tech-tip-deck` →
  `synthesizeTechTipDeck` in the engine; falls back to a deterministic local deck, never throws).
- `syntaxHighlight.ts` — a canvas-targeted lexer. Prism/Shiki emit DOM; the slide target is
  `ctx.fillText`, so this returns `{ text, color }` runs instead. Cosmetic-only by design.
- `designAssets.ts` — the deck **design system**: deep-slate palette (`#08090E`), per-theme and
  per-tool accent/glow pairs, the Hebrew type stack (Rubik display / Assistant body / JetBrains Mono
  literals, warmed together by `ensureDeckFonts()` so slide 1 can't ship in a different face than
  slide 12), the `metricsFor()` spacing scale, and the surface primitives — `glassCard()`,
  `terminalFrame()` (window dots + label + copy glyph), `drawBrandBadge()`, `paintSlateBackdrop()`,
  the vector `TOOL_MARKS` and the hand-drawn scribbles. `techTipRenderer.ts` owns layout only and
  asks this module what things look like. **Deliberately a local module, not an MCP/asset service**:
  these are consumed by `ctx.fill*` on a canvas that must stay untainted for `toDataURL`, so an
  out-of-process source would have to return bytes that taint it — the exact failure the vector
  marks exist to avoid. Fonts are the one real external asset, and the browser already fetches those.
- `techTipRenderer.ts` — `drawTipSlide()` paints one slide at **any** size, so the same painter
  serves the 1080×1350 carousel and the 1080×1920 video frames. `resolveTipBackgrounds()` pulls
  optional free backdrops from **Pollinations** (keyless, `Access-Control-Allow-Origin: *`, so the
  canvas stays untainted). `exportTipDeckZip()` → PNGs + `caption.txt` + `code-snippets.txt`.
- `motionStudioService.ts` — animated 9:16 MP4 (Canvas → WebCodecs → `mp4-muxer`, same pipeline as
  `reelVideoEncoder.ts`). **No Pexels, no stock footage** — the motion is pure vector/canvas: each
  slide's body rises and fades in, holds, crossfades out. Audio is a *procedurally synthesised*
  ambient bed, not a licensed track; swapping in real music is a rights decision, not a code one.

Slide-copy rules (length caps, ≥2 real `code` slides, English `visualPrompt`, no fabricated
numbers) live in `SYSTEM_PROMPT.md` and `TECH_TIP_SYSTEM_INSTRUCTION` — keep the two in sync.
**`code` deliberately bypasses the Hebrew sanitizer** (it mangles operators and quotes) and is
excluded from `sanitizeOutput`, whose leak heuristics flag ordinary source; only the Hebrew prose
is guarded.

### Threads → carousel (dashboard tab "יבוא מ-Threads")
Two modules, one pipeline. **There is no other Threads scraper in the repo** — `threadsImport.ts`
was renamed into the fetcher below on 2026-09-12; `ThreadsComposer.tsx` / `threadsFormatter.ts` are
a *different* feature (publishing **to** Threads) and share nothing with it.

- `src/server/threadsThreadFetcher.ts` — the main post **plus every sub-reply by the same author**,
  each with its images. Four sources tried in parallel, all anchored to the requested post code so a
  login-wall feed can never become the deck: server-rendered `data-sjs` JSON → ld+json/`og:` →
  Jina Reader blocks → flat reader text. Never throws; a gated post returns `ok:false` + a Hebrew
  `note` and the UI opens the manual-paste box, which is a first-class path. URL normalisation keeps
  the **path only**, so `?xmt=`/`?igshid=`/`utm_*` are dropped by construction; `/t/`, `/share/`,
  `/p/` and `threads.net` all fold to one canonical `threads.com` post URL.
- `src/server/agents/threadsThreadAgent.ts` — the visual/content agent (action `thread-deck`).
  Scores the thread against `THEME_RULES` → `{theme, badge, guideSlug}`, calls the engine for the
  Hebrew adaptation, then lays the result out **in code, not in the prompt**: theme accent, topic
  badge, `n / N` sub-post indicators, prompts isolated into their own boxes, the thread's own images
  placed on the slides they came from, and a closing card that summarises the deck with the deck's
  own step headlines.

**No link or comment-trigger is ever painted onto a slide.** `stripSlideCta()` removes URLs,
www-hosts, bare `mrdaniel.co.il`, "link in bio" and "write X in the comments" from every slide's
title/body/bullets on every run — the model is *told* not to write them, but the source thread
usually ends with exactly that and a faithful adaptation carries it through. `code` is exempt (a URL
there is part of the snippet). A bare third-party domain is also kept: `make.com` and `n8n.io` are
tool names the reader needs. The matched `/g/<slug>` guide still rides in the **caption**
(`threadDeckCaption`, validated against `STATIC_GUIDES`), which is where a link is actually tappable
— a URL rendered into a PNG is dead pixels. `TechTipSlide.ctaUrl` is therefore cleared on Threads
decks and no longer drawn by the renderer; the field survives only so a session persisted by an
older build deserialises.

Body copy is trimmed by `clampProse()` (`SocialAgentEngine.ts`), **not** `clampWords`: a paragraph
is cut at a sentence break, and a first sentence slightly over budget is kept whole rather than
truncated. A slide ending mid-clause is the loudest "a machine wrote this" tell on a carousel, and
the cut happens after the model is done, so no prompt instruction can prevent it.

The importer renders in **one** mode (`creator`) with no style picker: every photographic style
puts a stock photo behind a prompt card, which is the thing the format exists to avoid. An image
the *thread itself* published is evidence, not stock, and still renders.

Division of labour is deliberate: **language is the model's job, structure is the agent's.** Asking
the model for numbering/themes produced a deck that drifted every run.

- Slide-model extensions (`theme`, `badge`, `stepLabel`, `promptBox`, `sourceImage`, `ctaUrl`) are
  **all optional** on `TechTipSlide` — a Tech Tips deck sets none and renders exactly as before.
  Declared in `src/agent/types.ts`, mirrored in `dashboard/src/lib/techTipsApi.ts`; keep in sync.
- Post images are rewritten through `/api/img-proxy` **by the fetcher**, and the URL is re-checked
  server-side in `thread-deck` — the export canvas would taint on a raw `cdninstagram.com` image,
  and an unchecked URL in a slide is a request the renderer makes on the operator's behalf.
- The agent falls back to a source-faithful deck only for **unusable model output**; a rate limit or
  a missing key still surfaces as the retryable 429/503 it is (`synthesized:false` + `fallbackReason`
  ride back to the dashboard's amber badge).

---

## Feed content policy — HARD RULE

Every news surface — the site's Live Feed **ticker**, the `/news` page, the **AI Pulse** strip on
`/ai`, `/api/ai-news`, and the dashboard's News Content Agent picker — serves **one stream**:

> **Hebrew only. AI / cybersecurity / cloud-infra only. No scrape or parse artefacts.**

- `src/server/newsFeed.ts` → **`sanitizeAndKeep(item)`** is the single gate. It requires: a
  Hebrew-lettered title (≥6 Hebrew chars), a real headline (not a bare URL / `...` / leftover
  `<tag>` / `&#8217;` / CDATA tail, length ≥ 12), and an AI/cyber/cloud signal (reusing the feed's
  own `CYBER_/AI_/CLOUD_PATTERNS`), with generic consumer-tech/gadget/gaming dropped unless it also
  carries one of those signals.
- **`getNewsItems()` applies it BY DEFAULT.** `/api/news` is the sanitized stream; `?strict=0` is
  a debug-only escape hatch for the raw aggregate. Do not wire `?strict=0` into any UI.
- `SOURCES` contains **Hebrew feeds only** (Israeli outlets + Hebrew Google-News queries + the
  Israeli AI/cyber blogs). Do not add English-language RSS sources. `aiPulseService.ts` reads
  `/api/news`, not external English RSS.
- Any new feature that reads/renders news MUST go through `/api/news` (default) — never a raw RSS
  fetch, never `?strict=0`.

---

## Dual-agent workflow (official)

This project is worked by **two agents in parallel**, sharing this repo and this file:

| Agent | Owns | Typical work |
|---|---|---|
| **Hermes Agent** | research, audits, long/background tasks, reusable skills, cross-session memory | source/competitor research, feed & dependency scans, prompt tuning for `SocialAgentEngine.ts`, scheduled (cron) checks, building skills for repeat chores |
| **Claude Code** | direct code changes + **all builds and deployments** | React / Tailwind v4 / R3F edits, bug fixes, `npx tsc --noEmit`, `npm run build`, and **exclusively** `npm run deploy` / `npm run deploy:dashboard` / `npm run deploy:all` (Vercel/Netlify) |

- **Deployment is Claude Code's alone.** Hermes may prepare a change, open a branch, or draft a
  build fix — it must not run `vercel` / `npm run deploy*` / Netlify deploys. Claude Code runs the
  typecheck + build + deploy, and only when the user explicitly asks.
- The two agents do not call each other. Hand-offs are manual, via the user, through this repo.
- Launch Hermes in project context with `./start-hermes.ps1` (session-only PATH, cwd = repo root).

---

## Guardrails for agents

- Work on a feature branch, never commit straight to `main`.
- Don't deploy, don't push, don't send anything to an external service unless the user asks.
- Don't run remote install scripts or add global tools without asking.
- Secrets live in Vercel env / local `.env` (gitignored) — never hardcode keys, never put the user's email in request headers/URLs.
- `_legacy_static_site_backup/`, `src/archive/`, `dist/` — don't edit; they're frozen/build output.
- Before deleting or overwriting a file you didn't create, look at it and confirm it's what the task means.
