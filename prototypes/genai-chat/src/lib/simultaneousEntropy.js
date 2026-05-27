/**
 * Dust — Simultaneous Entropy (Effect 11 from dissolution.html).
 * Same mixed trajectories and ambient dust as Entropy, but the whole
 * text releases at once with a small per-particle stagger.
 */

import {
  PHASE_FADE_IN,
  PHASE_HOLD,
  PHASE_DISSOLVE,
  PHASE_PAUSE,
  PHASE_DONE,
  measureWrappedTextHeight,
  sampleTextPixelsFine,
  drawWrappedText,
} from './gravityCascade.js'

const DUST_COLORS_RGB = [
  '#d4c5a0',
  '#a89f91',
  '#c8b88a',
  '#8a8580',
  '#d9d0c0',
  '#b8a88a',
  '#9a8e7a',
].map((hex) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
}))

function randomDustColor() {
  return DUST_COLORS_RGB[Math.floor(Math.random() * DUST_COLORS_RGB.length)]
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} container
 * @param {() => string} getText
 * @param {object} [options]
 * @param {() => void} [options.onDissolveStart]
 * @param {boolean} [options.persistInHold] — if true, stay on full-opacity text until `evictRef` is set
 * @param {{ current: boolean } | null} [options.evictRef] — set `current` to true to start dissolve from hold (read every frame; not in React effect deps)
 * @param {() => void} [options.onDissolveComplete] — fired once when dissolve + pause finishes (terminal)
 * @returns {() => void} cleanup
 */
