import { Link } from 'react-router-dom'

export function LegalPageLayout({ title, children }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3">
          <Link
            to="/"
            className="text-sm text-zinc-400 transition-colors hover:text-white"
          >
            ← Genocide AI
          </Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link
              className="text-zinc-500 transition-colors hover:text-white"
              to="/about"
            >
              About
            </Link>
            <Link
              className="text-zinc-500 transition-colors hover:text-white"
              to="/privacy"
            >
              Privacy
            </Link>
            <Link
              className="text-zinc-500 transition-colors hover:text-white"
              to="/terms"
            >
              Terms
            </Link>
          </nav>
        </div>
      </header>
      <article className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-8 text-2xl font-semibold tracking-tight text-white md:text-3xl">
          {title}
        </h1>
        <div className="space-y-5 leading-relaxed text-[15px] text-zinc-400 [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-600 [&_blockquote]:py-1 [&_blockquote]:pl-4 [&_blockquote]:italic [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-zinc-200 [&_h3]:mb-3 [&_h3]:mt-8 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-zinc-200 [&_p.lead]:text-base [&_p.lead]:font-medium [&_p.lead]:text-zinc-200 [&_strong]:font-medium [&_strong]:text-zinc-300 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
          {children}
        </div>
      </article>
    </div>
  )
}
