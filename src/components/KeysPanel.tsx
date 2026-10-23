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
    <details open={prompted !== undefined} className="group rounded-lg border border-border text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="text-muted transition group-open:rotate-90" aria-hidden>
          ›
        </span>
        <span className="font-medium">API keys</span>
        <span className="flex flex-wrap gap-1.5">
          {BYOK_PROVIDERS.map((provider) => {
            const ready = snapshot.status[provider.id]?.state === 'set' || coverage[provider.id]
            return (
              <span
                key={provider.id}
                className={`rounded border px-1.5 py-px font-mono text-[0.7rem] ${
                  ready ? 'border-accent/40 text-accent' : 'border-border text-muted'
                }`}
              >
                {ready ? '●' : '○'} {provider.id}
              </span>
            )
          })}
        </span>
        <span className="ml-auto hidden text-xs text-muted md:inline">
          Optional. Kept in this tab only, sent as request headers.
        </span>
      </summary>

      <div className="grid gap-px border-t border-border bg-border sm:grid-cols-3">
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
              className={`bg-bg p-3 ${isPrompted ? 'ring-1 ring-accent ring-inset' : ''}`}
            >
              <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor={`key-${provider.id}`}>
                {provider.label}
              </label>
              {status?.state === 'set' ? (
                <div className="flex items-center justify-between gap-2">
                  <code className="truncate">{status.masked}</code>
                  <button
                    type="button"
                    onClick={() => void byok.clear(provider.id)}
                    className="text-xs text-muted hover:text-fg"
                  >
                    Clear
                  </button>
                </div>
              ) : coverage[provider.id] ? (
                <p className="m-0 text-xs text-muted">Covered by the server.</p>
              ) : (
                <div className="flex gap-2">
                  <input
                    id={`key-${provider.id}`}
                    type="password"
                    autoComplete="off"
                    placeholder={isPrompted ? 'Needed for your last prompt' : 'Paste key'}
                    value={drafts[provider.id] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [provider.id]: e.target.value }))}
                    className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1 font-mono text-xs placeholder:font-sans placeholder:text-muted focus:border-border-strong focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-accent-fg hover:opacity-90"
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
