import OpenAI from 'openai'
import { loadEnv } from 'vite'

/** OpenAI TTS input limit for standard speech models. */
const MAX_TTS_CHARS = 4096

/**
 * OpenAI accepts built-in names (e.g. `coral`, `shimmer`) or `{ id: "voice_..." }` for
 * custom voices. Unknown strings are passed through so new platform voices work without
 * updating this file. See https://platform.openai.com/docs/guides/text-to-speech#voice-options
 *
 * @param {Record<string, unknown>} body
 * @returns {{ ok: true, voice: string | { id: string } } | { ok: false, error: string }}
 */
function resolveVoice(body) {
  const raw = body.voice
  if (raw === undefined || raw === null) {
    return { ok: true, voice: 'alloy' }
  }
  if (typeof raw === 'string') {
    const name = raw.trim()
    if (!name) return { ok: true, voice: 'alloy' }
    return { ok: true, voice: name }
  }
  if (typeof raw === 'object' && raw !== null && typeof raw.id === 'string') {
    const id = raw.id.trim()
    if (!id) {
      return { ok: false, error: 'Invalid "voice": object "id" must be non-empty' }
    }
    return { ok: true, voice: { id } }
  }
  return {
    ok: false,
    error:
      'Invalid "voice": use a built-in name string (e.g. "coral") or { "id": "voice_..." } for a custom voice',
  }
}

/**
 * Resolve API key: plugin option → process.env → Vite env files (`.env`, `.env.local`, …).
 * IDE-started dev servers often do not inherit `~/.zshrc`; use a project `.env` file.
 */
function resolveOpenAIApiKey(pluginKey) {
  if (pluginKey) return pluginKey
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  const mode = process.env.NODE_ENV || 'development'
  const fromFiles = loadEnv(mode, process.cwd(), '')
  return fromFiles.OPENAI_API_KEY || ''
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

/**
 * Vite dev-server plugin: POST /api/tts
 * Body: JSON `{ "text": "...", "voice": "coral" }` (voice optional; default `alloy`).
 * Custom OpenAI voices: `{ "voice": { "id": "voice_..." } }`.
 * Response: MP3 bytes (`audio/mpeg`) or JSON `{ error }` on failure.
 *
 * Only active during `vite` dev. Use a real backend in production.
 */
export function ttsApiPlugin(options = {}) {
  return {
    name: 'tts-api',
    /** Run before Vite’s HTML / SPA handlers so POST /api/tts is not swallowed. */
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0]
        if (path !== '/api/tts' || req.method !== 'POST') {
          next()
          return
        }

        const apiKey = resolveOpenAIApiKey(options.openaiApiKey)
        if (!apiKey) {
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error:
                'OPENAI_API_KEY is not set for the dev server. Create a file named .env in the project root with: OPENAI_API_KEY=sk-... (then restart npm run dev). Shell-only keys in ~/.zshrc are not visible when the dev server is started from some IDEs.',
            })
          )
          return
        }

        let body
        try {
          body = await readJsonBody(req)
        } catch {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Invalid JSON body' }))
          return
        }

        const text = typeof body.text === 'string' ? body.text : ''
        if (!text.trim()) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: 'Missing "text" field (non-empty string)',
            })
          )
          return
        }

        if (text.length > MAX_TTS_CHARS) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: `Text exceeds ${MAX_TTS_CHARS} characters`,
            })
          )
          return
        }

        const voiceResult = resolveVoice(body)
        if (!voiceResult.ok) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: voiceResult.error }))
          return
        }

        try {
          const openai = new OpenAI({ apiKey })
          const speechResponse = await openai.audio.speech.create({
            model: 'tts-1',
            voice: voiceResult.voice,
            input: text,
            response_format: 'mp3',
          })

          if (!speechResponse.ok) {
            const errBody = await speechResponse.text()
            console.error(
              '[tts-api] OpenAI error',
              speechResponse.status,
              errBody
            )
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error: `OpenAI ${speechResponse.status}: ${errBody}`,
              })
            )
            return
          }

          const arrayBuffer = await speechResponse.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)

          if (buffer.length === 0) {
            console.error('[tts-api] OpenAI returned empty audio body')
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({ error: 'OpenAI returned empty audio body' })
            )
            return
          }

          res.statusCode = 200
          res.setHeader('Content-Type', 'audio/mpeg')
          res.setHeader('Content-Length', String(buffer.length))
          res.end(buffer)
        } catch (err) {
          console.error('[tts-api]', err)
          const message = err?.message ?? String(err)
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: message }))
        }
      })
    },
  }
}
