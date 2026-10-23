# Provider Arena

One prompt, several models, streamed side by side. An example app for
[TanStack AI](https://tanstack.com/ai) 1.0 on
[TanStack Start](https://tanstack.com/start), deployed to Cloudflare Workers.

Each column runs its own `useChat` stream against the same `/api/chat`
endpoint. The server picks a provider adapter and hands it to one `chat()`
call. Nothing else changes between providers.

## What it shows

| TanStack AI feature | Where |
| --- | --- |
| Provider-agnostic `chat()` with per-model typed adapters | [`src/server/arena.ts`](src/server/arena.ts) |
| Workers AI through the `env.AI` binding (`@tanstack/ai-cloudflare`) | [`src/server/arena.ts`](src/server/arena.ts) |
| SSE streaming: `toServerSentEventsResponse` + `fetchServerSentEvents` | [`src/routes/api.chat.ts`](src/routes/api.chat.ts), [`src/components/ArenaColumn.tsx`](src/components/ArenaColumn.tsx) |
| AG-UI request parsing with `chatParamsFromRequest` and `forwardedProps` | [`src/routes/api.chat.ts`](src/routes/api.chat.ts) |
| Bring your own key (`defineByok`, `useByok`, `getByokKey`, `byokMissing`) | [`src/lib/byok.ts`](src/lib/byok.ts), [`src/components/KeysPanel.tsx`](src/components/KeysPanel.tsx) |
| Reasoning parts rendered separately from answers | [`src/components/ArenaColumn.tsx`](src/components/ArenaColumn.tsx) |
| Time to first token, total time, tokens/s and cost from stream chunks | [`src/components/ArenaColumn.tsx`](src/components/ArenaColumn.tsx) |

## Models

- **Workers AI (free, no key):** gpt-oss 120B / 20B, Gemma 4 26B, Qwen 3.8 27B,
  GLM 4.7 Flash. GLM 5.3 Flash, Kimi K2.6 and DeepSeek V4 Flash need the
  Workers Paid plan and are labelled in the picker.
- **Bring your own key:** Claude Haiku 5.5 / Sonnet 5.5, GPT-5 mini / GPT-6.1 Sol,
  Gemini 3.5 Flash-Lite / 3.8 Flash.

Edit [`src/lib/models.ts`](src/lib/models.ts) to change the list.

## Cost

Each column shows the cost of its last run and a running total for its thread.
If a provider reports a cost in `RUN_FINISHED` usage (OpenRouter does), that
figure is shown as is. Otherwise it is estimated (shown with `~`) as
input tokens × input price + output tokens × output price, using the list
prices in [`src/lib/models.ts`](src/lib/models.ts). Hover the cost for the
breakdown.

- Paid-provider prices come from the `pricing` metadata in the TanStack AI
  1.0.0 adapters. That metadata isn't exported, so it's copied here.
- Workers AI prices come from Cloudflare's
  [pricing page](https://developers.cloudflare.com/workers-ai/platform/pricing/).
  The first 10,000 neurons a day are free, so small Workers AI runs may cost
  you nothing.
- The estimate ignores prompt-cache discounts, and reasoning tokens count as
  output. Update the prices (and `PRICES_AS_OF`) when providers change them.

## Keys and cost safety

This is meant to be deployed publicly, so by default it never spends your
provider keys:

- **Visitor keys** are held in tab memory (`memoryStorage()`), sent only as
  `x-byok-<provider>` headers, and never stored server-side.
- **Server keys** (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`) are
  used as a fallback only when `ALLOW_SERVER_KEYS` is `"true"`.
- **Workers AI** runs on your Cloudflare account. `/api/chat` is limited to 20
  requests per minute per IP with the Workers
  [rate limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/),
  output is capped at 2,048 tokens, and only the last 12 messages are sent.

## Develop

```bash
npm install
npx wrangler login        # Workers AI calls your account even in local dev
cp .dev.vars.example .dev.vars
npm run dev               # http://localhost:3000
```

After changing bindings in `wrangler.jsonc`, run `npm run cf-typegen`.

## Deploy

```bash
npm run deploy
# optional, only used when ALLOW_SERVER_KEYS is "true":
npx wrangler secret put ANTHROPIC_API_KEY
```

## License

MIT
