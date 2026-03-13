# Test: Error States

## What
Verify that the application handles error conditions gracefully, displaying meaningful error messages without crashing. The primary error case is loading with an invalid or nonexistent configuration name.

## Prerequisites
- Backend is running (so the error comes from config not found, not network failure)
- Navigate to: `http://localhost:3000/?config=nonexistent`

## Steps

### Step 1: Load with invalid config
**Do**: Navigate to `http://localhost:3000/?config=nonexistent`.
**Expect**: A brief loading spinner (CircularProgress) may appear centered on the page while the config fetch is attempted. After the fetch fails, the spinner disappears and an error alert is shown.
**Screenshot**: Capture the page during loading if the spinner is visible.

### Step 2: Verify error alert content
**Do**: Once loading completes, examine the error display.
**Expect**: A centered MUI Alert component with `severity="error"` (red color scheme) is displayed. Inside the alert:
  - A subtitle line reading "Configuration Error" in subtitle2 typography
  - A description line showing the error detail from the backend (e.g., the 404 detail message or "Failed to load configuration" fallback)
  The alert is contained within a max-width of 480px and centered both horizontally and vertically on the page.
**Screenshot**: Capture the full page showing the centered error alert with its title and message.

### Step 3: Verify no chat UI is rendered
**Do**: Check whether any chat components (header, message area, input field) are visible.
**Expect**: None of the chat UI components are rendered. No header bar, no message list, no input field. Only the error alert is displayed on the page. The error state in `ChatPage` returns early before rendering the chat layout.
**Screenshot**: Capture the full page confirming only the error alert is present.

### Step 4: Load with missing config parameter
**Do**: Navigate to `http://localhost:3000/` (no `config` parameter at all).
**Expect**: The app defaults to `config=default` (the `useConfig` hook uses `searchParams.get('config') || 'default'`). If a `default` config exists on the backend, the app loads normally. If no `default` config exists, the error alert appears as in steps 1-3.
**Screenshot**: Capture the page result -- either a working chat (if default config exists) or an error alert.

### Step 5: Verify app recovers after navigation to valid config
**Do**: Change the URL to `http://localhost:3000/?config=default` (or another valid config name).
**Expect**: The app loads successfully with the chat interface. The error state clears and the normal UI (header, message area, input) renders correctly. This confirms the app can recover from an error state by navigating to a valid config.
**Screenshot**: Capture the recovered working state of the app.

## Pass Criteria
- [ ] Invalid config name shows a centered error Alert (red)
- [ ] Error alert displays "Configuration Error" heading
- [ ] Error alert shows a meaningful error message (backend detail or fallback)
- [ ] No chat UI components render during error state
- [ ] App does not crash (no white screen or unhandled exception)
- [ ] App defaults to `config=default` when no config parameter is provided
- [ ] App recovers when navigating from invalid to valid config
