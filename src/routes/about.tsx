import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

const POINTS: Array<[string, string]> = [
  [
    'One chat() call, four adapters',
    'src/server/arena.ts builds a Workers AI, Anthropic, OpenAI or Gemini adapter and hands it to the same chat() call. Model ids and modelOptions are typed per model.',
  ],
  [
    'Independent useChat streams',
    'Each column owns a useChat hook with its own threadId, so every model streams over its own SSE connection and keeps its own history.',
  ],
  [
    'Bring your own key',
    'Paid providers use TanStack AI BYOK: keys live in tab memory and travel as x-byok-* headers. The server reads them with getByokKey() and never stores them.',
  ],
  [
    'Metrics from the stream',
    'Time to first token, total time, tokens per second and cost come from the AG-UI chunks (TEXT_MESSAGE_CONTENT, RUN_FINISHED usage) seen in onChunk. Cost is the provider-reported figure when there is one, else tokens × list price.',
  ],
]

function About() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="m-0 text-xl font-semibold tracking-tight">How it works</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Provider Arena is a small TanStack Start app on Cloudflare Workers that shows what TanStack
        AI's adapter model buys you: swap the provider, keep everything else.
      </p>

      <dl className="mt-6 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
        {POINTS.map(([title, body]) => (
          <div key={title} className="bg-bg p-4">
            <dt className="text-sm font-medium">{title}</dt>
            <dd className="m-0 mt-1.5 text-sm leading-relaxed text-muted">{body}</dd>
          </div>
        ))}
      </dl>
    </main>
  )
}
