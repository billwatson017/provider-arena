export interface Vote {
  models: ReadonlyArray<string>
  /** A model from `models`, or null for a tie. */
  winner: string | null
}

export interface Rating {
  model: string
  rating: number
  votes: number
  wins: number
  ties: number
}

export const INITIAL_RATING = 1000
const K = 32

function expected(a: number, b: number) {
  return 1 / (1 + 10 ** ((b - a) / 400))
}

/**
 * Elo over votes in order. A round with more than two models counts as one
 * game per pair: the winner beats each other model, and a tie draws every
 * pair. Each round's updates are computed from ratings before the round, so
 * the order of pairs inside it doesn't matter.
 */
export function computeRatings(votes: Iterable<Vote>): Array<Rating> {
  const table = new Map<string, Rating>()
  const entry = (model: string) => {
    let r = table.get(model)
    if (!r) {
      r = { model, rating: INITIAL_RATING, votes: 0, wins: 0, ties: 0 }
      table.set(model, r)
    }
    return r
  }

  for (const vote of votes) {
    const players = vote.models.map(entry)
    const before = new Map(players.map((p) => [p.model, p.rating]))
    const delta = new Map<string, number>()

    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i].model
        const b = players[j].model
        const scoreA = vote.winner === null ? 0.5 : vote.winner === a ? 1 : vote.winner === b ? 0 : null
        // In a 3-4 way round, two losers don't play each other.
        if (scoreA === null) continue
        const change = K * (scoreA - expected(before.get(a)!, before.get(b)!))
        delta.set(a, (delta.get(a) ?? 0) + change)
        delta.set(b, (delta.get(b) ?? 0) - change)
      }
    }

    for (const p of players) {
      p.rating += delta.get(p.model) ?? 0
      p.votes += 1
      if (vote.winner === null) p.ties += 1
      else if (vote.winner === p.model) p.wins += 1
    }
  }

  return [...table.values()].sort((x, y) => y.rating - x.rating)
}
