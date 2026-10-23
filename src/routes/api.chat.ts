import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { chatParamsFromRequest } from '@tanstack/ai'
import { findModel, isReasoningChoice } from '#/lib/models'
import { streamArenaChat } from '#/server/arena'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = request.headers.get('cf-connecting-ip') ?? 'local'
        const { success } = await env.CHAT_LIMITER.limit({ key: ip })
        if (!success) {
          return Response.json(
            { error: 'Rate limit reached. Try again in a minute.' },
            { status: 429 },
          )
        }

        // Throws a 400 Response on a malformed body; TanStack Start returns it.
        const params = await chatParamsFromRequest(request)
        const model = findModel(params.forwardedProps.model)
        if (!model) {
          return Response.json({ error: 'Unknown model.' }, { status: 400 })
        }

        return streamArenaChat({
          request,
          model,
          messages: params.messages,
          threadId: params.threadId,
          reasoning: isReasoningChoice(params.forwardedProps.reasoning)
            ? params.forwardedProps.reasoning
            : 'default',
          tools: params.forwardedProps.tools === true,
        })
      },
    },
  },
})
