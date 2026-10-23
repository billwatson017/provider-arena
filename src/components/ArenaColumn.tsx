import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { fetchServerSentEvents, useByok, useChat } from '@tanstack/ai-react'
import type { StreamChunk } from '@tanstack/ai'
import type { UIMessage } from '@tanstack/ai-react'
import { TextPart } from '@tanstack/ai-react/ui'
import { byok } from '#/lib/byok'
import { MODELS, PRICES_AS_OF, PROVIDERS } from '#/lib/models'
import { formatUsd, readUsage, summarize } from '#/lib/metrics'
import type { MetricKey, RunMetrics, RunSummary } from '#/lib/metrics'
import type { ArenaModel, ArenaModelId, ReasoningChoice } from '#/lib/models'

export interface Round {
  id: number
  prompt: string
}

interface ArenaColumnProps {
  model: ArenaModel
  round: Round | null
  /** Rounds up to this id happened before the column joined. */
  sinceRound: number
  /** Shown instead of the model name in blind mode. */
  alias?: string
  stopSignal: number
  reasoning: ReasoningChoice
  /** The server holds a key for this provider, so no visitor key is needed. */
  covered: boolean
  canRemove: boolean
  /** Metrics this column won in the latest round. */
  wins: ReadonlyArray<MetricKey>
  onRoundStart: (roundId: number) => void
  /** `summary` is null when the run failed or was stopped before finishing. */
  onRoundSettled: (roundId: number, summary: RunSummary | null) => void
  onModelChange: (id: ArenaModelId) => void
  onRemove: () => void
}

const CONTENT_CHUNKS = new Set(['TEXT_MESSAGE_CONTENT', 'REASONING_MESSAGE_CONTENT'])

