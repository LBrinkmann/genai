# Test: Session Creation and Reset

## What
Verify that sessions are created automatically on page load, that resetting the conversation clears messages and creates a new session, and that the user ID persists in localStorage across page reloads.

## Prerequisites
- Backend is running with a valid `default` config
- Navigate to: `http://localhost:3000/?config=default&key=test-key`
- The `key` parameter is needed to access the reset button in the gear menu

## Steps

### Step 1: Verify initial session creation
**Do**: Open the page and wait for it to load. Send a test message like "Hello" and wait for a response.
**Expect**: The chat works, meaning a session was successfully created on the backend. The session is created automatically when the config loads and no session exists yet. The user can send and receive messages.
**Screenshot**: Capture the working chat with at least one exchange to confirm the session is active.

### Step 2: Check localStorage for user ID
**Do**: Open browser developer tools (F12), go to the Application/Storage tab, and look at localStorage for the current origin. Look for a key named `genai_user_id`.
**Expect**: A `genai_user_id` entry exists in localStorage containing a UUID or random string value. This was generated on first load by the `getOrCreateUserId()` function.
**Screenshot**: Capture the localStorage panel showing the `genai_user_id` entry and its value.

### Step 3: Reset the conversation
**Do**: Click the gear/settings icon in the top-right corner of the header. In the dropdown menu that appears, click the "Reset conversation" button (red outlined button).
**Expect**: The dropdown menu closes. All messages in the chat area are cleared -- the message area becomes empty. A new session is created on the backend (the `resetSession` function calls `createSession` again).
**Screenshot**: Capture the page after reset, showing an empty message area and the ready input field.

### Step 4: Verify chat works after reset
**Do**: Type "This is a new conversation" and press Enter. Wait for the response.
**Expect**: The message sends successfully and a response is received. This confirms the new session is valid and functional. The conversation has no memory of the previous messages (fresh session).
**Screenshot**: Capture the new conversation exchange after the reset.

### Step 5: Verify user ID persists after page reload
**Do**: Note the `genai_user_id` value from localStorage. Reload the page completely (Ctrl+R / Cmd+R). After the page reloads, check localStorage again for `genai_user_id`.
**Expect**: The `genai_user_id` value is identical to the one noted before the reload. The user ID is preserved across page reloads because it is stored in localStorage and retrieved on load.
**Screenshot**: Capture localStorage after reload showing the same `genai_user_id` value.

### Step 6: Verify messages are cleared after reload
**Do**: After the page reload, look at the message area.
**Expect**: The message area is empty. Messages are not persisted client-side between page loads (they are stored in React state only). A new session is created on reload.
**Screenshot**: Capture the empty page after reload.

## Pass Criteria
- [ ] Session is created automatically on page load (chat is functional)
- [ ] `genai_user_id` exists in localStorage
- [ ] Gear menu shows "Reset conversation" button when `key` parameter is provided
- [ ] Clicking "Reset conversation" clears all messages
- [ ] Chat works after reset (new session is active)
- [ ] User ID in localStorage persists across page reloads
- [ ] Messages are cleared on page reload (state not persisted client-side)
