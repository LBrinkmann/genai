# Frontend Test Round 2 -- 2026-03-14

## Summary
- Passed: 10/10
- Failed: 0/10
- All 5 previously-failing tests (01, 02, 06, 07, 10) now pass after bug fixes.
- All 5 previously-passing tests (03, 04, 05, 08, 09) still pass -- no regressions.

## Results

| # | Test | Round 1 | Round 2 | Notes |
|---|------|---------|---------|-------|
| 01 | Initial Load | FAIL | PASS | No CRA error overlay; page loads cleanly |
| 02 | Single-Bot Chat | FAIL | PASS | Chat works; API key is valid so responses arrive |
| 03 | RLHF Comparison | PASS | PASS | Two cards side-by-side, bot names shown |
| 04 | Response Selection | PASS | PASS | Selection highlight, dimming, feedback panel all work |
| 05 | Feedback Panel | PASS | PASS | Chip toggle, confirm, "Feedback submitted" all work |
| 06 | Session Management | FAIL | PASS | Session creation works; reset clears messages and creates new session |
| 07 | Header Status | FAIL | PASS | Access key gating works correctly |
| 08 | Error Handling | PASS | PASS | Invalid config shows centered error Alert; recovery works |
| 09 | Message Input | PASS | PASS | Enter sends, Shift+Enter newline, empty blocked, button toggle |
| 10 | Visual Polish | FAIL | PASS | Newlines render in messages; full layout quality verified |

## Bug Fix Verification

### Fix 1: Backend DateTime timezone=True
**Status**: VERIFIED
**Evidence**: Page loads without CRA error overlay. Session creation succeeds silently. Chat is functional immediately after load. No console errors related to session creation.

### Fix 2: ChatPage createSession/resetSession try/catch
**Status**: VERIFIED
**Evidence**: No CRA error overlay on page load or after reset. Reset clears messages and creates new session without any error overlay. Console is clean.

### Fix 3: Single-bot error messages shown in UI
**Status**: VERIFIED (indirectly)
**Evidence**: During initial testing before Docker was started (servers down), the first test run showed "[Error: timeout of 60000ms exceeded]" as a left-aligned assistant message. This confirms the error handling in useChat now surfaces errors to the UI in single-bot mode. With the working API key, actual responses arrive normally.

### Fix 4: Access key URL param validation
**Status**: VERIFIED
**Evidence**: Three scenarios tested:
- No key param (`?config=default`): Gear menu shows "No admin controls" (disabled text)
- Wrong key (`?config=default&key=wrong-key`): Gear menu shows "No admin controls" (disabled text)
- Correct key (`?config=default&key=dev-key`): Gear menu shows "RESET CONVERSATION" button (red outlined)

### Fix 5: white-space: pre-wrap on messages
**Status**: VERIFIED
**Evidence**: Multiline message composed with Shift+Enter ("Line one" / "Line two") renders on separate lines in the user bubble. Assistant response also renders multiline text correctly. Zoomed screenshot confirms clear line breaks in blue user bubble.

## Detailed Test Notes

### 01: Initial Load
- Page loads at `?config=default` with no errors
- Header: "GenAI Chat" title visible, green status dot, gear icon
- Empty message area, input field with "Type a message..." placeholder
- Send button disabled (grey)
- No console errors

### 02: Single-Bot Chat
- Sent "Hello, how are you?" -- user bubble right-aligned, blue, white text
- Bot responded with contextual text -- left-aligned, grey background
- Sent follow-up -- multi-turn conversation works
- Four messages visible in correct alternating alignment
- No RLHF comparison UI in single-bot mode
- Input clears after send, disables during loading, re-enables after response

### 03: RLHF Comparison
- Sent message at `?config=comparison`
- Two Paper cards appeared side by side with bot names (gpt-4, gpt-4-concise)
- Cards show response text, equally sized
- Input re-enabled after responses arrive

### 04: Response Selection
- Clicked left card (gpt-4): blue border highlight, right card dimmed
- Feedback panel appeared below with "I prefer this response" text
- Category chips and Confirm button visible

### 05: Feedback Panel
- Clicked "More helpful" chip -- filled blue (selected)
- Clicked "More accurate" chip -- also filled blue (multi-select works)
- Clicked "More helpful" again -- deselected (toggle works)
- Clicked "CONFIRM SELECTION" -- panel replaced by "Feedback submitted"
- Feedback is final (no re-editing)

### 06: Session Management
- Session created automatically on load (chat is functional)
- genai_user_id exists in localStorage (UUID: e08bec11-843d-487e-b0da-ff87ca45ea6e)
- Gear menu shows Reset button with key=dev-key
- Reset clears all messages, page shows empty state
- Chat works after reset (new session active)
- No CRA overlay during any of these operations

### 07: Header Status and Controls
- Status dot green next to "GenAI Chat" title
- Gear icon always visible
- Without key: "No admin controls" (disabled)
- With wrong key: "No admin controls" (disabled)
- With correct key (dev-key): "RESET CONVERSATION" button (red outlined)

### 08: Error Handling
- `?config=nonexistent` shows centered error Alert (red)
- "Configuration Error" heading with "Config 'nonexistent' not found" detail
- No chat UI components visible during error state
- Recovery works: navigating to valid config shows normal chat

### 09: Message Input
- Placeholder "Type a message..." visible when empty
- Send button disabled when empty, activates (blue) when text entered
- Shift+Enter inserts newline without sending
- Input field expands for multiline text
- Send via button works
- Empty Enter press does nothing (empty message blocked)
- Input clears after send

### 10: Visual Polish
- Full viewport height layout with fixed header and input
- Message area scrolls, header and input stay fixed
- Auto-scroll to newest messages
- User bubbles: right-aligned, blue, white text, rounded corners
- Assistant messages: left-aligned, grey background
- Multiline messages render with proper line breaks (white-space: pre-wrap)
- RLHF cards evenly sized with proper spacing
- Selection/dim states clearly distinguishable
- Error alert centered with proper MUI styling
- No layout jumps or visual glitches

## Environment Notes
- Docker Desktop had to be started during testing (was not running initially)
- Used `docker-compose.dev.yml` override for port mappings (3000, 8000, 5432)
- OPENAI_API_KEY in .env is a valid key, so LLM responses arrive normally
- Access key is `dev-key` (set in .env as ACCESS_KEY)
- Browser extension disconnected once during testing; reconnected with new tab group
