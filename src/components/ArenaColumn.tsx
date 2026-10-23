import { useEffect, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { fetchServerSentEvents, useByok, useChat } from '@tanstack/ai-react'
import type { StreamChunk } from '@tanstack/ai'
import type { UIMessage } from '@tanstack/ai-react'
import { TextPart } from '@tanstack/ai-react/ui'
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
    <section className="flex min-h-[28rem] min-w-0 flex-col bg-bg">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
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

      <MetricsBar model={model} metrics={metrics} threadCost={threadCost} isLoading={isLoading} />

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
    ['TTFT', ttft !== undefined ? `${Math.round(ttft)} ms` : isLoading ? '…' : '—'],
    ['Total', total !== undefined ? `${(total / 1000).toFixed(2)} s` : isLoading ? '…' : '—'],
    ['Tokens', metrics?.outputTokens !== undefined ? String(metrics.outputTokens) : '—'],
    ['Tok/s', tps !== undefined ? tps.toFixed(0) : '—'],
    ['Cost', metrics?.cost !== undefined ? `${metrics.costReported ? '' : '~'}${formatUsd(metrics.cost)}` : isLoading ? '…' : '—', costTitle],
  ]

  return (
    <div className="border-b border-border bg-bg-subtle px-3 py-2">
      <dl className="m-0 grid grid-cols-5 gap-2">
        {cells.map(([label, value, title]) => (
          <div key={label} title={title} className={`min-w-0 ${title ? 'cursor-help' : ''}`}>
            <dt className="truncate text-[0.6rem] font-medium tracking-wider text-muted uppercase">{label}</dt>
            <dd className="m-0 truncate font-mono text-xs tabular-nums">{value}</dd>
          </div>
        ))}
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
