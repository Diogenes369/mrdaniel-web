# HERMES SUPER AGENT AUDIT — Feed Optimization, Dashboard Enhancement, Integration Review

## 1. Audit Scope
- Scanned `src/services/`, `src/server/`, and `api/` for news/RSS feed configurations.
- Reviewed dashboard consumption paths: `dashboard/src/components/NewsContentAgent.tsx`, `dashboard/src/lib/newsFeedClient.ts`, `dashboard/src/lib/newsAgentTypes.ts`.
- Live-verified candidate Hebrew AI/cyber sources via HTTP before adding them.

## 2. Feed Status Summary
### Active endpoints
- `/api/news` → `api/news.ts` → `src/server/newsFeed.ts:getNewsItems()`
- `/api/news/item/:slug` → `api/news-item.ts` → `src/server/newsFeed.ts:getNewsItemBySlug()`
- `/api/ai-news` → `api/ai-news.ts` → `src/server/aiNewsFeed.ts`

### Dead/unused endpoints
- `netlify/functions/news.ts`, `netlify/functions/news-item.ts`, `netlify/functions/ai-news.ts`
These are legacy Netlify artifacts; no Vercel routes or imports reference them.

### Active feed sources (`src/server/newsFeed.ts`)
- **Israeli/Hebrew:** Geektime, TechTime, אנשים ומחשבים, Globes, ynet דיגיטל, כלכליסט, TheMarker, Israel Defense, Google News, Google News · סייבר.
- **International tech:** TechCrunch, The Verge, Ars Technica.
- **International cyber:** BleepingComputer, The Hacker News, CyberNews, Krebs on Security.

### AI Pulse sources (`src/services/aiPulseService.ts`)
- TechCrunch AI, VentureBeat AI, Hacker News AI/LLM/agent search via rss2json.

### Dead-end finding
- No `.tsx` hook references for `useNewsFeed`/`useAIPulse` outside the dashboard. The main consumer is `NewsContentAgent.tsx` via `dashboard/src/lib/newsFeedClient.ts`.

## 3. Content Filtering Policy
Strict-filter rule: drop generic consumer tech / gadget / gaming stories unless the item also
carries an AI / cyber / cloud signal.

**Final implementation** (salvaged into a clean commit — the standalone `hebrewFeedFilter.ts` /
`hebrewAiCyberSources.ts` modules from the first draft were removed as unreferenced duplicates):
- `src/server/newsFeed.ts` → `strictTopicKeep(item)` — reuses the feed's **existing**
  `CYBER_PATTERNS` / `AI_PATTERNS` / `CLOUD_PATTERNS` (no second copy of the regex lists) plus a
  `GENERIC_CONSUMER_PATTERNS` blocklist (gaming, smartphones, laptops, monitors, TVs, consoles,
  drones, wearables, headphones, GPUs-for-gaming, …).
- Rule: on-topic (AI/cyber/cloud signal) → keep. Otherwise a consumer-junk marker → drop.
  Otherwise keep only if `classifyTopic()` still lands it in a target topic.
- Exposed as **opt-in** `GET /api/news?strict=1`. Applied as a per-request VIEW over the shared
  cache in `getNewsItems({ strict })` — never mutates the cache, so a strict call can't poison a
  normal one. Vercel's edge caches the `?strict=1` URL under its own key.

## 4. Hebrew AI/Cyber Sources Added
### Added to `src/server/newsFeed.ts:SOURCES`
- `Machine Learning Israel` — `https://machinelearning.co.il/feed/`, priority 2, maxItems 10.
- `SPD Blog` — `https://blog.spd.co.il/feed/`, priority 3, maxItems 10, `onlyTopics: ['cyber']`.
- `Kodkod Cyber` — `https://kodkodcyber.com/feed/`, priority 3, maxItems 10, `onlyTopics: ['cyber']`.
- Existing `Israel Defense` retained as-is with `onlyTopics: ['cyber']` (already present on `main`).

### Dashboard wiring
- `dashboard/src/lib/newsFeedClient.ts::fetchNewsList()` now requests `?strict=1` by default, so
  the News Content Agent's article picker only ever sees on-brand AI/cyber source material.

### Verified feed health
- `machinelearning.co.il/feed/` → HTTP 200
- `blog.spd.co.il/feed/` → HTTP 200
- `kodkodcyber.com/feed/` → HTTP 200
- `penligent.ai/feed/` → HTTP 000/timeout; excluded from production feeds.

