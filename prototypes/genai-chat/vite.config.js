import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { ttsApiPlugin } from './api/tts-plugin.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      ttsApiPlugin({
        openaiApiKey: env.OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      }),
      react(),
    ],
  }
})
