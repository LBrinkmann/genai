import { useRef, useLayoutEffect, useState, useEffect, useCallback } from 'react'
import { measureWrappedTextHeight } from '../lib/gravityCascade.js'
import { runSimultaneousEntropyEffect } from '../lib/simultaneousEntropy.js'

const FONT_SIZE = 16
const FONT_FAMILY = 'Georgia, serif'

const EFFECT_START_DELAY_MS = 0
const COLLAPSE_MS = 2000

function SimultaneousEntropyCanvas({
  content,
  textColor,
  textAlign = 'left',
  onDissolveStart,
  bubbleFading,
  evictRef,
  onDissolveComplete,
}) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)

  const [minH, setMinH] = useState(48)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      if (w < 1) return
      const h = measureWrappedTextHeight(content, w, FONT_SIZE, FONT_FAMILY)
      setMinH(Math.max(Math.ceil(h + 24), 48))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [content])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    return runSimultaneousEntropyEffect(canvas, container, () => content, {
      fontSize: FONT_SIZE,
      fontFamily: FONT_FAMILY,
      textColor,
      textAlign,
      onDissolveStart,
      persistInHold: true,
      evictRef,
      onDissolveComplete,
    })
  }, [content, textColor, textAlign, onDissolveStart, onDissolveComplete])

  return (
    <div
      ref={containerRef}
      className={`relative w-full min-w-0 overflow-hidden transition-opacity duration-[3000ms] ease-out ${
        bubbleFading ? 'opacity-0' : 'opacity-100'
      }`}
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

export function SimultaneousEntropyMessage({
  content,
  textColor,
  textAlign = 'left',
  evict = false,
  onEvicted,
}) {
  const [effectReady, setEffectReady] = useState(false)
  const [bubbleFading, setBubbleFading] = useState(false)
  /** Collapse runs in parallel with dissolve; parent removes after dissolve completes. */
  const [layout, setLayout] = useState('visible')
  const evictRef = useRef(false)
  const onEvictedRef = useRef(onEvicted)
  const collapseRef = useRef(null)
  const collapseSnapshotRef = useRef(null)

  evictRef.current = evict
  onEvictedRef.current = onEvicted

  const handleDissolveStart = useCallback(() => {
    setBubbleFading(true)
    if (!onEvictedRef.current) return
    const el = collapseRef.current
    if (el) {
      const h = el.getBoundingClientRect().height
      const cs = getComputedStyle(el)
      collapseSnapshotRef.current = {
        h,
        marginBottom: cs.marginBottom,
      }
    }
    setLayout('collapsing')
  }, [])

  const handleDissolveComplete = useCallback(() => {
    onEvictedRef.current?.()
  }, [])

  useLayoutEffect(() => {
    if (layout !== 'collapsing') return
    const el = collapseRef.current
    const snap = collapseSnapshotRef.current
    if (!el || !snap) return
    el.style.height = `${snap.h}px`
    el.style.marginBottom = snap.marginBottom
    // el.style.overflow = 'hidden'
    el.style.transition = `height ${COLLAPSE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), margin-bottom ${COLLAPSE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
    collapseSnapshotRef.current = null
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.height = '0px'
        el.style.marginBottom = '0px'
      })
    })
  }, [layout])

  useEffect(() => {
    const t = window.setTimeout(() => setEffectReady(true), EFFECT_START_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <div
      ref={collapseRef}
      className={`flex w-full min-w-0 ${
        textAlign === 'right' ? 'justify-end' : 'justify-start'
      } ${layout === 'visible' ? 'mb-2' : ''}`}
    >
      <div className="w-[80%] min-w-0">
        {effectReady && (
          <SimultaneousEntropyCanvas
            content={content}
            textColor={textColor}
            textAlign={textAlign}
            onDissolveStart={handleDissolveStart}
            bubbleFading={bubbleFading}
            evictRef={evictRef}
            onDissolveComplete={handleDissolveComplete}
          />
        )}
      </div>
    </div>
  )
}