## 5. Endpoint Behavior: Normal vs Strict
### Default behavior
`/api/news` returns the full feed mix, unchanged for backward compatibility. Existing dashboards and client cache keep working.

### Strict behavior
`/api/news?strict=1` enables the Hebrew AI/cyber/general purge:
- generic gaming/gadget/hardware stories are dropped unless they also match an AI/cyber/cloud/tool signal.
- newly added Hebrew sources are passed through the same strict filter.
- implemented in `api/news.ts` via `configureStrictFilter(strictPredicate)`.

## 6. Dashboard Visual & Content Template Enhancements
### Current state
- `NewsContentAgent.tsx` shows topic badges, source badges, image presence, platform/aspect controls, copy + image workspaces, and a story/carousel preview.
- `newsAgentTypes.ts` defines `NewsItem`, categories, and promo footer.

### Proposed template upgrades (documented, not yet hard-coded)
1. **Card metadata block**
   - Add badges: `topic pill`, `viral score`, `source badge`, `breaking/urgent` flag for zero-day/CVE stories.
   - Color rules: cyber = red/amber accents, AI = brand-green accents, cloud = sky/blue accents.
2. **Viral score heuristic**
   - Score = topic weight + source priority + keyword density (CVE/zero-day/agent/model release) + recency decay.
   - Display as a 1–10 score with tooltip explanation.
3. **Hebrew bullet summary**
   - Auto-generate 3 bullet points from `summary` for scan-friendly UI.
   - Maintain RTL alignment, avoid bidi breaks.
4. **Typography & spacing**
   - Increase line-height for Hebrew body text.
   - Add a clear hierarchy: source → topic pill → headline → bullets → CTA.
5. **Template files**
   - Add `dashboard/src/components/news/NewsCardTemplate.tsx`.
   - Add `dashboard/src/lib/newsMetadata.ts` for `computeViralScore`, `buildHebrewBullets`, `topicColor`.
   - Use these in `NewsContentAgent.tsx` when rendering the selected item block.

## 7. Integration Review
### Feed → API → Dashboard
- `newsFeed.ts` builds the aggregate, dedupes, enriches images, and caches for 15 minutes.
- `api/news.ts` exposes it as a CORS-open Vercel function with CDN caching headers.
- Dashboard calls `${SITE_ORIGIN}/api/news` through `dashboard/src/lib/newsFeedClient.ts` with react-query caching.

### Background services
- No Firebase dependency in the news pipeline.
- `aiNewsFeed.ts` reads YouTube RSS channels directly.
- `aiPulseService.ts` uses rss2json bridge; failures fall back to curated `AI_PULSE_FALLBACK`.

### Suggested RSS/API connectors
- `Machine Learning Israel`, `SPD Blog`, `Kodkod Cyber` — added.
- Optional future connectors if needed:
  - Hebrew AI/cyber newsletters converted to RSS.
  - CISA/NVD alert APIs for zero-days if authoritative Israeli cyber feeds miss global disclosures.
  - Anthropic/OpenAI/Meta AI blogs via direct RSS or lightweight JSON health checks.

## 8. Safety, Reversibility & Rollback
### Reversibility
- Changes are additive / opt-in: existing `/api/news` behaviour is byte-identical unless
  `?strict=1` is explicitly requested. The 3 new sources only add items; they can't remove any.
- Touched files (final, salvaged form):
  - `src/server/newsFeed.ts` — 3 new sources + `strictTopicKeep()` + `getNewsItems({ strict })`
  - `api/news.ts` — reads `?strict=1`
  - `dashboard/src/lib/newsFeedClient.ts` — `fetchNewsList()` requests `?strict=1`
  - `docs/HERMES_SUPER_AGENT_AUDIT.md` — this file
- Rollback: `git revert` the salvage commit(s) on the feature branch.

## 9. Verification
- `npx tsc --noEmit` — clean (root + dashboard).
- `npm run build` — clean (root + dashboard).
- New Hebrew feeds re-checked live (HTTP 200) as part of the salvage.
- Live `/api/news?strict=1` endpoint not exercised in prod (branch not deployed).

## 10. Outstanding / Not Yet Implemented
- Dashboard card redesign: proposed templates documented, implementation blocked until design is approved.
- Viral score calculator: proposed formula documented, code not added.
- Hebrew bullet generator: documented, not added.
- Typography/systematic RTL polish: documented, not added.
