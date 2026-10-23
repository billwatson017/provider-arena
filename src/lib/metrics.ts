import { estimateCost } from './models'
import type { ArenaModel } from './models'

/** Raw timings and usage for one run, as seen from the browser. */
export interface RunMetrics {
  roundId: number
  startedAt: number
  firstTokenAt?: number
  finishedAt?: number
  inputTokens?: number
  outputTokens?: number
  /** USD. The provider's own figure when it reports one, else list price × tokens. */
  cost?: number
  costReported?: boolean
}

/** What a run is judged on. Lower wins, except tokens per second. */
export interface RunSummary {
  ttftMs?: number
  totalMs?: number
  tokensPerSecond?: number
  cost?: number
}

export type MetricKey = keyof RunSummary

export const METRIC_LABELS: Record<MetricKey, string> = {
  ttftMs: 'first token',
  totalMs: 'fastest',
  tokensPerSecond: 'tok/s',
  cost: 'cheapest',
}

const HIGHER_IS_BETTER: Partial<Record<MetricKey, boolean>> = { tokensPerSecond: true }

/** RUN_FINISHED carries TanStack `TokenUsage` or the AG-UI spec `usage[]`. */
export function readUsage(model: ArenaModel, usage: unknown): Partial<RunMetrics> {
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

export function summarize(m: RunMetrics): RunSummary {
  const ttftMs = m.firstTokenAt !== undefined ? m.firstTokenAt - m.startedAt : undefined
  const totalMs = m.finishedAt !== undefined ? m.finishedAt - m.startedAt : undefined
  const streamSeconds =
    m.finishedAt !== undefined && m.firstTokenAt !== undefined
      ? (m.finishedAt - m.firstTokenAt) / 1000
      : undefined
  const tokensPerSecond =
    m.outputTokens && streamSeconds ? m.outputTokens / streamSeconds : undefined
  return { ttftMs, totalMs, tokensPerSecond, cost: m.cost }
}

/**
 * For each metric, the entries that win it. Ties share the win. A metric is
 * skipped unless at least two entries have a value, since one column can't
 * win a comparison.
 */
export function roundWinners<K extends string>(
  entries: Array<{ key: K; summary: RunSummary }>,
): Map<K, Array<MetricKey>> {
  const wins = new Map<K, Array<MetricKey>>()
  for (const metric of Object.keys(METRIC_LABELS) as Array<MetricKey>) {
    const scored = entries.filter((e) => e.summary[metric] !== undefined)
    if (scored.length < 2) continue
    const values = scored.map((e) => e.summary[metric] as number)
    const best = HIGHER_IS_BETTER[metric] ? Math.max(...values) : Math.min(...values)
    for (const e of scored) {
      if (e.summary[metric] === best) wins.set(e.key, [...(wins.get(e.key) ?? []), metric])
    }
  }
  return wins
}

export function formatUsd(usd: number) {
  if (usd === 0) return '$0'
  return usd < 0.01 ? `$${usd.toPrecision(2)}` : `$${usd.toFixed(4)}`
}
