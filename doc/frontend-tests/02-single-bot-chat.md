# Test: Single-Bot Chat Conversation

## What
Verify that a user can send messages and receive responses from a single bot in a basic conversational flow. User messages should appear right-aligned, assistant responses left-aligned, and the input should be disabled while waiting for a response.

## Prerequisites
- Backend is running with a valid `default` config containing exactly one bot
- Navigate to: `http://localhost:3000/?config=default`
- Page has fully loaded (header visible, input ready)

## Steps

### Step 1: Send the first message
**Do**: Click the input field. Type "Hello, how are you?" and press Enter.
**Expect**: The typed text disappears from the input field. A right-aligned message bubble appears in the message area with the text "Hello, how are you?" on a blue/primary-colored background with white text. The input field becomes disabled. A loading spinner (CircularProgress) replaces the send button.
**Screenshot**: Capture the page immediately after sending, showing the user message and the loading state of the input.

### Step 2: Wait for the bot response
**Do**: Wait for the assistant response to appear (up to 60 seconds depending on LLM speed).
**Expect**: A left-aligned message bubble appears below the user message. It has a light grey background. The text is the bot's response. The input field becomes enabled again. The send button reappears (replacing the spinner).
**Screenshot**: Capture the full message area showing both the user message (right-aligned, blue) and assistant response (left-aligned, grey).

### Step 3: Send a follow-up message
**Do**: Type "Tell me something interesting about science." and press Enter.
**Expect**: A second right-aligned user message appears below the first exchange. The input disables and shows a spinner again. After the response arrives, a second left-aligned assistant message appears. The conversation now shows four messages in sequence: user, assistant, user, assistant.
**Screenshot**: Capture the full conversation with all four messages visible. Verify the alternating alignment pattern (right, left, right, left).

### Step 4: Verify no comparison UI appears
**Do**: Examine the assistant response messages.
**Expect**: Each assistant response is a single text bubble -- there is no side-by-side comparison layout. No "select response" interaction is required. The conversation flows freely without any selection step.
**Screenshot**: Capture an assistant message to confirm it is a simple text bubble, not a two-column comparison.

## Pass Criteria
- [ ] User messages appear right-aligned with primary color (blue) background and white text
- [ ] Assistant messages appear left-aligned with grey background
- [ ] Input field clears after sending a message
- [ ] Input is disabled (greyed out) while waiting for response
- [ ] CircularProgress spinner shows while waiting for response
- [ ] Input re-enables after response arrives
- [ ] Multiple message exchanges work correctly (conversation flows)
- [ ] No RLHF comparison UI appears (single bot mode)
- [ ] Messages auto-scroll to show newest content
