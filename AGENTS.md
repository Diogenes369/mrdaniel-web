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

Actions incl.: `generate-content`, `draft-engagement`, `story-synthesize`, `post-synthesize`, `import-url`, `slides-edit`, `trend-radar`, `engagement-replies`, `carousel-studio`, `email-generate`, `auto-publish-run`.

### Carousel Studio (dashboard tab "סטודיו קרוסלות WEB3")
4-agent pipeline (`dashboard/src/components/CarouselStudio.tsx` + `lib/useCarouselStudio.ts`):
Scraper/Researcher → Copywriter (`carousel-studio` action → `synthesizeCarouselDeck`) → Creative Director (`directDeck`) → Compositor (canvas render 1080×1350 + JSZip). Two render themes sharing one `StudioSlide` model: `web3CarouselRenderer.ts` (obsidian/neon) and `notesCarouselRenderer.ts` (light "study-notes"). `exportStudioZip` → `01_Hook.png … NN_CTA.png`.

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
