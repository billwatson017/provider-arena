export default function Footer() {
  return (
    <footer className="mt-12 border-t border-border">
      <div className="mx-auto flex max-w-[110rem] flex-col gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:justify-between">
        <p className="m-0">
          An example app for{' '}
          <a href="https://tanstack.com/ai" target="_blank" rel="noreferrer" className="underline hover:text-fg">
            TanStack AI
          </a>{' '}
          on Cloudflare Workers.
        </p>
        <a
          href="https://github.com/billwatson017/provider-arena"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-fg"
        >
          Source on GitHub
        </a>
      </div>
    </footer>
  )
}
