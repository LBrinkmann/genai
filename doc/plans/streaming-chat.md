# [DONE] Streaming chat with motion-masked canvas swap

## Goal

Make the LLM proxy stream tokens to the browser instead of returning the full response after 3–30 s. During streaming render text in a lightweight canvas that redraws each chunk; swap to the full `SimultaneousEntropyMessage` (with particle eviction support) when the stream completes. Use the natural scroll + bubble-growth motion that accompanies each new chunk to mask any per-glyph mismatch at the swap moment.

The prototype did NOT have streaming — this is a net-new feature, not a port.

## Design

### Backend (`backend/app/routes/chat.py`)

- Accept an optional `stream: bool = False` field on `ChatRequest`.
- When `stream=true`: open `httpx.AsyncClient().stream("POST", bot.api_url, ...)` with `stream: true` in the upstream payload. The upstream (HF TGI / OpenAI-compatible) returns Server-Sent Events: `data: {choices:[{delta:{content:"..."}}]}\n\n`.
- Forward chunks as-is to the browser as SSE (`Content-Type: text/event-stream`). One SSE event per upstream event; on `data: [DONE]` close.
- Errors: if upstream returns non-2xx, send a single SSE `event: error\ndata: {message}\n\n` then close. Don't leak the api_key, don't echo the upstream body verbatim — truncate to 200 chars (also closes the chat.py:65-67 finding from the security review).
- Non-streaming path stays unchanged (`stream=false` or absent → existing JSON response).
- Preserve auth/system_message injection/context_limit (caller still passes the truncated `messages` array; backend just inserts the system prompt and forwards).

### Frontend

- **`frontend/src/services/api.js`** — add `streamChat(botName, messages, onChunk, onDone, onError, abortSignal)`:
  - Use `fetch` with `credentials: 'include'`, body has `stream: true`.
  - Get the `ReadableStream` from `response.body.getReader()`. Read chunks, split on `\n\n`, parse each `data:` line as JSON, call `onChunk(deltaText)` for each `choices[0].delta.content`.
  - On `data: [DONE]` or stream close → `onDone(fullText)`.
  - On `event: error` → `onError(message)`.
  - Returns an `AbortController` so callers can cancel.

- **`frontend/src/hooks/useChat.js`** — add a `streaming` flag on messages:
  - On send: insert a placeholder assistant message `{role: "assistant", content: "", streaming: true, index: ...}`.
  - Call `streamChat(...)`. For each chunk, append to that message's `content`. When done, flip `streaming: false`.
  - On error: flip `streaming: false`, set `content` to error text (or remove the placeholder, depending on what's nicer).
  - The existing non-streaming code path stays as a fallback (e.g. if `stream` is disabled per-bot, or for the RLHF comparison path which still uses the JSON `/api/chat` for parallel calls).

- **`frontend/src/components/effects/StreamingCanvasMessage.js`** — new component:
  - Mirrors `SimultaneousEntropyMessage`'s public props (`content`, `textColor`, `textAlign`, plus `streaming` flag).
  - Renders a single `<canvas>` with the same dimensions / class names as `SimultaneousEntropyMessage`'s inner canvas, so the swap is dimensionally identical.
  - On every `content` change: clears the canvas, calls `drawWrappedText(ctx, content, W, H, 1, {fontSize: 16, fontFamily: 'Georgia, serif', textColor, textAlign})` — the same helper `simultaneousEntropy.js` uses internally. Re-uses canvas measurement logic via `measureWrappedTextHeight` from `gravityCascade.js`.
  - Auto-resizes height to match wrapped content (just like `SimultaneousEntropyCanvas`).
  - No particles, no animation pipeline, no eviction handling — that's the next component's job.
  - Includes the same `sr-only` span for accessibility.

- **`frontend/src/components/MessageList.js`** — branch on `streaming`:
  - `msg.streaming === true` → render `StreamingCanvasMessage`.
  - `msg.streaming === false` or undefined → render `SimultaneousEntropyMessage` (existing behavior).
  - The transition happens automatically when `streaming` flips — React unmounts one, mounts the other. The DOM-to-DOM swap is timed to the moment the last chunk arrives, while the bubble is still settling from its final growth.
  - **Fallback for short responses** (no real motion to mask): if `streaming` is true but `content.length < 200` AND the stream is already done, skip the streaming component entirely. Or simpler: always mount `StreamingCanvasMessage` while streaming, and on completion both components briefly co-render with the streaming canvas at `opacity-0` for ~50 ms (CSS transition) before unmount. Smooth crossfade.

### Auto-scroll

The existing `endRef.scrollIntoView({behavior:'smooth'})` in `MessageList` fires on every render. With streaming, that's fired on every chunk → smooth follow. Already correct. Just verify it doesn't fight the canvas redraw.

### Per-bot opt-in (optional, polish)

Each bot in `experiment.yml` could have a `streaming: true|false` flag. Defaults to `true` for OpenAI-compatible endpoints, `false` for anything that doesn't support SSE. For v1: hardcode `streaming=true` on the streamChat client call; if the upstream doesn't support it, the backend gets a non-streaming response from upstream, accumulates it, and emits a single SSE chunk + DONE. Adapter logic in the backend.

### Aborts

If the user navigates away or sends a new message before the previous stream finishes, abort the in-flight stream. `useChat` keeps the `AbortController` per message; on send, abort the previous one.

## Phased plan

Single phase, single commit, single engineer. ~400–600 lines across backend + frontend.

## Agent

`engineer`, `opus`, **max reasoning** (security review flagged `chat.py:65-67` for the unbounded upstream body passthrough, plus the canvas-redraw + swap timing needs careful state management — easy to get a flicker or a stuck-in-streaming bug if the order is wrong).

## File touch list

```
doc/plans/streaming-chat.md                                  (this file)
backend/app/routes/chat.py                                   (+ stream branch)
backend/app/schemas.py                                       (+ stream: bool field)
backend/tests/test_chat_stream.py                            (new)
frontend/src/services/api.js                                 (+ streamChat)
frontend/src/services/mockApi.js                             (+ mock streaming)
frontend/src/hooks/useChat.js                                (+ streaming state)
frontend/src/components/effects/StreamingCanvasMessage.js    (new)
frontend/src/components/MessageList.js                       (+ branch on streaming)
```

## Constraints

- Doesn't touch `routes/admin.py`, `routes/auth.py`, `models.py`, `Header.js`, `pages/Admin.js`, `hooks/useConfig.js`, `hooks/useAdmin.js` — those are owned by the parallel admin-config agent. Any conflict means stop and rebase.
- Single commit on a worktree branch. The runner will merge to `feat/frontend-mock-backend` after both agents finish.

## Status updates

| Date | Commit | Notes |
|---|---|---|
| 2026-05-14 | `a49c3f2` | Single commit landed (cherry-picked from worktree `worktree-agent-ac89fa253a00dd524` onto `feat/frontend-mock-backend` after the admin-config agent's commits). Conflict in `backend/app/routes/chat.py` resolved by combining the admin agent's `get_merged_config(session)` call with the streaming agent's `_resolve_bot`/`_prepare_payload`/`_stream_upstream` refactor — `_resolve_bot(cfg, bot_name)` now takes the merged config. Backend 59/59 tests pass. Frontend `npm run build` clean. Deployed via `hcloud.sh deploy gen-ai-server-1`. Live verified: streaming endpoint returns `text/event-stream` with `X-Accel-Buffering: no`, terminal `data: [DONE]`, and the upstream-error path truncates to 200 chars without leaking the api_key. `drawWrappedText` reused from `gravityCascade.js` (already exported there — neither option A nor B from the plan was needed). |
