import { Link, createFileRoute } from '@tanstack/react-router'
import { INITIAL_RATING } from '#/lib/elo'
import { getLeaderboard } from '#/server/votes'

export const Route = createFileRoute('/leaderboard')({
  loader: () => getLeaderboard(),
  component: Leaderboard,
})

function Leaderboard() {
  const { ratings, totalVotes } = Route.useLoaderData()

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="m-0 text-xl font-semibold tracking-tight">Leaderboard</h1>
      <p className="mt-1 text-sm text-muted">
        Elo ratings from {totalVotes} blind {totalVotes === 1 ? 'vote' : 'votes'}. Every model starts at{' '}
        {INITIAL_RATING}; in a round of three or four, the winner beats each other model and a tie draws
        every pair.
      </p>

      {ratings.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
          No votes yet. Turn on <strong className="text-fg">Blind mode</strong> in the{' '}
          <Link to="/" className="text-accent underline">
            arena
          </Link>
          , send a prompt and pick the best answer.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-bg-subtle text-left text-[0.65rem] tracking-wider text-muted uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 text-right font-medium">Rating</th>
                <th className="px-3 py-2 text-right font-medium">Votes</th>
                <th className="px-3 py-2 text-right font-medium">Wins</th>
                <th className="px-3 py-2 text-right font-medium">Win rate</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs tabular-nums">
              {ratings.map((r, i) => (
                <tr key={r.model} className="border-t border-border">
                  <td className="px-3 py-2 text-muted">{i + 1}</td>
                  <td className="px-3 py-2 font-sans text-sm">
                    {r.label}{' '}
                    <span className="ml-1 rounded border border-border px-1.5 py-px font-mono text-[0.65rem] text-muted">
                      {r.provider}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-right ${i === 0 ? 'font-semibold text-accent' : ''}`}>
                    {Math.round(r.rating)}
                  </td>
                  <td className="px-3 py-2 text-right">{r.votes}</td>
                  <td className="px-3 py-2 text-right">{r.wins}</td>
                  <td className="px-3 py-2 text-right">{Math.round((r.wins / r.votes) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
