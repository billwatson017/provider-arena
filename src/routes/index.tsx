import { useEffect, useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArenaColumn } from '#/components/ArenaColumn'
import type { Round } from '#/components/ArenaColumn'
import { KeysPanel } from '#/components/KeysPanel'
import { byok } from '#/lib/byok'
import { METRIC_LABELS, roundWinners } from '#/lib/metrics'
import type { MetricKey, RunSummary } from '#/lib/metrics'
import { DEFAULT_COLUMNS, MAX_COLUMNS, MODELS, REASONING_CHOICES, findModel } from '#/lib/models'
import type { ArenaModel, ArenaModelId, ReasoningChoice } from '#/lib/models'
import { getServerCoverage } from '#/server/coverage'
import { submitVote } from '#/server/votes'

export const Route = createFileRoute('/')({
  loader: () => getServerCoverage(),
  component: Arena,
})

interface ColumnResult {
  roundId: number
  settled: boolean
  summary?: RunSummary | null
}

interface Column {
  key: string
  model: ArenaModelId
  /** The column answers rounds after this one; earlier rounds predate it. */
  since: number
}

type VoteState = { roundId: number; status: 'saving' | 'saved' } | { roundId: number; status: 'error'; message: string }

const LETTERS = 'ABCD'

function shuffle<T>(items: ReadonlyArray<T>): Array<T> {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const GRID_COLS = ['', 'lg:grid-cols-1', 'lg:grid-cols-2', 'lg:grid-cols-3', 'lg:grid-cols-4']

function Arena() {
  const coverage = Route.useLoaderData()
  const [columns, setColumns] = useState<Array<Column>>(() =>
    DEFAULT_COLUMNS.map((model, i) => ({ key: `col-${i}`, model, since: 0 })),
  )
  const [blind, setBlind] = useState(false)
  const [vote, setVote] = useState<VoteState | null>(null)
  const [prompt, setPrompt] = useState('')
  const [round, setRound] = useState<Round | null>(null)
  const [stopSignal, setStopSignal] = useState(0)
  const [generation, setGeneration] = useState(0)
  const [reasoning, setReasoning] = useState<ReasoningChoice>('default')
  const [results, setResults] = useState<Record<string, ColumnResult>>({})

  // A round is settled once every column that ran it has finished or failed.
  // Only the columns that produced an answer are compared.
  const answered = useMemo(() => {
    if (!round) return null
    const ran = columns.filter((c) => results[c.key]?.roundId === round.id)
    if (ran.length < 2 || ran.some((c) => !results[c.key].settled)) return null
    return ran.flatMap((c) => {
      const summary = results[c.key].summary
      return summary ? [{ key: c.key, model: c.model, summary }] : []
    })
  }, [round, columns, results])

  const winners = useMemo(
    () => (answered ? roundWinners(answered) : new Map<string, Array<MetricKey>>()),
    [answered],
  )

  const revealed = !blind || (vote?.roundId === round?.id && vote?.status === 'saved')
  const aliasFor = (key: string) => {
    const i = columns.findIndex((c) => c.key === key)
    return `Model ${LETTERS[i] ?? '?'}`
  }
  const labelFor = (key: string) =>
    revealed ? (findModel(columns.find((c) => c.key === key)?.model)?.label ?? key) : aliasFor(key)

  async function castVote(winnerKey: string | null) {
    if (!round || !answered) return
    const models = answered.map((a) => a.model)
    const winner = winnerKey === null ? null : (columns.find((c) => c.key === winnerKey)?.model ?? null)
    setVote({ roundId: round.id, status: 'saving' })
    try {
      await submitVote({ data: { models, winner, reasoning } })
      setVote({ roundId: round.id, status: 'saved' })
    } catch (e) {
      setVote({ roundId: round.id, status: 'error', message: e instanceof Error ? e.message : 'Vote failed.' })
    }
  }

  function forgetResult(key: string) {
    setResults(({ [key]: _, ...rest }) => rest)
  }

  useEffect(() => {
    byok.setServerCoverage(coverage)
  }, [coverage])

  // Models that run with no extra setup: free-plan Workers AI, then
  // providers the server or the visitor already has a key for.
  const runnable = (m: ArenaModel) =>
    m.provider === 'workers-ai'
      ? !('workersPaid' in m)
      : coverage[m.provider] || byok.getSnapshot().status[m.provider]?.state === 'set'

  function send() {
    const text = prompt.trim()
    if (!text) return
    const current = round?.id ?? 0
    if (blind) {
      // Each blind round gets a fresh random lineup, so no one knows which
      // model is in which column. Columns start over with the new model.
      const pool = shuffle(MODELS.filter(runnable))
      setColumns((cols) =>
        cols.slice(0, Math.max(2, Math.min(cols.length, pool.length))).map((c, i) => ({
          key: c.key,
          model: (pool[i] ?? findModel(c.model) ?? MODELS[0]).id,
          since: current,
        })),
      )
      setResults({})
      // Fresh conversations, even for a column that drew the same model.
      setGeneration((g) => g + 1)
    }
    setVote(null)
    setRound({ id: current + 1, prompt: text })
    setPrompt('')
  }

  function addColumn() {
    const unused = MODELS.filter((m) => !columns.some((c) => c.model === m.id))
    const next = unused.find(runnable) ?? unused[0] ?? MODELS[0]
    setColumns((cols) => [...cols, { key: crypto.randomUUID(), model: next.id, since: round?.id ?? 0 }])
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
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={blind}
            onClick={() => setBlind((b) => !b)}
            title="Hide model names and shuffle the lineup each round, then vote for the best answer."
            className={blind ? `${ghostButton} border-accent/50 text-accent hover:text-accent` : ghostButton}
          >
            Blind mode {blind ? 'on' : 'off'}
          </button>
          {columns.length < MAX_COLUMNS && (
            <button type="button" onClick={addColumn} className={ghostButton}>
              + Add model
            </button>
          )}
        </div>
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
            <fieldset className="m-0 flex items-center gap-1 border-0 p-0">
              <legend className="sr-only">Reasoning effort</legend>
              <span className="mr-1 text-xs text-muted" title="Sent to every model; each uses the nearest level it supports.">
                Reasoning
              </span>
              <div className="flex rounded-md border border-border p-0.5">
                {REASONING_CHOICES.map((choice) => (
                  <label
                    key={choice}
                    className={`cursor-pointer rounded px-1.5 py-0.5 font-mono text-[0.7rem] ${
                      reasoning === choice ? 'bg-accent-soft text-accent' : 'text-muted hover:text-fg'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reasoning"
                      value={choice}
                      checked={reasoning === choice}
                      onChange={() => setReasoning(choice)}
                      className="sr-only"
                    />
                    {choice}
                  </label>
                ))}
              </div>
            </fieldset>
            <span className="hidden text-xs text-muted xl:inline">
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

      {winners.size > 0 && round && <RoundSummary roundId={round.id} winners={winners} labelFor={labelFor} />}

      {blind && round && answered && answered.length >= 2 && (
        <VoteBar
          options={answered.map((a) => ({ key: a.key, label: aliasFor(a.key) }))}
          state={vote?.roundId === round.id ? vote : null}
          onVote={castVote}
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
              sinceRound={col.since}
              alias={revealed ? undefined : aliasFor(col.key)}
              round={round}
              stopSignal={stopSignal}
              reasoning={reasoning}
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
                setColumns((cols) =>
                  cols.map((c) => (c.key === col.key ? { ...c, model: id, since: round?.id ?? 0 } : c)),
                )
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

function VoteBar({
  options,
  state,
  onVote,
}: {
  options: Array<{ key: string; label: string }>
  state: VoteState | null
  onVote: (winnerKey: string | null) => void
}) {
  if (state?.status === 'saved') {
    return (
      <p className="mt-0 mb-2 text-xs text-muted">
        Vote recorded, names revealed.{' '}
        <Link to="/leaderboard" className="text-accent underline">
          See the leaderboard
        </Link>
      </p>
    )
  }

  const button =
    'rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-50'
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2">
      <span className="text-xs font-medium">Which answer is best?</span>
      {options.map((o) => (
        <button key={o.key} type="button" className={button} disabled={state?.status === 'saving'} onClick={() => onVote(o.key)}>
          {o.label}
        </button>
      ))}
      <button type="button" className={button} disabled={state?.status === 'saving'} onClick={() => onVote(null)}>
        Tie
      </button>
      {state?.status === 'error' && <span className="text-xs text-danger">{state.message}</span>}
    </div>
  )
}
