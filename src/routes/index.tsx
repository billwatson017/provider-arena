import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ArenaColumn } from '#/components/ArenaColumn'
import type { Round } from '#/components/ArenaColumn'
import { KeysPanel } from '#/components/KeysPanel'
import { byok } from '#/lib/byok'
import { DEFAULT_COLUMNS, MAX_COLUMNS, MODELS, findModel } from '#/lib/models'
import type { ArenaModelId } from '#/lib/models'
import { getServerCoverage } from '#/server/coverage'

export const Route = createFileRoute('/')({
  loader: () => getServerCoverage(),
  component: Arena,
})

const GRID_COLS = ['', 'lg:grid-cols-1', 'lg:grid-cols-2', 'lg:grid-cols-3', 'lg:grid-cols-4']

function Arena() {
  const coverage = Route.useLoaderData()
  const [columns, setColumns] = useState<Array<{ key: string; model: ArenaModelId }>>(() =>
    DEFAULT_COLUMNS.map((model, i) => ({ key: `col-${i}`, model })),
  )
  const [prompt, setPrompt] = useState('')
  const [round, setRound] = useState<Round | null>(null)
  const [stopSignal, setStopSignal] = useState(0)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    byok.setServerCoverage(coverage)
  }, [coverage])

  function send() {
    const text = prompt.trim()
    if (!text) return
    setRound((r) => ({ id: (r?.id ?? 0) + 1, prompt: text }))
    setPrompt('')
  }

  function addColumn() {
    const unused = MODELS.find((m) => !columns.some((c) => c.model === m.id)) ?? MODELS[0]
    setColumns((cols) => [...cols, { key: crypto.randomUUID(), model: unused.id }])
  }

  return (
    <main className="mx-auto w-full max-w-[110rem] px-4 pt-8 pb-8">
      <section className="mb-6">
        <p className="island-kicker mb-2">TanStack AI · Cloudflare Workers</p>
        <h1 className="display-title m-0 text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-5xl">
          Provider Arena
        </h1>
        <p className="mt-3 max-w-3xl text-[var(--sea-ink-soft)]">
          One prompt, several models, streamed side by side. Every column calls the same{' '}
          <code>chat()</code> function and swaps only the adapter.
        </p>
      </section>

      <div className="mb-4">
        <KeysPanel coverage={coverage} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
        className="island-shell sticky top-[4.5rem] z-40 mb-4 flex flex-col gap-2 rounded-2xl p-3 sm:flex-row"
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          rows={2}
          placeholder="Ask every model the same thing…"
          className="min-h-[3rem] flex-1 resize-y rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-[var(--sea-ink)]"
        />
        <div className="flex gap-2 sm:w-40 sm:flex-col">
          <button
            type="submit"
            disabled={!prompt.trim()}
            className="flex-1 rounded-xl bg-[var(--lagoon-deep)] px-4 py-2 font-semibold text-white disabled:opacity-50 dark:text-[#0a1418]"
          >
            Send to all
          </button>
          <div className="flex flex-1 gap-2">
            <button
              type="button"
              onClick={() => setStopSignal((s) => s + 1)}
              className="flex-1 rounded-xl border border-[var(--line)] px-3 py-1.5 text-sm whitespace-nowrap text-[var(--sea-ink)]"
            >
              Stop
            </button>
            <button
              type="button"
              onClick={() => {
                setRound(null)
                setGeneration((g) => g + 1)
              }}
              className="flex-1 rounded-xl border border-[var(--line)] px-3 py-1.5 text-sm whitespace-nowrap text-[var(--sea-ink)]"
            >
              Clear
            </button>
          </div>
        </div>
      </form>

      <div className={`grid gap-4 md:grid-cols-2 ${GRID_COLS[columns.length]}`}>
        {columns.map((col) => {
          const model = findModel(col.model) ?? MODELS[0]
          return (
            <ArenaColumn
              // Changing the model or clearing starts a fresh conversation.
              key={`${col.key}:${model.id}:${generation}`}
              model={model}
              round={round}
              stopSignal={stopSignal}
              covered={coverage[model.provider]}
              canRemove={columns.length > 1}
              onModelChange={(id) =>
                setColumns((cols) => cols.map((c) => (c.key === col.key ? { ...c, model: id } : c)))
              }
              onRemove={() => setColumns((cols) => cols.filter((c) => c.key !== col.key))}
            />
          )
        })}
      </div>

      {columns.length < MAX_COLUMNS && (
        <button
          type="button"
          onClick={addColumn}
          className="mt-4 rounded-xl border border-dashed border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink-soft)] hover:bg-[var(--link-bg-hover)]"
        >
          + Add a model
        </button>
      )}
    </main>
  )
}
