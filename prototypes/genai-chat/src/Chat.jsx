import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SimultaneousEntropyMessage } from './components/SimultaneousEntropyMessage.jsx'

const MAX_VISIBLE_MESSAGES = 3

export default function Chat() {
  const [messages, setMessages] = useState([
    { id: 1, role: 'assistant', content: 'Hello! How can I help you today?' }
  ])
  const [input, setInput] = useState('')
  const messagesEndRef = useRef(null)
  const bgVideoRef = useRef(null)

  useEffect(() => {
    const video = bgVideoRef.current
    if (!video) return

    const kick = () => {
      video.muted = true
      video.play().catch(() => {})
    }

    kick()
    video.addEventListener('loadeddata', kick)
    return () => video.removeEventListener('loadeddata', kick)
  }, [])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const removeMessageById = useCallback((id) => {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: input.trim()
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')

    // Simulate a simple echo response for demo purposes
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: userMessage.id + 1,
          role: 'assistant',
          content: `You said: "${userMessage.content}"`
        }
      ])
    }, 500)
  }

  return (
    <div className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden bg-zinc-950">
      <video
        ref={bgVideoRef}
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden
      >
        {/* MP4 (H.264/AAC) plays reliably across browsers; MOV is inconsistent outside Safari */}
        <source src="/bg-video-slow.mp4" type="video/mp4" />
        <source src="/bg-video-slow.mov" type="video/quicktime" />
      </video>
      <div
        className="pointer-events-none absolute inset-0 -z-[9] bg-zinc-950/55"
        aria-hidden
      />
      {/* Header */}
      {/* <header className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-xl font-medium text-white">Chat</h1>
      </header> */}

      {/* Messages area */}
      <main className="flex-1 overflow-y-auto px-0 pt-[max(1rem,env(safe-area-inset-top))] md:px-6 md:pt-4">
        <div className="mx-auto max-w-2xl">
          {messages.map((message, index) => {
            const extras = messages.length - MAX_VISIBLE_MESSAGES
            const evict = extras > 0 && index < extras
            return (
              <SimultaneousEntropyMessage
                key={message.id}
                content={message.content}
                textColor={
                  message.role === 'user' ? '#e0e0e0' : '#D4A864'
                }
                textAlign={message.role === 'user' ? 'right' : 'left'}
                evict={evict}
                onEvicted={() => removeMessageById(message.id)}
              />
            )
          })}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input area */}
      <footer className="flex flex-col gap-3 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 md:pb-4">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-2xl gap-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-zinc-600"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-white px-6 py-3 font-medium text-black transition-colors hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 focus:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </form>
        <nav
          aria-label="Site"
          className="mx-auto flex w-full max-w-2xl flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-zinc-500"
        >
          <Link className="hover:text-white" to="/about">
            About
          </Link>
          <Link className="hover:text-white" to="/privacy">
            Privacy Policy
          </Link>
          <Link className="hover:text-white" to="/terms">
            Terms &amp; Conditions
          </Link>
        </nav>
      </footer>
    </div>
  )
}
