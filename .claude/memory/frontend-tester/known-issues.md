# Known Issues

Bugs or unexpected behaviors discovered during testing. Updated 2026-03-14 (Round 2).

## All Round 1 Bugs Fixed

### (FIXED) Backend Session Creation -- timezone=True
- Was: SQLAlchemy insert failed with naive vs offset-aware datetime
- Fix: DateTime columns now use timezone=True
- Status: Verified working in Round 2

### (FIXED) Unhandled Promise Rejection in createSession/resetSession
- Was: CRA error overlay on every page load
- Fix: try/catch wrapping in ChatPage.js
- Status: Verified working in Round 2

### (FIXED) No Error Feedback in Single-Bot Chat
- Was: Errors silently logged to console only
- Fix: Error message now shown in UI as assistant message
- Status: Verified with "[Error: timeout of 60000ms exceeded]" shown in UI

### (FIXED) Access Key Gating Broken
- Was: Reset button always visible due to config fallback
- Fix: URL key param validated against backend config value
- Status: Verified -- No key / wrong key shows "No admin controls"

### (FIXED) Newlines Not Rendered in Messages
- Was: white-space not set to pre-wrap
- Fix: Added white-space: pre-wrap to message Typography
- Status: Verified -- multiline messages render on separate lines

## No New Issues Found in Round 2

## Phase 0 (Tailwind setup) Findings - 2026-05-14

### Tailwind JIT smoke-test caveat
- Injecting a div with `bg-red-500` at runtime via DevTools console will NOT show red.
- This is NOT a foundation bug — it's expected JIT behavior. Tailwind v3 JIT only generates utilities found in `content`-globbed source files at build time. Classes added at runtime have no rule generated.
- Same for the custom `@layer utilities { .bg-gradient-tile-scroll }` in `src/index.css` — purged because no source file uses it yet.
- To smoke-test Tailwind in JIT mode: add a class to a real source file (e.g. wrap something with `className="bg-red-500"` in App.js), then check it renders.
- Robust runtime check: confirm preflight is injected (lots of `--tw-*` CSS variables, `*, ::before, ::after { ... }` rules with `--tw-border-spacing-x` etc.) AND body bg = `rgb(9, 9, 11)`.

## Frontend tester memory: chrome MCP tools

- Chrome MCP tools (`mcp__claude-in-chrome__*`) referenced in the agent definition are NOT available in this environment.
- Fallback that works: `python3.14 -m playwright` is installed at `/opt/homebrew/bin/playwright` (Python flavor), use `from playwright.sync_api import sync_playwright`. Drives headless Chromium and supports navigate/screenshot/evaluate/console capture.
- Screenshot dir: `/Users/brinkmann/repros/genai/doc/frontend-tests/screenshots/`.
- Write helper scripts under `doc/frontend-tests/<scratch>/` (NOT `/tmp` — Write is denied there). Clean up after.
- Playwright reduced-motion: `browser.new_context(reduced_motion="reduce")` works to emulate the OS preference cleanly.

## Phase 1 (entropy effect sandbox) findings - 2026-05-14

### Effect sandbox route — VERIFIED WORKING
- Route: `/__effect-sandbox` (registered in App.js).
- Default motion path: 3 canvases mount with sampled colors RGB(212,168,100)=#D4A864 (gold) and RGB(223,223,223)≈#e0e0e0 (light grey) — matches spec.
- Flex alignment via `justify-start` / `justify-end` works correctly.
- Dissolve fires at t=3s; particle scatter is visible mid-dissolve (canvas pixels show scattered dots).
- Layout collapse: third wrapper height collapses to 0 over 2s (COLLAPSE_MS) — element stays in DOM with height=0. EffectSandbox parent never removes children from React tree.

### Quirk: `onEvicted` does NOT fire in default canvas path (but DOES in reduced-motion path)
- In the default path, the canvas dissolve appears to never call `onDissolveComplete` — console log "[EffectSandbox] third message evicted" only appears in the reduced-motion run.
- In reduced-motion path the 200ms opacity transition's transitionend fires correctly, evicted log appears.
- This may be a real bug in `runSimultaneousEntropyEffect` (it never invokes `onDissolveComplete`), but the canvas DOES finish dissolving visually and the wrapper height collapses to 0, so end-user-visible behavior is correct. Worth flagging to the engineer.
- Effect still meets the spec's visual criterion: third message dissolves with particles and disappears from layout.
- UPDATE 2026-05-14 Phase 2 retest: in the integrated ChatPage flow, eviction DOES work end-to-end — canvas count returns to `visible_limit` (3) after the ~6s post-evict delay. So either (a) the issue was sandbox-specific or (b) `handleEvicted` in MessageList.js is now firing through a different path. Eviction was empirically verified by canvas-count delta after sending 5 messages.

## Phase 2 (chat shell + video hardening) findings - 2026-05-14

