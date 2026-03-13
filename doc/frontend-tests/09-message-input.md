# Test: Input Field Behavior

## What
Verify the message input field handles text entry, send triggers (Enter key and button click), multiline input (Shift+Enter), clearing after send, and disabled state during response loading.

## Prerequisites
- Backend is running with a valid `default` config (single bot for simpler testing)
- Navigate to: `http://localhost:3000/?config=default`
- Page has fully loaded

## Steps

### Step 1: Verify input field is ready
**Do**: Look at the input area at the bottom of the page.
**Expect**: A text field is visible with placeholder text "Type a message...". The field is a MUI outlined TextField with rounded corners (borderRadius: 3). It is not disabled. The send button to the right is in a disabled state (grey/faded) because no text has been entered.
**Screenshot**: Capture the input area showing the empty field with placeholder and disabled send button.

### Step 2: Type text and verify send button activates
**Do**: Click on the input field and type "Hello".
**Expect**: The text "Hello" appears in the input field. The send button becomes active -- it changes from greyed out to the primary color (blue background, white arrow icon). The button is now clickable.
**Screenshot**: Capture the input area showing the typed text and the now-active send button.

### Step 3: Send via Enter key
**Do**: With "Hello" typed in the field, press the Enter key.
**Expect**: The message is sent. The input field clears (becomes empty). The user message "Hello" appears in the message area as a right-aligned blue bubble. The input field becomes disabled (greyed out). The send button is replaced by a CircularProgress spinner (24px). After the bot responds, the input re-enables and the send button returns.
**Screenshot**: Capture immediately after pressing Enter, showing the cleared input and disabled/loading state.

### Step 4: Test Shift+Enter for newline
**Do**: After the response arrives and input is re-enabled, click the input field. Type "Line one", then press Shift+Enter, then type "Line two".
**Expect**: The input field now contains two lines of text. The text field expands vertically to accommodate multiple lines (it is a `multiline` TextField with `maxRows={4}`). Shift+Enter does not send the message -- it only inserts a newline.
**Screenshot**: Capture the input field showing the two-line text, with the field expanded to show both lines.

### Step 5: Send multiline message via send button
**Do**: Click the blue send button (arrow icon) to the right of the input field.
**Expect**: The multiline message is sent. The input clears. The user message appears in the chat showing the full text (both lines). The input goes through the same disabled/loading/re-enabled cycle.
**Screenshot**: Capture the sent multiline message in the chat area.

### Step 6: Verify empty messages cannot be sent
**Do**: With the input field empty, press Enter. Also try clicking the send button.
**Expect**: Nothing happens. No message is sent. The send button is disabled (not clickable) when the input is empty or contains only whitespace. The Enter key press is handled by `handleSend` which checks `value.trim()` and returns early if empty.
**Screenshot**: Capture the empty input state showing the disabled send button.

### Step 7: Verify input disabled during loading
**Do**: Type a message and send it. Immediately try to type in the input field while waiting for the response.
**Expect**: The input field is disabled (has the MUI disabled styling -- slightly greyed, not focusable). Keystrokes are ignored. The spinner is shown instead of the send button. Once the response arrives, the field re-enables and accepts input again.
**Screenshot**: Capture the disabled input state during loading, and then the re-enabled state after the response.

## Pass Criteria
- [ ] Input field shows "Type a message..." placeholder when empty
- [ ] Send button is disabled when input is empty
- [ ] Send button activates (turns blue) when text is entered
- [ ] Pressing Enter sends the message
- [ ] Pressing Shift+Enter inserts a newline without sending
- [ ] Input field clears after sending
- [ ] Input field is disabled while waiting for a response
- [ ] CircularProgress spinner replaces send button during loading
- [ ] Input re-enables after response arrives
- [ ] Empty or whitespace-only messages cannot be sent
- [ ] Multiline messages can be composed and sent
