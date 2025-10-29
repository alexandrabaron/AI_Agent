# n8n Workflow – Time Series Agent

This document explains how to build the workflow in n8n so the Web UI can upload files to Supabase and chat with an AI Agent that analyzes time series data and returns charts and explanations.

## Prerequisites
- n8n running locally
- Local Llama 3 with an OpenAI-compatible API (e.g., Ollama + compatibility server, llama.cpp server, LM Studio). Example base URL: `http://localhost:11434/v1`
- Supabase project with a `uploads` bucket (Phase 1 may be public)
- Store server secrets in n8n Credentials, not in the front-end

## Workflow Overview

Nodes (high level):
1) Webhook (POST) – receives `{ sessionId, message, files[] }`
2) Function – validate and normalize input
3) (Optional) HTTP Request – fetch chat history from Supabase
4) AI Agent – model + tools orchestrated via prompt
5) Tool nodes – read file, summarize, plot → upload chart to Supabase
6) Function – assemble JSON `{ text, charts, code }`
7) Webhook response (Last node)

The Web UI expects a JSON response with:
```json
{ "text": "...", "charts": [{ "type": "line", "url": "https://.../chart.png" }], "code": "..." }
```

## Step-by-Step Setup

### 1) Webhook (POST)
- Node: Webhook
- Method: POST
- Path: `/webhook/chat`
- Respond: Last node
- Test: From the Web UI (configured in `web/config.js`), send a message and verify it reaches n8n.

Expected payload:
```json
{
  "sessionId": "<uuid>",
  "message": "Show a line chart of vibration over time",
  "files": [{ "path": "<session>/<timestamp>-file.csv", "name": "file.csv" }]
}
```

### 2) Function – Validate Input
Add a Function node after the Webhook:
```js
const body = items[0].json || {};
if (!body.sessionId || !body.message) {
  throw new Error('Missing sessionId or message');
}
return [{ json: { sessionId: body.sessionId, message: body.message, files: body.files || [] } }];
```

### 3) (Optional) Fetch History from Supabase
Use an HTTP Request node to GET recent chat messages for the session (PostgREST):
- URL: `{{SUPABASE_URL}}/rest/v1/chat_messages?session_id=eq.{{$json.sessionId}}&order=created_at.asc`
- Headers:
  - `apikey: {{SUPABASE_SERVICE_ROLE_KEY}}`
  - `Authorization: Bearer {{SUPABASE_SERVICE_ROLE_KEY}}`
Pass the resulting messages to the AI Agent as context if desired.

### 4) AI Agent Node
- Node: AI Agent (n8n)
- Model Provider: OpenAI-compatible
  - Base URL: `http://localhost:11434/v1`
  - Model: `llama3`
  - API Key: `ollama` (or stub)
- System Prompt (copy/paste):
```
You are a time series analysis assistant. You have access to tools implemented in this workflow:
- read_tabular(url): returns a preview and inferred schema
- summarize(): returns missing values, stats, correlations
- plot(kind, x, y): returns a URL to an image chart stored in Supabase
Always respond with JSON: { "text": string, "charts": [{"type": string, "url": string}], "code": string? }.
```
- Memory/Context: Include recent messages (from Step 3) to preserve conversation.
- Tools: Add the following tools and connect their outputs back to the Agent.

### 5) Tool Nodes

Tool: read_tabular (Function)
```js
// Input JSON: { url }
const url = $json.url;
if (!url) throw new Error('Missing url');
// Simple CSV fetch and preview (assumes public URL; for private use signed URLs)
const res = await $httpRequest({ method: 'GET', url });
const text = typeof res === 'string' ? res : JSON.stringify(res);
const lines = text.trim().split(/\r?\n/);
const header = lines[0].split(',');
const sample = lines.slice(1, 6).map(l => l.split(','));
return [{ json: { header, sample, rowsPreviewed: sample.length } }];
```

Tool: summarize (Function) – trivial demo (replace with real stats)
```js
// Input JSON: { header, sample }
const { header = [], sample = [] } = $json;
return [{ json: { missingValues: 0, columns: header.length, sampleRows: sample.length } }];
```

Tool: plot (Function + HTTP Request)
1) Function (generate a tiny PNG placeholder or receive binary from a Python node)
```js
// Here we fake a PNG buffer for demo purposes. Replace with real chart generation.
const pngBytes = Buffer.from([137,80,78,71,/* ... minimal PNG bytes ... */]);
return [{ binary: { chart: { data: pngBytes, mimeType: 'image/png', fileName: 'chart.png' } }, json: {} }];
```
2) HTTP Request (PUT to Supabase Storage)
- URL:
```
{{SUPABASE_URL}}/storage/v1/object/uploads/{{$json.sessionId}}/chart-{{$now}}.png
```
- Method: PUT
- Send: Binary
- Binary Property: `chart`
- Headers:
```
Authorization: Bearer {{SUPABASE_SERVICE_ROLE_KEY}}
Content-Type: image/png
```
- Extract the object path from the response (or infer from the URL) and construct the public URL:
```
https://<YOUR_PROJECT>.supabase.co/storage/v1/object/public/uploads/<sessionId>/chart-<timestamp>.png
```
Return that URL back to the AI Agent.

### 6) Respond JSON to the Webhook
Add a Function node before the Webhook response:
```js
return [{ json: {
  text: $json.text || 'Here is your analysis.',
  charts: $json.charts || ($json.chartUrl ? [{ type: 'line', url: $json.chartUrl }] : []),
  code: $json.code || ''
}}];
```

## Tips and Troubleshooting
- Use Execution logs to inspect inputs/outputs; re-run nodes for quick iteration.
- If images do not render in the Web UI, verify the public URL and CSP in `web/index.html`.
- Keep `service_role` only in n8n credentials; never expose it in the browser.