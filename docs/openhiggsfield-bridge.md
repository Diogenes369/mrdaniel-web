# OpenHiggsfield AI bridge

38 image and video models (8 image, 30 video) behind one brief, wired into this repo's synthesis
pipeline, the dashboard and Hermes.

Upstream: <https://github.com/wide-trace/open-higgsfield> — "OpenHiggsfield AI", a Next.js 16 /
React 19 studio that is an open-source alternative to Higgsfield AI.

## What is where

| Path | Role |
| --- | --- |
| `vendor/open-higgsfield/` | The upstream clone. Gitignored, never deployed. Reference + a local studio UI. |
| `src/agent/openhiggsfield/` | The framework-free half of its generation layer, vendored. **Generated — do not edit.** |
| `scripts/sync-openhiggsfield.mjs` | Refreshes that copy from `vendor/` (`npm run sync:higgsfield`), `--check` for drift. |
| `src/agent/OpenHiggsfieldEngine.ts` | Our wrapper: keys, validation, submit, poll, one result shape. |
| `src/server/openHiggsfieldActions.ts` | The four `higgsfield-*` actions of `/api/agent-generate`, shared by the Vercel handler and `server.ts`. |
| `mcp-server/src/openhiggsfield.js` | Hermes's client for those actions — the `higgsfield_*` tools. |
| `scripts/__tests__/openhiggsfield-bridge.test.mjs` | Catalog + mapping + refusal tests, no keys, no network. |

### Why the studio isn't running as a service

Its generation layer is a thin client over a queue API — `POST /{model}` to submit,
`GET /requests/{id}/status` to poll, `Authorization: Key <id>:<secret>`, and a per-model catalog that
declares which settings and media roles each model accepts. All of that is plain TypeScript with no
Next, React or store imports, so it is copied into `src/agent/openhiggsfield/` and called from our own
Vercel functions. Standing a second Next app up in front of it would add a hop and a deploy target
without adding a capability.

What stays upstream: the React studio, the server actions, the httpOnly-cookie key jar, the Zustand
stores, the IndexedDB history, the Vercel Blob upload route. Run `pnpm dev` in
`vendor/open-higgsfield` when you want the studio itself (prompt bar, gallery, viewer) — it is the
nicest way to explore what a model does before pinning a prompt into the pipeline.

## Setup

```bash
# 1. the clone (gitignored — re-clone on a fresh checkout)
git clone https://github.com/wide-trace/open-higgsfield vendor/open-higgsfield
cd vendor/open-higgsfield && pnpm install && cd ../..

# 2. refresh the vendored catalog (only needed after pulling upstream changes)
npm run sync:higgsfield
npm run sync:higgsfield -- --check   # drifted? exits 1 and names the files

# 3. the tests that prove the mapping still holds — no keys, no quota
npm run test:higgsfield
```

Env (root `.env.local` for dev, Vercel project env for production — both documented in
`.env.example`):

| Variable | Needed for | Notes |
| --- | --- | --- |
| `HF_API_BASE_URL` | every run | The platform origin. Upstream ships it blank; the wire contract is fal.ai's queue API (`https://queue.fal.run`) — confirm before relying on it. |
| `HF_API_KEY` | every run | `id:secret`. A key without the colon is reported missing, not sent. |
| `ADMIN_API_SECRET` | every action | These actions live on `/api/agent-generate`, which gates the whole endpoint. Runs are billable, so that gate is the point. |
| `SITE_ORIGIN` | optional | `mcp-server/.env` only — point Hermes at `http://localhost:3099` to drive a local dev server. |

The studio's own `.env.local` (`vendor/open-higgsfield/.env.local`) needs `HF_API_BASE_URL` and,
only if you want to upload start frames or references through its UI,
`OPEN_HIGGSFIELD_READ_WRITE_TOKEN` (a Vercel Blob read-write token). The studio takes the platform
key in its "Add key" modal rather than from env.

Nothing here reuses an existing key in this repo: this is a different platform from Gemini, Runway,
HeyGen, Replicate or Kling (`VideoGenerationEngine.ts`). Those five stay exactly as they were.

## HTTP

There is no `/api/openhiggsfield`: `api/` holds exactly 12 functions and Vercel Hobby caps a
deployment at 12 (PROJECT_STATE §1.4), so this folds into `/api/agent-generate` as four actions —
the same way the news auto-publisher shares that function. POST only, `x-admin-secret` required
once one is configured.

