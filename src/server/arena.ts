import { env } from 'cloudflare:workers'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import type { ModelMessage, UIMessage } from '@tanstack/ai'
import type { ByokProvider } from '@tanstack/ai/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { anthropicByok } from '@tanstack/ai-anthropic/byok'
import { createCloudflareText } from '@tanstack/ai-cloudflare'
import type { CloudflareBindingConfig } from '@tanstack/ai-cloudflare'
import { createGeminiChat } from '@tanstack/ai-gemini'
import { geminiByok } from '@tanstack/ai-gemini/byok'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { openaiByok } from '@tanstack/ai-openai/byok'
import { MAX_OUTPUT_TOKENS } from '#/lib/models'
import type { ArenaModel, ReasoningChoice } from '#/lib/models'
import { InvoiceSchema } from '#/lib/invoice'
import { ARENA_TOOLS } from './tools'

// The adapter is typed against its own copy of @cloudflare/workers-types, which
// differs from the runtime types `wrangler types` generates only in DOM event
// details. Same object at runtime.
const workersAi = () => env.AI as unknown as CloudflareBindingConfig['binding']

const SYSTEM_PROMPT =
  'You are one contestant in a side-by-side model comparison. Answer the user directly and concisely.'

const TOOLS_PROMPT =
  'You have tools for weather, currency conversion and order lookup. Use them for any facts they cover instead of guessing.'

/** Only the most recent turns are sent, which bounds the cost of a long thread. */
const MAX_HISTORY = 12

interface ArenaRequest {
  request: Request
  model: ArenaModel
  messages: Array<UIMessage | ModelMessage>
  threadId: string
  reasoning: ReasoningChoice
  /** Give the model the test tool kit (weather, currency, orders). */
  tools: boolean
  /** Ask for the invoice schema instead of free text. */
  schema: boolean
}

export function serverKeysAllowed() {
  return String(env.ALLOW_SERVER_KEYS) === 'true'
}

/**
 * The visitor's own key (the `x-byok-<provider>` header) always wins. A
 * descriptor also falls back to the provider's env secret; a bare slug is
 * header-only, which is what keeps a public deploy from spending your keys.
 */
function providerKey(request: Request, provider: ByokProvider) {
  return getByokKey(request, serverKeysAllowed() ? provider : provider.id)
}

export function streamArenaChat({
  request,
  model,
  messages,
  threadId,
  reasoning,
  tools,
  schema,
}: ArenaRequest): Response {
  const abortController = new AbortController()
  const common = {
    messages: messages.slice(-MAX_HISTORY),
    threadId,
    systemPrompts: tools ? [SYSTEM_PROMPT, TOOLS_PROMPT] : [SYSTEM_PROMPT],
    ...(tools && { tools: ARENA_TOOLS }),
    // Structured output streams the JSON as it's generated; the client gets a
    // typed `structured-output` part with `partial` and, at the end, `data`.
    ...(schema && { outputSchema: InvoiceSchema, stream: true as const }),
    abortController,
    // `reasoning` is typed per model, but the arena sends one level to all of
    // them. TanStack AI clamps it to the nearest level each model supports.
    ...(reasoning !== 'default' && { reasoning: reasoning as never }),
  }

  switch (model.provider) {
    case 'workers-ai': {
      const stream = chat({
        adapter: createCloudflareText(model.id, { binding: workersAi() }),
        ...common,
        modelOptions: {
          max_tokens: MAX_OUTPUT_TOKENS,
          // Some Workers AI models (Gemma, Qwen) ignore `reasoning_effort: null`
          // and only stop thinking through their chat template.
          ...(reasoning === 'off' && { chat_template_kwargs: { enable_thinking: false } }),
        },
      })
      return toServerSentEventsResponse(stream, { abortController })
    }
    case 'anthropic': {
      const key = providerKey(request, anthropicByok)
      if (!key) return byokMissing(anthropicByok)
      const stream = chat({
        adapter: createAnthropicChat(model.id, key),
        ...common,
        modelOptions: { max_tokens: MAX_OUTPUT_TOKENS },
      })
      return toServerSentEventsResponse(stream, { abortController })
    }
    case 'openai': {
      const key = providerKey(request, openaiByok)
      if (!key) return byokMissing(openaiByok)
      const stream = chat({
        adapter: createOpenaiChat(model.id, key),
        ...common,
        modelOptions: { max_output_tokens: MAX_OUTPUT_TOKENS },
      })
      return toServerSentEventsResponse(stream, { abortController })
    }
    case 'gemini': {
      const key = providerKey(request, geminiByok)
      if (!key) return byokMissing(geminiByok)
      const stream = chat({
        adapter: createGeminiChat(model.id, key),
        ...common,
        modelOptions: { maxOutputTokens: MAX_OUTPUT_TOKENS },
      })
      return toServerSentEventsResponse(stream, { abortController })
    }
  }
}
