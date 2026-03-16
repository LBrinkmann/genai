# [DRAFT] Realistic Text Dissolution / Dust-in-the-Wind Effect

## Goal

Replace the current fade-based dissolution effect in `DissolvingText.js` with a realistic particle fragmentation effect where old chat messages visually break apart into dust/sand particles that drift away. The current implementation fades text opacity and spawns random particles in the message bounding box -- particles bear no relation to actual text shape, so the effect looks generic rather than like text turning to dust.

## Approach Evaluation

Six approaches were evaluated. Each is scored 1-5 (5 = best).

| Approach | Visual | Perf | Bundle | Complexity | Mobile | React Fit | Verdict |
|---|---|---|---|---|---|---|---|
| A. Canvas pixel sampling | 4 | 3 | 0 kB | 3 | 3 | 4 | **Recommended** |
| B. Three.js / WebGL | 5 | 5 | +300-500 kB gz | 2 | 3 | 2 | Overkill |
| C. CSS clip-path grid | 2 | 2 | 0 kB | 3 | 4 | 5 | Poor visual quality |
| D. PixiJS particles | 5 | 5 | +150 kB gz | 3 | 4 | 3 | Good but heavy |
| E. GSAP + SplitText | 3 | 3 | +30 kB gz | 4 | 4 | 4 | Character-level, not pixel dust |
| F. html2canvas + custom | 4 | 3 | +40 kB gz | 3 | 3 | 4 | Fallback |

### A. Canvas Pixel Sampling (Recommended)

Render each dissolving message to an offscreen canvas using `ctx.fillText` (matching the DOM font metrics), read pixel data with `getImageData`, and spawn particles only at positions where text pixels exist. Animate with the existing `requestAnimationFrame` loop.

- **Pros**: Zero new dependencies; particles trace the actual text shape; the current component already uses a canvas overlay so the architecture stays the same; full control over physics.
- **Cons**: `fillText` rendering may not perfectly match complex DOM layouts (inline bold, emoji, MUI typography); Canvas 2D tops out around 3000-5000 particles at 60fps on mid-range devices; reading pixel data is a synchronous CPU operation (mitigated by throttling and small offscreen canvases).
- **Mitigation**: Only sample text content strings (ignoring layout complexity) since chat messages are mostly plain text. Cap particles per message and use pooling.

### B. Three.js / WebGL Particles

GPU-accelerated point sprites with custom shaders. Highest visual ceiling (glow, turbulence noise in shader). Three.js tree-shakes poorly -- expect 300-500 kB gzipped even for a minimal setup. Requires a WebGL context separate from the 2D canvas, and integrating a Three.js scene overlaying a React scroll container adds significant complexity. Best for games/hero sections, overkill for a chat UI.

### C. CSS clip-path Fragmentation

Divide each message into an N x M grid of `clip-path: inset()` clones, animate each cell with CSS transforms. Purely declarative. However, duplicating DOM nodes creates heavy layout cost (a 10x10 grid means 100 clones per message). Visual quality is blocky -- fragments are rectangular, not dust-like. Cannot simulate physics (gravity curves, turbulence) without JS animation anyway. Not recommended.

### D. PixiJS Particle System

PixiJS v8 ParticleContainer renders 1M particles at 60fps on M3 hardware. Excellent for this use case technically. However, PixiJS adds ~150 kB gzipped and requires managing a WebGL canvas alongside the React DOM tree (via `@pixi/react` or manual mount). The integration overhead and bundle cost are hard to justify when Canvas 2D can handle the required 2000-5000 particles.

### E. GSAP + SplitText

GSAP is now fully free (Webflow acquired GreenSock in 2024). SplitText splits DOM text into individual `<span>` elements per character/word, then GSAP animates each span. This produces a character-scatter effect, not a pixel-dust effect -- characters fly away as whole glyphs, which looks different from the requested sand/dust aesthetic. Could combine with a particle emitter but that defeats the purpose of using GSAP. Best for typography animations, not dissolution.

### F. html2canvas + Custom Particle Engine (Fallback)

Use `html2canvas` to rasterize the actual DOM node (preserving all CSS styling, colors, layout), then extract pixel data and feed into a custom particle engine. More accurate than approach A for complex styled content. However, html2canvas is ~40 kB gzipped, has known rendering inconsistencies, and rasterizing DOM is slow (~50-200ms per element). Viable as a fallback if approach A's font rendering mismatch proves unacceptable.

## Plan

| # | Section | Change | Optional |
|---|---------|--------|----------|
| 1 | Offscreen text sampling | Add function to render message text to offscreen canvas and extract particle seed positions | No |
| 2 | Particle physics | Replace random-box particle spawning with text-shaped spawning + improved drift physics | No |
| 3 | Performance guardrails | Add particle pooling, per-message caps, and adaptive quality | No |
| 4 | Visual tuning | Add glow, size variance, color sampling, and wind turbulence | No |
| 5 | Fallback to html2canvas | Add optional html2canvas path for complex content | Yes |

