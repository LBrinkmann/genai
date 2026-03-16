import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import Box from '@mui/material/Box';

/**
 * DissolvingText wraps the message list area and adds a canvas
 * overlay that creates a pixel-sampled text dissolution effect.
 *
 * Messages in the upper ~35% of the visible scroll area dissolve
 * into particles that trace actual letter shapes and drift away
 * like dust in the wind.
 */

// -- Tuning constants --
const DISSOLUTION_ZONE = 0.35;
const SAMPLE_STEP = 3;
const MAX_PARTICLES_PER_MSG = 200;
const MAX_PARTICLES_TOTAL = 2000;
const WIND_X = -0.6;
const WIND_Y = -0.15;
const GRAVITY = 0.04;
const TURBULENCE_AMP = 0.3;
const PARTICLE_MIN_SIZE = 1;
const PARTICLE_MAX_SIZE = 3;
const PARTICLE_COLOR = { r: 224, g: 224, b: 224 };
const SHADOW_BLUR = 2.5;
const SAMPLE_THROTTLE_MS = 250;
const ADAPTIVE_FRAME_BUDGET_MS = 20;

// Font matching the MUI body2 with Inter
const TEXT_FONT = '14px "Inter", sans-serif';

// -- Particle pool --
function createParticle() {
  return {
    x: 0,
    y: 0,
    originX: 0,
    originY: 0,
    vx: 0,
    vy: 0,
    size: 1,
    opacity: 1,
    life: 1,
    maxLife: 1,
    turbFreq: 0,
    turbPhase: 0,
    active: false,
  };
}

const pool = [];
function acquireParticle() {
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].active) {
      pool[i].active = true;
      return pool[i];
    }
  }
  const p = createParticle();
  p.active = true;
  pool.push(p);
  return p;
}

// -- Text pixel sampling --
function sampleTextPixels(text, width, font, lineHeight) {
  if (!text || width <= 0) return [];

  const offscreen = document.createElement('canvas');
  const ctx = offscreen.getContext('2d');
  ctx.font = font;

  // Word-wrap text to fit width
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';
  for (const word of words) {
    const test = currentLine
      ? currentLine + ' ' + word
      : word;
    if (ctx.measureText(test).width > width && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) lines.push(currentLine);

  const height = Math.max(lines.length * lineHeight, lineHeight);
  offscreen.width = Math.ceil(width);
  offscreen.height = Math.ceil(height);

  ctx.font = font;
  ctx.fillStyle = 'white';
  ctx.textBaseline = 'top';

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 0, i * lineHeight);
  }

  const imageData = ctx.getImageData(
    0,
    0,
    offscreen.width,
    offscreen.height
  );
  const pixels = [];
  const step = SAMPLE_STEP;
  for (let y = 0; y < offscreen.height; y += step) {
    for (let x = 0; x < offscreen.width; x += step) {
      const idx = (y * offscreen.width + x) * 4 + 3;
      if (imageData.data[idx] > 128) {
        pixels.push({ x, y });
      }
    }
  }
  return pixels;
}

