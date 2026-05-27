/**
 * Dust — Gravity Cascade (Effect 8 from dissolution-selected.html).
 * Sand-like crumble with ground accumulation; warm amber particle tones.
 */

export const PHASE_FADE_IN = 'fadeIn'
export const PHASE_HOLD = 'hold'
export const PHASE_DISSOLVE = 'dissolve'
export const PHASE_PAUSE = 'pause'
/** Terminal: one-shot sequence finished; animation frame loop stops. */
export const PHASE_DONE = 'done'

/**
 * Line height as a multiple of `fontSize` (wrapping, canvas draw, and `measureWrappedTextHeight`).
 * Lower for tighter lines (e.g. 1.35–1.5); default matches the dissolution reference.
 */
export const TEXT_LINE_HEIGHT_EM = 1.4

const WARM_COLORS = [
  { r: 212, g: 168, b: 100 },
  { r: 198, g: 156, b: 88 },
  { r: 180, g: 144, b: 80 },
  { r: 168, g: 140, b: 100 },
  { r: 200, g: 180, b: 140 },
  { r: 160, g: 136, b: 100 },
  { r: 190, g: 170, b: 130 },
]

/** Horizontal origin for fillText: with symmetric side padding `pad`, max line width is `W - pad`. */
function textOriginX(W, pad, textAlign) {
  if (textAlign === 'center') return W / 2
  if (textAlign === 'right') return W - pad + 20
  if (textAlign === 'left') return pad / 2
  return pad / 2
}

/**
 * Finer 2px step for denser particles (matches reference).
 * @param {'left' | 'center' | 'right'} [textAlign='left'] — must match drawWrappedText: x is W/2 for center, pad/2 for left.
 */
export function sampleTextPixelsFine(
  text,
  width,
  height,
  fontSize,
  fontFamily,
  maxWPad,
  textAlign = 'left'
) {
  const off = document.createElement('canvas')
  off.width = width
  off.height = height
  const ctx = off.getContext('2d')
  
  const pad = maxWPad ?? Math.min(80, Math.max(32, width * 0.12))
  ctx.fillStyle = '#e0e0e0'
  ctx.font = `${fontSize}px ${fontFamily}`
  ctx.textAlign = textAlign
  ctx.textBaseline = 'top'

  const words = text.split(' ')
  const lines = []
  let line = ''
  const maxW = width - pad
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line)
      line = w
    } else {
      line = test
    }
  }
  if (line) lines.push(line)

  const lineHeight = fontSize * TEXT_LINE_HEIGHT_EM
  const totalH = lines.length * lineHeight
  const startY = (height - totalH) / 2
  const x = textOriginX(width, pad, textAlign)

  lines.forEach((l, i) => {
    ctx.fillText(l, x, startY + i * lineHeight)
  })

  const data = ctx.getImageData(0, 0, width, height).data
  const points = []
  const step = 2
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4
      if (data[idx + 3] > 128) {
        points.push({ x, y })
      }
    }
  }
  return points
}

/** Pixel height needed for wrapped text (matches drawWrappedText layout). */
export function measureWrappedTextHeight(text, W, fontSize, fontFamily, maxWPad) {
  if (W < 1) return 0
  const off = document.createElement('canvas')
  const ctx = off.getContext('2d')
  ctx.font = `${fontSize}px ${fontFamily}`
  const pad = maxWPad ?? Math.min(80, Math.max(32, W * 0.12))
  const maxW = W - pad
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const wd of words) {
    const test = line ? line + ' ' + wd : wd
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line)
      line = wd
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  const lh = fontSize * TEXT_LINE_HEIGHT_EM
  return lines.length * lh
}

export function drawWrappedText(ctx, text, W, H, alpha, opts) {
  const fontSize = opts?.fontSize ?? 14
  const fontFamily = opts?.fontFamily ?? 'Helvetica, sans-serif'
  const textColor = opts?.textColor ?? '#e4e4e7'
  const pad = opts?.maxWPad ?? Math.min(80, Math.max(32, W * 0.12))
  const textAlign = opts?.textAlign ?? 'left'

  ctx.clearRect(0, 0, W, H)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = textColor
  ctx.font = `${fontSize}px ${fontFamily}`
  ctx.textAlign = textAlign
  ctx.textBaseline = 'top'
  const words = text.split(' ')
  const lines = []
  let line = ''
  const maxW = W - pad
  for (const wd of words) {
    const test = line ? line + ' ' + wd : wd
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line)
      line = wd
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  const lh = fontSize * TEXT_LINE_HEIGHT_EM
  const totalH = lines.length * lh
  const startY = (H - totalH) / 2
  const x = textOriginX(W, pad, textAlign)
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lh))
  ctx.restore()
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} container
 * @param {() => string} getText
 * @param {object} [options]
 * @param {() => void} [options.onDissolveStart] — called once when the hold phase ends and dissolve begins
 * @returns {() => void} cleanup
 */
