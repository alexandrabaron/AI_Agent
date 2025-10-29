AI-Agent Based Engineering Time Series Data Analysis System (M2)

## Table of Contents
- Project Overview
- Architecture at a Glance
- Why These Technical Choices
- Phase Plan and Deliverables
- Supabase Setup (Step-by-Step)
- Configure Environment (Step-by-Step)
- n8n Workflow (Step-by-Step Tutorial)
- Running the Web UI
- Security, Auth, and Policies
- Observability and Debugging
- Roadmap and Extensions

## Project Overview
This project builds a natural-language agent for time series analysis that orchestrates tools to replace manual coding. It is designed to be production-ready, maintainable, and extensible, with a clear path from CLI prototypes to a web UI connected to Supabase and an n8n-based agent using your local Llama 3.

You will use:
- LLM: Local Llama 3 (via Ollama or llama.cpp/OpenAI-compatible server)
- Agent Orchestration: n8n (local)
- Storage/DB/Auth: Supabase
- UI: Minimal web app (static HTML/JS) calling Supabase directly and an n8n webhook

## Architecture at a Glance

```
[ Web UI ]  --upload-->  [ Supabase Storage: uploads ]
    |                               |
    |--chat (POST JSON)--> [ n8n Webhook ] -> [ Llama 3 (local) ]
    |                               |
    |<-- JSON {text, charts, code} --|

DB (Supabase Postgres): chat_sessions, chat_messages, files metadata
```

High-level flow
1) User uploads dataset in the UI → Supabase Storage (bucket: uploads) + DB metadata row.
2) User chats in the UI → POST to n8n webhook with sessionId + message + file references.
3) n8n workflow invokes local Llama 3 and tools:
   - Reads files from Supabase (public or signed URLs) or queries metadata from DB
   - Runs analysis code/tools (Python node, JS Function node, or external service)
   - Produces charts/metrics → stores artifacts in Supabase Storage or inline in response
4) n8n returns structured response to UI (text + charts + code); UI displays and logs in DB.

## Why These Technical Choices
- n8n: Visual, maintainable agent graph; easy tool orchestration; webhooks; retries/observability built-in.
- Local Llama 3: Meets parameter/latency/cost constraints; runs on CUDA 7.5 GPUs; controllable deployment.
- Supabase: Postgres + Storage + Auth + Realtime + SQL policies; great for observability and maintainability; straightforward integration from the browser.

## Phase Plan and Deliverables

Phase 1: Agent Core Capabilities (CLI → minimal UI)
- Data Loading: Upload CSV/Excel to Supabase Storage, track metadata in Postgres.
- Data Exploration: Stats summary, missing values, distributions (computed via agent tools).
- Visualization: Line/scatter/hist/box plots returned as embedded images or Vega JSON.
- Basic Stats: Mean/variance/correlation, trend detection.

Phase 2: Web Application
- Web UI: Drag-and-drop upload, chat box, embedded charts/code/explanations.
- Conversation Management: Session save/restore; multi-turn chat stored in DB.
- Result Presentation: Charts, code snippets (from the agent), and notes in the UI.
- User Management: Start with anonymous sessions; add Supabase Auth later.

Phase 3: Performance Optimization
- RAG: Time series knowledge base for uncommon scenarios.
- MCP Tools: Expand toolset via Model Context Protocol.
- Multi-Agent: Task decomposition in n8n (planner -> solver -> verifier).

## Repository Layout

```
.
├─ web/
│  ├─ index.html            # Minimal UI: upload + chat
│  ├─ styles.css
│  ├─ app.js
│  ├─ config.example.js     # Copy to config.js with your keys
├─ supabase/
│  └─ schema.sql            # Tables + (starter) policies
├─ n8n/
│  └─ README.md             # How to build the workflow
├─ .env.example             # Env vars for local dev (documented below)
└─ README.md
```

## Supabase Setup (Step-by-Step)

1) Create Project
- In the Supabase dashboard, create a new project.
- Note your `SUPABASE_URL`, `anon` key, and `service_role` key (Settings → API).

2) Create Storage Bucket
- Open Storage → Create a bucket named `uploads`.
- Phase 1 (simplest): Set this bucket to Public so you can read files via public URLs.
  - Public file URL format: `https://<YOUR_PROJECT>.supabase.co/storage/v1/object/public/uploads/<path>`
  - You will tighten access later (Phase 2) with signed URLs and RLS.

3) Create Tables
- Open SQL Editor and paste the content of `supabase/schema.sql` from this repository. Execute it.
- It creates:
  - `chat_sessions` (optional reference per session)
  - `chat_messages` (role=user/agent, message, payload, created_at)
  - `files` (metadata pointing to Storage paths)
  - `chat_history` view
- Note: For Phase 1, RLS is disabled to speed up iteration. In Phase 2, enable RLS and bind rows to `auth.uid()`.

4) Verify Setup
- In the dashboard, upload a small test file into the `uploads` bucket.
- Copy the public URL and open it in your browser to confirm accessibility.

## Configure Environment (Step-by-Step)

