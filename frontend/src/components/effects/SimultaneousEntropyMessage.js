import { useRef, useLayoutEffect, useState, useEffect, useCallback } from 'react'
import { measureWrappedTextHeight } from './gravityCascade.js'
import { runSimultaneousEntropyEffect } from './simultaneousEntropy.js'

const FONT_SIZE = 16
const FONT_FAMILY = 'Georgia, serif'

const EFFECT_START_DELAY_MS = 0
const COLLAPSE_MS = 2000

/** Duration of the opacity fade used by the reduced-motion fallback (D10). */
const REDUCED_MOTION_FADE_MS = 200

/**
 * Reads `prefers-reduced-motion: reduce` once at mount.
 * Acceptable per Phase 1: a static read covers the dominant case; flipping the OS
 * setting mid-session and seeing the effect change is not a requirement.
 */
function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (e) => setReduced(e.matches)
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else if (mq.addListener) mq.addListener(onChange)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange)
      else if (mq.removeListener) mq.removeListener(onChange)
    }
  }, [])
  return reduced
}

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

/**
 * Plain-DOM fallback used when `prefers-reduced-motion: reduce` is active.
 *
 * External contract is identical to the canvas path:
 *   - mounts with `content` visible in the requested color/alignment
 *   - when `evict` flips true: starts a 200ms opacity fade
 *   - on `transitionend`, calls `onDissolveStart` then `onDissolveComplete`
 * Promotes the canvas path's `sr-only` span to a visible block so the message
 * is readable without the canvas. Font matches the prototype (Georgia 16px).
 */
function ReducedMotionMessageBody({
  content,
  textColor,
  textAlign = 'left',
  evict,
  onDissolveStart,
  onDissolveComplete,
}) {
  const ref = useRef(null)
  const startedRef = useRef(false)
  const completedRef = useRef(false)

  useEffect(() => {
    if (!evict) return
    const el = ref.current
    if (!el) return
    if (startedRef.current) return
    startedRef.current = true
    onDissolveStart?.()
    const handleEnd = (e) => {
      if (e.target !== el || e.propertyName !== 'opacity') return
      el.removeEventListener('transitionend', handleEnd)
      if (completedRef.current) return
      completedRef.current = true
      onDissolveComplete?.()
    }
    el.addEventListener('transitionend', handleEnd)
    // Safety: if `transitionend` is skipped (e.g. element hidden mid-transition),
    // fire onDissolveComplete after the fade duration so the parent always unmounts.
    const safety = window.setTimeout(() => {
      el.removeEventListener('transitionend', handleEnd)
      if (completedRef.current) return
      completedRef.current = true
      onDissolveComplete?.()
    }, REDUCED_MOTION_FADE_MS + 50)
    // Force a frame so the browser registers the starting opacity before we
    // flip it; without this, some engines coalesce the change and skip the transition.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.opacity = '0'
      })
    })
    return () => {
      el.removeEventListener('transitionend', handleEnd)
      window.clearTimeout(safety)
    }
  }, [evict, onDissolveStart, onDissolveComplete])

  return (
    <div
      ref={ref}
      style={{
        color: textColor,
        textAlign,
        fontSize: `${FONT_SIZE}px`,
        fontFamily: FONT_FAMILY,
        lineHeight: 1.4,
        opacity: 1,
        transition: `opacity ${REDUCED_MOTION_FADE_MS}ms ease-out`,
        padding: '12px 0',
      }}
    >
      {content}
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
  const reducedMotion = useReducedMotion()

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
          reducedMotion ? (
            <ReducedMotionMessageBody
              content={content}
              textColor={textColor}
              textAlign={textAlign}
              evict={evict}
              onDissolveStart={handleDissolveStart}
              onDissolveComplete={handleDissolveComplete}
            />
          ) : (
            <SimultaneousEntropyCanvas
              content={content}
              textColor={textColor}
              textAlign={textAlign}
              onDissolveStart={handleDissolveStart}
              bubbleFading={bubbleFading}
              evictRef={evictRef}
              onDissolveComplete={handleDissolveComplete}
            />
          )
        )}
      </div>
    </div>
  )
}
