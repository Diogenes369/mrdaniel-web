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

## Working rules (from AGENTS.md)

- This codebase's comments explain **why**, often at length. **Do not delete or "tidy" them.**
- Match the surrounding file's style. Small, surgical diffs. No unrelated reformatting.
- Hebrew, RTL, natural Israeli phrasing for all user-facing + generated text. Never fabricate
  numbers or guarantees.
- Work on a feature branch. **Never run `vercel` / `npm run deploy*` — builds and deployments are
  Claude Code's alone, on the user's explicit ask.** You may prepare a change and hand it off.
- `npx tsc --noEmit` must pass (root **and** dashboard) before anything is called done.