### 1. Offscreen Text Sampling

- **What**: New helper function `sampleTextPixels(text, width, font)` that creates a temporary offscreen `<canvas>`, draws the message text using `ctx.fillText`, calls `getImageData`, and returns an array of `{x, y, r, g, b}` positions where alpha > threshold.
- **Where**: New utility, either in `DissolvingText.js` or a separate `particleUtils.js`.
- **Why**: Particles must originate from actual text pixel positions to create the illusion of text fragmenting. The current implementation spawns particles randomly within the message bounding box.
- Sampling should use a stride (every 2-3 pixels) to limit particle count. Throttle to once per message per ~500ms.

### 2. Particle Physics Improvements

- **What**: Replace the simple gravity + random wind model with: (a) initial velocity pointing generally upward-left (wind direction), (b) per-particle random turbulence oscillation using sine waves, (c) gradual size reduction as particles drift, (d) slight rotation for non-circular particle shapes.
- **Where**: The `animate()` loop in `DissolvingText.js`.
- **Why**: Realistic dust behavior requires turbulence (not just linear drift) and size decay. Current particles fall downward uniformly.
- Wind direction and strength should be configurable constants at the top of the file.

### 3. Performance Guardrails

- **What**: (a) Object pool for particle objects to reduce GC pressure. (b) Cap of ~200 particles per message, ~2000 total. (c) Adaptive quality: if frame time exceeds 20ms, reduce sampling density and particle cap. (d) Skip sampling for messages fully inside the dissolution zone (already dissolved).
- **Where**: `DissolvingText.js`, constants and the sampling/animation functions.
- **Why**: Chat may have 10-20 messages in the dissolution zone. Without caps, particle count can explode. The 1500 cap in the current code is reasonable but should be paired with pooling.

### 4. Visual Tuning

- **What**: (a) Sample RGB color from the offscreen canvas so particles match text color. (b) Add a subtle glow via `ctx.shadowColor` / `ctx.shadowBlur` (already partially present). (c) Vary particle shape between circles and small rectangles. (d) Add a second "trail" particle with lower opacity spawned at previous position for motion blur effect.
- **Where**: The drawing section of `animate()` in `DissolvingText.js`.
- **Why**: Colored, glowing, varied particles look far more realistic than uniform gray circles.

### 5. (Optional) html2canvas Fallback

- **What**: If message content includes non-text elements (images, code blocks with syntax highlighting), use `html2canvas` to rasterize the DOM node instead of `fillText`. Gate behind a prop or auto-detect.
- **Where**: The sampling function, with html2canvas as a lazy-loaded dynamic import.
- **Why**: `fillText` cannot reproduce complex DOM styling. For plain chat text this is fine, but future content types may need it.
- Would add ~40 kB gzipped to the bundle (lazy-loaded, so not on critical path).

## Implementation Notes

- The offscreen canvas for text sampling should match the message element's computed `font`, `fontSize`, `fontFamily`, and `width`. Use `getComputedStyle()` on the message DOM node.
- Use `OffscreenCanvas` where available (Chrome, Edge) for better performance; fall back to a hidden `<canvas>` element for Safari.
- For the particle pool, a simple array-based free list is sufficient -- no need for a library.
- The dissolution zone gradient overlay (the `<Box>` with `linear-gradient`) should remain as-is; it visually masks the transition boundary.
- Consider using `ctx.fillRect` instead of `ctx.arc` + `ctx.fill` for particles -- rectangles are significantly faster to draw on Canvas 2D.
- The `data-msg-index` attribute on message elements (already used by the current code) is the hook for finding dissolving messages.

## Validation Strategy

- **auto**: Measure frame time with `performance.now()` in the animation loop; log a warning if average exceeds 18ms over 60 frames. Add this as a dev-only diagnostic.
- **auto**: Unit test for `sampleTextPixels` -- given known input text, verify it returns particle positions only within the text bounding area and respects the stride parameter.
- **manual**: Visual review of the dissolution effect in Chrome and Safari on desktop and mobile viewport sizes. Verify particles trace text shape, drift naturally, and fade smoothly.
- **manual**: Scroll performance test -- rapidly scroll through 50+ messages and verify no frame drops or jank.

## Next Actions

- [ ] Review and approve this plan (human)
- [ ] Implement sections 1-4 in `DissolvingText.js` (zero new dependencies)
- [ ] Visual QA in browser with dark theme
- [ ] Performance profiling with 20+ messages
- [ ] Decide whether section 5 (html2canvas fallback) is needed based on content types
