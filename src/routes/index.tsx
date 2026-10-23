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

  const ghostButton =
    'rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted hover:border-border-strong hover:text-fg'

  return (
    <main className="mx-auto w-full max-w-[110rem] px-4 pt-6 pb-8">
      <section className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-tight">Provider Arena</h1>
          <p className="mt-1 mb-0 text-sm text-muted">
            One prompt, streamed to several models side by side. Each column calls the same{' '}
            <code className="text-fg">chat()</code> and swaps only the adapter.
          </p>
        </div>
        {columns.length < MAX_COLUMNS && (
          <button type="button" onClick={addColumn} className={ghostButton}>
            + Add model
          </button>
        )}
      </section>

      <KeysPanel coverage={coverage} />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
        className="sticky top-12 z-40 -mx-4 mb-4 bg-bg/90 px-4 py-3 backdrop-blur"
      >
        <div className="rounded-lg border border-border bg-bg focus-within:border-border-strong">
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
            className="block w-full resize-none bg-transparent px-3 pt-2.5 text-sm placeholder:text-muted focus:outline-none"
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            <span className="hidden text-xs text-muted sm:inline">
              <kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift+Enter</kbd> for a new line
            </span>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setStopSignal((s) => s + 1)} className={ghostButton}>
                Stop
              </button>
              <button
                type="button"
                onClick={() => {
                  setRound(null)
                  setGeneration((g) => g + 1)
                }}
                className={ghostButton}
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={!prompt.trim()}
                className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-accent-fg hover:opacity-90 disabled:opacity-40"
              >
                Send to all ⏎
              </button>
            </div>
          </div>
        </div>
      </form>

      <div
        className={`grid gap-px overflow-hidden rounded-lg border border-border bg-border ${GRID_COLS[columns.length]}`}
      >
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
    </main>
  )
}
