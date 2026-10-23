import { useEffect, useRef, useState } from 'react'
import { fetchServerSentEvents, useByok, useChat } from '@tanstack/ai-react'
import type { StreamChunk } from '@tanstack/ai'
import type { UIMessage } from '@tanstack/ai-react'
import { byok } from '#/lib/byok'
import { MODELS, PRICES_AS_OF, PROVIDERS, estimateCost } from '#/lib/models'
import type { ArenaModel, ArenaModelId } from '#/lib/models'

export interface Round {
  id: number
  prompt: string
}

interface RunMetrics {
  startedAt: number
  firstTokenAt?: number
  finishedAt?: number
  inputTokens?: number
  outputTokens?: number
  /** USD. The provider's own figure when it reports one, else list price × tokens. */
  cost?: number
  costReported?: boolean
}

interface ArenaColumnProps {
  model: ArenaModel
  round: Round | null
  stopSignal: number
  /** The server holds a key for this provider, so no visitor key is needed. */
  covered: boolean
  canRemove: boolean
  onModelChange: (id: ArenaModelId) => void
  onRemove: () => void
}

const CONTENT_CHUNKS = new Set(['TEXT_MESSAGE_CONTENT', 'REASONING_MESSAGE_CONTENT'])

/** RUN_FINISHED carries TanStack `TokenUsage` or the AG-UI spec `usage[]`. */
function readUsage(model: ArenaModel, usage: unknown): Partial<RunMetrics> {
  const entries = Array.isArray(usage) ? usage : usage ? [usage] : []
  if (!entries.length) return {}
  let inputTokens = 0
  let outputTokens = 0
  let reported: number | undefined
  for (const u of entries as Array<Record<string, number | undefined>>) {
    inputTokens += u.promptTokens ?? u.inputTokens ?? 0
    outputTokens += u.completionTokens ?? u.outputTokens ?? 0
    if (u.cost !== undefined) reported = (reported ?? 0) + u.cost
  }
  return {
    inputTokens,
    outputTokens,
    cost: reported ?? estimateCost(model, inputTokens, outputTokens),
    costReported: reported !== undefined,
  }
}

function formatUsd(usd: number) {
  if (usd === 0) return '$0'
  return usd < 0.01 ? `$${usd.toPrecision(2)}` : `$${usd.toFixed(4)}`
}