```bash
A=https://mrdaniel.co.il/api/agent-generate
H="content-type: application/json"
S="x-admin-secret: $ADMIN_API_SECRET"

# the catalog — ids, labels, per-model settings and input roles
curl -s -X POST $A -H "$H" -H "$S" -d '{"action":"higgsfield-models","surface":"video","search":"kling"}'
# -> { ok, configured, missingKeys, counts: { total, image, video }, models: [...] }

# one model's allow-list
curl -s -X POST $A -H "$H" -H "$S" -d '{"action":"higgsfield-model","model":"kling-3-turbo"}'

# queue a 9:16 cover image, return immediately
curl -s -X POST $A -H "$H" -H "$S" -d '{
  "action":"higgsfield-generate","model":"soul-2",
  "prompt":"a lit server rack in a dark room, cinematic",
  "settings":{"aspectRatio":"9:16","resolution":"1080p"}}'
# -> 202 { ok, run: { requestId, model, surface, status: "queued" } }

# poll it
curl -s -X POST $A -H "$H" -H "$S" -d '{"action":"higgsfield-status","requestId":"<id>"}'
# -> 200 { ok, run: { status: "done", urls: ["https://…"], images: [...], video? } }

# or block until it finishes — capped at 90s, because agent-generate's own ceiling is 120s
curl -s -X POST $A -H "$H" -H "$S" -d '{"action":"higgsfield-generate","model":"soul-2","prompt":"…","wait":true}'
```

A blocking `wait` that hits the 90s cap is **not** an error: the answer carries the run as
`processing` plus a note, and the `requestId` stays pollable. Video runs (especially 4K Kling and
long Seedance) belong on the poll path.

Status codes: `503` with `missingKeys` when the platform env is absent (nothing was attempted),
`400` for a brief the catalog rejects, `502` for a run the platform failed, and the platform's own
status when it answers one (a `401` there means the key, not the admin secret).

Input media goes in by role, as public http(s) URLs — `start`, `end`, `reference`, `video`, `audio`,
either a single URL or an array. A role the chosen model doesn't declare is **rejected**, not
dropped, so a start frame can never go missing behind a successful-looking text-to-video run. The
same goes for settings: each model's allow-list comes from the catalog, and an out-of-range duration
or an unknown enum fails before anything billable is sent.

Runs are not persisted. The platform keeps the request, the caller keeps the `requestId`; if a queue
card needs to remember a render, store the returned URL on the card (result URLs live on the
platform's CDN and can expire — mirror anything you intend to publish).

## From the pipeline

```ts
import { generateHiggsfieldMedia, listHiggsfieldModels } from '../agent/OpenHiggsfieldEngine';

const run = await generateHiggsfieldMedia({
  model: 'soul-2',
  prompt: 'abstract dark network topology, lime accent, no text',
  settings: { aspectRatio: '9:16', resolution: '1080p' },
});
if (run.status === 'done') useImage(run.urls[0]);
else console.error('[carousel] no cover image:', run.error ?? run.platformStatus);
```

`startHiggsfieldRun` / `waitForHiggsfieldRun` split the same thing in two when the caller wants to
queue several runs and collect them later. `higgsfieldConfigured()` and
`describeMissingHiggsfieldKeys()` answer "can this run at all" without throwing, the same contract
`VideoGenerationEngine.ts` uses.

Two house rules apply to prompts:

- **Write the visual prompt in English** even when the post is Hebrew. These are visual models; the
  Hebrew copy lives in the caption and on the slide, rendered by our own templates.
- **Never ask for text in the image.** Slide copy, links and keywords are painted by
  `storyCarousel`/Figma, and `stripSlideCta` exists precisely so no link ever lands on a slide.

## Hermes tools

| Tool | What it does |
| --- | --- |
| `higgsfield_models` | The catalog, filterable by `surface` / `search`, plus whether the site holds the keys. Call before generating. |
| `higgsfield_generate` | One run: `model`, `prompt`, optional `media` + `settings`, `wait` (default true), `timeoutSeconds` (≤85). **Billable.** |
| `higgsfield_status` | One poll of a `requestId`. |

They go through `callAgent()` — the same path `content_generate_draft` uses — so `HF_API_KEY` never
lands on this machine, and all three refuse outright when no admin secret is configured rather than
hoping the endpoint is still failing open.

## Refreshing upstream

```bash
git -C vendor/open-higgsfield pull
cd vendor/open-higgsfield && pnpm install && pnpm build && cd ../..
npm run sync:higgsfield
npm run test:higgsfield     # catches a renamed model id or a changed submit path
```

The sync script refuses to copy a file that has grown a `next`, `react`, `zustand` or store import:
such a file can't run inside a Vercel function here, and finding that out at sync time beats finding
it out at deploy time.