export function runSimultaneousEntropyEffect(canvas, container, getText, options = {}) {
  const stagger = options.stagger ?? 0.3
  const gravity = options.gravity ?? 5
  const fadeSpeed = options.fadeSpeed ?? 0.09
  const ambientCount = options.ambientCount ?? 40
  const fontSize = options.fontSize ?? 14
  const fontFamily = options.fontFamily ?? 'Georgia, serif'
  const textColor = options.textColor ?? '#e4e4e7'
  const maxWPad = options.maxWPad
  const textAlign = options.textAlign ?? 'left'
  const onDissolveStart = options.onDissolveStart
  const persistInHold = options.persistInHold ?? false
  const evictRef = options.evictRef ?? null
  const onDissolveComplete = options.onDissolveComplete

  let ctx
  let W = 0
  let H = 0
  let particles = []
  let ambientParticles = []
  let phase = PHASE_FADE_IN
  let phaseTime = 0
  let animId = 0
  let lastTime = 0
  let inView = true
  /** Latched when starting a requested evict so we only enter dissolve once. */
  let evictLatch = false

  const drawOpts = { fontSize, fontFamily, textColor, maxWPad, textAlign }

  function resize() {
    const rect = container.getBoundingClientRect()
    W = Math.round(rect.width)
    H = Math.round(rect.height)
    if (W < 1 || H < 1) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function initAmbient() {
    ambientParticles = []
    for (let i = 0; i < ambientCount; i++) {
      const col = randomDustColor()
      ambientParticles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 4 - 2,
        alpha: 0.05 + Math.random() * 0.12,
        size: 0.3 + Math.random() * 0.6,
        r: col.r,
        g: col.g,
        b: col.b,
        phase: Math.random() * Math.PI * 2,
      })
    }
  }

  function drawAmbient(dt, elapsed) {
    if (!ctx) return
    for (const a of ambientParticles) {
      a.x += a.vx * dt
      a.y += a.vy * dt
      a.x += Math.sin(elapsed * 0.3 + a.phase) * 2 * dt
      a.y += Math.cos(elapsed * 0.4 + a.phase) * 1.5 * dt
      if (a.x < 0) a.x = W
      if (a.x > W) a.x = 0
      if (a.y < 0) a.y = H
      if (a.y > H) a.y = 0
      ctx.fillStyle = `rgba(${a.r},${a.g},${a.b},${a.alpha})`
      ctx.fillRect(a.x - a.size * 0.5, a.y - a.size * 0.5, a.size, a.size)
    }
  }

  function initParticles() {
    const text = getText() || ' '
    const points = sampleTextPixelsFine(
      text,
      W,
      H,
      fontSize,
      fontFamily,
      maxWPad,
      textAlign
    )
    particles = points.map((p) => {
      const col = randomDustColor()
      const behavior = Math.random()
      let baseVy
      let baseVx
      if (behavior < 0.25) {
        baseVy = -(15 + Math.random() * 25)
        baseVx = (Math.random() - 0.5) * 15
      } else if (behavior < 0.6) {
        baseVx = 15 + Math.random() * 30
        baseVy = 5 + Math.random() * 15
      } else {
        baseVx = (Math.random() - 0.5) * 20
        baseVy = 20 + Math.random() * 40
      }
      return {
        ox: p.x,
        oy: p.y,
        x: p.x,
        y: p.y,
        vx: 0,
        vy: 0,
        baseVx,
        baseVy,
        alpha: 0,
        maxAlpha: 0.3 + Math.random() * 0.5,
        size: 1.5 + Math.random() * 0.7,
        r: col.r,
        g: col.g,
        b: col.b,
        released: false,
        life: 1.0,
        turbPhase: Math.random() * Math.PI * 2,
        delay: Math.random() * stagger,
      }
    })
  }

  function updateParticles(dt, elapsed) {
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    for (const p of particles) {
      if (!p.released && elapsed >= p.delay) {
        p.released = true
        p.alpha = p.maxAlpha
        p.x = p.ox
        p.y = p.oy
        p.vx = p.baseVx * (0.7 + Math.random() * 0.6)
        p.vy = p.baseVy * (0.7 + Math.random() * 0.6)
      }

      if (!p.released) {
        ctx.fillStyle = 'rgba(224,224,224,1)'
        ctx.fillRect(p.ox, p.oy, 2, 2)
        continue
      }

      if (p.alpha <= 0) continue

      p.vx += Math.sin(elapsed * 0.8 + p.turbPhase) * 5 * dt
      p.vy += gravity * dt
      p.vx *= 0.998
      p.vy *= 0.998
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= fadeSpeed * dt
      p.alpha = p.maxAlpha * Math.max(0, p.life)
      if (p.alpha < 0) p.alpha = 0

      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${p.alpha})`
      ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size)
    }

    drawAmbient(dt, elapsed)
  }

  function startCycle() {
    phase = PHASE_FADE_IN
    phaseTime = 0
    evictLatch = false
    lastTime = performance.now()
    resize()
    if (W < 1 || H < 1) return
    initParticles()
    initAmbient()
  }

  function loop() {
    if (!inView) {
      animId = requestAnimationFrame(loop)
      return
    }
    if (!ctx || W < 1 || H < 1) {
      resize()
      if (!ctx || W < 1 || H < 1) {
        animId = requestAnimationFrame(loop)
        return
      }
      initParticles()
      initAmbient()
    }
    const now = performance.now()
    const dt = Math.min((now - lastTime) / 1000, 0.05)
    lastTime = now
    phaseTime += dt

    const text = getText() || ' '

    switch (phase) {
      case PHASE_FADE_IN:
        drawWrappedText(ctx, text, W, H, Math.min(phaseTime / 1.0, 1), drawOpts)
        drawAmbient(dt, phaseTime)
        if (phaseTime >= 1.0) {
          phase = PHASE_HOLD
          phaseTime = 0
        }
        break
      case PHASE_HOLD:
        drawWrappedText(ctx, text, W, H, 1, drawOpts)
        drawAmbient(dt, phaseTime)
        {
          const shouldAutoDissolve = !persistInHold && phaseTime >= 5.0
          const shouldEvict =
            persistInHold && evictRef && evictRef.current && !evictLatch
          if (shouldEvict) {
            evictLatch = true
          }
          if (shouldAutoDissolve || shouldEvict) {
            onDissolveStart?.()
            phase = PHASE_DISSOLVE
            phaseTime = 0
            particles.forEach((p) => {
              p.x = p.ox
              p.y = p.oy
              p.vx = 0
              p.vy = 0
              p.alpha = 0
              p.released = false
              p.life = 1.0
            })
          }
        }
        break
      case PHASE_DISSOLVE:
        updateParticles(dt, phaseTime)
        if (phaseTime >= 5.0) {
          phase = PHASE_PAUSE
          phaseTime = 0
        }
        break
      case PHASE_PAUSE:
        if (ctx) ctx.clearRect(0, 0, W, H)
        if (phaseTime >= 1.0) {
          phase = PHASE_DONE
          onDissolveComplete?.()
        }
        break
      case PHASE_DONE:
        break
      default:
        break
    }
    if (phase === PHASE_DONE) {
      return
    }
    animId = requestAnimationFrame(loop)
  }

  const io = new IntersectionObserver(
    (entries) => {
      const e = entries[0]
      inView = e ? e.isIntersecting : true
    },
    { threshold: 0.1 }
  )
  io.observe(container)

  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(animId)
    if (phase === PHASE_DONE) {
      resize()
      return
    }
    startCycle()
    lastTime = performance.now()
    animId = requestAnimationFrame(loop)
  })
  ro.observe(container)

  startCycle()
  animId = requestAnimationFrame(loop)

  return () => {
    cancelAnimationFrame(animId)
    io.disconnect()
    ro.disconnect()
  }
}
