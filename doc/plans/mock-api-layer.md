# [DRAFT] Mock API Layer for Standalone Frontend

## Goal

Enable the React frontend to run without a backend by replacing the API service layer with a mock implementation. This supports frontend-only development, demos, and Storybook-like workflows where spinning up the full stack is unnecessary.

## Plan

| # | Section | Change | Optional |
|---|---------|--------|----------|
| 1 | Mock API module | New file `src/services/api.mock.js` with mock implementations of all 5 exported functions | no |
| 2 | API entry point | Conditional re-export in `src/services/api.js` based on env var | no |

### 1. Mock API module — `src/services/api.mock.js` (new file)

- Implement `fetchConfig(configName)` returning a hardcoded config object with:
  - Two bots: `{ name: "bot-a", display_name: "Bot A" }` and `{ name: "bot-b", display_name: "Bot B" }` (supports both single-bot and RLHF modes depending on config name)
  - `additional_categories: ["More helpful", "More accurate", "Better tone"]`
  - `main_preference_feedback: "I prefer this response"`
  - `defaults: { log: false }`
  - If `configName` contains "single", return only one bot; otherwise return two (RLHF mode)
- Implement `sendChat(botName, messages)` that returns `{ content: "..." }` after a short random delay (300-800ms) to simulate latency. Use a small pool of canned responses, varying by `botName` so RLHF comparison shows distinguishable text.
- Implement `createSession(userId, feedbackConfigName)` returning `{ session_id: crypto.randomUUID() }` synchronously (no delay needed).
- Implement `saveMessage(messageData)` as a no-op that resolves with `{ ok: true }`. Optionally log to `console.debug` for dev visibility.
- Implement `validateKey(key)` returning `{ valid: true }` for any non-empty key, `{ valid: false }` otherwise.
- Export a default mock axios-like client object (the default export from `api.js` is the axios client, which `ChatPage.js` does not use directly, but keep the export shape consistent).

### 2. Conditional switch in `src/services/api.js`

- Rename current `api.js` to `api.real.js` (no content changes).
- Replace `api.js` with a thin switching module that re-exports from `api.real.js` or `api.mock.js` based on `process.env.REACT_APP_MOCK_API`.
- This avoids changing any import paths in hooks or pages.
- CRA bakes `REACT_APP_*` env vars at build time, so the switch is dead-code-eliminated in production builds without the var set.

## Implementation notes

- The canned response pool in `sendChat` should have 5-8 short, varied responses per bot. Include the bot name in each response so the user can distinguish which bot answered (important for RLHF comparison testing).
- The random delay in `sendChat` should use `new Promise(resolve => setTimeout(resolve, ms))`.
- The mock module should have zero external dependencies (no axios, no uuid libs).
- For the switching module, use the pattern: `if (process.env.REACT_APP_MOCK_API) { module.exports = require('./api.mock'); } else { module.exports = require('./api.real'); }` — CRA supports CommonJS require in this context and webpack will tree-shake the unused branch.

## Validation strategy

- `auto` — Run `REACT_APP_MOCK_API=true npm start` in the frontend directory; app loads without errors and displays the chat UI.
- `manual` — Send a message and verify a canned bot response appears after a short delay. Test both single-bot mode (`?config=single`) and RLHF mode (default).
- `manual` — In RLHF mode, verify two distinct responses appear side by side and preference selection works.
- `auto` — Run `npm start` without the env var; app still tries to reach the real backend (network error expected, not a code error).

## Next actions

- [ ] Create `src/services/api.mock.js` with all mock function implementations
- [ ] Rename `src/services/api.js` to `src/services/api.real.js`
- [ ] Create new `src/services/api.js` as a switching module
- [ ] Test with `REACT_APP_MOCK_API=true npm start`
