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

Resources: `mrdaniel://docs/agents`, `mrdaniel://metrics/weekly`, `mrdaniel://queue/pending`, `mrdaniel://agent/log`.
Prompt: `morning_ops_brief`.

Nothing here posts to a social network or emails a lead. Those stay one human click away in the dashboard.

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
