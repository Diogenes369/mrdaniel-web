# PROJECT_STATE.md

Single source of truth for context restoration and external-agent synchronization.

| | |
|---|---|
| **Generated** | 2026-09-08 |
| **Repo root** | `C:\Projects\My Website` |
| **Branch** | `main` |
| **Domains** | `mrdaniel.co.il` (site) · `dashboard-snowy-psi-94.vercel.app` (dashboard) |
| **Verification basis** | Live `/health` probe, live `/api/agent-generate` probes, filesystem + source read. Anything not directly verified is marked **UNVERIFIED**. |

---

## 1. Architecture & Project Topology

Three deployables plus a local agent bridge. The site and dashboard are **separate Vercel projects** with separate env scopes — a variable set on one is invisible to the other.

```
C:\Projects\My Website\
├─ api/                      12 Vercel serverless functions  ◀── AT THE HOBBY CAP (see §1.4)
│   agent-generate.ts        the AI multiplexer — ~17 actions behind one function
│   news.ts                  news feed + ?action=analyze (dynamic import, folded to save a slot)
│   news-item.ts  ai-news.ts  chat.ts  leads.ts  health.ts
│   generate-video.ts  generate-weekly-plan.ts  pexels-search.ts
│   img-proxy.ts  agent-whatsapp-webhook.ts
├─ src/                      main site (Vite + React + TS, Tailwind v4)
│   agent/                   SocialAgentEngine.ts (copywriter), AgentSecurityGuard, WeeklyPlanEngine,
│                            VideoGenerationEngine, WhatsAppDispatcher, hebrewTextSanitizer
│   server/                  newsFeed, newsInsights (Gemini per-article), storySlides,
│                            newsPostComposer, autoPublish, contentImport, emailEngine
│   components/ pages/ hooks/ lib/ three/ data/ services/
├─ dashboard/                SEPARATE Vercel project (Vite + React + TS)
│   src/lib/        49 modules   src/components/  38 components
├─ carousel-bridge/          local Express service — NOT deployed, NOT in Vercel
│   index.js                 1,644 LOC, single file, ESM
│   output/                  47 job dirs, 72 MB — generated PNG/PDF/spec artifacts
│   reference-library/       4 WhatsApp JPEGs, UNTRACKED and NOT YET WIRED IN
│   TUNNEL.md
├─ scripts/                  Python render layer (Pillow)
│   compose_slide.py         Pass 2 compositor — JSON spec in, slide PNG out
│   render_hebrew_banner.py  standalone Hebrew banner + Telegram delivery
│   compile_pdf.py           slide_*.png → LinkedIn document PDF
│   fonts/                   Hebrew font pool
├─ whatsapp-server/          separate service; the ONLY ecosystem.config.cjs in the repo
├─ vercel.json  server.ts  vite.config.ts  SOUL.md  AGENTS.md  SYSTEM_PROMPT.md
```

### 1.1 Ports & processes

| Service | Port | Host binding | Process manager |
|---|---|---|---|
| carousel-bridge | **8787** (`CAROUSEL_BRIDGE_PORT`) | `127.0.0.1` only — loopback-bound in `app.listen()` | PM2, **elevated** |
| site dev | 5173 (Vite default) | — | `npm run dev` (tsx server.ts) |
| dashboard dev | 5174 (per CORS allow-list) | — | `npm run dev --prefix dashboard` |

**PM2 caveat — persistent.** The daemon runs elevated; a non-elevated shell gets `EPERM connect \\.\pipe\rpc.sock` on every `pm2` verb. An agent **cannot** restart the bridge. Workaround for checking whether a restart is actually needed — compare process start time against source mtime:

```powershell
$c = Get-NetTCPConnection -LocalPort 8787 -State Listen | Select-Object -First 1
(Get-Process -Id $c.OwningProcess).StartTime      # 2026-09-08 08:01:20
(Get-Item 'carousel-bridge\index.js').LastWriteTime  # 2026-09-07 09:23:32
```
Process newer than source ⇒ already current, no restart needed. **As of 2026-09-08 the bridge WAS restarted and §5's retention sweep + public routes are live (first sweep took output from 47 → 25 dirs). `index.js` has since gained the §5.6 rate limiter, which is on disk but NOT live — one more restart needed.**

There is no `ecosystem.config.cjs` for carousel-bridge; the only one in the repo belongs to `whatsapp-server`. The bridge was registered with PM2 imperatively. **UNVERIFIED:** the exact `pm2 start` invocation.

### 1.2 Environment matrix

`process.loadEnvFile` (Node built-in, no dotenv) loads `carousel-bridge/.env` **then** repo-root `.env`; real process env always wins.

