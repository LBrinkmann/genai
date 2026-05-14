import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import {
  drawWrappedText,
  measureWrappedTextHeight,
} from './gravityCascade.js'

/**
 * Lightweight canvas message used while a streamed response is still
 * arriving. Renders the current `content` on every change with the
 * same font/wrap/alignment used by `SimultaneousEntropyMessage` so the
 * unmount-and-swap to the full effect at completion is dimensionally
 * identical and visually continuous.
 *
 * No particles, no ambient dust, no eviction / dissolve handling —
 * those belong to `SimultaneousEntropyMessage`. This component:
 *   • measures wrapped height on every content change,
 *   • clears the canvas and calls `drawWrappedText` at α=1,
 *   • exposes the same `sr-only` span for screen readers,
 *   • mirrors the outer flex / width markup so React's DOM diff at
 *     the swap moment is a near-no-op for everything except the
 *     canvas element itself.
 */

const FONT_SIZE = 16
const FONT_FAMILY = 'Georgia, serif'

function StreamingCanvas({ content, textColor, textAlign }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const [minH, setMinH] = useState(48)

  // Resize the canvas in physical pixels to match the container while
  // respecting devicePixelRatio. Re-runs when the container width or
  // computed height changes.
  useLayoutEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return undefined

    const repaint = () => {
      const w = container.clientWidth
      if (w < 1) return
      const h = measureWrappedTextHeight(
        content,
        w,
        FONT_SIZE,
        FONT_FAMILY
      )
      const padded = Math.max(Math.ceil(h + 24), 48)
      setMinH(padded)

      const dpr = window.devicePixelRatio || 1
      const containerH = container.clientHeight || padded
      canvas.width = w * dpr
      canvas.height = containerH * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${containerH}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, containerH)
      drawWrappedText(ctx, content || ' ', w, containerH, 1, {
        fontSize: FONT_SIZE,
        fontFamily: FONT_FAMILY,
        textColor,
        textAlign,
      })
    }

    repaint()
    const ro = new ResizeObserver(repaint)
    ro.observe(container)
    return () => ro.disconnect()
  }, [content, textColor, textAlign])

  return (
    <div
      ref={containerRef}
      className="relative w-full min-w-0 overflow-hidden"
      style={{ minHeight: minH }}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 block h-full w-full"
        aria-hidden
      />
      <span className="sr-only">{content}</span>
    </div>
  )
}

export function StreamingCanvasMessage({
  content,
  textColor,
  textAlign = 'left',
}) {
  // `useReducedMotion` isn't necessary here — the streaming view has
  // no animation; the static reduced-motion DOM fallback is reserved
  // for the post-complete `SimultaneousEntropyMessage`. The streaming
  // canvas itself paints a single static frame per chunk.

  // Outer markup mirrors `SimultaneousEntropyMessage` exactly so the
  // unmount→mount swap at stream completion does not shift the bubble.
  useEffect(() => {
    // No-op effect to mirror the lifecycle shape; kept so future
    // additions (telemetry, focus management) have a hook.
  }, [])

  return (
    <div
      className={`flex w-full min-w-0 ${
        textAlign === 'right' ? 'justify-end' : 'justify-start'
      } mb-2`}
    >
      <div className="w-[80%] min-w-0">
        <StreamingCanvas
          content={content}
          textColor={textColor}
          textAlign={textAlign}
        />
      </div>
    </div>
  )
}

export default StreamingCanvasMessage
