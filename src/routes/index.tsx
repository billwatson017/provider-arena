import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ArenaColumn } from '#/components/ArenaColumn'
import type { Round } from '#/components/ArenaColumn'
import { KeysPanel } from '#/components/KeysPanel'
import { byok } from '#/lib/byok'
import { METRIC_LABELS, roundWinners } from '#/lib/metrics'
import type { MetricKey, RunSummary } from '#/lib/metrics'
import { DEFAULT_COLUMNS, MAX_COLUMNS, MODELS, findModel } from '#/lib/models'
import type { ArenaModelId } from '#/lib/models'
import { getServerCoverage } from '#/server/coverage'

export const Route = createFileRoute('/')({
  loader: () => getServerCoverage(),
  component: Arena,
})

interface ColumnResult {
  roundId: number
  settled: boolean
  summary?: RunSummary | null
}

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
  const [results, setResults] = useState<Record<string, ColumnResult>>({})

  // Winners are decided once every column that ran this round has settled.
  const winners = useMemo(() => {
    const wins = new Map<string, Array<MetricKey>>()
    if (!round) return wins
    const ran = columns.filter((c) => results[c.key]?.roundId === round.id)
    if (ran.length < 2 || ran.some((c) => !results[c.key].settled)) return wins
    return roundWinners(
      ran.flatMap((c) => {
        const summary = results[c.key].summary
        return summary ? [{ key: c.key, summary }] : []
      }),
    )
  }, [round, columns, results])

  function forgetResult(key: string) {
    setResults(({ [key]: _, ...rest }) => rest)
  }

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
    // Prefer models that run with no extra setup: free-plan Workers AI first,
    // then providers the server or the visitor already has a key for.
    const runnable = (m: (typeof MODELS)[number]) =>
      m.provider === 'workers-ai' ? !('workersPaid' in m) : coverage[m.provider] || byok.getSnapshot().status[m.provider]?.state === 'set'
    const unused = MODELS.filter((m) => !columns.some((c) => c.model === m.id))
    const next = unused.find(runnable) ?? unused[0] ?? MODELS[0]
    setColumns((cols) => [...cols, { key: crypto.randomUUID(), model: next.id }])
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
                  setResults({})
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

      {winners.size > 0 && round && (
        <RoundSummary
          roundId={round.id}
          winners={winners}
          labelFor={(key) => findModel(columns.find((c) => c.key === key)?.model)?.label ?? key}
        />
      )}

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
              wins={winners.get(col.key) ?? []}
              onRoundStart={(roundId) =>
                setResults((r) => ({ ...r, [col.key]: { roundId, settled: false } }))
              }
              onRoundSettled={(roundId, summary) =>
                setResults((r) => ({ ...r, [col.key]: { roundId, settled: true, summary } }))
              }
              onModelChange={(id) => {
                forgetResult(col.key)
                setColumns((cols) => cols.map((c) => (c.key === col.key ? { ...c, model: id } : c)))
              }}
              onRemove={() => {
                forgetResult(col.key)
                setColumns((cols) => cols.filter((c) => c.key !== col.key))
              }}
            />
          )
        })}
      </div>
    </main>
  )
}

function RoundSummary({
  roundId,
  winners,
  labelFor,
}: {
  roundId: number
  winners: Map<string, Array<MetricKey>>
  labelFor: (key: string) => string
}) {
  const byMetric = (Object.keys(METRIC_LABELS) as Array<MetricKey>).flatMap((metric) => {
    const keys = [...winners].filter(([, wins]) => wins.includes(metric)).map(([key]) => key)
    return keys.length ? [{ metric, labels: keys.map(labelFor) }] : []
  })

  return (
    <p className="mt-0 mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-muted">
      <span>round {roundId}</span>
      {byMetric.map(({ metric, labels }) => (
        <span key={metric}>
          <span className="text-accent">▲ {METRIC_LABELS[metric]}</span>{' '}
          <span className="text-fg">{labels.join(', ')}</span>
        </span>
      ))}
    </p>
  )
}
