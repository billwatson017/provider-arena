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
    <main className="page-wrap px-4 py-12">
      <section className="island-shell rounded-2xl p-6 sm:p-8">
        <p className="island-kicker mb-2">How it works</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          Provider-agnostic by design.
        </h1>
        <p className="m-0 max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
          Provider Arena is a small TanStack Start app on Cloudflare Workers that shows what
          TanStack AI's adapter model buys you: swap the provider, keep everything else.
        </p>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        {POINTS.map(([title, body]) => (
          <article key={title} className="island-shell rounded-2xl p-5">
            <h2 className="mb-2 text-base font-semibold text-[var(--sea-ink)]">{title}</h2>
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">{body}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