export function ArenaColumn({
  model,
  round,
  sinceRound,
  alias,
  stopSignal,
  reasoning,
  covered,
  canRemove,
  wins,
  onRoundStart,
  onRoundSettled,
  onModelChange,
  onRemove,
}: ArenaColumnProps) {
  const [threadId] = useState(() => crypto.randomUUID())
  const [metrics, setMetrics] = useState<RunMetrics | null>(null)
  const [threadCost, setThreadCost] = useState({ usd: 0, runs: 0 })
  const keys = useByok(byok)

  const forwardedProps = useMemo(
    () => ({ provider: model.provider, model: model.id, reasoning }),
    [model, reasoning],
  )
  const { messages, sendMessage, reload, stop, isLoading, error } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId,
    byok,
    forwardedProps,
    onChunk: (chunk: StreamChunk) => {
      const now = performance.now()
      if (CONTENT_CHUNKS.has(chunk.type)) {
        setMetrics((m) => (m && !m.firstTokenAt ? { ...m, firstTokenAt: now } : m))
      } else if (chunk.type === 'RUN_FINISHED') {
        const usage = readUsage(model, chunk.usage)
        setMetrics((m) => (m ? { ...m, finishedAt: now, ...usage } : m))
        if (usage.cost !== undefined) {
          const cost = usage.cost
          setThreadCost((t) => ({ usd: t.usd + cost, runs: t.runs + 1 }))
        }
      }
    },
  })

  // A round is one prompt broadcast to every column. A column only answers
  // rounds newer than the one it joined at.
  const lastRound = useRef(sinceRound)
  useEffect(() => {
    if (!round || round.id <= lastRound.current) return
    // Defer one tick: a column that mounts with a pending round (blind mode,
    // a new model) would otherwise send before StrictMode's mount/unmount/
    // mount pass, and useChat's detach on that unmount drops the request.
    const timer = setTimeout(() => {
      lastRound.current = round.id
      setMetrics({ roundId: round.id, startedAt: performance.now() })
      onRoundStart(round.id)
      void sendMessage(round.prompt).catch(() => {})
    })
    return () => clearTimeout(timer)
  }, [round, sendMessage, onRoundStart])

  // Report each round once, when it finishes or stops for good.
  const reported = useRef<number | null>(null)
  useEffect(() => {
    if (!metrics || isLoading || reported.current === metrics.roundId) return
    if (metrics.finishedAt === undefined && !error) return
    reported.current = metrics.roundId
    onRoundSettled(metrics.roundId, metrics.finishedAt !== undefined ? summarize(metrics) : null)
  }, [metrics, isLoading, error, onRoundSettled])

  useEffect(() => {
    if (stopSignal > 0) stop()
  }, [stopSignal, stop])

  // When the visitor adds the missing key, retry the turn that was blocked.
  const keyStatus = keys.status[model.provider]?.state
  const blockedOnKey = !covered && keyStatus !== 'set'
  const wasBlocked = useRef(false)
  useEffect(() => {
    if (error && blockedOnKey) wasBlocked.current = true
    if (wasBlocked.current && !blockedOnKey) {
      wasBlocked.current = false
      setMetrics((m) => (m ? { roundId: m.roundId, startedAt: performance.now() } : m))
      reported.current = null
      void reload()
    }
  }, [error, blockedOnKey, reload])

  return (
    <section className="flex min-h-[28rem] min-w-0 flex-col bg-bg">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        {alias ? (
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{alias}</span>
        ) : (
          <>
          <select
            value={model.id}
            onChange={(e) => onModelChange(e.target.value as ArenaModelId)}
            className="min-w-0 flex-1 cursor-pointer truncate bg-transparent text-sm font-medium focus:outline-none"
            aria-label="Model"
          >
            {Object.entries(PROVIDERS).map(([id, provider]) => (
              <optgroup key={id} label={provider.free ? `${provider.label} (free)` : provider.label}>
                {MODELS.filter((m) => m.provider === id).map((m) => (
                  <option key={m.id} value={m.id}>
                    {'workersPaid' in m ? `${m.label} · Workers Paid plan` : m.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="shrink-0 rounded border border-border px-1.5 py-px font-mono text-[0.65rem] text-muted">
            {model.provider}
          </span>
          </>
        )}
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded p-1 text-muted hover:bg-bg-subtle hover:text-fg"
            aria-label={`Remove ${model.label}`}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </header>

      <MetricsBar model={model} metrics={metrics} threadCost={threadCost} isLoading={isLoading} wins={wins} />

      <div className="max-h-[70vh] flex-1 space-y-4 overflow-y-auto px-3 py-3 text-sm">
        {messages.length === 0 && (
          <p className="m-0 text-xs text-muted">
            {PROVIDERS[model.provider].free
              ? 'Runs on Cloudflare Workers AI. No key needed.'
              : covered
              ? `Uses the server's ${PROVIDERS[model.provider].label} key.`
              : `Needs your ${PROVIDERS[model.provider].label} API key (kept in this tab only).`}
          </p>
        )}
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
        {error && (
          <p className="m-0 rounded-md border border-danger/30 bg-danger-soft px-2.5 py-2 text-xs text-danger">
            {blockedOnKey
              ? `Add your ${PROVIDERS[model.provider].label} key to run this column.`
              : error.message}
          </p>
        )}
      </div>
    </section>
  )
}

interface MetricsBarProps {
  model: ArenaModel
  metrics: RunMetrics | null
  threadCost: { usd: number; runs: number }
  isLoading: boolean
  wins: ReadonlyArray<MetricKey>
}

function MetricsBar({ model, metrics, threadCost, isLoading, wins }: MetricsBarProps) {
  const { ttftMs, totalMs, tokensPerSecond, cost } = metrics ? summarize(metrics) : ({} as RunSummary)
  const pending = isLoading ? '…' : '—'

  const costTitle =
    metrics?.cost === undefined
      ? `List price: $${model.price.input} in / $${model.price.output} out per 1M tokens (as of ${PRICES_AS_OF})`
      : metrics.costReported
        ? 'Cost reported by the provider'
        : `${metrics.inputTokens} in × $${model.price.input}/1M + ${metrics.outputTokens} out × $${model.price.output}/1M, list prices as of ${PRICES_AS_OF}` +
          (PROVIDERS[model.provider].free ? '. Workers AI includes 10,000 free neurons a day.' : '')

  const cells: Array<{ label: string; value: string; metric?: MetricKey; title?: string }> = [
    { label: 'TTFT', value: ttftMs !== undefined ? `${Math.round(ttftMs)} ms` : pending, metric: 'ttftMs' },
    { label: 'Total', value: totalMs !== undefined ? `${(totalMs / 1000).toFixed(2)} s` : pending, metric: 'totalMs' },
    { label: 'Tokens', value: metrics?.outputTokens !== undefined ? String(metrics.outputTokens) : '—' },
    { label: 'Tok/s', value: tokensPerSecond !== undefined ? tokensPerSecond.toFixed(0) : '—', metric: 'tokensPerSecond' },
    {
      label: 'Cost',
      value: cost !== undefined ? `${metrics?.costReported ? '' : '~'}${formatUsd(cost)}` : pending,
      metric: 'cost',
      title: costTitle,
    },
  ]

  return (
    <div className="@container border-b border-border bg-bg-subtle px-3 py-2">
      {/* Five across when there's room, otherwise 3 + 2. */}
      <dl className="m-0 grid grid-cols-3 gap-x-2 gap-y-1.5 @[22rem]:grid-cols-5">
        {cells.map(({ label, value, metric, title }) => {
          const won = metric !== undefined && wins.includes(metric)
          return (
            <div key={label} title={title} className={`min-w-0 ${title ? 'cursor-help' : ''}`}>
              <dt
                className={`truncate text-[0.6rem] font-medium tracking-wider uppercase ${won ? 'text-accent' : 'text-muted'}`}
              >
                {won && <span aria-label="best this round">▲ </span>}
                {label}
              </dt>
              <dd className={`m-0 truncate font-mono text-xs tabular-nums ${won ? 'font-semibold text-accent' : ''}`}>
                {value}
              </dd>
            </div>
          )
        })}
      </dl>
      {threadCost.runs > 1 && (
        <p className="m-0 mt-1.5 font-mono text-[0.65rem] text-muted">
          thread ~{formatUsd(threadCost.usd)} · {threadCost.runs} runs
        </p>
      )}
    </div>
  )
}

/** Model output can link anywhere, so links open in a new tab. */
const MARKDOWN_COMPONENTS = {
  a: (props: ComponentProps<'a'>) => <a {...props} target="_blank" rel="noopener noreferrer" />,
}

function Message({ message }: { message: UIMessage }) {
  if (message.role === 'user') {
    return (
      <div className="border-l-2 border-accent pl-2.5 whitespace-pre-wrap text-muted">
        {message.parts.map((part, i) => (part.type === 'text' ? <span key={i}>{part.content}</span> : null))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {message.parts.map((part, i) => {
        if (part.type === 'thinking') {
          const done = message.parts.slice(i + 1).some((p) => p.type === 'text')
          return (
            <details key={i} open={!done} className="group/think text-xs text-muted">
              <summary className="cursor-pointer list-none font-mono text-[0.7rem] select-none [&::-webkit-details-marker]:hidden">
                <span className="inline-block transition group-open/think:rotate-90">›</span>{' '}
                {done ? 'reasoning' : 'thinking…'}
              </summary>
              <p className="mt-1.5 mb-0 max-h-40 overflow-y-auto border-l border-border pl-2.5 leading-relaxed whitespace-pre-wrap">
                {part.content}
              </p>
            </details>
          )
        }
        // Some models open with blank lines; trim so columns line up.
        if (part.type === 'text' && part.content.trim()) {
          return (
            <TextPart
              key={i}
              content={part.content.trimStart()}
              className="prose-arena prose prose-sm max-w-none"
              components={MARKDOWN_COMPONENTS}
            />
          )
        }
        return null
      })}
    </div>
  )
}
