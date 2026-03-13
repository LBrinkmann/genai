# Frontend Test Round 1 -- 2026-03-14

## Summary
- Passed: 5/10
- Failed: 5/10
- Note: Backend session creation endpoint returns 500 (timezone bug), causing CRA error overlay on every page load. This affects multiple tests. The UI beneath the overlay works correctly in most cases.

## Results

| # | Test | Status | Notes |
|---|------|--------|-------|
| 01 | Initial Load | FAIL | CRA error overlay from unhandled session creation error |
| 02 | Single-Bot Chat | FAIL | No user-visible error when chat API fails (401); no assistant response shown |
| 03 | RLHF Comparison | PASS | Two cards render side-by-side, bot names shown, hover effects work |
| 04 | Response Selection | PASS | Selection highlight, dimming, cursor change, feedback panel all work |
| 05 | Feedback Panel | PASS | Chip toggle, multi-select, confirm, "Feedback submitted" all work |
| 06 | Session Management | FAIL | Session creation fails (backend 500); reset triggers CRA overlay; access key logic bug |
| 07 | Header Status | FAIL | Access key gating broken -- Reset button shows without key param |
| 08 | Error Handling | PASS | Invalid config shows centered error Alert; recovery works |
| 09 | Message Input | PASS | Enter sends, Shift+Enter newline, empty blocked, button toggle, multiline works |
| 10 | Visual Polish | FAIL | Newlines not rendered in messages; CRA overlay disrupts experience |

## Failures

### 01: Initial Load
**What failed**: CRA development error overlay appears on every page load due to unhandled promise rejection from createSession.
**Expected**: Page loads cleanly without error overlays.
**Actual**: Red "Uncaught runtime errors" overlay covers the entire page. The UI beneath is correct (header, input, empty message area all render properly).
**Console errors**: AxiosError: Network Error at createSession -- the backend /api/sessions endpoint returns 500 due to a timezone bug (naive vs offset-aware datetime).
**Root cause (backend)**: backend/app/routes/sessions.py line 29 -- SQLAlchemy insert fails with "can't subtract offset-naive and offset-aware datetimes".
**Root cause (frontend)**: frontend/src/pages/ChatPage.js line 48 -- createSession(configName) is called without .catch() in a useEffect, causing the rejected promise to become an unhandled rejection.
**Suggested fix (frontend)**: Add .catch() to the createSession call in the useEffect in ChatPage.js:
  createSession(configName).catch(err => console.error('Session creation failed:', err));
**Suggested fix (backend)**: Use timezone-aware datetime in the sessions model (e.g., datetime.now(timezone.utc) instead of datetime.now()).

### 02: Single-Bot Chat
**What failed**: When the chat API returns an error (401 invalid API key), no error message is shown to the user. The user message appears but nothing else happens.
**Expected**: Either an error message bubble or a visible error notification should appear.
**Actual**: The error is silently caught and logged to console (Chat error: AxiosError: Request failed with status code 401) but no UI feedback is given. The input re-enables normally.
**Console errors**: Chat error: AxiosError: Request failed with status code 401
**Root cause**: frontend/src/hooks/useChat.js line 112-123 -- single-bot mode calls sendChat() without .catch(), so when it throws, the outer try/catch on line 125 catches it but only does console.error. No error message is added to the messages array. In contrast, RLHF mode (line 83-91) wraps each sendChat in .catch() and creates an [Error: ...] text in the response card.
**Suggested fix**: In the single-bot branch of sendMessage in useChat.js, add error handling to show the error to the user, similar to the RLHF branch.

### 06: Session Management
**What failed**: Session creation fails due to backend 500 error; reset also triggers session creation failure and CRA overlay.
**Expected**: Sessions should be created successfully; reset should clear messages and create new session without errors.
**Actual**: The createSession call fails with 500 (backend timezone bug). Reset clears messages (PASS) but the subsequent createSession call fails and triggers the CRA error overlay. The handleReset function in ChatPage.js also lacks error handling -- await resetSession(configName) is not wrapped in try/catch.
**Console errors**: AxiosError: Network Error at createSession
**Suggested fix**: Same backend timezone fix as Test 01. Additionally, add try/catch to handleReset in ChatPage.js.

### 07: Header Status and Controls
**What failed**: The "Reset conversation" button is visible even without the key URL parameter. The access key gating logic is broken.
**Expected**: Without ?key=... in the URL, the gear menu should show "No admin controls" (disabled). With ?key=test-key, it should show the "Reset conversation" button.
**Actual**: The "Reset conversation" button always appears because useConfig.js line 47-48 falls back to config.access_key from the backend response. The backend config includes "access_key":"dev-key", so accessKey is always truthy.
**Root cause**: frontend/src/hooks/useConfig.js line 47-48:
  const accessKey = accessKeyParam || config?.access_key || null;
This treats the config's access_key as the actual key rather than as a value to validate the URL parameter against.
**Suggested fix**: Change the logic to compare the URL key against the config key:
  const accessKey = accessKeyParam && accessKeyParam === config?.access_key ? accessKeyParam : null;

### 10: Visual Polish
**What failed**: Multiline messages (composed with Shift+Enter) display on a single line because newlines are not preserved in the message bubble rendering.
**Expected**: Messages with newlines should display on multiple lines.
**Actual**: The text content includes newline characters but they render as spaces because no white-space: pre-wrap CSS is applied to message text.
**Root cause**: frontend/src/components/MessageList.js -- the Typography component rendering message content does not set white-space: pre-wrap.
**Suggested fix**: Add sx={{ whiteSpace: 'pre-wrap' }} to the Typography component that renders message content.
**Other observations (PASS)**: Full viewport height layout, flex column structure, fixed header and input, MUI theme consistently applied, user bubbles blue with white text, rounded corners, 70% max-width, RLHF cards evenly sized, selection/dim states clear, error alert centered and styled.

## Cross-cutting Issues

### Backend: Session Creation Timezone Bug
The /api/sessions endpoint fails with 500 on every call due to a datetime timezone mismatch in SQLAlchemy. This is the root cause of the CRA error overlay that appears on every page load and reset. The fix should be in backend/app/routes/sessions.py or the model definition -- use timezone-aware datetimes consistently.

### Frontend: Unhandled Promise Rejections
Multiple places in the frontend have unhandled async errors:
1. ChatPage.js line 48: createSession(configName) -- no .catch()
2. ChatPage.js line 54: await resetSession(configName) -- no try/catch
3. useChat.js line 113: single-bot sendChat() -- error caught but no UI feedback

All of these should have proper error handling to prevent CRA error overlays and provide user feedback.
