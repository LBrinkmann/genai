import React, { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';

const NODE_COUNT_DESKTOP = 60;
const NODE_COUNT_MOBILE = 25;
const CONNECTION_DISTANCE = 180;
const SPEED = 0.15;

function AnimatedBackground() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const isMobile = width < 768;
    const nodeCount = isMobile ? NODE_COUNT_MOBILE : NODE_COUNT_DESKTOP;

    const nodes = Array.from({ length: nodeCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * SPEED,
      vy: (Math.random() - 0.5) * SPEED,
      r: Math.random() * 1.5 + 0.5,
    }));

    let hueShift = 0;

    function draw() {
      ctx.clearRect(0, 0, width, height);
      hueShift += 0.002;

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECTION_DISTANCE) {
            const alpha = (1 - dist / CONNECTION_DISTANCE) * 0.12;
            const hue = (240 + hueShift * 30 + i * 2) % 360;
            ctx.strokeStyle =
              `hsla(${hue}, 30%, 40%, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      for (const node of nodes) {
        const hue = (260 + hueShift * 30) % 360;
        ctx.fillStyle = `hsla(${hue}, 25%, 50%, 0.15)`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        ctx.fill();

        // Move
        node.x += node.vx;
        node.y += node.vy;

        // Bounce
        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;
      }

      animRef.current = requestAnimationFrame(draw);
    }

    draw();

    function handleResize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    }

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, []);

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </Box>
  );
}

export default AnimatedBackground;
