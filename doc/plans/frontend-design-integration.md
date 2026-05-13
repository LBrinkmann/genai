# [DONE] Frontend Design Integration: GENocideAI dummy → production frontend

## Goal

Port the visual design from `prototypes/genai-chat/` (a Vite + Tailwind + React 18 dummy
delivered by a collaborator) onto the existing production app at `frontend/` (CRA + React
19 + MUI v6), preserving:

- All current functional capabilities: session/config wiring, RLHF response comparison,
  feedback panel, bot health indicators, reset, mock mode, message logging.
- Reference fidelity to the dummy: pixel-for-pixel where the surfaces overlap (chat
  background, message rendering with the canvas dissolve effect, footer nav, legal
  pages, color/typography choices).

The prototype stays in `prototypes/genai-chat/` as a living reference — do not edit it.
All porting work happens under `frontend/`.

## What the dummy actually delivers

Read directly from `prototypes/genai-chat/`:

| Surface | Source | Notes |
|---|---|---|
| Chat shell | `src/Chat.jsx` | Dark zinc-950, looping bg-video, max-w-2xl column, 3-message cap, rounded zinc input + white send button, footer site-nav |
| Canvas message effect | `src/components/SimultaneousEntropyMessage.jsx` + `src/lib/simultaneousEntropy.js` + `src/lib/gravityCascade.js` | Canvas-rendered text that dissolves into particles; assistant `#D4A864`, user `#e0e0e0` |
| Routes | `src/App.jsx` | `/`, `/background`, `/about`, `/privacy`, `/terms` |
| Background page | `src/Background.jsx` | SVG line-art + scrolling gradient |
| Legal/about pages | `src/About.jsx`, `src/PrivacyPolicy.jsx`, `src/TermsAndConditions.jsx`, `src/components/LegalPageLayout.jsx` | Prose, served verbatim |
| Tailwind setup | `tailwind.config.js`, `src/index.css` | Stock Tailwind v3, `@layer base` body color, `bg-gradient-tile-scroll` utility |
| Static assets | `public/bg-video-slow.mp4`, `.mov`, `bg-line.svg`, `background-gradient.svg`, `favicon.svg` | ~101 MB total; chat needs the video, background page needs the SVGs |
| Not active | `api/tts-plugin.js` (Vite-side `/api/tts` proxy to OpenAI) | Scaffolded but **never called from src/** — `grep` confirms zero callers |
| Out of scope | `dissolution*.html` static renders | Designer-facing artifacts, not part of the React app |

The dummy has **no analogue** for: RLHF side-by-side comparison, feedback panel, bot
health indicators, session reset, or admin controls. Those need to be reskinned in the
dummy's style rather than ported.

## Locked decisions

Resolved with the human reviewer before execution.

| # | Decision | Choice |
|---|---|---|
| D1 | Build tool | **Stay on CRA + add Tailwind.** Smallest risk, identical Tailwind output. Defer Vite migration. |
| D2 | MUI scope | **Partial.** Tailwind for chat surface (shell, messages, input, footer, legal pages); MUI retained for FeedbackPanel chips/dialog and any future admin widgets, restyled via dark zinc theme. |
| D3 | RLHF visual treatment | **Defer.** Build chat shell first (Phases 0–3, 5). Phase 4 (RLHF reskin) waits on input from the dummy's author. |
| D4 | Visible-message cap | **Two config parameters** in YAML: `visible_limit` (DOM render cap) and `context_limit` (messages sent to the bot as conversation history). Independent of one another; both default sensibly. |
| D5 | Header chrome | **Minimal corner cluster.** Tailwind-only, absolute-positioned top-right: status dots + small settings/reset icon. No AppBar. |
| D6 | Static asset hosting | **Pull from the Hetzner server at deploy time.** Don't commit videos to the repo. `hcloud.sh deploy` rsyncs `/var/www/genai/public/*.{mp4,mov,svg}` → `/opt/genai/frontend/public/` before docker build. |
| D7 | TTS | **Skip entirely.** Plugin is scaffolded but unused in the prototype; no React code calls `/api/tts`. Revisit only when TTS is explicitly scoped. |
| D8 | Legal/About copy | **Port verbatim.** About text names "GENocideAI" — the deployment intent. |
| D9 | Pending RLHF + eviction | **Exempt pending comparisons.** A comparison message never dissolves until the user selects. Only resolved messages count against `visible_limit`. |
| D10 | Reduced motion | **Add fallback.** Detect `prefers-reduced-motion: reduce` and replace the canvas particle dissolve with a 200ms opacity fade. Gradient already gated. |
| D11 | Branding | **Rename to GENocideAI** in document title, footer, anywhere the platform name is user-visible. |
| D12 | PR strategy | **One PR per phase**, landing sequentially. Each phase leaves the app functional. |
| D13 | Storybook | **Update stories per phase.** Regenerate for new chat shell, message variants, RLHF comparison, footer nav. Delete stories for components fully replaced. |

## Agent assignments

Each phase is broken into role-typed subtasks. Run subagents in parallel when their work
is independent (e.g. backend config field + frontend hook update); sequence them when one
consumes the other's output (e.g. tester verifies after engineer lands a change).

| Phase | Subtask | Agent type | Model | Reasoning | Notes |
|---|---|---|---|---|---|
| 0 | Add Tailwind + PostCSS, replace index.css, rewrite theme, update index.html meta | `engineer` | `opus` | standard | Config + theme port. |
| 0 | Add `pull-assets` subcommand to `hcloud.sh` + wire `deploy` to rsync media | `engineer` | `opus` | standard | Bash + ssh subcommand addition. |
| 0 | Sanity check (page boots dark, Tailwind utilities render, MUI palette dark) | `frontend-tester` | `opus` | standard | Real-browser smoke check. |
| 1 | Copy dissolve effect files verbatim, JSX→JS, add reduced-motion gate | `engineer` | `opus` | **max** | Canvas internals must be wrapped correctly so the reduced-motion fallback never breaks the dissolve pipeline for non-reduced-motion users. |
| 1 | Verify canvas effect + reduced-motion fallback on a temporary route | `frontend-tester` | `opus` | standard | DevTools toggle + visual confirm. |
| 2 | Rewrite ChatPage / MessageList / MessageInput in Tailwind; wire SimultaneousEntropyMessage | `engineer` | `opus` | **max** | Heaviest task in the plan. Visual fidelity + eviction logic + pending-comparison exemption interact. |
| 2 | Implement `visible_limit` / `context_limit` in `useChat` + expose via `useConfig` | `engineer` | `opus` | **max** | Two independent caps + pending-RLHF exemption (D9). Easy to get the boundary conditions wrong. |
| 2 | Add `visible_limit` / `context_limit` to backend config schema + sample YAML | `engineer` | `opus` | standard | Schema + sample. |
| 2 | Video hardening: poster extraction, reduced-motion fallback, visibilitychange pause, `<img>` fallback | `engineer` | `opus` | **max** | HTML5 video + iOS LPM + reduced-motion interact in non-obvious ways. |
| 2 | Re-encode A/B (only if quality holds) | `general-purpose` | `opus` | **max** | Quality judgement against the original; needs to commit to "keep original" when in doubt. |
| 2 | Verify chat shell on iOS Safari (normal + Low Power Mode), Chrome Android, desktop | `frontend-tester` | `opus` | **max** | LPM failures hide silently — tester must actively probe for them. |
| 3 | Copy About / Privacy / Terms / Background / LegalPageLayout; wire routes | `engineer` | `opus` | standard | Verbatim ports + route entries. |
| 3 | Verify all four secondary routes render and footer nav links work | `frontend-tester` | `opus` | standard | Navigate, screenshot, confirm. |
| 4 | **Block**: resolve D3 (RLHF visual treatment) with dummy's author | `planning-architect` | `opus` | **max** | Open-ended design decision with no precedent. Must surface real trade-offs, not just pick. |
| 4 | Implement chosen RLHF rendering + restyle ResponseComparison + restyle FeedbackPanel | `engineer` | `opus` | **max** | Visual fidelity to the rest of the chat surface + correct dissolve trigger on the unselected branch. |
| 4 | Verify RLHF selection flow + feedback submission in mock mode | `frontend-tester` | `opus` | standard | Multi-step state-transition flow. |
| 5 | Replace MUI Header with minimal corner cluster; reskin settings popover | `engineer` | `opus` | standard | State + interaction, but well-bounded. |
| 5 | Verify status-dot states (online/loading/error mix), reset flow | `frontend-tester` | `opus` | standard | Visual state matrix. |
| 6 | Regenerate Storybook stories for new components; delete stories for fully-replaced ones | `engineer` | `opus` | standard | Accurate prop coverage. |
| 6 | Full end-to-end mock-mode verification (all six scenarios in the phase) | `frontend-tester` | `opus` | standard | Long checklist, distinct scenarios. |
| 6 | Cross-browser pass: Safari (mobile + desktop), Chrome, Firefox | `frontend-tester` | `opus` | standard | Cross-browser surface coverage. |
| Phases 0/1/3/5 | PR review | `reviewer` | `opus` | standard | Tests + verification checklist. |
| Phases 2/4 | PR review | `reviewer` | `opus` | **max** | Largest-surface and visual-fidelity PRs; reviewer must catch subtle regressions. |
| Phase 6 | Final consolidating review across the whole port | `reviewer` | `opus` | **max** | Whole-port sanity check before flipping plan to DONE. |

**Model + reasoning notes.**
- All subagents run on `opus` per project preference — no downgrades to sonnet/haiku.
- **Reasoning column** = the thinking budget for that subagent's invocation:
  - `standard` — default thinking. Subagent prompt has no special keyword.
  - `max` — include `ultrathink` in the launch prompt (e.g. *"...think hard about the
    pending-comparison exemption; ultrathink before writing code"*). This raises the
    extended-thinking budget to the harness max. Use it where reasoning failure is
    expensive: open-ended design decisions, cross-cutting refactors, high-stakes reviews.
- Don't sprinkle `ultrathink` everywhere — over-use just slows wall-clock without
  catching anything. Reserve for the rows marked **max**.

**Concurrency notes:**
- Phase 0's Tailwind work and the `hcloud.sh` change are independent — kick both off in
  one parallel agent batch.
- Phase 2's frontend shell, the `visible_limit`/`context_limit` backend changes, and the
  video re-encode A/B are independent — same parallel pattern.
- Don't start Phase 4 until D3 is resolved; the `planning-architect` update is the gate.
- Each phase's `frontend-tester` run is sequenced *after* its engineer PR is mergeable.

## Phased plan

Each phase is one PR off `main` (or off `dev` if that's the active integration branch),
named `feat/design-port-phase-N-<slug>`. Each ends with the app still functional in
mock mode.

### Phase 0 — Foundation (toolchain + design tokens)

- Add Tailwind v3 to `frontend/`: `tailwindcss`, `postcss`, `autoprefixer`, plus
  `tailwind.config.js` (mirror prototype's) and `postcss.config.js`.
- Replace `frontend/src/index.css` with the prototype's content (base color, gradient
  utility).
- Rewrite `frontend/src/theme.js` to a dark zinc-derived MUI palette so the FeedbackPanel
  and any retained MUI surfaces fit the dark aesthetic.
- Update `frontend/public/index.html` `<title>` to `Chat | GENocideAI`, `theme-color` to
  `#09090b`, viewport `viewport-fit=cover`, status-bar style `black-translucent`.
- Wire `hcloud.sh deploy` to rsync the static assets from the server (per D6). Add a
  README note for local dev: developers run `.claude/skills/hetzner/hcloud.sh
  pull-assets gen-ai-server-1` (new subcommand) to copy `/var/www/genai/public/*` into
  their local `frontend/public/`.
- **Sanity check**: `npm start` boots, page is dark, Tailwind classes work, MUI
  components render with the new palette.

### Phase 1 — Port the dissolve effect verbatim

- Create `frontend/src/components/effects/` and copy verbatim (no logic edits):
  - `SimultaneousEntropyMessage.jsx` → `SimultaneousEntropyMessage.js`
  - `lib/simultaneousEntropy.js`
  - `lib/gravityCascade.js`
- Convert JSX → JS extension only; internals unchanged.
- Add `prefers-reduced-motion` gate (D10): wrap the dissolve trigger so that when the
  media query matches, the component renders text in plain DOM with a 200ms opacity
  fade-out instead of the canvas particle effect.
- **Sanity check**: temporary route that renders a hard-coded message to confirm the
  canvas effect works in CRA's bundler. Verify reduced-motion fallback.

### Phase 2 — Reskin the chat shell

- Rewrite `ChatPage.js` layout to mirror `prototypes/.../Chat.jsx` markup: dark zinc-950
  shell, background video + scrim, `max-w-2xl` column, footer nav.
- Replace `MessageList.js` with a Tailwind renderer using `SimultaneousEntropyMessage`
  for non-comparison messages. Colors per prototype: assistant `#D4A864`, user
  `#e0e0e0`.
- Implement `visible_limit` and `context_limit` from YAML config (D4):
  - `visible_limit` evicts old resolved messages from the DOM (via the dissolve effect).
  - `context_limit` truncates the `messages[]` array sent to the bot as conversation
    history. Independent of `visible_limit`.
  - Pending RLHF comparisons exempt from both caps (D9).
- Replace `MessageInput.js` with the prototype's `<form>` + `<input>` + white "Send"
  button. Drop multiline / SendIcon. Loading state = subtle pulse on send button, no
  CircularProgress.
- RLHF comparison rendering: temporary placeholder until Phase 4 (e.g. render the two
  responses as plain stacked Tailwind cards with selection buttons; functional but
  un-themed).
- **Video background hardening (mobile + reduced-motion):** the prototype's `<video>`
  has the correct attributes for mobile autoplay (`muted` + `playsInline` + MP4 first),
  but in production we need to layer on:
  - **Poster image.** Extract a single frame from `bg-video-slow.mp4` as a ~50–100 KB
    JPG and set `poster="..."` on the `<video>`. Covers iOS Low Power Mode (which
    blocks autoplay even when muted), the preload window before the 10 MB MP4 streams
    in, and reduced-motion users.
  - **Re-encode the MP4 only if quality holds.** Try a tighter H.264 encode (CRF
    target, web-tuned moov-atom front) and compare side-by-side against the original
    on the actual chat surface (dark scrim + canvas effect on top). If perceived
    quality drops, **keep the original 10 MB encode** — quality wins over bytes.
    Document the chosen encode settings alongside the asset in `frontend/public/`.
  - **Reduced-motion fallback.** When `prefers-reduced-motion: reduce` matches: don't
    render the `<video>` at all, show the poster as a static background image. Pairs
    with the canvas-effect fallback from Phase 1 (D10).
  - **Pause on tab hide.** Bind a `document.visibilitychange` listener: on `hidden`,
    `video.pause()`; on `visible`, `video.play()` (catching rejections). Stops the
    decoder from running in background tabs and saves battery on Android.
  - **Poster as fallback `<img>`.** If `<video>` fails to load entirely (e.g. some
    older mobile browsers, network failure), fall back to the poster as a plain
    `<img>` so the surface is never blank.
- **Sanity check**: mock mode, chat happy path, eviction triggers, input loop works.
  Verify the video on a real iOS device (both normal and Low Power Mode), Chrome
  Android, and with `prefers-reduced-motion` set.

### Phase 3 — Routes + supporting pages

- Add routes in `App.js`: `/about`, `/privacy`, `/terms`, `/background` alongside `/`.
- Copy `About.jsx`, `PrivacyPolicy.jsx`, `TermsAndConditions.jsx`, `Background.jsx`,
  `components/LegalPageLayout.jsx` into `frontend/src/pages/` and
  `frontend/src/components/`. Prose verbatim (D8).
- Wire footer nav links from `Chat.jsx` into the chat footer.
- React Router v6 (production) vs v7 (dummy): use v6 syntax — the patterns used in the
  dummy work identically on v6.
- **Sanity check**: all four routes render with the prototype's styling.

### Phase 4 — RLHF comparison + feedback reskin **[DESCOPED]**

> **Decision (user, 2026-05-14):** RLHF is not part of the GENocideAI design — this
> deployment is single-bot. The platform's RLHF code paths (`ResponseComparison.js`,
> `FeedbackPanel.js`, `selectResponse` in `useChat`, the `Array.isArray(content)`
> branch in `MessageList`, the mock comparison flow) stay in place as dormant defensive
> code so other deployments can re-enable RLHF with a different visual treatment, but
> this phase is no longer executed. D3 remains unresolved and is moot for this design.
>
> The Phase 2 placeholder cards in `MessageList` won't trigger in single-bot mode and
> aren't re-styled. If a future deployment re-enables RLHF on this design, the work
> reopens — the D3 proposal section below still applies.

- Update `MessageList.js` to render comparison messages per the agreed treatment.
- Restyle `ResponseComparison.js`: drop MUI Card, Tailwind dark cards with
  `border-zinc-800 bg-zinc-900/60`. Keep `onSelect` API unchanged.
- Restyle `FeedbackPanel.js`: keep MUI Chip/Button (D2) but pull palette from the new
  dark theme — zinc surface, gold accent on confirm.
- **Sanity check**: RLHF comparison + selection + feedback submission in mock mode.

### Phase 5 — Header + admin reskin

- Replace `Header.js` (MUI AppBar) with a minimal absolute-positioned cluster in the
  top-right of the chat surface: bot status dots + small Tailwind icon button for
  settings/reset (D5).
- Settings menu: keep MUI Menu but restyle dark, or replace with a Tailwind popover
  (decide based on Phase 4 fallout).
- Branding (D11): drop the "GenAI Chat" header text — branding now lives in the
  document `<title>` and the About page only. No header text on the chat surface itself.
- **Sanity check**: reset works, status dots render correctly across all states,
  layout doesn't break the chat column.

### Phase 6 — Polish + verification

- Mobile/safe-area: confirm `pt-[max(1rem,env(safe-area-inset-top))]` and the bottom
  variant work in production.
- Storybook (D13): regenerate stories for the new chat shell, message variants, RLHF
  comparison, footer nav, legal pages. Delete stories for fully-replaced components.
- Mock-mode dev server end-to-end:
  - Single-bot happy path
  - RLHF comparison + selection + dissolve
  - Feedback submission
  - Reset
  - All four secondary routes
  - `visible_limit` and `context_limit` honored
  - `prefers-reduced-motion` fallback active
- Cross-browser: Safari (mobile + desktop) is the primary target per the dummy's status-bar
  meta + MOV fallback; Chrome + Firefox at minimum.

## Open questions for the dummy's author

Block Phase 4 until resolved.

1. **RLHF treatment** (D3): is "unselected response dissolves" aligned with the project's
   conceptual intent, or do they expect a different visualization?
2. **Visible-message cap as design intent**: is 3 a hard requirement or a placeholder?
   We're making it configurable per experiment (D4) but want to confirm the default.
3. **Background page** (`/background`): is this intentional/in-scope as a public route,
   or was it a dev-side test view?

## D3 proposal (RLHF visual treatment)

A concrete proposal for the Phase 4 gate. Choose one option (or remix) and confirm
the questions at the bottom before the engineer starts the reskin.

### Conceptual framing

GENocideAI is framed as a *collective voice* — many scholars synthesized into one
output whose words can no longer be traced to individuals. RLHF comparison sits in
tension with that frame: it momentarily exposes two voices, then asks the user to
silence one. Whatever treatment we pick, the act of selection is the conceptually
loaded moment, not the comparison itself. Two principles follow. First, the
unselected response should not simply *vanish* (cheap, clinical) — it should be
seen to be silenced, in continuity with the dissolve language already used for
eviction. Second, the *chosen* response should not be foregrounded with a
celebratory affordance (checkmarks, glows, color shifts) — selection is sober,
not triumphant. The visual grammar already in the prototype — gold-on-zinc text
that disperses into particles — is the right vocabulary; the question is only
*how the two voices are arranged before one is silenced*.

### Options

**Option A — Stacked, unselected dissolves on choice** (baseline)
Two responses render vertically, both as canvas messages in the assistant gold
(`#D4A864`). User taps the kept one; the other receives `evict=true` and dissolves
into particles in place; the kept one collapses upward as the canonical message
and the feedback panel appears beneath it.

```
   [ gold text — voice 1 ............................. ]
   [ gold text — voice 1 continues ................... ]

   [ gold text — voice 2 ............................. ]
   [ gold text — voice 2 continues ................... ]

   ─ select 1 ─    ─ select 2 ─
```

- Cost: **low**. Reuses `SimultaneousEntropyMessage` verbatim; only `MessageList`'s
  comparison branch is rewritten.
- Dissolve interaction: native — same particle path as eviction. Selection just
  flips `evict` on the unchosen branch.
- Mobile: trivial — vertical stack already works in the prototype's `max-w-2xl`
  column. No layout change vs current placeholder.
- Trade-off: visually closest to a conventional A/B picker; the selection
  affordance (two buttons) is the least native element on the chat surface.

**Option B — Shared canvas, overlaid voices**
Both responses render into the *same canvas region*, overlaid at ~60% opacity each,
so the two voices interleave visually as overlapping gold text. The user taps the
region closer to the response they want (or the response text itself, hit-tested);
the unchosen voice dissolves out *from under* the chosen one, which then resolves
to full opacity. No buttons.

```
   [ gold──voice──1──interleaved──with──voice──2 .... ]   ← both at 60%
   [ overlapping────particles────faint──gold ........ ]
   [ tap region of chosen voice ────────────────────  ]
```

- Cost: **high**. Requires either (a) a new dual-content canvas variant that
  renders two strings simultaneously and can dissolve one independently, or (b)
  two stacked absolutely-positioned canvases with hit-testing on the underlying
  text — both well outside the existing `simultaneousEntropy.js` contract.
- Dissolve interaction: deepest conceptual fit — the two voices *are* one surface
  until one is silenced. But the particle engine wasn't designed for layered
  dissolves; risk of visual mush.
- Mobile: hit-testing overlapping text on a touchscreen is fragile; if voices
  are long they overlap heavily and the chosen target is unclear.
- Trade-off: highest conceptual reward, highest implementation and UX risk.
  Also the most legible-text-cost: two overlapping paragraphs at 60% opacity
  may read as illegible to anyone with low vision or on a glare-lit phone.

**Option C — Sequential, one at a time**
Both responses are never visible simultaneously. The first response appears as a
normal assistant message and the user reads it; a small unobtrusive affordance
(e.g. a single dot or `~` underneath, or a swipe gesture on mobile) replaces it
in place with the *second* response, also as a normal assistant message — same
gold canvas treatment, same position. The user can toggle back and forth as
many times as they want. A confirm action (Enter on desktop, tap the next-message
input, or a small "keep this one" link) commits the currently-shown response;
the other was never on screen at the moment of commit, so nothing needs to be
dissolved — it was already absent.

```
   [ gold text — currently viewing voice 1 ........... ]
   [ gold text — voice 1 continues ................... ]
                            · ·   ← tap dot or swipe to toggle
```

- Cost: **medium**. New toggle state in `MessageList`, no canvas changes, no
  parallel rendering. `selectResponse` becomes "commit currently-shown".
- Dissolve interaction: doesn't fight the dissolve engine because nothing
  dissolves at selection time — the unchosen voice never had a body on screen
  when it was "silenced". The dissolve aesthetic still applies to eventual
  eviction of the committed response.
- Mobile: excellent — swipe gesture is native; single-column layout never
  doubles vertical real estate.
- Trade-off: the *comparison* moment is weaker — users can't see both at once
  to compare directly, which may degrade the quality of preference data the
  experiment is trying to collect. This is a research-data concern, not an
  aesthetic one.

### Recommendation

**Option A**, with the caveat below. It is the only option that (a) reuses the
existing dissolve pipeline without inventing new canvas behavior, (b) keeps both
voices simultaneously legible — important for collecting genuine preference data,
which is the *point* of RLHF mode — and (c) keeps the selection moment visually
loaded by reusing the same particle-silencing language as eviction. The
conceptual cost vs Option B is real but acceptable: A's stacked layout reads
as "two voices, one chosen and the other silenced," which is the work's frame.
Option B is conceptually richer but technically risky and likely illegible;
Option C trades away the comparison moment that makes RLHF research-useful.
The caveat: replace the two `Select` buttons with a single inline affordance per
voice (e.g. a thin underline that becomes a faint gold on hover/tap, no
button-shaped chrome) so the affordance stops fighting the prose-like aesthetic
of the rest of the chat surface.

### Implementation notes (recommended option)

Affects:

- `frontend/src/components/MessageList.js` — replace the pending-comparison
  placeholder branch (the `if (isPending)` block) with the stacked
  `SimultaneousEntropyMessage` treatment. Both voices use the assistant gold;
  selection sets `evict=true` on the unchosen branch via local state, *not* via
  `selectResponse`, so the unchosen text stays mounted long enough to dissolve.
- `frontend/src/hooks/useChat.js` — `selectResponse` currently mutates the
  message in place; on resolution, `MessageList` flips from rendering an array
  of voices to rendering only `content[selected]`. That transition needs to wait
  for the unchosen voice's dissolve callback before the comparison message is
  replaced by the canonical single message, otherwise the chosen voice
  re-mounts and re-runs its intro animation. Either: (a) defer the
  `selected`-mutation in `useChat` until the unchosen branch fires
  `onDissolveComplete`, or (b) keep `useChat` as-is and have `MessageList`
  carry the dissolve-then-flip state internally. Option (b) keeps `useChat`
  pure and is preferred.
- `frontend/src/components/ResponseComparison.js` — likely **delete** entirely;
  its responsibilities collapse into `MessageList`'s comparison branch. Confirm
  no other caller imports it before removing.
- `frontend/src/components/FeedbackPanel.js` — restyle only (D2, zinc + gold);
  no API changes.
- Reduced-motion: the unchosen voice already inherits the canvas-vs-fade
  fallback from Phase 1 (D10), so no separate work needed — fade-out of the
  unchosen branch is the natural reduced-motion analogue of the particle
  dissolve.
- Storybook (D13): a `MessageList` story with a pending comparison, and a
  second variant showing the mid-dissolve state.

Anticipated file touch list extension (delta vs the plan's main list):
`ResponseComparison.js` (delete), `MessageList.js` (rewrite comparison
branch), `FeedbackPanel.js` (restyle), `useChat.js` (untouched if option
(b) above), plus stories.

### Questions to forward to Nora Al-Badri

1. When the user picks one of the two responses, should the *unchosen* response
   visibly dissolve into particles (the same effect older messages already use),
   or should it just disappear quietly? We lean toward dissolving — it makes the
   act of choosing visible — but it could also read as the user "silencing" one
   voice, which we want to make sure aligns with your intent.
2. Should the two responses both appear in the same gold color the bot already
   uses, or should one or both be visually distinguished (e.g. slightly different
   shade, or a thin label like "Voice A / Voice B")? We currently propose:
   identical gold, no labels — the two voices are indistinguishable until chosen.
3. Is it important that the user can see *both* responses on screen at the same
   time to compare them, or would it be acceptable if the user reads them one at
   a time (toggling between them) and only ever sees one at a moment? This
   changes the layout significantly.
4. For the selection action itself — do you have a preference between an
   explicit button ("Select") under each response, or a softer affordance like
   tapping the text of the response you want? Buttons are clearer; tapping the
   text feels more in keeping with the prose aesthetic but is less discoverable.

### Next actions (Phase 4 gate)

- [ ] Forward questions 1–4 to Nora; capture answers in this section.
- [ ] If answers diverge from Option A, revise this section before engineer
      starts; otherwise mark D3 as resolved in the locked-decisions table.
- [ ] Engineer kicks off Phase 4 against the resolved option.

## File touch list (anticipated)

```
doc/plans/frontend-design-integration.md           (this file; status updates appended)
frontend/package.json                              (+ tailwindcss, postcss, autoprefixer)
frontend/tailwind.config.js                        (new)
frontend/postcss.config.js                         (new)
frontend/src/index.css                             (replaced with prototype's)
frontend/src/theme.js                              (dark zinc palette)
frontend/src/App.js                                (add routes)
frontend/src/pages/ChatPage.js                     (rewrite layout)
frontend/src/pages/About.js                        (new, copied)
frontend/src/pages/PrivacyPolicy.js                (new, copied)
frontend/src/pages/TermsAndConditions.js           (new, copied)
frontend/src/pages/Background.js                   (new, copied)
frontend/src/components/effects/                   (new — SimultaneousEntropyMessage + libs + reduced-motion gate)
frontend/src/components/LegalPageLayout.js         (new, copied)
frontend/src/components/Header.js                  (rewrite — minimal Tailwind cluster)
frontend/src/components/MessageList.js             (rewrite — Tailwind + canvas effect)
frontend/src/components/MessageInput.js            (rewrite — Tailwind)
frontend/src/components/ResponseComparison.js      (restyle)
frontend/src/components/FeedbackPanel.js           (restyle)
frontend/src/hooks/useChat.js                      (visible_limit/context_limit logic)
frontend/src/hooks/useConfig.js                    (expose new YAML fields)
frontend/public/index.html                         (title, theme-color, viewport)
frontend/public/.gitignore                         (new — ignore the rsynced media files)
.claude/skills/hetzner/hcloud.sh                   (+ pull-assets subcommand; deploy rsyncs media)
backend/app/config.py (or equivalent)              (+ visible_limit, context_limit fields)
config/experiment.yml (sample)                     (illustrate new fields)
```

`prototypes/genai-chat/` itself is **not touched** at any point.

## Status updates

| Phase | Status | Date | Commit(s) | Notes |
|---|---|---|---|---|
| 0 — Foundation | DONE | 2026-05-14 | `51e7201`, `56977df`, `4e010d6` | SSH key infra + ACTIVE plan + `pull-assets` subcommand + Tailwind/PostCSS/CRACO+theme/index.html. Mid-stream working-tree race between parallel engineers reverted index.html briefly; the later commit reapplied. Tester PASS. |
| 0.5 — CRACO build fix | DONE | 2026-05-14 | `de9d5db` | Phase 3 surfaced that CRA 5's css-loader chokes on `url('/...')` paths. Switched scripts to `craco` with `style.css.loaderOptions.url = false`. |
| 1 — Dissolve effect + reduced motion | DONE | 2026-05-14 | `4654ed9` | Three effect files ported verbatim into `frontend/src/components/effects/`. `useReducedMotion` hook + `ReducedMotionMessageBody` share the canvas path's lifecycle contract (200 ms fade vs 6 s canvas dissolve). Tester PASS in both motion modes. |
| 2 — Chat shell + limits + video | DONE | 2026-05-14 | `c97d79a` (backend), `7f018c8` (frontend) | Tailwind chat surface, `BackgroundVideo` subcomponent (reduced-motion + visibilitychange + `<img>` error fallback), `visible_limit` + `context_limit` wired client-side, RLHF placeholder cards left dormant. Re-encode A/B → keep original (no candidate cleared the size/quality gates). Tester PASS across 9/9 checklist items. |
| 3 — Routes + supporting pages | DONE | 2026-05-14 | `7ae005a` | `/about`, `/privacy`, `/terms`, `/background` + `LegalPageLayout` ported verbatim (D8). `LegalPageLayout` uses stock Tailwind only — `@tailwindcss/typography` not required. Tester PASS. |
| 4 — RLHF + feedback reskin | **DESCOPED** | 2026-05-14 | `86d2e3a` | User decision: single-bot deployment. RLHF code paths remain dormant; D3 proposal preserved for future reopening. |
| 5 — Header → corner cluster | DONE | 2026-05-14 | `b5f9172` | MUI AppBar gone, Tailwind cluster (status dots + cog icon) absolute top-right. Bundle dropped 22.38 kB gzipped. Click-outside dismiss, `accessKey`-gated reset. Tester PASS 14/14. |
| 6 — Cleanup + verification | DONE | 2026-05-14 | `043ec88` | Removed `/__effect-sandbox` testbed, dead-code audit, README updated for Tailwind + CRACO + asset pulling. Final tester PASS: Chromium + WebKit happy path, zero console errors, route-removal confirmed. Firefox not run (executable absent in harness — low priority since WebKit covers the iOS Safari production target). |

**Plan terminal state.** All planned in-scope work is shipped on `feat/frontend-mock-backend`. Phase 4 (RLHF) descoped per user direction. One known follow-up: blank render on unknown routes — adding a `<Route path="*" element={<NotFound />} />` is a small future polish, not part of this design port. Storybook was never actually set up in the project; D13's "regenerate stories" was based on a wrong assumption and was dropped — left as a possible separate setup task.