export function runGravityCascadeEffect(canvas, container, getText, options = {}) {
  const gravity = options.gravity ?? 60
  const bounceProb = options.bounceProb ?? 0.3
  const tumbleInt = options.tumbleInt ?? 10
  const fontSize = options.fontSize ?? 14
  const fontFamily = options.fontFamily ?? 'Helvetica, sans-serif'
  const textColor = options.textColor ?? '#e4e4e7'
  const maxWPad = options.maxWPad
  const textAlign = options.textAlign ?? 'left'
  const onDissolveStart = options.onDissolveStart

  let ctx
  let W = 0
  let H = 0
  let particles = []
  let phase = PHASE_FADE_IN
  let phaseTime = 0
  let animId = 0
  let lastTime = 0
  let inView = true

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
      const col = WARM_COLORS[Math.floor(Math.random() * WARM_COLORS.length)]
      return {
        ox: p.x,
        oy: p.y,
        x: p.x,
        y: p.y,
        vx: 0,
        vy: 0,
        alpha: 0.4 + Math.random() * 0.4,
        maxAlpha: 0.4 + Math.random() * 0.4,
        size: 0.4 + Math.random() * 1.1,
        r: col.r,
        g: col.g,
        b: col.b,
        weight: 0.6 + Math.random() * 1.0,
        tumble: (Math.random() - 0.5) * 3,
        grounded: false,
        groundTime: 0,
        bounced: false,
      }
    })
  }

  function updateParticles(dt) {
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    const groundY = H - 8

    for (const p of particles) {
      if (p.alpha <= 0) continue

      if (p.grounded) {
        p.groundTime += dt
        p.alpha -= 0.5 * dt
        if (p.alpha < 0) p.alpha = 0
        ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${p.alpha})`
        ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size)
        continue
      }

      p.vy += gravity * 2 * p.weight * dt
      p.vx += Math.sin(p.y * 0.05 + p.tumble) * tumbleInt * 2.5 * dt
      p.vx += 5 * dt
      p.vx *= 0.998
      p.vy *= 0.999

      p.x += p.vx * dt
      p.y += p.vy * dt

      if (p.y >= groundY) {
        if (!p.bounced && Math.random() < bounceProb) {
          p.bounced = true
          p.vy = -p.vy * (0.15 + Math.random() * 0.15)
          p.vx *= 0.5
          p.y = groundY
        } else {
          p.y = groundY - Math.random() * 3
          p.vx = 0
          p.vy = 0
          p.grounded = true
        }
      }

      p.alpha -= 0.08 * dt
      if (p.alpha < 0) p.alpha = 0

      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${p.alpha})`
      ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size)
    }
  }

  function startCycle() {
    phase = PHASE_FADE_IN
    phaseTime = 0
    lastTime = performance.now()
    resize()
    if (W < 1 || H < 1) return
    initParticles()
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
    }
    const now = performance.now()
    const dt = Math.min((now - lastTime) / 1000, 0.05)
    lastTime = now
    phaseTime += dt

    const text = getText() || ' '

    switch (phase) {
      case PHASE_FADE_IN:
        drawWrappedText(ctx, text, W, H, Math.min(phaseTime / 1.0, 1), drawOpts)
        if (phaseTime >= 1.0) {
          phase = PHASE_HOLD
          phaseTime = 0
        }
        break
      case PHASE_HOLD:
        drawWrappedText(ctx, text, W, H, 1, drawOpts)
        if (phaseTime >= 5.0) {
          onDissolveStart?.()
          phase = PHASE_DISSOLVE
          phaseTime = 0
          particles.forEach((p) => {
            p.x = p.ox
            p.y = p.oy
            p.vx = 0
            p.vy = 0
            p.alpha = p.maxAlpha
            p.grounded = false
            p.groundTime = 0
            p.bounced = false
          })
        }
        break
      case PHASE_DISSOLVE:
        updateParticles(dt)
        if (phaseTime >= 4.0) {
          phase = PHASE_PAUSE
          phaseTime = 0
        }
        break
      case PHASE_PAUSE:
        if (ctx) ctx.clearRect(0, 0, W, H)
        if (phaseTime >= 1.0) {
          phase = PHASE_DONE
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