Front-end (browser) config:
1) Copy `web/config.example.js` to `web/config.js` and fill in:
```js
window.__APP_CONFIG__ = {
  SUPABASE_URL: "https://YOUR_PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
  SUPABASE_BUCKET: "uploads",
  N8N_WEBHOOK_URL: "http://localhost:5678/webhook/chat",
};
```
Notes:
- Do not put secrets (like `service_role`) in `web/config.js`.
- The UI only needs the anon key for uploads; reads are public in Phase 1.

Server-side (n8n) secrets:
- Store sensitive values in n8n Credentials or environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `OPENAI_BASE_URL` (OpenAI-compatible API for your local Llama 3)
  - `OPENAI_API_KEY` (stub if your server ignores it)
  - `MODEL` (e.g., `llama3`)

Example environment values for n8n:
```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
MODEL=llama3
```

## n8n Workflow (Step-by-Step Tutorial)

Goal: Receive chat + file references from the UI, call Llama 3, optionally analyze/plot data, upload chart images to Supabase, and return JSON.

Step 1 – Webhook (POST)
- Node: Webhook
- Method: POST
- Path: `/webhook/chat`
- Respond: Last node
- Expected payload:
```json
{
  "sessionId": "<uuid>",
  "message": "Show a line chart of vibration over time",
  "files": [{ "path": "<session>/<timestamp>-file.csv", "name": "file.csv" }],
  "timestamp": "2025-01-01T12:00:00.000Z"
}
```

Step 2 – Validate Input
- Node: Function
```js
const body = items[0].json || {};
if (!body.sessionId || !body.message) {
  throw new Error('Missing sessionId or message');
}
return [{ json: { sessionId: body.sessionId, message: body.message, files: body.files || [] } }];
```

Step 3 – Fetch Context (Optional)
- Node: HTTP Request → Supabase PostgREST to load recent `chat_messages` for the session.
- Example GET: `{{SUPABASE_URL}}/rest/v1/chat_messages?session_id=eq.{{$json.sessionId}}&order=created_at.asc`
- Headers: `apikey: {{SUPABASE_SERVICE_ROLE_KEY}}`, `Authorization: Bearer {{SUPABASE_SERVICE_ROLE_KEY}}`

Step 4 – LLM Call (Local Llama 3)
- Node: OpenAI (or HTTP Request)
- Base URL: `http://localhost:11434/v1`
- Model: `llama3`
- API Key: `ollama` (if required)
- System Prompt (example):
```
You are a time series analysis assistant. Tools (implemented in the workflow) provide:
- read_tabular(url): dataframe preview and schema
- summarize(): missing values, stats, correlations
- plot(kind, x, y): returns a URL to an image chart
Always respond with JSON: { "text": string, "charts": [{"type": string, "url": string}], "code": string? }.
```
- User message: include the user input and list of available files (names/paths).

Step 5 – Analysis / Plotting
- Strategy A (Phase 1 simplicity): Bucket is Public → construct public file URLs to read CSVs directly in a Python/Code node.
- Strategy B (more secure): Use signed URLs generated server-side (Supabase client or Storage API) and keep bucket private.

Upload a generated chart to Storage via HTTP Request (server-side write with service role):
```
PUT {{SUPABASE_URL}}/storage/v1/object/uploads/{{ $json.sessionId }}/chart-{{Date.now}}.png
Authorization: Bearer {{SUPABASE_SERVICE_ROLE_KEY}}
Content-Type: image/png
```
The public URL (Phase 1 bucket) becomes:
```
https://<YOUR_PROJECT>.supabase.co/storage/v1/object/public/uploads/<sessionId>/chart-<timestamp>.png
```

Step 6 – Respond JSON to UI
- Node: Function
```js
return [{ json: {
  text: $json.text || 'Here is your analysis.',
  charts: $json.charts || ($json.chartUrl ? [{ type: 'line', url: $json.chartUrl }] : []),
  code: $json.code || ''
}}];
```

Tips
- Use n8n execution logs to debug inputs/outputs.
- If images do not render, verify the public URL and UI Content Security Policy in `web/index.html`.

## Running the Web UI
1) Configure `web/config.js` as above.
2) Open `web/index.html` in a browser (or serve statically).
3) Upload a CSV/XLSX → you should see the storage path.
4) Send a chat message → UI posts to n8n and renders the returned JSON.

## Security, Auth, and Policies
- Phase 1: Public bucket + RLS disabled to move fast. Keep `service_role` only in n8n.
- Phase 2: Enable Supabase Auth and RLS. Tie rows to `auth.uid()`. Switch to signed URLs and restrict Storage policies.
- Never expose service secrets in the browser.

## Observability and Debugging
- n8n: Run history, retries, logs, test nodes individually.
- Supabase: Inspect table/storage logs; add audit triggers if needed.
- UI: Use browser console/network to confirm uploads and webhook responses.

## Roadmap and Extensions
- Dedicated tool nodes: CSV/Excel reader, summary, correlation, plotting, caching by `sessionId`.
- Interactive charts (Plotly/Vega) embedded in the UI.
- RAG with time-series knowledge and MCP tool integrations.
- Multi-agent orchestration (planner/solver/verifier) in n8n.
