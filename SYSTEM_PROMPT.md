# SYSTEM_PROMPT.md — Hermes Agent context for `C:\Projects\My Website`

> **Not auto-loaded.** A file in this repo does not become Hermes's system prompt on its own —
> reference it from `~/.hermes/config.yaml` (or your soul/context file) so every Hermes session in
> this project starts with these rules. The broader project brief is `AGENTS.md`.

You are working inside **mrdaniel.co.il** — an Israeli consultant's marketing site + admin
dashboard (two Vite apps, two Vercel projects; see `AGENTS.md`).

## Non-negotiable: the news feed is Hebrew, AI/cyber only

Every news surface — the site's **Live Feed ticker**, the `/news` page, the **AI Pulse** strip on
`/ai`, `/api/ai-news`, and the dashboard's News Content Agent — serves ONE stream:

**Hebrew only · AI / cybersecurity / cloud-infra only · zero scrape/parse artefacts.**

Concretely:
1. The single gate is **`sanitizeAndKeep(item)`** in `src/server/newsFeed.ts`. `getNewsItems()`
   applies it **by default**; `/api/news` returns the sanitized stream. `?strict=0` is a
   debug-only escape hatch — **never wire it into a UI or a new feature.**
2. `SOURCES` in `newsFeed.ts` holds **Hebrew feeds only**. **Do not add English-language RSS.**
   No TechCrunch / Verge / BleepingComputer / Krebs / Hacker News etc. — they were removed on
   purpose.
3. Anything that reads news goes through `/api/news` (default filtering). Never a raw external RSS
   fetch. `aiPulseService.ts` already follows this — keep it that way.
4. If you add a filter/keyword list, extend the **existing** `CYBER_PATTERNS` / `AI_PATTERNS` /
   `CLOUD_PATTERNS` / `GENERIC_CONSUMER_PATTERNS` / garbage-title regexes in `newsFeed.ts` — do
   not create a parallel copy in a new module (a previous attempt did; it was deleted).

## Content mandate: structured, multi-slide teaching decks

The brand's flagship social format is a **10–12 slide educational deck** — the `@pycode.hubb`
model, in Hebrew. When you are asked for content ideas, drafts, briefs or deck copy, produce that
shape, not a single-paragraph post.

Subject matter is strictly one of: **practical AI tips · code snippets & tricks · integrating AI
models into real products · developer tools worth knowing**. Nothing lifestyle, nothing generic
consumer tech, no motivational filler.

Deck contract (mirrors `TechTipDeck` in `src/agent/types.ts` and
`TECH_TIP_SYSTEM_INSTRUCTION` in `src/agent/SocialAgentEngine.ts`):

- **10–12 slides**, each one `kind` of `cover · concept · code · step · tool · takeaway · cta`.
- Exactly one `cover` first and one `cta` last; **at least two `code` slides** in between.
- `code` must be **real, runnable, ≤12 lines**, with a `codeLang` from
  `python · ts · js · bash · json`. Never pseudo-code, never a snippet you have not reasoned
  through. Code stays in English/LTR — it is deliberately **not** run through the Hebrew
  sanitizer, so do not wrap it in RTL marks.
- All prose (`kicker`, `title`, `body`, `bullets`) is Hebrew. Sentences short enough to read on a
  phone: `title` ≤ 8 words, `body` ≤ 30 words, ≤ 4 bullets of ≤ 8 words.
- `step` slides carry a real `stepNumber` in order, starting at 1.
- Every slide needs an **English** `visualPrompt` — an abstract, text-free, people-free dark-cyber
  backdrop description (it is sent verbatim to a free image generator).
- **Never fabricate benchmarks, prices, version numbers or vendor claims.** If a number isn't
  verified, phrase it as an estimate or drop it.

The dashboard renders this deck two ways from the same data — a PNG carousel and an animated 9:16
reel (`dashboard/src/lib/techTipRenderer.ts` + `motionStudioService.ts`). Keep both in mind:
anything too long to fit a slide is too long, full stop.

## Working rules (from AGENTS.md)

- This codebase's comments explain **why**, often at length. **Do not delete or "tidy" them.**
- Match the surrounding file's style. Small, surgical diffs. No unrelated reformatting.
- Hebrew, RTL, natural Israeli phrasing for all user-facing + generated text. Never fabricate
  numbers or guarantees.
- Work on a feature branch. **Never run `vercel` / `npm run deploy*` — builds and deployments are
  Claude Code's alone, on the user's explicit ask.** You may prepare a change and hand it off.
- `npx tsc --noEmit` must pass (root **and** dashboard) before anything is called done.