function DissolvingText({ children, scrollRef }) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const animRef = useRef(null);
  const lastSampleTimeRef = useRef(0);
  const sampledMsgsRef = useRef(new Map());
  const lastFrameTimeRef = useRef(0);
  const adaptiveStepRef = useRef(SAMPLE_STEP);
  const [canvasSize, setCanvasSize] = useState({
    w: 0,
    h: 0,
  });

  const updateCanvasSize = useCallback(() => {
    const container = scrollRef?.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setCanvasSize({ w: rect.width, h: rect.height });
  }, [scrollRef]);

  useEffect(() => {
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () =>
      window.removeEventListener('resize', updateCanvasSize);
  }, [updateCanvasSize]);

  // Core sampling: find messages in dissolution zone,
  // render their text to offscreen canvas, extract particles
  const sampleDissolutionZone = useCallback(() => {
    const container = scrollRef?.current;
    if (!container) return;

    const now = Date.now();
    if (now - lastSampleTimeRef.current < SAMPLE_THROTTLE_MS) {
      return;
    }
    lastSampleTimeRef.current = now;

    const containerRect = container.getBoundingClientRect();
    const zoneHeight =
      containerRect.height * DISSOLUTION_ZONE;

    const messageEls =
      container.querySelectorAll('[data-msg-index]');
    const activeParticles = particlesRef.current.filter(
      (p) => p.active
    );
    let totalActive = activeParticles.length;

    messageEls.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const relTop = rect.top - containerRect.top;
      const relBottom = rect.bottom - containerRect.top;

      // Reset opacity for messages outside zone
      if (relTop > zoneHeight) {
        el.style.opacity = '';
        el.style.transition = '';
        return;
      }

      // Skip messages completely above viewport
      if (relBottom < 0) return;

      // Calculate intensity: stronger near top
      const centerY = (relTop + relBottom) / 2;
      const intensity = Math.max(
        0,
        Math.min(1, 1 - centerY / zoneHeight)
      );

      if (intensity < 0.05) {
        el.style.opacity = '';
        el.style.transition = '';
        return;
      }

      // Fade the original DOM text
      const opacityVal = Math.max(0, 1 - intensity * 1.3);
      el.style.opacity = String(opacityVal);
      el.style.transition = 'opacity 0.3s ease';

      if (totalActive >= MAX_PARTICLES_TOTAL) return;

      const msgIdx = el.getAttribute('data-msg-index');
      const cacheKey = `${msgIdx}-${container.scrollTop}`;

      // Extract text content from the message element
      const textEl = el.querySelector('p, span, .MuiTypography-root');
      const text = textEl
        ? textEl.textContent
        : el.textContent;
      if (!text || !text.trim()) return;

      // Get content box dimensions for text sampling
      const contentBox =
        el.querySelector(
          '[class*="MuiBox"], [class*="MuiTypography"]'
        ) || el;
      const contentRect = contentBox.getBoundingClientRect();
      const textWidth = contentRect.width - 32; // px padding

      // Check if we already sampled this message recently
      if (sampledMsgsRef.current.has(cacheKey)) {
        const cached = sampledMsgsRef.current.get(cacheKey);
        if (now - cached.time < 1000) return;
      }

      // Sample pixel positions from text
      const step = adaptiveStepRef.current;
      const pixels = sampleTextPixels(
        text,
        Math.max(textWidth, 50),
        TEXT_FONT,
        20 // line height approx
      );

      if (pixels.length === 0) return;

      // Determine how many particles based on intensity
      const count = Math.min(
        Math.floor(intensity * MAX_PARTICLES_PER_MSG),
        MAX_PARTICLES_TOTAL - totalActive,
        pixels.length
      );

      // Randomly pick pixel positions
      const offsetX =
        contentRect.left - containerRect.left + 16;
      const offsetY = relTop + (contentRect.top - rect.top) + 6;

      for (let i = 0; i < count; i++) {
        const px =
          pixels[Math.floor(Math.random() * pixels.length)];

        const p = acquireParticle();
        p.x = offsetX + px.x;
        p.y = offsetY + px.y;
        p.originX = p.x;
        p.originY = p.y;

        // Wind direction: leftward and slightly upward
        const speedMul = 0.5 + Math.random() * 1.0;
        p.vx =
          WIND_X * speedMul +
          (Math.random() - 0.5) * 0.4;
        p.vy =
          WIND_Y * speedMul +
          (Math.random() - 0.5) * 0.3;

        p.size =
          PARTICLE_MIN_SIZE +
          Math.random() *
            (PARTICLE_MAX_SIZE - PARTICLE_MIN_SIZE);
        p.opacity =
          intensity * (0.5 + Math.random() * 0.5);
        p.maxLife = 1.5 + Math.random() * 2.0;
        p.life = p.maxLife;
        p.turbFreq = 1.5 + Math.random() * 2.0;
        p.turbPhase = Math.random() * Math.PI * 2;
        p.active = true;

        totalActive++;
      }

      sampledMsgsRef.current.set(cacheKey, { time: now });

      // Evict old cache entries
      if (sampledMsgsRef.current.size > 100) {
        const entries = [
          ...sampledMsgsRef.current.entries(),
        ];
        entries
          .sort((a, b) => a[1].time - b[1].time)
          .slice(0, 50)
          .forEach(([k]) =>
            sampledMsgsRef.current.delete(k)
          );
      }
    });
  }, [scrollRef]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    lastFrameTimeRef.current = performance.now();

    function animate(timestamp) {
      const dt = Math.min(
        (timestamp - lastFrameTimeRef.current) / 1000,
        0.05
      );
      lastFrameTimeRef.current = timestamp;

      // Adaptive quality
      const frameMs = dt * 1000;
      if (frameMs > ADAPTIVE_FRAME_BUDGET_MS) {
        adaptiveStepRef.current = Math.min(
          adaptiveStepRef.current + 1,
          6
        );
      } else if (adaptiveStepRef.current > SAMPLE_STEP) {
        adaptiveStepRef.current = Math.max(
          adaptiveStepRef.current - 0.5,
          SAMPLE_STEP
        );
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const { r, g, b } = PARTICLE_COLOR;
      let aliveCount = 0;

      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (!p.active) continue;

        // Physics
        const age = (p.maxLife - p.life) / p.maxLife;
        const turbulence =
          Math.sin(
            age * p.turbFreq * Math.PI * 2 + p.turbPhase
          ) * TURBULENCE_AMP;

        p.vx += (WIND_X * 0.02 + turbulence * 0.05) * dt;
        p.vy += GRAVITY * dt;
        p.x += p.vx * 60 * dt;
        p.y += p.vy * 60 * dt;
        p.life -= dt;
        p.size *= 1 - 0.3 * dt;

        // Kill conditions
        if (
          p.life <= 0 ||
          p.size < 0.3 ||
          p.x < -50 ||
          p.x > canvas.width + 50 ||
          p.y < -50 ||
          p.y > canvas.height + 50
        ) {
          p.active = false;
          continue;
        }

        aliveCount++;

        const lifeRatio = Math.max(0, p.life / p.maxLife);
        const alpha = p.opacity * lifeRatio;

        if (alpha < 0.01) {
          p.active = false;
          continue;
        }

        ctx.globalAlpha = alpha;
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${alpha * 0.4})`;
        ctx.shadowBlur = SHADOW_BLUR;
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // Update particlesRef count for external tracking
      particlesRef.current = pool.filter((p) => p.active);

      sampleDissolutionZone();
      animRef.current = requestAnimationFrame(animate);
    }

    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, [canvasSize, sampleDissolutionZone]);

  return (
    <Box
      sx={{
        position: 'relative',
        flex: 1,
        overflow: 'hidden',
      }}
    >
      {children}
      <canvas
        ref={canvasRef}
        width={canvasSize.w}
        height={canvasSize.h}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />
      {/* Top gradient mask for dissolution zone */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '35%',
          background:
            'linear-gradient(to bottom, ' +
            'rgba(10,10,15,0.7) 0%, ' +
            'rgba(10,10,15,0) 100%)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />
    </Box>
  );
}

export default DissolvingText;
