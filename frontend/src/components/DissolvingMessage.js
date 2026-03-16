import { useRef, useEffect, useState, useCallback } from 'react';
import PropTypes from 'prop-types';

const DEFAULTS = {
  density: 4,
  drift: 3.0,
  duration: 4,
  textFade: 0.5,
  fadeVariation: 0.3,
  shimmer: 0.4,
  wind: -0.15,
  gravity: 3,
  plumeSize: 8,
  curlFreq: 1.2,
  airResistance: 0.985,
  directionMix: 0.7,
  particleSizeMax: 1.2,
};

function sampleText(textEl, density) {
  const rect = textEl.getBoundingClientRect();
  const W = Math.ceil(rect.width);
  const H = Math.ceil(rect.height);
  if (W === 0 || H === 0) return [];

  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const c = off.getContext('2d');

  // Get computed style from the text element
  const style = window.getComputedStyle(textEl);
  const fontSize = parseFloat(style.fontSize) || 16;
  const fontFamily = style.fontFamily || 'Georgia, serif';
  const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.6;

  c.fillStyle = '#e0e0e0';
  c.font = `${fontSize}px ${fontFamily}`;
  c.textBaseline = 'top';

  // Measure and wrap text the same way the browser does
  const text = textEl.textContent || '';
  const words = text.split(' ');
  const maxW = W;
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (c.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  lines.forEach((l, i) => c.fillText(l, 0, i * lineHeight));

  const data = c.getImageData(0, 0, W, H).data;
  const points = [];
  const step = Math.max(1, 3 - Math.min(density, 3));
  const copies = Math.max(1, Math.round(density / 3));
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      if (data[(y * W + x) * 4 + 3] > 128) {
        for (let ci = 0; ci < copies; ci++) {
          points.push({
            x: x + (Math.random() - 0.5) * 2,
            y: y + (Math.random() - 0.5) * 2,
          });
        }
      }
    }
  }
  return points;
}

function initParticles(textEl, P) {
  const rawPixels = sampleText(textEl, P.density);

  const particles = rawPixels.map((p) => {
    let baseVx, baseVy;
    if (Math.random() > P.directionMix) {
      baseVx = P.wind * 30 + (Math.random() - 0.5) * 10;
      baseVy = P.gravity * 0.5 + (Math.random() - 0.5) * 8;
    } else {
      const b = Math.random();
      if (b < 0.35) {
        // Convection -- float up gently
        baseVy = -(8 + Math.random() * 18);
        baseVx = (Math.random() - 0.5) * 12 + P.wind * 15;
      } else if (b < 0.6) {
        // Drift sideways with slight wind
        baseVx = P.wind * 20 + (Math.random() - 0.5) * 20;
        baseVy = (Math.random() - 0.5) * 10;
      } else {
        // Settle down -- gentle fall
        baseVx = (Math.random() - 0.5) * 15 + P.wind * 10;
        baseVy = 8 + Math.random() * 20;
      }
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
      alpha: 1,
      maxAlpha: 1,
      size: 0.3 + Math.random() * (P.particleSizeMax - 0.3),
      life: 1.0,
      fadeRate:
        1 /
        (1 + P.fadeVariation * -Math.log(1 - Math.random())),
      shimmerFreq: 2 + Math.random() * 4,
      shimmerPhase: Math.random() * Math.PI * 2,
      shimmerAmp: P.shimmer * (0.5 + Math.random() * 0.5),
      turbPhase: Math.random() * Math.PI * 2,
      plumeId: -1,
      released: true,
    };
  });

  // Assign plume groups
  const plumes = [];
  if (P.plumeSize > 0) {
    let pi = 0;
    for (let i = 0; i < particles.length; i += P.plumeSize) {
      const pvx = (Math.random() - 0.5) * 40 + P.wind * 20;
      const pvy = (Math.random() - 0.5) * 30;
      const cp = Math.random() * Math.PI * 2;
      plumes.push({ vx: pvx, vy: pvy, curlPhase: cp });
      for (
        let j = i;
        j < Math.min(i + P.plumeSize, particles.length);
        j++
      ) {
        particles[j].plumeId = pi;
        particles[j].baseVx =
          particles[j].baseVx * 0.4 + pvx * 0.6;
        particles[j].baseVy =
          particles[j].baseVy * 0.4 + pvy * 0.6;
      }
      pi++;
    }
  }

  return { particles, plumes };
}