export function ArenaColumn({
  model,
  round,
  stopSignal,
  covered,
  canRemove,
  onModelChange,
  onRemove,
}: ArenaColumnProps) {
  const [threadId] = useState(() => crypto.randomUUID())
  const [metrics, setMetrics] = useState<RunMetrics | null>(null)
  const [threadCost, setThreadCost] = useState({ usd: 0, runs: 0 })
  const keys = useByok(byok)

  const { messages, sendMessage, reload, stop, isLoading, error } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId,
    byok,
    forwardedProps: { provider: model.provider, model: model.id },
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

  // A round is one prompt broadcast to every column. Seeding with the current
  // round means a column added or switched mid-session waits for the next one.
  const lastRound = useRef(round?.id ?? null)
  useEffect(() => {
    if (!round || lastRound.current === round.id) return
    lastRound.current = round.id
    setMetrics({ startedAt: performance.now() })
    void sendMessage(round.prompt).catch(() => {})
  }, [round, sendMessage])

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
      setMetrics({ startedAt: performance.now() })
      void reload()
    }
  }, [error, blockedOnKey, reload])

  return (
    <section className="island-shell flex min-h-[28rem] min-w-0 flex-col rounded-2xl">
      <header className="flex items-center gap-2 border-b border-[var(--line)] p-3">
        <select
          value={model.id}
          onChange={(e) => onModelChange(e.target.value as ArenaModelId)}
          className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1.5 text-sm font-semibold text-[var(--sea-ink)]"
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
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg px-2 py-1 text-sm text-[var(--sea-ink-soft)] hover:bg-[var(--link-bg-hover)]"
            aria-label={`Remove ${model.label}`}
          >
            ✕
          </button>
        )}
      </header>

      <MetricsBar model={model} metrics={metrics} threadCost={threadCost} isLoading={isLoading} />

      <div className="max-h-[70vh] flex-1 space-y-4 overflow-y-auto p-3 text-sm">
        {messages.length === 0 && (
          <p className="text-[var(--sea-ink-soft)]">
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
          <p className="rounded-lg border border-red-400/40 bg-red-500/10 p-2 text-red-700 dark:text-red-300">
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
}

function MetricsBar({ model, metrics, threadCost, isLoading }: MetricsBarProps) {
  const ttft =
    metrics?.firstTokenAt !== undefined ? metrics.firstTokenAt - metrics.startedAt : undefined
  const total =
    metrics?.finishedAt !== undefined ? metrics.finishedAt - metrics.startedAt : undefined
  const streamSeconds =
    metrics?.finishedAt !== undefined && metrics.firstTokenAt !== undefined
      ? (metrics.finishedAt - metrics.firstTokenAt) / 1000
      : undefined
  const tps =
    metrics?.outputTokens && streamSeconds ? metrics.outputTokens / streamSeconds : undefined

  const costTitle =
    metrics?.cost === undefined
      ? `List price: $${model.price.input} in / $${model.price.output} out per 1M tokens (as of ${PRICES_AS_OF})`
      : metrics.costReported
        ? 'Cost reported by the provider'
        : `${metrics.inputTokens} in × $${model.price.input}/1M + ${metrics.outputTokens} out × $${model.price.output}/1M, list prices as of ${PRICES_AS_OF}` +
          (PROVIDERS[model.provider].free ? '. Workers AI includes 10,000 free neurons a day.' : '')

  const cells: Array<[string, string, string?]> = [
    ['First token', ttft !== undefined ? `${Math.round(ttft)} ms` : isLoading ? '…' : '—'],
    ['Total', total !== undefined ? `${(total / 1000).toFixed(2)} s` : isLoading ? '…' : '—'],
    ['Out tokens', metrics?.outputTokens !== undefined ? String(metrics.outputTokens) : '—'],
    ['Tok/s', tps !== undefined ? tps.toFixed(0) : '—'],
    ['Cost', metrics?.cost !== undefined ? `${metrics.costReported ? '' : '~'}${formatUsd(metrics.cost)}` : isLoading ? '…' : '—', costTitle],
  ]

  return (
    <div className="border-b border-[var(--line)] px-3 py-2">
      <dl className="m-0 grid grid-cols-5 gap-1 text-center">
        {cells.map(([label, value, title]) => (
          <div key={label} title={title} className={title ? 'cursor-help' : undefined}>
            <dt className="text-[0.65rem] tracking-wide text-[var(--sea-ink-soft)] uppercase">
              {label}
            </dt>
            <dd className="m-0 font-semibold text-[var(--sea-ink)] tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {threadCost.runs > 1 && (
        <p className="m-0 mt-1 text-center text-xs text-[var(--sea-ink-soft)]">
          Thread total ~{formatUsd(threadCost.usd)} over {threadCost.runs} runs
        </p>
      )}
    </div>
  )
}

function Message({ message }: { message: UIMessage }) {
  if (message.role === 'user') {
    return (
      <div className="ml-6 rounded-xl bg-[var(--chip-bg)] p-2.5 whitespace-pre-wrap text-[var(--sea-ink)]">
        {message.parts.map((part, i) => (part.type === 'text' ? <span key={i}>{part.content}</span> : null))}
      </div>
    )
  }

  return (
    <div className="space-y-2 text-[var(--sea-ink)]">
      {message.parts.map((part, i) => {
        if (part.type === 'thinking') {
          const done = message.parts.slice(i + 1).some((p) => p.type === 'text')
          return (
            <details key={i} open={!done} className="text-xs text-[var(--sea-ink-soft)]">
              <summary className="cursor-pointer">{done ? 'Reasoning' : 'Thinking…'}</summary>
              <p className="mt-1 whitespace-pre-wrap">{part.content}</p>
            </details>
          )
        }
        // Some models open with blank lines; trim so columns line up.
        if (part.type === 'text' && part.content.trim()) {
          return (
            <p key={i} className="m-0 leading-relaxed whitespace-pre-wrap">
              {part.content.trimStart()}
            </p>
          )
        }
        return null
      })}
    </div>
  )
}
