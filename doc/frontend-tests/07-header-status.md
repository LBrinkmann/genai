# Test: Header Status Indicator and Controls

## What
Verify the header status indicator reflects backend health, the gear icon opens a settings menu, and the reset option visibility is controlled by the access key URL parameter.

## Prerequisites
- Backend is running and healthy
- Two test URLs needed:
  - With key: `http://localhost:3000/?config=default&key=test-key`
  - Without key: `http://localhost:3000/?config=default`

## Steps

### Step 1: Verify status indicator when backend is healthy
**Do**: Navigate to `http://localhost:3000/?config=default`. Wait for the page to fully load.
**Expect**: Next to the "GenAI Chat" title, a small circular dot (10x10px) is visible. The dot should be green (#4caf50) indicating the backend health check succeeded. The dot has a `title` attribute of "Status: online" (visible on hover) and a `data-testid` of "status-indicator".
**Screenshot**: Capture the header area focusing on the green status dot next to the title.

### Step 2: Verify gear menu without access key
**Do**: Click the gear/settings icon button on the right side of the header.
**Expect**: A dropdown menu opens. Since no `key` parameter was provided in the URL, the menu shows a disabled item with the text "No admin controls". There is no "Reset conversation" button.
**Screenshot**: Capture the open dropdown menu showing the "No admin controls" disabled text.

### Step 3: Close the menu
**Do**: Click anywhere outside the dropdown menu.
**Expect**: The menu closes.

### Step 4: Navigate with access key
**Do**: Navigate to `http://localhost:3000/?config=default&key=test-key`. Wait for the page to load.
**Expect**: The page loads normally. The header looks the same with "GenAI Chat" title and status dot.

### Step 5: Verify gear menu with access key
**Do**: Click the gear/settings icon button.
**Expect**: A dropdown menu opens containing a "Reset conversation" button. The button is styled as a small, outlined button with error/red color. The disabled "No admin controls" text is not shown.
**Screenshot**: Capture the open dropdown menu showing the "Reset conversation" button.

### Step 6: Verify status indicator reflects backend state
**Do**: If possible, stop the backend temporarily and reload the page. Alternatively, observe the status dot during initial load.
**Expect**: When the backend is unreachable, the status dot should be red (#f44336) indicating an error. During the initial health check, it briefly shows orange (#ff9800) for the loading state before settling on green or red.
**Screenshot**: If backend was stopped, capture the red status dot. Otherwise, note that this step may require manual timing to catch the loading state.

## Pass Criteria
- [ ] Status dot is visible next to the "GenAI Chat" title
- [ ] Dot is green when backend is healthy
- [ ] Dot has `data-testid="status-indicator"` attribute
- [ ] Gear icon is always visible in the header
- [ ] Without `key` parameter: menu shows "No admin controls" (disabled)
- [ ] With `key` parameter: menu shows "Reset conversation" button
- [ ] "Reset conversation" button is styled as outlined/error (red)
- [ ] Status dot turns red when backend is unreachable
