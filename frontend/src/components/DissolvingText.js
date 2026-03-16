import React, { useEffect, useRef, useState, useCallback } from 'react';
import Box from '@mui/material/Box';

/**
 * DissolvingText wraps the message list area and adds a canvas overlay
 * that creates a particle dissolution effect for messages near the top
 * of the scroll viewport.
 *
 * Messages in the upper ~40% of the visible area gradually dissolve
 * into dust particles that drift downward.
 */

const PARTICLE_SIZE_MIN = 1;
const PARTICLE_SIZE_MAX = 2.5;
const GRAVITY = 0.08;
const WIND_RANGE = 0.3;
const FADE_SPEED = 0.004;
const SAMPLE_STEP = 3;

function DissolvingText({ children, scrollRef }) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const animRef = useRef(null);
  const lastSampleRef = useRef(0);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  const updateCanvasSize = useCallback(() => {
    const container = scrollRef?.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setCanvasSize({ w: rect.width, h: rect.height });
  }, [scrollRef]);

  useEffect(() => {
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [updateCanvasSize]);

  // Sample text pixels from the dissolution zone
  const sampleDissolutionZone = useCallback(() => {
    const container = scrollRef?.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const now = Date.now();
    if (now - lastSampleRef.current < 200) return;
    lastSampleRef.current = now;

    const containerRect = container.getBoundingClientRect();
    const dissolutionHeight = containerRect.height * 0.35;

    // Find message elements in the dissolution zone
    const messageEls = container.querySelectorAll('[data-msg-index]');
    const newParticles = [];

    messageEls.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const relativeTop = rect.top - containerRect.top;
      const relativeBottom = rect.bottom - containerRect.top;

      // Only process messages partially in the dissolution zone
      if (relativeBottom < 0 || relativeTop > dissolutionHeight) return;

      // Calculate dissolution intensity (stronger near top)
      const centerY = (relativeTop + relativeBottom) / 2;
      const intensity = Math.max(
        0,
        1 - centerY / dissolutionHeight
      );

      if (intensity < 0.05) return;

      // Apply CSS opacity to the original text
      const opacityVal = Math.max(0, 1 - intensity * 1.2);
      el.style.opacity = opacityVal;
      el.style.transition = 'opacity 0.3s ease';

      // Generate particles from the element area
      const particleCount = Math.floor(intensity * 8);
      for (let i = 0; i < particleCount; i++) {
        const px = rect.left - containerRect.left +
          Math.random() * rect.width;
        const py = relativeTop + Math.random() * rect.height;
        newParticles.push({
          x: px,
          y: py,
          vx: (Math.random() - 0.5) * WIND_RANGE,
          vy: Math.random() * 0.5 + 0.2,
          size:
            Math.random() * (PARTICLE_SIZE_MAX - PARTICLE_SIZE_MIN) +
            PARTICLE_SIZE_MIN,
          opacity: intensity * (0.4 + Math.random() * 0.4),
          life: 1.0,
        });
      }
    });

    // Reset opacity for messages outside dissolution zone
    messageEls.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const relativeTop = rect.top - containerRect.top;
      if (relativeTop > dissolutionHeight) {
        el.style.opacity = 1;
      }
    });

    particlesRef.current = [
      ...particlesRef.current,
      ...newParticles,
    ].slice(-1500); // Cap particle count
  }, [scrollRef]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const particles = particlesRef.current;
      const alive = [];

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy + GRAVITY;
        p.life -= FADE_SPEED;
        p.opacity *= 0.995;

        if (p.life <= 0 || p.opacity < 0.01) continue;
        if (p.y > canvas.height) continue;

        alive.push(p);

        const alpha = p.opacity * p.life;
        ctx.fillStyle = `rgba(224, 224, 224, ${alpha})`;
        ctx.shadowColor = `rgba(224, 224, 224, ${alpha * 0.5})`;
        ctx.shadowBlur = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      particlesRef.current = alive;

      sampleDissolutionZone();
      animRef.current = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, [canvasSize, sampleDissolutionZone]);

  return (
    <Box sx={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
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
            'linear-gradient(to bottom, rgba(10,10,15,0.7) 0%, rgba(10,10,15,0) 100%)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />
    </Box>
  );
}

export default DissolvingText;