### Mock layer
- `frontend/src/services/mockApi.js` has no `context_limit` / `visible_limit` in default `MOCK_CONFIG` — the hook fallback (`visibleLimit=3`, `contextLimit=null`) is what's exercised in mock mode.
- Mock layer is intercepted at the `services/api.js` boundary; no `/api/chat` network requests fire. To inspect what gets sent to the bot, instrument `mockApi.sendChat` with a `console.log` and capture via Playwright's `page.on("console", ...)`.
- Edit mockApi.js → HMR rebuild in ~3s → re-run the test. Then revert.

### Video hardening - all probes pass
- Default load: `<video>` with `muted`, `playsInline`, `poster=/bg-video-poster.jpg`, `<source type="video/mp4">` first. `video.paused === false` after autoplay kicks in.
- `prefers-reduced-motion: reduce` (via `browser.new_context(reduced_motion="reduce")`): `<video>` count = 0, poster `<img>` rendered with `pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover` — identical classes to the video.
- `visibilitychange` pause: `Object.defineProperty(document, 'hidden', {value: true, configurable: true})` then `dispatchEvent(new Event('visibilitychange'))` → `video.paused === true`. Reverse with `hidden:false` → resumes after ~600ms.
- `<video>` `onError` fires `setVideoFailed(true)` synchronously → swaps to `<img>` poster. Verified `videoCount: 1 → 0` and `posterImg: false → true`.

### Eviction probe in canvas mode (visible_limit=3)
- After sending 5 messages: canvas count went 6 → 6 → 3 (post-wait). Eviction triggers at message 4 (1st evict) and message 5 (2nd evict). Need ~6s wait between sends for the dissolve to complete.
- Visible result: only the 3 most recent messages render after eviction completes.

### Header pre-Phase-5
- The MUI `<Header>` with text "GenAI Chat" still mounts above the Tailwind shell. Phase 5 will replace this with a minimal corner cluster per D5/D11. NOT a Phase 2 regression.

### Mobile (iPhone 14 Pro)
- `viewport=393x852`, no horizontal overflow, `max-w-2xl` column shrinks to viewport width (393px), footer nav width 345px wraps cleanly within viewport. Layout works.

## Phase 3 (legal pages + /background route) findings - 2026-05-14

### Routes wired (all PASS)
- `/about`, `/privacy`, `/terms`, `/background` all 200 OK, no 404.
- Footer nav <a> tags (not buttons): `About`, `Privacy Policy`, `Terms & Conditions` — found via `a:has-text('About')`, etc.
- Page title at `/`: "Chat | GENocideAI" (set via Helmet or document.title).
- `/about` shows 5 h2/h3 headings: About / Background / Nora Al-Badri statement / A quote from the GHSCN website / Levin Brinkmann statement. ~5760 prose chars.
- `/privacy` shows Privacy Policy + Information we collect / How we use information / Legal bases / Retention / Sharing / Your rights / Security. ~3334 prose chars.
- `/terms` shows Terms & Conditions + Use of the service / Eligibility / Acceptable use / Your content / Fees / Third‑party services / Intellectual property. ~4343 prose chars.
- Heading color: rgb(255, 255, 255) on body bg rgb(9, 9, 11) — high contrast, readable.
- LegalPageLayout has top bar with "← Genocide AI" back link (left) and About/Privacy/Terms nav cluster (right).

