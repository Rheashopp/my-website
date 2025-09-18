# Serverless LLM Proxy

This directory contains optional server-side adapters for routing `/api/llm` requests to OpenAI or Gemini without exposing API keys in the browser. Both implementations accept the same JSON payload and return `{ "text": "..." }` responses.

## Request payload

```json
{
  "messages": [{ "role": "user", "content": "Hello" }],
  "sessionId": "uuid-or-session-token"
}
```

The `messages` array mirrors OpenAI/Gemini chat formats. `sessionId` is forwarded to the provider as the `user` parameter when supported to aid abuse monitoring.

## Netlify Functions

- Function file: `netlify/functions/llm.js`
- Required environment variables:
  - `PROVIDER` — `openai` or `gemini` (defaults to `openai`)
  - `OPENAI_API_KEY` and optional `OPENAI_MODEL` (defaults to `gpt-4o-mini`)
  - `GEMINI_API_KEY` and optional `GEMINI_MODEL` (defaults to `gemini-2.5-flash`)
- Add a redirect in `netlify.toml`:

  ```toml
  [[redirects]]
  from = "/api/llm"
  to = "/.netlify/functions/llm"
  status = 200
  force = true
  ```

- Deploy with `netlify deploy` or the Netlify UI. Keys are configured under **Site settings → Environment variables**.

## Cloudflare Workers

- Worker entry: `cloudflare/worker.js`
- Secrets to set (via `wrangler secret put <NAME>`):
  - `PROVIDER`
  - `OPENAI_API_KEY`, `OPENAI_MODEL`
  - `GEMINI_API_KEY`, `GEMINI_MODEL`
- Example `wrangler.toml` snippet:

  ```toml
  name = "silent-llm-proxy"
  main = "serverless/cloudflare/worker.js"

  routes = [
    { pattern = "silent.superintelligence/api/llm", zone_name = "silent.superintelligence" }
  ]
  ```

Cloudflare deploys with `wrangler publish`. Attach the same environment variables under **Workers → Settings → Variables**.

## CORS & security

Both adapters echo the request origin in `Access-Control-Allow-Origin` so only your site should call the endpoint. They use short 15s timeouts and never log message contents—only minimal error context.

## Local testing

1. Install dependencies: Node 18+ (already available in Netlify/Workers environments).
2. Run locally with Netlify CLI (`netlify dev`) or `wrangler dev` as needed.
3. Update `window.SILENT_CONFIG.voice.provider` to `openai` or `gemini` and reload the homepage. The orb will POST to `/api/llm`.

## Switching providers

To change providers without redeploying, set `PROVIDER` in your environment variables. If both OpenAI and Gemini keys are available, the request handler chooses the configured provider dynamically.
