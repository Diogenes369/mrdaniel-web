# Code → showcase video (`/brag` + HyperFrames)

Turns a slice of this monorepo into a short, shareable launch video: a 15–25s MP4 with music,
motion and share copy, rendered **locally** (headless Chrome + FFmpeg). No HeyGen account, no API
key, no Docker.

## What is installed, and where

| Piece | Location | What it is |
|---|---|---|
| `brag` skill | `~/.claude/skills/brag/` | The creative half: reads the code, picks the angle, writes the storyboard. Ships its own music + SFX (17 MB), so it lives outside the repo. |
| `hyperframes-*` skills | `~/.claude/skills/` | `core`, `animation`, `creative`, `keyframes`, `cli` — the composition contract `/brag` hands off to. Installed with `npx hyperframes skills`. |
| Wrapper | `scripts/generate-code-video.mjs` | The mechanical half: code brief, scaffold, check gate, render, publish. |
| Runs | `video-projects/<stamp>-<slug>/` | Brief, plan, composition and the local `brag.mp4`. Gitignored. |
| Published videos | `dashboard/public/generated-videos/` | Served by the dashboard at `/generated-videos/<name>.mp4`. Committed. |

**`/brag` is a skill, not a binary.** Nothing can "call brag" from a script — a skill is instructions
an agent follows. The wrapper owns everything deterministic around it; the agent owns the story.

## Prerequisites

Already satisfied on this machine — `npm run video:doctor` re-checks them:

- Node 22+ (have 24), FFmpeg + FFprobe on `PATH`, desktop Chrome.
- `whisper-cpp`, Kokoro TTS, MusicGen and Docker all report ✗ and that is fine: they are only for
  narration, generated music and containerised rendering. `/brag` keeps voice off by default and
  ships its own music.

The HyperFrames CLI version is pinned in the wrapper (`HYPERFRAMES`), so a rerun months from now
renders the same way. Bump it deliberately.

## Running it

```powershell
npm run video:doctor                                   # skills + render dependencies
npm run video:start -- --paths mcp-server --since HEAD~5 --title "MCP ops server"
```

`start` writes `code-brief.md` (file/line counts, the biggest hand-written files, the README head,
and the commits in the range) and scaffolds a HyperFrames project. It then prints the prompt to hand
to Claude Code:

```
/brag --tone polished
Use video-projects/<run>/code-brief.md as the source material, write the plan to
video-projects/<run>/, and author the composition in video-projects/<run>/composition/.
```

The agent authors `composition/index.html`. Then:

```powershell
node scripts/generate-code-video.mjs check  --run <run>            # the gate: lint + runtime + layout + contrast
npm run video:render -- --run <run> --publish                      # render, poster, copy to the dashboard
npm run video:list                                                 # every run and how far it got
```

`--run` takes either a directory name under `video-projects/` or a path.

### Flags worth knowing

| Flag | Where | Effect |
|---|---|---|
| `--paths a,b` | `start`, `brief` | Which modules the brief covers (repo-relative, comma-separated). |
| `--since <rev>` | `start`, `brief` | Adds the commits and diffstat for `<rev>..HEAD` touching those paths. |
| `--format vertical\|square` | `start`, `scaffold` | Canvas preset; default `landscape` (1920×1080). |
| `--publish` | `render` | Copy `brag.mp4` + poster into `dashboard/public/generated-videos/`. |
| `--name <slug>` | `publish` | Published filename; defaults to the run directory name. |

## Verified run

`video-projects/2026-09-18-203739-mcp-ops-server/` — a showcase of `mcp-server/`:

- `check` → 0 errors, 43/43 contrast checks pass.
- `render` → 19.0s, 1920×1080 @ 30fps, H.264 + AAC, 3.1 MB, in 35.7s on this machine.
- Published to `dashboard/public/generated-videos/2026-09-18-203739-mcp-ops-server.mp4`.

Its `composition/index.html` is a working reference for the contract: one paused GSAP timeline at
`window.__timelines["main"]`, scenes as `.clip` sections with `data-start`/`data-duration`, cuts
placed on the bundled track's beat grid, and audio level carried by the timeline rather than
`data-volume`.

## Windows notes

Both real pitfalls are already handled in the wrapper, but they will bite anything else that shells
out here:

- `npx` is `npx.cmd`, and since Node 20 spawning a `.cmd` without a shell throws `EINVAL`. The
  wrapper runs that one command through a shell as a single pre-quoted string — an argv array with
  `shell: true` is deprecated (DEP0190) because Node concatenates it unquoted, and this repo's path
  contains a space.
- `hyperframes init` checks its skills registry over the network on every run. The wrapper sets
  `HYPERFRAMES_SKIP_SKILLS=1` so scaffolding stays offline and fast.

## If you want it as an MCP tool

`mcp-server/` could expose `video_render` / `video_publish` wrappers around this script, so the
Claude Desktop session can render without a terminal. It is not wired up — the creative step still
needs an agent with repo access, so the terminal path is the honest one for now.
