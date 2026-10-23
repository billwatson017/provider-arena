import { createServerFn } from '@tanstack/react-start'
import { envKeyEntry } from '@tanstack/ai/byok/server'
import { anthropicByok } from '@tanstack/ai-anthropic/byok'
import { geminiByok } from '@tanstack/ai-gemini/byok'
import { openaiByok } from '@tanstack/ai-openai/byok'
import { serverKeysAllowed } from './arena'

/** Which providers the server can answer without a visitor key. */
export const getServerCoverage = createServerFn({ method: 'GET' }).handler(() => {
  const allowed = serverKeysAllowed()
  return {
    'workers-ai': true,
    anthropic: allowed && envKeyEntry(anthropicByok) !== null,
    openai: allowed && envKeyEntry(openaiByok) !== null,
    gemini: allowed && envKeyEntry(geminiByok) !== null,
  }
})