| Variable | Location | Consumer | Notes |
|---|---|---|---|
| `ADMIN_API_SECRET` | site Vercel + `carousel-bridge/.env` | site auth gate; bridge outbound | **Rotated 2026-09-08. 40 chars.** Authoritative. |
| `VITE_ADMIN_API_SECRET` | dashboard Vercel (Production + Preview, type `Config`) + `dashboard/.env` | dashboard → site | Synced to the 40-char value 2026-09-08. **Inlined at build time.** |
| `BRIDGE_TOKEN` | `carousel-bridge/.env` | `/carousel/*` gate | Set. Bridge refuses non-loopback traffic without it. |
| `BRIDGE_ALLOWED_ORIGINS` | `carousel-bridge/.env` | CORS reflect-list | Default `http://localhost:5174,http://127.0.0.1:5174` |
| `THREADS_APP_ID` / `THREADS_APP_SECRET` | **repo-root `.env`** (not the bridge's) | Threads chain fetch | Present; `/health` reports `threadsApp:true` |
| `THREADS_USER_TOKEN` | — | Threads reads | **ABSENT.** App creds alone read nothing → Threads is non-functional. |
| `INSTAGRAM_OEMBED_TOKEN` | — | IG oEmbed | **ABSENT** → `instagramOEmbed:false`; IG links hit the login wall, paste-caption is the path. |
| `HERMES_TIMEOUT_MS` | unset | bridge | Falls back to the 900 000 ms code default. |
| `PEXELS_API_KEY` | root `.env` + site Vercel | `api/pexels-search.ts` | |
| `GEMINI_API_KEY` | site Vercel | `api/agent-generate.ts` | **FREE tier** — 429 `RESOURCE_EXHAUSTED` after the hourly cap. |
| `VITE_CAROUSEL_BRIDGE_URL` | dashboard Vercel | bridge base URL | Build-time; overridable via `localStorage['carousel-bridge-base']` |
| `VITE_FIREBASE_*` (7) | both `.env` files | Realtime DB + auth | |
| `CAROUSEL_BRIDGE_URL` | **site** Vercel (Secret) | `api/news.ts` download router | Set 2026-09-08. Needs a site redeploy to take effect. |
| `PUBLIC_BASE_URL` | `carousel-bridge/.env` | absolute `downloadUrl` in publish response | Optional — the dashboard builds the canonical link itself. |
| `OUTPUT_RETENTION_MS` / `GUIDE_TTL_MS` / `PRUNE_INTERVAL_MS` | bridge | retention sweep | Defaults 48h / 7d / 1h. |
| `PUBLIC_RATE_MAX` / `PUBLIC_RATE_WINDOW_MS` | bridge | public rate limiter | Defaults 60 requests / 5 min per client. |
| `CAROUSEL_OUTPUT_ROOT` | bridge | output root override | For testing against a scratch dir. |

**Secret-rotation hazard:** `VITE_`-prefixed values are frozen into the JS bundle at build time. Rotating `ADMIN_API_SECRET` silently 401s every already-deployed dashboard until it is rebuilt. This exact failure occurred and is now mitigated at runtime — see §4.

### 1.3 Tunnel

Quick tunnel (`cloudflared tunnel --url http://localhost:8787`), chosen 2026-09-06 over moving nameservers. **The hostname is ephemeral** — every cloudflared restart mints a new one, requiring a `VITE_CAROUSEL_BRIDGE_URL` update + redeploy, or a per-browser `localStorage` override. No Cloudflare Access identity gate on this path: **`BRIDGE_TOKEN` is the only thing protecting a code-executing agent.** Named tunnel is blocked — `mrdaniel.co.il` uses `ns1/ns2.sitesdepot.com`, not Cloudflare.

### 1.4 Hard constraint: the 12-function cap

`api/` holds **exactly 12** `.ts` functions. Vercel Hobby caps a deployment at 12 Serverless Functions. **Adding any new file to `api/` will fail the deploy.** This is why `news.ts` hosts `?action=analyze` behind a dynamic import and why `agent-generate.ts` multiplexes ~17 actions. Any new endpoint must fold into an existing function as an action or query flag. Directly governs §5.

---

## 2. Backend Engine & API Endpoints (`carousel-bridge`)

Express, ESM, in-memory job registry (`Map`), `express.json({ limit: '12mb' })` (reference screenshots arrive as base64 data URLs, ~33% inflation).

### 2.1 Middleware chain

1. **CORS** — reflects **only** allow-listed origins; `*` is used solely when `Origin` is absent (curl/server-to-server). Deliberately not wildcard: behind a tunnel, any web page could otherwise drive Hermes on this machine. Allowed headers: `Content-Type, x-bridge-token`.
2. **Token gate** (`app.use('/carousel', …)`):
   - `BRIDGE_TOKEN` unset + loopback caller → pass.
   - `BRIDGE_TOKEN` unset + remote caller → **503** `"BRIDGE_TOKEN is not set — refusing non-loopback requests"`.
   - Set → `x-bridge-token` must match, else **401** `"bad or missing x-bridge-token"`.
   - **Exception, `/carousel/file/*` only:** also accepts `?t=<token>`. `<img src>` and the ZIP bundler's `fetch()` cannot attach headers; without this the gate 401s every image and the ZIP silently bundles 52-byte JSON error bodies under `.png` names. This was a real shipped bug.
3. `/health` sits **before** the gate and is open.

> **Terminology correction for external agents:** the bridge does **not** use `VITE_ADMIN_API_SECRET`. Its inbound gate is `x-bridge-token`; `ADMIN_API_SECRET` is used only **outbound**, when the bridge calls the site's `/api/agent-generate`. `VITE_ADMIN_API_SECRET` is a dashboard-only, browser-side build variable. Three distinct credentials.

### 2.2 Routes

| Method | Route | Auth | Body / params | Response |
|---|---|---|---|---|
| GET | `/health` | open | — | `{ok, service, port, siteOrigin, adminSecret, renderScript, hermesTimeoutMs, presets[], styles[], tokenRequired, instagramOEmbed, threadsApp, threadsUserToken, activeJobs}` |
| POST | `/carousel/generate` | token | `article{title,source,topic,articleText}`, `slideCount` (1–8, default 4), `override`, `referenceImage` (data URL), `sourceUrl`, `slideCopy[]`, `font`, `palette`, `skipQa`, `mode` (`article`\|`rebrand`), `preset`, `style` | `{ok, jobId, slideCount}` — 202-style, async |
| GET | `/carousel/job/:id` | token | — | `{ok,id,status,progress{done,total},concept,palette[],typography,usedFallbackDirection,layout,imported,usedReference,deck[],rebrand,preset,style,pdfUrl,qaRetries,slides[],post,copyWarning,error}` · **404** if unknown |
| POST | `/carousel/adjust` | token | `jobId`, `instruction` (≥3 chars) | `{ok, jobId, adjustedFrom}` — forks a **new** job, appending the instruction to `override` |
| POST | `/carousel/redesign` | token | `jobId`, `style`, `preset`, `font`, `palette`, `slideIndex?` | `{ok, jobId, redesigning[]}` — **responds first, then works**; poll the job |
| GET | `/carousel/file/*` | token **or `?t=`** | static | `express.static(OUTPUT_ROOT, {maxAge:'1h'})` |

**`sourceUrl` discriminator:** `/^https?:\/\//i` only. Anything else ≥40 chars is treated as a pasted caption. A looser host.tld pattern previously misread `"Node.js tips"` and `"check ai.com"` as URLs and rejected pasted text.

**`/carousel/redesign` guarantee:** approved copy is re-read from the job's own slide records and never regenerated — only backdrop and composition change. Slide URLs get `?v=<Date.now()>` cache-busting. **UNVERIFIED: never exercised end-to-end.**

### 2.3 Job pipeline (`runJob`)

```
queued → importing? → art-direction → [rebranding | copywriting] → rendering → done
```

- **importing** — `importSource(url)`. LinkedIn/Threads/Instagram/article extraction: `CHROME_LINE_RE`, `COMMENTS_START_RE`, `NAME_LINE_RE`, `dropAuthorHeader()`, `isolatePostBody()` strip bylines, Hebrew timestamps ("3 שבועות"), reaction counts, reply chains, hashtag blocks.
- **art-direction** — `generateArtDirection()` → Hermes. `DESIGN_SYSTEM` + `METAPHOR_RULES` + `ART_DIRECTION_PROMPT`. Output passes through `repairJson()` (truncated/malformed LLM JSON) then `fallbackArtDirection()`. A frame prompt uses the compact 503-char `FRAME_STYLE`, **not** the 3,029-char `DESIGN_SYSTEM` — embedding the full system in every frame prompt caused 600 s timeouts.
- **copywriting** — `Promise.allSettled` over `carousel-studio` + `post-synthesize` on the site API. **Copy failure never discards artwork** (~90 s/slide); it degrades to article text and reports via `copyWarning`.
- **rebranding** (`mode:'rebrand'`) — replaces synthesis entirely. `detectSourceLanguage()` branches: Hebrew → `ENRICH_RULES` (condense/polish, never translate); non-Hebrew → `TRANSLATE_RULES`. Requires ≥40 chars or throws with the paste-the-caption hint.
- **rendering** — per slide: photo-source styles call `fetchContextPhoto()` (Pexels via the site proxy, keyed on the plan's `visualQuery`, **not** the Hebrew text, which searches badly); failure or drawn styles fall through to `generateFrame()` (Hermes) with `isCompletePng()` + `recoverFrame()` salvage. Then `composeSlide()`, then `visionQa()` with **one** corrective re-composite at `fontScale: 0.82` — retried only for `overflow`/`overlap`, the failures a tighter fit can actually fix. QA is advisory: a failing QA call never sinks a finished slide.
- **PDF** — `compile_pdf.py --dir <jobDir> --out carousel-<id>.pdf`, 60 s cap, non-fatal.

### 2.4 Presets & styles

| Preset | px | Ratio | Use |
|---|---|---|---|
| `portrait` (default) | 1080×1350 | 4:5 | Instagram / LinkedIn carousel |
| `story` | 1080×1920 | 9:16 | Stories / TikTok / Reels |
| `square` | 1080×1080 | 1:1 | Square |

| Style | Source | Tone query |
|---|---|---|
| `sketchnote` (default) | hermes | — |
| `concept-art` | hermes | — |
| `photoreal` | photo | `professional photography` |
| `dark-minimal` | photo | `dark moody minimal technology` |
| `enterprise` | photo | `bright clean corporate` |

### 2.5 Asset output workflow

**Root:** `carousel-bridge/output/<jobId>/`, `jobId = randomUUID().slice(0,8)`.

| Artifact | Naming | Producer |
|---|---|---|
| Hermes raw frame | `frame_NN.png` (2-digit, 0-indexed) | `generateFrame()` |
| Compositor spec | `spec_NN.json` | `composeSlide()` — written to disk, passed as `--spec` |
| Final slide | `slide_NN.png` | `compose_slide.py` |
| Document PDF | `carousel-<jobId>.pdf` | `compile_pdf.py` |
| Reference upload | saved by `saveReferenceImage()`, ≤8 MB, png/jpg/webp | |

**Public URL shape:** `/carousel/file/<jobId>/slide_NN.png` (+ `?t=<token>`, + `?v=<ts>` after redesign).

**Lifetime — no eviction exists.** Job *status* is in-memory and dies with the process; the *files* are permanent. **47 job dirs / 72 MB accumulated, never pruned.** There is no TTL, no cleanup cron, no size cap. A retention policy is unimplemented work, and is a prerequisite for §5.

ZIP packaging is **client-side** (`dashboard/src/lib/exportBundle.ts`, JSZip → `URL.createObjectURL` → `<a download>`): `slide-N.png`, `caption.txt`, `image-generation-prompt.txt`, named `mrdaniel-content-<id>.zip`. Nothing server-side produces a ZIP.

---

## 3. Graphics & Canvas Rendering Pipeline

Two independent renderers. Do not conflate them.

| | Carousel Studio | Tips & Guides |
|---|---|---|
| Engine | **Pillow** (Python), server-side | **Canvas 2D**, in-browser |
| Entry | `scripts/compose_slide.py` | `dashboard/src/lib/techTipRenderer.ts` (800 LOC) |
| Backdrop | Hermes frame or Pexels photo | Pollinations or Pexels or procedural |
| Output | PNG on disk + PDF | data URLs → JSZip |

### 3.1 Pillow path (`compose_slide.py`)

CLI: `--spec <json>` (or stdin), `--list-fonts`. Spec: `{input, output, font, palette, preset, style, headline, footer, footerBox, drawFooterBox, cards[{box,number,text}], fontScale?}`.

Card boxes are fractional `[x0,y0,x1,y1]`, hard-coded per card count (1–4), all landing in the middle band because Pass 1 (Hermes) is instructed to reserve those safe zones. Internals: `fit_block()` (fits **both** axes), `soft_halo()`, `draw_accent_rule()`, `apply_scrim()`, `mean_luminance()`.

**Text plates were removed at explicit user direction** — `draw_text_plate()` and all translucent bounding rectangles are gone; type floats natively over artwork, legibility carried by halo + scrim.

**Hebrew/RTL is not optional and not automatic.** This host has **no Raqm/HarfBuzz/FriBidi**, so Pillow silently renders Hebrew reversed. Correctness depends on `python-bidi`'s `get_display()` + `arabic-reshaper`; the import is a **hard failure**, never a silent fallback. `clean_text()` strips Unicode `Cf/Cc/Co/Cs` (RLM `\u200f`, LRM, ALM) **before** `assert_glyph_coverage()` — otherwise the run dies on `no glyph for '\u200f'`.

### 3.2 Contextual imagery (`resolveTipBackgrounds`)

```ts
resolveTipBackgrounds(deck, width, height, onProgress?, style: TipStyle = 'photoreal')
```
3 concurrent workers over a shared cursor; `usedFallbacks: Set<number>` prevents two slides landing on the same stock photo.

- **`sketchnote`** → **Pollinations** (`image.pollinations.ai/prompt/…?width&height&nologo=true&seed=i+7`) — free, keyless, `Access-Control-Allow-Origin: *` (verified). Prompt = `slide.visualPrompt` + `brandVisualsFor(title+body+code)` + `"bold high-contrast digital illustration, dramatic rim lighting, deep dark background, sharp focal subject, cinematic depth, no text, no letters, no watermark"`. Requested at **half resolution**, 30 s timeout.
- **photographic styles** → `resolveSlidePhotoUrl()` → `api/pexels-search` (server derives an English scene query from **that slide's own** `title + body + visualPrompt`, sliced to 320 chars, plus `STYLE_TONE[style]`). 12 s load / 15 s race. Falls back to a curated pool of 8 verified `images.pexels.com` URLs (CORS-open, checked live).

Per-slide context was the point: previously every slide keyed off the deck title and the set looked interchangeable.

### 3.3 `brandVisualsFor()` — 18 tech stacks

`BRAND_TERMS: {re: RegExp; visual: string}[]`, all case-insensitive with **`\b` word boundaries**, filtered then **`.slice(0, 3)`**.

python · docker · kubernetes|k8s · react · node(.js) · typescript|ts · postgres(ql) · mongo(db) · redis · aws|amazon web services · azure · git(hub) · linux|ubuntu · nginx · tensorflow|pytorch · openai|gpt · figma · terraform

> **Do not remove the `\b` anchors.** Without them `ts` matches "tests", `git` matches "digital". This was caught mid-edit once and restored.

Behaviour verified against 5 cases (Docker+K8s → 2, Python+Postgres → 2, no-tech → 0, React+TS → 2, six-term input → capped at 3).

### 3.4 Code block: `wrapCodeLines()` + `ctx.clip()`

**The bug:** the fitter only shrank. At the `minPx` floor a long line kept painting straight through the terminal border (the "slide 03" overflow) because nothing ever wrapped.

**Fit loop** — up to 24 iterations from `px = W*0.026` down to `minPx = W*0.0135`, ×0.94 each pass. Exits when **both** `wrapped.length * px * 1.5 ≤ innerH` **and** `maxTokenWidth(...) ≤ textW`. Gutter `px*2.2` is subtracted from the width budget first.

**`wrapCodeLines(ctx, lines, maxW)`** → `{toks, num}[]`. Breaks at **token boundaries** so syntax colouring survives; breaks *inside* a token only when a single token exceeds the budget (long URL/path), via a shrinking `measureText` scan. Continuation rows carry `num: null` so the line-number gutter is not repeated, and indent `px*1.2`. A guard forces ≥1 char on an empty row to prevent an infinite stall.

**`ctx.clip()`** — a `ctx.save()` → `rect(innerX - px*0.3, innerTop - px, innerW + px*0.6, innerH + px)` → `clip()` around the paint loop. Belt-and-braces: even if the fitter and wrapper both fail, no glyph can paint outside the panel. Plus a `y > innerTop + innerH` break.

### 3.5 Step badge synchronization

Three independent layers, because the model returned `stepNumber` as `1,2,0,2,0`:

1. **Server** (`SocialAgentEngine.ts`) — `stepNumber` derived from **position**, never trusted from the model. The visible kicker is rewritten to `טריק N` when it matches `^(טריק|שלב|טיפ|step|tip|trick)\b`, so a kicker can never disagree with its badge.
2. **Count contract** — `requestedSectionCount(topic)` (`SocialAgentEngine.ts:1329`) parses digits **and** Hebrew numerals in both genders (אחד/אחת … עשר/עשרה) against `COUNT_NOUNS` (טריקים|טיפים|שלבים|דרכים|כללים|עצות|tricks|tips|steps|ways|rules), clamped 1–12. Feeds a mandatory directive into the prompt. `syncTitleCount(title, actual)` (`:1347`) then rewrites a cover that promised N when N sections were not delivered.
3. **Client** (`techTipsApi.ts:36`) — `renumberSteps()` re-derives 1..N from position again, defensively. A deck can arrive from cache, from the local fallback, or from an older build; the renderer only draws a badge when `stepNumber > 0`, so position-derivation guarantees no step slide is left unbadged.

`drawStepBadge()` paints the glow and the numeral as **two separate passes** (halo at `globalAlpha 0.55` with `shadowBlur 16`, then `shadowBlur = 0` and the numeral crisp) — a `shadowBlur` on the fill itself smeared the digit's own edges.

### 3.6 Client-lib invariant

Every dashboard content lib (`techTipsApi`, `igGrowthApi`, `web3CarouselApi`, `repurposeApi`, `storySlides`, `reelScriptApi`) **never throws**: on 429/503/network/thin output it returns a deterministic local deck built from the topic itself, so a studio always has something to render.

---

## 4. Authentication & Gatekeeping

### 4.1 Three distinct credentials

| Credential | Direction | Header | Gate |
|---|---|---|---|
| `ADMIN_API_SECRET` | dashboard/bridge → site | `x-admin-secret` | `api/agent-generate.ts:40` |
| `BRIDGE_TOKEN` | dashboard → bridge | `x-bridge-token` (or `?t=` on `/carousel/file` only) | `carousel-bridge/index.js:1432` |
| Firebase Auth | user → dashboard | Firebase SDK | `LoginGate.tsx` |

### 4.2 Site gate (`api/agent-generate.ts`)

Strict equality against `process.env.ADMIN_API_SECRET`; **does not fail open**. `Access-Control-Allow-Headers: Content-Type, x-admin-secret`. Returns `401 {ok:false,error:"unauthorized"}` at two points (`:135`, `:166`).

**Probe idiom** — auth is checked *before* action dispatch, so an unknown `action` returns **400 when auth passes** and **401 when it does not**. Cheapest possible credential test, costs no Gemini quota:
```bash
curl -s -o /dev/null -w '%{http_code}' -X POST https://mrdaniel.co.il/api/agent-generate \
  -H 'content-type: application/json' -H "x-admin-secret: $SECRET" -d '{"action":"__probe__"}'
# 400 = auth OK   401 = bad secret
```

### 4.3 The rotation incident (resolved 2026-09-08)

`ADMIN_API_SECRET` was rotated on the site (48 → 40 chars). `VITE_ADMIN_API_SECRET` on the dashboard project was 8 days old, so the deployed bundle carried the **pre-rotation** value → every dashboard AI call 401'd.

Fixed: dashboard Vercel var replaced (Production **and** Preview, `--type config`), redeployed, verified — the deployed bundle carries the rotated secret and the endpoint now answers 400 (body validation) rather than 401.

> **CLI gotcha:** `vercel env add` refuses a `VITE_`-prefixed credential without an explicit type. Its `next[]` hint suggests `--scope "<choice label>"`, which **fails** — `--scope` means *team*. The working flag is **`--type config`** (expose) or `--type secret` (rename to private).

### 4.4 Runtime recovery layer (shipped)

`dashboard/src/lib/adminSecret.ts`:

```
getAdminSecret()  →  localStorage.adminSecret   (FIRST — survives rotation, no rebuild)
                  →  VITE_ADMIN_API_SECRET      (build-time, goes stale)
```

- `adminHeaders()` — spread into `fetch` headers; empty when no secret exists.
- `usingBuildSecret()` — true when the only secret is the stale-able one; drives the prompt's wording.
- `requestReauth(source)` — **one shared promise**, not one per failed call. A single deck generation fans out into several API calls that 401 together; without the funnel the operator got a stack of identical raw toasts. 180 s window, then resolves `false`.
- `reportAuthFailure(source)` — fire-and-forget wrapper.
- `adminFetch(input, init)` — attaches the header, on 401 raises the prompt and retries **once**, and **only if the secret actually changed** (retrying a rejected value just yields a second 401).
- Events: `ADMIN_AUTH_FAILED_EVENT` = `admin-auth-failed`, `ADMIN_AUTH_RESOLVED_EVENT` = `admin-auth-resolved`.
- Every `localStorage` access is `try/catch` — private mode throws.

`dashboard/src/components/AdminAuthGate.tsx`, mounted in `App.tsx` beside `<PrintableLeadsReport>`: RTL modal, verifies the pasted secret against the live endpoint (using the §4.2 probe) **before** storing it, so a typo surfaces immediately; offers "clear stored key"; states the permanent fix.

**Wired call sites (15):** `techTipsApi`, `igGrowthApi`, `web3CarouselApi`, `repurposeApi`, `reelScriptApi`, `reelRenderService` (×2), `slideEditor`, `storySlides`, `newsPostComposer`, `useAgentController`, `useEmailManager`, `useVideoGeneration`, `NewsContentAgent`, plus `adminFetch` itself.

### 4.5 Standing security note

`VITE_ADMIN_API_SECRET` is typed `Config` and **inlined into a publicly downloadable bundle** — anyone who loads the dashboard can extract `ADMIN_API_SECRET` and call `/api/agent-generate` directly. Rotation does not change this; it is inherent to a static SPA holding an API credential. The structural fix is a thin authenticated proxy: the dashboard authenticates as a *user* (Firebase Auth already exists in `LoginGate.tsx`), and the proxy holds the admin secret server-side. **Not implemented. Flagged, acknowledged, deferred.**

---

## 5. ManyChat & Public Download Routing — IMPLEMENTED 2026-09-08

Was a proposal in the previous revision of this file; now built and tested. ManyChat itself is still
unconfigured — this is the backend it will call.

### 5.1 Identity model

A public link is an **unauthenticated capability**: whoever holds it gets the file. So the public
namespace is deliberately separate from the internal one.

| | `jobId` | `guideId` |
|---|---|---|
| Bits | 32 (`randomUUID().slice(0,8)`) | **128** (`randomBytes(16).toString('hex')`) |
| Scope | internal — dashboard URLs, logs | public link only |
| Lifetime | in-memory, dies with the process | **persisted** to `output/published.json` |
| Reachable publicly | never | only after an explicit publish |

Nothing under `output/` is publicly reachable until `POST /carousel/publish` mints a guideId for it.
Publishing is token-gated; downloading is not.

### 5.2 Retention (task 1)

- `OUTPUT_RETENTION_MS` — default **48 h**, sweeps unpublished job directories.
- `GUIDE_TTL_MS` — default **7 days**. A published guide's directory is **exempt** from the 48 h
  sweep until its guide expires. Without this the sweep would 404 a link already sent to a
  subscriber. This is a deliberate widening of the "delete everything over 48 h" instruction; the
  disk-bloat goal still holds because a guide's exemption is bounded and self-expiring.
- `PRUNE_INTERVAL_MS` — default 1 h. Sweep also runs once at startup.
- Age is read from **directory mtime**, not the job record: job status dies with the process while
  the artwork does not, so after a restart the filesystem is the only thing that knows the age.
- In-flight jobs (status not `done`/`error`) are never swept.
- `CAROUSEL_OUTPUT_ROOT` overrides the output root — added so the sweep can be exercised against a
  scratch directory instead of real work.

> **First sweep will delete 18 of the 47 existing directories (~29 MB).** They are already older
> than 48 h. Nothing published is at risk — the registry is empty.

### 5.3 Bridge routes (tasks 1 & 3)

**Token-gated (admin):**

| Method | Route | Body | Response |
|---|---|---|---|
| POST | `/carousel/publish` | `{jobId, ttlHours?, title?}` | `{ok, guideId, expiresAt, slides, downloadPath, downloadUrl}` |
| POST | `/carousel/unpublish` | `{guideId}` | `{ok, revoked}` — takes effect immediately |
| GET | `/carousel/published` | — | live guide index (the list the public must not have) |

Publish accepts a job whose in-memory record is gone (bridge restarted) as long as its directory
still holds slides. Returns 400 on a malformed jobId, 404 if the directory is gone, 409 if the job
is still rendering.

**Public, no token:**

| Method | Route | Purpose |
|---|---|---|
| GET | `/public/guide/:guideId` | JSON metadata — title, slide count, hasPdf, expiresAt |
| GET | `/public/download/:guideId` | the ZIP bundle |
| GET | `/public/download/:guideId/pdf` | the LinkedIn document PDF |
| GET | `/public/download/:guideId/slide/:n` | one slide, **1-based index** |

Status codes: `400` malformed id · `404` unknown · **`410` expired** (distinct from 404 on purpose —
a subscriber whose link aged out should be told it expired, not that it never existed).

**Three rules keep the public surface safe:**
1. Only a 32-hex id is accepted, and it must already be in the registry.
2. **No caller-supplied string is ever joined onto a filesystem path.** Filenames come from the
   registry record captured at publish time; the slide route takes an *index*, never a name. A
   `path.resolve` containment check runs anyway as defence in depth.
3. Expired guides serve nothing.

**Headers:** `Access-Control-Allow-Origin: *` on `/public/*` only — the `/carousel/*` allow-list is
unchanged, because those routes reach Hermes. Plus `Content-Disposition: attachment`,
`X-Content-Type-Options: nosniff`, `Cache-Control: public, max-age=3600`.

Non-ASCII filenames use **RFC 6266/5987**: an ASCII-folded `filename=` for legacy clients *and*
`filename*=UTF-8''<pct-encoded>`. A header value is Latin-1, so a Hebrew title in bare `filename=`
degrades to dashes — this was caught in testing and fixed.

**ZIP bundling** — `scripts/make_bundle.py` (Python stdlib `zipfile`; Node has no stdlib zip and the
repo pulls in no zip dependency). Same shell-out pattern as `compose_slide.py`/`compile_pdf.py`.
Contains `slides/slide-NN.png`, the PDF, `caption.txt`, `manifest.json` — final artefacts only;
`frame_NN.png` and `spec_NN.json` are intermediates and are excluded. Written to `.zip.part` and
moved into place so a reader never sees a half-written archive.

### 5.4 Site route (task 2)

`vercel.json`: `/api/download/:guideId` → `/api/news.ts?action=download&guideId=:guideId`, inserted
at index 4, **before** the SPA catch-all. Function count stays at **12** — the cap is respected.

`handleDownload()` in `api/news.ts` is a **router, not a proxy**: it resolves metadata on the bridge,
then 302s the client at the bridge's own file route. The bytes never traverse a Vercel function —
`maxDuration` is 60 s and a multi-megabyte ZIP through a serverless response is a bad trade when the
bridge already serves it with correct headers.

| Query | Behaviour |
|---|---|
| `?action=download&guideId=<id>` | 302 → ZIP |
| `…&variant=pdf` | 302 → PDF (404 if the guide has none) |
| `…&variant=slide&n=2` | 302 → slide 2 |
| `…&meta=1` | 200 JSON — title, slides, hasPdf, expiresAt, downloadUrl |

Requires **no** `x-admin-secret`, and grants no privilege if one is sent. `Cache-Control: no-store`
on every response: the bridge sits behind an ephemeral quick-tunnel, so a cached 302 would outlive
the hostname it points at. An unreachable bridge answers **503, never 404** — the guide may well
exist, and "not found" would send someone hunting for a link that is fine.

### 5.5 Dashboard publish action — IMPLEMENTED

`CarouselStudioModal.tsx` gains a **"פרסם קישור ל-ManyChat"** button, enabled only when `job.status === 'done'`
— publishing a half-rendered deck would ship missing slides to whoever opens the link. On success it
shows the live link in a read-only `dir="ltr"` field (RTL scrambles a URL), with one-click copy, the
expiry date, and a **בטל פרסום** button wired to `/carousel/unpublish`. The link is copied to the
clipboard automatically on publish.

`carouselBridge.ts` gains `publishGuide()`, `unpublishGuide()`, `publicGuideUrl()` and `copyText()`.

**The link always points at the site, never the tunnel:**
`https://mrdaniel.co.il/api/download/<guideId>` (override via `VITE_PUBLIC_SITE_ORIGIN`). A link built
from the tunnel hostname dies the next time cloudflared bounces; the site URL is stable and resolves
the current tunnel server-side per request. This is the whole reason the site route exists.

`copyText()` falls back to a hidden `<textarea>` + `execCommand`: `navigator.clipboard` needs a
secure context and rejects when the document is not focused — exactly the state a just-clicked
button can be in.

> **Tips & Guides has no publish button, and cannot have one yet.** That studio renders on the
> browser canvas (`techTipRenderer.ts`) and never creates a bridge job, so there is no `jobId` and
> nothing on disk to publish. Publishing from there needs an upload path that posts the canvas
> output to the bridge first — unbuilt.

### 5.6 Public rate limiter — IMPLEMENTED

Sliding window over `/public/*` only. `PUBLIC_RATE_MAX` (default **60**) per
`PUBLIC_RATE_WINDOW_MS` (default **5 min**) per client. Responds **429** with `Retry-After` computed
from the oldest hit in the window, and sets `X-RateLimit-Limit` / `X-RateLimit-Remaining` on every
response.

**Client identity:** `CF-Connecting-IP` → first hop of `X-Forwarded-For` → socket address. Every
request arrives from cloudflared on loopback, so the socket address is identical for everyone and
useless as a key; Cloudflare overwrites `CF-Connecting-IP` inbound, making it the one forwarded
header a remote client cannot forge here.

In-memory and per-process — single bridge instance, so a shared store buys nothing. The bucket map
is swept on the existing retention timer: **a limiter that grows one entry per attacker IP is itself
the denial of service.**

> Declaration order matters here: the rate-limit `const`s live beside `jobs` at the top of the file,
> not down with the middleware. The startup `pruneOutput()` also sweeps the buckets, and a `const`
> declared further down is still in the temporal dead zone at that point — which crashed the process
> on boot until it was moved. Do not relocate them.

### 5.7 What ManyChat still needs

1. **A site redeploy.** `CAROUSEL_BRIDGE_URL` is set on the site project but env vars only bind at
   build time, and `api/news.ts` + `vercel.json` are not deployed yet. **`/api/download/...` does not
   work until `npm run deploy` runs.**
2. **A dashboard redeploy** for the publish button.
3. **One more bridge restart** for the rate limiter.
4. **A stable tunnel hostname.** The quick tunnel re-mints on every restart. The site URL insulates
   already-sent links from that *only while the site knows the current tunnel* — `CAROUSEL_BRIDGE_URL`
   must be updated and the site redeployed on every tunnel bounce. For real subscriber traffic this
   needs a named tunnel (blocked on moving `mrdaniel.co.il` to Cloudflare) or object storage.
5. **Durability.** Files still live on one Windows machine; if the laptop sleeps every link 503s.
   Vercel Blob remains the structural fix, and the routing is shaped so swapping the redirect target
   is the only change needed.
6. **ManyChat itself** — no flow configured. It calls the public URL via an External Request button.

## 5A. News Post Composition (refactored 2026-09-08)

`NEWS_POST_SYSTEM_INSTRUCTION` in `src/agent/SocialAgentEngine.ts`, reached via
`/api/agent-generate` action `post-synthesize`. `src/server/newsPostComposer.ts` is only the HTTP
caller + deterministic fallback — **the prompt is not there.**

**Formatting is now per-channel.** The old single spec banned bullets and emoji outright, which suits
LinkedIn's register and fails an Instagram feed. Shared rules (no invention, no markdown, no URLs,
no external credits) stayed shared; only the visual shape split:

| | `IG_FORMAT_SPEC` | `LI_FORMAT_SPEC` |
|---|---|---|
| Length | 240–320 words (was 90–140) | 250–350 words (was 160–250) |
| Emoji | 6–10, one per findings line, **must all differ** | 0–3, mid-sentence only |
| Findings block | 3–5 emoji-led lines, one hard fact each | prose; max 3 `•` lines |
| Hook | emoji-led, typed (🚨 ⚡ 🔍 🎯 💡) | no emoji |

Bullets use `•` or an emoji, never `-`/`*` — `stripMarkdownEmphasis` strips markdown downstream and
those read as broken formatting on IG anyway. Verified that emoji, `•`, CVE ids and version strings
all survive `sanitizeHebrewText` → `stripMarkdownEmphasis` (8/8 local test).

**Principle 1 (extract every material fact) is explicitly subordinate to principle 2 (invent
nothing)** — the prompt says so in as many words, and instructs a shorter post when the source is
thin. That ordering is deliberate: a length floor that outranks the grounding rule is a padding
instruction.

Live verification against a real feed item (Anthropic/Decart, 881-char source):

| | Instagram | LinkedIn |
|---|---|---|
| Fact coverage | **13/13** | — |
| Words | 262 ✓ | 176 (under floor) |
| Emoji | 6, all distinct ✓ | 0 ✓ |
| URLs / markdown | none ✓ | none ✓ |
| Latency | ~17.8 s (60 s ceiling) | ~17 s |

LinkedIn undershooting on an 881-char source is the no-invention rule working, not a regression —
narrative prose needs more source material than a compact bullet block to reach its floor.

**Known residual:** the model occasionally names the reporting outlet ("בבלומברג") despite the
external-credit ban. It appeared in one of two runs. `stripSourceCredits` only removes `מקור:`-style
lines, not a mid-sentence mention.

## 5B. Public Download Landing Page (rebuilt 2026-09-08)

`src/pages/GuideDownloadPage.tsx`, registered in `src/App.tsx`. Three URL shapes:
`/download/:guideId` · `/download?id=<guideId>` · `/g/:guideId`.

### Reference-page finding (important)

The supplied design reference (`financy.open-finance.ai/blog/astra-prompting-financy-mcp/`) is a
**light-themed, text-only editorial article**: no hero image, no preview cards, no icon/feature grid,
and no conversion CTA block — its only CTAs are a nav login link and footer links. It does **not**
contain most of the patterns a brief might assume from it. What was genuinely extracted and applied:

| Reference pattern | Applied here |
|---|---|
| Eyebrow category above title | dynamic guide badge |
| Dominant title (~2.75rem, tight leading) | same scale |
| Muted subtitle line | value line |
| Metadata row: author · date · reading time | author · publish date · slide count · expiry |
| Hairline rule between hero and body | same |
| Narrow single column ~700px, generous rhythm, no card chrome | `max-w-[46rem]`, same rhythm |

The preview centrepiece, value grid and CTA pair come from the site's own brief, **not** the
reference. Don't re-derive them from that URL.

### Structure

Hero (badge → title → subtitle → metadata → rule) → 4:5 preview with `1 / N` counter → "מה תמצאו
במדריך" → CTA block. Bare route (no header/ticker/footer/cookie banner/assistant/3D scene) via the
`/^\/(?:download|g)(?:\/|$)/` early return in `App.tsx`. `noindex` — every URL is a per-recipient
capability token.

**Per-guide topics**: the bridge now captures slide headlines at publish time (`record.topics`) and
exposes them; `api/news.ts` passes them plus `createdAt` through. When present the page lists real
topics with right-border accent rows; when absent (guides published before this shipped, or after a
bridge restart wiped the in-memory job) it falls back to three format-based value cards rather than
inventing subject matter.

**Guide badge** is inferred from words in the title (סייבר / אוטומציה / AI → else "מדריך מעשי") —
the publish record has no category field and a confidently wrong category is worse than a generic one.

**Secondary CTA → `/#contact-portal`.** `#contact` does not exist anywhere on the site;
`<ContactPortal id="contact-portal">` does.

### Fixed while building this

`useScrollRestoration`'s hash branch called `smoothScrollTo` once on mount. `smoothScrollTo` silently
no-ops on a selector matching nothing, and on a COLD load of `/#contact-portal` the homepage's lower
sections have not mounted yet — so every hash deep-link into the homepage was dropped at the hero.
Now polls for the target (100ms × 25, ~2.5s) before scrolling. **Fixes all site hash deep-links, not
just this page's CTA.** Verified in-browser landing on ContactPortal.

**Live-verified in-browser:** hero, preview + counter, value cards, CTA block, all three URL shapes,
404 state, and the consultation link.

**Known:** cover slide is ~1.1 MB over the tunnel; a 4:5 skeleton reserves the space, but downscaled
thumbnails at publish time would be the real fix.

## 6. Open Items

| Item | State |
|---|---|
| `carousel-bridge/reference-library/` — 4 WhatsApp JPEGs | **Untracked, not wired in.** Few-shot style anchors remain inactive. |
| `THREADS_USER_TOKEN` | Absent — Threads integration non-functional despite `threadsApp:true`. |
| `THREADS_APP_SECRET` | Was pasted in plaintext in a chat session. **Should be rotated.** |
| `INSTAGRAM_OEMBED_TOKEN` | Absent — IG links hit the login wall; paste-caption is the supported path. |
| `/carousel/redesign` | Implemented, **never exercised end-to-end.** |
| `output/` retention | **Implemented** — 48 h sweep + 7 day guide TTL. First sweep removes 18 dirs / ~29 MB. |
| Dashboard `x-admin-secret` exposure | Structural; see §4.5. |
| Gemini free tier | 429s after the hourly cap. Permanent fix = paid key. |
| `CAROUSEL_BRIDGE_URL` on the **site** project | **Not set.** `/api/download/...` answers 503 until it is. |
| ManyChat itself | Backend + UI ready; no ManyChat flow configured yet. |
| Public-route rate limiting | **Implemented** (§5.6). Needs a bridge restart to go live. |
| Dashboard publish button | **Implemented** (§5.5). Needs a dashboard redeploy. |
| Site redeploy | **Required** — `/api/download/...` is undeployed, so it 404s today. |
| Tips & Guides publishing | Not possible yet — canvas-rendered, no bridge job. |
| Bridge restart (2nd pending) | Slide previews now serve `inline` instead of `attachment` — on disk, not live. |
| Cover thumbnails | Preview is the full ~1.1 MB slide; no downscaled variant exists. |
| Topics on old guides | Guides published before headline capture show fallback value cards; re-publish to populate. |
| Telegram CTA | No Telegram URL exists anywhere in the repo — secondary CTA is 'back to main site'. |
| Uncommitted work | §4.4 auth changes + §5 download stack are in the working tree, not committed. |

### Declined on principle (do not re-attempt without new direction)
- Instagram / Threads login-wall bypasses.
- A loopback auth exemption on the bridge while the tunnel is live.

---

## 7. Fast Verification Commands

```bash
# bridge alive + capability report
curl -s http://127.0.0.1:8787/health | python -m json.tool

# does the dashboard's secret still work?  400 = yes, 401 = rotated
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://mrdaniel.co.il/api/agent-generate \
  -H 'content-type: application/json' \
  -H "x-admin-secret: $(grep -aE '^ADMIN_API_SECRET=' carousel-bridge/.env | cut -d= -f2-)" \
  -d '{"action":"__probe__"}'

# does the DEPLOYED bundle carry the current secret?
asset=$(curl -s https://dashboard-snowy-psi-94.vercel.app/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
curl -s "https://dashboard-snowy-psi-94.vercel.app$asset" | grep -c "$SECRET"

# is a PM2 restart actually needed?  (pm2 CLI itself will EPERM)
powershell -c "(Get-Process -Id (Get-NetTCPConnection -LocalPort 8787 -State Listen).OwningProcess).StartTime"

# guard the function cap before adding to api/
ls -1 api/*.ts | wc -l    # must stay <= 12
```
