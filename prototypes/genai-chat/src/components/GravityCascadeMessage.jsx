import { useRef, useLayoutEffect, useState, useEffect, useCallback } from 'react'
import {
  measureWrappedTextHeight,
  runGravityCascadeEffect,
} from '../lib/gravityCascade.js'

const FONT_SIZE = 16
const FONT_FAMILY = 'Times New Roman, serif'

/** Delay after a message appears before the gravity-cascade canvas runs. */
const EFFECT_START_DELAY_MS = 0

/**
 * Canvas-only: “Dust — Gravity Cascade” (Effect 8 from dissolution-selected.html).
 * @param {{ content: string, textColor: string, textAlign?: 'left' | 'right', onDissolveStart?: () => void }} props
 */
function GravityCascadeCanvas({
  content,
  textColor,
  textAlign = 'left',
  onDissolveStart,
  bubbleFading,
  onFadeEnd,
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
    return runGravityCascadeEffect(canvas, container, () => content, {
      fontSize: FONT_SIZE,
      fontFamily: FONT_FAMILY,
      textColor,
      textAlign,
      onDissolveStart,
    })
  }, [content, textColor, textAlign, onDissolveStart])

  return (
    <div
      ref={containerRef}
      className={`relative w-full min-w-0 overflow-hidden transition-opacity duration-[3000ms] ease-out ${
        bubbleFading ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ minHeight: minH }}
      onTransitionEnd={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.propertyName === 'opacity' && bubbleFading) onFadeEnd?.()
      }}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 top-1 block h-full w-full"
        aria-hidden
      />
      <span className="sr-only">{content}</span>
    </div>
  )
}

/** @typedef {'left' | 'right'} TextAlign */

/** Message line: canvas gravity cascade after EFFECT_START_DELAY_MS. */
export function GravityCascadeMessage({
  content,
  textColor,
  textAlign = 'left',
}) {
  const [effectReady, setEffectReady] = useState(false)
  const [bubbleFading, setBubbleFading] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const handleDissolveStart = useCallback(() => {
    setBubbleFading(true)
  }, [])

  const handleFadeEnd = useCallback(() => {
    setDismissed(true)
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => setEffectReady(true), EFFECT_START_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [])

  if (dismissed) return null

  return (
    <div
      className={`mb-2 flex w-full min-w-0 ${
        textAlign === 'right' ? 'justify-end' : 'justify-start'
      }`}
    >
      <div className="w-[80%] min-w-0">
        {effectReady && (
          <GravityCascadeCanvas
            content={content}
            textColor={textColor}
            textAlign={textAlign}
            onDissolveStart={handleDissolveStart}
            bubbleFading={bubbleFading}
            onFadeEnd={handleFadeEnd}
          />
        )}
      </div>
    </div>
  )
}
