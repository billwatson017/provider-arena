export default function Footer() {
  return (
    <footer className="mt-12 border-t border-[var(--line)] px-4 pb-10 pt-8 text-[var(--sea-ink-soft)]">
      <div className="page-wrap flex flex-col items-center justify-between gap-3 text-center text-sm sm:flex-row sm:text-left">
        <p className="m-0">
          An example app for{' '}
          <a href="https://tanstack.com/ai" target="_blank" rel="noreferrer">
            TanStack AI
          </a>
          , deployed on Cloudflare Workers.
        </p>
        <a
          href="https://github.com/billwatson017/provider-arena"
          target="_blank"
          rel="noreferrer"
        >
          Source on GitHub
        </a>
      </div>
    </footer>
  )
}
