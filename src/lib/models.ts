// Shared by the browser and the Worker: no secrets or server imports here.

export const PROVIDERS = {
  'workers-ai': { label: 'Workers AI', free: true },
  anthropic: { label: 'Anthropic', free: false },
  openai: { label: 'OpenAI', free: false },
  gemini: { label: 'Google Gemini', free: false },
} as const

export type ProviderId = keyof typeof PROVIDERS

/**
 * List prices in USD per 1M tokens, as of 2026-10-23. Paid providers: the
 * `pricing` metadata in @tanstack/ai-anthropic, -openai and -gemini 1.0.0
 * (not exported, so copied here). Workers AI: the per-model table at
 * https://developers.cloudflare.com/workers-ai/platform/pricing/.
 */
export const PRICES_AS_OF = '2026-10-23'

export const MODELS = [
  { id: '@cf/zai-org/glm-5.3-flash', provider: 'workers-ai', label: 'GLM 5.3 Flash', workersPaid: true, price: { input: 0.15, output: 0.5 } },
  { id: '@cf/openai/gpt-oss-120b', provider: 'workers-ai', label: 'gpt-oss 120B', price: { input: 0.35, output: 0.75 } },
  { id: '@cf/moonshotai/kimi-k2.6', provider: 'workers-ai', label: 'Kimi K2.6', workersPaid: true, price: { input: 0.95, output: 4 } },
  { id: '@cf/google/gemma-4-26b-a4b-it', provider: 'workers-ai', label: 'Gemma 4 26B', price: { input: 0.1, output: 0.3 } },
  { id: '@cf/zai-org/glm-4.7-flash', provider: 'workers-ai', label: 'GLM 4.7 Flash', price: { input: 0.06, output: 0.4 } },
  { id: '@cf/qwen/qwen3.8-27b', provider: 'workers-ai', label: 'Qwen 3.8 27B', price: { input: 0.45, output: 3.2 } },
  { id: '@cf/openai/gpt-oss-20b', provider: 'workers-ai', label: 'gpt-oss 20B', price: { input: 0.2, output: 0.3 } },
  { id: '@cf/deepseek-ai/deepseek-v4-flash-0731', provider: 'workers-ai', label: 'DeepSeek V4 Flash', workersPaid: true, price: { input: 0.44, output: 1.32 } },
  { id: 'claude-haiku-5-5', provider: 'anthropic', label: 'Claude Haiku 5.5', price: { input: 0.1, output: 0.5 } },
  { id: 'claude-sonnet-5-5', provider: 'anthropic', label: 'Claude Sonnet 5.5', price: { input: 2, output: 10 } },
  { id: 'gpt-5-mini', provider: 'openai', label: 'GPT-5 mini', price: { input: 0.25, output: 2 } },
  { id: 'gpt-6.1-sol', provider: 'openai', label: 'GPT-6.1 Sol', price: { input: 2, output: 10 } },
  { id: 'gemini-3.5-flash-lite', provider: 'gemini', label: 'Gemini 3.5 Flash-Lite', price: { input: 0.3, output: 2.5 } },
  { id: 'gemini-3.8-flash', provider: 'gemini', label: 'Gemini 3.8 Flash', price: { input: 0.75, output: 3.75 } },
] as const satisfies ReadonlyArray<{
  id: string
  provider: ProviderId
  label: string
  price: { input: number; output: number }
  /** Not served on the Workers Free plan. */
  workersPaid?: boolean
}>

export type ArenaModel = (typeof MODELS)[number]
export type ArenaModelId = ArenaModel['id']
export type ModelOf<P extends ProviderId> = Extract<ArenaModel, { provider: P }>

export function findModel(id: unknown): ArenaModel | undefined {
  return MODELS.find((m) => m.id === id)
}

/** Free Workers AI models fill the default columns so the demo works with no keys. */
export const DEFAULT_COLUMNS: ReadonlyArray<ArenaModelId> = [
  '@cf/openai/gpt-oss-120b',
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/qwen/qwen3.8-27b',
]

/** Estimated USD cost of one run from its token counts. */
export function estimateCost(model: ArenaModel, inputTokens: number, outputTokens: number) {
  return (inputTokens * model.price.input + outputTokens * model.price.output) / 1_000_000
}

/**
 * One reasoning control for every column. TanStack AI clamps each level to
 * the nearest one the model supports, so models with fewer levels still
 * get a sensible setting. `default` leaves the option unset.
 */
export const REASONING_CHOICES = ['default', 'off', 'low', 'medium', 'high'] as const
export type ReasoningChoice = (typeof REASONING_CHOICES)[number]

export function isReasoningChoice(value: unknown): value is ReasoningChoice {
  return REASONING_CHOICES.includes(value as ReasoningChoice)
}

export const MAX_COLUMNS = 4
export const MAX_OUTPUT_TOKENS = 2048
