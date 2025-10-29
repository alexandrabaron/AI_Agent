AI-Agent Based Engineering Time Series Data Analysis System (M2)

Overview

This project builds a natural-language agent for time series analysis that orchestrates tools to replace manual coding. It is designed to be production-ready, maintainable, and extensible, with a clear path from CLI prototypes to a web UI connected to Supabase and an n8n-based agent using your local Llama 3.

You will use:
- LLM: Local Llama 3 (via Ollama or llama.cpp/OpenAI-compatible server)
- Agent Orchestration: n8n (local)
- Storage/DB/Auth: Supabase
- UI: Minimal web app (static HTML/JS) calling Supabase directly and an n8n webhook

Why these choices
- n8n: Visual, maintainable agent graph; easy tool orchestration; node library; webhooks; retries/observability built-in.
- Local Llama 3: Meets parameter/latency/cost constraints; runs on CUDA 7.5 GPUs; controllable deployment.
- Supabase: Postgres + Storage + Auth + Realtime + SQL policies; great for observability and maintainability; straightforward integration from the browser.

Project Phases and Deliverables

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

Architecture

High-level flow
1) User uploads dataset in the UI → Supabase Storage (bucket: uploads) + DB metadata row.
2) User chats in the UI → POST to n8n webhook with sessionId + message + file references.
3) n8n workflow invokes local Llama 3 and tools:
   - Reads files from Supabase (signed URLs) or queries metadata from DB
   - Runs analysis code/tools (Python node, JS Function node, or external service)
   - Produces charts/metrics → stores artifacts in Supabase Storage or inline in response
4) n8n returns structured response to UI (text + charts + code); UI displays and logs in DB.

Technical decisions explained
- Tool library lives in n8n as nodes/functions for:
  - Read CSV/Excel (pandas or JS parsers) from a signed URL
  - Compute statistical summaries
  - Generate Matplotlib/Plotly/Vega charts and upload images back to Supabase
  - Return structured JSON to the UI
- Prompt engineering in n8n: System prompt defines tools and I/O contract; LLM chooses tools by calling dedicated nodes.
- Observability: n8n execution logs, Supabase logs, and structured message storage for traceability.

Repository Layout

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
├─ .env.example             # Env vars for local dev
└─ README.md
```

Quick Start

Prerequisites
- Node.js 18+
- n8n running locally
- Local Llama 3 server (recommend Ollama: `ollama run llama3`)
- Supabase project (URL + anon/service keys)

1) Supabase setup
1. Create a project at Supabase and note SUPABASE_URL and SUPABASE_ANON_KEY.
2. Create a Storage bucket named `uploads` (public: off initially; we will use signed URLs).
3. Run the SQL in `supabase/schema.sql` in the Supabase SQL editor to create tables/policies.

2) Configure env
1. Copy `.env.example` to `.env` and fill in values.
2. Copy `web/config.example.js` to `web/config.js` and set URLs/keys for client use.

3) Start the UI
You can simply open `web/index.html` in a browser, or serve it locally (e.g., VS Code Live Server).

4) n8n workflow
1. Start n8n locally.
2. Create a Webhook node (POST) to receive chat messages from the UI.
3. Add Function/Code nodes to:
   - Validate payload (sessionId, message, optional fileIds)
   - Fetch Supabase signed URLs for referenced files
4. Add an LLM node (OpenAI-compatible) pointing to your local Llama 3 server endpoint.
5. Add tool nodes (Code/Python/HTTP) to perform data analysis/visualization and push results to Supabase.
6. Return structured JSON: { text: string, charts: [{type, url|vega}], code?: string }.

Security & Auth
- Phase 1: Use anonymous sessions stored in localStorage for per-session isolation in tables. Storage uploads require policies; start permissive during prototyping and tighten in Phase 2.
- Phase 2: Enable Supabase Auth (email or OAuth) for multi-user isolation; bind rows to `auth.uid()`; tighten RLS.

Observability
- n8n: Run history, retries, logs, and manual re-execution.
- Supabase: Postgres logs, storage access logs, row-level auditing via triggers if needed.

Testing & Validation
- Unit-test tool nodes by calling them with small CSVs.
- Use deterministic prompts for reproducibility.
- Track latency in n8n; profile heavy steps (parsers, plotting).

Roadmap by Phase

Phase 1 (now)
- [x] Minimal UI: upload + chat wired to Supabase and n8n webhook
- [ ] Basic tools in n8n for summary/stats/plots
- [ ] Return charts and text to UI

Phase 2
- [ ] Polished UI, drag-and-drop, session restore
- [ ] User auth + RLS tightening
- [ ] Embedded charts (Vega/Plotly) and code blocks

Phase 3
- [ ] RAG knowledge base (time series domain docs)
- [ ] MCP tool adapters
- [ ] Multi-agent in n8n (planner/solver/verifier)

Justification Summary
- Meets the model constraints (<=32B, CUDA 7.5) with local Llama 3 options.
- Lowers barrier for domain experts via no-code/low-code agent graph (n8n) and web UI.
- Production-minded: Supabase for DB/Storage/Auth; clear separation of concerns; logging and traceability.