### /background route
- SVG-line-art container class: `pointer-events-none absolute inset-0 bg-[url('/bg-line.svg')] bg-cover bg-center bg-no-repeat`
- Gradient container class: `pointer-events-none absolute inset-0 bg-gradient-tile-scroll`
- Both bg-image URLs computed correctly (`url("http://localhost:3000/bg-line.svg")` etc).
- `bg-line.svg` is intentionally minimal: two black rects with a 19px gap at y=319-338. When `bg-cover` on a dark zinc-950 body, it shows ONE thin horizontal stripe of "page color" — that's the artwork. Not a rendering bug if the screenshot looks mostly dark.
- `background-gradient.svg` is a linearGradient (0% black → 51.5% #7E7E7E → 100% black) used as the tiled scrolling gradient strip in the gap.
- "← Chat" back link in top-left routes to `/` (verified).

### CRACO + css-loader { url: false }
- Compile time: ~30-60s first build (Phase 0 numbers still hold). webpack compiled with 1 warning (eslint, not loader).
- No regression: chat surface still renders (body bg rgb(9, 9, 11), 1 `<video>`, footer nav 4 elements).
- `/__effect-sandbox`: 3 canvases mount, body text intact — Phase 1 sandbox unaffected.

### Asset network sanity (verified via Playwright `page.on("response")`)
- `/bg-line.svg` → 200, 524 bytes
- `/background-gradient.svg` → 200, 742 bytes
- `/bg-video-poster.jpg` → 200 / 304 (cache)
- `/bg-video-slow.mp4` → 206 (range request)

### Console
- 0 errors across all 5 pages tested.
- 10 console.warning lines (eslint dev warnings — `aggregateStatus` unused, `react-hooks/exhaustive-deps` on simultaneousEntropy, `no-access-key` on ChatPage:244, `measureWrappedTextHeight` unused). Pre-existing, not Phase 3 regressions.

## Phase 5 (Tailwind corner cluster Header) findings - 2026-05-14

### Header rewrite — VERIFIED VISUALLY
- `frontend/src/components/Header.js` replaced MUI AppBar with a Tailwind `<div>` cluster: `className="absolute right-4 top-4 z-20 flex items-center gap-3"`.
- No `<header>`/MUI AppBar anywhere on `/` — `document.querySelector('header.MuiAppBar-root, .MuiAppBar-root')` returns null.
- Cluster contains: status dots (`[data-testid="status-indicator"]`) + gear button (`button[aria-label="Settings"]`).
- Selectors that work in Phase 5:
  - Status dot: `[data-testid="status-indicator"]` (one per bot, plus a "loading" amber placeholder when `botStatuses` is empty)
  - Gear button: `button[aria-label="Settings"]`
  - Open menu: `[role="menu"]`
  - Reset action: `button:has-text("Reset conversation")` (only when accessKey truthy)
  - No-key fallback: `div[role="menuitem"][aria-disabled="true"]` showing "No admin controls"
- Title is `Chat | GENocideAI`. `document.body.innerText.includes('GenAI Chat')` → false (branding removed per D11).

### Mock-mode status dot
- Mock layer (`services/mockApi.js`) exports `checkBotHealth` returning `{bots: [{name: "Alpha", status: "online"}]}`. The dot renders `bg-emerald-500` with `title="Alpha: online"`.
- Because `services/api.js` intercepts at the service boundary, NO HTTP request to `/api/health/bots` fires in mock mode — Playwright `page.on("request")` for that URL captured 0 hits. Don't treat zero network requests as a failure when mock API is enabled.

### Click-outside dismissal
- Implemented via `document.addEventListener("mousedown", ...)` inside `Header.js`. Clicking anywhere outside the gear/menu closes it. Verified by `page.mouse.click(720, 450)` — menu disappears within 300ms.

### Reset flow (with `?key=anything`)
- `mockApi.validateKey()` returns `{valid: true}` for any key string — so `?key=testkey` activates the admin branch.
- Reset action clears all rendered messages (canvas count goes 4→0 after sending 2 mock messages with single-bot config that renders 2 canvases per turn: user + bot).
- Menu closes synchronously when reset is clicked.

### Routes confirmed unchanged
- `/about` does NOT mount the cluster (gear count = 0, dots = 0). LegalPageLayout is separate from ChatPage.
- `/__effect-sandbox` still renders 3 canvases — Phase 1 sandbox unaffected.

### Console
- 0 errors / 0 pageerrors during the full Phase 5 test.
- 2 React Router v7 future-flag warnings only (pre-existing).

### Mock input selector for Phase 5+
- Chat input is now `<input placeholder="Type your message...">` (Tailwind `MessageInput.js`), NOT a textarea. Older selectors targeting `textarea` will fail. Use: `input[placeholder="Type your message..."]`. Submit with `.press("Enter")`.

## Phase 6 (final verification + cleanup) findings - 2026-05-14

### /__effect-sandbox route — REMOVED (verified)
- `frontend/src/App.js` `<Routes>` now contains only: `/`, `/about`, `/privacy`, `/terms`, `/background`. No `__effect-sandbox`, no `*` fall-through.
- Hitting `/__effect-sandbox` returns 200 from CRA dev server (SPA shell) but React Router matches nothing → `<div id="root">` is empty. No canvases, no body text, no chat shell. Effectively a blank page.
- If a fall-through 404 page becomes needed later, add `<Route path="*" element={<NotFound />} />`.

### Cross-browser parity (Chromium + WebKit verified)
- Chromium 145 + WebKit 26 both pass the full happy path: chat shell renders dark `rgb(9,9,11)` with `<video>` element, single-bot mock config produces 1 user + 1 bot canvas per turn, eviction caps `visibleCanvases` at 3 after 5 messages, `/about` shows ~5740-5760 chars of prose, gear menu (`?key=testkey`) opens with `Reset conversation` button, reset clears all canvases.
- Firefox skipped — not installed in `~/Library/Caches/ms-playwright/firefox-1509/`. WebKit covers the iOS Safari production target.
- WebKit produced `menuText="Reset conversation\n"` (trailing newline) vs Chromium `"Reset conversation"`. Cosmetic only — matches the button text either way.

### Console hygiene (final)
- 0 console errors and 0 page errors across both engines through the entire E2E path.
- React Router v7 future-flag warnings (warn, not error) still present — pre-existing.

### Node Playwright tooling
- Playwright 1.58.0 Node module installed via `npm install playwright@1.58.0 --no-save` inside `doc/frontend-tests/scratch/` (NOT in `frontend/node_modules`).
- Chromium + WebKit browsers cached at `~/Library/Caches/ms-playwright/`. Firefox not installed; install via `npx playwright install firefox` if needed.
- Reusable test script pattern: `doc/frontend-tests/scratch/phase6-verify.js` — multi-engine loop, console + pageerror capture, screenshot per checkpoint. Good template for future cross-browser passes.
