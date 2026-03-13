# Test: Initial Page Load

## What
Verify that the application loads correctly when navigating to the chat page with a valid config parameter. The header, status indicator, and input field should all render without errors.

## Prerequisites
- Backend is running and healthy at `http://localhost:8000`
- A valid config named `default` exists on the backend (single bot)
- Navigate to: `http://localhost:3000/?config=default`

## Steps

### Step 1: Navigate to the app
**Do**: Open `http://localhost:3000/?config=default` in the browser.
**Expect**: The page loads without showing a loading spinner for more than a few seconds. No error alert is displayed.
**Screenshot**: Capture the full page once loaded. Verify: no `CircularProgress` spinner visible, no red `Alert` box.

### Step 2: Verify the header
**Do**: Look at the top of the page.
**Expect**: An AppBar is visible containing the text "GenAI Chat" on the left side. A small colored dot (status indicator) is visible next to the title. A gear/settings icon button is visible on the right side of the header.
**Screenshot**: Capture the header area. Verify: "GenAI Chat" text present, colored dot visible (green if backend is healthy), gear icon present.

### Step 3: Verify the status indicator
**Do**: Observe the small dot next to "GenAI Chat".
**Expect**: The dot should be green (#4caf50) if the backend `/api/health` endpoint is reachable. It has a `title` attribute reading "Status: online". If the backend is slow, the dot may briefly be orange before turning green.
**Screenshot**: Capture a close-up of the header showing the dot color.

### Step 4: Verify the input area
**Do**: Look at the bottom of the page.
**Expect**: A text input field with placeholder text "Type a message..." is visible. A send button (blue circle with arrow icon) is present to the right of the input field. The send button should appear disabled (grayed out) since no text has been typed.
**Screenshot**: Capture the input area at the bottom. Verify: text field present with placeholder, send button visible.

### Step 5: Verify the message area is empty
**Do**: Look at the main content area between header and input.
**Expect**: The area is empty with no messages displayed. No error messages, no placeholder content -- just blank space with a light background.
**Screenshot**: Capture the full page showing header, empty message area, and input field.

## Pass Criteria
- [ ] Page loads without errors (no red Alert component visible)
- [ ] Header displays "GenAI Chat" title
- [ ] Status indicator dot is visible and turns green when backend is healthy
- [ ] Gear/settings icon is present in the header
- [ ] Input field is rendered with "Type a message..." placeholder
- [ ] Send button is visible (disabled state since no text entered)
- [ ] Message area is empty
- [ ] No console errors related to config loading (check browser console)