export default function DissolvingMessage({
  text,
  dissolve = false,
  density = DEFAULTS.density,
  drift = DEFAULTS.drift,
  duration = DEFAULTS.duration,
  textFade = DEFAULTS.textFade,
  fadeVariation = DEFAULTS.fadeVariation,
  shimmer = DEFAULTS.shimmer,
  wind = DEFAULTS.wind,
  gravity = DEFAULTS.gravity,
  plumeSize = DEFAULTS.plumeSize,
  curlFreq = DEFAULTS.curlFreq,
  airResistance = DEFAULTS.airResistance,
  directionMix = DEFAULTS.directionMix,
  particleSizeMax = DEFAULTS.particleSizeMax,
  onDissolveComplete,
}) {
  const textRef = useRef(null);
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const completeCalled = useRef(false);
  const [textOpacity, setTextOpacity] = useState(1);

  const P = {
    density,
    drift,
    duration,
    textFade,
    fadeVariation,
    shimmer,
    wind,
    gravity,
    plumeSize,
    curlFreq,
    airResistance,
    directionMix,
    particleSizeMax,
  };

  const startDissolve = useCallback(() => {
    const textEl = textRef.current;
    const canvas = canvasRef.current;
    if (!textEl || !canvas) return;

    completeCalled.current = false;

    const rect = textEl.getBoundingClientRect();
    const W = Math.ceil(rect.width);
    const H = Math.ceil(rect.height);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const { particles, plumes } = initParticles(textEl, P);

    // Reset particles to origin positions
    particles.forEach((p) => {
      p.x = p.ox;
      p.y = p.oy;
      p.vx = 0;
      p.vy = 0;
      p.released = true;
      p.life = 1;
      p.alpha = 1;
    });

    let lastTime = performance.now();
    let elapsed = 0;

    function loop() {
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      elapsed += dt;

      // Fade text
      const tFade = Math.max(0, 1 - elapsed / P.textFade);
      setTextOpacity(tFade);

      // Clear canvas
      ctx.clearRect(0, 0, W, H);

      // Update and draw particles
      let alive = 0;
      for (const p of particles) {
        if (p.alpha <= 0) continue;

        const pE = elapsed;
        const ramp = Math.min(pE / 0.8, 1);

        let curlX = 0;
        let curlY = 0;
        if (p.plumeId >= 0 && plumes[p.plumeId]) {
          const pl = plumes[p.plumeId];
          curlX =
            Math.sin(pE * P.curlFreq + pl.curlPhase) * 15;
          curlY =
            Math.cos(pE * P.curlFreq * 0.7 + pl.curlPhase) *
            10;
        }

        const d = P.drift;
        p.vx +=
          (P.wind * 5 +
            curlX * 0.3 +
            Math.sin(pE * 0.8 + p.turbPhase) * 5) *
          dt *
          d;
        p.vy += (P.gravity + curlY * 0.2) * dt * d;
        p.vx += p.baseVx * ramp * 0.5 * dt * d;
        p.vy += p.baseVy * ramp * 0.5 * dt * d;
        p.vx *= P.airResistance;
        p.vy *= P.airResistance;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        p.life -= (p.fadeRate / P.duration) * dt;
        // Cubic fade curve
        const fadeCurve = p.life * p.life * p.life;
        const shimmerVal =
          1 -
          p.shimmerAmp +
          p.shimmerAmp *
            Math.sin(
              elapsed * p.shimmerFreq + p.shimmerPhase
            );
        p.alpha = Math.max(0, fadeCurve * shimmerVal);

        if (p.life < 0.001) {
          p.alpha = 0;
          continue;
        }

        ctx.fillStyle = `rgba(224,224,224,${p.alpha})`;
        ctx.fillRect(
          p.x - p.size * 0.5,
          p.y - p.size * 0.5,
          p.size,
          p.size
        );

        if (p.alpha > 0.005) alive++;
      }

      if (
        elapsed >= P.duration &&
        alive < 20 &&
        !completeCalled.current
      ) {
        completeCalled.current = true;
        if (onDissolveComplete) onDissolveComplete();
      }

      if (alive > 0 || elapsed < P.duration) {
        animRef.current = requestAnimationFrame(loop);
      }
    }

    animRef.current = requestAnimationFrame(loop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    density,
    drift,
    duration,
    textFade,
    fadeVariation,
    shimmer,
    wind,
    gravity,
    plumeSize,
    curlFreq,
    airResistance,
    directionMix,
    particleSizeMax,
    onDissolveComplete,
    text,
  ]);

  useEffect(() => {
    if (dissolve) {
      startDissolve();
    } else {
      // Reset
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      setTextOpacity(1);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    };
  }, [dissolve, startDissolve]);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div
        ref={textRef}
        style={{
          fontFamily: 'Georgia, serif',
          fontSize: '16px',
          color: '#e0e0e0',
          lineHeight: 1.6,
          padding: '12px 16px',
          maxWidth: '600px',
          opacity: textOpacity,
        }}
      >
        {text}
      </div>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

DissolvingMessage.propTypes = {
  text: PropTypes.string.isRequired,
  dissolve: PropTypes.bool,
  density: PropTypes.number,
  drift: PropTypes.number,
  duration: PropTypes.number,
  textFade: PropTypes.number,
  fadeVariation: PropTypes.number,
  shimmer: PropTypes.number,
  wind: PropTypes.number,
  gravity: PropTypes.number,
  plumeSize: PropTypes.number,
  curlFreq: PropTypes.number,
  airResistance: PropTypes.number,
  directionMix: PropTypes.number,
  particleSizeMax: PropTypes.number,
  onDissolveComplete: PropTypes.func,
};
