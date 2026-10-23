import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { computeRatings } from '#/lib/elo'
import { findModel, isReasoningChoice } from '#/lib/models'
import type { ReasoningChoice } from '#/lib/models'

export interface VoteInput {
  models: Array<string>
  winner: string | null
  reasoning: ReasoningChoice
}

/** Ratings are recomputed from the most recent votes on every read. */
const MAX_VOTES_READ = 20_000

function parseVote(input: unknown): VoteInput {
  const { models, winner, reasoning } = (input ?? {}) as Record<string, unknown>
  if (
    !Array.isArray(models) ||
    models.length < 2 ||
    models.length > 4 ||
    new Set(models).size !== models.length ||
    !models.every((m) => findModel(m))
  ) {
    throw new Error('A vote needs 2-4 different known models.')
  }
  if (winner !== null && !models.includes(winner)) {
    throw new Error('The winner must be one of the models.')
  }
  return {
    models: models as Array<string>,
    winner: winner as string | null,
    reasoning: isReasoningChoice(reasoning) ? reasoning : 'default',
  }
}

export const submitVote = createServerFn({ method: 'POST' })
  .validator(parseVote)
  .handler(async ({ data }) => {
    const ip = getRequestHeader('cf-connecting-ip') ?? 'local'
    const { success } = await env.CHAT_LIMITER.limit({ key: `vote:${ip}` })
    if (!success) throw new Error('Too many votes. Try again in a minute.')

    await env.DB.prepare('INSERT INTO votes (models, winner, reasoning) VALUES (?, ?, ?)')
      .bind(JSON.stringify(data.models), data.winner, data.reasoning)
      .run()
    return { ok: true }
  })

export const getLeaderboard = createServerFn({ method: 'GET' }).handler(async () => {
  const { results } = await env.DB.prepare(
    'SELECT models, winner FROM (SELECT id, models, winner FROM votes ORDER BY id DESC LIMIT ?) ORDER BY id',
  )
    .bind(MAX_VOTES_READ)
    .all<{ models: string; winner: string | null }>()

  const ratings = computeRatings(
    results.map((row) => ({ models: JSON.parse(row.models) as Array<string>, winner: row.winner })),
  )
  return {
    totalVotes: results.length,
    // Drop models that have since been removed from the catalog.
    ratings: ratings.flatMap((r) => {
      const model = findModel(r.model)
      return model ? [{ ...r, label: model.label, provider: model.provider }] : []
    }),
  }
})
