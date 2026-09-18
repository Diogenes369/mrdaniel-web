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
| `figma_set_layer_name` | Rename a layer and pin the name. Template prep — see the autoRename note below |
| `figma_plugin_export` | Render through the plugin — sees unsaved edits, so use it straight after an injection |
| `figma_render_slides` | Inject + export per slide. Deck in, PNGs on disk out |

Resources: `mrdaniel://docs/agents`, `mrdaniel://metrics/weekly`, `mrdaniel://queue/pending`, `mrdaniel://agent/log`.
Prompt: `morning_ops_brief`.

Nothing here posts to a social network or emails a lead. Those stay one human click away in the dashboard.

## Which model does what

| Work | Goes to |
|---|---|
| Hebrew for publication | `content_generate_draft` → the live Gemini engine |
| Structural logic, JSON shaping, English copy, prompt dry-runs | Ollama (`OLLAMA_MODEL=qwen2.5`) |

Gemini-only routing for publication is structural, not a convention: `GEMINI_API_KEY` is a
Vercel-only secret, so `content_generate_draft` posts to the deployed `/api/agent-generate` and the
local models are never in that path. The voice rules, the AI-phrase scrubber and the queue write all
live there too.

What the local models *cannot* do is Hebrew. Measured here, both mangle it past use:

| Model | Real output |
|---|---|
| `llama3:8b` | broken word order (`אתם מה עושים?`) |
| `qwen2.5:7b` | `הצ'*אט봇ים` (Hangul mid-word), `ש]={`, `המ?>>וטטים`, `הגCPPות` |

So every `ollama_*` result carrying Hebrew comes back tagged `publicationSafe: false` with the
reason. The text is still returned — it is useful for drafting and for reading a source — but
nothing can mistake it for finished copy. `caption_write` is a draft aid by description and never
reports `publicationSafe: true` for Hebrew, however cleanly it scores: `caption_check` measures
*shape*, and mangled words are shaped fine. `caption_check` separately flags `garbled` tokens
(foreign scripts, code punctuation, mid-word script changes) while leaving real mixed-script copy
like `Wi-Fi 7`, `ה-AI` and `Full-Stack` alone.

The same models are genuinely good at the other half — English and JSON come back clean.

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

Port 3055 is pinned in three places — `figma-plugin/manifest.json`, `figma-plugin/ui.html` and
`FIGMA_BRIDGE_PORT`. A Figma manifest is static and its UI is a sandboxed iframe, so the plugin
cannot read the env var; change the port and you must edit all three, or the plugin dials a port
nothing answers on. `npm run figma:bridge` warns when they disagree.

The manifest says `ws://localhost:3055`, with the hostname spelled out: Figma rejects an IP literal
in `allowedDomains` ("must be a valid URL"). `localhost` resolves to `::1` before `127.0.0.1` on
Windows, so the bridge binds **both** loopback addresses rather than trusting the client to fall
back.

```powershell
npm run figma:bridge     # start the relay (both loopback addresses; keep it running)
npm run test:bridge      # 14 protocol checks against a mock plugin — no Figma needed
npm run test:copy        # 34 caption-rule checks
```

Then in Figma desktop: **Plugins → Development → Import plugin from manifest…** → pick
`mcp-server/figma-plugin/manifest.json`, and run it on the file you want to drive. Its window must
stay open — closing it kills the socket.

Layer **names** are the contract, not node ids: `figma_inject_text` fills by name so one template
frame can be duplicated per slide without re-reading ids every time.

For that to hold, a text layer must be named for what it **is** (`headline`, `body`, `cta`), not for
what it currently says. Figma gives every text layer you never renamed by hand `autoRename: true`
and re-derives its name from its content on each edit — so injecting into `headline` renames it to
the headline text, and the next run cannot find `headline` at all. The plugin clears `autoRename`
before every write, and `figma_set_layer_name` clears it when naming a layer, so a template only has
to be set up once. `get_text_nodes` reports the flag per layer: `false` means the name is pinned and
safe to match on.

Changing the plugin's `code.js` needs the plugin re-run in Figma; changing the bridge's command
whitelist needs `npm run figma:bridge` restarted. They are separate processes and reload separately.

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
