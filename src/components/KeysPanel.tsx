import { useState } from 'react'
import { useByok } from '@tanstack/ai-react'
import { BYOK_PROVIDERS, byok } from '#/lib/byok'

interface KeysPanelProps {
  coverage: Record<string, boolean>
}

export function KeysPanel({ coverage }: KeysPanelProps) {
  const snapshot = useByok(byok)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const prompted = snapshot.prompt?.provider

  async function save(id: string) {
    const key = drafts[id]?.trim()
    if (!key) return
    await byok.update(id, key)
    setDrafts((d) => ({ ...d, [id]: '' }))
  }

  return (
    <details
      open={prompted !== undefined}
      className="island-shell rounded-2xl px-4 py-3 text-sm"
    >
      <summary className="cursor-pointer font-semibold text-[var(--sea-ink)]">
        API keys
        <span className="ml-2 font-normal text-[var(--sea-ink-soft)]">
          Optional. Workers AI models need none. Keys stay in this tab's memory and go out only as
          request headers.
        </span>
      </summary>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {BYOK_PROVIDERS.map((provider) => {
          const status = snapshot.status[provider.id]
          const isPrompted = prompted === provider.id
          return (
            <form
              key={provider.id}
              onSubmit={(e) => {
                e.preventDefault()
                void save(provider.id)
              }}
              className={`rounded-xl border p-3 ${
                isPrompted ? 'border-[var(--lagoon)]' : 'border-[var(--line)]'
              }`}
            >
              <label className="mb-1.5 block font-semibold text-[var(--sea-ink)]" htmlFor={`key-${provider.id}`}>
                {provider.label}
              </label>
              {status?.state === 'set' ? (
                <div className="flex items-center justify-between gap-2">
                  <code className="truncate">{status.masked}</code>
                  <button
                    type="button"
                    onClick={() => void byok.clear(provider.id)}
                    className="rounded-lg px-2 py-1 text-[var(--sea-ink-soft)] hover:bg-[var(--link-bg-hover)]"
                  >
                    Clear
                  </button>
                </div>
              ) : coverage[provider.id] ? (
                <p className="m-0 text-[var(--sea-ink-soft)]">Covered by the server.</p>
              ) : (
                <div className="flex gap-2">
                  <input
                    id={`key-${provider.id}`}
                    type="password"
                    autoComplete="off"
                    placeholder={isPrompted ? 'Needed for your last prompt' : 'Paste key'}
                    value={drafts[provider.id] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [provider.id]: e.target.value }))}
                    className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-[var(--lagoon-deep)] px-3 py-1 font-semibold text-white dark:text-[#0a1418]"
                  >
                    Save
                  </button>
                </div>
              )}
            </form>
          )
        })}
      </div>
    </details>
  )
}
