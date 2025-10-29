# n8n Workflow – Time Series Agent

Goal

Create a webhook-driven workflow that accepts chat requests from the UI, pulls dataset files from Supabase, invokes local Llama 3 with tool calls, performs computations/plots, and returns structured JSON to the UI.

Prerequisites
- n8n running locally
- Local Llama 3 server with OpenAI-compatible API (e.g., Ollama + openai compatibility proxy, llama.cpp server, or LM Studio). Example base URL: http://localhost:11434/v1
- Supabase URL/keys and a bucket named `uploads`

Workflow Sketch

Nodes
1) Webhook (POST)
   - Path: /webhook/chat
   - Respond: Last node
   - Input JSON fields: sessionId (string), message (string), files (array of {path,name})

2) Function (Validate Input)
   - JS code validates fields and normalizes payload

3) HTTP Request (Get Signed URLs for Files) [optional]
   - If you prefer to sign URLs via Supabase REST: use service role key (server-side only)
   - Alternative: Directly stream via Supabase Storage (Node SDK in Code node)

4) OpenAI (or HTTP Request) – LLM Call
   - Base URL: your local server
   - Model: llama3
   - System prompt: describe available tools, output format contract
   - Provide conversation history from Supabase (optional) or from memory in n8n

5) Tools – Code/Python Nodes
   - Read CSV/Excel via signed URL
   - Compute summaries (pandas/JS), generate plots (matplotlib/plotly)
   - Upload resulting images to Supabase Storage → get public (or signed) URLs

6) Respond to Webhook
   - Return JSON: { text, charts: [{type, url}], code? }

System Prompt (Example)

You are a time series analysis assistant. You can call tools to:
- read_tabular(url): returns dataframe preview and schema
- summarize(df): returns missing values, stats, correlations
- plot(df, kind, x, y): returns a URL to an image chart
Always respond with JSON: { "text": string, "charts": [{"type": string, "url": string}], "code": string? }.

Notes
- Use retries in HTTP nodes; log errors and return helpful messages to the UI.
- Keep secrets (Supabase service key) in n8n credentials, not in the UI.
- For performance, cache intermediate results (e.g., dataset schema) keyed by sessionId.


