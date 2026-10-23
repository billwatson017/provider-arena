import { defineByok, memoryStorage } from '@tanstack/ai-react/byok'
import { anthropicByok } from '@tanstack/ai-anthropic/byok'
import { geminiByok } from '@tanstack/ai-gemini/byok'
import { openaiByok } from '@tanstack/ai-openai/byok'

export const BYOK_PROVIDERS = [anthropicByok, openaiByok, geminiByok] as const

/**
 * Visitors' API keys live in this tab's memory only and travel as
 * `x-byok-<provider>` headers on each request. They are never stored by the
 * server and are gone on reload.
 */
export const byok = defineByok({
  storage: memoryStorage(),
  providers: BYOK_PROVIDERS,
})
