import { Link } from 'react-router-dom'

export default function Background() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-tile-scroll"
        aria-hidden
      />
      {/* Front: line art */}
      <div
        className="pointer-events-none absolute inset-0 bg-[url('/bg-line.svg')] bg-cover bg-center bg-no-repeat"
        aria-hidden
      />
      <Link
        to="/"
        className="absolute left-4 top-4 z-10 text-sm text-zinc-400 transition-colors hover:text-white"
      >
        ← Chat
      </Link>
    </div>
  )
}
