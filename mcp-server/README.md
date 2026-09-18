# mcp-server — local ops agent for mrdaniel.co.il

Two entry points that share one set of operations (`src/tasks.js`):

| Entry | What it is | How it runs |
|---|---|---|
| `src/server.js` | MCP server (stdio) for Claude Desktop / Claude Code | spawned by the client per session |
| `start-agent.js` | 24/7 background worker | PM2 (or Task Scheduler) |

Standalone package like `whatsapp-server/`: not an npm workspace, never deployed to Vercel.

## Setup

```powershell
cd mcp-server
npm install
npm run selftest        # drives every read-only tool through a real MCP client
```

No secrets live here. Config is read from `dashboard/.env` (`VITE_ADMIN_API_SECRET`) and the root
`.env` (`VITE_FIREBASE_*`). Anything in `mcp-server/.env` overrides them. See `.env.example`.

## Register the MCP server

**Claude Code** (from the repo root):

```powershell
claude mcp add mrdaniel-ops -- node "C:\Projects\My Website\mcp-server\src\server.js"
```

**Claude Desktop**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mrdaniel-ops": { "command": "node", "args": ["C:\\Projects\\My Website\\mcp-server\\src\\server.js"] }
  }
}
```

## Tools

| Tool | Does |
|---|---|
| `fs_list` / `fs_read` / `fs_write` | Workspace files. Sandboxed to the repo; `.env*`, `.vercel`, `.git`, `node_modules`, WhatsApp session and key files are refused |
| `business_metrics` | Traffic, conversions, leads pipeline, publishing record, approval backlog (counts only) |
| `health_check` | Site, `/api/health`, dashboard, news feed, authenticated agent API (401 = rotated secret) |
| `queue_list` / `queue_set_status` | `agent_queue` review states. Never publishes |
| `content_generate_draft` | One post via the live `generate-content` engine → `pending_approval` |
| `published_posts_list` | Auto-publisher history |
| `leads_list` / `lead_set_status` | Leads (masked unless `includePii`) and pipeline status |
| `ollama_models` | Version + installed models of the local Ollama. Run it first when an `ollama_*` call fails |
| `ollama_generate` / `ollama_json` / `ollama_translate` | Local generation. `ollama_json` is constrained to a JSON Schema, so the result parses |
| `caption_check` / `caption_write` | Short-form caption rules: ≤3 sentences, ≤45 words, one CTA, no URLs, no AI clichés |
| `figma_whoami` / `figma_read_file` / `figma_styles` / `figma_components` | Figma REST reads: node tree with every TEXT layer's copy, design tokens, components |
| `figma_export` | Render nodes to PNG/SVG/JPG into the workspace (what Figma has **saved**) |
| `figma_bridge_status` | Is the plugin bridge up, and is the plugin attached? |
| `figma_inject_text` / `figma_swap_image` / `figma_set_variant` | Writes, through the plugin. REST cannot do these |
| `figma_plugin_export` | Render through the plugin — sees unsaved edits, so use it straight after an injection |
| `figma_render_slides` | Inject + export per slide. Deck in, PNGs on disk out |

Resources: `mrdaniel://docs/agents`, `mrdaniel://metrics/weekly`, `mrdaniel://queue/pending`, `mrdaniel://agent/log`.
Prompt: `morning_ops_brief`.

Nothing here posts to a social network or emails a lead. Those stay one human click away in the dashboard.

## Local models — what they are and are not for

`OLLAMA_MODEL=qwen2.5`. Use the local model for JSON structuring, English drafting, and dry-running
a prompt before spending Gemini quota.

**Do not ship Hebrew from it.** Measured on this machine, both installed models mangle Hebrew badly
enough to be unpublishable — `llama3:8b` produces broken word order, and `qwen2.5:7b` corrupts
tokens outright (`הצ'*אט봇ים`, `ש]={`, `המ?>>וטטים` are all real output from the caption test).
`caption_check` now flags those as `garbled` and `caption_write` returns `ok:false`, so nothing
silently reaches the queue, but the fix is the model, not the checker. Hebrew for publication goes
through `content_generate_draft` → the live Gemini engine, which carries the voice rules.

## Figma

Two halves, because the Figma REST API **cannot mutate a node** — its only writes are comments,
webhooks, dev resources and (Enterprise-only) variables. Setting `characters` on a text node or
swapping an image fill exists solely in the Plugin API, which runs inside the desktop app.

| Half | Needs | Does |
|---|---|---|
| REST (`src/figma.js`) | `FIGMA_TOKEN` | Read node trees, design tokens, components; export saved frames |
| Plugin (`figma-plugin/` + `src/figma-bridge.js`) | The bridge running + the plugin open | Inject text, swap fills, switch variants, export unsaved edits |

The plugin is sandboxed and cannot listen on a socket, so it dials *out* to a local relay:

```
figma-plugin (Figma desktop)  ──ws──▶  bridge :3055  ◀──ws──  MCP tools
```

```powershell
npm run figma:bridge     # start the relay (loopback only; keep it running)
npm run test:bridge      # 11 protocol checks against a mock plugin — no Figma needed
npm run test:copy        # 24 caption-rule checks
```

Then in Figma desktop: **Plugins → Development → Import plugin from manifest…** → pick
`mcp-server/figma-plugin/manifest.json`, and run it on the file you want to drive. Its window must
stay open — closing it kills the socket.

Layer **names** are the contract, not node ids: `figma_inject_text` fills by name so one template
frame can be duplicated per slide without re-reading ids every time.

## Figma → video

```powershell
node scripts/generate-code-video.mjs figma --run <run-dir>
```

Copies exports from `video-projects/_figma-assets/` into the run's `composition/assets/figma/` and
writes a manifest with each asset's pixel size. The copy is required, not cosmetic: HyperFrames only
serves files inside the composition directory, and `hyperframes check` fails a render on
`missing_local_asset` for anything referenced from outside it.

## The worker

```powershell
npm run agent:once                 # health + metrics once, then exit
node start-agent.js --once --draft # …and queue one draft
npm i -g pm2; npm run pm2:start    # 24/7
pm2 save; pm2-startup install      # survive reboots on Windows (npm i -g pm2-windows-startup)
```

Schedule (env-configurable): health every 15 min (alerts only when the failing set changes),
metrics snapshot every 6 h into `.agent-state/metrics-<date>.json`, one draft per Israel calendar day
from 09:00 (catches up if the machine was asleep). Today's topic comes from `weekly_plan`, else a
fixed rotation. Log: `.agent-state/agent.log` (rotates at 5 MB). One instance at a time (PID lock).

Set `AGENT_NOTIFY_WEBHOOK` to receive `{ "text": "..." }` alerts.

## Firebase access

Without `FIREBASE_SERVICE_ACCOUNT` the anonymous web client is used. It reads the open paths and
cannot write `agent_runtime/local` (the heartbeat is skipped). With a service account, the rules
don't apply and the heartbeat is written.
